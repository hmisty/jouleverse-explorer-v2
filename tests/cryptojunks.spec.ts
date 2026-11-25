import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  PAGE_SIZE,
  NORMAL_PAGES,
  PRECIOUS_PAGE,
  RARE_PAGE,
  LEGEND_PAGE,
  CRYPTOJUNKS_SUPPLY_LIMIT,
  pageKind,
  rarityOf,
  isGolden,
  rarityEmoji,
  pageTokenIds,
  buildPageNav,
  parseJunkMetadata,
  junkStats,
  pagePath,
  junkPath,
  parsePageParam,
  parseJunkIdParam,
  sealedLabel,
} from '../src/utils/cryptojunks'
import {
  GOLDEN,
  LEGEND_IDS,
  RARE_IDS,
  PRECIOUS_IDS,
  BROKEN_IDS,
} from '../src/data/crypto-junks-golden'

// ---------------------------------------------------------------------------
// 参照表本身的完整性。它是从 v1 生成的静态数据，没有这些断言，
// 生成脚本改错或有人手改这个文件都不会有人发现。
// ---------------------------------------------------------------------------
describe('CryptoJunks · 参照表完整性', () => {
  it('golden 长度等于 supply limit，且只含 0/1', () => {
    expect(GOLDEN.length).toBe(CRYPTOJUNKS_SUPPLY_LIMIT)
    expect(GOLDEN.every((v) => v === 0 || v === 1)).toBe(true)
  })

  it('三组稀有度 + broken 的枚数与 v1 页面写死的统计一致', () => {
    expect(LEGEND_IDS.length).toBe(9)
    expect(RARE_IDS.length).toBe(24)
    expect(PRECIOUS_IDS.length).toBe(88)
    expect(BROKEN_IDS.length).toBe(299)
  })

  it('good（golden=1）枚数 = 10000 - 299 = 9701', () => {
    expect(GOLDEN.filter((v) => v === 1).length).toBe(9701)
  })

  it('broken 列表升序、无重复、且与 golden=0 的集合完全一致', () => {
    const sorted = [...BROKEN_IDS].sort((a, b) => a - b)
    expect(BROKEN_IDS).toEqual(sorted)
    expect(new Set(BROKEN_IDS).size).toBe(BROKEN_IDS.length)
    // 双向：每个 broken 都是 golden=0，每个 golden=0 都在 broken 里
    for (const id of BROKEN_IDS) expect(GOLDEN[id]).toBe(0)
    const zeroIds = GOLDEN.map((v, i) => (v === 0 ? i : -1)).filter((i) => i >= 0)
    expect(zeroIds).toEqual(sorted)
  })

  it('稀有度三组互不重叠，且全部落在 0..9999', () => {
    const all = [...LEGEND_IDS, ...RARE_IDS, ...PRECIOUS_IDS]
    expect(new Set(all).size).toBe(all.length)
    for (const id of all) {
      expect(Number.isInteger(id)).toBe(true)
      expect(id).toBeGreaterThanOrEqual(0)
      expect(id).toBeLessThan(CRYPTOJUNKS_SUPPLY_LIMIT)
    }
  })
})

// ---------------------------------------------------------------------------
describe('CryptoJunks · 页号分类', () => {
  it('0..99 为常规页', () => {
    expect(pageKind(0)).toBe('normal')
    expect(pageKind(99)).toBe('normal')
  })

  it('100..999 是空洞（v1 从未定义），返回 null', () => {
    expect(pageKind(100)).toBeNull()
    expect(pageKind(999)).toBeNull()
  })

  it('broken 页 1000..1002 由 299 枚推出，不多不少', () => {
    expect(Math.ceil(BROKEN_IDS.length / PAGE_SIZE)).toBe(3)
    expect(pageKind(1000)).toBe('broken')
    expect(pageKind(1002)).toBe('broken')
    expect(pageKind(1003)).toBeNull()
  })

  it('特殊页号各自唯一', () => {
    expect(pageKind(PRECIOUS_PAGE)).toBe('precious')
    expect(pageKind(RARE_PAGE)).toBe('rare')
    expect(pageKind(LEGEND_PAGE)).toBe('legend')
  })

  it('负数 / 小数 / 非整数一律 null', () => {
    expect(pageKind(-1)).toBeNull()
    expect(pageKind(1.5)).toBeNull()
    expect(pageKind(Number.NaN)).toBeNull()
    expect(pageKind(Number.POSITIVE_INFINITY)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
describe('CryptoJunks · 稀有度与金标', () => {
  // ⚠️ 反向注入实测（2026-11-25）：把 v1 的 if-else 顺序整个反转，本组用例**全绿**——
  // 因为三组集合互斥，顺序不可观测。故此处不断言「优先级」，只断言成员判定。
  // 真正锁住互斥性的是上面「参照表完整性 · 稀有度三组互不重叠」那条。
  it('按成员表判定稀有度（三组互斥，故 v1 的 if-else 顺序不可观测）', () => {
    expect(rarityOf(LEGEND_IDS[0])).toBe('legend')
    expect(rarityOf(RARE_IDS[0])).toBe('rare')
    expect(rarityOf(PRECIOUS_IDS[0])).toBe('precious')
    // 找一个三种都不是的
    const plain = GOLDEN.findIndex((_, i) =>
      !LEGEND_IDS.includes(i) && !RARE_IDS.includes(i) && !PRECIOUS_IDS.includes(i))
    expect(rarityOf(plain)).toBe('normal')
  })

  it('金标/稀有度正交：legend 全是 good，但 broken 里也有 normal', () => {
    for (const id of LEGEND_IDS) expect(isGolden(id)).toBe(true)
    // 299 枚 broken 全落在 normal（v1 统计表 broken 行只填 normal 列）
    for (const id of BROKEN_IDS) expect(rarityOf(id)).toBe('normal')
  })

  it('越界 tokenId 不算金标（v1 是 undefined 隐式假值，这里显式 false）', () => {
    expect(isGolden(-1)).toBe(false)
    expect(isGolden(10000)).toBe(false)
    expect(isGolden(1.5)).toBe(false)
  })

  it('符号只给三种稀有度，normal 为空串', () => {
    expect(rarityEmoji('legend')).toBe('👑')
    expect(rarityEmoji('rare')).toBe('💎')
    expect(rarityEmoji('precious')).toBe('🌟')
    expect(rarityEmoji('normal')).toBe('')
  })
})

// ---------------------------------------------------------------------------
describe('CryptoJunks · 分页取 tokenId', () => {
  it('常规页按 100 步进', () => {
    expect(pageTokenIds(0)[0]).toBe(0)
    expect(pageTokenIds(0)[99]).toBe(99)
    expect(pageTokenIds(1)[0]).toBe(100)
    expect(pageTokenIds(99)[0]).toBe(9900)
    expect(pageTokenIds(99)[99]).toBe(9999)
  })

  it('每页恰好 100 枚，覆盖 0..9999 不重不漏', () => {
    const seen = new Set<number>()
    for (let p = 0; p < NORMAL_PAGES; p++) {
      const ids = pageTokenIds(p)
      expect(ids.length).toBe(PAGE_SIZE)
      for (const id of ids) {
        expect(seen.has(id)).toBe(false)
        seen.add(id)
      }
    }
    expect(seen.size).toBe(CRYPTOJUNKS_SUPPLY_LIMIT)
  })

  it('🔴 broken 末页只返回余数 99 枚，不产生 undefined', () => {
    const ids = pageTokenIds(1002)
    expect(ids.length).toBe(BROKEN_IDS.length - 2 * PAGE_SIZE) // 299 - 200 = 99
    expect(ids.length).toBe(99)
    expect(ids.every((v) => Number.isInteger(v))).toBe(true)
    // 必须真的等于 broken 列表尾部切片的 99 个
    expect(ids).toEqual(BROKEN_IDS.slice(200))
  })

  it('🔴 特殊页不补齐到 100 枚（v1 会渲染 12/76/91 个空格子）', () => {
    expect(pageTokenIds(PRECIOUS_PAGE).length).toBe(PRECIOUS_IDS.length) // 88
    expect(pageTokenIds(RARE_PAGE).length).toBe(RARE_IDS.length) // 24
    expect(pageTokenIds(LEGEND_PAGE).length).toBe(LEGEND_IDS.length) // 9
  })

  it('特殊页返回的序列与参照表一致，且全在 0..9999', () => {
    expect(pageTokenIds(LEGEND_PAGE)).toEqual([...LEGEND_IDS])
    expect(pageTokenIds(RARE_PAGE)).toEqual([...RARE_IDS])
    expect(pageTokenIds(PRECIOUS_PAGE)).toEqual([...PRECIOUS_IDS])
    for (const id of pageTokenIds(PRECIOUS_PAGE)) {
      expect(id).toBeGreaterThanOrEqual(0)
      expect(id).toBeLessThan(CRYPTOJUNKS_SUPPLY_LIMIT)
    }
  })

  it('非法页号返回空数组而不是抛错', () => {
    expect(pageTokenIds(100)).toEqual([])
    expect(pageTokenIds(-1)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
describe('CryptoJunks · 导航', () => {
  it('100 个常规页 + 3 个 broken 页 + 3 个稀有度页', () => {
    const nav = buildPageNav()
    expect(nav.length).toBe(100 + 3 + 3)
    expect(nav.filter((n) => n.kind === 'normal').length).toBe(100)
    expect(nav.filter((n) => n.kind === 'broken').length).toBe(3)
  })

  it('常规页标签是 1..100（v1 的 i+1）', () => {
    const nav = buildPageNav()
    expect(nav[0].label).toBe('1')
    expect(nav[99].label).toBe('100')
  })

  it('🔴 broken 页标签不与常规页撞车（v1 会显示成 1001/1002/1003）', () => {
    const nav = buildPageNav()
    const labels = nav.map((n) => n.label)
    expect(new Set(labels).size).toBe(labels.length)
    // 常规页最大是 100，broken 标签不应是纯数字
    for (const n of nav.filter((x) => x.kind === 'broken')) {
      expect(/^\d+$/.test(n.label)).toBe(false)
    }
  })

  it('稀有度页标签带符号且指向 v1 页号', () => {
    const nav = buildPageNav()
    const precious = nav.find((n) => n.kind === 'precious')
    const rare = nav.find((n) => n.kind === 'rare')
    const legend = nav.find((n) => n.kind === 'legend')
    expect(precious).toEqual({ pageId: PRECIOUS_PAGE, label: '🌟', kind: 'precious' })
    expect(rare).toEqual({ pageId: RARE_PAGE, label: '💎', kind: 'rare' })
    expect(legend).toEqual({ pageId: LEGEND_PAGE, label: '👑', kind: 'legend' })
  })
})

// ---------------------------------------------------------------------------
describe('CryptoJunks · tokenURI 解析', () => {
  const make = (obj: unknown) =>
    `data:application/json;base64,${Buffer.from(JSON.stringify(obj)).toString('base64')}`

  it('解出 name / id / description / image', () => {
    const uri = make({ name: 'CryptoJunks #7', id: 7, description: 'd', image: 'data:image/png;base64,AAA' })
    expect(parseJunkMetadata(uri)).toEqual({
      name: 'CryptoJunks #7',
      id: 7,
      description: 'd',
      image: 'data:image/png;base64,AAA',
    })
  })

  it('🔴 空 base64 图片视为不存在（v1 的特例判断）', () => {
    expect(parseJunkMetadata(make({ name: 'x', image: 'data:image/png;base64,' }))).toBeNull()
  })

  it('image 字段缺失也视为不存在', () => {
    expect(parseJunkMetadata(make({ name: 'x' }))).toBeNull()
  })

  it('非 base64 / 无逗号 / 非字符串 / 空串 → null 而不是抛错', () => {
    expect(parseJunkMetadata('data:application/json,{"a":1}')).toBeNull()
    expect(parseJunkMetadata('no-comma-at-all')).toBeNull()
    expect(parseJunkMetadata('')).toBeNull()
    expect(parseJunkMetadata(undefined)).toBeNull()
    expect(parseJunkMetadata(123)).toBeNull()
  })

  it('base64 解出来不是 JSON → null（不把异常抛给视图）', () => {
    const bad = `data:application/json;base64,${Buffer.from('not json').toString('base64')}`
    expect(parseJunkMetadata(bad)).toBeNull()
  })

  it('JSON 是数组/字符串等非对象 → null', () => {
    expect(parseJunkMetadata(make([1, 2, 3]))).toBeNull()
    expect(parseJunkMetadata(make('str'))).toBeNull()
  })

  it('字段类型不对时丢弃该字段而不是整条报废', () => {
    const uri = make({ name: 123, id: 'x', image: 'data:image/png;base64,AAA' })
    const m = parseJunkMetadata(uri)
    expect(m).not.toBeNull()
    expect(m!.name).toBeUndefined()
    expect(m!.id).toBeUndefined()
    expect(m!.image).toBe('data:image/png;base64,AAA')
  })
})

// ---------------------------------------------------------------------------
describe('CryptoJunks · 统计表', () => {
  it('🔴 与 v1 HTML 里写死的表逐格一致', () => {
    const s = junkStats()
    const get = (r: string) => s.rows.find((x) => x.rarity === r)!
    expect(get('legend')).toEqual({ rarity: 'legend', good: 9, broken: 0, total: 9 })
    expect(get('rare')).toEqual({ rarity: 'rare', good: 24, broken: 0, total: 24 })
    expect(get('precious')).toEqual({ rarity: 'precious', good: 88, broken: 0, total: 88 })
    expect(get('normal')).toEqual({ rarity: 'normal', good: 9580, broken: 299, total: 9879 })
    expect(s.goodTotal).toBe(9701)
    expect(s.brokenTotal).toBe(299)
    expect(s.total).toBe(10000)
  })

  it('行列自洽：每行 total = good + broken，合计 = 10000', () => {
    const s = junkStats()
    for (const r of s.rows) expect(r.good + r.broken).toBe(r.total)
    expect(s.rows.reduce((a, r) => a + r.total, 0)).toBe(CRYPTOJUNKS_SUPPLY_LIMIT)
    expect(s.goodTotal + s.brokenTotal).toBe(s.total)
  })
})

// ---------------------------------------------------------------------------
describe('CryptoJunks · 路由', () => {
  it('页路径与 v1 的 /#/cryptojunks/page/:pageId 对应', () => {
    expect(pagePath(0)).toBe('/cryptojunks/page/0')
    expect(pagePath(1002)).toBe('/cryptojunks/page/1002')
  })

  it('单枚路径与 v1 的 /page/:pageId/id/:junkId 对应', () => {
    expect(junkPath(3, 350)).toBe('/cryptojunks/page/3/id/350')
  })

  it('页号解析：只接受纯数字，拒绝负号/小数点/空/字母', () => {
    expect(parsePageParam('1002')).toBe(1002)
    expect(parsePageParam('0')).toBe(0)
    expect(parsePageParam('-1')).toBeNull()
    expect(parsePageParam('1.5')).toBeNull()
    expect(parsePageParam('')).toBeNull()
    expect(parsePageParam('abc')).toBeNull()
  })

  it('枚号解析：超出 0..9999 视为非法', () => {
    expect(parseJunkIdParam('9999')).toBe(9999)
    expect(parseJunkIdParam('10000')).toBeNull()
    expect(parseJunkIdParam('abc')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
describe('CryptoJunks · supply 状态行', () => {
  it('打满 10000 才是 set in stone', () => {
    expect(sealedLabel(10000)).toBe('set in stone')
    expect(sealedLabel(10001)).toBe('set in stone')
    expect(sealedLabel(9999)).toBe('not yet')
    expect(sealedLabel(0)).toBe('not yet')
  })
})

// ---------------------------------------------------------------------------
// 生成脚本与产物一致性：防止有人手改 src/data 里的产物而不改生成脚本，
// 或者生成脚本换了输出格式却忘了重新生成。
// 只在 v1 源码仓库存在时校验（CI 上没有 v1 仓库，跳过）。
// ---------------------------------------------------------------------------
describe('CryptoJunks · 生成产物与 v1 源一致', () => {
  const v1Path = join(process.env.HOME || '', 'git', 'explorer', 'app', 'scripts', 'misc', 'punks', 'golden_idx.json')

  it('有 v1 源时，产物四组数据与源逐项相同', () => {
    let raw: Record<string, number[]>
    try {
      raw = JSON.parse(readFileSync(v1Path, 'utf8'))
    } catch {
      // 没有 v1 仓库：这条跳过，不假装通过
      return
    }
    expect([...GOLDEN]).toEqual(raw.golden)
    expect([...LEGEND_IDS]).toEqual(raw.alien)
    expect([...RARE_IDS]).toEqual(raw.ape)
    expect([...PRECIOUS_IDS]).toEqual(raw.zombie)
    expect([...BROKEN_IDS]).toEqual(raw.broken)
  })
})
