<script setup lang="ts">
import { NEmpty, NButton } from 'naive-ui'

export type PageStateType =
  | 'empty'           // 空列表（通用）
  | 'search-empty'    // 搜索无结果
  | 'network-error'   // RPC/网络异常
  | 'wallet-disconnected' // 钱包未连接
  | 'address-mismatch'    // 钱包地址不匹配
  | 'tx-failed'           // 交易失败
  | 'no-core-id'          // 未持有 Core ID

withDefaults(defineProps<{
  type?: PageStateType
  title?: string
  description?: string
  /** 操作按钮文字；不传则不渲染按钮 */
  action?: string
}>(), {
  type: 'empty',
})

const emit = defineEmits<{ (e: 'action'): void }>()

const defaultMeta: Record<PageStateType, { title: string; desc: string }> = {
  'empty':              { title: '暂无数据',         desc: '这里还没有内容' },
  'search-empty':       { title: '未找到结果',       desc: '请尝试其他关键词或检查输入是否正确' },
  'network-error':      { title: 'RPC 连接异常',     desc: '无法获取链上数据，请检查网络后重试' },
  'wallet-disconnected':{ title: '钱包未连接',       desc: '请先连接 MetaMask 钱包以使用此功能' },
  'address-mismatch':   { title: '钱包地址不匹配',   desc: '当前连接的钱包与页面地址不一致，请切换账号' },
  'tx-failed':          { title: '交易失败',         desc: '链上执行失败，请检查参数后重试，或联系管理员' },
  'no-core-id':         { title: '未持有 Core ID',   desc: '该地址尚未 Mint Core ID NFT' },
}
</script>

<template>
  <div class="jv-page-state">
    <NEmpty
      :description="title ?? defaultMeta[type].title"
    >
      <template #icon>
        <!-- 通用空列表 -->
        <svg v-if="type === 'empty'" class="jv-state-icon" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="12" y="18" width="40" height="30" rx="4" stroke="var(--jv-border)" stroke-width="2"/>
          <line x1="20" y1="28" x2="44" y2="28" stroke="var(--jv-border)" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="20" y1="34" x2="44" y2="34" stroke="var(--jv-border)" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="20" y1="40" x2="36" y2="40" stroke="var(--jv-border)" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M24 18 V14 Q24 10 32 10 Q40 10 40 14 V18" stroke="var(--jv-border)" stroke-width="1.5" fill="none"/>
        </svg>

        <!-- 搜索无结果 -->
        <svg v-else-if="type === 'search-empty'" class="jv-state-icon" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="28" cy="28" r="16" stroke="var(--jv-border)" stroke-width="2"/>
          <line x1="40" y1="40" x2="52" y2="52" stroke="var(--jv-border)" stroke-width="2.5" stroke-linecap="round"/>
          <line x1="22" y1="28" x2="34" y2="28" stroke="var(--jv-text-muted)" stroke-width="2" stroke-linecap="round"/>
          <line x1="28" y1="22" x2="28" y2="34" stroke="var(--jv-text-muted)" stroke-width="2" stroke-linecap="round"/>
          <line x1="23" y1="23" x2="33" y2="33" stroke="var(--jv-error)" stroke-width="1.5" stroke-linecap="round" opacity="0.6"/>
          <line x1="33" y1="23" x2="23" y2="33" stroke="var(--jv-error)" stroke-width="1.5" stroke-linecap="round" opacity="0.6"/>
        </svg>

        <!-- 网络异常 -->
        <svg v-else-if="type === 'network-error'" class="jv-state-icon" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="32" cy="32" r="28" stroke="var(--jv-border)" stroke-width="2"/>
          <path d="M20 44 C20 28 44 28 44 44" stroke="var(--jv-error)" stroke-width="2.5" stroke-linecap="round" fill="none"/>
          <path d="M14 38 C14 22 50 22 50 38" stroke="var(--jv-error)" stroke-width="2" stroke-linecap="round" fill="none" opacity="0.5"/>
          <line x1="32" y1="48" x2="32" y2="49" stroke="var(--jv-error)" stroke-width="3" stroke-linecap="round"/>
          <line x1="16" y1="16" x2="48" y2="48" stroke="var(--jv-error)" stroke-width="2" stroke-linecap="round" opacity="0.6"/>
        </svg>

        <!-- 钱包未连接 -->
        <svg v-else-if="type === 'wallet-disconnected'" class="jv-state-icon" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="8" y="20" width="48" height="30" rx="4" stroke="var(--jv-border)" stroke-width="2"/>
          <path d="M8 28 H56" stroke="var(--jv-border)" stroke-width="2"/>
          <rect x="38" y="32" width="14" height="10" rx="3" fill="var(--jv-bg-subtle)" stroke="var(--jv-border)" stroke-width="1.5"/>
          <circle cx="45" cy="37" r="2" fill="var(--jv-text-muted)"/>
          <path d="M20 14 L44 14" stroke="var(--jv-brand)" stroke-width="2" stroke-linecap="round" stroke-dasharray="3 3"/>
          <circle cx="32" cy="10" r="4" fill="var(--jv-brand-subtle)" stroke="var(--jv-brand)" stroke-width="1.5"/>
          <line x1="32" y1="8" x2="32" y2="12" stroke="var(--jv-brand)" stroke-width="1.5" stroke-linecap="round"/>
        </svg>

        <!-- 地址不匹配 -->
        <svg v-else-if="type === 'address-mismatch'" class="jv-state-icon" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="20" cy="28" r="10" stroke="var(--jv-border)" stroke-width="2"/>
          <circle cx="44" cy="28" r="10" stroke="var(--jv-warning)" stroke-width="2"/>
          <path d="M30 28 H34" stroke="var(--jv-text-muted)" stroke-width="2" stroke-linecap="round"/>
          <line x1="38" y1="22" x2="50" y2="34" stroke="var(--jv-warning)" stroke-width="2" stroke-linecap="round"/>
          <line x1="50" y1="22" x2="38" y2="34" stroke="var(--jv-warning)" stroke-width="2" stroke-linecap="round"/>
        </svg>

        <!-- 交易失败 -->
        <svg v-else-if="type === 'tx-failed'" class="jv-state-icon" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="32" cy="32" r="22" fill="var(--jv-error-bg)" stroke="var(--jv-error)" stroke-width="2"/>
          <line x1="22" y1="22" x2="42" y2="42" stroke="var(--jv-error)" stroke-width="3" stroke-linecap="round"/>
          <line x1="42" y1="22" x2="22" y2="42" stroke="var(--jv-error)" stroke-width="3" stroke-linecap="round"/>
        </svg>

        <!-- 未持有 Core ID -->
        <svg v-else-if="type === 'no-core-id'" class="jv-state-icon" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="8" y="16" width="48" height="32" rx="6" stroke="var(--jv-border)" stroke-width="2"/>
          <circle cx="22" cy="32" r="7" stroke="var(--jv-border)" stroke-width="1.5"/>
          <line x1="34" y1="26" x2="50" y2="26" stroke="var(--jv-border)" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="34" y1="32" x2="50" y2="32" stroke="var(--jv-border)" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="34" y1="38" x2="44" y2="38" stroke="var(--jv-border)" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="8" y1="8" x2="56" y2="56" stroke="var(--jv-text-muted)" stroke-width="2" stroke-linecap="round" opacity="0.4"/>
        </svg>

      </template>

      <!-- 补充说明文字 -->
      <template #default>
        <p class="jv-state-desc">
          {{ description ?? defaultMeta[type].desc }}
        </p>
        <NButton
          v-if="action"
          type="primary"
          size="medium"
          style="margin-top: 16px"
          @click="emit('action')"
        >
          {{ action }}
        </NButton>
      </template>
    </NEmpty>
  </div>
</template>

<style scoped>
.jv-page-state {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 48px 24px;
  min-height: 160px;
}

.jv-state-icon {
  width: 64px;
  height: 64px;
}

.jv-state-desc {
  color: var(--jv-text-muted);
  font-size: 13px;
  text-align: center;
  max-width: 280px;
  line-height: 1.6;
  margin: 0 auto;
}
</style>
