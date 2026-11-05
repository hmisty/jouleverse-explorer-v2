// JNSVote 治理端：四类治理操作共用多签流程与发送前复核
// 权限模型：createProposal 是 onlyOwner，owner = 2/3 多签。
//   前端仅对「签名人」展示治理入口；创建提案 = submitTransaction（提交者自动成为首确认人），
//   其余签名人 confirm，确认数达标后任一签名人 execute。
// 依赖：wagmi writeContract（签名）/ publicClient readContract（只读）。

import { ref } from 'vue'
import { writeContract, waitForTransactionReceipt, switchChain } from 'wagmi/actions'
import { toEventSelector, type Hex } from 'viem'
import { publicClient } from '../config/client'
import { jouleverseChain } from '../config/chain'
import { config as wagmiConfig } from '../stores/wallet'
import { JNSVOTE_ADDRESS, jnsVoteABI } from '../contracts/jnsvote'
import {
  JNSVOTE_MULTISIG_ADDRESS,
  multisigABI,
} from '../contracts/jnsvoteGovernance'
import { safeErrorMessage } from '../utils/error'
import { assertManagedOperation, assertProposalInput, decodeGovernanceCall, encodeGovernanceCall, type GovernanceCall, type ManagedProposal, type ProposalInput } from '../utils/jnsvote-governance'

export interface PendingProposalTx extends GovernanceCall {
  data: Hex
  proposal?: ManagedProposal
  validationError?: string
  txId: number
  destination: string
  executed: boolean
  confirmed: boolean // isConfirmed = 确认数 >= required
  confirmationUnknown: boolean // isConfirmed / getConfirmations 读取失败时无法确定确认状态（避免误显示「确认」按钮）
  confirmationCount: number
  required: number
  confirmations: string[] // 已确认的签名人地址（小写）
  // 解码后的治理参数；已有提案另附最新链上状态
  title: string
  link: string
  timeBegin: bigint
  timeEnd: bigint
}

export function useJNSVoteGovernance() {
  const isSigner = ref(false)
  const signers = ref<string[]>([])
  const required = ref(0n)
  const pendingTxs = ref<PendingProposalTx[]>([])
  const isLoading = ref(false)
  const loadError = ref<string | null>(null)
  const isWriting = ref(false)
  const pendingHash = ref<Hex | null>(null)

  // 并发守卫序号：过期请求完成后丢弃写入，避免账户切换/断连时旧数据覆盖新状态
  let govSeq = 0

  // 读取治理状态：当前地址是否签名人 + 待确认的四类治理交易列表
  // 安全边界（审计 2026-11-02 三项阻塞）：
  //   1. isOwner 前置短路——非签名人仅 1 次轻量 isOwner 调用即返回，不触发后续多签扫描（原则二）
  //   2. 列表只保留 destination === JNSVote 且 selector 属于四类治理方法 的交易，
  //      避免把多签里积压的其它交易（WJ 提现 / ERC-20 划转 / addOwner 等）误展示成「创建提案」并误执行
  async function loadGovernance(address: string) {
    const seq = ++govSeq
    isLoading.value = true
    loadError.value = null
    try {
      // 第一步（也是非签名人唯一付出的一步）：isOwner 检查，非签名人立即返回
      const owner = await publicClient.readContract({
        address: JNSVOTE_MULTISIG_ADDRESS,
        abi: multisigABI,
        functionName: 'isOwner',
        args: [address as `0x${string}`],
      })
      if (!owner) {
        if (seq === govSeq) {
          isSigner.value = false
          signers.value = []
          pendingTxs.value = []
        }
        return
      }
      if (seq === govSeq) isSigner.value = true

      // 同一区块读取数量、编号与多签详情，避免分步查询期间状态变化导致补零。
      const snapshotBlock = await publicClient.getBlockNumber({ cacheTime: 0 })
      // 签名人：读签名人列表 + 确认门槛
      const [ownersRaw, requiredRaw] = await publicClient.multicall({
        contracts: [
          { address: JNSVOTE_MULTISIG_ADDRESS, abi: multisigABI, functionName: 'getOwners' },
          { address: JNSVOTE_MULTISIG_ADDRESS, abi: multisigABI, functionName: 'required' },
        ],
        blockNumber: snapshotBlock,
        allowFailure: false,
      })
      const owners = (ownersRaw as readonly string[]).map((a) => a.toLowerCase())
      if (seq !== govSeq) return
      signers.value = [...owners]
      required.value = BigInt(requiredRaw as bigint)
      const requiredNum = Number(requiredRaw as bigint) // 提到循环外（建议 4）

      // 待执行交易 id 列表（pending=true, executed=false）
      // getTransactionIds(from,to,...) 的 from/to 是「过滤后列表下标」；to 超过过滤后长度时
      // 合约会在末尾用 0 补齐（id=0 本身是合法的第一笔交易，不能按值过滤）。
      // 因此用 pending 数作 to，并只按请求的数量截断返回数组，避免把补齐位当作交易读取。
      const countRaw = await publicClient.readContract({
        address: JNSVOTE_MULTISIG_ADDRESS,
        abi: multisigABI,
        functionName: 'getTransactionCount',
        args: [true, false],
        blockNumber: snapshotBlock,
      })
      const count = Number(countRaw)
      if (!Number.isSafeInteger(count) || count < 0) throw new Error('待执行交易数量超出安全范围')
      if (count === 0) {
        if (seq === govSeq) pendingTxs.value = []
        return
      }
      const idsRaw = await publicClient.readContract({
        address: JNSVOTE_MULTISIG_ADDRESS,
        abi: multisigABI,
        functionName: 'getTransactionIds',
        args: [0n, BigInt(count), true, false],
        blockNumber: snapshotBlock,
      })
      const ids = (idsRaw as readonly bigint[]).slice(0, count).map((n) => Number(n))
      if (ids.length !== count || new Set(ids).size !== ids.length || ids.some((id) => !Number.isSafeInteger(id) || id < 0)) {
        throw new Error('多签交易编号不完整或超出安全范围，请刷新')
      }

      // 先只读 transactions（destination/value/data/executed）做过滤，
      // 避免对无关交易额外读 isConfirmed/getConfirmations
      const txCalls = ids.map((id) => ({
        address: JNSVOTE_MULTISIG_ADDRESS,
        abi: multisigABI,
        functionName: 'transactions' as const,
        args: [BigInt(id)] as const,
      }))
      const txResults = await publicClient.multicall({ contracts: txCalls, blockNumber: snapshotBlock, allowFailure: true })

      // 过滤 + 解码：只保留四类零金额治理调用，未知或畸形数据不展示操作按钮
      const matched: (GovernanceCall & { id: number; destination: string; executed: boolean; data: Hex })[] = []
      ids.forEach((id, i) => {
        const r = txResults[i]
        if (!r.result) return
        const [destination, value, data, executed] = r.result as readonly [string, bigint, string, boolean]
        if (destination.toLowerCase() !== JNSVOTE_ADDRESS.toLowerCase()) return
        // 四类治理方法均为 nonpayable；携带非零原生金额的交易不入列表
        if (value !== 0n || executed) return
        // selector 已匹配，但参数可能畸形；解码失败则不入列表（无法确认是受支持的治理调用）
        try {
          const decoded = decodeGovernanceCall(data as Hex)
          matched.push({ id, destination, executed: Boolean(executed), data: data as Hex, ...decoded })
        } catch {
          // 跳过无法解码的交易
        }
      })

      // 对过滤后的少数交易读确认状态 + 确认人名单
      const confCalls = matched.flatMap((m) => [
        { address: JNSVOTE_MULTISIG_ADDRESS, abi: multisigABI, functionName: 'isConfirmed' as const, args: [BigInt(m.id)] as const },
        { address: JNSVOTE_MULTISIG_ADDRESS, abi: multisigABI, functionName: 'getConfirmations' as const, args: [BigInt(m.id)] as const },
      ])
      const confResults = confCalls.length ? await publicClient.multicall({ contracts: confCalls, blockNumber: snapshotBlock, allowFailure: true }) : []

      const list: PendingProposalTx[] = matched.map((m, i) => {
        const confRes = confResults[i * 2]
        const confsRes = confResults[i * 2 + 1]
        // 确认状态未知：isConfirmed 或 getConfirmations 任一读取失败，都无法判断签名人是否已确认
        // （否则静默降级为空数组会让已确认过的签名人仍看到「确认」按钮，点了合约 revert already confirmed）
        const confirmationUnknown = confRes.result == null || confsRes.result == null
        const confirmed = confirmationUnknown ? false : Boolean(confRes.result as boolean)
        const confirmations = confirmationUnknown
          ? []
          : (confsRes.result as readonly string[]).map((a) => a.toLowerCase())
        return {
          ...m,
          txId: m.id,
          destination: m.destination,
          executed: m.executed,
          confirmed,
          confirmationUnknown,
          confirmationCount: confirmations.length,
          required: requiredNum,
          confirmations,
          title: m.title,
          link: m.link,
          timeBegin: m.timeBegin,
          timeEnd: m.timeEnd,
        }
      })

      // 仅对已有提案治理交易读取状态，同一提案去重，失败时保持可见但阻断操作。
      const proposalStates = new Map<bigint, ManagedProposal | string>()
      for (const item of list) {
        if (item.proposalId === null) continue
        let state = proposalStates.get(item.proposalId)
        if (state === undefined) {
          try { state = await readManagedProposal(item.proposalId) }
          catch (e) { state = safeErrorMessage(e) }
          proposalStates.set(item.proposalId, state)
        }
        if (typeof state === 'string') item.validationError = state
        else {
          item.proposal = state
          if (item.operation === 'disable' || item.operation === 'reenable') {
            item.title = state.title; item.link = state.link
            item.timeBegin = state.timeBegin; item.timeEnd = state.timeEnd
          }
          try { assertManagedOperation(item.operation as 'modify' | 'disable' | 'reenable', state) }
          catch (e) { item.validationError = safeErrorMessage(e) }
        }
      }
      if (seq === govSeq) pendingTxs.value = list
    } catch (e) {
      if (seq === govSeq) loadError.value = safeErrorMessage(e)
    } finally {
      if (seq === govSeq) isLoading.value = false
    }
  }

  async function readManagedProposal(id: bigint): Promise<ManagedProposal> {
    if (id < 1n || id >= 2n ** 256n) throw new Error('提案编号无效，编号从1开始')
    const currentBlock = await publicClient.getBlockNumber({ cacheTime: 0 })
    const [total, raw] = await publicClient.multicall({ contracts: [
      { address: JNSVOTE_ADDRESS, abi: jnsVoteABI, functionName: '_totalProposals' },
      { address: JNSVOTE_ADDRESS, abi: jnsVoteABI, functionName: '_proposals', args: [id] },
    ], blockNumber: currentBlock, allowFailure: false })
    if (id > total) throw new Error('提案不存在')
    const [title, link, timeBegin, timeEnd, , , , , , disabled] = raw
    return { id, title, link, timeBegin, timeEnd, disabled, currentBlock }
  }

  async function validateCall(call: GovernanceCall) {
    if (call.operation === 'create') {
      assertProposalInput(call, await publicClient.getBlockNumber({ cacheTime: 0 }))
    } else {
      const proposal = await readManagedProposal(call.proposalId!)
      assertManagedOperation(call.operation, proposal)
      if (call.operation === 'modify') assertProposalInput(call, proposal.currentBlock)
    }
  }

  async function withWrite<T>(task: (seq: number) => Promise<T>): Promise<T> {
    if (isWriting.value || pendingHash.value) throw new Error('已有操作正在处理，请先查询已广播交易回执')
    isWriting.value = true
    try { return await task(govSeq) } finally { isWriting.value = false }
  }
  function assertCurrent(seq: number) {
    if (seq !== govSeq) throw new Error('账户或页面状态已变化，已取消发送，请重新核验')
  }
  async function finishReceipt(hash: Hex) {
    const receipt = await waitForTransactionReceipt(wagmiConfig, { hash, chainId: jouleverseChain.id })
    pendingHash.value = null
    if (receipt.status === 'reverted') throw new Error('多签交易已回滚')
    if (receipt.transactionHash && receipt.transactionHash.toLowerCase() !== hash.toLowerCase()) throw new Error('交易已被替换或取消，请核查回执')
    const failure = toEventSelector('ExecutionFailure(uint256)')
    if (receipt.logs?.some((log) => log.address.toLowerCase() === JNSVOTE_MULTISIG_ADDRESS.toLowerCase() && log.topics[0] === failure)) {
      throw new Error('多签已上链但内部治理调用失败，请核查提案状态，不能视为执行成功')
    }
    return receipt
  }
  async function checkPendingReceipt() {
    if (!pendingHash.value || isWriting.value) return
    isWriting.value = true
    try { await finishReceipt(pendingHash.value) } finally { isWriting.value = false }
  }
  async function submitCall(call: GovernanceCall): Promise<number> {
    return withWrite(async (seq) => {
      const data = encodeGovernanceCall(call)
      await ensureChain()
      await validateCall(call) // 在切链之后读取最新提案和区块，失败即停止。
      assertCurrent(seq)
      const hash = await writeContract(wagmiConfig, {
        address: JNSVOTE_MULTISIG_ADDRESS, abi: multisigABI, functionName: 'submitTransaction',
        args: [JNSVOTE_ADDRESS, 0n, data],
      })
      pendingHash.value = hash
      return parseSubmissionTxId(await finishReceipt(hash))
    })
  }
  function submitProposal(input: ProposalInput) {
    return submitCall({ operation: 'create', proposalId: null, ...input })
  }
  function submitModification(id: bigint, input: ProposalInput) {
    return submitCall({ operation: 'modify', proposalId: id, ...input })
  }
  function submitDisable(id: bigint) {
    return submitCall({ operation: 'disable', proposalId: id, title: '', link: '', timeBegin: 0n, timeEnd: 0n })
  }
  function submitReenable(id: bigint) {
    return submitCall({ operation: 'reenable', proposalId: id, title: '', link: '', timeBegin: 0n, timeEnd: 0n })
  }

  // 确保钱包在 Jouleverse 链上（与 useJNSVote.vote 一致；已在目标链时 switchChain 直接成功）
  async function ensureChain(): Promise<void> {
    await switchChain(wagmiConfig, { chainId: jouleverseChain.id })
  }

  // 从 receipt 解析 Submission 事件拿 transactionId
  // Gnosis MultiSigWallet 事件：event Submission(uint indexed transactionId)
  // topic0 = keccak256('Submission(uint256)')，topic[1] = indexed transactionId
  function parseSubmissionTxId(receipt: { logs: readonly { address?: string; topics: readonly string[] }[] }): number {
    const SUBMISSION_TOPIC = toEventSelector('Submission(uint256)')
    for (const log of receipt.logs) {
      // 校验发出合约是多签地址，避免同交易内其它合约误发同名事件被错解析
      if (
        log.address?.toLowerCase() === JNSVOTE_MULTISIG_ADDRESS.toLowerCase() &&
        log.topics.length >= 2 &&
        log.topics[0].toLowerCase() === SUBMISSION_TOPIC
      ) {
        const id = BigInt(log.topics[1])
        return id <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(id) : -1
      }
    }
    // 兜底：无法解析时返回 -1（提交成功但 id 未知，界面提示刷新查看）
    return -1
  }

  async function preflightTx(txId: number, expectedData?: Hex) {
    if (!Number.isSafeInteger(txId) || txId < 0) throw new Error('多签交易编号无效')
    const raw = await publicClient.readContract({
      address: JNSVOTE_MULTISIG_ADDRESS, abi: multisigABI, functionName: 'transactions', args: [BigInt(txId)],
    })
    const [destination, value, data, executed] = raw as readonly [string, bigint, Hex, boolean]
    if (executed) throw new Error('该交易已被执行，请刷新列表')
    if (destination.toLowerCase() !== JNSVOTE_ADDRESS.toLowerCase() || value !== 0n) throw new Error('该交易不是支持的治理交易，已阻止执行')
    if (expectedData && expectedData.toLowerCase() !== data.toLowerCase()) throw new Error('治理调用与已审阅内容不一致，请刷新列表')
    let call: GovernanceCall
    try { call = decodeGovernanceCall(data) } catch { throw new Error('该交易不是支持的治理交易，已阻止执行') }
    await validateCall(call)
  }
  // 确认可能自动执行，因此确认与显式执行使用相同的链上复核。
  async function sendTxAction(functionName: 'confirmTransaction' | 'executeTransaction', txId: number, expectedData?: Hex) {
    await withWrite(async (seq) => {
      await ensureChain()
      await preflightTx(txId, expectedData)
      assertCurrent(seq)
      const hash = await writeContract(wagmiConfig, {
        address: JNSVOTE_MULTISIG_ADDRESS, abi: multisigABI, functionName, args: [BigInt(txId)],
      })
      pendingHash.value = hash
      await finishReceipt(hash)
    })
  }
  function confirmTx(txId: number, expectedData?: Hex) { return sendTxAction('confirmTransaction', txId, expectedData) }
  function executeTx(txId: number, expectedData?: Hex) { return sendTxAction('executeTransaction', txId, expectedData) }

  // 重置治理状态并作废在途请求（断连时调用，避免 in-flight 完成后回写旧账户数据）
  function reset(): void {
    govSeq++ // 使所有在途 loadGovernance 完成后因 seq 过期而丢弃写入
    isSigner.value = false
    signers.value = []
    pendingTxs.value = []
    loadError.value = null
    isLoading.value = false
  }

  return {
    isSigner,
    signers,
    required,
    pendingTxs,
    isLoading,
    loadError,
    loadGovernance,
    reset,
    submitProposal,
    readManagedProposal,
    submitModification,
    submitDisable,
    submitReenable,
    isWriting,
    pendingHash,
    checkPendingReceipt,
    confirmTx,
    executeTx,
  }
}
