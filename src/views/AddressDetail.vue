<template>
  <div class="address-detail">
    <div class="header">
      <button @click="$router.push('/')" class="back-btn">← 返回首页</button>
      <h1>地址详情</h1>
    </div>

    <div v-if="error" class="error">
      <p>{{ error }}</p>
      <button @click="$router.push('/')" class="btn-primary">返回首页</button>
    </div>

    <div v-else class="address-info">
      <div class="info-section">
        <h2>📍 地址信息</h2>
        <div class="info-grid">
          <div class="info-item">
            <span class="label">地址</span>
            <span class="value hash address-formats" @click="cycleFormat" title="点击切换格式">
              <span class="format-badge">{{ formatLabel }}</span>
              {{ formatAddress(displayAddress) }}
            </span>
          </div>
          <div class="info-item all-formats">
            <span class="label">所有格式</span>
            <div class="format-list">
              <div class="format-row" @click="selectFormat('hex')" :class="{ active: inputFormat==='hex' }">
                <span class="fmt-badge hex">HEX</span>
                <span class="fmt-value">{{ hexAddress }}</span>
              </div>
              <div class="format-row" @click="selectFormat('b32')" :class="{ active: inputFormat==='b32' }">
                <span class="fmt-badge b32">B32</span>
                <span class="fmt-value">{{ b32Address }}</span>
              </div>
              <div class="format-row" @click="selectFormat('full')" :class="{ active: inputFormat==='full' }">
                <span class="fmt-badge full">JVA</span>
                <span class="fmt-value">{{ fullAddress }}</span>
              </div>
            </div>
          </div>
          <div v-if="jnsName" class="info-item">
            <span class="label">JNS 域名</span>
            <span class="value jns-name">{{ jnsName }}.j</span>
          </div>
          <div class="info-item">
            <span class="label">能量余额</span>
            <span class="value">{{ loadingBalance ? '⏳ 加载中...' : formatBalance(balance) }} {{ symbol }}</span>
          </div>
        </div>
      </div>

      <div class="info-section">
        <h2>💰 Wrapped Joule (wJ)</h2>
        <div class="info-grid">
          <div class="info-item">
            <span class="label">wJ 余额</span>
            <span class="value">{{ loadingWJ ? '⏳ 加载中...' : formatBalance(wjBalance) }} wJ</span>
          </div>
          <div class="info-item">
            <span class="label">合约地址</span>
            <span class="value hash">{{ formatAddress(WJ_ADDRESS) }}</span>
          </div>
        </div>
        <div class="info-note">
          <p>ℹ️ wJ 是 Joule 的 ERC20 代币包装版本。1 wJ = 1 J，可以自由转账。</p>
        </div>
      <WJOperations :address="hexAddress" :wjBalance="wjBalance" :formatAddress="formatAddress" :formatBalance="formatBalance" />
</div>

      <div class="info-section">
        <h2>🆔 Core ID 与签到</h2>
        <CoreIdSection :address="hexAddress" :formatAddress="formatAddress" />
      </div>

      <div class="info-section">
        <h2>📜 交易历史</h2>
        <div class="transactions-header">
          <span>显示第 {{ currentPage }} 页（每页10个区块）</span>
          <div class="pagination" v-if="totalPages > 1">
            <button @click="prevPage" :disabled="currentPage === 1" class="page-btn">←</button>
            <span class="page-info">{{ currentPage }} / {{ totalPages }}</span>
            <button @click="nextPage" :disabled="currentPage === totalPages" class="page-btn">→</button>
          </div>
        </div>
        
        <div class="block-selector">
          <span class="block-label">跳转到区块：</span>
          <input 
            v-model="targetBlock" 
            type="number" 
            placeholder="输入区块高度"
            class="block-input"
            :min="0"
            :max="Number(maxBlock)"
          >
          <button @click="jumpToBlock" class="jump-btn">跳转</button>
        </div>

        <div class="loading" v-if="loadingTxs">加载交易记录中...</div>

        <div class="transactions-list" v-else-if="transactions.length > 0">
          <div v-for="(tx, index) in transactions" :key="index" class="tx-card" @click="$router.push(`/tx/${tx.hash}`)">
            <div class="tx-header">
              <div class="tx-hash">
                <span class="label">交易哈希</span>
                <span class="value hash">{{ formatHash(tx.hash) }}</span>
              </div>
              <div class="tx-age">
                <span class="value">{{ tx.age }}</span>
              </div>
            </div>
            <div class="tx-details">
              <div class="detail-row">
                <span class="label">区块</span>
                <span class="value">#{{ tx.blockNumber }}</span>
              </div>
              <div class="detail-row">
                <span class="label">发送者</span>
                <span class="value hash">{{ formatAddress(tx.from) }}</span>
              </div>
              <div class="detail-row">
                <span class="label">接收者</span>
                <span class="value hash">{{ tx.to ? formatAddress(tx.to) : '合约创建' }}</span>
              </div>
              <div class="detail-row">
                <span class="label">Gas</span>
                <span class="value">{{ formatGas(tx.gasUsed) }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="empty" v-else>
          <p>暂无交易记录</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { formatEther, formatUnits } from 'viem'
import { WJ_ADDRESS, wjABI } from '../contracts/wj'
import { JNS_ADDRESS, jnsABI } from '../contracts/jns'
import WJOperations from './WJOperations.vue'
import CoreIdSection from './CoreIdSection.vue'
import { publicClient } from '../config/client'
import { encodeJVA, detectAddressFormat, normalizeToHex } from '../utils/jvaddress'
// import { useWalletStore } from '../stores/wallet'

const router = useRouter()
// const walletStore = useWalletStore() // 后续用于 WJ 操作功能

interface Props {
  address: string
  blockNumber?: string
}

const props = defineProps<Props>()

const error = ref<string | null>(null)
const inputFormat = ref<'hex' | 'b32' | 'full'>('hex')
const hexAddress = ref('')
const b32Address = ref('')
const fullAddress = ref('')

function initAddress(raw: string) {
  const format = detectAddressFormat(raw)
  if (format === 'unknown') {
    error.value = '无效的地址格式'
    return false
  }
  inputFormat.value = format
  const hex = normalizeToHex(raw)
  if (!hex) {
    error.value = '地址格式无效'
    return false
  }
  hexAddress.value = hex
  const encoded = encodeJVA(hex)
  if (encoded.success) {
    b32Address.value = encoded.b32Address
    fullAddress.value = encoded.fullAddress
  }
  return true
}

const jnsName = ref<string | null>(null)

const balance = ref<bigint | null>(null)
const wjBalance = ref<bigint | null>(null)
const loadingBalance = ref(true)
const loadingWJ = ref(true)

// 交易相关
const transactions = ref<any[]>([])
const loadingTxs = ref(false)
const currentPage = ref(1)
const totalTxs = ref(0)
const totalPages = ref(1)
const maxBlock = ref<bigint>(0n)
const targetBlock = ref('')

const symbol = ref('J')

const formatLabel = computed(() => ({
  hex: 'HEX',
  b32: 'B32',
  full: 'JVA',
}[inputFormat.value]))

const formatAddress = (addr: string): string => {
  if (!addr) return ''
  return `${addr.substring(0, 10)}...${addr.substring(addr.length - 8)}`
}

const displayAddress = computed(() => {
  switch (inputFormat.value) {
    case 'hex': return hexAddress.value
    case 'b32': return b32Address.value
    case 'full': return fullAddress.value
  }
})

initAddress(props.address)

function cycleFormat() {
  if (inputFormat.value === 'hex') inputFormat.value = 'b32'
  else if (inputFormat.value === 'b32') inputFormat.value = 'full'
  else inputFormat.value = 'hex'
}

function selectFormat(fmt: 'hex' | 'b32' | 'full') {
  inputFormat.value = fmt
  const addr = fmt === 'hex' ? hexAddress.value : fmt === 'b32' ? b32Address.value : fullAddress.value
  router.replace({ params: { ...router.currentRoute.value.params, address: addr } })
}

const formatBalance = (balance: bigint | null): string => {
  if (balance === null || balance === 0n) return '0'
  return parseFloat(formatEther(balance)).toFixed(4)
}

const formatHash = (hash: string): string => {
  if (!hash) return ''
  return `${hash.substring(0, 10)}...${hash.substring(hash.length - 8)}`
}

const formatGas = (gas: bigint): string => {
  return formatUnits(gas, 0)
}

const loadBalance = async () => {
  loadingBalance.value = true
  try {
    const balanceData = await publicClient.getBalance({
      address: hexAddress.value as `0x${string}`,
    })
    balance.value = balanceData
  } catch (err) {
    console.error('Failed to fetch balance:', err)
    error.value = '获取能量余额失败'
    balance.value = null
  } finally {
    loadingBalance.value = false
  }
}

const loadWJBalance = async () => {
  loadingWJ.value = true
  try {
    const balanceData = await publicClient.readContract({
      address: WJ_ADDRESS,
      abi: wjABI,
      functionName: 'balanceOf',
      args: [hexAddress.value as `0x${string}`],
    })
    wjBalance.value = balanceData as bigint
  } catch (err) {
    console.error('Failed to fetch WJ balance:', err)
    // WJ 余额查询失败不影响主要功能，不设置全局错误
    wjBalance.value = null
  } finally {
    loadingWJ.value = false
  }
}

const loadJnsName = async () => {
  try {
    const name = await publicClient.readContract({
      address: JNS_ADDRESS,
      abi: jnsABI,
      functionName: 'addr2name',
      args: [hexAddress.value as `0x${string}`],
    }) as string
    jnsName.value = name || null
  } catch {
    jnsName.value = null
  }
}

const loadTransactions = async (page: number) => {
  loadingTxs.value = true
  try {
    const latestBlock = await publicClient.getBlockNumber()
    maxBlock.value = latestBlock
    
    // ✅ 清空当前交易列表，准备加载新页面
    transactions.value = []
    
    // 计算要扫描的区块范围（每页10个区块）
    const blocksPerPage = 10
    const startBlock = latestBlock - BigInt((page - 1) * blocksPerPage)
    const endBlock = latestBlock - BigInt(page * blocksPerPage)
    
    let txCount = 0
    
    for (let blockNumber = startBlock; blockNumber > endBlock && blockNumber >= 0n; blockNumber--) {
      const block = await publicClient.getBlock({ blockNumber })
      
      if (block && block.transactions.length > 0) {
        for (const tx of block.transactions) {
          try {
            const txData = await publicClient.getTransaction({ hash: tx as `0x${string}` })
            if (txData && 
                (txData.from.toLowerCase() === hexAddress.value.toLowerCase() || 
                 (txData.to && txData.to.toLowerCase() === hexAddress.value.toLowerCase()))) {
              const receipt = await publicClient.getTransactionReceipt({ hash: tx as `0x${string}` })
              
              // 计算区块年龄
              let age = ''
              try {
                if (block && block.timestamp) {
                  const blockTime = Number(block.timestamp) * 1000
                  const now = Date.now()
                  const diff = Math.floor((now - blockTime) / 1000)

                  if (diff < 60) age = `${diff} 秒前`
                  else if (diff < 3600) age = `${Math.floor(diff / 60)} 分钟前`
                  else if (diff < 86400) age = `${Math.floor(diff / 3600)} 小时前`
                  else age = `${Math.floor(diff / 86400)} 天前`
                }
              } catch (error) {
                // 忽略年龄计算错误
              }
              
              // ✅ 渐进式加载：立即添加到交易列表
              transactions.value.push({
                hash: txData.hash,
                from: txData.from,
                to: txData.to,
                blockNumber: txData.blockNumber,
                gasUsed: receipt?.gasUsed || 0n,
                age: age,
              })
              
              txCount++
            }
          } catch (error) {
            // 忽略错误
          }
        }
      }
    }
    
    totalTxs.value = txCount
    totalPages.value = Math.ceil(Number(latestBlock) / blocksPerPage)
    
    // 显示当前页的所有交易（已经在循环中渐进添加了）
  } catch (error) {
    console.error('Failed to fetch transactions:', error)
    transactions.value = []
    totalTxs.value = 0
    totalPages.value = 1
  } finally {
    loadingTxs.value = false
  }
}

const prevPage = () => {
  if (currentPage.value > 1) {
    currentPage.value--
    loadTransactions(currentPage.value)
  }
}

const nextPage = () => {
  if (currentPage.value < totalPages.value) {
    currentPage.value++
    loadTransactions(currentPage.value)
  }
}

const jumpToBlock = async () => {
  if (!targetBlock.value || isNaN(Number(targetBlock.value))) {
    return
  }
  
  const targetBlockNum = BigInt(targetBlock.value)
  if (targetBlockNum < 0 || targetBlockNum > maxBlock.value) {
    return
  }
  
  // 计算应该跳转到哪一页
  const blocksPerPage = 10
  const page = Math.floor((Number(maxBlock.value) - Number(targetBlockNum)) / blocksPerPage) + 1
  
  currentPage.value = Math.max(1, Math.min(page, totalPages.value))
  await loadTransactions(currentPage.value)
  
  // 更新 URL
  router.push({
    name: 'addressDetailWithBlock',
    params: {
      address: props.address,
      blockNumber: targetBlock.value
    }
  })
}

onMounted(async () => {
  if (error.value) return

  loadBalance()
  loadWJBalance()
  loadJnsName()

  if (props.blockNumber) {
    const targetBlockNum = Number(props.blockNumber)
    if (!isNaN(targetBlockNum)) {
      await loadTransactions(1)
      targetBlock.value = String(targetBlockNum)
      await jumpToBlock()
    } else {
      await loadTransactions(1)
    }
  } else {
    await loadTransactions(1)
  }
})
</script>

<style scoped>
.address-detail {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.header {
  margin-bottom: 30px;
}

.back-btn {
  background: #f1f5f9;
  color: #64748b;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 20px;
  display: inline-block;
}

.back-btn:hover {
  background: #e2e8f0;
}

.header h1 {
  color: #1e293b;
  margin: 0;
}

.address-info {
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
  color: #1e293b;
  margin: 0 0 20px 0;
  font-size: 1.25rem;
}

.info-grid {
  display: grid;
  gap: 16px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 12px;
  background: #f8fafc;
  border-radius: 8px;
}

.info-item .label {
  color: #64748b;
  font-size: 0.9rem;
  min-width: 200px;
}

.info-item .value {
  color: #1e293b;
  font-size: 0.9rem;
  word-break: break-all;
  max-width: 70%;
}

.info-item .value.hash {
  font-family: 'Courier New', monospace;
  color: #3b82f6;
}

.info-note {
  margin-top: 16px;
  padding: 12px;
  background: #eff6ff;
  border-radius: 8px;
  border-left: 4px solid #3b82f6;
}

.info-note p {
  margin: 0;
  color: #1e40af;
  font-size: 0.9rem;
}

.transactions-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid #e2e8f0;
}

.pagination {
  display: flex;
  align-items: center;
  gap: 12px;
}

.page-btn {
  background: #f1f5f9;
  color: #64748b;
  border: none;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.page-btn:hover:not(:disabled) {
  background: #e2e8f0;
}

.page-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.page-info {
  color: #64748b;
  font-size: 0.9rem;
}

.loading, .empty {
  padding: 60px 20px;
  text-align: center;
  color: #64748b;
  font-size: 1rem;
}

.transactions-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tx-card {
  padding: 16px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.tx-card:hover {
  background: #eff6ff;
  border-color: #3b82f6;
  transform: translateY(-2px);
}

.tx-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.tx-hash {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tx-hash .label {
  color: #64748b;
  font-size: 0.9rem;
}

.tx-hash .value {
  color: #1e293b;
  font-size: 1rem;
}

.tx-age .value {
  color: #64748b;
  font-size: 0.9rem;
}

.tx-details {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 8px;
}

.detail-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-row .label {
  color: #64748b;
  font-size: 0.8rem;
}

.detail-row .value {
  color: #1e293b;
  font-size: 0.9rem;
}

.detail-row .value.hash {
  font-family: 'Courier New', monospace;
  color: #3b82f6;
}

.error {
  text-align: center;
  padding: 60px 20px;
  color: #ef4444;
}

.btn-primary {
  background: #3b82f6;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 6px;
  cursor: pointer;
  margin-top: 20px;
}

.btn-primary:hover {
  background: #2563eb;
}

.block-selector {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  padding: 12px;
  background: #f8fafc;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}

.block-label {
  color: #64748b;
  font-size: 0.9rem;
}

.block-input {
  padding: 6px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 0.9rem;
  min-width: 150px;
}

.block-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.jump-btn {
  background: #3b82f6;
  color: white;
  border: none;
  padding: 6px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s;
}

.jump-btn:hover {
  background: #2563eb;
}

.address-formats {
  cursor: pointer;
  position: relative;
}

.format-badge {
  display: inline-block;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 4px;
  margin-right: 6px;
  background: #3b82f6;
  color: white;
  vertical-align: middle;
}

.jns-name {
  font-weight: 600;
  color: var(--jv-brand);
  font-size: 1.05rem;
}

.all-formats {
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}

.format-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  align-items: flex-end;
}

.format-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
  font-size: 0.85rem;
}

.format-row:hover {
  background: #f1f5f9;
}

.format-row.active {
  background: #eff6ff;
  outline: 1px solid #93c5fd;
}

.fmt-badge {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  min-width: 34px;
  text-align: center;
  flex-shrink: 0;
}

.fmt-badge.hex {
  background: #dbeafe;
  color: #1d4ed8;
}

.fmt-badge.b32 {
  background: #dcfce7;
  color: #15803d;
}

.fmt-badge.full {
  background: #fef3c7;
  color: #92400e;
}

.fmt-value {
  font-family: 'Courier New', monospace;
  color: #334155;
  word-break: break-all;
  font-size: 0.8rem;
}
</style>
