<script setup lang="ts">
import { NButton } from 'naive-ui'
import type { ButtonProps } from 'naive-ui'

/**
 * 链上操作按钮，统一处理 loading / 防重复提交 / 成功状态。
 *
 * 用法（父组件负责管理状态）：
 *   const loading = ref(false)
 *   const success = ref(false)
 *   async function handleCheckIn() {
 *     loading.value = true
 *     try { await doSomething(); success.value = true }
 *     catch { ... }
 *     finally { loading.value = false }
 *   }
 *   <JvActionButton :loading="loading" :success="success" @click="handleCheckIn">签到</JvActionButton>
 */
const props = withDefaults(defineProps<{
  type?: ButtonProps['type']
  size?: ButtonProps['size']
  disabled?: boolean
  /** 外部控制的 loading 状态（true 时禁止重复点击）*/
  loading?: boolean
  /** 外部控制的成功状态（true 时显示成功 UI，禁止再次点击）*/
  success?: boolean
  /** success=true 时显示的文字 */
  successText?: string
}>(), {
  type: 'primary',
  size: 'medium',
  disabled: false,
  loading: false,
  success: false,
})

const emit = defineEmits<{ (e: 'click', ev: MouseEvent): void }>()

function handleClick(ev: MouseEvent) {
  if (props.loading || props.disabled || props.success) return
  emit('click', ev)
}
</script>

<template>
  <NButton
    :type="success ? 'default' : type"
    :size="size"
    :disabled="disabled || loading || success"
    :loading="loading"
    class="jv-action-btn"
    :class="{ 'jv-action-btn--success': success }"
    :style="success ? {
      '--n-border': '1px solid var(--jv-success)',
      '--n-border-hover': '1px solid var(--jv-success)',
      '--n-border-disabled': '1px solid var(--jv-success)',
      '--n-text-color': 'var(--jv-success)',
      '--n-text-color-hover': 'var(--jv-success)',
      '--n-text-color-disabled': 'var(--jv-success)',
      '--n-color': 'transparent',
      '--n-color-hover': 'var(--jv-success-bg)',
      '--n-color-disabled': 'transparent',
    } : undefined"
    v-bind="$attrs"
    @click="handleClick"
  >
    <template v-if="success">
      <svg
        width="14" height="14" viewBox="0 0 16 16"
        fill="none" stroke="currentColor" stroke-width="2.2"
        style="margin-right:4px; vertical-align:middle; color: var(--jv-success)"
      >
        <polyline points="3 8 6.5 12 13 4"/>
      </svg>
      {{ successText ?? '成功' }}
    </template>
    <slot v-else />
  </NButton>
</template>

<style scoped>
.jv-action-btn {
  transition: opacity var(--jv-duration-fast) var(--jv-ease),
              transform var(--jv-duration-fast) var(--jv-ease);
}

.jv-action-btn:active:not(:disabled) {
  transform: scale(0.97);
}

.jv-action-btn--success {
  /* 颜色通过 Naive UI CSS 变量注入（:style 绑定），无需 !important */
}
</style>
