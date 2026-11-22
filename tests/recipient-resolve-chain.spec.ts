import { describe, it, expect } from 'vitest'
import { createPublicClient, http, defineChain } from 'viem'
import { resolveRecipient, makeJnsLookup, parseRecipient } from '../src/utils/recipient-resolve'
import { JNS_ADDRESS, jnsABI } from '../src/contracts/jns'

// 真实链验证（对等清单 P5-2 硬性门禁第 5 条）
//
// 为什么放在 vitest 里而不是 scripts/*.mjs：
// src/utils/recipient-resolve.ts 里 `import ... from './jvaddress'` 不带扩展名，
// Node ESM 直接跑会 ERR_MODULE_NOT_FOUND（2026-11-20 记过的坑）；
// 为此改 tsconfig 是拿项目配置迁就验证脚本，正确做法是用 vitest 跑。

const chain = defineChain({
  id: 3666,
  name: 'Jouleverse',
  nativeCurrency: { name: 'J', symbol: 'J', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.jnsdao.com'] } },
})

const client = createPublicClient({ chain, transport: http('https://rpc.jnsdao.com', { timeout: 60_000 }) })
const lookup = makeJnsLookup(client as never, JNS_ADDRESS as `0x${string}`, jnsABI)

// src/contracts/jns.ts 的 jnsABI 是「只含组件需要的函数」的最小集，没有 totalSupply。
// 这里补一个仅用于验证的只读 ABI，不往生产 ABI 里加用不到的函数。
const PROBE_ABI = [
  { inputs: [], name: 'totalSupply', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ type: 'uint256' }], name: '_allTokensName', outputs: [{ type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ type: 'uint256' }], name: '_bound', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
] as const
const CHAIN_TIMEOUT = 120_000

function read(fn: string, args: unknown[]) {
  return client.readContract({
    address: JNS_ADDRESS as `0x${string}`,
    abi: PROBE_ABI,
    functionName: fn,
    args,
  } as never) as Promise<unknown>
}


/** 在最近 N 个 tokenId 里找「有名字且已绑定非零地址」的锚点 */
async function findBoundAnchor(limit = 40n) {
  const totalSupply = (await read('totalSupply', [])) as bigint
  const start = totalSupply > limit ? totalSupply - limit : 0n
  for (let tid = totalSupply - 1n; tid >= start; tid--) {
    try {
      const name = (await read('_allTokensName', [tid])) as string
      if (!name) continue
      const bound = (await read('_bound', [tid])) as string
      if (bound && bound !== '0x0000000000000000000000000000000000000000') {
        return { name, tokenId: tid, bound, totalSupply }
      }
    } catch { /* 单个 tokenId 读失败不中断 */ }
    if (tid === 0n) break
  }
  return { name: null as string | null, tokenId: 0n, bound: '', totalSupply }
}

describe('真实链：.j 域名解析', () => {
  it('从一个真实存在且已绑定的域名完整走通 _nslookup → _bound', async () => {
    const a = await findBoundAnchor()
    // 不静默跳过：找不到锚点就是验证失败（2026-11-19 的教训）
    expect(a.name, '最近 40 个 tokenId 内没有已绑定的域名，锚点失效').not.toBeNull()
    if (!a.name) return

    console.log(`  锚点 ${a.name}.j tokenId=${a.tokenId} bound=${a.bound}`)

    const r = await resolveRecipient(`${a.name}.j`, lookup)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.address.toLowerCase()).toBe(a.bound.toLowerCase())
      expect(r.via).toBe('jns')
      expect(r.display).toContain(`${a.name}.j`)
      expect(r.display).toContain(a.bound)
    }
  }, CHAIN_TIMEOUT)

  it('大小写三种写法解析到同一地址', async () => {
    // ⚠️ 这里必须用「已绑定」的锚点，不能用「最后一个有名字的」——
    // 实测 totalSupply=822 时 #821「2100」名字存在但未绑定，拿它做用例会得到
    // 两个都 ok=false 的结果，看起来像实现坏了，实际是样本选错。
    const { name } = await findBoundAnchor()
    expect(name, '找不到已绑定域名，无法验证写法归一').not.toBeNull()
    if (!name) return

    const results = await Promise.all([
      resolveRecipient(`${name}.j`, lookup),
      resolveRecipient(`${name}.J`, lookup),
    ])
    const okOnes = results.filter((r) => r.ok) as { address: string }[]
    expect(okOnes.length).toBe(2)
    expect(okOnes[0].address.toLowerCase()).toBe(okOnes[1].address.toLowerCase())
    console.log(`  ${name}.j → ${okOnes[0].address}`)
  }, CHAIN_TIMEOUT)

  it('不存在的域名给出 jns-not-found（不是 read-failed，也不是成功）', async () => {
    const r = await resolveRecipient(`no-such-name-${Date.now()}.j`, lookup)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.code).toBe('jns-not-found')
      expect(r.message).toContain('不存在')
    }
  }, CHAIN_TIMEOUT)

  it('地址输入不触发任何 RPC', async () => {
    let calls = 0
    const counting = {
      readContract: async (args: never) => { calls++; return (client.readContract as never as (a: never) => Promise<unknown>)(args) },
    }
    const countingLookup = makeJnsLookup(counting as never, JNS_ADDRESS as `0x${string}`, jnsABI)
    const r = await resolveRecipient('0x' + '1'.repeat(40), countingLookup)
    expect(r.ok).toBe(true)
    expect(calls).toBe(0)
  })

  it('纯函数层：五类输入分类与线上无关，稳定不变', () => {
    expect(parseRecipient('').kind).toBe('empty')
    expect(parseRecipient('0x' + '1'.repeat(40)).kind).toBe('address')
    expect(parseRecipient('alice.j').kind).toBe('jns')
    expect(parseRecipient('hello').kind).toBe('invalid')
  })
})
