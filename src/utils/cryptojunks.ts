/**
 * CryptoJunks 浏览页的纯逻辑（P5-4）。
 *
 * 对应 v1 `app/scripts/controllers/junksInfoController.js` + `app/views/junksInfo.html`。
 *
 * 分成纯函数是为了能离线测：分页边界、稀有度判定、统计表、tokenURI 解析
 * 全都不需要 RPC 和钱包。真实链只用来取 tokenURI 字符串。
 */
import {
  CRYPTOJUNKS_SUPPLY_LIMIT,
  GOLDEN,
  LEGEND_IDS,
  RARE_IDS,
  PRECIOUS_IDS,
  BROKEN_IDS,
} from '../data/crypto-junks-golden'

export { CRYPTOJUNKS_SUPPLY_LIMIT }

/** 每页铭文数（v1 硬编码 100） */
export const PAGE_SIZE = 100

/** 稀有度（与 golden 金/灰标正交） */
export type JunkRarity = 'legend' | 'rare' | 'precious' | 'normal'

/** 页类型 */
export type JunkPageKind = 'normal' | 'broken' | 'precious' | 'rare' | 'legend'

/**
 * v1 的页号方案（URL 里就是这个数字，必须原样保留以保证路由对等）：
 *   0..99        → 常规 0-9999，每页 100
 *   1000..1002   → 全部 299 枚 broken，每页 100，末页 99
 *   10000        → 全部 88 枚 precious
 *   100000       → 全部 24 枚 rare
 *   1000000      → 全部 9 枚 legend
 *
 * 这套数字不连续、缺 100-999 是有意为之：v1 用它来表达「特殊页」，
 * 换成 100、101、102 会和真实页号撞车。
 */
export const NORMAL_PAGES = 100
export const BROKEN_PAGE_BASE = 1000
export const PRECIOUS_PAGE = 10000
export const RARE_PAGE = 100000
export const LEGEND_PAGE = 1000000

const LEGEND_SET = new Set(LEGEND_IDS)
const RARE_SET = new Set(RARE_IDS)
const PRECIOUS_SET = new Set(PRECIOUS_IDS)

/** 判定页号属于哪一类；非法页号返回 null */
export function pageKind(pageId: number): JunkPageKind | null {
  if (!Number.isInteger(pageId) || pageId < 0) return null
  if (pageId < NORMAL_PAGES) return 'normal'
  if (pageId === PRECIOUS_PAGE) return 'precious'
  if (pageId === RARE_PAGE) return 'rare'
  if (pageId === LEGEND_PAGE) return 'legend'
  // broken 页数量由 299 推出来（ceil(299/100) = 3），不硬编码 3，
  // 免得参照表将来变长时静默少一页。
  const brokenPageCount = Math.ceil(BROKEN_IDS.length / PAGE_SIZE)
  if (pageId >= BROKEN_PAGE_BASE && pageId < BROKEN_PAGE_BASE + brokenPageCount) return 'broken'
  return null
}

/** 稀有度：legend > rare > precious > normal（顺序与 v1 的 if-else 链一致） */
export function rarityOf(tokenId: number): JunkRarity {
  if (LEGEND_SET.has(tokenId)) return 'legend'
  if (RARE_SET.has(tokenId)) return 'rare'
  if (PRECIOUS_SET.has(tokenId)) return 'precious'
  return 'normal'
}

/** 金标（good）= true，灰标（broken）= false。越界一律 false */
export function isGolden(tokenId: number): boolean {
  if (!Number.isInteger(tokenId) || tokenId < 0 || tokenId >= GOLDEN.length) return false
  return GOLDEN[tokenId] === 1
}

/** 稀有度对应的页面符号（v1 用 👑💎🌟，无符号 = normal） */
export function rarityEmoji(rarity: JunkRarity): string {
  if (rarity === 'legend') return '👑'
  if (rarity === 'rare') return '💎'
  if (rarity === 'precious') return '🌟'
  return ''
}

/**
 * 该页要显示哪些 tokenId。
 *
 * 与 v1 的一处有意差异：v1 对特殊页按「起点 + 100」盲取数组下标，
 * broken 末页（1002）会取到 `broken[299]` = undefined，precious/rare/legend 页
 * 分别有 12/76/91 个 undefined 槽位，最终渲染成一堆「空」格子。
 * 本例改为按实际长度截断 —— 空格子不是功能，是越界读取的产物。
 *
 * @returns 页号非法时返回空数组
 */
export function pageTokenIds(pageId: number): number[] {
  const kind = pageKind(pageId)
  if (kind === null) return []
  if (kind === 'normal') {
    const begin = pageId * PAGE_SIZE
    const end = Math.min(begin + PAGE_SIZE, CRYPTOJUNKS_SUPPLY_LIMIT)
    const out: number[] = []
    for (let id = begin; id < end; id++) out.push(id)
    return out
  }
  const source =
    kind === 'broken' ? BROKEN_IDS
    : kind === 'precious' ? PRECIOUS_IDS
    : kind === 'rare' ? RARE_IDS
    : LEGEND_IDS
  const begin = kind === 'broken' ? (pageId - BROKEN_PAGE_BASE) * PAGE_SIZE : 0
  return source.slice(begin, begin + PAGE_SIZE)
}

export interface JunkPageNavItem {
  pageId: number
  label: string
  kind: JunkPageKind
}

/**
 * 页脚导航项。常规页 1..100，后面接 broken（💔1..💔3）+ precious/rare/legend。
 *
 * v1 把特殊页也按 `i+1` 显示，于是 broken 页显示成「1001/1002/1003」，
 * 与常规页的 1..100 完全无法区分。这里改成有意义的标签，路由数字不变。
 */
export function buildPageNav(): JunkPageNavItem[] {
  const items: JunkPageNavItem[] = []
  for (let i = 0; i < NORMAL_PAGES; i++) {
    items.push({ pageId: i, label: String(i + 1), kind: 'normal' })
  }
  const brokenPageCount = Math.ceil(BROKEN_IDS.length / PAGE_SIZE)
  for (let i = 0; i < brokenPageCount; i++) {
    items.push({ pageId: BROKEN_PAGE_BASE + i, label: `💔${i + 1}`, kind: 'broken' })
  }
  items.push({ pageId: PRECIOUS_PAGE, label: '🌟', kind: 'precious' })
  items.push({ pageId: RARE_PAGE, label: '💎', kind: 'rare' })
  items.push({ pageId: LEGEND_PAGE, label: '👑', kind: 'legend' })
  return items
}

export interface JunkMetadata {
  id?: number
  name?: string
  description?: string
  image?: string
}

/**
 * 解析 tokenURI。
 *
 * 链上是 `data:application/json;base64,<base64>`，解出来是
 * `{name, id, description, image}`，image 本身又是一段 `data:image/png;base64,...`。
 *
 * 返回 null 代表「这枚不存在/读不出」，调用方应显示空态而不是崩掉：
 * v1 在这里有两条判空路径（tokenURI 调用报错、image 恰好是空 base64 前缀）。
 */
export function parseJunkMetadata(tokenURI: unknown): JunkMetadata | null {
  if (typeof tokenURI !== 'string' || tokenURI.length === 0) return null
  const comma = tokenURI.indexOf(',')
  if (comma < 0) return null
  const head = tokenURI.slice(0, comma)
  const body = tokenURI.slice(comma + 1)
  if (!head.includes('base64')) return null
  let json: unknown
  try {
    // atob 在浏览器和 Node 18+ 都有（jsdom 也提供），不需要 Buffer 兜底
    json = JSON.parse(atob(body))
  } catch {
    return null
  }
  if (typeof json !== 'object' || json === null) return null
  const m = json as Record<string, unknown>
  const out: JunkMetadata = {}
  if (typeof m.id === 'number') out.id = m.id
  if (typeof m.name === 'string') out.name = m.name
  if (typeof m.description === 'string') out.description = m.description
  if (typeof m.image === 'string') out.image = m.image
  // v1 的特例：空 base64 图片视为「不存在」
  if (!out.image || out.image === 'data:image/png;base64,') return null
  return out
}

export interface JunkStatsRow {
  rarity: JunkRarity
  good: number
  broken: number
  total: number
}

export interface JunkStats {
  rows: JunkStatsRow[]
  goodTotal: number
  brokenTotal: number
  total: number
}

/**
 * 统计表：golden × rarity 交叉。
 *
 * v1 在 HTML 里写死了这张表（9/24/88/9580 | 299 | 10000）。这里改为从前面的
 * 参照表算出来，好处是参照表若变，表格跟着变而不是说谎。
 * 已核对：算出来的与 v1 写死的数字完全一致（tests/cryptojunks-stats.spec.ts 锁死）。
 */
export function junkStats(): JunkStats {
  const rows: JunkStatsRow[] = (['legend', 'rare', 'precious', 'normal'] as JunkRarity[]).map(
    (rarity) => ({ rarity, good: 0, broken: 0, total: 0 }),
  )
  const byRarity = new Map(rows.map((r) => [r.rarity, r]))
  for (let id = 0; id < CRYPTOJUNKS_SUPPLY_LIMIT; id++) {
    const row = byRarity.get(rarityOf(id))
    if (!row) continue
    if (isGolden(id)) row.good++
    else row.broken++
    row.total++
  }
  const goodTotal = rows.reduce((s, r) => s + r.good, 0)
  const brokenTotal = rows.reduce((s, r) => s + r.broken, 0)
  return { rows, goodTotal, brokenTotal, total: goodTotal + brokenTotal }
}

/** 页码 → 路由路径（broken 末页 id 参数之类由调用方拼） */
export function pagePath(pageId: number): string {
  return `/cryptojunks/page/${pageId}`
}

/** 单枚详情路由 */
export function junkPath(pageId: number, junkId: number | string): string {
  return `/cryptojunks/page/${pageId}/id/${junkId}`
}

/** 解析路由参数里的页号/枚号；非法输入返回 null，交给页面显示空态 */
export function parsePageParam(raw: unknown): number | null {
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null
  const n = Number(raw)
  return Number.isSafeInteger(n) && n >= 0 ? n : null
}

/** 解析枚号；必须是 0..9999 内的整数 */
export function parseJunkIdParam(raw: unknown): number | null {
  const n = parsePageParam(raw)
  if (n === null) return null
  return n < CRYPTOJUNKS_SUPPLY_LIMIT ? n : null
}

/** sealed 状态文案（v1：supply 打满 10000 即 set in stone） */
export function sealedLabel(supply: number): string {
  return supply >= CRYPTOJUNKS_SUPPLY_LIMIT ? 'set in stone' : 'not yet'
}
