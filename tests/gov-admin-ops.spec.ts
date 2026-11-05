import { beforeEach, describe, expect, it, vi } from 'vitest'
import { decodeFunctionData, toEventSelector, toFunctionSelector, type Hex } from 'viem'
import { governanceABI, JNSVOTE_MULTISIG_ADDRESS } from '../src/contracts/jnsvoteGovernance'
import { JNSVOTE_ADDRESS } from '../src/contracts/jnsvote'
import { assertManagedOperation, decodeGovernanceCall, encodeGovernanceCall, GOVERNANCE_LABELS,
  type GovernanceCall, type ManagedProposal } from '../src/utils/jnsvote-governance'

const mocks = vi.hoisted(() => ({
  getBlockNumber: vi.fn(), readContract: vi.fn(), multicall: vi.fn(),
  switchChain: vi.fn(), writeContract: vi.fn(), waitForTransactionReceipt: vi.fn(),
}))
vi.mock('../src/config/client', () => ({ publicClient: mocks }))
vi.mock('../src/stores/wallet', () => ({ config: {} }))
vi.mock('wagmi/actions', () => mocks)
import { useJNSVoteGovernance } from '../src/composables/useJNSVoteGovernance'

const ACTOR = '0x1111111111111111111111111111111111111111'
const OTHER = '0x2222222222222222222222222222222222222222'
const HASH = `0x${'ab'.repeat(32)}` as Hex
let block: bigint
let state: ManagedProposal
let rawTx: readonly [string, bigint, Hex, boolean]
let txs: Map<bigint, typeof rawTx>
const input = { title: '修改标题', link: 'https://example.com/new', timeBegin: 200n, timeEnd: 300n }
const call = (operation: GovernanceCall['operation']): GovernanceCall => ({ operation, proposalId: operation === 'create' ? null : 1n, ...input })

beforeEach(() => {
  vi.resetAllMocks()
  block = 10n
  state = { id: 1n, title: '当前标题', link: 'https://example.com/current', timeBegin: 100n, timeEnd: 150n, disabled: false, currentBlock: block }
  rawTx = [JNSVOTE_ADDRESS, 0n, encodeGovernanceCall(call('modify')), false]
  txs = new Map()
  mocks.getBlockNumber.mockImplementation(async () => block)
  mocks.readContract.mockImplementation(async ({ functionName, args }: { functionName: string; args?: readonly unknown[] }) => {
    if (functionName === 'isOwner') return true
    if (functionName === 'transactions') return txs.get(args?.[0] as bigint) ?? rawTx
    if (functionName === 'getTransactionCount') return BigInt(txs.size)
    if (functionName === 'getTransactionIds') return [...txs.keys()]
    throw new Error(functionName)
  })
  mocks.multicall.mockImplementation(async ({ contracts }: { contracts: { functionName: string; args?: readonly unknown[] }[] }) => {
    if (contracts[0]?.functionName === '_totalProposals') {
      return [5n, [state.title, state.link, state.timeBegin, state.timeEnd, 0n, 0n, 0n, 0n, 100n, state.disabled]]
    }
    if (contracts[0]?.functionName === 'getOwners') return [[ACTOR, OTHER], 2n]
    return contracts.map(({ functionName, args }) => {
      if (functionName === 'transactions') return { status: 'success', result: txs.get(args?.[0] as bigint) ?? rawTx }
      if (functionName === 'isConfirmed') return { status: 'success', result: true }
      if (functionName === 'getConfirmations') return { status: 'success', result: [ACTOR, OTHER] }
      throw new Error(functionName)
    })
  })
  mocks.switchChain.mockResolvedValue({ id: 3666 })
  mocks.writeContract.mockResolvedValue(HASH)
  mocks.waitForTransactionReceipt.mockResolvedValue({ status: 'success', transactionHash: HASH,
    logs: [{ address: JNSVOTE_MULTISIG_ADDRESS, topics: [toEventSelector('Submission(uint256)'), `0x${'0'.repeat(64)}`] }] })
})

describe('四类治理编码与列表', () => {
  it.each([
    ['create', 'createProposal(string,string,uint256,uint256)', '创建提案'],
    ['modify', 'modifyProposal(uint256,string,string,uint256,uint256)', '修改提案'],
    ['disable', 'disableProposal(uint256)', '禁用提案'],
    ['reenable', 'reenableProposal(uint256)', '重新启用提案'],
  ] as const)('%s的选择器、解码与标签一致', (operation, signature, label) => {
    const encoded = encodeGovernanceCall(call(operation))
    expect(encoded.slice(0, 10)).toBe(toFunctionSelector(signature))
    const decoded = decodeGovernanceCall(encoded)
    expect(decoded.operation).toBe(operation)
    expect(GOVERNANCE_LABELS[decoded.operation]).toBe(label)
    if (operation !== 'create') expect(decoded.proposalId).toBe(1n)
  })
  it('列表保留全部四种操作及编号0，未知调用和非零金额被过滤', async () => {
    for (const [i, op] of (['create', 'modify', 'disable', 'reenable'] as const).entries()) {
      txs.set(BigInt(i), [JNSVOTE_ADDRESS, 0n, encodeGovernanceCall(call(op)), false])
    }
    txs.set(4n, [JNSVOTE_ADDRESS, 0n, '0x12345678', false])
    txs.set(5n, [JNSVOTE_ADDRESS, 1n, encodeGovernanceCall(call('disable')), false])
    const gov = useJNSVoteGovernance(); await gov.loadGovernance(ACTOR)
    expect(gov.loadError.value).toBeNull()
    expect(gov.pendingTxs.value.map((tx) => tx.operation)).toEqual(['create', 'modify', 'disable', 'reenable'])
    expect(gov.pendingTxs.value[0].txId).toBe(0)
    expect(gov.pendingTxs.value[2].title).toBe('当前标题')
    expect(gov.pendingTxs.value[3].validationError).toContain('尚未禁用')
    expect(mocks.multicall.mock.calls.filter(([v]) => v.contracts[0]?.functionName === '_totalProposals')).toHaveLength(1)
  })
  it('提案不存在或状态读取失败时保留交易标签，但禁止后续确认执行', async () => {
    txs.set(0n, rawTx)
    mocks.multicall.mockImplementation(async ({ contracts }) => {
      if (contracts[0]?.functionName === '_totalProposals') throw new Error('状态读取失败')
      if (contracts[0]?.functionName === 'getOwners') return [[ACTOR, OTHER], 2n]
      return contracts.map(({ functionName }: { functionName: string }) => ({ status: 'success',
        result: functionName === 'transactions' ? rawTx : functionName === 'isConfirmed' ? true : [ACTOR, OTHER] }))
    })
    const gov = useJNSVoteGovernance(); await gov.loadGovernance(ACTOR)
    expect(gov.pendingTxs.value[0].operation).toBe('modify')
    expect(gov.pendingTxs.value[0].validationError).toContain('状态读取失败')
    await expect(gov.executeTx(0)).rejects.toThrow('状态读取失败')
    expect(mocks.writeContract).not.toHaveBeenCalled()
  })
  it('拒绝畸形编码、附加字节和未知选择器', () => {
    expect(() => decodeGovernanceCall('0x12345678')).toThrow()
    expect(() => decodeGovernanceCall(encodeGovernanceCall(call('modify')).slice(0, 18) as Hex)).toThrow()
    expect(() => decodeGovernanceCall(`${encodeGovernanceCall(call('disable'))}00`)).toThrow()
  })
})

describe('提交与执行双层时间边界', () => {
  it.each(['modify', 'disable', 'reenable'] as const)('%s对已经开始的提案不能提交', async (operation) => {
    state.disabled = operation === 'reenable'; block = state.timeBegin
    const gov = useJNSVoteGovernance()
    const submit = () => operation === 'modify' ? gov.submitModification(1n, input)
      : operation === 'disable' ? gov.submitDisable(1n) : gov.submitReenable(1n)
    await expect(submit()).rejects.toThrow('提案已经开始')
    expect(mocks.writeContract).not.toHaveBeenCalled()
  })
  it.each(['modify', 'disable', 'reenable'] as const)('%s对已经开始的提案不能执行，也不能通过确认绕过', async (operation) => {
    state.disabled = operation === 'reenable'; block = state.timeBegin
    rawTx = [JNSVOTE_ADDRESS, 0n, encodeGovernanceCall(call(operation)), false]
    const gov = useJNSVoteGovernance()
    await expect(gov.executeTx(0)).rejects.toThrow('提案已经开始')
    await expect(gov.confirmTx(0)).rejects.toThrow('提案已经开始')
    expect(mocks.writeContract).not.toHaveBeenCalled()
  })
  it('修改同时检查原开始时间和新开始时间，不能把已开始提案向后移动绕过产品规则', async () => {
    block = 100n
    await expect(useJNSVoteGovernance().submitModification(1n, { ...input, timeBegin: 1000n, timeEnd: 2000n })).rejects.toThrow('已经开始')
    block = 10n
    await expect(useJNSVoteGovernance().submitModification(1n, { ...input, timeBegin: 10n })).rejects.toThrow('新开始区块')
    expect(mocks.writeContract).not.toHaveBeenCalled()
  })
  it('在开始前一块允许提交；等于开始块时硬阻断', async () => {
    block = 99n
    await expect(useJNSVoteGovernance().submitDisable(1n)).resolves.toBe(0)
    block = 100n; mocks.writeContract.mockClear()
    await expect(useJNSVoteGovernance().submitDisable(1n)).rejects.toThrow('已经开始')
    expect(mocks.writeContract).not.toHaveBeenCalled()
  })
  it('读取区块失败必须停止，不把未知块高当0', async () => {
    mocks.getBlockNumber.mockRejectedValue(new Error('无法读取区块'))
    await expect(useJNSVoteGovernance().submitDisable(1n)).rejects.toThrow('无法读取区块')
    await expect(useJNSVoteGovernance().executeTx(0)).rejects.toThrow('无法读取区块')
    expect(mocks.writeContract).not.toHaveBeenCalled()
  })
  it('切链等待期间跨过开始区块，后续重新取区块并阻断', async () => {
    mocks.switchChain.mockImplementation(async () => { block = 100n })
    await expect(useJNSVoteGovernance().executeTx(0)).rejects.toThrow('已经开始')
    expect(mocks.getBlockNumber).toHaveBeenCalledWith({ cacheTime: 0 })
    expect(mocks.writeContract).not.toHaveBeenCalled()
  })
  it('操作状态和提案存在性必须正确', async () => {
    const gov = useJNSVoteGovernance()
    await expect(gov.submitReenable(1n)).rejects.toThrow('尚未禁用')
    state.disabled = true
    await expect(gov.submitDisable(1n)).rejects.toThrow('已经禁用')
    await expect(gov.submitDisable(6n)).rejects.toThrow('不存在')
    await expect(gov.submitDisable(0n)).rejects.toThrow('编号')
    expect(mocks.writeContract).not.toHaveBeenCalled()
  })
})

describe('多签流程与防御', () => {
  it.each(['modify', 'disable', 'reenable'] as const)('%s被正确封装为零金额多签提交，不直接调用onlyOwner方法', async (operation) => {
    state.disabled = operation === 'reenable'
    const gov = useJNSVoteGovernance()
    const result = operation === 'modify' ? await gov.submitModification(1n, input)
      : operation === 'disable' ? await gov.submitDisable(1n) : await gov.submitReenable(1n)
    expect(result).toBe(0)
    const [, request] = mocks.writeContract.mock.calls[0]
    expect(request.address).toBe(JNSVOTE_MULTISIG_ADDRESS)
    expect(request.functionName).toBe('submitTransaction')
    expect(request.args[0]).toBe(JNSVOTE_ADDRESS); expect(request.args[1]).toBe(0n)
    expect(decodeFunctionData({ abi: governanceABI, data: request.args[2] }).functionName).toBe(`${operation === 'modify' ? 'modify' : operation === 'disable' ? 'disable' : 'reenable'}Proposal`)
  })
  it('修改回显的字段来自链上，而非本地占位数据', async () => {
    expect(await useJNSVoteGovernance().readManagedProposal(1n)).toEqual(state)
  })
  it.each(['create', 'modify', 'disable', 'reenable'] as const)('%s可完成确认和显式执行前的核验', async (operation) => {
    state.disabled = operation === 'reenable'
    rawTx = [JNSVOTE_ADDRESS, 0n, encodeGovernanceCall(call(operation)), false]
    const gov = useJNSVoteGovernance()
    await expect(gov.confirmTx(0, rawTx[2])).resolves.toBeUndefined()
    await expect(gov.executeTx(0, rawTx[2])).resolves.toBeUndefined()
    expect(mocks.writeContract).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ functionName: 'executeTransaction', args: [0n] }))
  })
  it('阻断错误目标、非零金额、已执行交易和审阅后改变的完整数据', async () => {
    const gov = useJNSVoteGovernance(); const data = rawTx[2]
    for (const invalid of [[OTHER, 0n, data, false], [JNSVOTE_ADDRESS, 1n, data, false], [JNSVOTE_ADDRESS, 0n, data, true]] as const) {
      rawTx = invalid
      await expect(gov.executeTx(0)).rejects.toThrow()
    }
    rawTx = [JNSVOTE_ADDRESS, 0n, data, false]
    await expect(gov.executeTx(0, encodeGovernanceCall(call('disable')))).rejects.toThrow('不一致')
    expect(mocks.writeContract).not.toHaveBeenCalled()
  })
  it('内部执行失败不能报告成功', async () => {
    mocks.waitForTransactionReceipt.mockResolvedValue({ status: 'success', logs: [{ address: JNSVOTE_MULTISIG_ADDRESS, topics: [toEventSelector('ExecutionFailure(uint256)')] }] })
    await expect(useJNSVoteGovernance().executeTx(0)).rejects.toThrow('内部治理调用失败')
  })
  it('等待回执失败时保留哈希并阻止重复提交，查询确认后解锁', async () => {
    const gov = useJNSVoteGovernance()
    mocks.waitForTransactionReceipt.mockRejectedValue(new Error('超时'))
    await expect(gov.submitDisable(1n)).rejects.toThrow('超时')
    expect(gov.pendingHash.value).toBe(HASH)
    await expect(gov.submitDisable(1n)).rejects.toThrow('查询已广播')
    expect(mocks.writeContract).toHaveBeenCalledTimes(1)
    mocks.waitForTransactionReceipt.mockResolvedValue({ status: 'success', logs: [] })
    await gov.checkPendingReceipt(); expect(gov.pendingHash.value).toBeNull()
  })
  it('非签名人只读isOwner后返回，不扫描提案或多签列表', async () => {
    mocks.readContract.mockResolvedValue(false)
    const gov = useJNSVoteGovernance(); await gov.loadGovernance(ACTOR)
    expect(gov.isSigner.value).toBe(false); expect(mocks.readContract).toHaveBeenCalledTimes(1)
    expect(mocks.multicall).not.toHaveBeenCalled()
  })
  it('规则不误称为合约保证：产品校验明确阻断旧开始时间', () => {
    expect(() => assertManagedOperation('modify', { ...state, currentBlock: 100n })).toThrow('已经开始')
  })
})
