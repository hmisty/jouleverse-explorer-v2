// 链上红包数据层：读（红包快照 / 领取历史 / WJ 授权 / JTI 余额）+ 写（授权 / 创建 / 抢 / 取回）
//
// 设计要点：
// 1. **读失败与「红包不存在」必须分开**。合约 `redpackets(id)` 对未创建的 id 返回
//    全零结构，不 revert；而 RPC 挂了也是异常。v1 把两者都当成「页面空白」，
//    用户没法区分是自己链接错了还是网络断了。
// 2. **openers 是 private 无 getter**，所以「我是否已领过」只能遍历 opened[]。
//    先读 final_n 再决定扫多少条，不做无界扫描（合约上限 500）。
// 3. 写操作前显式 switchChain，并把 `account` 传进 writeContract —— 不传会取
//    wagmi state 里的账户，与界面上显示的可能分叉（2026-11-27 签到 4100 的同类问题）。

import { ref } from 'vue'
import { writeContract, switchChain, waitForTransactionReceipt } from 'wagmi/actions'
import { publicClient } from '../config/client'
import { jouleverseChain } from '../config/chain'
import { config as wagmiConfig } from '../stores/wallet'
import { WJ_ADDRESS, wjABI } from '../contracts/wj'
import { JTI_ADDRESS, jtiABI } from '../contracts/jnsvote'
import { REDPACKET_ADDRESS, redPacketABI } from '../contracts/redpacket'
import {
  assembleHistory,
  canOpen,
  canWithdraw,
  packetStatus,
  sortHistoryDesc,
  type OpenedEntry,
  type PacketStatus,
  type RedPacketSnapshot,
} from '../utils/redpacket'
import { safeErrorMessage } from '../utils/error'

/** 合约 require 的 revert 文案 → 中文可操作提示 */
export function mapRedPacketError(error: unknown): string {
  const raw = String(
    (error as { shortMessage?: string } | null)?.shortMessage ??
      (error as { message?: string } | null)?.message ??
      '',
  )
  if (/user rejected|denied|rejected the request|4001/i.test(raw)) return '已取消签名'
  if (/redpacket already created/i.test(raw)) return '该红包编号已存在，请换一个编号（或刷新页面重新生成）'
  if (/too many red packets/i.test(raw)) return '红包个数超过上限（最多 500 个）'
  if (/too much Joule/i.test(raw)) return '红包总额超过上限（最多 2000 WJ）'
  if (/too few Joule/i.test(raw)) return '红包总额太小：至少要保证每个红包有 1 wei'
  if (/failed to transfer enough tokens/i.test(raw)) return 'WJ 余额或授权不足，请先授权足够的 WJ'
  if (/identity not authenticated/i.test(raw)) return '该地址未通过 JTI 认证，无法抢红包'
  if (/cannot open twice/i.test(raw)) return '这个红包你已经领过了，每个地址每个红包限一次'
  if (/nothing left/i.test(raw)) return '红包已抢完'
  if (/expired/i.test(raw)) return '红包已过期（合约限制 24 小时）'
  if (/only creator can withdraw/i.test(raw)) return '只有红包发起人可以取回剩余金额'
  if (/not yet expired/i.test(raw)) return '红包尚未过期，暂时不能取回'
  return safeErrorMessage(error)
}

export interface RedPacketState {
  snapshot: RedPacketSnapshot
  status: PacketStatus
  /** 已领取的条数（= finalN，与 history.length 可能不同：历史是抽样/截断后的） */
  openedCount: number
}

/** 把合约返回的 10 元组映射成结构化快照 */
export function toSnapshot(raw: readonly [
  boolean, string, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint,
]): RedPacketSnapshot {
  return {
    created: raw[0],
    creator: raw[1],
    expiry: raw[2],
    totalE: raw[3],
    totalN: raw[4],
    leftE: raw[5],
    leftN: raw[6],
    finalE: raw[7],
    finalN: raw[8],
  }
}

export function useRedPacket() {
  const isLoading = ref(false)
  const loadError = ref<string | null>(null)
  const snapshot = ref<RedPacketSnapshot | null>(null)
  const currentBlock = ref(0n)
  const history = ref<OpenedEntry[]>([])

  /** 读红包主体 + 当前块高。返回 null 表示读失败（错误写在 loadError）。 */
  const load = async (id: bigint): Promise<RedPacketState | null> => {
    isLoading.value = true
    loadError.value = null
    try {
      const [raw, blockNumber] = await Promise.all([
        publicClient.readContract({
          address: REDPACKET_ADDRESS,
          abi: redPacketABI,
          functionName: 'redpackets',
          args: [id],
        }),
        publicClient.getBlockNumber(),
      ])
      const snap = toSnapshot(raw as never)
      snapshot.value = snap
      currentBlock.value = blockNumber
      return {
        snapshot: snap,
        status: packetStatus(snap, blockNumber),
        openedCount: Number(snap.finalN),
      }
    } catch (error) {
      loadError.value = safeErrorMessage(error)
      snapshot.value = null
      return null
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 读领取历史。
   * n 从 0 到 finalN-1 逐条 inspect —— 合约没有批量 getter，只能一条一条读。
   * 用 Promise.all 并行（最多 500 条，但正常红包远少于此）。
   */
  const loadHistory = async (id: bigint, count: number): Promise<OpenedEntry[]> => {
    if (count <= 0) {
      history.value = []
      return []
    }
    try {
      const results = await Promise.all(
        Array.from({ length: count }, (_, n) =>
          publicClient.readContract({
            address: REDPACKET_ADDRESS,
            abi: redPacketABI,
            functionName: 'inspect',
            args: [id, BigInt(n)],
          }),
        ),
      )
      const entries = assembleHistory(
        (results as readonly { e: bigint; opener: string; block_height: bigint }[]).map(r => ({
          e: r.e,
          opener: r.opener,
          blockHeight: r.block_height,
        })),
      )
      history.value = sortHistoryDesc(entries)
      return history.value
    } catch {
      // 历史读失败不应让整页崩：主体信息已经拿到了，历史只是补充
      history.value = []
      return []
    }
  }

  /** 当前账户对红包合约的 WJ 授权额度 */
  const loadAllowance = async (account: string | null): Promise<bigint | null> => {
    if (!account) return null
    try {
      return await publicClient.readContract({
        address: WJ_ADDRESS,
        abi: wjABI,
        functionName: 'allowance',
        args: [account as `0x${string}`, REDPACKET_ADDRESS],
      })
    } catch {
      return null
    }
  }

  /** JTI 余额（>0 才有抢红包资格） */
  const loadJtiBalance = async (account: string | null): Promise<bigint | null> => {
    if (!account) return null
    try {
      return await publicClient.readContract({
        address: JTI_ADDRESS,
        abi: jtiABI,
        functionName: 'balanceOf',
        args: [account as `0x${string}`],
      })
    } catch {
      return null
    }
  }

  const ensureChain = async (): Promise<boolean> => {
    try {
      await switchChain(wagmiConfig, { chainId: jouleverseChain.id })
      return true
    } catch {
      return false
    }
  }

  /** WJ 授权给红包合约 */
  const approve = async (account: string, amountWei: bigint): Promise<`0x${string}`> => {
    if (!(await ensureChain())) throw new Error('请先在钱包中切换到 Jouleverse 网络（Chain ID: 3666）')
    const hash = await writeContract(wagmiConfig, {
      address: WJ_ADDRESS,
      abi: wjABI,
      functionName: 'approve',
      args: [REDPACKET_ADDRESS, amountWei],
      account: account as `0x${string}`,
    })
    await waitForTransactionReceipt(wagmiConfig, { hash })
    return hash
  }

  /** 创建红包：合约 create(id, quantity, amount) */
  const createPacket = async (
    account: string,
    id: bigint,
    quantity: bigint,
    amountWei: bigint,
  ): Promise<`0x${string}`> => {
    if (!(await ensureChain())) throw new Error('请先在钱包中切换到 Jouleverse 网络（Chain ID: 3666）')
    const hash = await writeContract(wagmiConfig, {
      address: REDPACKET_ADDRESS,
      abi: redPacketABI,
      functionName: 'create',
      args: [id, quantity, amountWei],
      account: account as `0x${string}`,
    })
    await waitForTransactionReceipt(wagmiConfig, { hash })
    return hash
  }

  /** 抢红包：合约 open(id, lucky_n) */
  const openPacket = async (
    account: string,
    id: bigint,
    luckyNumber: bigint,
  ): Promise<`0x${string}`> => {
    if (!(await ensureChain())) throw new Error('请先在钱包中切换到 Jouleverse 网络（Chain ID: 3666）')
    const hash = await writeContract(wagmiConfig, {
      address: REDPACKET_ADDRESS,
      abi: redPacketABI,
      functionName: 'open',
      args: [id, luckyNumber],
      account: account as `0x${string}`,
    })
    await waitForTransactionReceipt(wagmiConfig, { hash })
    return hash
  }

  /** 发起人取回过期红包剩余 */
  const withdrawPacket = async (account: string, id: bigint): Promise<`0x${string}`> => {
    if (!(await ensureChain())) throw new Error('请先在钱包中切换到 Jouleverse 网络（Chain ID: 3666）')
    const hash = await writeContract(wagmiConfig, {
      address: REDPACKET_ADDRESS,
      abi: redPacketABI,
      functionName: 'withdraw',
      args: [id],
      account: account as `0x${string}`,
    })
    await waitForTransactionReceipt(wagmiConfig, { hash })
    return hash
  }

  return {
    isLoading,
    loadError,
    snapshot,
    currentBlock,
    history,
    load,
    loadHistory,
    loadAllowance,
    loadJtiBalance,
    approve,
    createPacket,
    openPacket,
    withdrawPacket,
    canOpenNow: () => (snapshot.value ? canOpen(snapshot.value, currentBlock.value) : false),
    canWithdrawNow: (account: string | null) =>
      snapshot.value ? canWithdraw(snapshot.value, currentBlock.value, account) : false,
  }
}
