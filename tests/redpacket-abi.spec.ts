import { describe, expect, it } from 'vitest'
import { encodeFunctionData } from 'viem'
import { wjABI } from '../src/contracts/wj'
import { redPacketABI } from '../src/contracts/redpacket'

describe('wjABI — approve / allowance 补齐', () => {
  it('approve(address,uint256) 选择器是 0x095ea7b3（ERC-20 标准，与链上 WJ 一致）', () => {
    const data = encodeFunctionData({
      abi: wjABI,
      functionName: 'approve',
      args: ['0x0dc46592ACf76e149B108BDe2E56D8429a2D6046', 10n ** 18n],
    })
    expect(data.slice(0, 10)).toBe('0x095ea7b3')
  })

  it('allowance(address,address) 选择器是 0xdd62ed3e', () => {
    const data = encodeFunctionData({
      abi: wjABI,
      functionName: 'allowance',
      args: ['0x4eF599b6E39D950D6Ddbd830fF5f95e06770C1B3', '0x0dc46592ACf76e149B108BDe2E56D8429a2D6046'],
    })
    expect(data.slice(0, 10)).toBe('0xdd62ed3e')
  })

  it('approve 的 calldata 长度是 4+32+32 字节 = 138 字符', () => {
    const data = encodeFunctionData({
      abi: wjABI,
      functionName: 'approve',
      args: ['0x0dc46592ACf76e149B108BDe2E56D8429a2D6046', 1n],
    })
    expect(data).toHaveLength(138)
  })

  it('原有 transfer / withdrawTo / balanceOf 未被这次补充破坏', () => {
    for (const fn of ['transfer', 'withdrawTo', 'balanceOf'] as const) {
      expect(wjABI.some(item => item.type === 'function' && item.name === fn)).toBe(true)
    }
  })
})

type AbiFn = {
  name: string
  inputs: { name: string }[]
  outputs: { name: string; components?: { name: string }[] }[]
}

const fn = (name: string): AbiFn => {
  const entry = redPacketABI.find(item => item.type === 'function' && item.name === name)
  if (!entry) throw new Error(`ABI 里没有 ${name}`)
  return entry as unknown as AbiFn
}

describe('redPacketABI — 与 v1 redpacket.sol 的函数集合一致', () => {
  const names = redPacketABI
    .filter(item => item.type === 'function')
    .map(item => item.name)
    .sort()

  it('写函数：create / open / withdraw', () => {
    expect(names).toContain('create')
    expect(names).toContain('open')
    expect(names).toContain('withdraw')
  })

  it('读函数：redpackets / inspect / WJ / JTI', () => {
    expect(names).toContain('redpackets')
    expect(names).toContain('inspect')
    expect(names).toContain('WJ')
    expect(names).toContain('JTI')
  })

  it('没有多出合约里不存在的函数（对等清单要求逐字段核对）', () => {
    expect(names).toEqual(['JTI', 'WJ', 'create', 'inspect', 'open', 'redpackets', 'withdraw'])
  })

  it('redpackets 返回 10 个字段，顺序与合约 struct 一致', () => {
    expect(fn('redpackets').outputs.map(o => o.name)).toEqual([
      'created', 'creator', 'expiry',
      'total_e', 'total_n', 'left_e', 'left_n',
      'final_e', 'final_n', 'last_seed',
    ])
  })

  it('inspect 返回 (e, opener, block_height) 三元组', () => {
    expect(fn('inspect').outputs[0]!.components!.map(c => c.name)).toEqual(['e', 'opener', 'block_height'])
  })

  it('create 的参数是 (id, quantity, amount) —— 注意顺序，写反会白送钱', () => {
    expect(fn('create').inputs.map(i => i.name)).toEqual(['id', 'quantity', 'amount'])
  })

  it('open 的参数是 (id, lucky_n)', () => {
    expect(fn('open').inputs.map(i => i.name)).toEqual(['id', 'lucky_n'])
  })
})
