import { describe, expect, it } from 'vitest'
import { decideNewbieGas, NEWBIE_GAS_AMOUNT_J } from '../src/utils/newbie-gas'

const ACCOUNT = '0x7fba9BB966189Db8C4fE33B7bf67Bfa24203c6AD'

describe('decideNewbieGas — 三条件全中才显示（v1 ng-style 三条件）', () => {
  it('已连接 + 余额 0 + 持有 JTI → 显示', () => {
    expect(decideNewbieGas({ nativeBalance: 0n, jtiBalance: 1n, connectedAccount: ACCOUNT }))
      .toEqual({ show: true, reason: null })
  })

  it('持有多个 JTI 也显示（判据是 > 0 不是 == 1）', () => {
    expect(decideNewbieGas({ nativeBalance: 0n, jtiBalance: 5n, connectedAccount: ACCOUNT }).show).toBe(true)
  })
})

describe('decideNewbieGas — 任一条件不成立就不显示', () => {
  it('未连接钱包 → 不显示（即便余额 0 且有 JTI）', () => {
    expect(decideNewbieGas({ nativeBalance: 0n, jtiBalance: 1n, connectedAccount: null }))
      .toEqual({ show: false, reason: 'not-connected' })
    expect(decideNewbieGas({ nativeBalance: 0n, jtiBalance: 1n, connectedAccount: '' }).show).toBe(false)
  })

  it('余额非零 → 不显示（v1 是 balance == 0）', () => {
    expect(decideNewbieGas({ nativeBalance: 1n, jtiBalance: 1n, connectedAccount: ACCOUNT }))
      .toEqual({ show: false, reason: 'not-newbie' })
  })

  it('余额 1 wei 就足够判定「不是新手」（不放宽成阈值）', () => {
    // 若实现写成 `< parseEther('0.005')`，这条会变成 show=true —— 直接失败
    expect(decideNewbieGas({ nativeBalance: 1n, jtiBalance: 1n, connectedAccount: ACCOUNT }).show).toBe(false)
  })

  it('余额 0.004 J（小于加油金额）但非零 → 仍不显示', () => {
    const almost = 4_000_000_000_000_000n // 0.004 J
    expect(decideNewbieGas({ nativeBalance: almost, jtiBalance: 1n, connectedAccount: ACCOUNT }).show).toBe(false)
  })

  it('无 JTI 徽章 → 不显示', () => {
    expect(decideNewbieGas({ nativeBalance: 0n, jtiBalance: 0n, connectedAccount: ACCOUNT }))
      .toEqual({ show: false, reason: 'no-jti' })
  })
})

describe('decideNewbieGas — 失败绝不冒充「零」（最重要的一组）', () => {
  // 混同的后果不是显示错，而是真的转出 0.005 J（不可逆）：
  // 一个余额充足的地址因 RPC 抖动被读成 null，若 null 当 0 处理就会显示按钮。
  it('余额读取失败(null) → 不显示，reason=balance-unknown', () => {
    expect(decideNewbieGas({ nativeBalance: null, jtiBalance: 1n, connectedAccount: ACCOUNT }))
      .toEqual({ show: false, reason: 'balance-unknown' })
  })

  it('JTI 读取失败(null) → 不显示，reason=jti-unknown', () => {
    expect(decideNewbieGas({ nativeBalance: 0n, jtiBalance: null, connectedAccount: ACCOUNT }))
      .toEqual({ show: false, reason: 'jti-unknown' })
  })

  it('两者都失败 → 先报余额未知（顺序固定，便于界面提示稳定）', () => {
    expect(decideNewbieGas({ nativeBalance: null, jtiBalance: null, connectedAccount: ACCOUNT }).reason)
      .toBe('balance-unknown')
  })

  it('未连接优先于余额未知（越基础的条件越先报）', () => {
    expect(decideNewbieGas({ nativeBalance: null, jtiBalance: null, connectedAccount: null }).reason)
      .toBe('not-connected')
  })
})

describe('NEWBIE_GAS_AMOUNT_J', () => {
  it('固定 0.005 J（与 v1 amt 硬编码一致）', () => {
    expect(NEWBIE_GAS_AMOUNT_J).toBe('0.005')
  })
})
