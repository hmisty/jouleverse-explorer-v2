<script setup lang="ts">
// JNSVote 治理端面板：创建提案（多签流程）+ 待确认交易管理
// 仅对「多签签名人」展示；普通投票者看不到本面板（isOwner 前置短路，零额外 RPC 负担）。
// 流程：签名人填表 → submitProposal（自动成为首确认人）→ 其余签名人 confirm → 任一签名人 execute。

import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { NButton, NInput, NTag, NSpin, NDivider } from 'naive-ui'
import { useMessage } from 'naive-ui'
import { useWalletStore } from '../stores/wallet'
import { useJNSVoteGovernance, type PendingProposalTx } from '../composables/useJNSVoteGovernance'
import { publicClient } from '../config/client'
import { JvHashText, JvActionButton } from '../design-system'
import { assertManagedOperation, GOVERNANCE_LABELS, parseProposalId, type GovernanceOperation, type ManagedProposal, type ProposalInput } from '../utils/jnsvote-governance'

const BLOCK_TIME_SEC = 15 // Jouleverse 平均出块时间（与 useJNSVote 一致）

const walletStore = useWalletStore()
const message = useMessage()
const gov = useJNSVoteGovernance()

// 解构 ref，供模板顶层自动解包（gov 是普通对象，模板访问 gov.xxx 不会自动解包）
const { isSigner, pendingTxs, isLoading, signers, loadError, reset, isWriting, pendingHash } = gov

// 表单
const form = ref({
  title: '',
  link: '',
  timeBegin: '',
  timeEnd: '',
})
const submitting = ref(false)
// per-tx 写操作 loading（防连点：确认/执行签名上链需十几秒）
const txBusyId = ref<number | null>(null)

// 当前区块高度（用于校验「开始区块须晚于当前」+ 提示起止区块合理值）
const currentBlock = ref(0n)
const blockReady = ref(false)
const busy = computed(() => submitting.value || isLoading.value || txBusyId.value !== null || isWriting.value || !!pendingHash.value)
const proposalIdInput = ref('')
const managed = ref<ManagedProposal | null>(null)
const managedChanged = ref(false)
const managingLoading = ref(false)
const manageError = ref('')
const editForm = ref({ title: '', link: '', timeBegin: '', timeEnd: '' })
let manageSeq = 0
const canManage = computed(() => !!managed.value && !managedChanged.value && blockReady.value && currentBlock.value < managed.value.timeBegin)
const editValid = computed(() => {
  const begin = parseBlockHeight(editForm.value.timeBegin), end = parseBlockHeight(editForm.value.timeEnd)
  return canManage.value && !!editForm.value.title.trim() && begin !== null && end !== null
    && begin > currentBlock.value && end > begin && end < 2n ** 256n
})
watch(proposalIdInput, () => { manageSeq++; managed.value = null; managedChanged.value = false; manageError.value = ''; managingLoading.value = false })
function clearManaged() { manageSeq++; managed.value = null; managedChanged.value = false; manageError.value = ''; managingLoading.value = false }
async function loadManaged() {
  if (busy.value || !isSigner.value) return
  const id = parseProposalId(proposalIdInput.value)
  if (id === null) { clearManaged(); manageError.value = '请输入有效提案编号（从1开始）'; return }
  const seq = ++manageSeq
  managed.value = null; managedChanged.value = false; manageError.value = ''; managingLoading.value = true
  try {
    const state = await gov.readManagedProposal(id)
    if (seq !== manageSeq) return
    managed.value = state; currentBlock.value = state.currentBlock; blockReady.value = true
    editForm.value = { title: state.title, link: state.link, timeBegin: String(state.timeBegin), timeEnd: String(state.timeEnd) }
  } catch (e) {
    if (seq === manageSeq) { manageError.value = e instanceof Error ? e.message : String(e); blockReady.value = false }
  } finally { if (seq === manageSeq) managingLoading.value = false }
}
async function updateCurrentBlock() {
  try { currentBlock.value = await publicClient.getBlockNumber({ cacheTime: 0 }); blockReady.value = true }
  catch { blockReady.value = false; throw new Error('无法获取当前区块高度，已取消操作，请刷新后重试') }
}
async function submitExisting(operation: Exclude<GovernanceOperation, 'create'>) {
  if (busy.value || !managed.value || !walletStore.address || !isSigner.value) return
  const selected = managed.value
  const draft = { ...editForm.value }
  const seq = manageSeq
  submitting.value = true
  try {
    const state = await gov.readManagedProposal(selected.id) // 表单端硬校验，不能信任页面旧快照。
    if (seq !== manageSeq) throw new Error('提案或账户已改变，请重新加载')
    currentBlock.value = state.currentBlock; blockReady.value = true
    if (state.title !== selected.title || state.link !== selected.link || state.timeBegin !== selected.timeBegin
      || state.timeEnd !== selected.timeEnd || state.disabled !== selected.disabled) {
      managed.value = state; managedChanged.value = true
      throw new Error('提案状态已改变，请重新加载后编辑或操作')
    }
    assertManagedOperation(operation, state)
    let txId: number
    if (operation === 'modify') {
      const begin = parseBlockHeight(draft.timeBegin), end = parseBlockHeight(draft.timeEnd)
      if (begin === null || end === null) throw new Error('请输入有效的开始与结束区块')
      txId = await gov.submitModification(selected.id, { title: draft.title.trim(), link: draft.link.trim(), timeBegin: begin, timeEnd: end })
    } else if (operation === 'disable') txId = await gov.submitDisable(selected.id)
    else txId = await gov.submitReenable(selected.id)
    message.success(`已提交「${GOVERNANCE_LABELS[operation]}」多签交易${txId >= 0 ? ` #${txId}` : ''}，请核查确认与执行状态`)
    clearManaged()
    await refresh()
  } catch (e) { message.error(e instanceof Error ? e.message : String(e)) }
  finally { submitting.value = false }
}
async function checkReceipt() {
  try { await gov.checkPendingReceipt(); message.success('回执已确认，请刷新核查提案与多签状态'); await refresh() }
  catch (e) { message.error(e instanceof Error ? e.message : String(e)) }
}

// 表单校验
const formValid = computed(() => {
  const tb = parseBlockHeight(form.value.timeBegin)
  const te = parseBlockHeight(form.value.timeEnd)
  return (
    blockReady.value && form.value.title.trim().length > 0 &&
    tb !== null &&
    te !== null &&
    // 产品规则：仅允许创建未来开始的提案，避免提交时已开始或来不及确认。
    tb > currentBlock.value &&
    te > tb && te < 2n ** 256n
  )
})

function parseBlockHeight(s: string): bigint | null {
  const t = s.trim()
  if (!/^\d+$/.test(t)) return null
  try {
    return BigInt(t)
  } catch {
    return null
  }
}

// 区块差 → 人类可读天数提示（建议 6：避免签名人自己心算区块对应哪天）
function blockDeltaHint(block: bigint): string {
  if (block <= currentBlock.value || currentBlock.value === 0n) return ''
  const seconds = Number(block - currentBlock.value) * BLOCK_TIME_SEC
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  if (days > 0) return hours > 0 ? `≈ ${days} 天 ${hours} 小时后` : `≈ ${days} 天后`
  if (hours > 0) return `≈ ${hours} 小时后`
  return '即将'
}

async function refresh() {
  if (!walletStore.address) return
  try { await updateCurrentBlock() } catch { /* 未知块高时所有写按钮保持禁用 */ }
  await gov.loadGovernance(walletStore.address)
}

async function handleSubmit() {
  if (busy.value || !walletStore.address || !isSigner.value) return
  const draft = { ...form.value }
  submitting.value = true
  try {
    await updateCurrentBlock()
    const begin = parseBlockHeight(draft.timeBegin), end = parseBlockHeight(draft.timeEnd)
    if (!formValid.value || begin === null || end === null) throw new Error('开始区块须晚于当前区块，且结束区块须晚于开始区块')
    const input: ProposalInput = { title: draft.title.trim(), link: draft.link.trim(), timeBegin: begin, timeEnd: end }
    const txId = await gov.submitProposal(input)
    message.success(`已提交创建多签交易${txId >= 0 ? ` #${txId}` : ''}（您已自动确认），请核查执行状态`)
    form.value = { title: '', link: '', timeBegin: '', timeEnd: '' }
    await refresh()
  } catch (e) { message.error(e instanceof Error ? e.message : String(e)) }
  finally { submitting.value = false }
}

async function handleConfirm(tx: PendingProposalTx) {
  if (busy.value) return
  txBusyId.value = tx.txId
  try {
    await updateCurrentBlock()
    if (isTxExpired(tx)) throw new Error('交易已过期或状态不可核验，已阻止确认')
    await gov.confirmTx(tx.txId, tx.data)
    message.success(`已确认交易 #${tx.txId}`)
    await refresh()
  } catch (e) {
    message.error(e instanceof Error ? e.message : String(e))
  } finally {
    txBusyId.value = null
  }
}

async function handleExecute(tx: PendingProposalTx) {
  if (busy.value) return
  if (isTxExpired(tx)) {
    message.error('该治理交易已过期或状态不可核验，请刷新')
    return
  }
  txBusyId.value = tx.txId
  try {
    await updateCurrentBlock()
    if (isTxExpired(tx)) throw new Error('交易已过期或状态不可核验，已阻止执行')
    await gov.executeTx(tx.txId, tx.data)
    message.success(`「${GOVERNANCE_LABELS[tx.operation]}」交易 #${tx.txId} 已上链，请核查提案状态`)
    await refresh()
  } catch (e) {
    message.error(e instanceof Error ? e.message : String(e))
  } finally {
    txBusyId.value = null
  }
}

function shortAddr(a: string): string {
  return a.length > 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a
}

// 页面快照仅用于提示；数据层会在确认/执行前再次读取链上状态。
function isTxExpired(tx: PendingProposalTx): boolean {
  if (!blockReady.value || tx.validationError) return true
  if (tx.operation === 'create') return tx.timeBegin <= currentBlock.value || tx.timeEnd <= tx.timeBegin
  if (!tx.proposal || tx.proposal.timeBegin <= currentBlock.value) return true
  return tx.operation === 'modify' && (tx.timeBegin <= currentBlock.value || tx.timeEnd <= tx.timeBegin)
}

// 地址 → 显示名。
// 以链上 getOwners() 顺序为准（signers 数组），本地 SIGNER_NAMES 只作可选装饰；
// 多签若改成员（如历史 addOwner），未命中映射时回退为「签名人 #N + 地址」，不会静默失效成裸地址（建议 3）
const SIGNER_NAMES: Record<string, string> = {
  '0x5bf50f2931688f886f46f88d5ceede530bb92076': 'Koant (J-0)',
  '0xe369810b1b07d0b82f702667429c3842905c14ff': '剪云为裳 (J-37)',
  '0xf66082f48cbc11ac83cdde11644f4db2f363205a': '明海云 (J-7)',
}
function signerName(a: string): string {
  const lower = a.toLowerCase()
  if (SIGNER_NAMES[lower]) return SIGNER_NAMES[lower]
  // 回退：在链上 signers 里找序号，显示「签名人 #N」；找不到再退化为短地址
  const idx = signers.value.findIndex((s) => s === lower)
  return idx >= 0 ? `签名人 #${idx + 1} ${shortAddr(a)}` : shortAddr(a)
}

onMounted(refresh)
onUnmounted(() => { clearManaged(); reset() })
watch(() => walletStore.address, (addr) => {
  clearManaged(); reset(); blockReady.value = false
  if (addr) refresh()
})
</script>

<template>
  <div v-if="isSigner" class="gov-panel">
    <NDivider title-placement="left">🛡️ 治理端（多签签名人专属）</NDivider>

    <div v-if="loadError" class="gov-load-error">⚠️ {{ loadError }}</div>

    <div class="gov-toolbar"><JvActionButton :disabled="busy" :loading="isLoading" @click="refresh">刷新治理状态</JvActionButton><span class="gov-form-hint">{{ blockReady ? `当前区块 #${currentBlock}` : '当前区块未知，已阻止写入' }}</span></div>
    <NSpin :show="isLoading">
      <!-- 创建提案表单 -->
      <div class="gov-form">
        <h3 class="gov-form-title">📝 创建新提案</h3>
        <div class="gov-form-row">
          <label class="gov-label">提案标题 *</label>
          <NInput v-model:value="form.title" placeholder="例如：批准 X 项治理决议" />
        </div>
        <div class="gov-form-row">
          <label class="gov-label">提案详情链接</label>
          <NInput v-model:value="form.link" placeholder="https://…（可选，指向完整提案文档）" />
        </div>
        <div class="gov-form-row">
          <label class="gov-label">开始区块 *</label>
          <NInput v-model:value="form.timeBegin" placeholder="如 8600000（须 > 当前区块）" />
          <div v-if="parseBlockHeight(form.timeBegin) !== null" class="gov-form-hint">
            开始区块 ≈ {{ blockDeltaHint(parseBlockHeight(form.timeBegin)!) }}
          </div>
        </div>
        <div class="gov-form-row">
          <label class="gov-label">结束区块 *</label>
          <NInput v-model:value="form.timeEnd" placeholder="如 8800000（须 > 开始区块）" />
          <div v-if="parseBlockHeight(form.timeEnd) !== null" class="gov-form-hint">
            结束区块 ≈ {{ blockDeltaHint(parseBlockHeight(form.timeEnd)!) }}
          </div>
        </div>
        <div v-if="currentBlock > 0n" class="gov-form-hint">
          当前区块：{{ currentBlock.toString() }}（约 {{ BLOCK_TIME_SEC }}s/块）
        </div>
        <NButton
          type="primary"
          :disabled="!formValid || busy"
          :loading="submitting"
          @click="handleSubmit"
        >
          提交创建（成为首确认人）
        </NButton>
      </div>

      <div class="gov-form gov-existing">
        <h3 class="gov-form-title">管理已有提案</h3>
        <p class="gov-form-hint">三项操作均仅在提案开始前开放。修改还要求新的开始区块晚于当前区块。请为多签确认和入块留足时间。</p>
        <div class="gov-form-row">
          <label class="gov-label" for="manage-proposal-id">提案编号</label>
          <NInput id="manage-proposal-id" v-model:value="proposalIdInput" :disabled="busy" placeholder="从1开始，例如1" @keyup.enter="loadManaged" />
        </div>
        <JvActionButton :loading="managingLoading" :disabled="busy || managingLoading" @click="loadManaged">加载提案并回显</JvActionButton>
        <p v-if="manageError" class="gov-load-error" role="alert">{{ manageError }}</p>
        <template v-if="managed">
          <p class="gov-form-hint">提案 #{{ managed.id }} · {{ managed.disabled ? '已禁用' : '未禁用' }} · 当前开始区块 #{{ managed.timeBegin }} · 核验区块 #{{ managed.currentBlock }}</p>
          <p v-if="managedChanged" class="gov-tx-expired" role="alert">链上提案状态已改变，请重新加载后操作；当前编辑内容不会直接提交。</p>
          <p v-else-if="!canManage" class="gov-tx-expired" role="alert">提案已经开始或当前区块不可核验，修改、禁用与重新启用均已阻断。</p>
          <div class="gov-form-row"><label class="gov-label" for="edit-proposal-title">修改后的标题</label><NInput id="edit-proposal-title" v-model:value="editForm.title" :disabled="busy || !canManage" /></div>
          <div class="gov-form-row"><label class="gov-label" for="edit-proposal-link">修改后的详情链接</label><NInput id="edit-proposal-link" v-model:value="editForm.link" :disabled="busy || !canManage" /></div>
          <div class="gov-form-row"><label class="gov-label" for="edit-proposal-begin">修改后的开始区块</label><NInput id="edit-proposal-begin" v-model:value="editForm.timeBegin" :disabled="busy || !canManage" /></div>
          <div class="gov-form-row"><label class="gov-label" for="edit-proposal-end">修改后的结束区块</label><NInput id="edit-proposal-end" v-model:value="editForm.timeEnd" :disabled="busy || !canManage" /></div>
          <div class="gov-tx-actions">
            <JvActionButton :disabled="busy || !editValid" :loading="submitting" @click="submitExisting('modify')">提交修改提案</JvActionButton>
            <JvActionButton v-if="!managed.disabled" :disabled="busy || !canManage" @click="submitExisting('disable')">提交禁用提案</JvActionButton>
            <JvActionButton v-else :disabled="busy || !canManage" @click="submitExisting('reenable')">提交重新启用提案</JvActionButton>
          </div>
        </template>
        <p class="gov-form-hint">此处仅提交多签调用，不直接以签名人身份调用提案合约；达到确认门槛时，确认操作可能立即执行。签名前核验通过，不保证交易一定在开始区块之前入块。</p>
      </div>
      <div v-if="pendingHash" class="gov-load-error" role="status">
        已广播：<JvHashText :value="pendingHash" type="tx" :truncate="16" />。请保留哈希；未确认前不会重复发送。
        <JvActionButton :loading="isWriting" @click="checkReceipt">查询已广播交易回执</JvActionButton>
      </div>

      <!-- 待确认交易列表（四类治理交易，见数据层白名单过滤） -->
      <div class="gov-pending">
        <h3 class="gov-form-title">⏳ 待确认的治理交易（{{ pendingTxs.length }}）</h3>
        <div v-if="pendingTxs.length === 0" class="gov-empty">
          暂无待执行的治理交易
        </div>
        <div v-for="tx in pendingTxs" :key="tx.txId" class="gov-tx">
          <div class="gov-tx-head">
            <span class="gov-tx-id">#{{ tx.txId }}</span>
            <NTag size="small" type="info">{{ GOVERNANCE_LABELS[tx.operation] }}</NTag>
            <span v-if="tx.proposalId !== null">提案 #{{ tx.proposalId }}</span>
            <NTag size="small" :type="tx.confirmed ? 'success' : 'warning'">
              {{ tx.confirmationUnknown ? '确认状态未知' : (tx.confirmed ? `${tx.confirmationCount}/${tx.required} 已确认` : `${tx.confirmationCount}/${tx.required} 确认中`) }}
            </NTag>
          </div>
          <div class="gov-tx-title">{{ tx.title }}</div>
          <div class="gov-tx-meta">
            目标：<JvHashText :value="tx.destination" type="address" :truncate="12" />
            ｜区块 {{ tx.timeBegin.toString() }} → {{ tx.timeEnd.toString() }}
          </div>
          <div v-if="tx.operation === 'modify' && tx.proposal" class="gov-form-hint">
            当前开始区块 #{{ tx.proposal.timeBegin }} → 新开始区块 #{{ tx.timeBegin }}
          </div>
          <details class="gov-tx-details">
            <summary>核对完整治理参数</summary>
            <p>类型：{{ GOVERNANCE_LABELS[tx.operation] }}；提案编号：{{ tx.proposalId ?? '创建后分配' }}</p>
            <p>标题：{{ tx.title }}</p><p>详情链接（仅作为数据展示）：{{ tx.link || '空' }}</p>
            <p>开始区块：{{ tx.timeBegin }}；结束区块：{{ tx.timeEnd }}；附带原生金额：0</p>
            <pre>{{ tx.data }}</pre>
          </details>
          <div class="gov-tx-confirmers">
            已确认：<span v-for="c in tx.confirmations" :key="c" class="gov-signer">{{ signerName(c) }}</span>
          </div>
          <div v-if="isTxExpired(tx)" class="gov-tx-expired">
            ⚠️ {{ tx.validationError || '提案已开始、新开始区块已到达或区块状态不可核验，已阻止确认与执行' }}
          </div>
          <div class="gov-tx-actions">
            <NButton
              v-if="!tx.confirmationUnknown && !tx.confirmed && !tx.confirmations.includes((walletStore.address || '').toLowerCase())"
              size="small"
              type="primary"
              ghost
              :loading="txBusyId === tx.txId"
              :disabled="busy || isTxExpired(tx)"
              @click="handleConfirm(tx)"
            >
              确认
            </NButton>
            <NButton
              v-if="!tx.confirmationUnknown && tx.confirmed"
              size="small"
              type="success"
              :loading="txBusyId === tx.txId"
              :disabled="busy || isTxExpired(tx)"
              @click="handleExecute(tx)"
            >
              执行（{{ GOVERNANCE_LABELS[tx.operation] }}）
            </NButton>
          </div>
        </div>
      </div>
    </NSpin>
  </div>
</template>

<style scoped>
.gov-panel {
  margin: 20px 0;
  padding: 16px 18px;
  min-width: 0;
  color: var(--jv-text-primary);
  border: 1px solid var(--jv-border, #e5e5e5);
  border-radius: 12px;
  background: var(--jv-bg-surface, #fff);
}
.gov-form-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
}
.gov-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}
.gov-form-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.gov-label {
  font-size: 13px;
  color: var(--jv-text-secondary, #475569);
}
.gov-toolbar { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 16px; }
.gov-form-hint {
  overflow-wrap: anywhere;
  font-size: 12px;
  color: var(--jv-text-muted, #64748b);
}
.gov-load-error {
  margin-bottom: 12px;
  padding: 8px 12px;
  font-size: 13px;
  color: var(--jv-error, #dc2626);
  background: var(--jv-error-bg, #fef2f2);
  border-radius: 8px;
}
.gov-pending {
  border-top: 1px solid var(--jv-border, #e5e5e5);
  padding-top: 16px;
}
.gov-empty {
  font-size: 13px;
  color: var(--jv-text-muted, #64748b);
}
.gov-tx {
  border: 1px solid var(--jv-border, #e5e5e5);
  border-radius: 10px;
  padding: 12px 14px;
  margin-bottom: 10px;
}
.gov-tx-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.gov-tx-id {
  font-weight: 700;
  color: var(--jv-success, #16a34a);
}
.gov-tx-title {
  font-size: 14px;
  font-weight: 600;
  overflow-wrap: anywhere;
  margin-bottom: 6px;
}
.gov-tx-meta {
  font-size: 12px;
  color: var(--jv-text-secondary, #475569);
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.gov-tx-confirmers {
  font-size: 12px;
  color: var(--jv-text-secondary, #475569);
  margin: 6px 0;
}
.gov-tx-details { color: var(--jv-text-secondary); font-size: 12px; margin: 8px 0; overflow-wrap: anywhere; }
.gov-tx-details pre { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 160px; overflow: auto; padding: 8px; background: var(--jv-bg-subtle); }
.gov-signer {
  display: inline-block;
  margin-right: 6px;
  padding: 1px 8px;
  border-radius: 6px;
  background: var(--jv-bg-subtle, #f1f5f9);
}
.gov-tx-expired {
  font-size: 12px;
  color: var(--jv-warning, #d97706);
  margin: 6px 0;
}
.gov-tx-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 8px;
}
</style>
