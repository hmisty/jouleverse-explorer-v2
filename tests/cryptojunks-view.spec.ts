// CryptoJunks 视图测试（P5-4）。
// 重点不是「DOM 里有几个格子」，而是几件容易悄悄坏掉的事：
//   1. 路由参数变化时真的重新拉数据（组件实例复用，setup 只跑一次）
//   2. 上一页的错误不残留到下一页
//   3. 非法页号给空态而不是空白页
//   4. supply 只读一次，翻页不重复读
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { reactive } from 'vue'

// ⚠️ 必须用 reactive：真实 useRoute() 返回的是响应式对象。
// 第一版用了普通对象，于是「换页重新拉数据」三条用例全红 —— 那是测试替身不响应，
// 不是组件不 watch。用非响应式替身测 watch，等于没测。
const routeRef = reactive({ params: {} as Record<string, string> })

vi.mock('vue-router', () => ({
  useRoute: () => routeRef,
  useRouter: () => ({ push: vi.fn() }),
}))

const readContract = vi.fn()
const multicall = vi.fn()

vi.mock('@/config/client', () => ({
  publicClient: {
    get readContract() { return readContract },
    get multicall() { return multicall },
  },
}))

import CryptoJunks from '@/views/CryptoJunks.vue'

function goodUri(id: number) {
  return `data:application/json;base64,${Buffer.from(
    JSON.stringify({ name: `CryptoJunks #${id}`, id, image: `data:image/png;base64,I${id}` }),
  ).toString('base64')}`
}

// routeRef 是模块级共享的响应式对象，而组件会 watch 它。
// 若不在用例之间卸载，前一条用例留下的实例会跟着响应后续的 params 变化，
// 把 `mockRejectedValueOnce` 这类「一次性」桩消耗掉 —— 实测表现是
// 「换页只该 2 次 multicall」变成 10 次、「错误态」用例拿不到错误。
const mounted: VueWrapper[] = []

function mountAt(params: Record<string, string>) {
  routeRef.params = params
  const w = mount(CryptoJunks, {
    global: {
      stubs: {
        RouterLink: { template: '<a><slot /></a>' },
        JvHashText: true,
        JvActionButton: true,
        JvPageState: { props: ['type', 'title', 'description', 'action'], template: '<div class="pagestate">{{ title }}</div>' },
      },
    },
  })
  mounted.push(w)
  return w
}

afterEach(() => {
  while (mounted.length) mounted.pop()!.unmount()
})

beforeEach(() => {
  readContract.mockReset().mockResolvedValue(10000n)
  multicall.mockReset().mockImplementation(async ({ contracts }) => {
    return contracts.map((c: { args: [bigint] }) => {
      const id = Number(c.args[0])
      return { status: 'success' as const, result: goodUri(id) }
    })
  })
})

describe('CryptoJunks 视图 · 基本渲染', () => {
  it('默认路由（无 pageId）等同第 0 页，渲染 100 个格子', async () => {
    const w = mountAt({})
    await flushPromises()
    expect(w.findAll('.cell').length).toBe(100)
    expect(w.find('[data-testid="supply"]').text()).toBe('10000')
    expect(w.find('[data-testid="sealed"]').text()).toBe('set in stone')
  })

  it('🔴 第 0 页只打 1 次 supply + 1 次 multicall', async () => {
    mountAt({})
    await flushPromises()
    expect(readContract).toHaveBeenCalledTimes(1)
    expect(multicall).toHaveBeenCalledTimes(1)
  })

  it('图与编号来自各自的 tokenId，不错位', async () => {
    const w = mountAt({ pageId: '5' })
    await flushPromises()
    const cells = w.findAll('.cell')
    expect(cells[0].text()).toContain('#500')
    expect(cells[0].find('img').attributes('src')).toBe('data:image/png;base64,I500')
  })
})

describe('CryptoJunks 视图 · 路由切换', () => {
  it('🔴 换页时重新拉数据（组件实例复用，setup 只跑一次）', async () => {
    const w = mountAt({ pageId: '0' })
    await flushPromises()
    expect(w.findAll('.cell')[0].text()).toContain('#0')

    routeRef.params = { pageId: '3' }
    await w.vm.$nextTick()
    await flushPromises()
    expect(w.findAll('.cell')[0].text()).toContain('#300')
  })

  it('🔴 换页时不重复读 supply（它不会变，重复读纯属浪费 RPC）', async () => {
    const w = mountAt({ pageId: '0' })
    await flushPromises()
    expect(readContract).toHaveBeenCalledTimes(1)

    routeRef.params = { pageId: '2' }
    await w.vm.$nextTick()
    await flushPromises()
    expect(readContract).toHaveBeenCalledTimes(1)
    expect(multicall).toHaveBeenCalledTimes(2)
  })

  it('🔴 上一页的网络错误不残留到下一页', async () => {
    multicall.mockRejectedValueOnce(new Error('rpc down'))
    const w = mountAt({ pageId: '0' })
    await flushPromises()
    expect(w.text()).toContain('读取失败')
    expect(w.text()).toContain('rpc down')

    routeRef.params = { pageId: '1' }
    await w.vm.$nextTick()
    await flushPromises()
    expect(w.text()).not.toContain('rpc down')
    expect(w.findAll('.cell').length).toBe(100)
  })
})

describe('CryptoJunks 视图 · 边界', () => {
  it('非法页号（100-999 空洞）给空态，不显示空白表', async () => {
    const w = mountAt({ pageId: '500' })
    await flushPromises()
    expect(w.find('.pagestate').exists()).toBe(true)
    expect(w.findAll('.cell').length).toBe(0)
    // 也不该打任何 RPC
    expect(readContract).not.toHaveBeenCalled()
  })

  it('非数字页号给空态', async () => {
    const w = mountAt({ pageId: 'abc' })
    await flushPromises()
    expect(w.find('.pagestate').exists()).toBe(true)
  })

  it('单枚详情模式只拉那一枚', async () => {
    const w = mountAt({ pageId: '3', junkId: '350' })
    await flushPromises()
    expect(w.findAll('.cell').length).toBe(1)
    expect(w.text()).toContain('#350')
    expect(multicall.mock.calls[0][0].contracts.length).toBe(1)
  })

  it('broken 末页 99 个格子（不是凑满 100 个空格子）', async () => {
    const w = mountAt({ pageId: '1002' })
    await flushPromises()
    expect(w.findAll('.cell').length).toBe(99)
  })

  it('legend 页 9 个格子 + 👑 符号', async () => {
    const w = mountAt({ pageId: '1000000' })
    await flushPromises()
    expect(w.findAll('.cell').length).toBe(9)
    expect(w.text()).toContain('👑')
    expect(w.text()).toContain('传奇')
  })

  it('supply 读失败时给出错误态且不把 supply 当 0', async () => {
    readContract.mockRejectedValueOnce(new Error('boom'))
    const w = mountAt({ pageId: '0' })
    await flushPromises()
    expect(w.text()).toContain('boom')
    expect(w.find('[data-testid="supply"]').text()).toBe('…')
  })

  it('统计表按参照表渲染，与 v1 写死值一致', async () => {
    const w = mountAt({ pageId: '0' })
    await flushPromises()
    const rows = w.findAll('.stats tbody tr')
    expect(rows.length).toBe(3)
    expect(rows[0].text()).toContain('9')
    expect(rows[0].text()).toContain('24')
    expect(rows[0].text()).toContain('88')
    expect(rows[0].text()).toContain('9580')
    expect(rows[0].text()).toContain('9701')
    expect(rows[1].text()).toContain('299')
    expect(rows[2].text()).toContain('10000')
  })

  it('合约地址完整展示（不截断）', async () => {
    const w = mountAt({ pageId: '0' })
    await flushPromises()
    // JvHashText 被 stub，检查其 props
    const hash = w.findComponent({ name: 'JvHashText' })
    expect(hash.exists()).toBe(true)
    expect(hash.props('value')).toBe('0x1b1d15726d64c5027b627138f2bf051cc1EF2680')
    expect(hash.props('truncate')).toBe(0)
  })
})
