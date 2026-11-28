// 链上红包（RedPacketJoule）合约配置
// 合约地址: 0x0dc46592ACf76e149B108BDe2E56D8429a2D6046
// 源码参照 v1: app/scripts/contracts/redpacket.sol（Owner-free，无事件，历史靠 inspect 逐条读）
//
// 与 WJ 的关系：create 时通过 WJ.transferFrom 收走发起人的 WJ；
// open 时把 WJ 从合约转给抢到的人。因此创建前必须先 approve。

export const REDPACKET_ADDRESS = '0x0dc46592ACf76e149B108BDe2E56D8429a2D6046' as const

/**
 * 合约硬编码上限（redpacket.sol）：
 *   require(quantity <= 500)
 *   require(amount <= 2000 * 10**18)
 *   require(amount >= quantity)
 *   expiry = block.number + (24 hours / 15)   // 15s 一块 → 5760 块
 * 这三条只在前端做「提前可读的提示」，最终仍由合约判定。
 */
export const REDPACKET_MAX_QUANTITY = 500
export const REDPACKET_MAX_AMOUNT_WEI = 2000n * 10n ** 18n
/** 24 小时 / 15 秒 = 5760 块（合约里的 expiry 计算口径） */
export const REDPACKET_EXPIRY_BLOCKS = 5760n

export const redPacketABI = [
  {
    inputs: [
      { internalType: 'uint256', name: 'id', type: 'uint256' },
      { internalType: 'uint256', name: 'quantity', type: 'uint256' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
    ],
    name: 'create',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'id', type: 'uint256' },
      { internalType: 'uint256', name: 'lucky_n', type: 'uint256' },
    ],
    name: 'open',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'id', type: 'uint256' },
      { internalType: 'uint256', name: 'n', type: 'uint256' },
    ],
    name: 'inspect',
    outputs: [
      {
        components: [
          { internalType: 'uint256', name: 'e', type: 'uint256' },
          { internalType: 'address', name: 'opener', type: 'address' },
          { internalType: 'uint256', name: 'block_height', type: 'uint256' },
        ],
        internalType: 'struct RedPacketJoule.OpenedPacket',
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    name: 'redpackets',
    outputs: [
      { internalType: 'bool', name: 'created', type: 'bool' },
      { internalType: 'address', name: 'creator', type: 'address' },
      { internalType: 'uint256', name: 'expiry', type: 'uint256' },
      { internalType: 'uint256', name: 'total_e', type: 'uint256' },
      { internalType: 'uint256', name: 'total_n', type: 'uint256' },
      { internalType: 'uint256', name: 'left_e', type: 'uint256' },
      { internalType: 'uint256', name: 'left_n', type: 'uint256' },
      { internalType: 'uint256', name: 'final_e', type: 'uint256' },
      { internalType: 'uint256', name: 'final_n', type: 'uint256' },
      { internalType: 'uint256', name: 'last_seed', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'id', type: 'uint256' }],
    name: 'withdraw',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'WJ',
    outputs: [{ internalType: 'contract IERC20', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'JTI',
    outputs: [{ internalType: 'contract IERC721', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

export type RedPacketABI = typeof redPacketABI
