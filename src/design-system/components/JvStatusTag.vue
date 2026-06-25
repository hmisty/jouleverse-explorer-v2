<script setup lang="ts">
import { computed } from 'vue'
import { NTag } from 'naive-ui'

export type StatusType =
  /* 交易状态 */
  | 'tx-success' | 'tx-failed' | 'tx-pending'
  /* 网络 */
  | 'online' | 'offline'
  /* 钱包 */
  | 'wallet-connected' | 'wallet-disconnected'
  /* Core ID */
  | 'active' | 'expired' | 'no-id'
  /* 自定义 */
  | 'success' | 'warning' | 'error' | 'info' | 'default'

const props = withDefaults(defineProps<{
  status: StatusType
  label?: string
  size?: 'small' | 'medium' | 'large'
  round?: boolean
}>(), {
  size: 'small',
  round: true,
})

type NTagType = 'default' | 'success' | 'warning' | 'error' | 'info' | 'primary'

const meta: Record<StatusType, { type: NTagType; defaultLabel: string }> = {
  'tx-success':           { type: 'success', defaultLabel: '成功' },
  'tx-failed':            { type: 'error',   defaultLabel: '失败' },
  'tx-pending':           { type: 'warning', defaultLabel: '待确认' },
  'online':               { type: 'success', defaultLabel: '在线' },
  'offline':              { type: 'error',   defaultLabel: '离线' },
  'wallet-connected':     { type: 'success', defaultLabel: '已连接' },
  'wallet-disconnected':  { type: 'default', defaultLabel: '未连接' },
  'active':               { type: 'success', defaultLabel: '活跃' },
  'expired':              { type: 'warning', defaultLabel: '已过期' },
  'no-id':                { type: 'default', defaultLabel: '未持有' },
  'success':              { type: 'success', defaultLabel: '成功' },
  'warning':              { type: 'warning', defaultLabel: '警告' },
  'error':                { type: 'error',   defaultLabel: '错误' },
  'info':                 { type: 'info',    defaultLabel: '信息' },
  'default':              { type: 'default', defaultLabel: '—' },
}

const resolved = computed(() => meta[props.status] ?? meta['default'])
const displayLabel = computed(() => props.label ?? resolved.value.defaultLabel)
</script>

<template>
  <NTag
    :type="resolved.type"
    :size="size"
    :round="round"
    :bordered="false"
  >
    {{ displayLabel }}
  </NTag>
</template>
