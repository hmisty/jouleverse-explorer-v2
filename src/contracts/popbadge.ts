// POPBadge（签到徽章NFT）合约配置
// 合约地址: 0xCb1429da13cE40e75519148e796C6D58dD6b1a8E

export const POPBADGE_ADDRESS = '0xCb1429da13cE40e75519148e796C6D58dD6b1a8E' as const

// 最小化的 ABI，只包含我们需要的函数
export const popbadgeABI = [
  {
    inputs: [{ internalType: 'address', name: 'owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'owner', type: 'address' },
      { internalType: 'uint256', name: 'index', type: 'uint256' },
    ],
    name: 'tokenOfOwnerByIndex',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    name: 'tokenURI',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  // ---- 全网统计页所需方法 ----
  {
    inputs: [],
    name: 'totalSupply',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'index', type: 'uint256' }],
    name: 'tokenByIndex',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    name: 'getPOPInfo',
    outputs: [
      { internalType: 'uint256', name: 'jvCoreTokenId', type: 'uint256' },
      { internalType: 'uint256', name: 'checkInBlockNumber', type: 'uint256' },
      { internalType: 'uint256', name: 'checkInTimestamp', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const

export type POPBadgeContract = typeof popbadgeABI
