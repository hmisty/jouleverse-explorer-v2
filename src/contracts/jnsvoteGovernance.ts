// JNSVote 治理端：创建、修改、禁用与重新启用均通过 Gnosis 多签流程
// 背景：JNSVote 合约的 createProposal 是 onlyOwner，而 owner 是 2/3 多签钱包
//   （0x4eF599…C1B3，签名人 = Koant J-0 / 剪云为裳 J-37 / 明海云 J-7）。
//   因此普通投票者无创建入口是符合设计的；创建提案须由任一签名人
//   submitTransaction → 至少 2 人 confirm → 任一签名人 execute。
// 本文件提供：多签地址 + Gnosis MultiSigWallet 最小 ABI + 四类治理编码 ABI。

export const JNSVOTE_MULTISIG_ADDRESS = '0x4eF599b6E39D950D6Ddbd830fF5f95e06770C1B3' as const

// Gnosis MultiSigWallet 最小 ABI（仅治理端所需函数）
// 语义：submitTransaction 内部会自动 confirmTransaction，故提交者即为首个确认人
export const multisigABI = [
  // 提交交易（创建一笔待确认的多签交易），返回 transactionId
  {
    inputs: [
      { name: 'destination', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
    ],
    name: 'submitTransaction',
    outputs: [{ name: 'transactionId', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // 确认交易（仅 owner）
  {
    inputs: [{ name: 'transactionId', type: 'uint256' }],
    name: 'confirmTransaction',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // 执行交易（仅 owner，且确认数 >= required）
  {
    inputs: [{ name: 'transactionId', type: 'uint256' }],
    name: 'executeTransaction',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // 某地址是否签名人
  {
    inputs: [{ name: '', type: 'address' }],
    name: 'isOwner',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  // 全部签名人
  {
    inputs: [],
    name: 'getOwners',
    outputs: [{ name: '', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  // 确认门槛（2/3 多签为 2）
  {
    inputs: [],
    name: 'required',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  // 待执行交易数量（pending=true, executed=false）
  {
    inputs: [
      { name: 'pending', type: 'bool' },
      { name: 'executed', type: 'bool' },
    ],
    name: 'getTransactionCount',
    outputs: [{ name: 'count', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  // 交易 id 列表
  {
    inputs: [
      { name: 'from', type: 'uint256' },
      { name: 'to', type: 'uint256' },
      { name: 'pending', type: 'bool' },
      { name: 'executed', type: 'bool' },
    ],
    name: 'getTransactionIds',
    outputs: [{ name: '_transactionIds', type: 'uint256[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  // 某交易的确认人列表
  {
    inputs: [{ name: 'transactionId', type: 'uint256' }],
    name: 'getConfirmations',
    outputs: [{ name: '_confirmations', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  // 某交易是否已满足门槛（isConfirmed = 确认数 >= required）
  {
    inputs: [{ name: 'transactionId', type: 'uint256' }],
    name: 'isConfirmed',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  // 某交易详情
  {
    inputs: [{ name: '', type: 'uint256' }],
    name: 'transactions',
    outputs: [
      { name: 'destination', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
      { name: 'executed', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const

// createProposal 编码 ABI（仅用于 encodeFunctionData / decodeFunctionData）
export const createProposalABI = [
  {
    inputs: [
      { name: 'title', type: 'string' },
      { name: 'link', type: 'string' },
      { name: 'timeBegin', type: 'uint256' },
      { name: 'timeEnd', type: 'uint256' },
    ],
    name: 'createProposal',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const

export const modifyProposalABI = [{
  inputs: [
    { name: 'id', type: 'uint256' },
    { name: 'title', type: 'string' }, { name: 'link', type: 'string' },
    { name: 'timeBegin', type: 'uint256' }, { name: 'timeEnd', type: 'uint256' },
  ],
  name: 'modifyProposal', outputs: [], stateMutability: 'nonpayable', type: 'function',
}] as const

export const disableProposalABI = [{
  inputs: [{ name: 'id', type: 'uint256' }],
  name: 'disableProposal', outputs: [], stateMutability: 'nonpayable', type: 'function',
}] as const

export const reenableProposalABI = [{
  inputs: [{ name: 'id', type: 'uint256' }],
  name: 'reenableProposal', outputs: [], stateMutability: 'nonpayable', type: 'function',
}] as const

export const governanceABI = [
  ...createProposalABI, ...modifyProposalABI, ...disableProposalABI, ...reenableProposalABI,
] as const
