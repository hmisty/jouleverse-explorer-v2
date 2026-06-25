<script setup lang="ts">
import { useId } from 'vue'

withDefaults(defineProps<{
  size?: number
  label?: string
}>(), {
  size: 48,
  label: '加载中',
})

// 每个实例独立 ID，避免多个 JvLoading 的 SVG defs 互相覆盖
const uid = useId()
</script>

<template>
  <div class="jv-loading" role="status" :aria-label="label">
    <svg
      :width="size"
      :height="size"
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
      class="jv-loading__svg"
      aria-hidden="true"
    >
      <defs>
        <clipPath :id="`jv-j-clip-${uid}`">
          <path d="M18 6 H30 V6 Q30 6 30 6 L30 30 Q30 40 20 42 Q10 44 8 36 L8 30 H14 Q14 38 20 37 Q26 36 26 30 L26 6 Z"/>
        </clipPath>
        <linearGradient :id="`jv-water-grad-${uid}`" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#EB1727" stop-opacity="0.9"/>
          <stop offset="100%" stop-color="#B91C1C"/>
        </linearGradient>
      </defs>

      <path
        d="M18 6 H30 V30 Q30 40 20 42 Q10 44 8 36 L8 30 H14 Q14 38 20 37 Q26 36 26 30 L26 6 Z"
        fill="none"
        stroke="var(--jv-border)"
        stroke-width="1.5"
      />

      <g :clip-path="`url(#jv-j-clip-${uid})`">
        <rect
          x="-4" y="0" width="56" height="48"
          :fill="`url(#jv-water-grad-${uid})`"
          class="jv-loading__water"
        />
        <path
          d="M-4 0 Q6 -4 16 0 Q26 4 36 0 Q46 -4 56 0 L56 8 L-4 8 Z"
          fill="rgba(255,255,255,0.25)"
          class="jv-loading__wave"
        />
      </g>

      <path
        d="M18 6 H30 V30 Q30 40 20 42 Q10 44 8 36 L8 30 H14 Q14 38 20 37 Q26 36 26 30 L26 6 Z"
        fill="none"
        stroke="var(--jv-border)"
        stroke-width="1"
      />
    </svg>
    <span class="jv-loading__label">{{ label }}</span>
  </div>
</template>

<style scoped>
.jv-loading {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.jv-loading__svg {
  overflow: visible;
}

/* 水位从底部上涨到顶部，循环 */
.jv-loading__water {
  transform: translateY(100%);
  animation: jv-rise 1.6s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

/* 波浪横向移动 */
.jv-loading__wave {
  animation: jv-wave 1.6s linear infinite;
}

@keyframes jv-rise {
  0%   { transform: translateY(100%); }
  80%  { transform: translateY(0%); }
  100% { transform: translateY(0%); }
}

@keyframes jv-wave {
  0%   { transform: translateX(0); }
  100% { transform: translateX(20px); }
}

.jv-loading__label {
  font-size: 12px;
  color: var(--jv-text-muted);
  user-select: none;
}
</style>
