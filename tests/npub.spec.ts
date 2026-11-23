import { describe, expect, it } from 'vitest'
import { hexToNpub, npubFromMetadata } from '../src/utils/npub'

// 锚点来自真实链上 JNSDAO V #0 的元数据（tokenURI 解出的 hex 字段），
// 期望值是同一份 hex 用 v1 的 @scure/base bech32.encode('npub', toWords(bytes)) 得出的。
const REAL_HEX = '6fdc0877997369a6e6c39f0d739b96623c14673f70625076e75c28651d7b4f82'
const REAL_NPUB = 'npub1dlwqsauewd56dekrnuxh8xukvg7pgeelwp39qah8ts5x28tmf7pqp5tcp3'

describe('hexToNpub — 真实链上锚点', () => {
  it('JNSDAO V #0 的 hex 能转成链上一致的 npub', () => {
    expect(hexToNpub(REAL_HEX)).toBe(REAL_NPUB)
  })

  it('带 0x 前缀与全大写得出同一个 npub（同一公钥不同写法）', () => {
    expect(hexToNpub('0x' + REAL_HEX)).toBe(REAL_NPUB)
    expect(hexToNpub(REAL_HEX.toUpperCase())).toBe(REAL_NPUB)
    expect(hexToNpub('0x' + REAL_HEX.toUpperCase())).toBe(REAL_NPUB)
  })

  it('前后空白被忽略（元数据里不会有，但粘贴场景会出现）', () => {
    expect(hexToNpub(`  ${REAL_HEX}\n`)).toBe(REAL_NPUB)
  })

  it('输出必定是 npub1 前缀的合法 bech32（可被自身往返验证形状）', () => {
    const npub = hexToNpub(REAL_HEX)!
    expect(npub.startsWith('npub1')).toBe(true)
    // bech32 的字符集不含 1/b/i/o，数据部分长度 = 32 字节 → 52 个 5-bit 字符
    expect(npub.slice(5)).toMatch(/^[qpzry9x8gf2tvdw0s3jn54khce6mua7l]+$/)
    expect(npub.length).toBe(5 + 52 + 6)
  })
})

describe('hexToNpub — 长度必须恰好 32 字节（不许截断/补零）', () => {
  it('31 字节返回 null（不是「差不多就行」）', () => {
    expect(hexToNpub(REAL_HEX.slice(0, 62))).toBeNull()
  })

  it('33 字节返回 null', () => {
    expect(hexToNpub(REAL_HEX + '00')).toBeNull()
  })

  it('32 字节少一位（63 字符）返回 null', () => {
    expect(hexToNpub(REAL_HEX.slice(0, 63))).toBeNull()
  })

  // 这条是关键反证：若实现「补零到 32 字节」，64-2=62 字符的输入会变成合法 npub，
  // 且指向另一个公钥（用户会拿它去 nostr 上关注一个陌生人）。
  it('62 字符补齐后不得与原始 npub 相同（防「补零蒙混」）', () => {
    const truncated = hexToNpub(REAL_HEX.slice(0, 62))
    expect(truncated).not.toBe(REAL_NPUB)
  })
})

describe('hexToNpub — 非法输入一律 null', () => {
  it.each([
    ['空串', ''],
    ['只有 0x', '0x'],
    ['非 hex 字符', 'z'.repeat(64)],
    ['含空格', REAL_HEX.slice(0, 32) + ' ' + REAL_HEX.slice(33)],
    ['十进制数字串', '1'.repeat(64) + 'g'],
    ['中文', '焦耳宇宙'.repeat(8)],
  ])('%s → null', (_label, input) => {
    expect(hexToNpub(input)).toBeNull()
  })

  it('全 0 的合法 32 字节是有效输入（npub 不排除零值）', () => {
    expect(hexToNpub('0'.repeat(64))).toBeTypeOf('string')
  })

  it('非字符串输入不抛异常（元数据字段类型不可信）', () => {
    for (const v of [null, undefined, 42, {}, [], true]) {
      expect(hexToNpub(v as unknown as string)).toBeNull()
    }
  })
})

describe('npubFromMetadata — 元数据形状容错', () => {
  it('有合法 hex 字段时取到 npub', () => {
    expect(npubFromMetadata({ hex: REAL_HEX })).toBe(REAL_NPUB)
  })

  it('缺 hex / hex 类型不对 / hex 长度不对 → null', () => {
    expect(npubFromMetadata({ name: 'JNSDAO V #0' })).toBeNull()
    expect(npubFromMetadata({ hex: 123 })).toBeNull()
    expect(npubFromMetadata({ hex: REAL_HEX.slice(0, 40) })).toBeNull()
  })

  it('非对象输入 → null', () => {
    for (const v of [null, undefined, 'x', 42, []]) {
      expect(npubFromMetadata(v)).toBeNull()
    }
  })
})
