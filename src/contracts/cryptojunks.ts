// CryptoJunks NFT 合约配置（P5-4）
// 合约地址与 v1 `junksInfo.html` 页面底部展示的一致：0x1b1d15726d64c5027b627138f2bf051cc1EF2680
// 该合约在 src/contracts/toolbox.ts 里已注册（key: 'cryptojunks'），此处只抽最小只读 ABI。

export const CRYPTOJUNKS_ADDRESS = '0x1b1d15726d64c5027b627138f2bf051cc1EF2680' as const

/** 最小只读 ABI：浏览页只需要这三个调用 */
export const cryptojunksABI = [
  {
    inputs: [],
    name: 'totalSupply',
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
] as const
