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
            <h4>交易已发送</h4>
            <JvHashText :value="txHash" :truncate="0" :type="'tx'" />
            <a
              class="ct-tx-link"
              :href="`https://jscan.jnsdao.com/tx/${txHash}`"
              target="_blank"
              rel="noopener"
            >在 JScan 查看 ↗</a>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { getPublicClient } from '@wagmi/core'
import { writeContract } from 'wagmi/actions'
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

function selectFunction(fn: AbiFunction) {
  selectedFn.value = fn
  argValues.value = fn.inputs.map((input) => (input.type === 'bool' ? false : ''))
  result.value = null
  txHash.value = ''
}

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
      result.value = '✅ 交易已提交'
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
