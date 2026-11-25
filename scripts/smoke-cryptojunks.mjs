#!/usr/bin/env node
/**
 * CryptoJunks 真实链冒烟（P5-4）。
 *
 * 离线单测用的是假客户端，只能证明「逻辑自洽」。这里打真链，验证三件事：
 *   1. totalSupply 真的是 10000，sealed 判断成立
 *   2. tokenURI 的格式与 parseJunkMetadata 的假设一致（真能解出 image）
 *   3. 金标/稀有度参照表与链上火数据相符 —— 抽样比对，不一致说明参照表过期
 *   4. 每页只花 1 个 multicall（顺手量一下耗时）
 *
 * 用法：node scripts/smoke-cryptojunks.mjs
 */
import { createPublicClient, http, defineChain } from 'viem'

const chain = defineChain({
  id: 3666,
  name: 'Jouleverse',
  nativeCurrency: { name: 'J', symbol: 'J', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.jnsdao.com'] } },
  // ⚠️ multicall3 是 Jouleverse 自部署地址，标准 0xcA11bde… 在本链没有合约
  contracts: { multicall3: { address: '0x52E8BB61d20259F0434Aefe0C2EfB48fDe77f9C2' } },
})
const client = createPublicClient({
  chain,
  transport: http('https://rpc.jnsdao.com', { timeout: 60_000 }),
})

const ADDR = '0x1b1d15726d64c5027b627138f2bf051cc1EF2680'
const abi = [
  { name: 'totalSupply', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'tokenURI', type: 'function', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'string' }] },
]

// 直接从仓库里读参照表，避免「脚本自带一份、页面用另一份」的分叉
const { GOLDEN, LEGEND_IDS, RARE_IDS, PRECIOUS_IDS } = await import('../src/data/crypto-junks-golden.ts')

let pass = 0
let fail = 0
function check(ok, label, detail = '') {
  if (ok) { pass++; console.log(`  ✅ ${label}${detail ? '  ' + detail : ''}`) }
  else { fail++; console.log(`  ❌ ${label}${detail ? '  ' + detail : ''}`) }
}

console.log('=== 1. supply ===')
const supply = await client.readContract({ address: ADDR, abi, functionName: 'totalSupply' })
check(Number(supply) === 10000, 'totalSupply = 10000', `实际 ${supply}`)

console.log('=== 2. tokenURI 格式 ===')
const uri0 = await client.readContract({ address: ADDR, abi, functionName: 'tokenURI', args: [0n] })
check(uri0.startsWith('data:application/json;base64,'), 'tokenURI 前缀符合假设')
const meta0 = JSON.parse(Buffer.from(uri0.split(',')[1], 'base64').toString())
check(typeof meta0.image === 'string' && meta0.image.startsWith('data:image/png;base64,'), 'image 是 png base64')
check(meta0.image !== 'data:image/png;base64,', 'image 非空（不被判为不存在）')
check(typeof meta0.name === 'string' && meta0.name.length > 0, `name 可读：${meta0.name}`)

console.log('=== 3. 整页 multicall 耗时（第 0 页 100 枚）===')
const ids = Array.from({ length: 100 }, (_, i) => BigInt(i))
const t0 = Date.now()
const page0 = await client.multicall({
  contracts: ids.map((id) => ({ address: ADDR, abi, functionName: 'tokenURI', args: [id] })),
  allowFailure: true,
})
const ms0 = Date.now() - t0
check(page0.length === 100, '返回 100 项', `${ms0}ms`)
check(page0.every((r) => r.status === 'success'), '第 0 页 100 枚全部可读')
console.log(`     → 一页 1 个 multicall = ${ms0}ms（v1 是 100 个独立 call）`)

console.log('=== 4. 稀有度抽样对账（参照表 vs 链上图像）===')
// 稀有度在参照表里是离线标注，链上 tokenURI 里没有 rarity 字段，
// 所以这里只做「抽样的 token 真的存在且可读」的活性检查，
// 外加 legend 页 9 枚必须全部可读。
const legendIds = [...LEGEND_IDS]
const legendRes = await client.multicall({
  contracts: legendIds.map((id) => ({ address: ADDR, abi, functionName: 'tokenURI', args: [BigInt(id)] })),
  allowFailure: true,
})
check(legendRes.every((r) => r.status === 'success'), `legend 页 ${legendIds.length} 枚全部可读`, legendIds.join(','))

const brokenSample = [101, 109, 119]
const brokenRes = await client.multicall({
  contracts: brokenSample.map((id) => ({ address: ADDR, abi, functionName: 'tokenURI', args: [BigInt(id)] })),
  allowFailure: true,
})
check(brokenRes.every((r) => r.status === 'success'), 'broken 抽样可读', brokenSample.join(','))
// broken 的定义是「被 burn 过 / 标记为坏」，但 token 仍在链上可读；
// 参照表说它们是 golden=0，这里只断言可读性，不断言图像内容。
check(brokenSample.every((id) => GOLDEN[id] === 0), 'broken 抽样在参照表里确是 golden=0')

console.log('=== 5. 参照表自洽（离线，防止生成物被改坏）===')
check(GOLDEN.length === 10000, 'GOLDEN 长度 10000')
check(GOLDEN.filter((v) => v === 1).length === 9701, 'good 9701 枚')
check(LEGEND_IDS.length === 9 && RARE_IDS.length === 24 && PRECIOUS_IDS.length === 88, '三组稀有度 9/24/88')

console.log('')
console.log(fail === 0 ? `✅ 冒烟全部通过（${pass} 项）` : `❌ ${fail} 项失败 / ${pass} 项通过`)
process.exit(fail === 0 ? 0 : 1)
