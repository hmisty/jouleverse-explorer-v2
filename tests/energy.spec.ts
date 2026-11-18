import { describe, it, expect } from 'vitest'
import {
  mergeEnergy,
  checkEnergyInvariant,
  type TimelockTriple,
} from '../src/utils/energy'

const E = (n: number | bigint) => BigInt(n) * 10n ** 18n

/** 自洽的一组读数：released = used + available */
function consistent(used: number, available: number): TimelockTriple {
  return { used: E(used), available: E(available), released: E(used + available) }
}

describe('能量口径合并（全网合计）', () => {
  it('按 v1 语义映射：total←released、free←used、reserved←available', () => {
    const core = consistent(564_000_000, 24_000_000)
    const eco = consistent(72_000_000, 2_280_000_000)
    const b = mergeEnergy(core, eco)
    expect(b.total).toBe(E(2_940_000_000))
    expect(b.free).toBe(E(636_000_000))
    expect(b.reserved).toBe(E(2_304_000_000))
    // 三分法自洽：free + reserved == total
    expect(b.free + b.reserved).toBe(b.total)
  })

  it('reserved_core / reserved_eco 分别取各自 available，不串味', () => {
    const b = mergeEnergy(consistent(1_000, 24_000_000), consistent(2_000, 2_280_000_000))
    expect(b.reservedCore).toBe(E(24_000_000))
    expect(b.reservedEco).toBe(E(2_280_000_000))
    expect(b.reserved).toBe(E(2_304_000_000))
    expect(b.reservedCore + b.reservedEco).toBe(b.reserved)
  })

  it('先累加 wei 再格式化，不产生分步取整误差', () => {
    // 两个各 0.6M 的尾数：若先各自取整到 M 会得到 0+0；合起来应是 1.2M
    const core: TimelockTriple = { used: E(600_000), available: 0n, released: E(600_000) }
    const eco: TimelockTriple = { used: E(600_000), available: 0n, released: E(600_000) }
    const merged = mergeEnergy(core, eco)
    expect(merged.free).toBe(E(1_200_000))
    // 累积值是精确的 wei，未在任何中间步骤四舍五入
    expect(merged.free % (10n ** 18n)).toBe(0n)
  })

  it('全零输入不报错，输出 0 值而非 NaN', () => {
    const zero: TimelockTriple = { used: 0n, available: 0n, released: 0n }
    const b = mergeEnergy(zero, zero)
    expect(b).toEqual({ total: 0n, free: 0n, reserved: 0n, reservedCore: 0n, reservedEco: 0n })
  })
})

describe('恒等式 released = used + available 校验', () => {
  it('两组都自洽时返回空数组', () => {
    expect(checkEnergyInvariant(consistent(564, 24), consistent(72, 2280))).toEqual([])
  })

  it('core 不自洽时只报 core，不误伤 eco', () => {
    const badCore: TimelockTriple = { used: E(100), available: E(50), released: E(999) }
    expect(checkEnergyInvariant(badCore, consistent(72, 2280))).toEqual(['core'])
  })

  it('eco 不自洽时只报 eco', () => {
    expect(checkEnergyInvariant(consistent(1, 1), { used: 0n, available: 0n, released: 1n })).toEqual(['eco'])
  })

  it('两组都不自洽时都报出', () => {
    const bad: TimelockTriple = { used: 0n, available: 0n, released: 1n }
    expect(checkEnergyInvariant(bad, bad)).toEqual(['core', 'eco'])
  })

  it('差 1 wei 也算不自洽（不做容差放行）', () => {
    const nearMiss: TimelockTriple = { used: E(100), available: E(50), released: E(150) + 1n }
    expect(checkEnergyInvariant(nearMiss, consistent(0, 0))).toEqual(['core'])
  })
})
