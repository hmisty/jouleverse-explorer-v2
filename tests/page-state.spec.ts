import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { JvPageState } from '../src/design-system'

/**
 * JvPageState 的 title 曾经完全不会渲染。
 *
 * 原因：组件用 <template #default> 覆盖了 NEmpty 的默认插槽，而 NEmpty 的标题本来是
 * 通过 description prop 传的；覆盖之后只渲染了 description 段落，title prop 无人消费。
 * 全仓 20 处调用点传了 title，用户实际只看到说明文字。
 *
 * 这组用例锁住「title 必须出现在 DOM 里」，并覆盖三态：
 * 显式 title / 不传 title（走默认标题）/ 只传 description。
 */
describe('JvPageState — 标题与说明都必须渲染', () => {
  it('显式 title + description 都出现', () => {
    const w = mount(JvPageState, { props: { type: 'empty', title: '标题A', description: '说明B' } })
    expect(w.text()).toContain('标题A')
    expect(w.text()).toContain('说明B')
  })

  it('不传 title 时回落到该 type 的默认标题', () => {
    const w = mount(JvPageState, { props: { type: 'network-error' } })
    expect(w.text()).toContain('RPC 连接异常')
  })

  it('wallet-disconnected 的默认标题是「钱包未连接」', () => {
    const w = mount(JvPageState, { props: { type: 'wallet-disconnected' } })
    expect(w.text()).toContain('钱包未连接')
  })

  it('只传 description 时，默认标题仍在，说明被替换', () => {
    const w = mount(JvPageState, { props: { type: 'empty', description: '自定义说明' } })
    expect(w.text()).toContain('暂无数据')
    expect(w.text()).toContain('自定义说明')
  })

  it('title 有独立样式类，不与说明混在一起', () => {
    const w = mount(JvPageState, { props: { type: 'empty', title: '标题A', description: '说明B' } })
    expect(w.find('.jv-state-title').text()).toBe('标题A')
    expect(w.find('.jv-state-desc').text()).toBe('说明B')
  })

  it('action 存在时渲染按钮并可点击', async () => {
    const w = mount(JvPageState, { props: { type: 'network-error', action: '重试' } })
    const btn = w.find('button')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toBe('重试')
    await btn.trigger('click')
    expect(w.emitted('action')).toHaveLength(1)
  })
})
