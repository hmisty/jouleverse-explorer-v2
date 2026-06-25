<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { NTooltip } from 'naive-ui'

type HashType = 'address' | 'tx' | 'block' | 'plain'

const props = withDefaults(defineProps<{
  value: string
  type?: HashType
  /** 截断长度，0 = 不截断 */
  truncate?: number
  /** 是否显示复制按钮 */
  copyable?: boolean
  /** 是否可点击跳转（自动按 type 路由，也可传 href 覆盖） */
  linkable?: boolean
  href?: string
  /** 是否强制等宽字体 */
  mono?: boolean
}>(), {
  type: 'plain',
  truncate: 8,
  copyable: true,
  linkable: true,
  mono: true,
})

const router = useRouter()
const copied = ref(false)

const display = computed(() => {
  const v = props.value
  if (!v) return ''
  if (props.truncate === 0) return v
  const n = props.truncate
  if (v.length <= n * 2 + 3) return v
  return `${v.slice(0, n)}...${v.slice(-n)}`
})

const resolvedHref = computed(() => {
  if (props.href) return props.href
  if (!props.linkable) return undefined
  if (props.type === 'address') return `/address/${props.value}`
  if (props.type === 'tx') return `/tx/${props.value}`
  if (props.type === 'block') return `/block/${props.value}`
  return undefined
})

function handleClick(e: MouseEvent) {
  if (!resolvedHref.value) return
  e.preventDefault()
  router.push(resolvedHref.value)
}

async function handleCopy() {
  if (!props.value) return
  try {
    await navigator.clipboard.writeText(props.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 1500)
  } catch {
    // 浏览器不支持 clipboard API，静默失败
  }
}
</script>

<template>
  <span class="jv-hash" :class="{ 'jv-hash--mono': mono }">
    <NTooltip v-if="truncate !== 0 && value.length > truncate * 2 + 3" placement="top" :delay="400">
      <template #trigger>
        <component
          :is="resolvedHref ? 'a' : 'span'"
          :href="resolvedHref"
          class="jv-hash__text"
          :class="{ 'jv-hash__text--link': !!resolvedHref }"
          @click="handleClick"
        >{{ display }}</component>
      </template>
      {{ value }}
    </NTooltip>

    <component
      v-else
      :is="resolvedHref ? 'a' : 'span'"
      :href="resolvedHref"
      class="jv-hash__text"
      :class="{ 'jv-hash__text--link': !!resolvedHref }"
      @click="handleClick"
    >{{ display }}</component>

    <button
      v-if="copyable && value"
      class="jv-hash__copy"
      :class="{ 'jv-hash__copy--ok': copied }"
      :aria-label="copied ? '已复制' : '复制'"
      :title="copied ? '已复制' : '复制'"
      @click.stop="handleCopy"
    >
      <!-- 复制图标 -->
      <svg v-if="!copied" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6">
        <rect x="5" y="5" width="9" height="9" rx="1.5"/>
        <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2H3.5A1.5 1.5 0 0 0 2 3.5V9.5A1.5 1.5 0 0 0 3.5 11H5"/>
      </svg>
      <!-- 已复制勾 -->
      <svg v-else width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="3 8 6.5 12 13 4"/>
      </svg>
    </button>
  </span>
</template>

<style scoped>
.jv-hash {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
}

.jv-hash--mono .jv-hash__text {
  font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
  font-size: 0.875em;
}

.jv-hash__text {
  color: inherit;
  text-decoration: none;
  word-break: break-all;
}

.jv-hash__text--link {
  color: var(--jv-link);
  cursor: pointer;
  transition: color var(--jv-duration-fast) var(--jv-ease),
              text-decoration var(--jv-duration-fast);
}

.jv-hash__text--link:hover {
  color: var(--jv-link-hover);
  text-decoration: underline;
}

.jv-hash__text--link:focus-visible {
  outline: 2px solid var(--jv-brand);
  outline-offset: 2px;
  border-radius: 2px;
}

.jv-hash__copy {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: var(--jv-text-muted);
  cursor: pointer;
  border-radius: var(--jv-radius-sm);
  padding: 0;
  transition: color var(--jv-duration-fast), background var(--jv-duration-fast);
}

.jv-hash__copy:hover {
  color: var(--jv-text-primary);
  background: var(--jv-bg-subtle);
}

.jv-hash__copy:focus-visible {
  outline: 2px solid var(--jv-brand);
  outline-offset: 2px;
}

.jv-hash__copy--ok {
  color: var(--jv-success);
}
</style>
