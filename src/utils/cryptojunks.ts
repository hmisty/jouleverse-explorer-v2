// CryptoJunks 装饰解析：金标（golden）+ 稀有度标记（legend / rare / precious）
//
// v1 依据 `addressInfoController.js:998-1020`：
//   const is_golden = golden_idx['golden']      // 长度 10000 的 0/1 数组，按 tokenId 索引
//   const legend_idx = golden_idx['alien']      // tokenId 列表 → 👑
//   const rare_idx   = golden_idx['ape']        // tokenId 列表 → 💎
//   const precious_idx = golden_idx['zombie']   // tokenId 列表 → 🌟
// 命中优先级：legend → rare → precious（v1 是 else-if 链，一个 token 只出一种标记）
//
// ⚠️ 三处不能照抄 v1 的地方，都不是风格问题：
//   1. **golden 是「数组按下标」不是「字典按 id」**：v1 写 `is_golden[token_id] == '1'`，
//      既是数组下标又是一次隐式字符串比较。JS 里 `is_golden[10000] == '1'` 返回 false（越界得 undefined），
//      看似没问题；但如果照抄成 Map<字符串→值> 就会在 id 有前导零时静默错位。
//      这里显式做「数组 + 数字下标 + 越界即 false」。
//   2. **v1 在 golden_idx.json 拉取失败时不标记任何装饰**（`getAllCryptoJunks(undefined)`），
//      而装饰缺省的 UI 与「这枚确实不是金标」长得完全一样。这里保留同样的降级行为
//      （不因此报错，因为 junks 本身还能显示），但把「参照表未加载」这一事实暴露给调用方，
//      避免用户以为「我抽到的都不是金标」。
//   3. **稀有度只看静态参照表，不看链上**：v1 也是如此（表是 10000 枚铭刻完毕后冻结的），
//      所以本地参照表与链上 tokenId 一致即可，不需要读任何合约。

/** v1 `scripts/misc/punks/golden_idx.json` 的结构 */
export interface JunkReference {
  /** 长度应为 10000，1=金标，0=非金标 */
  golden?: unknown
  /** 传说级 tokenId 列表（👑） */
  alien?: unknown
  /** 稀有级 tokenId 列表（💎） */
  ape?: unknown
  /** 珍贵级 tokenId 列表（🌟） */
  zombie?: unknown
}

export type JunkRarity = 'legend' | 'rare' | 'precious' | 'normal'

export interface JunkDecoration {
  /** 金标：参照表 golden[tokenId] === 1 */
  golden: boolean
  /** 稀有度（legend > rare > precious > normal，与 v1 else-if 顺序一致） */
  rarity: JunkRarity
}

/** 稀有度标记 → 展示符号（与 v1 模板一致） */
export const RARITY_EMOJI: Record<JunkRarity, string> = {
  legend: '👑',
  rare: '💎',
  precious: '🌟',
  normal: '',
}

/** 稀有度中文名（用于 title / aria-label，不占用视觉空间） */
export const RARITY_LABEL: Record<JunkRarity, string> = {
  legend: '传说',
  rare: '稀有',
  precious: '珍贵',
  normal: '普通',
}

/** golden 数组的期望长度（v1 全量铭刻完毕后固定为 10000） */
export const JUNK_TOTAL_SUPPLY = 10000

/** 把 unknown 收窄成 tokenId 数字数组；含非整数项时整体丢弃（不猜） */
function toIdSet(v: unknown): Set<number> | null {
  if (!Array.isArray(v)) return null
  const out = new Set<number>()
  for (const x of v) {
    if (typeof x !== 'number' || !Number.isInteger(x)) return null
    out.add(x)
  }
  return out
}

/**
 * 解析参照表。返回 null 表示「表不可用」——调用方应把装饰全部当作未知，
 * 而不是当作「全部非金标普通」。
 */
export function parseJunkReference(raw: unknown): JunkReference | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  return raw as JunkReference
}

/**
 * 取某一 tokenId 的装饰。
 *
 * @param ref 参照表（parseJunkReference 的产物；null/结构不对 → 全部降级为 false/normal）
 * @param tokenId 链上 tokenId
 */
export function decorateJunk(ref: JunkReference | null, tokenId: number): JunkDecoration {
  if (!Number.isInteger(tokenId) || tokenId < 0) {
    return { golden: false, rarity: 'normal' }
  }
  if (!ref) return { golden: false, rarity: 'normal' }

  // ① 金标：golden 是数组，按下标取；越界/类型不对一律 false（不猜成 true）
  let golden = false
  const g = ref.golden
  if (Array.isArray(g)) {
    const v = g[tokenId]
    // v1 是 `== '1'`，同时接受 1 与 '1'；这里显式两种都收，与 v1 行为等价
    golden = v === 1 || v === '1'
  }

  // ② 稀有度：legend → rare → precious，命中一个即止（v1 是 else-if 链）
  const legend = toIdSet(ref.alien)
  const rare = toIdSet(ref.ape)
  const precious = toIdSet(ref.zombie)
  let rarity: JunkRarity = 'normal'
  if (legend?.has(tokenId)) rarity = 'legend'
  else if (rare?.has(tokenId)) rarity = 'rare'
  else if (precious?.has(tokenId)) rarity = 'precious'

  return { golden, rarity }
}

/** v1 跳转路径：`/#/cryptojunks/page/{pageId}/id/{id}`，pageId = floor(id / 100) */
export function junkPageId(tokenId: number): number {
  return Math.floor(tokenId / 100)
}
