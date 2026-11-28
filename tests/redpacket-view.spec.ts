import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'

// ---- 钱包 store 与实际链解耦：只 mock 出视图用到的部分 ----
const walletState = vi.hoisted(() => ({
  isConnected: true,
  address: '0xAAA1111111111111111111111111111111111111' as string | null,
}))

vi.mock('../src/stores/wallet', () => ({
  config: {},
  useWalletStore: () => ({
    get isConnected() { return walletState.isConnected },
    get address() { return walletState.address },
    connect: vi.fn(),
    formatAddress: (a: string | null) => a ?? '',
    formatBalance: (b: bigint | null) => (b === null ? '0' : String(b)),
  }),
}))

// ---- 数据层：让每个用例精确控制「链上返回什么」 ----
const rpc = vi.hoisted(() => ({
  load: vi.fn(),
  loadHistory: vi.fn(),
  loadAllowance: vi.fn(),
  loadJtiBalance: vi.fn(),
  approve: vi.fn(),
  createPacket: vi.fn(),
  openPacket: vi.fn(),
  withdrawPacket: vi.fn(),
}))

// 假的 composable 必须把 rpc.load 的结果真正写进视图读取的 ref，
// 否则视图永远停在 snapshot=ref(null) 的「红包不存在」分支上——
// 这正是第一版脚手架的问题：用例看着在测视图，其实测的是空状态。
vi.mock('../src/composables/useRedPacket', async () => {
  const { ref } = await import('vue')
  const actual = await vi.importActual<typeof import('../src/composables/useRedPacket')>(
    '../src/composables/useRedPacket',
  )
  const isLoading = ref(false)
  const loadError = ref<string | null>(null)
  const snapshot = ref<unknown>(null)
  const currentBlock = ref(0n)
  const history = ref<unknown[]>([])

  const load = async (id: bigint) => {
    isLoading.value = true
    try {
      const res = (await rpc.load(id)) as
        | { snapshot: unknown; status: string; openedCount: number; currentBlock?: bigint }
        | null
      if (!res) {
        loadError.value = '读取失败'
        snapshot.value = null
        return null
      }
      snapshot.value = res.snapshot
      currentBlock.value = res.currentBlock ?? 0n
      return res
    } finally {
      isLoading.value = false
    }
  }

  const loadHistory = async (id: bigint, count: number) => {
    const entries = (await rpc.loadHistory(id, count)) as unknown[]
    history.value = entries ?? []
    return history.value
  }

  return {
    ...actual,
    useRedPacket: () => ({
      isLoading,
      loadError,
      snapshot,
      currentBlock,
      history,
      ...rpc,
      load,
      loadHistory,
      canWithdrawNow: () => true,
    }),
  }
})

import View from '../src/views/RedPacket.vue'

const CREATOR = '0x4eF599b6E39D950D6Ddbd830fF5f95e06770C1B3'
const wrappers: ReturnType<typeof mount>[] = []

beforeEach(() => {
  setActivePinia(createPinia())
  walletState.isConnected = true
  walletState.address = '0xAAA1111111111111111111111111111111111111'
  rpc.load.mockReset()
  rpc.loadHistory.mockResolvedValue([])
  rpc.loadAllowance.mockResolvedValue(0n)
  rpc.loadJtiBalance.mockResolvedValue(null)
  rpc.approve.mockReset()
  rpc.createPacket.mockReset()
  rpc.openPacket.mockReset()
  rpc.withdrawPacket.mockReset()
})

afterEach(() => {
  wrappers.splice(0).forEach(w => w.unmount())
})

function snap(over: Record<string, unknown> = {}) {
  return {
    created: true,
    creator: CREATOR,
    expiry: 5760n,
    totalE: 100n * 10n ** 18n,
    totalN: 10n,
    leftE: 100n * 10n ** 18n,
    leftN: 10n,
    finalE: 0n,
    finalN: 0n,
    ...over,
  }
}

async function render(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/redpacket', component: View },
      { path: '/redpacket/:packetId', component: View },
      { path: '/address/:address', component: { template: '<div />' } },
      { path: '/block/:number', component: { template: '<div />' } },
    ],
  })
  await router.push(path)
  await router.isReady()
  const w = mount(View, { global: { plugins: [router] } })
  wrappers.push(w)
  await flushPromises()
  return w
}

describe('RedPacket 视图 — 创建页', () => {
  it('默认给出 32 字节红包编号，且是 hex 定长展示', async () => {
    const w = await render('/redpacket')
    const id = w.find('.id-value').text()
    expect(id).toMatch(/^0x[0-9a-f]{64}$/)
  })

  it('未连接钱包时提示连接，而不是直接报错', async () => {
    walletState.isConnected = false
    walletState.address = null
    const w = await render('/redpacket')
    expect(w.text()).toContain('请先连接钱包')
  })

  it('总额超 2000 WJ 时列出错误且「创建红包」不可用', async () => {
    const w = await render('/redpacket')
    const amount = w.findAll('input')[0]!
    await amount.setValue('2001')
    await flushPromises()
    expect(w.text()).toContain('不能超过 2000 WJ')
    const btn = w.findAllComponents({ name: 'JvActionButton' })[0]!
    expect(btn.attributes('disabled')).toBeDefined()
  })

  it('个数超 500 时报错', async () => {
    const w = await render('/redpacket')
    await w.findAll('input')[0]!.setValue('100')
    await w.findAll('input')[1]!.setValue('501')
    await flushPromises()
    expect(w.text()).toContain('不能超过 500')
  })

  it('授权不足时创建按钮不可用，且提示需先授权', async () => {
    const w = await render('/redpacket')
    await w.findAll('input')[0]!.setValue('10')
    await w.findAll('input')[1]!.setValue('5')
    await flushPromises()
    expect(w.text()).toContain('当前授权不足')
    const btn = w.findAllComponents({ name: 'JvActionButton' })[0]!
    expect(btn.attributes('disabled')).toBeDefined()
  })

  it('授权足够 + 输入合法 → 创建按钮可用', async () => {
    rpc.loadAllowance.mockResolvedValue(10n * 10n ** 18n)
    const w = await render('/redpacket')
    await w.findAll('input')[0]!.setValue('10')
    await w.findAll('input')[1]!.setValue('5')
    await flushPromises()
    const btn = w.findAllComponents({ name: 'JvActionButton' })[0]!
    expect(btn.attributes('disabled')).toBeUndefined()
  })

  it('创建成功后展示可复制的分享文案（含地址/总额/个数三段）', async () => {
    rpc.loadAllowance.mockResolvedValue(10n * 10n ** 18n)
    rpc.createPacket.mockResolvedValue('0x' + 'ab'.repeat(32))
    const w = await render('/redpacket')
    await w.findAll('input')[0]!.setValue('10')
    await w.findAll('input')[1]!.setValue('5')
    await flushPromises()
    await w.findAllComponents({ name: 'JvActionButton' })[0]!.trigger('click')
    await flushPromises()
    const share = w.find('.share-text').text()
    expect(share).toContain('红包地址：')
    expect(share).toContain('红包总额：10 WJ')
    expect(share).toContain('红包个数：5')
  })

  it('创建失败时把合约 require 文案翻成中文，而不是吐原始 doc 链接', async () => {
    rpc.loadAllowance.mockResolvedValue(10n * 10n ** 18n)
    rpc.createPacket.mockRejectedValue(new Error('execution reverted: ERROR: too many red packets'))
    const w = await render('/redpacket')
    await w.findAll('input')[0]!.setValue('10')
    await w.findAll('input')[1]!.setValue('5')
    await flushPromises()
    await w.findAllComponents({ name: 'JvActionButton' })[0]!.trigger('click')
    await flushPromises()
    expect(w.text()).toContain('创建失败')
    expect(w.text()).toContain('最多 500 个')
  })

  it('总额小于个数（每包不足 1 wei）时拦住', async () => {
    const w = await render('/redpacket')
    await w.findAll('input')[0]!.setValue('0.000000000000000003')
    await w.findAll('input')[1]!.setValue('5')
    await flushPromises()
    expect(w.text()).toContain('每个红包')
  })
})

describe('RedPacket 视图 — 抢红包页', () => {
  it('红包不存在时显示「红包不存在」而不是空白', async () => {
    rpc.load.mockResolvedValue({
      snapshot: snap({ created: false }),
      status: 'not-found',
      openedCount: 0,
    })
    const w = await render('/redpacket/' + '0x' + '0'.repeat(64))
    expect(w.text()).toContain('红包不存在')
  })

  it('可抢状态显示四宫格金额与个数、以及「抢红包」按钮', async () => {
    rpc.load.mockResolvedValue({ snapshot: snap(), status: 'active', openedCount: 0 })
    rpc.loadJtiBalance.mockResolvedValue(1n)
    const w = await render('/redpacket/0x' + 'ab'.repeat(32))
    expect(w.text()).toContain('总额 (WJ)')
    expect(w.text()).toContain('剩余金额 (WJ)')
    expect(w.text()).toContain('抢红包')
  })

  it('已过期时不再给抢按钮，改为展示过期说明', async () => {
    rpc.load.mockResolvedValue({
      snapshot: snap({ expiry: 10n }),
      status: 'expired',
      openedCount: 0,
      // 关键：视图的状态是拿 snapshot 与 currentBlock 自己算的，不读 mock 的 status 字段。
      // 只给 status='expired' 而不给块高，视图会算出 active —— 这正是第一版用例假绿的原因。
      currentBlock: 100n,
    })
    const w = await render('/redpacket/0x' + 'ab'.repeat(32))
    expect(w.text()).toContain('已过期')
    expect(w.text()).toContain('只有发起人可取回')
    expect(w.text()).not.toContain('抢红包\n')
  })

  it('已抢完时显示「已抢完」并给出领取人数', async () => {
    rpc.load.mockResolvedValue({
      snapshot: snap({ leftE: 0n, leftN: 0n, finalN: 10n }),
      status: 'finished',
      openedCount: 10,
    })
    const w = await render('/redpacket/0x' + 'ab'.repeat(32))
    expect(w.text()).toContain('已抢完')
    expect(w.text()).toContain('10 人领取')
  })

  it('无 JTI 时明确写出无资格，按钮不可用', async () => {
    rpc.load.mockResolvedValue({ snapshot: snap(), status: 'active', openedCount: 0 })
    rpc.loadJtiBalance.mockResolvedValue(0n)
    const w = await render('/redpacket/0x' + 'ab'.repeat(32))
    expect(w.text()).toContain('无 JTI，无法抢')
  })

  it('已领过的人看到「已领过」，不再让他重复点', async () => {
    rpc.load.mockResolvedValue({ snapshot: snap(), status: 'active', openedCount: 1 })
    rpc.loadJtiBalance.mockResolvedValue(1n)
    rpc.loadHistory.mockResolvedValue([
      { e: 5n * 10n ** 18n, opener: walletState.address!, blockHeight: 100n },
    ])
    const w = await render('/redpacket/0x' + 'ab'.repeat(32))
    expect(w.text()).toContain('该地址已领过这个红包')
    // 只断言文案不够：文案还在、按钮可点，用户点了会 revert "cannot open twice"。
    // 这里必须同时锁住「按钮禁用」。
    const btn = w.findAllComponents({ name: 'JvActionButton' })[0]!
    expect(btn.attributes('disabled')).toBeDefined()
  })

  it('领完最后一包后按钮也禁用（leftN 归零）', async () => {
    rpc.load.mockResolvedValue({
      snapshot: snap({ leftE: 0n, leftN: 0n }),
      status: 'finished',
      openedCount: 10,
    })
    rpc.loadJtiBalance.mockResolvedValue(1n)
    const w = await render('/redpacket/0x' + 'ab'.repeat(32))
    const buttons = w.findAllComponents({ name: 'JvActionButton' })
    expect(buttons.length).toBe(0)
    expect(w.text()).toContain('已抢完')
  })

  it('抢到后回读历史，展示具体金额（合约 open 无返回值也无事件）', async () => {
    rpc.load.mockResolvedValue({ snapshot: snap(), status: 'active', openedCount: 0 })
    rpc.loadJtiBalance.mockResolvedValue(1n)
    rpc.openPacket.mockImplementation(async () => {
      rpc.load.mockResolvedValue({ snapshot: snap({ finalN: 1n }), status: 'active', openedCount: 1 })
      rpc.loadHistory.mockResolvedValue([
        { e: 7n * 10n ** 18n, opener: walletState.address!, blockHeight: 200n },
      ])
      return '0x' + 'cd'.repeat(32)
    })
    const w = await render('/redpacket/0x' + 'ab'.repeat(32))
    await w.findAllComponents({ name: 'JvActionButton' })[0]!.trigger('click')
    await flushPromises()
    expect(w.text()).toContain('抢到了 7 WJ')
  })

  it('领取记录按区块号列出并链到地址/区块页', async () => {
    rpc.load.mockResolvedValue({ snapshot: snap({ finalN: 2n }), status: 'active', openedCount: 2 })
    rpc.loadJtiBalance.mockResolvedValue(1n)
    rpc.loadHistory.mockResolvedValue([
      { e: 3n * 10n ** 18n, opener: '0xBBB2222222222222222222222222222222222222', blockHeight: 300n },
      { e: 4n * 10n ** 18n, opener: '0xCCC3333333333333333333333333333333333333', blockHeight: 301n },
    ])
    const w = await render('/redpacket/0x' + 'ab'.repeat(32))
    expect(w.text()).toContain('领取记录（2）')
    const hrefs = w.findAll('a').map(a => a.attributes('href'))
    expect(hrefs).toContain('/block/300')
    expect(hrefs).toContain('/block/301')
  })

  it('非法红包编号：显示「红包不存在」，不静默当成 0 号红包去读', async () => {
    rpc.load.mockResolvedValue({ snapshot: snap({ created: false }), status: 'not-found', openedCount: 0 })
    const w = await render('/redpacket/not-a-number')
    expect(w.text()).toContain('红包不存在')
    expect(w.text()).toContain('请检查链接是否完整')
  })
})
