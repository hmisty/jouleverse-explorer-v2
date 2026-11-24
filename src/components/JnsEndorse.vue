<template>
  <div class="jns-endorse">
    <div class="endorse-head">
      <h3>💝 打赏（endorse）</h3>
      <span v-if="!canEndorse" class="endorse-off">{{ offReason }}</span>
    </div>

    <div v-if="canEndorse" class="endorse-body">
      <!-- 第一步：选金额 -->
      <div v-if="step === 'amount'" class="endorse-form">
        <p class="endorse-desc">
          向 <span class="mono">{{ jnsId }}</span> 绑定的地址转账 WJ。
          打赏金额须大于 0 且不超过 {{ MAX_ENDORSE_WJ }} WJ。
        </p>
        <p v-if="isSelf" class="endorse-self">⚠️ 这是你自己绑定的地址，打赏等于给自己转账（WJ 允许，但不会产生任何效果）。</p>
        <div class="preset-row">
          <button
            v-for="p in ENDORSE_PRESETS"
            :key="p"
            class="preset-btn"
            :class="{ active: !manual && amountText === String(p) }"
            :disabled="submitting"
            @click="pickPreset(p)"
          >{{ p }} WJ</button>
          <button
            class="preset-btn"
            :class="{ active: manual }"
            :disabled="submitting"
            @click="pickManual"
          >手动输入</button>
        </div>
        <div v-if="manual" class="manual-row">
          <input
            v-model="amountText"
            class="endorse-input"
            type="text"
            inputmode="decimal"
            placeholder="输入金额（0 < x ≤ 100）"
            :disabled="submitting"
          />
          <span class="unit">WJ</span>
        </div>
        <p v-if="amountError" class="endorse-error">{{ amountError }}</p>
        <JvActionButton
          style="width: 100%; margin-top: 10px"
          :disabled="!amountText"
          @click="gotoConfirm"
        >下一步：确认</JvActionButton>
      </div>

      <!-- 第二步：二次确认（v1 也是先弹确认再转账） -->
      <div v-else class="endorse-form confirm">
        <p class="confirm-line">打赏给：</p>
        <p class="confirm-addr mono">{{ boundAddress }}</p>
        <p class="confirm-line">打赏金额：</p>
        <p class="confirm-amount">{{ confirmedWj }} WJ</p>
        <p class="confirm-note">确认后将发起一笔 WJ transfer 交易，链上不可撤销。</p>
        <div class="confirm-actions">
          <JvActionButton type="default" :disabled="submitting" @click="step = 'amount'">返回修改</JvActionButton>
          <JvActionButton :loading="submitting" @click="submit">确认打赏</JvActionButton>
        </div>
      </div>

      <p v-if="successMsg" class="endorse-ok">{{ successMsg }}</p>
      <p v-if="submitError" class="endorse-error">{{ submitError }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
// JNS 打赏（endorse）—— 对齐 v1 jnsInfo.html 的「打赏」按钮 + endorseJNSAmountDialog/ConfirmDialog
//
// v1 行为：
//   1. 只在「域名已绑定」且钱包已连接时显示按钮（`data-ng-if="boundAddressTag !== '未绑定'"`）
//   2. 快选 1/2/5/10 或手动输入；校验 0 < x ≤ 100
//   3. 弹出确认框显示「向地址 / 打赏金额」，确认后 `wj.transfer(boundAddr, toWei(amount))`
//   4. 转账目标永远是 **域名绑定的地址**，不是域名所有者（这两者可以不同！）
//
// ⚠️ 第 4 点是本组件最容易写错的地方：所有者把域名绑定到另一个钱包后，
// 打赏应该进那个钱包。用 owner 顶替 boundAddress 就会把钱打给错的人。

import { ref, computed, watch } from 'vue'
import { parseEndorseAmount, ENDORSE_PRESETS, MAX_ENDORSE_WJ } from '@/utils/jns-endorse'
import { WJ_ADDRESS, wjABI } from '@/contracts/wj'
import { config as wagmiConfig } from '@/stores/wallet'
import { useWalletStore } from '@/stores/wallet'
import { JvActionButton } from '../design-system'

interface Props {
  /** 域名标识（xxx.j），仅用于文案 */
  jnsId: string
  /** 域名绑定的地址；未绑定时传空串 */
  boundAddress: string
  /** 域名所有者（仅用于「不能给自己打赏」提示，不做转账目标） */
  owner: string
}

const props = defineProps<Props>()
const walletStore = useWalletStore()

const step = ref<'amount' | 'confirm'>('amount')
const manual = ref(false)
const amountText = ref('')
const amountError = ref('')
const confirmedWj = ref('')
const submitting = ref(false)
const submitError = ref('')
const successMsg = ref('')

/** 是否可以打赏：已绑定地址 + 钱包已连接 */
const canEndorse = computed(() => {
  if (!props.boundAddress || props.boundAddress === '0x0000000000000000000000000000000000000000') return false
  if (!walletStore.isConnected || !walletStore.address) return false
  return true
})

const offReason = computed(() => {
  if (!props.boundAddress || props.boundAddress === '0x0000000000000000000000000000000000000000') {
    return '域名未绑定地址，无法打赏'
  }
  if (!walletStore.isConnected) return '连接钱包后可打赏'
  return ''
})

/** 自己给自己打赏没有意义（不是错误，只是不展示入口的引导） */
const isSelf = computed(() =>
  !!(walletStore.address && props.boundAddress &&
     walletStore.address.toLowerCase() === props.boundAddress.toLowerCase()))

// 切换域名时重置，避免把 A 域名的金额带到 B 域名
watch(() => props.jnsId, () => {
  step.value = 'amount'
  manual.value = false
  amountText.value = ''
  amountError.value = ''
  submitError.value = ''
  successMsg.value = ''
})

const pickPreset = (p: number) => {
  manual.value = false
  amountText.value = String(p)
  amountError.value = ''
}

const pickManual = () => {
  manual.value = true
  // v1 点「手动输入」会清空输入框（disableAmountInput 里 endorseAmountInputValue = ""）
  amountText.value = ''
  amountError.value = ''
}

const gotoConfirm = () => {
  const parsed = parseEndorseAmount(amountText.value)
  if (!parsed.ok) {
    amountError.value = parsed.error
    return
  }
  amountError.value = ''
  confirmedWj.value = parsed.wj
  step.value = 'confirm'
}

/** 真正发交易 */
const submit = async () => {
  const parsed = parseEndorseAmount(amountText.value)
  if (!parsed.ok) {
    // 从确认页回来时输入可能变了；重新校验而不是信任 confirmedWj
    amountError.value = parsed.error
    step.value = 'amount'
    return
  }
  submitError.value = ''
  successMsg.value = ''
  submitting.value = true
  try {
    const { writeContract, switchChain } = await import('wagmi/actions')
    try { await switchChain(wagmiConfig, { chainId: 3666 }) } catch { /* 已在本链或用户拒切，交给写调用报错 */ }
    const hash = await writeContract(wagmiConfig, {
      address: WJ_ADDRESS,
      abi: wjABI,
      functionName: 'transfer',
      // ⚠️ 收方是 boundAddress（域名绑定地址），不是 owner
      args: [props.boundAddress as `0x${string}`, parsed.wei],
    })
    successMsg.value = `✅ 打赏已提交（${parsed.wj} WJ）Tx: ${hash.slice(0, 10)}…${hash.slice(-6)}`
    step.value = 'amount'
    amountText.value = ''
    manual.value = false
  } catch (e: any) {
    if (e?.code === 4001) submitError.value = '用户取消了交易'
    else submitError.value = '打赏失败：' + (e?.shortMessage || e?.message?.slice(0, 100) || '未知错误')
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.jns-endorse {
  border: 1px solid var(--jv-border); border-radius: 10px;
  padding: 16px; margin-top: 16px; background: var(--jv-bg-secondary);
}
.endorse-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 12px; }
.endorse-head h3 { margin: 0; font-size: 15px; }
.endorse-off { font-size: 12px; color: var(--jv-text-secondary); }
.endorse-desc { font-size: 13px; color: var(--jv-text-secondary); line-height: 1.6; margin: 0 0 12px; }
.endorse-self { font-size: 12px; color: var(--jv-warning, #f5a524); margin: 0 0 12px; }
.mono { font-family: var(--jv-font-mono); }
.preset-row { display: flex; flex-wrap: wrap; gap: 8px; }
.preset-btn {
  padding: 6px 14px; border-radius: 8px; cursor: pointer; font-size: 13px;
  border: 1px solid var(--jv-border); background: var(--jv-bg); color: var(--jv-text);
}
.preset-btn.active { border-color: var(--jv-primary); color: var(--jv-primary); font-weight: 600; }
.preset-btn:disabled { opacity: .5; cursor: not-allowed; }
.manual-row { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
.endorse-input {
  flex: 1; padding: 8px 10px; border-radius: 8px; font-size: 13px;
  border: 1px solid var(--jv-border); background: var(--jv-bg); color: var(--jv-text);
  font-family: var(--jv-font-mono);
}
.unit { font-size: 12px; color: var(--jv-text-secondary); }
.endorse-error { color: var(--jv-danger, #e5484d); font-size: 13px; margin: 8px 0 0; }
.endorse-ok { color: var(--jv-success, #30a46c); font-size: 13px; margin: 10px 0 0; word-break: break-all; }
.confirm-line { font-size: 12px; color: var(--jv-text-secondary); margin: 10px 0 2px; }
.confirm-addr { font-size: 12px; word-break: break-all; margin: 0; }
.confirm-amount { font-size: 20px; font-weight: 700; margin: 0; color: var(--jv-primary); }
.confirm-note { font-size: 12px; color: var(--jv-text-secondary); margin: 12px 0 0; }
.confirm-actions { display: flex; gap: 10px; margin-top: 14px; }
</style>
