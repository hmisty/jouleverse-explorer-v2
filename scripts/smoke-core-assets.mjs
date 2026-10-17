#!/usr/bin/env node
// scripts/smoke-core-assets.mjs
// ─────────────────────────────────────────────────────────────
// 核心资产余额加载层冒烟测试（M1 · 手动触发 · 只读 · RPC 零负担）
//
// 验证 useCoreAssets / CoreAssetsPanel 三个关键验收点：
//   Phase 1 · RPC 次数：6 合约 balanceOf 聚合 + 1 次 getBalance ≤ 2 次（计数 transport 实测）
//   Phase 2 · 竞态回归：地址切换两次，最终余额属于第二次地址（镜像 requestId 守卫）
//   Phase 3 · 失败区分：balanceOf 失败项 → null（渲染 —），而非 0；零余额 → 0n
//
// 刻意遵守 repo 的「RPC 节点零负担」原则：全程只读（eth_call / eth_getBalance），
//   不广播交易、不做全量扫描。Phase 1/3 用真实链上合约做抽样；Phase 2 为纯本地时序
//   模拟（镜像 useCoreAssets 的 requestId 守卫逻辑，不依赖网络时序）。
//
// 配置来源（避免与代码漂移）：从 src/config/chain.ts 读 chainId/RPC/multicall3，
//   从 src/config/core-assets.ts 读 6 个官方合约地址。RPC 可用环境变量覆盖。
//
// 用法：
//   npm run smoke:core-assets
//   SMOKE_RPC=https://... npm run smoke:core-assets
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
const assetsSrc = readSrc('src/config/core-assets.ts')

const CHAIN_ID = Number(extract(chainSrc, /id:\s*(\d+)/, 'chainId', 'src/config/chain.ts'))
const HTTP_RPC = process.env.SMOKE_RPC || extract(chainSrc, /http:\s*\['([^']+)'\]/, 'RPC http 端点', 'src/config/chain.ts')
const MULTICALL3 = extract(chainSrc, /multicall3:\s*\{\s*address:\s*'([^']+)'/, 'multicall3 地址', 'src/config/chain.ts')

// 从 core-assets.ts 抽取全部官方合约地址（native 的 address: null 不含在内）
const CONTRACT_ADDRESSES = [...assetsSrc.matchAll(/address:\s*'(0x[0-9a-fA-F]{40})'/g)].map((m) => m[1])

const chain = {
  id: CHAIN_ID,
  name: 'Jouleverse Mainnet',
  nativeCurrency: { name: 'J', symbol: 'J', decimals: 18 },
  rpcUrls: { default: { http: [HTTP_RPC] } },
  contracts: { multicall3: { address: MULTICALL3 } },
}

// 统一最小 balanceOf ABI（与 useCoreAssets.ts 同口径）
const balanceOfABI = parseAbi(['function balanceOf(address) view returns (uint256)'])

const results = []
function check(name, ok, detail) {
  results.push({ name, ok })
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`)
}

// ── 计数 transport：包装 http()，统计真实 RPC 请求次数 ──
function countingHttp(url, counter) {
  const base = http(url)
  return (params) => {
    const { config, request, value } = base(params)
    return {
      config,
      value,
      request: async (args) => {
        counter.count += 1
        return request(args)
      },
    }
  }
}

console.log('── Core assets smoke ──')
console.log(`chain=${CHAIN_ID} rpc=${HTTP_RPC}`)
console.log(`multicall3=${MULTICALL3}`)
console.log(`官方合约地址数=${CONTRACT_ADDRESSES.length}\n`)

const rpcCounter = { count: 0 }
const client = createPublicClient({ chain, transport: countingHttp(HTTP_RPC, rpcCounter) })

try {
  // ── Phase 1：RPC 次数（6 balanceOf 一次 multicall + 1 getBalance ≤ 2）──
  console.log('Phase 1 · RPC 次数（余额类聚合）')
  if (CONTRACT_ADDRESSES.length !== 6) {
    check('官方合约地址数为 6', false, `实际 ${CONTRACT_ADDRESSES.length}`)
  } else {
    check('官方合约地址数为 6', true)
  }

  // 一个真实持币地址（链上已验证同时持有 WJ/JNS/POP/CoreID/JTI/JNSVote 六类资产），
  // 用于验证 6 个官方合约地址真实可读。ERC721 balanceOf 对零地址会按规范 revert，
  // 故此处用真实地址而非零地址；Phase 3 才用零地址验证「失败 ≠ 零」的区分。
  const HOLDER = '0xB2b4596664EA23cC4a871887b9A5CCE16FE8FD1e'
  const ZERO = '0x0000000000000000000000000000000000000000'
  rpcCounter.count = 0

  // 镜像 useCoreAssets.load()：余额类 = 一次 multicall(6 balanceOf) + 一次 getBalance
  const mcResults = await client.multicall({
    contracts: CONTRACT_ADDRESSES.map((address) => ({
      address,
      abi: balanceOfABI,
      functionName: 'balanceOf',
      args: [HOLDER],
    })),
    allowFailure: true,
  })
  await client.getBalance({ address: HOLDER })

  const rpcCount = rpcCounter.count
  check('余额类 RPC ≤ 2 次（1 multicall + 1 getBalance）', rpcCount <= 2, `实测 ${rpcCount} 次`)
  check('6 合约 balanceOf 对真实持币地址均可读', mcResults.every((r) => r.status === 'success'), 'allowFailure=true')

  // ── Phase 2：竞态回归（镜像 useCoreAssets 的 requestId 守卫）──
  console.log('\nPhase 2 · 竞态回归（地址切换两次）')
  // 镜像 useCoreAssets 的核心守卫：每次 load 自增 requestId，回填前校验是否仍是本次请求；
  // 每次 load 重新取「当前地址」（对应 toValue(address) 在 load 内求值）。
  const BALANCE_OF = {
    '0x1111111111111111111111111111111111111111': 111n,
    '0x2222222222222222222222222222222222222222': 222n,
  }
  async function simulateLoad() {
    let requestId = 0
    let committed = null
    let currentAddress = ''
    async function load(address, delayMs) {
      currentAddress = address // 对应 toValue(address) 每次 load 重取当前地址
      const myReq = ++requestId
      await new Promise((r) => setTimeout(r, delayMs)) // 模拟 RPC 延迟
      if (myReq !== requestId) return // 过期结果丢弃（对应 useCoreAssets 守卫）
      committed = { address: currentAddress, value: BALANCE_OF[currentAddress] }
    }
    return { load, getCommitted: () => committed }
  }

  const s = await simulateLoad()
  const p1 = s.load('0x1111111111111111111111111111111111111111', 150) // 旧地址，慢
  const p2 = s.load('0x2222222222222222222222222222222222222222', 20)  // 新地址，快
  await Promise.all([p1, p2])
  const committed = s.getCommitted()
  const raceOk = committed !== null && committed.address === '0x2222222222222222222222222222222222222222' && committed.value === 222n
  check('地址切换两次后，最终余额属于第二次地址（旧响应被丢弃）', raceOk, committed ? `committed=${committed.address.slice(0, 6)}… value=${committed.value}` : '未提交')

  // ── Phase 3：失败 ≠ 零（allowFailure 失败项 → null，而非 0）──
  console.log('\nPhase 3 · 失败 vs 零余额区分')
  // 用一个真实合约（balanceOf 成功，零地址余额应为 0n）+
  // 一个无代码 EOA（balanceOf 必然 revert → status failure → 映射 null）
  const BOGUS_EOA = '0x0000000000000000000000000000000000000001'
  const mixed = await client.multicall({
    contracts: [
      { address: CONTRACT_ADDRESSES[0], abi: balanceOfABI, functionName: 'balanceOf', args: [ZERO] },
      { address: BOGUS_EOA, abi: balanceOfABI, functionName: 'balanceOf', args: [ZERO] },
    ],
    allowFailure: true,
  })
  // 镜像 useCoreAssets 的映射：status success → result，否则 null
  const mapped = mixed.map((r) => (r.status === 'success' ? r.result : null))
  const realOk = mixed[0].status === 'success' && typeof mapped[0] === 'bigint'
  const bogusNull = mapped[1] === null
  check('真实合约 balanceOf 成功返回 bigint（零余额为 0n 而非 null）', realOk, `result=${String(mapped[0])}`)
  check('失败项映射为 null（渲染 —）而非 0', bogusNull, `mapped=${mapped[1]}`)
  check('失败 ≠ 零：null 与 0n 严格区分', bogusNull && mapped[1] !== 0n)
} catch (e) {
  check('运行未抛异常', false, e.shortMessage || e.message)
}

const failed = results.filter((r) => !r.ok)
console.log(`\n── 汇总：通过 ${results.length - failed.length}/${results.length} ──`)
if (failed.length) console.log(failed.map((f) => '  ❌ ' + f.name).join('\n'))
process.exit(failed.length ? 1 : 0)
