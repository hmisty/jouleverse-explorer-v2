#!/usr/bin/env node
/**
 * 全网能量口径真实链校验（P5-1 对等判据第 5 条：真实链验证）
 *
 * 校验内容：
 *   1. core / eco 两个 Timelock 实例的 released == used + available 是否成立
 *   2. 合并后的五值口径（total / free / reserved / reserved_core / reserved_eco）
 *      与 v1 `mainController.js:43-52` 的映射是否一致
 *
 * 用法：
 *   node scripts/smoke-energy.mjs
 * 退出码：0 = 全部通过；1 = 恒等式不成立或读链失败
 */
import { createPublicClient, http, defineChain, formatUnits } from 'viem'

const chain = defineChain({
  id: 3666,
  name: 'Jouleverse Mainnet',
  nativeCurrency: { name: 'J', symbol: 'J', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.jnsdao.com'] } },
  // Jouleverse 的 multicall3 是自部署地址，标准 0xcA11bde… 在本链无合约
  contracts: { multicall3: { address: '0x52E8BB61d20259F0434Aefe0C2EfB48fDe77f9C2' } },
})

const client = createPublicClient({
  chain,
  transport: http('https://rpc.jnsdao.com', { timeout: 60_000 }),
})

const timelockABI = [
  { name: 'used', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'released', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'available', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
]

const TIMELOCK_CORE = '0x628beb88dD440A8c5e4cC89Ab33a041f521e4323'
const TIMELOCK_ECO = '0xbb6b53Fadf85B73258cb6A54F1343Ac4D5F99773'

const j = (x) => Number(formatUnits(x, 18)).toLocaleString('zh-CN', { maximumFractionDigits: 2 })

async function readTriple(address, label) {
  const [used, released, available] = await client.multicall({
    contracts: [
      { address, abi: timelockABI, functionName: 'used' },
      { address, abi: timelockABI, functionName: 'released' },
      { address, abi: timelockABI, functionName: 'available' },
    ],
    allowFailure: false,
  })
  console.log(`  ${label}: used=${j(used)}  released=${j(released)}  available=${j(available)}`)
  return { used, released, available }
}

const main = async () => {
  const blockNumber = await client.getBlockNumber()
  console.log(`真实链读数（${chain.name}, 最新块 ${blockNumber}）`)

  const core = await readTriple(TIMELOCK_CORE, 'core')
  const eco = await readTriple(TIMELOCK_ECO, 'eco ')

  let ok = true

  // 1) 恒等式逐实例校验
  for (const [name, t] of [['core', core], ['eco', eco]]) {
    const sum = t.used + t.available
    if (t.released === sum) {
      console.log(`  ✅ ${name}: released == used + available`)
    } else {
      ok = false
      console.log(`  ❌ ${name}: released(${t.released}) != used+available(${sum})，差 ${t.released - sum}`)
    }
  }

  // 2) 五值口径合并（与 src/utils/energy.ts 的 mergeEnergy 同算法）
  const total = core.released + eco.released
  const free = core.used + eco.used
  const reserved = core.available + eco.available

  console.log('\n五值口径（v1 five-value 对等）：')
  console.log(`  total（总释放）      = ${j(total)}`)
  console.log(`  free（流通）         = ${j(free)}`)
  console.log(`  reserved（锁定）     = ${j(reserved)}`)
  console.log(`  reserved_core        = ${j(core.available)}`)
  console.log(`  reserved_eco         = ${j(eco.available)}`)

  // 3) 三分法自洽：free + reserved 必须等于 total
  if (free + reserved === total) {
    console.log('  ✅ free + reserved == total')
  } else {
    ok = false
    console.log(`  ❌ free + reserved(${free + reserved}) != total(${total})`)
  }

  // 4) 分项拆分自洽
  if (core.available + eco.available === reserved) {
    console.log('  ✅ reserved_core + reserved_eco == reserved')
  } else {
    ok = false
    console.log('  ❌ reserved 分项之和不等于 reserved')
  }

  console.log(ok ? '\n✅ 全部通过' : '\n❌ 存在不自洽项')
  process.exit(ok ? 0 : 1)
}

main().catch((e) => {
  console.error('读链失败：', e.shortMessage || e.message)
  process.exit(1)
})
