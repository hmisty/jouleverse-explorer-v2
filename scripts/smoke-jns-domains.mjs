#!/usr/bin/env node
// scripts/smoke-jns-domains.mjs
// ─────────────────────────────────────────────────────────────
// JNS 域名总览冒烟测试（手动触发 · 抽样 · 只读 · RPC 零负担）
//
// 用途：一条命令验证「当前代码的配置」能否真的连上 Jouleverse 主网、
//       枚举 JNS 域名全集（ERC721Enumerable），并复核 useJnsDomains.ts
//       依赖的四项链上能力。
//
// 刻意遵守 repo 的「RPC 节点零负担」原则：
//   · 全程只读（eth_call），不广播任何交易
//   · 只抽样首/中/末 3 个索引，不做全量枚举（全量留给页面按需分页）
//
// 配置来源（避免与代码漂移）：从 src/config/chain.ts、src/contracts/jns.ts
//   读取 chainId / RPC / multicall3 / 合约地址。RPC 可用环境变量覆盖。
//
// 用法：
//   npm run smoke:jns
//   SMOKE_RPC=https://... npm run smoke:jns
//
// 退出码：0 = 全部通过；1 = 有失败项（便于手动/CI 判断）
// ─────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createPublicClient, http, parseAbi } from 'viem'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// ── 从项目源码读取配置（抽取失败即报错退出，绝不静默兜底）──
function readSrc(rel) {
  return readFileSync(join(ROOT, rel), 'utf8')
}
function extract(src, re, label, filename) {
  const m = src.match(re)
  if (!m || !m[1]) {
    console.error(`❌ 无法从 ${filename} 抽取 ${label}：正则失配，源码格式可能已变化，请检查后重试。`)
    process.exit(1)
  }
  return m[1]
}

const chainSrc = readSrc('src/config/chain.ts')
const jnsSrc = readSrc('src/contracts/jns.ts')

const CHAIN_ID = Number(extract(chainSrc, /id:\s*(\d+)/, 'chainId', 'src/config/chain.ts'))
// RPC 优先用 SMOKE_RPC 环境变量覆盖；未提供时才从源码抽取（同样失败即报错）
const HTTP_RPC = process.env.SMOKE_RPC || extract(chainSrc, /http:\s*\['([^']+)'\]/, 'RPC http 端点', 'src/config/chain.ts')
const MULTICALL3 = extract(chainSrc, /multicall3:\s*\{\s*address:\s*'([^']+)'/, 'multicall3 地址', 'src/config/chain.ts')
const JNS = extract(jnsSrc, /JNS_ADDRESS\s*=\s*'([^']+)'/, 'JNS_ADDRESS', 'src/contracts/jns.ts')

const chain = {
  id: CHAIN_ID,
  name: 'Jouleverse Mainnet',
  nativeCurrency: { name: 'J', symbol: 'J', decimals: 18 },
  rpcUrls: { default: { http: [HTTP_RPC] } },
  contracts: { multicall3: { address: MULTICALL3 } },
}

const abi = parseAbi([
  'function totalSupply() view returns (uint256)',
  'function tokenByIndex(uint256) view returns (uint256)',
  'function _allTokensName(uint256) view returns (string)',
  'function ownerOf(uint256) view returns (address)',
  'function _bound(uint256) view returns (address)',
])

const results = []
function check(name, ok, detail) {
  results.push({ name, ok })
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`)
}

console.log('── JNS domains smoke ──')
console.log(`chain=${CHAIN_ID} rpc=${HTTP_RPC}`)
console.log(`contract=${JNS} multicall3=${MULTICALL3}\n`)

const client = createPublicClient({ chain, transport: http(HTTP_RPC) })

try {
  // ── Phase 1：totalSupply 可读且 > 0 ──
  console.log('Phase 1 · totalSupply')
  const total = await client.readContract({ address: JNS, abi, functionName: 'totalSupply' })
  check('totalSupply 可读且 > 0', total > 0n, `${total} 个域名`)

  if (total > 0n) {
    // ── Phase 2：tokenByIndex 抽样（首/中/末各 1）+ 越界 revert ──
    console.log('\nPhase 2 · 枚举（抽样首/中/末）')
    const sampleIdx = [...new Set([0n, total / 2n, total - 1n])]
    const idxRes = await client.multicall({
      contracts: sampleIdx.map((i) => ({ address: JNS, abi, functionName: 'tokenByIndex', args: [i] })),
      allowFailure: true,
    })
    const okCount = idxRes.filter((r) => r.status === 'success').length
    check('tokenByIndex 抽样可读', okCount === sampleIdx.length, `${okCount}/${sampleIdx.length}`)

    let outOfBoundsReverts = false
    try {
      await client.readContract({ address: JNS, abi, functionName: 'tokenByIndex', args: [total] })
    } catch {
      outOfBoundsReverts = true
    }
    check('tokenByIndex(total) 越界 revert', outOfBoundsReverts)

    const tokenIds = idxRes.filter((r) => r.status === 'success').map((r) => r.result)

    // ── Phase 3：详情三连 multicall（名称 / 所有者 / 绑定地址）──
    console.log('\nPhase 3 · 域名详情（multicall 聚合）')
    const detailCalls = []
    for (const tid of tokenIds) {
      detailCalls.push({ address: JNS, abi, functionName: '_allTokensName', args: [tid] })
      detailCalls.push({ address: JNS, abi, functionName: 'ownerOf', args: [tid] })
      detailCalls.push({ address: JNS, abi, functionName: '_bound', args: [tid] })
    }
    const detailRes = await client.multicall({ contracts: detailCalls, allowFailure: true })
    let named = 0
    let owned = 0
    const samples = []
    detailRes.forEach((r, i) => {
      if (r.status !== 'success') return
      const tid = tokenIds[Math.floor(i / 3)]
      if (i % 3 === 0 && typeof r.result === 'string' && r.result) { named++; samples.push(r.result) }
      if (i % 3 === 1 && typeof r.result === 'string' && /^0x[0-9a-fA-F]{40}$/.test(r.result)) owned++
    })
    check('_allTokensName 全部非空', named === tokenIds.length, `${named}/${tokenIds.length}${samples.length ? ' e.g. ' + samples.slice(0, 3).join(', ') : ''}`)
    check('ownerOf 全部返回地址', owned === tokenIds.length, `${owned}/${tokenIds.length}`)

    const boundRes = detailRes.filter((r, i) => i % 3 === 2 && r.status === 'success')
    check('_bound 可读（含零地址 = 未绑定）', boundRes.length === tokenIds.length, `${boundRes.length}/${tokenIds.length}`)
  }
} catch (e) {
  check('运行未抛异常', false, e.shortMessage || e.message)
}

const failed = results.filter((r) => !r.ok)
console.log(`\n── 汇总：通过 ${results.length - failed.length}/${results.length} ──`)
if (failed.length) console.log(failed.map((f) => '  ❌ ' + f.name).join('\n'))
process.exit(failed.length ? 1 : 0)
