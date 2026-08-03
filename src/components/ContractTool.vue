<template>
  <div class="contract-tool">
    <!-- 合约信息头 -->
    <div class="ct-header">
      <div class="ct-title">
        <span class="ct-icon">{{ contract.icon }}</span>
        <div>
          <h2>{{ contract.name }}</h2>
          <p class="ct-tag">{{ contract.tag }}</p>
        </div>
      </div>
      <div class="ct-address">
        <span class="label">合约地址</span>
        <JvHashText :value="contract.address" :truncate="0" />
      </div>
    </div>

    <div class="ct-body">
      <!-- 函数列表 -->
      <div class="ct-fn-list">
        <h3>📖 查询函数（view）</h3>
        <div class="fn-item-wrap">
          <button
            v-for="fn in readFunctions"
            :key="fn.name"
            class="fn-item"
            :class="{ active: selectedFn?.name === fn.name }"
            @click="selectFunction(fn)"
          >{{ fn.name }}</button>
          <div v-if="readFunctions.length === 0" class="fn-empty">无查询函数</div>
        </div>

        <h3>✍️ 写入函数（交易）</h3>
        <div class="fn-item-wrap">
          <button
            v-for="fn in writeFunctions"
            :key="fn.name"
            class="fn-item"
            :class="{ active: selectedFn?.name === fn.name }"
            @click="selectFunction(fn)"
          >{{ fn.name }}{{ fn.stateMutability === 'payable' ? ' 💰' : '' }}</button>
          <div v-if="writeFunctions.length === 0" class="fn-empty">无写入函数</div>
        </div>
      </div>

      <!-- 参数表单与执行 -->
      <div class="ct-panel">
        <h3 v-if="selectedFn" class="ct-fn-name">
          {{ selectedFn.name }}
          <span class="ct-mutability">{{ selectedFn.stateMutability }}</span>
        </h3>
        <div v-if="!selectedFn" class="ct-hint">👈 从左侧选择一个函数开始</div>

        <template v-if="selectedFn">
          <div v-if="selectedFn.inputs.length === 0" class="ct-no-args">该函数无参数</div>
          <div v-for="(input, i) in selectedFn.inputs" :key="i" class="ct-arg">
            <label :for="`arg-${i}`">
              {{ input.name || `arg${i}` }}
              <span class="arg-type">{{ input.type }}</span>
            </label>
            <input
              :id="`arg-${i}`"
              v-model="argValues[i]"
              :placeholder="placeholderFor(input.type)"
              class="ct-input"
              :class="{ 'is-bool': input.type === 'bool' }"
              :type="input.type === 'bool' ? 'checkbox' : 'text'"
            />
          </div>

          <div class="ct-exec">
            <JvActionButton :loading="loading" @click="execute">
              {{ selectedFn.stateMutability === 'view' || selectedFn.stateMutability === 'pure' ? '查询' : '发送交易' }}
            </JvActionButton>
          </div>

          <div v-if="result !== null" class="ct-result">
            <h4>结果</h4>
            <pre class="ct-result-pre">{{ result }}</pre>
          </div>

          <div v-if="txHash" class="ct-tx">
            <h4>交易</h4>
            <JvHashText :value="txHash" :truncate="0" :type="'tx'" />

            <div v-if="txStatus === 'pending'" class="ct-tx-badge pending">
              <span class="spinner"></span> 已提交，等待链上确认...
            </div>
            <div v-else-if="txStatus === 'success'" class="ct-tx-badge success">✅ 交易成功</div>
            <div v-else-if="txStatus === 'reverted'" class="ct-tx-badge reverted">❌ 交易失败（reverted）</div>

            <div v-if="receipt" class="ct-receipt">
              <div class="ct-receipt-row">
                <span>状态</span>
                <b :class="receipt.status === 'success' ? 'text-success' : 'text-error'">
                  {{ receipt.status === 'success' ? '成功' : '失败' }}
                </b>
              </div>
              <div class="ct-receipt-row"><span>区块高度</span><b>#{{ receipt.blockNumber.toString() }}</b></div>
              <div class="ct-receipt-row"><span>Gas 消耗</span><b>{{ receipt.gasUsed.toString() }}</b></div>
              <div class="ct-receipt-row"><span>Gas 价格</span><b>{{ formatGasPrice(receipt.effectiveGasPrice) }}</b></div>
              <div class="ct-receipt-row"><span>事件日志</span><b>{{ receipt.logs.length }} 条</b></div>
            </div>

            <a
              class="ct-tx-link"
              :href="`/#/tx/${txHash}`"
              target="_blank"
              rel="noopener"
            >查看交易详情 ↗</a>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onUnmounted } from 'vue'
import { getPublicClient } from '@wagmi/core'
import { writeContract, waitForTransactionReceipt } from 'wagmi/actions'
import { WaitForTransactionReceiptTimeoutError } from 'viem'
import type { TransactionReceipt } from 'viem'
import { config, useWalletStore } from '../stores/wallet'
import JvHashText from '../design-system/components/JvHashText.vue'
import JvActionButton from '../design-system/components/JvActionButton.vue'
import type { ToolboxContract } from '../contracts/toolbox'

const props = defineProps<{ contract: ToolboxContract }>()

const walletStore = useWalletStore()
const publicClient = getPublicClient(config)

type AbiFunction = {
  name: string
  type: 'function'
  stateMutability: string
  inputs: { name: string; type: string }[]
  outputs?: { name: string; type: string }[]
}

const readFunctions = computed(() =>
  (props.contract.abi as unknown as AbiFunction[]).filter(
    (x) => x.type === 'function' && (x.stateMutability === 'view' || x.stateMutability === 'pure')
  )
)

const writeFunctions = computed(() =>
  (props.contract.abi as unknown as AbiFunction[]).filter(
    (x) => x.type === 'function' && (x.stateMutability === 'nonpayable' || x.stateMutability === 'payable')
  )
)

const selectedFn = ref<AbiFunction | null>(null)
const argValues = ref<(string | boolean)[]>([])
const result = ref<string | null>(null)
const loading = ref(false)
const txHash = ref<string>('')
const txStatus = ref<'pending' | 'success' | 'reverted' | ''>('')
const receipt = ref<TransactionReceipt | null>(null)
let pollTimer: ReturnType<typeof setInterval> | null = null

function selectFunction(fn: AbiFunction) {
  selectedFn.value = fn
  argValues.value = fn.inputs.map((input) => (input.type === 'bool' ? false : ''))
  result.value = null
  txHash.value = ''
  txStatus.value = ''
  receipt.value = null
  stopPolling()
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

// 解码 revert data：Error(string) 与 Panic(uint256)
function decodeRevertReason(data: string): string {
  try {
    if (data.startsWith('0x08c379a0')) {
      // Error(string) — require/revert 带消息
      const body = data.slice(10)
      const offset = parseInt(body.slice(0, 64), 16) * 2
      const len = parseInt(body.slice(offset + 64, offset + 128), 16)
      const content = body.slice(offset + 128, offset + 128 + len * 2)
      return Buffer.from(content, 'hex').toString('utf8')
    }
    if (data.startsWith('0x4e487b71')) {
      // Panic(uint256) — 编译器内建错误
      const code = BigInt('0x' + data.slice(10, 74))
      const panicMap: Record<string, string> = {
        '1': 'assert 失败', '17': '算术溢出', '18': '除以零', '33': '枚举值越界',
        '34': '存储字节数组越界', '49': 'pop 空数组', '50': '数组越界', '65': '分配内存溢出', '81': '内部函数调用错误',
      }
      return `Panic(${code}): ${panicMap[code.toString()] || '未知错误'}`
    }
    return `revert data: ${data.slice(0, 18)}...`
  } catch {
    return ''
  }
}

// 通过 eth_call 重放交易获取合约 revert 原因
async function fetchRevertReason(hash: `0x${string}`, blockNumber: bigint): Promise<string | null> {
  try {
    const tx = await publicClient.getTransaction({ hash })
    // 在交易执行时的区块状态上重放调用，捕获 revert data
    const blockTag = `0x${(blockNumber - 1n).toString(16)}`
    await publicClient.request({
      method: 'eth_call',
      params: [{ from: tx.from, to: tx.to, data: tx.input, value: tx.value }, blockTag],
    } as never)
    return null // 重放成功说明当前状态已不 revert（状态已变），无原因可展示
  } catch (e: unknown) {
    const err = e as { data?: string; cause?: { data?: string; cause?: { data?: string } } }
    const data = err.data || err.cause?.data || err.cause?.cause?.data
    if (data && data !== '0x') {
      const reason = decodeRevertReason(data)
      if (reason) return reason
    }
    return null
  }
}

async function applyReceipt(rcpt: TransactionReceipt, notice = '') {
  receipt.value = rcpt
  txStatus.value = rcpt.status === 'success' ? 'success' : 'reverted'
  if (rcpt.status === 'success') {
    result.value = notice ? `${notice}\n✅ 交易已确认` : '✅ 交易已确认'
  } else {
    result.value = notice ? `${notice}\n❌ 合约调用失败` : '❌ 合约调用失败'
    try {
      const reason = await fetchRevertReason(rcpt.transactionHash, rcpt.blockNumber)
      if (reason) result.value = `${notice ? notice + '\n' : ''}❌ 合约调用失败：${reason}`
    } catch {
      // 拿不到 revert 原因时保持通用提示
    }
  }
}

// 超时后的后台轮询：mempool 拥堵时交易可能排队，持续监听直到进块
// 连续 12 次（约 60s）请求失败则如实提示网络异常
function pollReceipt(hash: `0x${string}`) {
  stopPolling()
  let failCount = 0
  pollTimer = setInterval(async () => {
    try {
      const rcpt = await publicClient.getTransactionReceipt({ hash })
      if (rcpt) {
        stopPolling()
        applyReceipt(rcpt)
      }
      failCount = 0
    } catch {
      failCount++
      if (failCount >= 12) {
        stopPolling()
        result.value = '⚠️ 网络异常，暂时无法获取交易状态，可点击下方链接查看最新情况'
      }
    }
  }, 5000)
}

onUnmounted(() => stopPolling())

function placeholderFor(type: string): string {
  if (type.startsWith('uint') || type.startsWith('int')) return '0 或 1000000000000000000'
  if (type === 'address') return '0x...'
  if (type === 'bool') return ''
  if (type === 'bytes' || type.startsWith('bytes')) return '0x...'
  if (type.endsWith('[]')) return '[1,2,3]'
  return ''
}

function parseArg(raw: string | boolean, type: string): unknown {
  if (type === 'bool') return Boolean(raw)
  if (raw === '' || raw === null) return undefined
  if (type.startsWith('uint') || type.startsWith('int')) return BigInt(String(raw))
  if (type === 'address') return raw as `0x${string}`
  if (type === 'bytes' || type.startsWith('bytes')) return raw as `0x${string}`
  if (type.endsWith('[]')) {
    try {
      const arr = JSON.parse(String(raw))
      return arr.map((item: unknown) => {
        const baseType = type.slice(0, -2)
        if (baseType.startsWith('uint') || baseType.startsWith('int')) return BigInt(String(item))
        return item
      })
    } catch {
      return []
    }
  }
  return raw
}

function formatGasPrice(price: bigint | undefined): string {
  if (price === undefined) return '-'
  const gwei = Number(price) / 1e9
  return `${gwei.toFixed(2)} Gwei`
}

function formatResult(data: unknown): string {
  const fmt = (v: unknown): unknown => {
    if (typeof v === 'bigint') return v.toString()
    if (Array.isArray(v)) return v.map(fmt)
    if (v && typeof v === 'object') {
      const o: Record<string, unknown> = {}
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        // 跳过数字键（数组元组在 viem 中会同时有数字键和命名键）
        if (/^\d+$/.test(k)) continue
        o[k] = fmt(val)
      }
      return o
    }
    return v
  }
  return JSON.stringify(fmt(data), null, 2)
}

async function execute() {
  const fn = selectedFn.value
  if (!fn) return
  loading.value = true
  result.value = null
  txHash.value = ''
  txStatus.value = ''
  receipt.value = null
  try {
    const args = fn.inputs.map((_, i) => parseArg(argValues.value[i], fn.inputs[i].type))
    if (fn.stateMutability === 'view' || fn.stateMutability === 'pure') {
      const data = await publicClient.readContract({
        address: props.contract.address,
        abi: props.contract.abi,
        functionName: fn.name as never,
        args: args as never,
      })
      result.value = formatResult(data)
    } else {
      if (!walletStore.isConnected) {
        await walletStore.connect()
      }
      if (!walletStore.isConnected) {
        result.value = '❌ 未连接钱包，无法发送交易'
        return
      }
      const hash = await writeContract(config, {
        address: props.contract.address,
        abi: props.contract.abi,
        functionName: fn.name as never,
        args: args as never,
      })
      txHash.value = hash
      txStatus.value = 'pending'
      try {
        // 监听交易确认：仅 120s 超时视为"排队中"，其余错误（替换/网络等）如实展示
        let replacedNotice = ''
        const rcpt = await waitForTransactionReceipt(config, {
          hash,
          timeout: 120_000,
          onReplaced: (r) => {
            const reasonMap = { cancelled: '已取消', replaced: '已被替换', repriced: '已加速替换' } as const
            replacedNotice = `⚠️ 原交易${reasonMap[r.reason] || '被替换'}，新交易 ${r.transaction.hash.slice(0, 10)}...`
          },
        })
        applyReceipt(rcpt, replacedNotice)
      } catch (e: unknown) {
        if (e instanceof WaitForTransactionReceiptTimeoutError) {
          // 仅真正超时才提示排队中，并转后台持续监听
          result.value = `⏳ 交易已提交（${hash.slice(0, 10)}...），链上排队中，进块后自动更新状态...`
          pollReceipt(hash)
        } else {
          // 其他错误（网络中断、RPC 异常等）诚实展示
          const msg = e instanceof Error ? e.message : String(e)
          result.value = `❌ 等待确认失败：${msg}`
          txStatus.value = ''
        }
      }
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    result.value = `❌ ${msg}`
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.contract-tool {
  max-width: 1100px;
  margin: 0 auto;
  padding: 28px 24px;
}

.ct-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
  flex-wrap: wrap;
  background: var(--jv-bg-surface);
  border: 1px solid var(--jv-border);
  border-radius: var(--jv-radius-lg);
  padding: 20px 24px;
  margin-bottom: 20px;
}

.ct-title {
  display: flex;
  align-items: center;
  gap: 14px;
}

.ct-icon {
  font-size: 2rem;
}

.ct-title h2 {
  margin: 0 0 4px 0;
  font-size: 1.4rem;
  color: var(--jv-text-primary);
}

.ct-tag {
  margin: 0;
  font-size: 0.85rem;
  color: var(--jv-text-muted);
}

.ct-address {
  text-align: right;
}

.ct-address .label {
  display: block;
  font-size: 0.75rem;
  color: var(--jv-text-muted);
  margin-bottom: 4px;
}

.ct-body {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 20px;
  align-items: start;
}

.ct-fn-list {
  background: var(--jv-bg-surface);
  border: 1px solid var(--jv-border);
  border-radius: var(--jv-radius-lg);
  padding: 18px;
}

.ct-fn-list h3 {
  margin: 0 0 10px 0;
  font-size: 0.9rem;
  color: var(--jv-text-secondary);
}

.ct-fn-list h3:not(:first-child) {
  margin-top: 18px;
}

.fn-item-wrap {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 220px;
  overflow-y: auto;
}

.fn-item {
  text-align: left;
  padding: 8px 12px;
  border: 1px solid var(--jv-border);
  border-radius: var(--jv-radius-md);
  background: var(--jv-bg-subtle);
  color: var(--jv-text-primary);
  font-size: 0.85rem;
  font-family: var(--jv-font-mono);
  cursor: pointer;
  transition: all var(--jv-duration-fast) var(--jv-ease);
}

.fn-item:hover {
  border-color: var(--jv-brand);
  color: var(--jv-brand);
}

.fn-item.active {
  background: var(--jv-brand);
  border-color: var(--jv-brand);
  color: #fff;
}

.fn-empty {
  font-size: 0.8rem;
  color: var(--jv-text-muted);
  padding: 8px 0;
}

.ct-panel {
  background: var(--jv-bg-surface);
  border: 1px solid var(--jv-border);
  border-radius: var(--jv-radius-lg);
  padding: 20px 24px;
}

.ct-fn-name {
  margin: 0 0 16px 0;
  font-size: 1.1rem;
  font-family: var(--jv-font-mono);
  color: var(--jv-text-primary);
}

.ct-mutability {
  font-size: 0.7rem;
  padding: 2px 8px;
  border-radius: var(--jv-radius-full);
  background: var(--jv-brand-subtle);
  color: var(--jv-brand);
  vertical-align: middle;
  margin-left: 6px;
}

.ct-hint {
  color: var(--jv-text-muted);
  font-size: 0.9rem;
  padding: 20px 0;
  text-align: center;
}

.ct-no-args {
  color: var(--jv-text-secondary);
  font-size: 0.9rem;
  margin-bottom: 16px;
}

.ct-arg {
  margin-bottom: 14px;
}

.ct-arg label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--jv-text-primary);
  margin-bottom: 6px;
  font-family: var(--jv-font-mono);
}

.arg-type {
  font-size: 0.7rem;
  color: var(--jv-text-muted);
  background: var(--jv-bg-subtle);
  padding: 2px 8px;
  border-radius: var(--jv-radius-full);
}

.ct-input {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid var(--jv-border);
  border-radius: var(--jv-radius-md);
  background: var(--jv-bg-subtle);
  color: var(--jv-text-primary);
  font-size: 0.88rem;
  font-family: var(--jv-font-mono);
  transition: border-color var(--jv-duration-fast) var(--jv-ease);
}

.ct-input:focus {
  outline: none;
  border-color: var(--jv-brand);
}

.ct-input.is-bool {
  width: 18px;
  height: 18px;
  accent-color: var(--jv-brand);
}

.ct-exec {
  margin: 18px 0;
}

.ct-result {
  margin-top: 16px;
  border-top: 1px solid var(--jv-border);
  padding-top: 14px;
}

.ct-result h4,
.ct-tx h4 {
  margin: 0 0 8px 0;
  font-size: 0.85rem;
  color: var(--jv-text-secondary);
}

.ct-result-pre {
  background: var(--jv-bg-subtle);
  border: 1px solid var(--jv-border);
  border-radius: var(--jv-radius-md);
  padding: 12px;
  font-size: 0.82rem;
  font-family: var(--jv-font-mono);
  color: var(--jv-text-primary);
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
}

.ct-tx {
  margin-top: 16px;
  border-top: 1px solid var(--jv-border);
  padding-top: 14px;
}

.ct-tx-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  padding: 6px 14px;
  border-radius: var(--jv-radius-full);
  font-size: 0.85rem;
  font-weight: 500;
}

.ct-tx-badge.pending { background: var(--jv-warning-bg); color: var(--jv-warning); }
.ct-tx-badge.success { background: var(--jv-success-bg); color: var(--jv-success); }
.ct-tx-badge.reverted { background: var(--jv-error-bg); color: var(--jv-error); }

.spinner {
  width: 12px;
  height: 12px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: ct-spin 0.8s linear infinite;
}

@keyframes ct-spin { to { transform: rotate(360deg); } }

.ct-receipt {
  margin-top: 12px;
  border: 1px solid var(--jv-border);
  border-radius: var(--jv-radius-md);
  overflow: hidden;
}

.ct-receipt-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  font-size: 0.82rem;
  font-family: var(--jv-font-mono);
}

.ct-receipt-row:nth-child(odd) { background: var(--jv-bg-subtle); }
.ct-receipt-row span { color: var(--jv-text-muted); }
.text-success { color: var(--jv-success); }
.text-error { color: var(--jv-error); }

.ct-tx-link {
  display: inline-block;
  margin-top: 8px;
  font-size: 0.85rem;
  color: var(--jv-link);
  text-decoration: none;
}

.ct-tx-link:hover {
  color: var(--jv-link-hover);
  text-decoration: underline;
}

@media (max-width: 768px) {
  .ct-body {
    grid-template-columns: 1fr;
  }

  .ct-address {
    text-align: left;
  }
}
</style>
