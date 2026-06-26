<template>
  <div class="wj-operations">
    <div v-if="!walletStore.isConnected" class="info-section wallet-prompt">
      <h2>🔐 钱包操作</h2>
      <p>WJ 操作功能需要连接钱包。</p>
    </div>

    <div v-else-if="walletStore.address?.toLowerCase() !== address.toLowerCase()" class="info-section wallet-warning">
      <h2>⚠️ 地址不匹配</h2>
      <p>当前连接的钱包地址不是此页面地址，无法操作。</p>
      <p>连接地址：{{ walletStore.formatAddress(walletStore.address) }}</p>
      <p>页面地址：{{ formatAddress(address) }}</p>
    </div>

    <div v-else class="info-section wj-operations">
      <h2>🔧 WJ 操作</h2>
      <div class="wallet-info-badge">
        <span class="badge">✓ 钱包已连接</span>
        <span class="balance">可用 WJ：{{ formatBalance(wjBalance) }} WJ</span>
      </div>

      <div class="operation-tabs">
        <button :class="{ active: activeTab === 'withdraw' }" @click="activeTab = 'withdraw'" class="tab-btn">💰 释放 J</button>
        <button :class="{ active: activeTab === 'transfer' }" @click="activeTab = 'transfer'" class="tab-btn">➡️ 转账 WJ</button>
      </div>

      <div v-if="activeTab === 'withdraw'" class="operation-form">
        <div class="form-group">
          <label>目标地址（将 J 释放到此地址）</label>
          <input v-model="withdrawForm.to" placeholder="0x..." class="form-input">
        </div>
        <div class="form-group">
          <label>数量 (WJ)</label>
          <input
            v-model="withdrawForm.amount"
            type="text"
            placeholder="0.0"
            class="form-input"
            min="0"
            step="0.000000000000000001"
            @input="handleAmountInput('withdraw', $event)"
          >
          <span class="balance-hint">可用：{{ formatBalance(wjBalance) }} WJ</span>
        </div>
        <button @click="handleWithdraw" :disabled="loadingOperation || !withdrawForm.to || !withdrawForm.amount" class="btn-primary">
          {{ loadingOperation ? '处理中...' : '释放 J' }}
        </button>
        <p v-if="operationSuccess" class="success-message">{{ operationSuccess }}</p>
        <p v-if="operationError" class="error-message">{{ operationError }}</p>
      </div>

      <div v-if="activeTab === 'transfer'" class="operation-form">
        <div class="form-group">
          <label>接收地址</label>
          <input v-model="transferForm.to" placeholder="0x..." class="form-input">
        </div>
        <div class="form-group">
          <label>数量 (WJ)</label>
          <input
            v-model="transferForm.amount"
            type="text"
            placeholder="0.0"
            class="form-input"
            min="0"
            step="0.000000000000000001"
            @input="handleAmountInput('transfer', $event)"
          >
          <span class="balance-hint">可用：{{ formatBalance(wjBalance) }} WJ</span>
        </div>
        <button @click="handleTransfer" :disabled="loadingOperation || !transferForm.to || !transferForm.amount" class="btn-primary">
          {{ loadingOperation ? '处理中...' : '转账' }}
        </button>
        <p v-if="operationSuccess" class="success-message">{{ operationSuccess }}</p>
        <p v-if="operationError" class="error-message">{{ operationError }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { parseEther } from 'viem'
import { useWalletStore } from '../stores/wallet'
import { WJ_ADDRESS, wjABI } from '../contracts/wj'
import { jouleverseChain } from '../config/chain'

interface Props {
  address: string
  wjBalance: bigint | null
  formatAddress: (addr: string) => string
  formatBalance: (bal: bigint | null) => string
}

const props = defineProps<Props>()
const walletStore = useWalletStore()

const activeTab = ref<'withdraw' | 'transfer'>('withdraw')
const loadingOperation = ref(false)
const operationError = ref<string | null>(null)
const operationSuccess = ref<string | null>(null)
const withdrawForm = ref({ to: '', amount: '' })
const transferForm = ref({ to: '', amount: '' })

const safeErrorMessage = (error: unknown): string => {
  try {
    if (error === null || error === undefined) return 'Unknown error'
    if (typeof error === 'string') return error
    if (typeof error === 'object') {
      if ('message' in error && typeof (error as any).message === 'string') {
        return (error as any).message
      }
      if ('toString' in error && typeof (error as any).toString === 'function') {
        try { return (error as any).toString() } catch { return 'Could not convert error to string' }
      }
    }
    return String(error)
  } catch {
    return 'Could not parse error'
  }
}

const handleAmountInput = (type: 'withdraw' | 'transfer', event: Event) => {
  const target = event.target as HTMLInputElement
  let value = target.value.replace(/[^\d.]/g, '')
  const parts = value.split('.')
  if (parts.length > 2) value = parts[0] + '.' + parts.slice(1).join('')
  if (type === 'withdraw') {
    withdrawForm.value.amount = value
  } else {
    transferForm.value.amount = value
  }
}

const handleWithdraw = async () => {
  if (!walletStore.address) {
    operationError.value = '钱包未连接'
    return
  }

  loadingOperation.value = true
  operationError.value = null
  operationSuccess.value = null

  try {
    const to = withdrawForm.value.to
    const amountStr = String(withdrawForm.value.amount || '0')

    if (!/^\d*\.?\d+$/.test(amountStr) && amountStr !== '0') {
      throw new Error(`无效的数量: "${amountStr}"，请输入正数`)
    }

    const amount = parseEther(amountStr)

    const { writeContract, switchChain } = await import('wagmi/actions')
    const { config: wagmiConfig } = await import('../stores/wallet')

    try {
      await switchChain(wagmiConfig, { chainId: jouleverseChain.id })
    } catch {
      // 已在正确链上时 switchChain 会报错，忽略
    }

    const hash = await writeContract(wagmiConfig, {
      address: WJ_ADDRESS,
      abi: wjABI,
      functionName: 'withdrawTo',
      args: [to as `0x${string}`, amount],
    })

    operationSuccess.value = `释放 J 交易已提交！哈希: ${hash.slice(0, 10)}...`
    await walletStore.refreshBalances()
    withdrawForm.value = { to: '', amount: '' }
  } catch (error) {
    console.error('[WJOperations] Withdraw failed:', error)
    operationError.value = '释放 J 失败: ' + safeErrorMessage(error)
  } finally {
    loadingOperation.value = false
  }
}

const handleTransfer = async () => {
  if (!walletStore.address) {
    operationError.value = '钱包未连接'
    return
  }

  loadingOperation.value = true
  operationError.value = null
  operationSuccess.value = null

  try {
    const to = transferForm.value.to
    const amountStr = String(transferForm.value.amount || '0')

    if (!/^\d*\.?\d+$/.test(amountStr) && amountStr !== '0') {
      throw new Error(`无效的数量: "${amountStr}"，请输入正数`)
    }

    const amount = parseEther(amountStr)

    const { writeContract, switchChain } = await import('wagmi/actions')
    const { config: wagmiConfig } = await import('../stores/wallet')

    try {
      await switchChain(wagmiConfig, { chainId: jouleverseChain.id })
    } catch {
      // 已在正确链上时 switchChain 会报错，忽略
    }

    const hash = await writeContract(wagmiConfig, {
      address: WJ_ADDRESS,
      abi: wjABI,
      functionName: 'transfer',
      args: [to as `0x${string}`, amount],
    })

    operationSuccess.value = `转账交易已提交！哈希: ${hash.slice(0, 10)}...`
    await walletStore.refreshBalances()
    transferForm.value = { to: '', amount: '' }
  } catch (error) {
    console.error('[WJOperations] Transfer failed:', error)
    operationError.value = '转账失败: ' + safeErrorMessage(error)
  } finally {
    loadingOperation.value = false
  }
}
</script>

<style scoped>
.wj-operations {
  display: flex;
  flex-direction: column;
  gap: 30px;
}

.info-section {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 24px;
}

.info-section h2 {
  color: var(--jv-text-primary);
  margin: 0 0 20px 0;
  font-size: 1.25rem;
}

.wallet-prompt {
  background: var(--jv-info-bg);
  border-color: var(--jv-info) !important;
}

.wallet-prompt h2 {
  color: var(--jv-info);
}

.wallet-prompt p {
  margin: 0 0 12px 0;
  color: var(--jv-info);
}

.wallet-warning {
  background: var(--jv-warning-bg);
  border-color: var(--jv-warning) !important;
}

.wallet-warning h2 {
  color: var(--jv-warning);
}

.wallet-warning p {
  margin: 8px 0;
  color: var(--jv-warning);
}

.wallet-info-badge {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--jv-success-bg);
  border: 1px solid var(--jv-success);
  border-radius: 8px;
  padding: 8px 16px;
  margin-bottom: 20px;
}

.wallet-info-badge .badge {
  color: var(--jv-success);
  font-weight: 600;
}

.wallet-info-badge .balance {
  color: var(--jv-success);
}

.operation-tabs {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
  border-bottom: 2px solid #e2e8f0;
  padding-bottom: 8px;
}

.tab-btn {
  background: none;
  border: none;
  padding: 10px 20px;
  font-size: 0.95rem;
  color: #64748b;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}

.tab-btn:hover {
  color: #3b82f6;
}

.tab-btn.active {
  color: #3b82f6;
  font-weight: 600;
}

.tab-btn.active::after {
  content: '';
  position: absolute;
  bottom: -10px;
  left: 0;
  right: 0;
  height: 2px;
  background: #3b82f6;
}

.operation-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  color: #374151;
  font-size: 0.9rem;
  font-weight: 500;
}

.form-input {
  padding: 10px 14px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 0.95rem;
}

.form-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.balance-hint {
  font-size: 0.8rem;
  color: #64748b;
}

.btn-primary {
  background: #3b82f6;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 6px;
  cursor: pointer;
  margin-top: 10px;
}

.btn-primary:hover:not(:disabled) {
  background: #2563eb;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.success-message {
  color: #15803d;
  font-size: 0.85rem;
  margin: 0;
}

.error-message {
  color: #ef4444;
  font-size: 0.85rem;
  margin: 0;
}
</style>
