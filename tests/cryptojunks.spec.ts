import { describe, expect, it } from 'vitest'
import {
  decorateJunk,
  junkPageId,
  parseJunkReference,
  RARITY_EMOJI,
  RARITY_LABEL,
  JUNK_TOTAL_SUPPLY,
} from '../src/utils/cryptojunks'

// 参照表结构来自 v1 `app/scripts/misc/punks/golden_idx.json`：
//   golden: 长度 10000 的 0/1 数组（按 tokenId 索引）
//   alien/ape/zombie: tokenId 列表（👑 / 💎 / 🌟）
// 判据来自 v1 `addressInfoController.js:998-1020` 的 else-if 链。

const REF = {
  golden: Array.from({ length: JUNK_TOTAL_SUPPLY }, (_, i) => (i === 7 || i === 5000 ? 1 : 0)),
  alien: [635, 2890],
  ape: [372, 1021],
  zombie: [117, 987],
}

describe('decorateJunk — 金标按下标取（v1 `is_golden[token_id] == 1`）', () => {
  it('golden[7] = 1 → 金标', () => {
    expect(decorateJunk(parseJunkReference(REF), 7).golden).toBe(true)
  })

  it('golden[8] = 0 → 非金标', () => {
    expect(decorateJunk(parseJunkReference(REF), 8).golden).toBe(false)
  })

  it('v1 写的是 `== "1"`，字符串 "1" 同样算金标（行为等价，不能只认数字）', () => {
    const ref = parseJunkReference({ ...REF, golden: { 7: '1' } as unknown })
    // golden 不是数组 → 一律 false（结构不对不猜）
    expect(decorateJunk(ref, 7).golden).toBe(false)
    const arrRef = parseJunkReference({ ...REF, golden: [0, 0, 0, 0, 0, 0, 0, '1'] })
    expect(decorateJunk(arrRef, 7).golden).toBe(true)
  })

  it('下标越界（tokenId ≥ golden.length）→ false，不抛错', () => {
    const shortRef = parseJunkReference({ ...REF, golden: [1, 0, 0] })
    expect(decorateJunk(shortRef, 9999).golden).toBe(false)
  })
})

describe('decorateJunk — 稀有度命中顺序与 v1 else-if 链一致', () => {
  it('alien 命中 → legend（👑）', () => {
    const d = decorateJunk(parseJunkReference(REF), 635)
    expect(d.rarity).toBe('legend')
    expect(RARITY_EMOJI[d.rarity]).toBe('👑')
  })

  it('ape 命中 → rare（💎），且不因为不在 alien 里就变 normal', () => {
    const d = decorateJunk(parseJunkReference(REF), 372)
    expect(d.rarity).toBe('rare')
    expect(RARITY_EMOJI[d.rarity]).toBe('💎')
  })

  it('zombie 命中 → precious（🌟）', () => {
    const d = decorateJunk(parseJunkReference(REF), 117)
    expect(d.rarity).toBe('precious')
    expect(RARITY_EMOJI[d.rarity]).toBe('🌟')
  })

  it('都不命中 → normal，且没有 emoji', () => {
    const d = decorateJunk(parseJunkReference(REF), 1)
    expect(d.rarity).toBe('normal')
    expect(RARITY_EMOJI[d.rarity]).toBe('')
    expect(RARITY_LABEL[d.rarity]).toBe('普通')
  })

  it('🔴 三表都命中时只出 legend（v1 是 else-if，不是叠加标记）', () => {
    const ref = parseJunkReference({ golden: [1], alien: [5], ape: [5], zombie: [5] })
    expect(decorateJunk(ref, 5).rarity).toBe('legend')
  })

  it('legend 优先级高于 rare：只出现在 ape 的下一个仍按自己的表走', () => {
    const ref = parseJunkReference({ golden: [], alien: [1], ape: [1, 2], zombie: [] })
    expect(decorateJunk(ref, 1).rarity).toBe('legend')
    expect(decorateJunk(ref, 2).rarity).toBe('rare')
  })
})

describe('decorateJunk — 参照表不可用时降级，而不是「全部普通」的假断言', () => {
  it('ref = null → golden false / rarity normal（不抛错，墙仍能显示图）', () => {
    expect(decorateJunk(null, 7)).toEqual({ golden: false, rarity: 'normal' })
  })

  it('golden 字段不是数组 → 一律非金标（结构不对不猜成 true）', () => {
    const ref = parseJunkReference({ golden: { 7: 1 } as unknown })
    expect(decorateJunk(ref, 7).golden).toBe(false)
  })

  it('稀有度列表含非整数项 → 该表整体丢弃，不部分生效', () => {
    // v1 的数据是整数数组；出现字符串/小数说明表坏了，
    // 「部分生效」会让某些 token 有标记、另一些没有，用户无从判断
    const ref = parseJunkReference({ golden: [], alien: [635, '2890'], ape: [], zombie: [] })
    expect(decorateJunk(ref, 635).rarity).toBe('normal')
  })

  it('tokenId 非整数或负数 → normal/false（不认识就不装饰）', () => {
    const ref = parseJunkReference(REF)
    expect(decorateJunk(ref, -1)).toEqual({ golden: false, rarity: 'normal' })
    expect(decorateJunk(ref, 1.5)).toEqual({ golden: false, rarity: 'normal' })
  })
})

describe('junkPageId — v1 路径 /#/cryptojunks/page/{floor(id/100)}/id/{id}', () => {
  it.each([
    [0, 0],
    [1, 0],
    [99, 0],
    [100, 1],
    [1234, 12],
    [9999, 99],
  ])('token %i → page %i', (id, page) => {
    expect(junkPageId(id)).toBe(page)
  })
})

describe('parseJunkReference — 形状检查', () => {
  it('对象 → 返回自身', () => {
    expect(parseJunkReference(REF)).toBe(REF)
  })

  it.each([
    [null],
    [undefined],
    [[1, 2, 3]],
    ['golden'],
    [42],
  ])('非对象 %s → null', (raw) => {
    expect(parseJunkReference(raw)).toBeNull()
  })
})
