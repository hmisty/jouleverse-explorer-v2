import { describe, expect, it } from 'vitest'
import { parseJnsdaoVTokenUri, shouldQueryJnsdaoV } from '../src/utils/jnsdaov'

// 真实链上 JNSDAO V #0 的 tokenURI（query(0xbBCD5C29…) 原样返回），
// 只截断 image 尾部（base64 SVG 很长，对断言无意义）在下面单独构造用例覆盖。
const REAL_META = {
  name: 'JNSDAO V #0',
  description: 'nostr npub key well known by jnsdao.com.',
  hex: '6fdc0877997369a6e6c39f0d739b96623c14673f70625076e75c28651d7b4f82',
  image: 'data:image/svg+xml;base64,PHN2ZyBzdHlsZT0i',
}
const REAL_URI = 'data:application/json;base64,' + Buffer.from(JSON.stringify(REAL_META)).toString('base64')

describe('parseJnsdaoVTokenUri — 真实链上元数据', () => {
  it('解出 name / npub / 内联图三项', () => {
    const badge = parseJnsdaoVTokenUri(REAL_URI)!
    expect(badge).not.toBeNull()
    expect(badge.name).toBe('JNSDAO V #0')
    expect(badge.npub).toBe('npub1dlwqsauewd56dekrnuxh8xukvg7pgeelwp39qah8ts5x28tmf7pqp5tcp3')
    expect(badge.image).toMatch(/^data:image\/svg\+xml;base64,/)
  })

  it('name 会被 trim（元数据里偶有尾空格，不该带到界面）', () => {
    const uri = 'data:application/json;base64,' + Buffer.from(JSON.stringify({ ...REAL_META, name: '  JNSDAO V #7  ' })).toString('base64')
    expect(parseJnsdaoVTokenUri(uri)!.name).toBe('JNSDAO V #7')
  })

  it('name 为空白字符串时给 null（不显示一个空标签）', () => {
    const uri = 'data:application/json;base64,' + Buffer.from(JSON.stringify({ ...REAL_META, name: '   ' })).toString('base64')
    expect(parseJnsdaoVTokenUri(uri)!.name).toBeNull()
  })

  it('缺 hex 时 npub 为 null，但其余字段照常解出（不整条失败）', () => {
    const { hex, ...noHex } = REAL_META
    void hex
    const uri = 'data:application/json;base64,' + Buffer.from(JSON.stringify(noHex)).toString('base64')
    const badge = parseJnsdaoVTokenUri(uri)!
    expect(badge.npub).toBeNull()
    expect(badge.name).toBe('JNSDAO V #0')
  })
})

describe('parseJnsdaoVTokenUri — 图片外链必须拦掉', () => {
  it('http(s) 外链图 → image 为 null（避免泄露访问者 IP）', () => {
    for (const image of ['https://evil.example/x.png', 'http://a.b/c.svg']) {
      const uri = 'data:application/json;base64,' + Buffer.from(JSON.stringify({ ...REAL_META, image })).toString('base64')
      expect(parseJnsdaoVTokenUri(uri)!.image).toBeNull()
    }
  })

  it('ipfs:// 等非 data:image/ 同样拦掉', () => {
    const uri = 'data:application/json;base64,' + Buffer.from(JSON.stringify({ ...REAL_META, image: 'ipfs://Qm...' })).toString('base64')
    expect(parseJnsdaoVTokenUri(uri)!.image).toBeNull()
  })
})

describe('parseJnsdaoVTokenUri — URI 形状不认识就返回 null（不猜）', () => {
  it.each([
    ['空串', ''],
    ['纯文本', 'hello'],
    ['非 base64 的 data JSON', 'data:application/json,{"name":"x"}'],
    ['base64 但不是 JSON', 'data:application/json;base64,' + Buffer.from('not json').toString('base64')],
    ['JSON 是数组不是对象', 'data:application/json;base64,' + Buffer.from('[1,2]').toString('base64')],
    ['JSON 是 null', 'data:application/json;base64,' + Buffer.from('null').toString('base64')],
  ])('%s → null', (_label, uri) => {
    expect(parseJnsdaoVTokenUri(uri)).toBeNull()
  })

  it('非字符串输入不抛异常', () => {
    for (const v of [null, undefined, 42, {}]) {
      expect(parseJnsdaoVTokenUri(v as unknown as string)).toBeNull()
    }
  })
})

describe('shouldQueryJnsdaoV — query() 会 revert，必须先看 balanceOf', () => {
  it('余额 > 0 → 该发 query', () => {
    expect(shouldQueryJnsdaoV(1n)).toBe(true)
    expect(shouldQueryJnsdaoV(999n)).toBe(true)
  })

  // 这两条是本文件的重点：query() 对无徽章地址 revert，若不分青红皂白地调用，
  // 会把预期内的 revert 显示成错误；反过来若把 revert 一律当「无徽章」，
  // 又会把 RPC 抖动显示成「你没加入」。判据只能是 balanceOf。
  it('余额 0 → 不发 query（未持有是合法状态，不是错误）', () => {
    expect(shouldQueryJnsdaoV(0n)).toBe(false)
  })

  it('余额读取失败(null) → 也不发 query（交给上层显示读取失败，不冒充未持有）', () => {
    expect(shouldQueryJnsdaoV(null)).toBe(false)
  })
})
