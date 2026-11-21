// 区块详情路由参数解析（高度 / 32 字节哈希双入参）
//
// 对等依据：v1 `blockInfosController.js:71` 直接 `web3.eth.getBlock($routeParams.blockId)`，
// web3 0.x 的 getBlock 同时接受区块号与区块哈希 —— v1 的 `/#/block/:blockId` 是双入参。
//
// v2 改动前一律 `BigInt(props.number)`：任何哈希入参都会抛错 → 页面显示「未找到」。
// 而交易详情页的「区块哈希」行（PR #96）可点击跳 `/block/<哈希>`，
// 所以这曾是一条**生产上的死链**，不是纯理论缺口。

import { describe, expect, it } from 'vitest'
import { parseBlockParam, shortBlockParam } from '../src/utils/block-param'

const HASH = `0x${'a1'.repeat(32)}`

describe('parseBlockParam · 区块号', () => {
  it('十进制区块号走上限分支（bigint，不用 Number）', () => {
    const r = parseBlockParam('4920')
    expect(r).toEqual({ kind: 'number', number: 4920n })
  })

  it('前导零归一化（v1 用 parseInt，007 就是 7）', () => {
    expect(parseBlockParam('007')).toEqual({ kind: 'number', number: 7n })
  })

  it('0 是合法区块号（创世块），不能被当空值丢掉', () => {
    expect(parseBlockParam('0')).toEqual({ kind: 'number', number: 0n })
  })

  it('🔴 超过 2^53 的高度不失精度（走 bigint 而非 Number）', () => {
    const big = '9007199254740993'
    const r = parseBlockParam(big)
    expect(r?.kind).toBe('number')
    expect(r?.kind === 'number' && r.number).toBe(9007199254740993n)
    // 先证明 Number 这条路真的会错，否则上面的断言可能只是碰巧成立
    expect(BigInt(Number(big)).toString()).not.toBe(big)
  })

  it('首尾空白被容忍（用户从别处复制粘贴）', () => {
    expect(parseBlockParam('  123  ')).toEqual({ kind: 'number', number: 123n })
  })
})

describe('parseBlockParam · 区块哈希', () => {
  it('带 0x 的 32 字节哈希走哈希分支', () => {
    expect(parseBlockParam(HASH)).toEqual({ kind: 'hash', hash: HASH })
  })

  it('不带 0x 的裸哈希同样识别，并补齐前缀', () => {
    const bare = HASH.slice(2)
    expect(parseBlockParam(bare)).toEqual({ kind: 'hash', hash: HASH })
  })

  it('大小写不敏感，统一小写成小写形式', () => {
    const upper = `0x${'A1'.repeat(32)}`
    expect(parseBlockParam(upper)).toEqual({ kind: 'hash', hash: HASH })
  })

  it('🔴 64 位全数字按哈希处理，不当高度', () => {
    // 它既是合法哈希、又匹配十进制的歧义输入。
    // 按高度处理会得到 10^63 量级的区块号 → RPC 抛「参数非法」；
    // 按哈希处理则得到干净的「该区块不存在」。
    const digits = '1'.repeat(64)
    const r = parseBlockParam(digits)
    expect(r?.kind).toBe('hash')
  })

  it('63 位 / 65 位 hex 不算哈希（长度必须恰好 32 字节）', () => {
    expect(parseBlockParam(`0x${'a'.repeat(63)}`)).toBeNull()
    expect(parseBlockParam(`0x${'a'.repeat(65)}`)).toBeNull()
  })

  it('含非 hex 字符的 64 位串不算哈希', () => {
    expect(parseBlockParam(`0x${'z'.repeat(64)}`)).toBeNull()
  })
})

describe('parseBlockParam · 无效输入', () => {
  it('空串 / 纯空白 / 只有 0x → null（不发 RPC）', () => {
    expect(parseBlockParam('')).toBeNull()
    expect(parseBlockParam('   ')).toBeNull()
    expect(parseBlockParam('0x')).toBeNull()
  })

  it('非空非数字非哈希 → null', () => {
    expect(parseBlockParam('hello')).toBeNull()
    expect(parseBlockParam('12abc')).toBeNull()
  })

  it('负数不算区块号（链上没有负高度）', () => {
    expect(parseBlockParam('-1')).toBeNull()
  })

  it('null / undefined 不抛异常', () => {
    expect(parseBlockParam(null)).toBeNull()
    expect(parseBlockParam(undefined)).toBeNull()
  })
})

describe('shortBlockParam · 标题用摘要', () => {
  it('短参数原样返回', () => {
    expect(shortBlockParam('4920')).toBe('4920')
  })

  it('长哈希截断成 10…6，不把 66 字符铺进标题', () => {
    const s = shortBlockParam(HASH)
    expect(s.length).toBeLessThan(HASH.length)
    expect(s).toContain('…')
  })

  it('空值给占位符', () => {
    expect(shortBlockParam('')).toBe('—')
    expect(shortBlockParam(null)).toBe('—')
  })
})
