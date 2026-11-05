import { decodeFunctionData, encodeFunctionData, toFunctionSelector, type Hex } from 'viem'
import { governanceABI } from '../contracts/jnsvoteGovernance'

export type GovernanceOperation = 'create' | 'modify' | 'disable' | 'reenable'
export interface ProposalInput { title: string; link: string; timeBegin: bigint; timeEnd: bigint }
export interface GovernanceCall extends ProposalInput {
  operation: GovernanceOperation
  proposalId: bigint | null
}
export interface ManagedProposal extends ProposalInput { id: bigint; disabled: boolean; currentBlock: bigint }
export const GOVERNANCE_LABELS: Record<GovernanceOperation, string> = {
  create: '创建提案', modify: '修改提案', disable: '禁用提案', reenable: '重新启用提案',
}
const operationByName = {
  createProposal: 'create', modifyProposal: 'modify', disableProposal: 'disable', reenableProposal: 'reenable',
} as const
// 与实际编码接口同源派生，不维护手写的函数选择器。
const selectors = new Set(governanceABI.map((fn) => toFunctionSelector(fn)))

export function encodeGovernanceCall(call: GovernanceCall): Hex {
  if (call.operation === 'create') return encodeFunctionData({ abi: governanceABI, functionName: 'createProposal',
    args: [call.title, call.link, call.timeBegin, call.timeEnd] })
  if (call.proposalId === null || call.proposalId < 1n) throw new Error('提案编号必须从1开始')
  if (call.operation === 'modify') return encodeFunctionData({ abi: governanceABI, functionName: 'modifyProposal',
    args: [call.proposalId, call.title, call.link, call.timeBegin, call.timeEnd] })
  return encodeFunctionData({ abi: governanceABI,
    functionName: call.operation === 'disable' ? 'disableProposal' : 'reenableProposal', args: [call.proposalId] })
}
export function decodeGovernanceCall(data: Hex): GovernanceCall {
  if (!selectors.has(data.slice(0, 10).toLowerCase() as Hex)) throw new Error('不支持的治理函数选择器')
  const decoded = decodeFunctionData({ abi: governanceABI, data })
  const operation = operationByName[decoded.functionName]
  let call: GovernanceCall
  if (decoded.functionName === 'createProposal') {
    const [title, link, timeBegin, timeEnd] = decoded.args
    call = { operation, proposalId: null, title, link, timeBegin, timeEnd }
  } else if (decoded.functionName === 'modifyProposal') {
    const [proposalId, title, link, timeBegin, timeEnd] = decoded.args
    call = { operation, proposalId, title, link, timeBegin, timeEnd }
  } else {
    call = { operation, proposalId: decoded.args[0], title: '', link: '', timeBegin: 0n, timeEnd: 0n }
  }
  if (encodeGovernanceCall(call).toLowerCase() !== data.toLowerCase()) throw new Error('治理调用数据不是完整的规范编码')
  return call
}
export function parseProposalId(text: string): bigint | null {
  if (!/^[1-9]\d*$/.test(text.trim())) return null
  const id = BigInt(text.trim())
  return id < 2n ** 256n ? id : null
}
export function assertProposalInput(input: ProposalInput, currentBlock: bigint) {
  if (!input.title.trim()) throw new Error('提案标题不能为空')
  if (input.timeBegin <= currentBlock) throw new Error('新开始区块须晚于当前区块，已阻止提交或执行')
  if (input.timeEnd <= input.timeBegin) throw new Error('结束区块须晚于开始区块')
  if (input.timeEnd >= 2n ** 256n) throw new Error('区块高度超出合约整数范围')
}
export function assertManagedOperation(operation: Exclude<GovernanceOperation, 'create'>, proposal: ManagedProposal) {
  // 产品的保守规则：三项操作均禁止处理已开始提案。
  // 合约 modifyProposal 实际只检查传入的新 timeBegin，不能将此产品规则误称为合约保证。
  if (proposal.currentBlock >= proposal.timeBegin) throw new Error('提案已经开始，已阻止修改、禁用或重新启用')
  if (operation === 'disable' && proposal.disabled) throw new Error('提案已经禁用，请刷新状态')
  if (operation === 'reenable' && !proposal.disabled) throw new Error('提案尚未禁用，不能重新启用')
}
