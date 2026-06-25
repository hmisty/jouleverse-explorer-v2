<script setup lang="ts">
import { computed } from 'vue'
import { formatUnits } from 'viem'

const props = withDefaults(defineProps<{
  /** 原始 BigInt 值（wei 单位） */
  value: bigint | string | number
  /** 小数位数，默认 18（JVB 与 ETH 相同） */
  decimals?: number
  /** 展示单位 */
  unit?: string
  /** 最多显示小数位数，超出截断（不四舍五入） */
  maxDecimals?: number
  /** 是否显示千分符 */
  formatted?: boolean
  /** 文字大小：'sm' | 'md' | 'lg' */
  textSize?: 'sm' | 'md' | 'lg'
}>(), {
  decimals: 18,
  unit: 'J',
  maxDecimals: 6,
  formatted: true,
  textSize: 'md',
})

const fontSize: Record<string, string> = { sm: '12px', md: '14px', lg: '18px' }

const display = computed(() => {
  let raw: bigint
  try {
    raw = BigInt(props.value)
  } catch {
    return { int: '—', frac: '', unit: props.unit }
  }

  const full = formatUnits(raw, props.decimals)
  const [intPart, fracPart = ''] = full.split('.')

  /* 千分符（手动添加，避免 Number() 对大整数精度丢失） */
  const intStr = props.formatted
    ? intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    : intPart

  /* 截断小数（不四舍五入） */
  const frac = fracPart.slice(0, props.maxDecimals).replace(/0+$/, '')

  return {
    int: intStr,
    frac: frac ? `.${frac}` : '',
    unit: props.unit,
  }
})
</script>

<template>
  <span class="jv-amount" :style="{ fontSize: fontSize[textSize] }">
    <span class="jv-amount__int">{{ display.int }}</span>
    <span v-if="display.frac" class="jv-amount__frac">{{ display.frac }}</span>
    <span class="jv-amount__unit">{{ display.unit }}</span>
  </span>
</template>

<style scoped>
.jv-amount {
  display: inline-flex;
  align-items: baseline;
  gap: 3px;
  font-variant-numeric: tabular-nums;
  color: var(--jv-text-primary);
}

.jv-amount__int {
  font-weight: 600;
}

.jv-amount__frac {
  color: var(--jv-text-secondary);
  font-weight: 400;
}

.jv-amount__unit {
  font-size: 0.82em;
  color: var(--jv-text-muted);
  font-weight: 500;
  margin-left: 1px;
}
</style>
