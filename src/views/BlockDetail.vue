<template>
  <div class="block-detail">
    <div class="header">
      <button @click="$router.push('/')" class="back-btn">← 返回首页</button>
      <h1 v-if="loading">加载区块 {{ blockNumber }} 中...</h1>
      <h1 v-else-if="block">区块 #{{ block.number }}</h1>
      <h1 v-else>区块 #{{ blockNumber }} 未找到</h1>
    </div>

    <div v-if="block" class="block-info">
      <div class="info-section">
        <h2>区块信息</h2>
        <div class="info-grid">
          <div class="info-item">
            <span class="label">区块号</span>
            <span class="value">{{ block.number }}</span>
          </div>
          <div class="info-item">
            <span class="label">区块哈希</span>
            <JvHashText :value="block.hash" type="block" :truncate="12" :linkable="false" />
          </div>
          <div class="info-item">
            <span class="label">父区块哈希</span>
            <JvHashText :value="block.parentHash" type="block" :truncate="12" :linkable="false" />
          </div>
          <div class="info-item">
            <span class="label">时间戳</span>
            <span class="value">{{ formatTimestamp(block.timestamp) }} <span class="muted">(UTC) · {{ formatAge(block.timestamp) }}</span></span>
          </div>
          <div class="info-item">
            <span class="label">矿工</span>
            <span class="value">
              <template v-if="labelOf(block.miner)">
                <span class="addr-tag">{{ labelOf(block.miner) }}</span>
                <span class="addr-sub">{{ shortAddr(block.miner) }}</span>
              </template>
              <JvHashText v-else :value="block.miner" type="address" :truncate="8" :linkable="false" />
            </span>
          </div>
          <div class="info-item">
            <span class="label">Gas 限制</span>
            <span class="value">{{ formatNumber(block.gasLimit) }}</span>
          </div>
          <div class="info-item">
            <span class="label">Gas 使用</span>
            <span class="value">{{ formatNumber(block.gasUsed) }}</span>
          </div>
          <div class="info-item">
            <span class="label">Gas 使用率</span>
            <span class="value">{{ calculateGasUsed(block.gasUsed, block.gasLimit) }}%</span>
          </div>
          <div class="info-item">
            <span class="label">交易数</span>
            <span class="value">{{ block.transactions.length }}</span>
          </div>
          <div class="info-item">
            <span class="label">难度</span>
            <span class="value">{{ block.difficulty.toString() }}</span>
          </div>
          <div class="info-item">
            <span class="label">随机数</span>
            <span class="value">{{ block.nonce }}</span>
          </div>
          <div class="info-item">
            <span class="label">大小</span>
            <span class="value">{{ block.size }} bytes</span>
          </div>
        </div>
      </div>

      <div class="transactions-section" v-if="block.transactions.length > 0">
        <h2>交易列表 ({{ block.transactions.length }})</h2>
        <div class="transactions-list">
          <div
            v-for="(tx, index) in block.transactions"
            :key="tx.hash ?? index"
            class="transaction-item"
            @click="viewTransaction(tx.hash)"
          >
            <div class="tx-header">
              <span class="tx-index">#{{ index }}</span>
              <JvHashText :value="tx.hash" type="tx" :truncate="8" :linkable="false" />
            </div>
            <div class="tx-fields">
              <div class="tx-field">
                <span class="tx-label">发送方</span>
                <span class="tx-value">
                  <template v-if="labelOf(tx.from)">
                    <span class="addr-tag">{{ labelOf(tx.from) }}</span>
                    <span class="addr-sub">{{ shortAddr(tx.from) }}</span>
                  </template>
                  <JvHashText v-else :value="tx.from" type="address" :truncate="8" :linkable="false" />
                </span>
              </div>
              <div class="tx-field">
                <span class="tx-label">接收方</span>
                <span class="tx-value">
                  <template v-if="labelOf(tx.to)">
                    <span class="addr-tag">{{ labelOf(tx.to) }}</span>
                    <span class="addr-sub">{{ shortAddr(tx.to) }}</span>
                  </template>
                  <span v-else-if="tx.to === null" class="tx-value muted">合约创建</span>
                  <JvHashText v-else :value="tx.to" type="address" :truncate="8" :linkable="false" />
                </span>
              </div>
              <div class="tx-field">
                <span class="tx-label">金额</span>
                <span class="tx-value"><JvAmount :value="tx.value" unit="J" :maxDecimals="4" /></span>
              </div>
              <div class="tx-field">
                <span class="tx-label">Gas 限制</span>
                <span class="tx-value">{{ formatNumber(tx.gas) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="empty-section" v-else>
        <JvPageState type="empty" title="此区块没有交易" />
      </div>
    </div>

    <div v-else-if="!loading" class="error-section">
      <JvPageState
        type="network-error"
        :title="`未找到区块 #${blockNumber}`"
        description="区块数据不存在或加载失败，请检查区块号是否正确。"
        action="返回首页"
        @action="$router.push('/')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { publicClient } from '../config/client'
import { formatNumber, formatAge } from '../utils/format'
import { toolboxContracts } from '../contracts/toolbox'
import { JvHashText, JvAmount, JvPageState } from '../design-system'

const router = useRouter()

interface Props {
  number: string
}

const props = defineProps<Props>()

const block = ref<any>(null)
const loading = ref(true)
const blockNumber = ref(props.number)

// B2：地址 → 可读标签（纯前端本地映射，来自 toolbox.ts 12 个合约）
const contractLabelMap: Record<string, string> = {}
for (const c of toolboxContracts) {
  contractLabelMap[c.address.toLowerCase()] = c.name
}

const labelOf = (addr: string | null | undefined): string | null => {
  if (!addr) return null
  return contractLabelMap[addr.toLowerCase()] ?? null
}

const shortAddr = (addr: string): string =>
  addr.length > 14 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr

const formatTimestamp = (timestamp: bigint): string => {
  const date = new Date(Number(timestamp) * 1000)
  return date.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, timeZone: 'UTC',
  })
}


const calculateGasUsed = (used: bigint, limit: bigint): number =>
  Math.round((Number(used) / Number(limit)) * 100)

const viewTransaction = (txHash: string) => router.push(`/tx/${txHash}`)

const loadBlock = async () => {
  loading.value = true
  try {
    block.value = await publicClient.getBlock({
      blockNumber: BigInt(props.number),
      includeTransactions: true,
    })
  } catch (error) {
    console.error('Failed to fetch block:', error)
    block.value = null
  } finally {
    loading.value = false
  }
}

onMounted(() => { loadBlock() })
</script>

<style scoped>
.block-detail {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.header {
  margin-bottom: 30px;
}

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

.block-info { display: flex; flex-direction: column; gap: 30px; }

.info-section, .transactions-section {
  background: var(--jv-bg-surface);
  border: 1px solid var(--jv-border);
  border-radius: var(--jv-radius-lg);
  padding: 20px;
}

.info-section h2, .transactions-section h2 {
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

.transactions-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 480px;
  overflow-y: auto;
  padding-right: 4px;
}

.transaction-item {
  padding: 12px;
  background: var(--jv-bg-subtle);
  border-radius: var(--jv-radius-md);
  cursor: pointer;
  transition: background var(--jv-duration-fast) var(--jv-ease);
}
.transaction-item:hover { background: var(--jv-bg-hover); }

.tx-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.tx-index {
  color: var(--jv-text-muted);
  font-size: 0.85rem;
  font-weight: 600;
}

.tx-fields {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 6px 16px;
}

.tx-field {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.tx-label {
  color: var(--jv-text-muted);
  font-size: 0.78rem;
}

.tx-value {
  color: var(--jv-text-primary);
  font-size: 0.85rem;
  word-break: break-all;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.addr-tag {
  color: var(--jv-brand);
  font-size: 0.85rem;
  font-weight: 600;
}

.addr-sub {
  color: var(--jv-text-muted);
  font-size: 0.78rem;
}

.muted { color: var(--jv-text-muted); font-size: 0.82rem; }

.empty-section, .error-section {
  background: var(--jv-bg-surface);
  border: 1px solid var(--jv-border);
  border-radius: var(--jv-radius-lg);
  padding: 40px;
}
</style>
