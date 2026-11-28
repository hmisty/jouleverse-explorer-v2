import { describe, expect, it } from 'vitest'
import {
  MAX_PACKET_AMOUNT_WEI,
  UINT256_MAX,
  assembleHistory,
  blocksUntilExpiry,
  buildShareText,
  canOpen,
  canWithdraw,
  describeRemaining,
  findOpenerIndex,
  formatPacketId,
  packetStatus,
  parseAmountToWei,
  parsePacketId,
  parseQuantity,
  randomLuckyNumber,
  randomPacketId,
  sortHistoryDesc,
  validateCreate,
  validateLuckyNumber,
  type RedPacketSnapshot,
} from '../src/utils/redpacket'

const ZERO = '0x0000000000000000000000000000000000000000'
const CREATOR = '0x4eF599b6E39D950D6Ddbd830fF5f95e06770C1B3'

function snap(over: Partial<RedPacketSnapshot> = {}): RedPacketSnapshot {
  return {
    created: true,
    creator: CREATOR,
    expiry: 1_000n,
    totalE: 100n * 10n ** 18n,
    totalN: 10n,
    leftE: 100n * 10n ** 18n,
    leftN: 10n,
    finalE: 0n,
    finalN: 0n,
    ...over,
  }
}

describe('parsePacketId — 红包 ID 解析', () => {
  it('v1 分享链接里的 32 字节 hex 能解析', () => {
    const id = '0x' + 'ab'.repeat(32)
    expect(parsePacketId(id)).toBe(BigInt(id))
  })

  it('十进制字符串也能解析（从合约工具复制出来的值）', () => {
    expect(parsePacketId('12345')).toBe(12345n)
  })

  it('0x0 与 0 都解析为 0n（合法 ID，不是"无效"）', () => {
    expect(parsePacketId('0x0')).toBe(0n)
    expect(parsePacketId('0')).toBe(0n)
  })

  it('前后空白被容忍', () => {
    expect(parsePacketId('  42  ')).toBe(42n)
  })

  it('空串 / null / undefined → null', () => {
    expect(parsePacketId('')).toBeNull()
    expect(parsePacketId('   ')).toBeNull()
    expect(parsePacketId(null)).toBeNull()
    expect(parsePacketId(undefined)).toBeNull()
  })

  it('"0x" 后无内容 → null（不能当 0 处理）', () => {
    expect(parsePacketId('0x')).toBeNull()
  })

  it('非 hex 字母（0xzz）→ null', () => {
    expect(parsePacketId('0xzz')).toBeNull()
  })

  it('负数 → null', () => {
    expect(parsePacketId('-1')).toBeNull()
  })

  it('超过 uint256 的范围 → null（不静默截断）', () => {
    expect(parsePacketId((UINT256_MAX + 1n).toString())).toBeNull()
    expect(parsePacketId('0x1' + '0'.repeat(64))).toBeNull()
  })

  it('uint256 上界本身合法', () => {
    expect(parsePacketId(UINT256_MAX.toString())).toBe(UINT256_MAX)
    expect(parsePacketId('0x' + 'f'.repeat(64))).toBe(UINT256_MAX)
  })
})

describe('formatPacketId — 还原成定长 32 字节 hex', () => {
  it('0n → 64 个 0', () => {
    expect(formatPacketId(0n)).toBe('0x' + '0'.repeat(64))
  })

  it('往返一致：hex → bigint → hex', () => {
    const hex = '0x' + 'ab'.repeat(32)
    const back = formatPacketId(parsePacketId(hex)!)
    expect(back).toBe(hex)
  })

  it('往返一致：十进制 → hex → bigint', () => {
    const v = 98765432109876543210n
    expect(parsePacketId(formatPacketId(v))).toBe(v)
  })

  it('始终 66 字符（0x + 64）', () => {
    expect(formatPacketId(1n)).toHaveLength(66)
    expect(formatPacketId(UINT256_MAX)).toHaveLength(66)
  })

  it('越界抛错而不是产出错值', () => {
    expect(() => formatPacketId(-1n)).toThrow()
    expect(() => formatPacketId(UINT256_MAX + 1n)).toThrow()
  })
})

describe('parseAmountToWei — 金额解析', () => {
  it('整数：1 → 1e18', () => {
    expect(parseAmountToWei('1')).toBe(10n ** 18n)
  })

  it('小数：0.05 → 5e16', () => {
    expect(parseAmountToWei('0.05')).toBe(5n * 10n ** 16n)
  })

  it('≤18 位小数全部保留（0.000000000000000001 → 1 wei）', () => {
    expect(parseAmountToWei('0.000000000000000001')).toBe(1n)
  })

  it('19 位小数 → null（不静默截断）', () => {
    expect(parseAmountToWei('0.0000000000000000001')).toBeNull()
  })

  it('"." / "" / 空白 → null', () => {
    expect(parseAmountToWei('.')).toBeNull()
    expect(parseAmountToWei('')).toBeNull()
    expect(parseAmountToWei('  ')).toBeNull()
  })

  it('"1.2.3"、负数、科学计数法 → null', () => {
    expect(parseAmountToWei('1.2.3')).toBeNull()
    expect(parseAmountToWei('-1')).toBeNull()
    expect(parseAmountToWei('1e18')).toBeNull()
  })

  it('".5" 与 "5." 都能解析（用户手打常见）', () => {
    expect(parseAmountToWei('.5')).toBe(5n * 10n ** 17n)
    expect(parseAmountToWei('5.')).toBe(5n * 10n ** 18n)
  })

  it('千分位逗号 → null（不做静默清洗，避免把 1,000 读成 1000 或 1）', () => {
    expect(parseAmountToWei('1,000')).toBeNull()
  })

  it('0 与 0.0 都是 0n', () => {
    expect(parseAmountToWei('0')).toBe(0n)
    expect(parseAmountToWei('0.0')).toBe(0n)
  })
})

describe('parseQuantity — 个数解析', () => {
  it('正常整数通过', () => {
    expect(parseQuantity('5')).toBe(5n)
    expect(parseQuantity('500')).toBe(500n)
  })

  it('0 → null（0 个红包没有意义）', () => {
    expect(parseQuantity('0')).toBeNull()
  })

  it('501 → null（合约上限 500）', () => {
    expect(parseQuantity('501')).toBeNull()
  })

  it('小数 / 负数 / 空 → null', () => {
    expect(parseQuantity('1.5')).toBeNull()
    expect(parseQuantity('-1')).toBeNull()
    expect(parseQuantity('')).toBeNull()
  })

  it('前导零 "007" → 7n（不误判为非法）', () => {
    expect(parseQuantity('007')).toBe(7n)
  })
})

describe('validateCreate — 创建表单校验（对齐合约 require）', () => {
  it('正常输入：10 WJ / 5 个，授权充足 → 无错且不需要再授权', () => {
    const r = validateCreate('10', '5', 10n * 10n ** 18n)
    expect(r.errors).toEqual([])
    expect(r.amountWei).toBe(10n * 10n ** 18n)
    expect(r.quantity).toBe(5n)
    expect(r.needsApproval).toBe(false)
    expect(r.allowanceUnknown).toBe(false)
  })

  it('授权不足 → needsApproval，但不是错误（可先授权后创建）', () => {
    const r = validateCreate('10', '5', 1n)
    expect(r.errors).toEqual([])
    expect(r.needsApproval).toBe(true)
  })

  it('授权未知（未连钱包）→ needsApproval + allowanceUnknown', () => {
    const r = validateCreate('10', '5', null)
    expect(r.errors).toEqual([])
    expect(r.needsApproval).toBe(true)
    expect(r.allowanceUnknown).toBe(true)
  })

  it('总额超过 2000 WJ → 报错', () => {
    const r = validateCreate('2000.000000000000000001', '1', 0n)
    expect(r.errors.some(e => e.includes('2000 WJ'))).toBe(true)
    expect(r.amountWei).toBeNull()
  })

  it('正好 2000 WJ → 通过（合约是 <=）', () => {
    const r = validateCreate('2000', '1', 0n)
    expect(r.errors).toEqual([])
    expect(r.amountWei).toBe(MAX_PACKET_AMOUNT_WEI)
  })

  it('个数 501 → 报错；500 → 通过', () => {
    expect(validateCreate('2000', '501', 0n).errors.some(e => e.includes('500'))).toBe(true)
    expect(validateCreate('2000', '500', 0n).errors).toEqual([])
  })

  it('总额为 0 → 报错', () => {
    expect(validateCreate('0', '1', 0n).errors.some(e => e.includes('大于 0'))).toBe(true)
  })

  it('金额格式错 → 报错', () => {
    expect(validateCreate('1.2.3', '1', 0n).errors.some(e => e.includes('格式'))).toBe(true)
  })

  it('金额 < 个数（每包不足 1 wei）→ 报错，对齐合约 amount >= quantity', () => {
    // 5 个红包但总额只有 3 wei
    const r = validateCreate('0.000000000000000003', '5', 0n)
    expect(r.errors.some(e => e.includes('每个红包'))).toBe(true)
  })

  it('金额 == 个数（每包正好 1 wei）→ 通过', () => {
    const r = validateCreate('0.000000000000000005', '5', 0n)
    expect(r.errors).toEqual([])
  })

  it('多个错误同时报（总额超限 + 个数超限）', () => {
    const r = validateCreate('9999', '999', 0n)
    expect(r.errors.length).toBe(2)
  })

  it('有错时不返回已解析值，避免调用方误用', () => {
    const r = validateCreate('9999', '1', 0n)
    expect(r.amountWei).toBeNull()
    expect(r.quantity).toBeNull()
    expect(r.needsApproval).toBe(false)
  })

  it('个数为空 / 非整数 → 报错', () => {
    expect(validateCreate('10', '', 0n).errors.some(e => e.includes('不能为空'))).toBe(true)
    expect(validateCreate('10', '2.5', 0n).errors.some(e => e.includes('整数'))).toBe(true)
  })
})

describe('validateLuckyNumber — 幸运数字', () => {
  it('0 合法（合约下界是 0）', () => {
    expect(validateLuckyNumber('0')).toEqual({ error: null, value: 0n })
  })

  it('uint256 上界合法', () => {
    expect(validateLuckyNumber(UINT256_MAX.toString())).toEqual({ error: null, value: UINT256_MAX })
  })

  it('超过上界 → 报错', () => {
    expect(validateLuckyNumber((UINT256_MAX + 1n).toString()).error).toContain('2^256-1')
  })

  it('小数 / 负数 / 空 → 报错', () => {
    expect(validateLuckyNumber('1.5').error).toBeTruthy()
    expect(validateLuckyNumber('-1').error).toBeTruthy()
    expect(validateLuckyNumber('').error).toBeTruthy()
    expect(validateLuckyNumber(null).error).toBeTruthy()
  })

  it('前导零 "007" → 7n', () => {
    expect(validateLuckyNumber('007')).toEqual({ error: null, value: 7n })
  })
})

describe('randomLuckyNumber / randomPacketId — 随机数生成', () => {
  it('幸运数字落在 0–10000（对齐 v1 Math.random()*10001）', () => {
    for (let i = 0; i < 200; i++) {
      const v = randomLuckyNumber()
      expect(v).toBeGreaterThanOrEqual(0n)
      expect(v).toBeLessThanOrEqual(10000n)
      expect(typeof v).toBe('bigint')
    }
  })

  it('红包 ID 恒为 32 字节（≤ uint256，可 format 成 66 字符）', () => {
    for (let i = 0; i < 50; i++) {
      const id = randomPacketId()
      expect(id).toBeGreaterThanOrEqual(0n)
      expect(id).toBeLessThanOrEqual(UINT256_MAX)
      expect(formatPacketId(id)).toHaveLength(66)
    }
  })

  it('连续生成的 ID 不重复（碰撞概率可忽略，但足以抓出"常量生成器"）', () => {
    const set = new Set<string>()
    for (let i = 0; i < 50; i++) set.add(randomPacketId().toString())
    expect(set.size).toBe(50)
  })
})

describe('packetStatus — 四种状态判定', () => {
  it('未创建 → not-found（优先于一切）', () => {
    expect(packetStatus(snap({ created: false }), 0n)).toBe('not-found')
  })

  it('有剩余且未过期 → active', () => {
    expect(packetStatus(snap(), 999n)).toBe('active')
  })

  it('剩余金额归零 → finished', () => {
    expect(packetStatus(snap({ leftE: 0n }), 500n)).toBe('finished')
  })

  it('剩余个数归零 → finished', () => {
    expect(packetStatus(snap({ leftN: 0n }), 500n)).toBe('finished')
  })

  it('还有剩余但已达 expiry → expired（不是 active）', () => {
    expect(packetStatus(snap(), 1000n)).toBe('expired')
    expect(packetStatus(snap(), 1001n)).toBe('expired')
  })

  it('抢完 + 过期 → finished（抢完优先，因为钱已发出去）', () => {
    expect(packetStatus(snap({ leftE: 0n }), 2000n)).toBe('finished')
  })

  it('expiry 前一瞬（expiry-1）仍是 active', () => {
    expect(packetStatus(snap(), 999n)).toBe('active')
  })
})

describe('canOpen / canWithdraw — 操作可行性', () => {
  it('active 才能抢', () => {
    expect(canOpen(snap(), 500n)).toBe(true)
    expect(canOpen(snap(), 1000n)).toBe(false)
    expect(canOpen(snap({ leftE: 0n }), 500n)).toBe(false)
    expect(canOpen(snap({ created: false }), 500n)).toBe(false)
  })

  it('只有发起人能在过期后取回剩余', () => {
    expect(canWithdraw(snap(), 1000n, CREATOR)).toBe(true)
    expect(canWithdraw(snap(), 1000n, CREATOR.toLowerCase())).toBe(true)
  })

  it('非发起人不能取回', () => {
    expect(canWithdraw(snap(), 1000n, '0x1111111111111111111111111111111111111111')).toBe(false)
  })

  it('未过期不能取回', () => {
    expect(canWithdraw(snap(), 999n, CREATOR)).toBe(false)
  })

  it('未连接钱包不能取回', () => {
    expect(canWithdraw(snap(), 1000n, null)).toBe(false)
  })

  it('已抢完（left 归零）不能取回', () => {
    expect(canWithdraw(snap({ leftE: 0n }), 2000n, CREATOR)).toBe(false)
  })
})

describe('blocksUntilExpiry / describeRemaining', () => {
  it('剩余块数按 expiry - current 算，已过期为 0', () => {
    expect(blocksUntilExpiry(snap(), 500n)).toBe(500n)
    expect(blocksUntilExpiry(snap(), 1000n)).toBe(0n)
    expect(blocksUntilExpiry(snap(), 5000n)).toBe(0n)
  })

  it('5760 块 ≈ 24 小时，文案落到"小时"档', () => {
    const s = snap({ expiry: 5760n })
    expect(describeRemaining(s, 0n)).toBe('约 24 小时')
  })

  it('不足 1 小时走分钟档', () => {
    // 240 块 × 15s = 3600s = 60 分钟 → 边界算"约 60 分钟"还是"约 1 小时"？
    // 实现里 minutes < 60 走分钟档，60 走小时档且 restMin=0 → "约 1 小时"
    expect(describeRemaining(snap({ expiry: 120n }), 0n)).toBe('约 30 分钟')
    expect(describeRemaining(snap({ expiry: 240n }), 0n)).toBe('约 1 小时')
  })

  it('小时+分钟混合档', () => {
    // 300 块 = 4500s = 75 分钟 → 1 小时 15 分钟
    expect(describeRemaining(snap({ expiry: 300n }), 0n)).toBe('约 1 小时 15 分钟')
  })

  it('已过期 → "已过期"', () => {
    expect(describeRemaining(snap(), 1000n)).toBe('已过期')
  })
})

describe('findOpenerIndex / assembleHistory / sortHistoryDesc', () => {
  const entries = [
    { e: 1n, opener: '0xAAA1111111111111111111111111111111111111', blockHeight: 100n },
    { e: 2n, opener: '0xbbb2222222222222222222222222222222222222', blockHeight: 101n },
    { e: 3n, opener: '0xccc3333333333333333333333333333333333333', blockHeight: 102n },
  ]

  it('找到时返回下标', () => {
    expect(findOpenerIndex(entries, '0xbbb2222222222222222222222222222222222222')).toBe(1)
  })

  it('大小写不敏感（链上返回的 checksum 地址与用户输入不一致时仍能命中）', () => {
    expect(findOpenerIndex(entries, '0xAAA1111111111111111111111111111111111111')).toBe(0)
    expect(findOpenerIndex(entries, '0xaaa1111111111111111111111111111111111111')).toBe(0)
  })

  it('没领过 → -1（这个判据决定"抢红包"按钮是否可点）', () => {
    expect(findOpenerIndex(entries, '0xddd4444444444444444444444444444444444444')).toBe(-1)
  })

  it('未连接钱包 → -1', () => {
    expect(findOpenerIndex(entries, null)).toBe(-1)
    expect(findOpenerIndex(entries, undefined)).toBe(-1)
  })

  it('零地址条目被丢弃（读到空槽位时不该显示"0x0000… 领了 0"）', () => {
    const raw = [...entries, { e: 0n, opener: ZERO, blockHeight: 0n }]
    const out = assembleHistory(raw)
    expect(out).toHaveLength(3)
    expect(out.some(e => e.opener === ZERO)).toBe(false)
  })

  it('超过上限被截断（有界扫描，不会因为异常数据把页面拖死）', () => {
    const many = Array.from({ length: 600 }, (_, i) => ({
      e: 1n,
      opener: `0x${String(i).padStart(40, '0')}`,
      blockHeight: BigInt(i),
    }))
    expect(assembleHistory(many)).toHaveLength(500)
    expect(assembleHistory(many, 10)).toHaveLength(10)
  })

  it('倒序排列：最近领的在最前', () => {
    const sorted = sortHistoryDesc(entries)
    expect(sorted.map(e => e.blockHeight)).toEqual([102n, 101n, 100n])
  })

  it('倒序不修改入参（避免视图里出现"刷新后顺序乱跳"）', () => {
    const copy = [...entries]
    sortHistoryDesc(entries)
    expect(entries).toEqual(copy)
  })
})

describe('buildShareText — 分享文案', () => {
  it('与 v1 copyRedpacketInfoToClipboard 的字段顺序一致', () => {
    const text = buildShareText({ url: 'https://jscan2.f7t.cn/#/redpacket/0xab', totalAmount: '10', quantity: '5' })
    expect(text).toContain('红包地址：https://jscan2.f7t.cn/#/redpacket/0xab')
    expect(text).toContain('红包总额：10 WJ')
    expect(text).toContain('红包个数：5')
    // 顺序：地址 → 总额 → 个数
    expect(text.indexOf('红包地址')).toBeLessThan(text.indexOf('红包总额'))
    expect(text.indexOf('红包总额')).toBeLessThan(text.indexOf('红包个数'))
  })
})
