<template>
  <div class="mint-panel">
    <h3>🔨 铸造域名（owner-only）</h3>
    <p class="mint-desc">
      当前钱包是 JNS 合约的 owner，可以铸造新域名。
      名称只支持大小写字母、数字和中横线。
    </p>
    <div class="mint-row">
      <input
        v-model="name"
        class="mint-input"
        type="text"
        placeholder="例如: alice.j"
        :disabled="submitting"
      />
      <JvActionButton :loading="submitting" :disabled="!name" @click="submit">铸造</JvActionButton>
    </div>
    <p v-if="errorMsg" class="mint-error">{{ errorMsg }}</p>
    <p v-if="successMsg" class="mint-ok">{{ successMsg }}</p>
  </div>
</template>

<script setup lang="ts">
// JNS owner-only mint —— 对齐 v1 jnsInfo.html 的 🔨 按钮 + mintJNS()
//
// v1 的可见性条件：`jnsIdError && chainId == '0xe52' && account == jnsContractOwner`
//   即「域名不存在（jnsIdError 有值）+ 本链 + 本人是合约 owner」
//   —— 是运营方的补录工具，不是公开注册入口。v2 不放开这个限制。
//
// v1 的顺序：先 `jnsId.search('.j$') > 0`，再查字符集 `^([a-zA-Z0-9]|-)+$`，
// 两道都过才 estimateGas → claim(name)。这里用 validateMintName 一次覆盖。

import { ref } from 'vue'
import { validateMintName } from '@/utils/jns-endorse'
import { JNS_ADDRESS, jnsABI } from '@/contracts/jns'
import { config as wagmiConfig } from '@/stores/wallet'
import { JvActionButton } from '../design-system'

const emit = defineEmits<{ (e: 'minted'): void }>()

const name = ref('')
const submitting = ref(false)
const errorMsg = ref('')
const successMsg = ref('')

const submit = async () => {
  const checked = validateMintName(name.value)
  if (!checked.ok) {
    errorMsg.value = checked.error
    return
  }
  errorMsg.value = ''
  successMsg.value = ''
  submitting.value = true
  try {
    const { writeContract, switchChain } = await import('wagmi/actions')
    try { await switchChain(wagmiConfig, { chainId: 3666 }) } catch {}
    const hash = await writeContract(wagmiConfig, {
      address: JNS_ADDRESS,
      abi: jnsABI,
      functionName: 'claim',
      args: [checked.name],
    })
    successMsg.value = `✅ 铸造交易已提交（${checked.name}.j）Tx: ${hash.slice(0, 10)}…${hash.slice(-6)}`
    name.value = ''
    emit('minted')
  } catch (e: any) {
    if (e?.code === 4001) errorMsg.value = '用户取消了交易'
    else errorMsg.value = '铸造失败：' + (e?.shortMessage || e?.message?.slice(0, 100) || '未知错误')
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.mint-panel {
  border: 1px dashed var(--jv-border); border-radius: 10px;
  padding: 16px; margin-top: 16px; background: var(--jv-bg-secondary);
}
.mint-panel h3 { margin: 0 0 8px; font-size: 15px; }
.mint-desc { font-size: 13px; color: var(--jv-text-secondary); margin: 0 0 12px; line-height: 1.6; }
.mint-row { display: flex; gap: 10px; }
.mint-input {
  flex: 1; padding: 8px 10px; border-radius: 8px; font-size: 13px;
  border: 1px solid var(--jv-border); background: var(--jv-bg); color: var(--jv-text);
  font-family: var(--jv-font-mono);
}
.mint-error { color: var(--jv-danger, #e5484d); font-size: 13px; margin: 8px 0 0; }
.mint-ok { color: var(--jv-success, #30a46c); font-size: 13px; margin: 8px 0 0; word-break: break-all; }
</style>
