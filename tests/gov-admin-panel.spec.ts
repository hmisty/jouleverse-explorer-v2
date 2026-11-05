import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, ref, type Ref } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { NConfigProvider, darkTheme } from 'naive-ui'
import { jvDarkTheme, jvLightTheme } from '../src/design-system'
import { encodeGovernanceCall, type ManagedProposal } from '../src/utils/jnsvote-governance'
import type { PendingProposalTx } from '../src/composables/useJNSVoteGovernance'

const mocks = vi.hoisted(() => ({ block: vi.fn(), message: { error: vi.fn(), success: vi.fn() } }))
vi.mock('naive-ui', async (original) => ({ ...await original<object>(), useMessage: () => mocks.message }))
vi.mock('../src/config/client', () => ({ publicClient: { getBlockNumber: mocks.block } }))
vi.mock('../src/stores/wallet', () => ({ useWalletStore: () => wallet }))
vi.mock('../src/composables/useJNSVoteGovernance', () => ({ useJNSVoteGovernance: () => gov }))
import Panel from '../src/components/JNSVoteGovernancePanel.vue'

const ACTOR = '0x1111111111111111111111111111111111111111'
const wallet = { address: ACTOR as string | null }
let state: ManagedProposal
let gov: {
  isSigner: Ref<boolean>; pendingTxs: Ref<PendingProposalTx[]>; isLoading: Ref<boolean>; signers: Ref<string[]>;
  loadError: Ref<string | null>; isWriting: Ref<boolean>; pendingHash: Ref<null>;
  loadGovernance: ReturnType<typeof vi.fn>; reset: ReturnType<typeof vi.fn>; readManagedProposal: ReturnType<typeof vi.fn>;
  submitProposal: ReturnType<typeof vi.fn>; submitModification: ReturnType<typeof vi.fn>; submitDisable: ReturnType<typeof vi.fn>;
  submitReenable: ReturnType<typeof vi.fn>; confirmTx: ReturnType<typeof vi.fn>; executeTx: ReturnType<typeof vi.fn>; checkPendingReceipt: ReturnType<typeof vi.fn>;
}
beforeEach(() => {
  vi.clearAllMocks(); wallet.address = ACTOR
  state = { id: 1n, title: '原始标题', link: 'https://example.com/current', timeBegin: 100n, timeEnd: 200n, disabled: false, currentBlock: 10n }
  mocks.block.mockResolvedValue(10n)
  gov = {
    isSigner: ref(true), pendingTxs: ref([]), isLoading: ref(false), signers: ref([ACTOR]), loadError: ref(null), isWriting: ref(false), pendingHash: ref(null),
    loadGovernance: vi.fn(async () => {}), reset: vi.fn(), readManagedProposal: vi.fn(async () => ({ ...state })),
    submitProposal: vi.fn(async () => 3), submitModification: vi.fn(async () => 3), submitDisable: vi.fn(async () => 3), submitReenable: vi.fn(async () => 3),
    confirmTx: vi.fn(async () => {}), executeTx: vi.fn(async () => {}), checkPendingReceipt: vi.fn(async () => {}),
  }
})
function render(dark = false) {
  return mount(defineComponent({ setup() {
    const theme = computed(() => dark ? darkTheme : null)
    return () => h(NConfigProvider, { theme: theme.value, themeOverrides: dark ? jvDarkTheme : jvLightTheme }, { default: () => h(Panel) })
  } }))
}
function button(wrapper: VueWrapper, label: string) {
  const found = wrapper.findAll('button').find((b) => b.text() === label)
  if (!found) throw new Error(`未找到按钮：${label}`)
  return found
}
function input(wrapper: VueWrapper, id: string) {
  const root = wrapper.get(`#${id}`)
  return root.element.tagName === 'INPUT' ? root : root.get('input')
}
async function load(wrapper: VueWrapper) {
  await flushPromises()
  await input(wrapper, 'manage-proposal-id').setValue('1')
  await button(wrapper, '加载提案并回显').trigger('click')
  await flushPromises()
}

describe('治理管理表单', () => {
  it.each([false, true])('亮暗主题正常回显，修改参数来自当前提案（暗色=%s）', async (dark) => {
    const wrapper = render(dark)
    try {
      await load(wrapper)
      for (const [id, value] of [['edit-proposal-title', '原始标题'], ['edit-proposal-link', 'https://example.com/current'], ['edit-proposal-begin', '100'], ['edit-proposal-end', '200']]) {
        expect((input(wrapper, id).element as HTMLInputElement).value).toBe(value)
      }
      expect(wrapper.text()).toContain('提交禁用提案')
      expect(wrapper.text()).not.toContain('提交重新启用提案')
      await input(wrapper, 'edit-proposal-title').setValue('编辑后的标题')
      await button(wrapper, '提交修改提案').trigger('click'); await flushPromises()
      expect(gov.submitModification).toHaveBeenCalledWith(1n, { title: '编辑后的标题', link: state.link, timeBegin: 100n, timeEnd: 200n })
    } finally { wrapper.unmount() }
  })
  it('已禁用时仅显示重新启用，不显示禁用', async () => {
    state.disabled = true
    const wrapper = render()
    try { await load(wrapper); expect(wrapper.text()).toContain('提交重新启用提案'); expect(wrapper.text()).not.toContain('提交禁用提案') }
    finally { wrapper.unmount() }
  })
  it.each(['modify', 'disable', 'reenable'] as const)('加载后才到开始区块，表单端阻断%s，不调用多签提交', async (operation) => {
    state.disabled = operation === 'reenable'
    const wrapper = render()
    try {
      await load(wrapper)
      state.currentBlock = 100n
      const label = operation === 'modify' ? '提交修改提案' : operation === 'disable' ? '提交禁用提案' : '提交重新启用提案'
      await button(wrapper, label).trigger('click'); await flushPromises()
      expect(mocks.message.error).toHaveBeenCalledWith(expect.stringContaining('提案已经开始'))
      expect(gov.submitModification).not.toHaveBeenCalled(); expect(gov.submitDisable).not.toHaveBeenCalled(); expect(gov.submitReenable).not.toHaveBeenCalled()
      expect(button(wrapper, label).attributes('disabled')).toBeDefined()
    } finally { wrapper.unmount() }
  })
  it('加载时已经开始，修改与禁用按钮均不可用', async () => {
    state.currentBlock = 100n
    const wrapper = render()
    try {
      await load(wrapper)
      expect(button(wrapper, '提交修改提案').attributes('disabled')).toBeDefined()
      expect(button(wrapper, '提交禁用提案').attributes('disabled')).toBeDefined()
      expect((input(wrapper, 'edit-proposal-title').element as HTMLInputElement).disabled).toBe(true)
    } finally { wrapper.unmount() }
  })
  it('修改后的新开始区块已到达时不能提交', async () => {
    const wrapper = render()
    try { await load(wrapper); await input(wrapper, 'edit-proposal-begin').setValue('10'); expect(button(wrapper, '提交修改提案').attributes('disabled')).toBeDefined() }
    finally { wrapper.unmount() }
  })
  it('提交前发现禁用状态改变，更新按钮种类并锁定旧编辑内容直到重新加载', async () => {
    const wrapper = render()
    try {
      await load(wrapper); state.disabled = true
      await button(wrapper, '提交禁用提案').trigger('click'); await flushPromises()
      expect(gov.submitDisable).not.toHaveBeenCalled()
      expect(wrapper.text()).not.toContain('提交禁用提案')
      expect(button(wrapper, '提交重新启用提案').attributes('disabled')).toBeDefined()
      expect(button(wrapper, '提交修改提案').attributes('disabled')).toBeDefined()
      expect(mocks.message.error).toHaveBeenCalledWith(expect.stringContaining('状态已改变'))
    } finally { wrapper.unmount() }
  })
  it('非签名人看不到治理按钮或表单', async () => {
    gov.isSigner.value = false
    const wrapper = render()
    try { await flushPromises(); expect(wrapper.findAll('button')).toHaveLength(0); expect(wrapper.find('#manage-proposal-id').exists()).toBe(false) }
    finally { wrapper.unmount() }
  })
  it('编号变更后清除旧提案，不能对旧提案继续操作', async () => {
    const wrapper = render()
    try { await load(wrapper); await input(wrapper, 'manage-proposal-id').setValue('2'); expect(wrapper.find('#edit-proposal-title').exists()).toBe(false) }
    finally { wrapper.unmount() }
  })
  it('四类交易显示不同类型与执行标签', async () => {
    gov.pendingTxs.value = (['create', 'modify', 'disable', 'reenable'] as const).map((operation, index) => {
      const data = { operation, proposalId: operation === 'create' ? null : 1n, title: '标题', link: '', timeBegin: 100n, timeEnd: 200n }
      return { ...data, data: encodeGovernanceCall(data), txId: index, destination: ACTOR, executed: false, confirmed: true,
        confirmationUnknown: false, confirmationCount: 2, required: 2, confirmations: [ACTOR], proposal: state }
    })
    const wrapper = render()
    try {
      await flushPromises()
      for (const label of ['创建提案', '修改提案', '禁用提案', '重新启用提案']) expect(button(wrapper, `执行（${label}）`).exists()).toBe(true)
    } finally { wrapper.unmount() }
  })
})
