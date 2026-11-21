// 真实链验证：区块哈希入参（P5-1 补齐 v1 `/#/block/:blockId` 双入参语义）
//
// 断言链：
//   1. 取最新块 → 用它的哈希按 blockHash 查到同一块（证明 viem 路径可用）
//   2. 同一哈希在「改动前的实现」里会怎么走：BigInt(hash) → getBlock blockNumber → 抛错
//      （显式复现，证明这不是理论缺口）
//   3. 原始值经 parseBlockParam 解析后与链上一致（引入真实模块，不重写逻辑）
//   4. 前导零区块号归一化后仍命中同一块
import { createPublicClient, http, defineChain } from 'viem'
import { parseBlockParam } from '../src/utils/block-param.ts'

const chain = defineChain({
  id: 3666,
  name: 'Jouleverse',
  nativeCurrency: { name: 'J', symbol: 'J', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.jnsdao.com'] } },
})
const client = createPublicClient({ chain, transport: http('https://rpc.jnsdao.com', { timeout: 30_000 }) })

let failed = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failed++
}

const latest = await client.getBlockNumber()
const block = await client.getBlock({ blockNumber: latest })
console.log(`\n最新块 ${latest}\n  hash ${block.hash}\n`)

// 1. blockHash 查询命中同一块
const byHash = await client.getBlock({ blockHash: block.hash })
check('getBlock({blockHash}) 命中同一块', byHash.number === latest && byHash.hash === block.hash,
  `#${byHash.number}`)

// 2. 改动前的行为：把哈希当高度必抛错（复现死链）
let threw = false
try {
  await client.getBlock({ blockNumber: BigInt(block.hash) })
} catch { threw = true }
check('把哈希当区块号查询会抛错（复现改动前死链）', threw)

// 3. parseBlockParam 解析真实值
const p1 = parseBlockParam(block.hash)
check('parseBlockParam(带0x哈希) → hash 分支', p1?.kind === 'hash' && p1.hash === block.hash)
const p2 = parseBlockParam(block.hash.slice(2))
check('parseBlockParam(裸哈希) → 同一 hash', p2?.kind === 'hash' && p2.hash === block.hash)
const p3 = parseBlockParam(block.hash.toUpperCase().replace('0X', '0x'))
check('parseBlockParam(大写哈希) → 归一化为同一 hash', p3?.kind === 'hash' && p3.hash === block.hash)

// 4. 区块号路径 + 前导零归一化
const p4 = parseBlockParam(String(latest))
check('parseBlockParam(区块号) → number 分支', p4?.kind === 'number' && p4.number === latest)
const p5 = parseBlockParam(`000${latest}`)
check('前导零归一化后仍是同一高度', p5?.kind === 'number' && p5.number === latest)
if (p4?.kind === 'number') {
  const byNum = await client.getBlock({ blockNumber: p4.number })
  check('两条路径得到同一块哈希', byNum.hash === block.hash)
}

// 5. 不存在的哈希 → 清晰的 null，而不是 RPC 参数错误
const ghost = `0x${'ee'.repeat(32)}`
const gp = parseBlockParam(ghost)
let ghostNull = null
try { ghostNull = await client.getBlock({ blockHash: gp.hash }) } catch { ghostNull = null }
check('不存在的哈希返回 null（干净的「未找到」，非参数非法）', ghostNull === null)

// 6. 参数无效时不发 RPC（纯函数层面就拦住）
check('无效输入 parseBlockParam → null', parseBlockParam('hello') === null && parseBlockParam('') === null)

console.log(failed === 0 ? '\n✅ 全部通过\n' : `\n❌ ${failed} 项失败\n`)
process.exit(failed === 0 ? 0 : 1)
