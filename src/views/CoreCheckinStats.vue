<script setup lang="ts">
import { onMounted } from 'vue'
import { NButton, NSpace, NAlert } from 'naive-ui'
import { useCheckinStats } from '../composables/useCheckinStats'
import { JvLoading, JvPageState } from '../design-system'

const stats = useCheckinStats()

onMounted(() => stats.init())
</script>

<template>
  <div class="checkin-stats-page">
    <!-- 页头 -->
    <div class="page-header">
      <h1 class="page-title">POP 徽章签到统计</h1>
      <p class="page-subtitle">全网 Core ID 月度签到记录（UTC+8）</p>
    </div>

    <!-- 控制栏 -->
    <div class="control-bar">
      <div class="control-month">
        <span class="month-label">当前月份</span>
        <span class="month-value">{{ stats.currentMonthKey.value ?? '—' }}</span>
      </div>

      <NSpace align="center">
        <NButton
          size="small"
          :disabled="!stats.canGoPrevMonth.value"
          @click="stats.goPrevMonth()"
        >
          ← 上一月
        </NButton>
        <NButton
          size="small"
          type="primary"
          :loading="stats.isLoading.value"
          :disabled="!stats.hasMoreData.value"
          @click="stats.loadMore()"
        >
          {{ stats.isLoading.value ? '加载中...' : '加载更多' }}
        </NButton>
        <NButton
          size="small"
          :disabled="!stats.canGoNextMonth.value"
          @click="stats.goNextMonth()"
        >
          下一月 →
        </NButton>
      </NSpace>

      <div class="control-progress">
        <span v-if="stats.loadedCount.value > 0">
          已加载 {{ stats.loadedCount.value }} / 共 {{ stats.totalSupply.value }} 条
        </span>
        <span v-if="!stats.hasMoreData.value && stats.loadedCount.value > 0" class="all-loaded">
          ✓ 已加载全部数据
        </span>
      </div>
    </div>

    <!-- 完整性状态条 -->
    <NAlert
      v-if="stats.currentMonthIntegrity.value"
      :type="stats.currentMonthIntegrity.value.status === 'valid' ? 'success'
           : stats.currentMonthIntegrity.value.status === 'warning' ? 'warning'
           : stats.currentMonthIntegrity.value.status === 'error' ? 'error'
           : 'info'"
      :title="stats.currentMonthIntegrity.value.message"
      class="integrity-alert"
    >
      <template v-if="stats.currentMonthIntegrity.value.status === 'warning'">
        <NButton size="tiny" type="primary" @click="stats.retryFailed()">重试失败数据</NButton>
      </template>
    </NAlert>

    <!-- 初始加载中 -->
    <div v-if="stats.isLoading.value && !stats.currentMonthStats.value" class="loading-center">
      <JvLoading :size="56" label="正在加载签到数据..." />
    </div>

    <!-- 错误状态 -->
    <JvPageState
      v-else-if="stats.error.value"
      type="network-error"
      :description="stats.error.value"
      action="重试"
      @action="stats.init()"
    />

    <!-- 月份统计表格 -->
    <div v-else-if="stats.currentMonthStats.value" class="month-card">
      <!-- 月份摘要 -->
      <div class="month-summary">
        <h2 class="month-title">{{ stats.currentMonthStats.value.monthYear }} 签到统计</h2>
        <div class="summary-badges">
          <span class="badge badge-primary">{{ stats.currentMonthStats.value.totalCheckIns }} 次签到</span>
          <span class="badge badge-secondary">{{ stats.currentMonthStats.value.uniqueCores }} 个 Core ID</span>
        </div>
      </div>

      <!-- 统计表格 -->
      <div class="table-wrapper">
        <table class="checkin-table">
          <thead>
            <tr>
              <th>Core ID</th>
              <th>签到次数</th>
              <th>首次签到时间</th>
              <th>首次区块</th>
              <th>最后签到时间</th>
              <th>最后区块</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in stats.currentMonthStats.value.coreStats"
              :key="row.coreId"
            >
              <td>
                <span class="core-id-text">🆔 J{{ row.coreId }}</span>
              </td>
              <td>
                <span class="count-badge">{{ row.count }} 次</span>
              </td>
              <td class="time-cell">{{ row.firstCheckInTime }}</td>
              <td>
                <RouterLink
                  v-if="typeof row.firstBlockNumber === 'number'"
                  :to="`/block/${row.firstBlockNumber}`"
                  class="block-link"
                >
                  {{ row.firstBlockNumber }}
                </RouterLink>
                <span v-else>—</span>
              </td>
              <td class="time-cell">{{ row.lastCheckInTime }}</td>
              <td>
                <RouterLink
                  v-if="typeof row.lastBlockNumber === 'number'"
                  :to="`/block/${row.lastBlockNumber}`"
                  class="block-link"
                >
                  {{ row.lastBlockNumber }}
                </RouterLink>
                <span v-else>—</span>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- 无数据 -->
        <div v-if="stats.currentMonthStats.value.coreStats.length === 0" class="no-data">
          <JvPageState type="empty" title="当前月份无签到记录" />
        </div>
      </div>
    </div>

    <!-- 暂无任何数据（加载完成但空） -->
    <JvPageState
      v-else-if="!stats.isLoading.value"
      type="empty"
      title="暂无签到记录"
    />
  </div>
</template>

<style scoped>
.checkin-stats-page {
  max-width: 1100px;
  margin: 0 auto;
  padding: 32px 20px;
}

.page-header {
  margin-bottom: 24px;
}

.page-title {
  font-size: 1.6rem;
  font-weight: 700;
  color: var(--jv-text-primary);
  margin: 0 0 6px 0;
}

.page-subtitle {
  font-size: 0.9rem;
  color: var(--jv-text-muted);
  margin: 0;
}

/* 控制栏 */
.control-bar {
  display: flex;
  align-items: center;
  gap: 24px;
  background: var(--jv-bg-subtle);
  border: 1px solid var(--jv-border);
  border-radius: var(--jv-radius-lg);
  padding: 16px 20px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.control-month {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 100px;
}

.month-label {
  font-size: 11px;
  color: var(--jv-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.month-value {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--jv-text-primary);
}

.control-progress {
  margin-left: auto;
  font-size: 0.85rem;
  color: var(--jv-text-secondary);
  text-align: right;
}

.all-loaded {
  color: var(--jv-success);
  font-weight: 500;
}

.integrity-alert {
  margin-bottom: 16px;
}

/* 加载中 */
.loading-center {
  display: flex;
  justify-content: center;
  padding: 64px 0;
}

/* 月份卡片 */
.month-card {
  background: var(--jv-bg-surface);
  border: 1px solid var(--jv-border);
  border-radius: var(--jv-radius-lg);
  overflow: hidden;
}

.month-summary {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--jv-border);
  flex-wrap: wrap;
}

.month-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--jv-text-primary);
  margin: 0;
}

.summary-badges {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

.badge {
  font-size: 12px;
  font-weight: 500;
  padding: 3px 10px;
  border-radius: 999px;
}

.badge-primary {
  background: var(--jv-brand-subtle);
  color: var(--jv-brand);
}

.badge-secondary {
  background: var(--jv-bg-subtle);
  color: var(--jv-text-secondary);
  border: 1px solid var(--jv-border);
}

/* 表格 */
.table-wrapper {
  overflow-x: auto;
}

.checkin-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.checkin-table thead tr {
  background: var(--jv-bg-subtle);
}

.checkin-table th {
  padding: 10px 16px;
  text-align: left;
  font-weight: 600;
  font-size: 12px;
  color: var(--jv-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-bottom: 1px solid var(--jv-border);
  white-space: nowrap;
}

.checkin-table td {
  padding: 10px 16px;
  border-bottom: 1px solid var(--jv-border);
  color: var(--jv-text-primary);
  vertical-align: middle;
}

.checkin-table tbody tr:last-child td {
  border-bottom: none;
}

.checkin-table tbody tr:hover {
  background: var(--jv-bg-subtle);
}

.core-id-text {
  font-weight: 700;
  color: var(--jv-text-primary);
  font-family: monospace;
}

.count-badge {
  display: inline-block;
  background: var(--jv-success-bg);
  color: var(--jv-success);
  font-size: 12px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
}

.time-cell {
  color: var(--jv-text-secondary);
  font-size: 0.825rem;
  white-space: nowrap;
}

.block-link {
  color: var(--jv-brand);
  text-decoration: none;
  font-family: monospace;
}

.block-link:hover {
  text-decoration: underline;
}

.no-data {
  padding: 16px;
}
</style>
