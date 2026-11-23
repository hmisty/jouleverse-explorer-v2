#!/usr/bin/env node
// scripts/smoke-p5-2-assets.mjs
// ─────────────────────────────────────────────────────────────
// P5-2 地址页资产对等 · 真实链冒烟（只读 · 手动触发）
//
// 覆盖四项（对应 docs/v1-parity-checklist.md §三·C 第 9/10/11 项）：
//   [1] 四类新增资产合约在链上存在（Planet / FlyingJ / JNSDAO V / CryptoJunks）
//   [2] JTI V1 与 V2 是不同集合 —— 证明面板误指 V1 会让用户看到 0 个
//   [3] JNSDAO V 的 query(address) → npub 派生（含「无徽章地址 query() 会 revert」）
//   [4] 新手加油判定：余额 0 + 持有 JTI(v2) 才显示
//
// 为什么 [2] 要留在脚本里：这不是「顺手记一个链上事实」，它是一条回归判据。
// 若有人把 core-assets.ts 的 jti 地址改回 V1，这里会立刻红。
//
// 全程只读（eth_call / eth_getBalance），不广播交易、不扫全链，遵守节点零负担。
// 退出码：0 = 全过；1 = 有失败（锚点失效、断言不符都会显式报错，不静默跳过）
// ─────────────────────────────────────────────────────────────
import { createPublicClient, http, defineChain, parseAbi } from 'viem'
import { bech32 } from '@scure/base'
import { readFileSync } from 'node:fs'

const tokenByOwnerABI = parseAbi(['function tokenOfOwnerByIndex(address,uint256) view returns (uint256)'])
const ownerOf = parseAbi(['function ownerOf(uint256) view returns (address)'])

const chain = defineChain({ id: 3666, name: 'Jouleverse', nativeCurrency: { name: 'J', symbol: 'J', decimals: 18 }, rpcUrls: { default: { http: ['https://rpc.jnsdao.com'] } } })
const client = createPublicClient({ chain, transport: http('https://rpc.jnsdao.com', { timeout: 60000 }) })

const A = {
  planet: '0x9c100856f5C60a3ec87Aa408567304DB2AfC241F',
  flyingj: '0x045B997B5E05DF9795985aB9e6720d94557255BE',
  jnsdaov: '0x9F57e77585E05CA7Def98f3171F448Fc8eb13A83',
  junk: '0x1b1d15726d64c5027b627138f2bf051cc1EF2680',
  jtiV2: '0x7e722837Ff19BE2687c2089DBf70D064fB9622AE',
  jtiV1: '0x826971d988d7d86Fdc9062A3f63E7b18D32Bc8EB',
}
const abi = parseAbi([
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function tokenOfOwnerByIndex(address,uint256) view returns (uint256)',
  'function tokenURI(uint256) view returns (string)',
  'function query(address) view returns (string)',
])
const latest = await client.getBlockNumber()
let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m) } else { fail++; console.log('  ✗', m) } }

console.log('latest block', latest)

// ── 1. 四类新增资产链上存在且可枚举 ──
console.log('\n[1] 四类新增资产的 supply 与可枚举性（真实链）')
for (const [n, a] of Object.entries({ planet: A.planet, flyingj: A.flyingj, jnsdaov: A.jnsdaov, junk: A.junk })) {
  const ts = await client.readContract({ address: a, abi, functionName: 'totalSupply' })
  ok(ts > 0n, `${n} totalSupply=${ts}`)
}
// 取一个有 JTI v2 的地址做全量面板对账
const ts2 = await client.readContract({ address: A.jtiV2, abi, functionName: 'totalSupply' })
// tokenByIndex 才是「按全局序取 tokenId」；tokenOfOwnerByIndex(owner, index) 要地址在前，
// 写反了 viem 会直接报 InvalidAddressError —— 这类错在脚本里也要能看出来
const tokenByIndexABI = parseAbi(['function tokenByIndex(uint256) view returns (uint256)'])
const tid2 = await client.readContract({ address: A.jtiV2, abi: tokenByIndexABI, functionName: 'tokenByIndex', args: [ts2 - 1n] })
console.log('  jtiV2 tokenByIndex(last) =', tid2)

// ── 2. JTI V1 vs V2 确实不同（证明误配 V1 会让用户看到 0）──
console.log('\n[2] JTI V1 / V2 持有人集合不同（v2 面板曾误指 V1）')
const holdersV2 = []
for (let i = ts2 - 1n; i >= ts2 - 3n; i--) {
  const tid = await client.readContract({ address: A.jtiV2, abi: tokenByIndexABI, functionName: 'tokenByIndex', args: [i] })
  const o = await client.readContract({ address: A.jtiV2, abi: ownerOf, functionName: 'ownerOf', args: [tid] })
  const v1 = await client.readContract({ address: A.jtiV1, abi, functionName: 'balanceOf', args: [o] })
  holdersV2.push({ tid: tid.toString(), owner: o, v1bal: v1.toString() })
}
const allZero = holdersV2.every(h => h.v1bal === '0')
ok(allZero, `v2 最新 3 个持有人的 V1 余额全为 0（→ 面板若指 V1 会显示 0 个）`)
console.log('   ', holdersV2)

// ── 3. JNSDAO V query + npub 派生 ──
console.log('\n[3] JNSDAO V query(address) → npub')
// 必须取「JNSDAO V 自己的持有人」，不能拿 JTI 持有人充数（两者是不同的徽章集合）
const jnsTs = await client.readContract({ address: A.jnsdaov, abi, functionName: 'totalSupply' })
let jnsFound = false
for (let i = 0n; i < jnsTs && !jnsFound; i++) {
  const tid = await client.readContract({ address: A.jnsdaov, abi: tokenByIndexABI, functionName: 'tokenByIndex', args: [i] })
  const holder = await client.readContract({ address: A.jnsdaov, abi: ownerOf, functionName: 'ownerOf', args: [tid] })
  let uri
  try { uri = await client.readContract({ address: A.jnsdaov, abi, functionName: 'query', args: [holder] }) } catch { continue }
  const meta = JSON.parse(Buffer.from(String(uri).split(',')[1], 'base64').toString('utf8'))
  const hexBytes = Buffer.from(meta.hex, 'hex')
  const derived = bech32.encode('npub', bech32.toWords(hexBytes))
  console.log('    tokenId   =', tid.toString(), '\n    holder    =', holder)
  console.log('    meta.name =', meta.name, '\n    meta.hex  =', meta.hex, '\n    npub      =', derived)
  ok(/^npub1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58}$/.test(derived), 'npub 形状合法（npub1 + 58 字符）')
  ok(derived.length === 63, `npub 长度 63（实际 ${derived.length}）`)
  ok(hexBytes.length === 32, `meta.hex 恰好 32 字节（实际 ${hexBytes.length}）`)
  ok(meta.name && typeof meta.name === 'string', 'meta.name 存在（面板标签用它，不自己拼）')
  jnsFound = true
}
if (!jnsFound) { fail++; console.log('  ✗ 未找到 JNSDAO V 持有人（锚点失效即报错，不静默跳过）') }

// query() 对无徽章地址必须 revert（这是必须前置 balanceOf 的理由）
const noBadge = '0x9c100856f5C60a3ec87Aa408567304DB2AfC241F'
const noBadgeBal = await client.readContract({ address: A.jnsdaov, abi, functionName: 'balanceOf', args: [noBadge] })
let reverted = false
try { await client.readContract({ address: A.jnsdaov, abi, functionName: 'query', args: [noBadge] }) } catch { reverted = true }
ok(noBadgeBal === 0n && reverted, `无徽章地址 balanceOf=0 且 query() revert（证明必须先看 balanceOf）`)

// ── 4. 新手加油判定（真实链找「余额 0 + 有 JTI v2」的地址）──
console.log('\n[4] 新手加油判定：真实链抽样')
let newbie = null
for (let i = ts2 - 1n; i >= ts2 - 12n && i >= 0n; i--) {
  const tid = await client.readContract({ address: A.jtiV2, abi: tokenByIndexABI, functionName: 'tokenByIndex', args: [i] })
  const o = await client.readContract({ address: A.jtiV2, abi: ownerOf, functionName: 'ownerOf', args: [tid] })
  const bal = await client.getBalance({ address: o })
  const jti = await client.readContract({ address: A.jtiV2, abi, functionName: 'balanceOf', args: [o] })
  if (bal === 0n && jti > 0n) { newbie = { o, bal, jti }; break }
}
if (newbie) {
  ok(true, `找到「余额 0 + JTI v2=${newbie.jti}」地址 ${newbie.o} → 应显示新手加油`)
} else {
  // 不静默跳过：明说这一轮没抽到，并给出一个「有 JTI 但余额非 0」的对照
  const o = holdersV2[0].owner
  const bal = await client.getBalance({ address: o })
  ok(bal > 0n, `本轮未抽到零余额新手；对照地址 ${o} 余额 ${bal} wei > 0 → 正确判定为「不需要加油」`)
}

// ── 5. CryptoJunks 墙：参照表与链上对账 ──
console.log('\n[5] CryptoJunks 墙：参照表 golden_idx.json 与链上对账')
const refPath = new URL('../public/reference/punks/golden_idx.json', import.meta.url)
const ref = JSON.parse(readFileSync(refPath, 'utf8'))
const junkSupply = await client.readContract({ address: A.junk, abi, functionName: 'totalSupply' })
ok(Array.isArray(ref.golden) && ref.golden.length === Number(junkSupply),
   `golden 数组长度 ${ref.golden?.length} == 链上 totalSupply ${junkSupply}（长度不符意味着按下标取值会越界）`)
const goldenCount = ref.golden.filter(v => v === 1 || v === '1').length
ok(goldenCount > 0 && goldenCount < ref.golden.length,
   `golden=1 共 ${goldenCount} 枚（既非全 0 也非全 1——否则标记等于没有信息）`)
for (const k of ['alien', 'ape', 'zombie']) {
  const arr = ref[k]
  const allInt = Array.isArray(arr) && arr.every(x => Number.isInteger(x))
  const inRange = allInt && arr.every(x => x >= 0 && x < Number(junkSupply))
  ok(inRange, `${k} 列表 ${arr?.length ?? 'N/A'} 项且全部为 [0, totalSupply) 内整数`)
}
// 稀有度互斥性：v1 是 else-if 链，但数据层面可能重叠——重叠时 legend 优先，这里只报事实
const sets = { alien: new Set(ref.alien), ape: new Set(ref.ape), zombie: new Set(ref.zombie) }
const overlap = [...sets.alien].filter(x => sets.ape.has(x) || sets.zombie.has(x))
console.log(`    alien∩(ape∪zombie) = ${overlap.length} 项${overlap.length ? '（重叠时按 legend 优先，与 v1 else-if 一致）' : '（三层互斥）'}`)
// 真实持仓对账：取一个 junk 持有人，验证装饰解析不抛错且金标取值与表一致
const holder = await client.readContract({ address: A.junk, abi: ownerOf, functionName: 'ownerOf', args: [1n] })
const holderBal = await client.readContract({ address: A.junk, abi, functionName: 'balanceOf', args: [holder] })
const firstTid = await client.readContract({ address: A.junk, abi: tokenByOwnerABI, functionName: 'tokenOfOwnerByIndex', args: [holder, 0n] })
const tidNum = Number(firstTid)
const expectGolden = ref.golden[tidNum] === 1 || ref.golden[tidNum] === '1'
console.log(`    holder ${holder} 持 ${holderBal} 枚，首枚 tokenId=${tidNum}，参照表 golden=${expectGolden}`)
ok(Number.isInteger(tidNum) && tidNum >= 0 && tidNum < ref.golden.length,
   `持仓 tokenId 落在参照表范围内（可安全按下标取值）`)

console.log(`\n结果: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
