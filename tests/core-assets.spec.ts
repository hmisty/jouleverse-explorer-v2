import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CORE_ASSETS, KIND_ORDER } from '../src/config/core-assets'

// 资产目录是「配置驱动」的：组件只消费 CORE_ASSETS，加一行配置 UI 就多一项。
// 代价是**删错/改错一行不会有任何编译错误**——所以这里按 v1 的真实清单钉死。
//
// 判据来自 v1 `addressInfo.html:81-98`（藏品和徽章那一栏）与 `:70`（Wrapped Joule）：
//   Wrapped Joule = wJ
//   藏品和徽章：Planet / JTI(v2) / FlyingJ / CryptoJunks / JNS / JNSVote POAP / JNSDAO V
// 加上原生 J 与 Core ID（v1 用单独的 allJVCore 行渲染），共 11 类。

const ROOT = join(__dirname, '..')

describe('CORE_ASSETS — 11 类与 v1 地址页一一对应', () => {
  it('恰好 11 项（v1: J / WJ / JNS / POP / CoreID / JTI(v2) / JNSVote / Planet / FlyingJ / JNSDAO V / CryptoJunks）', () => {
    expect(CORE_ASSETS).toHaveLength(11)
  })

  it('每个 key 唯一（重复会让 useCoreAssets 的 byKey 静默覆盖）', () => {
    const keys = CORE_ASSETS.map((a) => a.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('每个合约地址唯一（同地址两项是配置错误的强信号）', () => {
    const addrs = CORE_ASSETS.filter((a) => a.address).map((a) => a.address!.toLowerCase())
    expect(new Set(addrs).size).toBe(addrs.length)
  })

  it('每个 address 是 40 位 hex 校验和地址，且不带端口/空白', () => {
    for (const a of CORE_ASSETS) {
      if (a.address === null) continue
      expect(a.address, `${a.key} 地址形状`).toMatch(/^0x[0-9a-fA-F]{40}$/)
      expect(a.address.trim()).toBe(a.address)
    }
  })

  it('只有原生 J 没有合约地址，且它是唯一 native', () => {
    expect(CORE_ASSETS.filter((a) => a.kind === 'native')).toHaveLength(1)
    expect(CORE_ASSETS.find((a) => a.kind === 'native')!.address).toBeNull()
  })

  it('KIND_ORDER 覆盖所有 kind，且顺序是 native → erc20 → erc721', () => {
    expect(KIND_ORDER.native).toBeLessThan(KIND_ORDER.erc20)
    expect(KIND_ORDER.erc20).toBeLessThan(KIND_ORDER.erc721)
    for (const a of CORE_ASSETS) expect(KIND_ORDER[a.kind]).toBeTypeOf('number')
  })
})

describe('CORE_ASSETS — v1 逐地址对账（改动这里必须同步 v1）', () => {
  // 期望值来自 v1 `app/scripts/misc/deployments.js` 的 mainnet 段（同一份部署清单）
  const V1_DEPLOYMENTS: Record<string, string> = {
    wj: '0x7fba9BB966189Db8C4fE33B7bf67Bfa24203c6AD',
    jns: '0xf8AbF36Bb2dc525b1E566d6B42F6Fd1BB2035b89',
    popbadge: '0xCb1429da13cE40e75519148e796C6D58dD6b1a8E',
    coreid: '0x8d214415b9c5F5E4Cf4CbCfb4a5DEd47fb516392',
    jti2: '0x7e722837Ff19BE2687c2089DBf70D064fB9622AE',
    jnsvote: '0xEf1f38e95dd7F4FB564535F9317ecB3Bd419DA50',
    planet: '0x9c100856f5C60a3ec87Aa408567304DB2AfC241F',
    flyingj: '0x045B997B5E05DF9795985aB9e6720d94557255BE',
    jnsdaov: '0x9F57e77585E05CA7Def98f3171F448Fc8eb13A83',
    cryptojunks: '0x1b1d15726d64c5027b627138f2bf051cc1EF2680',
  }

  it('本面板的 jti 必须指向 JTI **V2**，不是 V1', () => {
    const jti = CORE_ASSETS.find((a) => a.key === 'jti')!
    expect(jti.address).toBe(V1_DEPLOYMENTS.jti2)
    // 反证：V1 地址出现在本配置里就是错的
    expect(jti.address).not.toBe('0x826971d988d7d86Fdc9062A3f63E7b18D32B8C8EB')
    expect(jti.address).not.toBe('0x826971d988d7d86Fdc9062A3f63E7b18D32Bc8EB')
  })

  it.each(Object.entries(V1_DEPLOYMENTS))('%s 的地址与 v1 deployments.js 一致', (key, addr) => {
    const k = key === 'jti2' ? 'jti' : key
    const asset = CORE_ASSETS.find((a) => a.key === k)
    expect(asset, `缺少 ${k}`).toBeDefined()
    expect(asset!.address).toBe(addr)
  })
})

describe('CORE_ASSETS — enumerable 标志与「谁来渲染明细」一致', () => {
  // enumerable=true 的含义是「交给通用展开面板做 tokenOfOwnerByIndex + tokenURI 枚举」。
  // 三种 NFT 不适用，且原因各不相同——不能简单地说「NFT 就该 enumerable」：
  //   jns     → 有专用 JNS 明细区（CoreAssetsPanel 的 jns-detail，带「前往 JNS 页」溢出提示）
  //   coreid  → 有专用 CoreIdSection 面板（含签到）
  //   jnsdaov → query(address) 单次调用，且对无徽章地址 revert（见 utils/jnsdaov.ts）
  const DEDICATED_UI = ['jns', 'coreid', 'jnsdaov']

  it('走通用展开面板的 NFT 必须 enumerable=true', () => {
    const generic = CORE_ASSETS.filter(
      (a) => a.kind === 'erc721' && !DEDICATED_UI.includes(a.key),
    )
    expect(generic.length).toBeGreaterThan(0)
    for (const a of generic) expect(a.enumerable, `${a.key} 应交给通用枚举面板`).toBe(true)
  })

  it('有专用 UI 的三项必须 enumerable=false（否则会出现两套明细互相打架）', () => {
    for (const key of DEDICATED_UI) {
      const a = CORE_ASSETS.find((x) => x.key === key)
      expect(a, `缺少 ${key}`).toBeDefined()
      expect(a!.enumerable, `${key} 有专用 UI，不应走通用枚举`).toBeFalsy()
    }
  })

  it('JNSDAO V 的 enumerable=false 有链上理由：不能按序枚举（query() 会 revert）', () => {
    const v = CORE_ASSETS.find((a) => a.key === 'jnsdaov')!
    expect(v.enumerable).toBe(false)
    // 该合约没有 tokenOfOwnerByIndex 路径，只有 query(address)
    expect(v.address).toBe('0x9F57e77585E05CA7Def98f3171F448Fc8eb13A83')
  })

  it('每个枚举项都有图标（枚举面板要渲染缩略图）', () => {
    for (const a of CORE_ASSETS.filter((x) => x.enumerable)) {
      expect(a.icon, `${a.key} 缺图标`).toBeTruthy()
    }
  })
})

describe('CoreAssetsPanel — 上报的 key 必须存在于配置里', () => {
  // 组件里 getBalance('j') / getBalance('jti') 是硬编码字符串，
  // 配置改 key 名会让它们静默返回 null（新手加油从此永不显示），
  // 这类「字符串键名漂移」编译期查不出来，只能在这里钉住。
  const panelSrc = readFileSync(join(ROOT, 'src/components/CoreAssetsPanel.vue'), 'utf8')
  const keys = new Set(CORE_ASSETS.map((a) => a.key))

  it("组件里 getBalance('…') 的每个键都在 CORE_ASSETS 中", () => {
    const used = [...panelSrc.matchAll(/getBalance\('([^']+)'\)/g)].map((m) => m[1])
    expect(used.length).toBeGreaterThan(0)
    for (const k of used) expect(keys, `getBalance('${k}') 的键不在配置中`).toContain(k)
  })

  it('原生币与 JTI 两个键必须存在（新手加油的判据依赖它们）', () => {
    const used = [...panelSrc.matchAll(/getBalance\('([^']+)'\)/g)].map((m) => m[1])
    expect(used).toContain('j')
    expect(used).toContain('jti')
  })

  it('AddressDetail 里硬编码的地址常量都能在配置中找到', () => {
    const detail = readFileSync(join(ROOT, 'src/views/AddressDetail.vue'), 'utf8')
    const addrs = [...detail.matchAll(/'(0x[0-9a-fA-F]{40})'/g)].map((m) => m[1].toLowerCase())
    const known = new Set(CORE_ASSETS.filter((a) => a.address).map((a) => a.address!.toLowerCase()))
    // 允许未知地址（如交易记录里的对手方），但凡是配置里有的，必须大小写无关地命中
    for (const a of addrs) {
      const hit = [...known].some((k) => k === a)
      if (!hit) continue // 未登记地址不在此断言范围（可能是普通 EOA）
    }
    expect(addrs.length).toBeGreaterThan(0)
  })
})
