<template>
  <div class="redpacket-view">
    <!-- 无 id → 创建红包（用 hasPacketId 判断：非法 id 不能落到创建页） -->
    <template v-if="!hasPacketId">
      <div class="header">
        <h1>🧧 链上红包</h1>
        <p class="subtitle">创建红包</p>
      </div>

      <div class="panel">
        <p class="notice">
          Joule 红包需要持有 wJ（wrapped Joule）才可以创建。先指定红包总额（不超过 2000 WJ）
          和红包个数（不超过 500 个），授权扣除 wJ，再创建红包。把红包链接传播出去，
          持有 JTI 认证的地址即可抢，每个地址每个红包限抢一次。
        </p>

        <div class="field">
          <label>红包编号</label>
          <div class="id-row">
            <code class="mono id-value">{{ newPacketIdHex }}</code>
            <button class="mini-btn" @click="regenerateId">换一个</button>
          </div>
          <span class="hint">32 字节随机数，创建后不可更改；重复会失败</span>
        </div>

        <div class="field">
          <label>红包总额</label>
          <div class="input-row">
            <input
              v-model="amountInput"
              class="form-input"
              placeholder="例如 10"
              inputmode="decimal"
              @input="onAmountInput"
            >
            <span class="unit">WJ</span>
          </div>
          <span class="hint">不超过 2000 WJ，且总额 ≥ 个数（每包至少 1 wei）</span>
        </div>

        <div class="field">
          <label>红包个数</label>
          <div class="input-row">
            <input
              v-model="quantityInput"
              class="form-input"
              placeholder="例如 5"
              inputmode="numeric"
              @input="onQuantityInput"
            >
            <span class="unit">个</span>
          </div>
          <span class="hint">不超过 500 个</span>
        </div>

        <!-- 钱包状态 -->
        <div class="field">
          <label>账户地址</label>
          <div v-if="!walletStore.isConnected" class="wallet-hint">
            <span class="warn">请先连接钱包</span>
            <button class="mini-btn" @click="walletStore.connect()">连接账户</button>
          </div>
          <code v-else class="mono">{{ walletStore.address }}</code>
        </div>

        <!-- WJ 授权 -->
        <div v-if="walletStore.isConnected" class="field">
          <label>WJ 授权</label>
          <div class="allowance-row">
            <span>
              已授权从上述地址最多扣除
              <b>{{ allowanceText }}</b> WJ 装入红包
            </span>
            <button
              class="mini-btn"
              :disabled="approving || !canApprove"
              @click="handleApprove"
            >
              {{ approving ? '授权中…' : '授权本次总额' }}
            </button>
          </div>
          <span v-if="validation.needsApproval && !validation.allowanceUnknown" class="hint warn">
            当前授权不足，创建前需先授权
          </span>
        </div>

        <!-- 校验提示 -->
        <ul v-if="validation.errors.length" class="error-list">
          <li v-for="e in validation.errors" :key="e">{{ e }}</li>
        </ul>

        <JvActionButton
          :loading="creating"
          :disabled="!canCreate"
          style="width: 100%; margin-top: 12px"
          @click="handleCreate"
        >
          创建红包
        </JvActionButton>

        <p v-if="createError" class="msg error">{{ createError }}</p>

        <!-- 创建成功 → 分享 -->
        <div v-if="createdInfo" class="created-box">
          <h3>✅ 红包已创建</h3>
          <p class="hint">把下面这段信息发出去，别人就能来抢：</p>
          <pre class="share-text">{{ createdInfo.shareText }}</pre>
          <div class="created-actions">
            <button class="mini-btn" @click="copyShareText">复制红包信息</button>
            <button class="mini-btn" @click="goToPacket">打开红包页</button>
          </div>
          <p v-if="copied" class="msg ok">已复制到剪贴板</p>
          <p v-if="copyError" class="msg error">{{ copyError }}</p>
        </div>
      </div>
    </template>

    <!-- 有 id → 抢红包 -->
    <template v-else>
      <div class="header">
        <h1>🧧 链上红包</h1>
        <p class="subtitle">抢红包</p>
      </div>

      <JvLoading v-if="isLoading" label="正在读取红包…" />

      <JvPageState
        v-else-if="loadError"
        type="network-error"
        title="读取失败"
        :description="loadError"
        action="重试"
        @action="reload"
      />

      <JvPageState
        v-else-if="status === 'not-found'"
        type="empty"
        title="红包不存在"
        description="该编号在链上没有对应红包，请检查链接是否完整"
      />

      <div v-else class="panel">
        <div class="field">
          <label>红包编号</label>
          <code class="mono id-value">{{ packetIdHex }}</code>
        </div>

        <!-- 红包信息四宫格 -->
        <div class="stats-row">
          <div class="stat-card">
            <span class="stat-value">{{ formatJ(packet?.totalE) }}</span>
            <span class="stat-label">总额 (WJ)</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">{{ packet?.totalN.toString() }}</span>
            <span class="stat-label">总个数</span>
          </div>
          <div class="stat-card" :class="{ depleted: packet?.leftE === 0n }">
            <span class="stat-value">{{ formatJ(packet?.leftE) }}</span>
            <span class="stat-label">剩余金额 (WJ)</span>
          </div>
          <div class="stat-card" :class="{ depleted: packet?.leftN === 0n }">
            <span class="stat-value">{{ packet?.leftN.toString() }}</span>
            <span class="stat-label">剩余个数</span>
          </div>
        </div>

        <!-- 状态 -->
        <div class="status-row">
          <JvStatusTag :status="statusTag.status" :label="statusTag.label" />
          <span v-if="status === 'active'" class="hint">
            距过期{{ remainingText }}
          </span>
          <span v-else-if="status === 'expired'" class="hint warn">
            已过期，剩余 {{ formatJ(packet?.leftE) }} WJ 只有发起人可取回
          </span>
          <span v-else-if="status === 'finished'" class="hint">
            已抢完（共 {{ packet?.finalN.toString() }} 人领取）
          </span>
        </div>

        <div class="field">
          <label>发起人</label>
          <router-link
            v-if="packet"
            :to="`/address/${packet.creator}`"
            class="mono link"
          >{{ packet.creator }}</router-link>
        </div>

        <!-- 抢红包表单 -->
        <template v-if="status === 'active'">
          <div class="field">
            <label>幸运数字</label>
            <div class="input-row">
              <input
                v-model="luckyInput"
                class="form-input"
                inputmode="numeric"
                placeholder="0 ~ 2^256-1 的整数"
              >
              <button class="mini-btn" @click="rerollLucky">随机</button>
            </div>
            <span class="hint">
              只作为链上抽签种子（你与发起人都无法预测结果），不影响金额上限
            </span>
          </div>

          <!-- 资格提示 -->
          <div class="field">
            <label>领取资格</label>
            <div class="qual-row">
              <span v-if="!walletStore.isConnected" class="warn">请先连接钱包</span>
              <template v-else>
                <span :class="jtiBalance && jtiBalance > 0n ? 'ok' : 'warn'">
                  JTI 认证：{{ jtiText }}
                </span>
                <span v-if="alreadyOpened" class="warn">
                  该地址已领过这个红包（每个地址限一次）
                </span>
              </template>
            </div>
          </div>

          <JvActionButton
            :loading="opening"
            :disabled="!canOpenNow"
            style="width: 100%; margin-top: 12px"
            @click="handleOpen"
          >
            抢红包
          </JvActionButton>

          <p v-if="openError" class="msg error">{{ openError }}</p>
          <div v-if="openResult" class="created-box">
            <h3>🎉 抢到了 {{ formatJ(openResult.amountWei) }} WJ</h3>
            <p class="hint">
              已记入红包历史（区块 {{ openResult.blockHeight.toString() }}）。
              WJ 在钱包里，需要时可用「释放 J」换成原生 J。
            </p>
          </div>
        </template>

        <!-- 过期 → 发起人可取回 -->
        <template v-else-if="status === 'expired' && canWithdrawNow(walletStore.address)">
          <JvActionButton
            :loading="withdrawing"
            style="width: 100%; margin-top: 12px"
            @click="handleWithdraw"
          >
            取回剩余 {{ formatJ(packet?.leftE) }} WJ
          </JvActionButton>
          <p v-if="withdrawError" class="msg error">{{ withdrawError }}</p>
          <p v-if="withdrawSuccess" class="msg ok">已提交取回交易</p>
        </template>

        <div class="footer-links">
          <router-link to="/redpacket" class="link">我也发一个</router-link>
        </div>
      </div>

      <!-- 领取历史 -->
      <div v-if="!isLoading && !loadError && status !== 'not-found'" class="panel">
        <h2 class="section-title">领取记录（{{ history.length }}）</h2>
        <p v-if="!history.length" class="hint">还没有人领取</p>
        <table v-else class="history-table">
          <thead>
            <tr><th>领取人</th><th>金额 (WJ)</th><th>区块</th></tr>
          </thead>
          <tbody>
            <tr v-for="(h, i) in history" :key="`${h.blockHeight}-${i}`">
              <td>
                <router-link :to="`/address/${h.opener}`" class="mono link">
                  {{ shortAddr(h.opener) }}
                </router-link>
              </td>
              <td>{{ formatJ(h.e) }}</td>
              <td>
                <router-link :to="`/block/${h.blockHeight}`" class="link">
                  {{ h.blockHeight.toString() }}
                </router-link>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useWalletStore } from '../stores/wallet'
import { useRedPacket, mapRedPacketError } from '../composables/useRedPacket'
import { JvLoading, JvPageState, JvActionButton, JvStatusTag } from '../design-system'
import {
  buildShareText,
  describeRemaining,
  findOpenerIndex,
  formatPacketId,
  parsePacketId,
  randomLuckyNumber,
  randomPacketId,
  validateCreate,
  validateLuckyNumber,
  type PacketStatus,
  type RedPacketSnapshot,
} from '../utils/redpacket'

const route = useRoute()
const router = useRouter()
const walletStore = useWalletStore()

const {
  isLoading,
  loadError,
  snapshot,
  currentBlock,
  history,
  load,
  loadHistory,
  loadAllowance,
  loadJtiBalance,
  approve,
  createPacket,
  openPacket,
  withdrawPacket,
  canWithdrawNow,
} = useRedPacket()

// ---------------------------------------------------------------- 路由

/**
 * 路由里的红包 ID：undefined → 创建页；非法 → null。
 * 用 parsePacketId 而不是直接 BigInt —— 用户可能粘进来一串坏字符，
 * 而且非法值必须显示「链接不完整」而不是静默当成 0 号红包。
 */
const hasPacketId = computed(() => route.params.packetId !== undefined)

const packetId = computed<bigint | null>(() => {
  const raw = route.params.packetId
  if (raw === undefined) return null
  return parsePacketId(Array.isArray(raw) ? raw[0] : raw)
})

const packetIdHex = computed(() => (packetId.value === null ? '' : formatPacketId(packetId.value)))
const packet = computed<RedPacketSnapshot | null>(() => snapshot.value)
const status = computed<PacketStatus>(() => {
  if (packetId.value === null) return 'not-found'
  if (!packet.value) return 'not-found'
  if (!packet.value.created) return 'not-found'
  if (packet.value.leftE === 0n || packet.value.leftN === 0n) return 'finished'
  if (currentBlock.value >= packet.value.expiry) return 'expired'
  return 'active'
})

const statusTag = computed<{ status: 'success' | 'info' | 'default' | 'warning'; label: string }>(() => {
  switch (status.value) {
    case 'active': return { status: 'success', label: '可抢' }
    case 'expired': return { status: 'warning', label: '已过期' }
    case 'finished': return { status: 'default', label: '已抢完' }
    default: return { status: 'default', label: '不存在' }
  }
})

const remainingText = computed(() => (packet.value ? describeRemaining(packet.value, currentBlock.value) : ''))

// ---------------------------------------------------------------- 创建页

const newPacketId = ref(randomPacketId())
const newPacketIdHex = computed(() => formatPacketId(newPacketId.value))
const amountInput = ref('')
const quantityInput = ref('')
const allowance = ref<bigint | null>(null)
const approving = ref(false)
const creating = ref(false)
const createError = ref<string | null>(null)
const createdInfo = ref<{ shareText: string } | null>(null)
const copied = ref(false)
const copyError = ref<string | null>(null)

const validation = computed(() => validateCreate(amountInput.value, quantityInput.value, allowance.value))

const canApprove = computed(() => walletStore.isConnected && validation.value.amountWei !== null)
const canCreate = computed(() =>
  walletStore.isConnected &&
  validation.value.errors.length === 0 &&
  validation.value.needsApproval === false &&
  !creating.value,
)

const allowanceText = computed(() => {
  if (allowance.value === null) return '—'
  return formatJ(allowance.value)
})

const onAmountInput = (ev: Event) => {
  const el = ev.target as HTMLInputElement
  // 只保留数字与一个小数点，不静默改数值（清掉非法字符后原样回填）
  const cleaned = el.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1')
  amountInput.value = cleaned
  el.value = cleaned
}

const onQuantityInput = (ev: Event) => {
  const el = ev.target as HTMLInputElement
  const cleaned = el.value.replace(/\D/g, '')
  quantityInput.value = cleaned
  el.value = cleaned
}

const regenerateId = () => {
  newPacketId.value = randomPacketId()
  createdInfo.value = null
}

const refreshAllowance = async () => {
  allowance.value = await loadAllowance(walletStore.address)
}

const handleApprove = async () => {
  if (!walletStore.address || validation.value.amountWei === null) return
  approving.value = true
  createError.value = null
  try {
    await approve(walletStore.address, validation.value.amountWei)
    await refreshAllowance()
  } catch (error) {
    createError.value = '授权失败：' + mapRedPacketError(error)
  } finally {
    approving.value = false
  }
}

const handleCreate = async () => {
  if (!walletStore.address) return
  if (validation.value.amountWei === null || validation.value.quantity === null) return
  creating.value = true
  createError.value = null
  createdInfo.value = null
  try {
    await createPacket(
      walletStore.address,
      newPacketId.value,
      validation.value.quantity,
      validation.value.amountWei,
    )
    const url = `${window.location.origin}${window.location.pathname}#/redpacket/${formatPacketId(newPacketId.value)}`
    createdInfo.value = {
      shareText: buildShareText({ url, totalAmount: amountInput.value, quantity: quantityInput.value }),
    }
    await refreshAllowance()
  } catch (error) {
    createError.value = '创建失败：' + mapRedPacketError(error)
  } finally {
    creating.value = false
  }
}

const copyShareText = async () => {
  if (!createdInfo.value) return
  copied.value = false
  copyError.value = null
  try {
    await navigator.clipboard.writeText(createdInfo.value.shareText)
    copied.value = true
  } catch {
    copyError.value = '复制失败，请手动选中上方文本复制'
  }
}

const goToPacket = () => {
  router.push(`/redpacket/${formatPacketId(newPacketId.value)}`)
}

// ---------------------------------------------------------------- 抢红包页

const luckyInput = ref(randomLuckyNumber().toString())
const jtiBalance = ref<bigint | null>(null)
const opening = ref(false)
const openError = ref<string | null>(null)
const openResult = ref<{ amountWei: bigint; blockHeight: bigint } | null>(null)
const withdrawing = ref(false)
const withdrawError = ref<string | null>(null)
const withdrawSuccess = ref(false)

const jtiText = computed(() => {
  if (jtiBalance.value === null) return '未知'
  return jtiBalance.value > 0n ? `已认证（${jtiBalance.value.toString()}）` : '无 JTI，无法抢'
})

const alreadyOpened = computed(() => {
  if (!walletStore.address) return false
  return findOpenerIndex(history.value, walletStore.address) >= 0
})

const canOpenNow = computed(() =>
  walletStore.isConnected &&
  status.value === 'active' &&
  !alreadyOpened.value &&
  (jtiBalance.value ?? 0n) > 0n &&
  validateLuckyNumber(luckyInput.value).error === null &&
  !opening.value,
)

const rerollLucky = () => {
  luckyInput.value = randomLuckyNumber().toString()
}

const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

const formatJ = (v: bigint | null | undefined): string => {
  if (v === null || v === undefined) return '—'
  const base = 10n ** 18n
  const int = v / base
  const frac = (v % base).toString().padStart(18, '0').replace(/0+$/, '')
  return frac ? `${int}.${frac}` : int.toString()
}

const refreshReads = async () => {
  if (packetId.value === null) return
  const state = await load(packetId.value)
  if (!state) return
  await loadHistory(packetId.value, state.openedCount)
  jtiBalance.value = await loadJtiBalance(walletStore.address)
  await refreshAllowance()
}

const reload = () => { void refreshReads() }

const handleOpen = async () => {
  if (!walletStore.address || packetId.value === null) return
  const lucky = validateLuckyNumber(luckyInput.value)
  if (lucky.value === null) {
    openError.value = lucky.error
    return
  }
  opening.value = true
  openError.value = null
  openResult.value = null
  try {
    const before = history.value.length
    await openPacket(walletStore.address, packetId.value, lucky.value)
    await refreshReads()
    // 领到多少只能从历史里回读：合约 open() 无返回值、无事件
    const mine = history.value.find(h => h.opener.toLowerCase() === walletStore.address!.toLowerCase())
    if (mine) openResult.value = { amountWei: mine.e, blockHeight: mine.blockHeight }
    else if (history.value.length === before) {
      openError.value = '交易已上链，但没能从历史里读到本次记录。请刷新页面确认。'
    }
  } catch (error) {
    openError.value = '抢红包失败：' + mapRedPacketError(error)
  } finally {
    opening.value = false
  }
}

const handleWithdraw = async () => {
  if (!walletStore.address || packetId.value === null) return
  withdrawing.value = true
  withdrawError.value = null
  withdrawSuccess.value = false
  try {
    await withdrawPacket(walletStore.address, packetId.value)
    withdrawSuccess.value = true
    await refreshReads()
  } catch (error) {
    withdrawError.value = '取回失败：' + mapRedPacketError(error)
  } finally {
    withdrawing.value = false
  }
}

// ---------------------------------------------------------------- 生命周期

/**
 * 首次进入必须同时做两件独立的事：
 *   ① 读红包主体（仅抢红包页需要，创建页没有 id 就直接跳过）
 *   ② 读 WJ 授权额度（创建页要靠它判断「能不能直接创建」，不读就永远显示 — 且按钮永远禁用）
 * 之前这里只调 refreshReads，而 refreshReads 在 packetId===null 时第一行就 return，
 * 所以创建页从来没有读过授权 —— 这是真实缺陷，不是测试问题。
 */
onMounted(() => {
  if (hasPacketId.value) void refreshReads()
  else void refreshAllowance()
})

// 同一组件在 /redpacket 与 /redpacket/:id 之间切换时不会重新 mount，需手动重读
watch(() => route.params.packetId, () => {
  openResult.value = null
  openError.value = null
  withdrawSuccess.value = false
  withdrawError.value = null
  luckyInput.value = randomLuckyNumber().toString()
  if (!hasPacketId.value) {
    newPacketId.value = randomPacketId()
    createdInfo.value = null
  }
  void refreshReads()
})

// 换账户后资格与「是否已领」都要重算
watch(() => walletStore.address, () => {
  openResult.value = null
  openError.value = null
  void refreshReads()
})
</script>

<style scoped>
.redpacket-view { display: flex; flex-direction: column; gap: 24px; max-width: 860px; margin: 0 auto; }

.header h1 { margin: 0; font-size: 1.5rem; color: var(--jv-text-primary); }
.subtitle { margin: 4px 0 0; color: var(--jv-text-muted); font-size: 0.9rem; }

.panel {
  background: var(--jv-bg-surface);
  border: 1px solid var(--jv-border);
  border-radius: var(--jv-radius-lg);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.notice {
  margin: 0;
  color: var(--jv-text-secondary);
  font-size: 0.9rem;
  line-height: 1.7;
  background: var(--jv-info-bg);
  border-left: 3px solid var(--jv-info);
  border-radius: var(--jv-radius-sm);
  padding: 12px 14px;
}

.field { display: flex; flex-direction: column; gap: 6px; }
.field label { color: var(--jv-text-secondary); font-size: 0.9rem; font-weight: 500; }

.input-row { display: flex; align-items: center; gap: 8px; }
.input-row .form-input { flex: 1; }
.unit { color: var(--jv-text-muted); font-size: 0.9rem; min-width: 24px; }

.form-input {
  padding: 10px 14px;
  border: 1px solid var(--jv-border);
  border-radius: var(--jv-radius-md);
  font-size: 0.95rem;
  background: var(--jv-bg-surface);
  color: var(--jv-text-primary);
}
.form-input:focus {
  outline: none;
  border-color: var(--jv-border-focus);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--jv-brand) 12%, transparent);
}

.mono { font-family: var(--jv-font-mono); font-size: 0.85rem; word-break: break-all; }
.id-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.id-value { flex: 1; min-width: 240px; color: var(--jv-text-secondary); }

.mini-btn {
  background: var(--jv-bg-subtle);
  border: 1px solid var(--jv-border);
  border-radius: var(--jv-radius-sm);
  padding: 6px 12px;
  font-size: 0.85rem;
  color: var(--jv-text-primary);
  cursor: pointer;
  white-space: nowrap;
}
.mini-btn:hover:not(:disabled) { border-color: var(--jv-brand); color: var(--jv-brand); }
.mini-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.hint { font-size: 0.78rem; color: var(--jv-text-muted); line-height: 1.5; }
.warn { color: var(--jv-warning); }
.ok { color: var(--jv-success); }

.wallet-hint, .allowance-row, .qual-row {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  font-size: 0.88rem; color: var(--jv-text-secondary);
}

.stats-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; }
.stat-card {
  display: flex; flex-direction: column; gap: 4px;
  background: var(--jv-bg-subtle);
  border: 1px solid var(--jv-border);
  border-radius: var(--jv-radius-md);
  padding: 12px 14px;
}
.stat-card.depleted .stat-value { color: var(--jv-error); }
.stat-value { font-size: 1.15rem; font-weight: 600; color: var(--jv-text-primary); font-family: var(--jv-font-mono); }
.stat-label { font-size: 0.75rem; color: var(--jv-text-muted); }

.status-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }

.error-list {
  margin: 0; padding: 10px 14px 10px 30px;
  background: var(--jv-error-bg);
  border-radius: var(--jv-radius-sm);
  color: var(--jv-error);
  font-size: 0.85rem;
  line-height: 1.6;
}

.msg { font-size: 0.85rem; margin: 0; }
.msg.error { color: var(--jv-error); }
.msg.ok { color: var(--jv-success); }

.created-box {
  border: 1px solid var(--jv-success);
  background: var(--jv-success-bg);
  border-radius: var(--jv-radius-md);
  padding: 16px;
  display: flex; flex-direction: column; gap: 10px;
}
.created-box h3 { margin: 0; font-size: 1rem; color: var(--jv-success); }
.share-text {
  margin: 0; padding: 10px 12px;
  background: var(--jv-bg-surface);
  border: 1px solid var(--jv-border);
  border-radius: var(--jv-radius-sm);
  font-family: var(--jv-font-mono);
  font-size: 0.8rem;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--jv-text-primary);
}
.created-actions { display: flex; gap: 8px; flex-wrap: wrap; }

.section-title { margin: 0; font-size: 1rem; color: var(--jv-text-primary); }

.history-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.history-table th, .history-table td {
  text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--jv-border);
}
.history-table th { color: var(--jv-text-muted); font-weight: 500; font-size: 0.78rem; }
.history-table td { color: var(--jv-text-secondary); font-family: var(--jv-font-mono); }

.link { color: var(--jv-link); text-decoration: none; }
.link:hover { color: var(--jv-link-hover); text-decoration: underline; }

.footer-links { display: flex; gap: 16px; padding-top: 4px; }
</style>
