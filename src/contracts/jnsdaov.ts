// JNSDAO V 徽章合约（0x9F57e77585E05CA7Def98f3171F448Fc8eb13A83）
//
// ⚠️ 与其它徽章 NFT 的差别（照抄通用 ERC721 会出错）：
//   1. 查询入口是 `query(address) → string`（data:application/json;base64），
//      不是 tokenOfOwnerByIndex + tokenURI。
//   2. `query()` 对**无徽章地址直接 revert**（实测 "Execution reverted"），
//      不是返回空串。所以调用前必须先看 balanceOf（见 utils/jnsdaov.ts）。
//   3. balanceOf 本身正常（持有 1 / 未持有 0 / 零地址 revert），可用于前置判定。
//
// ABI 只收本组件用到的三个只读函数，不把 v1 那份 30+ 项 ABI 整段搬进来
// （同 src/contracts/jns.ts 的最小集原则）。

export const JNSDAO_V_ADDRESS = '0x9F57e77585E05CA7Def98f3171F448Fc8eb13A83' as const

export const jnsdaovABI = [
  {
    inputs: [{ internalType: 'address', name: 'owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'addr', type: 'address' }],
    name: 'query',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'name',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const
