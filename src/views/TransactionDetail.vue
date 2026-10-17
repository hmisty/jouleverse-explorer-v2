<template>
  <div class="transaction-detail">
    <div class="header">
      <button @click="$router.push('/')" class="back-btn">← 返回首页</button>
      <h1 v-if="loading">加载交易中...</h1>
      <h1 v-else-if="transaction">交易详情</h1>
      <h1 v-else>交易未找到</h1>
    </div>

    <div v-if="transaction" class="transaction-info">
      <div class="info-section">
        <h2>交易信息</h2>
        <div class="info-grid">
          <div class="info-item">
            <span class="label">交易哈希</span>
            <JvHashText :value="transaction.hash" type="tx" :truncate="12" :linkable="false" />
          </div>
          <div class="info-item">
            <span class="label">状态</span>
            <JvStatusTag :status="transaction.status === 'success' ? 'tx-success' : 'tx-failed'" />
          </div>
          <div class="info-item">
            <span class="label">区块</span>
            <JvHashText :value="String(transaction.blockNumber)" type="block" :truncate="0" />
          </div>
          <div class="info-item">
            <span class="label">时间戳</span>
            <span class="value">{{ formatTimestamp(transaction.blockTimestamp) }} <span class="muted">(UTC) · {{ formatAge(transaction.blockTimestamp) }}</span></span>
          </div>
          <div class="info-item">
            <span class="label">发送方</span>
            <JvHashText :value="transaction.from" type="address" :truncate="8" />
          </div>
          <div class="info-item">
            <span class="label">接收方</span>
            <JvHashText v-if="transaction.to" :value="transaction.to" type="address" :truncate="8" />
            <span v-else class="value">合约创建</span>
          </div>
          <div class="info-item">
            <span class="label">发送金额</span>
            <JvAmount :value="transaction.value" unit="J" />
          </div>
          <div class="info-item" v-if="transaction.gasPrice">
            <span class="label">Gas 价格</span>
            <JvAmount :value="transaction.gasPrice" :decimals="9" unit="Gwei" :maxDecimals="4" />
          </div>
          <div class="info-item">
            <span class="label">Gas 限制</span>
            <span class="value">{{ formatNumber(transaction.gas) }}</span>
          </div>
          <div class="info-item">
            <span class="label">Gas 使用</span>
            <span class="value">{{ formatNumber(transaction.gasUsed || 0) }}</span>
          </div>
          <div class="info-item">
            <span class="label">交易手续费</span>
            <JvAmount v-if="txFee !== null" :value="txFee" unit="J" :maxDecimals="6" />
            <span v-else class="muted">—</span>
          </div>
          <div class="info-item">
            <span class="label">随机数</span>
            <span class="value">{{ transaction.nonce }}</span>
          </div>
          <div class="info-item">
            <span class="label">输入数据</span>
            <div class="value mono input-value">
              <span v-if="!transaction.input || transaction.input === '0x'" class="muted">无</span>
              <template v-else>
                <span class="input-text">{{ inputExpanded ? transaction.input : formatInput(transaction.input) }}</span>
                <span class="input-actions">
                  <button v-if="transaction.input.length > 50" class="input-btn" @click="inputExpanded = !inputExpanded">
                    {{ inputExpanded ? '收起' : '展开' }}
                  </button>
                  <button class="input-btn" @click="copyInput">
                    {{ copyState === 'copied' ? '已复制' : copyState === 'error' ? '复制失败' : '复制' }}
                  </button>
                </span>
                <span v-if="copyState === 'error'" class="copy-hint">复制失败，请长按输入内容手动选择复制</span>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else-if="!loading" class="error-section">
      <JvPageState
        type="network-error"
        title="交易未找到"
        :description="`找不到交易: ${txHash}`"
        action="返回首页"
        @action="$router.push('/')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onScopeDispose } from 'vue'
import { publicClient } from '../config/client'
import { formatNumber, formatAge } from '../utils/format'
import { JvHashText, JvStatusTag, JvAmount, JvPageState } from '../design-system'

interface Props {
  hash: string
}

const props = defineProps<Props>()

const transaction = ref<any>(null)
const loading = ref(true)
const txHash = ref(props.hash)
const inputExpanded = ref(false)
const copyState = ref<'idle' | 'copied' | 'error'>('idle')
let copyTimer: ReturnType<typeof setTimeout> | undefined

/** 重置 copyState 的定时器：保存 id，下次触发前先 clearTimeout，避免旧定时器把新状态提前重置 */
const scheduleCopyReset = (delayMs: number) => {
  if (copyTimer !== undefined) clearTimeout(copyTimer)
  copyTimer = setTimeout(() => { copyState.value = 'idle'; copyTimer = undefined }, delayMs)
}

// 组件卸载时清理挂起的 copyTimer，避免卸载后定时器仍触发（与仓库 disposed/onScopeDispose 风格一致）
onScopeDispose(() => { if (copyTimer !== undefined) clearTimeout(copyTimer) })

const formatTimestamp = (timestamp: bigint): string => {
  const date = new Date(Number(timestamp) * 1000)
  return date.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, timeZone: 'UTC',
  })
}

// 交易手续费 = gasUsed × effectiveGasPrice（本链 Clique/PoA 非 1559，effectiveGasPrice 为 null 时回退 gasPrice）
const txFee = computed<bigint | null>(() => {
  const t = transaction.value
  if (!t) return null
  const gasUsed = t.gasUsed ?? null
  const price = t.effectiveGasPrice ?? t.gasPrice ?? null
  if (gasUsed == null || price == null) return null
  const gasUsedBig = typeof gasUsed === 'bigint' ? gasUsed : BigInt(gasUsed)
  const priceBig = typeof price === 'bigint' ? price : BigInt(price)
  return gasUsedBig * priceBig
})

const formatInput = (input: string): string => {
  if (!input || input === '0x') return '无'
  if (input.length <= 50) return input
  return `${input.substring(0, 50)}...`
}

const copyInput = async () => {
  if (!transaction.value?.input) return
  try {
    // 非 HTTPS 环境下 navigator.clipboard 可能为 undefined，需显式判空
    if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
    await navigator.clipboard.writeText(transaction.value.input)
    copyState.value = 'copied'
    scheduleCopyReset(1500)
  } catch {
    // 剪贴板不可用（非 HTTPS / 权限被拒）：友好提示，不抛错、不白屏
    copyState.value = 'error'
    scheduleCopyReset(2500)
  }
}

const loadTransaction = async () => {
  loading.value = true
  try {
    const [txData, receipt] = await Promise.all([
      publicClient.getTransaction({ hash: props.hash as `0x${string}` }),
      publicClient.getTransactionReceipt({ hash: props.hash as `0x${string}` }),
    ])
    const block = await publicClient.getBlock({ blockNumber: txData.blockNumber! })
    transaction.value = { ...txData, ...receipt, blockTimestamp: block.timestamp }
  } catch (error) {
    console.error('Failed to fetch transaction:', error)
    transaction.value = null
  } finally {
    loading.value = false
  }
}

onMounted(() => { loadTransaction() })
</script>

<style scoped>
.transaction-detail {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.header { margin-bottom: 30px; }

.back-btn {
  background: var(--jv-bg-subtle);
  color: var(--jv-text-muted);
  border: none;
  padding: 8px 16px;
  border-radius: var(--jv-radius-md);
  cursor: pointer;
  margin-bottom: 20px;
  display: inline-block;
  transition: background var(--jv-duration-fast) var(--jv-ease);
}
.back-btn:hover { background: var(--jv-bg-hover); }

.header h1 { color: var(--jv-text-primary); margin: 0; }

.transaction-info { display: flex; flex-direction: column; gap: 30px; }

.info-section {
  background: var(--jv-bg-surface);
  border: 1px solid var(--jv-border);
  border-radius: var(--jv-radius-lg);
  padding: 20px;
}

.info-section h2 {
  color: var(--jv-text-primary);
  margin: 0 0 20px 0;
  font-size: 1.25rem;
}

.info-grid { display: grid; gap: 16px; }

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: var(--jv-bg-subtle);
  border-radius: var(--jv-radius-md);
}

.info-item .label {
  color: var(--jv-text-muted);
  font-size: 0.9rem;
  min-width: 200px;
}

.info-item .value {
  color: var(--jv-text-primary);
  font-size: 0.9rem;
  word-break: break-all;
  max-width: 70%;
}

.info-item .value.mono {
  font-family: var(--jv-font-mono);
  color: var(--jv-text-secondary);
}

.muted { color: var(--jv-text-muted); font-size: 0.82rem; }

.input-value {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}

.input-text {
  font-family: var(--jv-font-mono);
  word-break: break-all;
  text-align: right;
}

.input-actions { display: flex; gap: 8px; }

.input-btn {
  background: none;
  border: 1px solid var(--jv-border);
  color: var(--jv-text-secondary);
  padding: 2px 8px;
  border-radius: var(--jv-radius-sm);
  cursor: pointer;
  font-size: 0.78rem;
  transition: border-color var(--jv-duration-fast) var(--jv-ease), color var(--jv-duration-fast) var(--jv-ease);
}
.input-btn:hover { border-color: var(--jv-brand); color: var(--jv-brand); }

.copy-hint {
  color: var(--jv-text-muted);
  font-size: 0.78rem;
  text-align: right;
}

.error-section {
  background: var(--jv-bg-surface);
  border: 1px solid var(--jv-border);
  border-radius: var(--jv-radius-lg);
  padding: 40px;
}
</style>
