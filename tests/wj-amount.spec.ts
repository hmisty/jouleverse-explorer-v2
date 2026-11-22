import { describe, it, expect } from 'vitest'
import { parseEther, formatEther } from 'viem'
import {
  checkWjAmount,
  WITHDRAW_LIMIT_J,
  TRANSFER_LIMIT_J,
} from '../src/utils/wj-amount'

const BALANCE = parseEther('50') // 50 WJ

describe('数量格式', () => {
  it('空输入 → empty', () => {
    for (const v of ['', '   ', null, undefined]) {
      const r = checkWjAmount(v as never, 'transfer', BALANCE)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.code).toBe('empty')
    }
  })

  it('非数字 → not-a-number', () => {
    for (const v of ['abc', '1,5', '1e3', '0x10', '+1', '-1', '1.2.3', '.']) {
      const r = checkWjAmount(v, 'transfer', BALANCE)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.code).toBe('not-a-number')
    }
  })

  it('科学计数法与十六进制被拒（parseEther 也会拒，但错误码要可读）', () => {
    expect(checkWjAmount('1e3', 'transfer', BALANCE).ok).toBe(false)
    expect(checkWjAmount('0x10', 'transfer', BALANCE).ok).toBe(false)
  })

  it('零与纯零小数 → not-positive', () => {
    for (const v of ['0', '0.0', '0.000000000000000000']) {
      const r = checkWjAmount(v, 'transfer', BALANCE)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.code).toBe('not-positive')
    }
  })

  it('超过 18 位小数 → too-many-decimals（不靠 parseEther 抛异常）', () => {
    const r = checkWjAmount('1.' + '0'.repeat(18) + '1', 'transfer', BALANCE)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('too-many-decimals')
  })

  it('合理输入 → ok，wei 与 parseEther 一致', () => {
    const r = checkWjAmount('1.5', 'transfer', BALANCE)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.wei).toBe(parseEther('1.5'))
      expect(r.amountJ).toBe('1.5')
    }
  })
})

describe('释放 J 的上限：严格小于 100', () => {
  it('99.999999 通过', () => {
    const r = checkWjAmount('99.999999', 'withdraw', parseEther('500'))
    expect(r.ok).toBe(true)
  })

  it('🔴 恰好 100 被拒（v1 是 `!(amt < 100)`，等于 100 不通过）', () => {
    const r = checkWjAmount('100', 'withdraw', parseEther('500'))
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.code).toBe('exceeds-operation-limit')
      expect(r.message).toContain('小于')
    }
  })

  it('100.000000000000000001 被拒（bigint 比较，不因浮点吞掉尾数）', () => {
    const r = checkWjAmount('100.000000000000000001', 'withdraw', parseEther('500'))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('exceeds-operation-limit')
  })

  it('上限文案提示改用合约工具（v1 原话）', () => {
    const r = checkWjAmount('200', 'withdraw', null)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toContain('合约工具')
  })
})

describe('发送 WJ 的上限：小于等于 2000', () => {
  it('🔴 恰好 2000 通过（v1 是 `!(amt <= 2000)`，等于 2000 合法）', () => {
    const r = checkWjAmount('2000', 'transfer', parseEther('5000'))
    expect(r.ok).toBe(true)
  })

  it('2000.000000000000000001 被拒', () => {
    const r = checkWjAmount('2000.000000000000000001', 'transfer', parseEther('5000'))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('exceeds-operation-limit')
  })

  it('两个操作的上限方向确实不同（同一数值 100 在释放里不合法、在转账里合法）', () => {
    expect(checkWjAmount('100', 'withdraw', parseEther('500')).ok).toBe(false)
    expect(checkWjAmount('100', 'transfer', parseEther('500')).ok).toBe(true)
  })
})

describe('余额校验', () => {
  it('转账超出余额 → exceeds-balance', () => {
    const r = checkWjAmount('51', 'transfer', BALANCE)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('exceeds-balance')
  })

  it('🔴 转账恰好等于余额通过（v1 `!(amt <= wjBalance)`）', () => {
    expect(checkWjAmount('50', 'transfer', BALANCE).ok).toBe(true)
  })

  it('🔴 释放恰好等于余额被拒（v1 `!(amt < wjBalance)`）', () => {
    const r = checkWjAmount('50', 'withdraw', BALANCE)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('exceeds-balance')
  })

  it('余额未知（null）时跳过余额校验，但仍查上限', () => {
    expect(checkWjAmount('50', 'transfer', null).ok).toBe(true)
    expect(checkWjAmount('5000', 'transfer', null).ok).toBe(false)
  })

  it('checkBalance=false 时跳过余额校验（v1「新手加油」刻意关掉这一项）', () => {
    // 新用户 WJ 余额为 0，但这笔是从操作者自己钱包释放给新人，所以不校验新人余额
    const r = checkWjAmount('0.005', 'withdraw', 0n, { checkBalance: false })
    expect(r.ok).toBe(true)
  })

  it('checkBalance=false 不豁免上限（边界不能因为勾掉余额就被绕过）', () => {
    const r = checkWjAmount('500', 'withdraw', 0n, { checkBalance: false })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('exceeds-operation-limit')
  })
})

describe('边界常量与文档一致', () => {
  it('释放 100 / 转账 2000', () => {
    expect(WITHDRAW_LIMIT_J).toBe(100n)
    expect(TRANSFER_LIMIT_J).toBe(2000n)
    // 常量是「以 J 为单位的整数」不是 wei —— 换 wei 才能与 parseEther 对齐。
    // 与对等清单「保留 v1 边界不放宽」一致：WJ 发送 ≤2000
    expect(formatEther(parseEther(TRANSFER_LIMIT_J.toString()))).toBe('2000')
    expect(formatEther(parseEther(WITHDRAW_LIMIT_J.toString()))).toBe('100')
  })
})
