// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { buildDidResult, isUnbound } from '../src/utils/did-resolve'

const ZERO = '0x0000000000000000000000000000000000000000'
const OWNER = '0xAbC0000000000000000000000000000000000001'
const BOUND = '0xDeF0000000000000000000000000000000000002'

/**
 * DID 解析结果建模 —— v1 `getNSAddress()` 的关键分支。
 *
 * v1 原逻辑：`var bound_addr = (result3 == 0)? "未绑定地址" : result3.toString();`
 * 然后把 bound_addr 直接交给 `encodeJVA()` 当地址编码。
 * 未绑定时 encodeJVA 拿到的是中文串 "未绑定地址"，必然失败 → 页面地址区空白/报错。
 * v2 把「未绑定」显式建成一个 kind，视图据此提示，不复刻这个 bug。
 */
describe('isUnbound — 零地址判定', () => {
  it('全零地址视为未绑定', () => {
    expect(isUnbound(ZERO)).toBe(true)
    expect(isUnbound(ZERO.toUpperCase().replace('0X', '0x'))).toBe(true)
  })

  it('真实地址不视为未绑定', () => {
    expect(isUnbound(BOUND)).toBe(false)
  })

  it('null / undefined / 空串一律视为未绑定（读不到 ≠ 已绑定）', () => {
    expect(isUnbound(null)).toBe(true)
    expect(isUnbound(undefined)).toBe(true)
    expect(isUnbound('')).toBe(true)
  })
})

describe('buildDidResult — 三态建模', () => {
  it('tokenId 0 → notfound（域名不存在）', () => {
    const r = buildDidResult({ raw: 'nope.j', jnsId: 'nope.j', tokenId: 0n, owner: ZERO, boundAddress: ZERO })
    expect(r.kind).toBe('notfound')
    expect(r.kind === 'notfound' && r.jnsId).toBe('nope.j')
  })

  it('tokenId 存在 + 零地址 → unbound（不是 ok，也不是 notfound）', () => {
    const r = buildDidResult({ raw: 'a.j', jnsId: 'a.j', tokenId: 18n, owner: OWNER, boundAddress: ZERO })
    expect(r.kind).toBe('unbound')
    if (r.kind === 'unbound') {
      expect(r.tokenId).toBe(18n)
      expect(r.owner).toBe(OWNER)
    }
  })

  it('tokenId 存在 + 有绑定地址 → ok，且保留原始大小写地址', () => {
    const r = buildDidResult({ raw: 'a.j', jnsId: 'a.j', tokenId: 18n, owner: OWNER, boundAddress: BOUND })
    expect(r.kind).toBe('ok')
    if (r.kind === 'ok') {
      expect(r.boundAddress).toBe(BOUND)
      expect(r.owner).toBe(OWNER)
      expect(r.tokenId).toBe(18n)
    }
  })

  it('notfound 优先于 unbound：tokenId 0 时不看 boundAddress', () => {
    const r = buildDidResult({ raw: 'a.j', jnsId: 'a.j', tokenId: 0n, owner: OWNER, boundAddress: BOUND })
    expect(r.kind).toBe('notfound')
  })

  it('unbound 的 owner 与 bound 是两件事，不能拿 owner 顶替绑定地址', () => {
    // 这条是给「顺手把 owner 当地址渲染」的写法上的锁：
    const r = buildDidResult({ raw: 'a.j', jnsId: 'a.j', tokenId: 5n, owner: OWNER, boundAddress: ZERO })
    expect(r.kind).toBe('unbound')
    expect('boundAddress' in r).toBe(false)
  })
})
