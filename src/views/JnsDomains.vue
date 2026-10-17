<template>
  <div class="jns-domains">
    <!-- 头部 -->
    <div class="header">
      <button @click="$router.push('/')" class="back-btn">{{ t('backToHome') }}</button>
      <div class="title-row">
        <h1>🌐 {{ t('title') }}</h1>
        <select
          class="lang-select"
          :value="lang"
          :aria-label="t('langLabel')"
          @change="onLangChange"
        >
          <option v-for="l in LANGS" :key="l.code" :value="l.code">{{ l.label }}</option>
        </select>
      </div>
      <p class="subtitle">{{ t('subtitle') }}</p>
    </div>

    <!-- 统计卡片 -->
    <div class="stats-row">
      <div class="stat-card">
        <span class="stat-value">{{ totalSupply }}</span>
        <span class="stat-label">{{ t('statTotal') }}</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{{ boundCount }}</span>
        <span class="stat-label">{{ t('statBound') }}</span>
        <span v-if="hasMore" class="stat-partial">{{ t('partialMark') }}</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{{ ownerCount }}</span>
        <span class="stat-label">{{ t('statOwners') }}</span>
        <span v-if="hasMore" class="stat-partial">{{ t('partialMark') }}</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{{ loadedCount }}<template v-if="totalSupply > 0"> / {{ totalSupply }}</template></span>
        <span class="stat-label">{{ t('statProgress') }}</span>
      </div>
    </div>

    <!-- 搜索 / 筛选 -->
    <div class="toolbar">
      <input
        v-model="search"
        type="text"
        class="search-input"
        :placeholder="t('searchPlaceholder')"
      >
      <button class="refresh-btn" :disabled="isLoading" @click="refresh">{{ t('refresh') }}</button>
    </div>
    <div class="filter-row">
      <button
        class="filter-chip"
        :class="{ active: letter === '' }"
        @click="letter = ''"
      >{{ t('filterAll') }}</button>
      <button
        v-for="c in letters"
        :key="c"
        class="filter-chip"
        :class="{ active: letter === c }"
        @click="letter = c"
      >{{ c }}</button>
    </div>

    <!-- 加载中（首屏） -->
    <JvLoading v-if="isLoading && domains.length === 0" :label="t('loading')" />

    <!-- 错误 -->
    <JvPageState
      v-else-if="loadError"
      type="network-error"
      :title="t('errorTitle')"
      :description="loadError"
      :action="t('retry')"
      @action="refresh"
    />

    <!-- 空注册表：链上尚无任何域名（区别于「搜索无结果」） -->
    <JvPageState
      v-else-if="totalSupply === 0"
      type="empty"
      :title="t('noDomainsTitle')"
      :description="t('noDomainsDesc')"
    />

    <!-- 搜索/筛选无结果 -->
    <JvPageState
      v-else-if="filteredDomains.length === 0"
      type="search-empty"
      :title="t('emptyTitle')"
      :description="t('emptyDesc')"
    />

    <!-- 域名网格 -->
    <div v-else class="domains-grid">
      <div v-for="d in filteredDomains" :key="d.tokenId" class="domain-card">
        <div class="card-head">
          <span class="domain-name">{{ d.name }}.j</span>
          <span class="domain-status" :class="d.boundUnknown ? 'unknown' : d.isBound ? 'bound' : 'unbound'">
            {{ d.boundUnknown ? t('boundUnknownTag') : d.isBound ? t('boundTag') : t('unboundTag') }}
          </span>
        </div>
        <div class="card-body">
          <div class="owner-line">
            <span class="owner-label">{{ t('ownerLabel') }}</span>
            <JvHashText :value="d.owner" type="address" :truncate="6" />
          </div>
          <div class="card-meta">#{{ d.tokenId }}</div>
        </div>
        <div class="card-actions">
          <JvActionButton type="default" size="small" @click="goDetail(d.name)">{{ t('viewDetail') }}</JvActionButton>
        </div>
      </div>
    </div>

    <!-- 加载更多 -->
    <div v-if="!loadError && domains.length > 0" class="load-more-row">
      <p class="progress-hint">{{ t('progressHint', { loaded: loadedCount, total: totalSupply }) }}</p>
      <p v-if="failedCount > 0" class="failed-hint">{{ t('failedHint', { n: failedCount }) }}</p>
      <p class="sort-hint">{{ t('newestFirst') }}</p>
      <div class="load-buttons">
        <JvActionButton v-if="hasMore" :loading="isLoading" @click="loadMore()">{{ t('loadMore') }}</JvActionButton>
        <JvActionButton v-if="hasMore" :loading="isLoading" type="default" @click="loadAll()">
          {{ t('loadAll', { total: totalSupply - loadedCount }) }}
        </JvActionButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useJnsDomains } from '@/composables/useJnsDomains'
import { lang, setLang, t, LANGS } from '@/i18n'
import { JvActionButton, JvHashText, JvPageState, JvLoading } from '../design-system'

const router = useRouter()
const {
  totalSupply,
  domains,
  loadedCount,
  failedCount,
  isLoading,
  loadError,
  hasMore,
  boundCount,
  ownerCount,
  loadFirstPage,
  loadMore,
  loadAll,
} = useJnsDomains()

// ===== 搜索 / 筛选（纯前端过滤）=====
const search = ref('')
const letter = ref('')

const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

const filteredDomains = computed(() => {
  const q = search.value.trim().toLowerCase()
  return domains.value.filter((d) => {
    if (letter.value && !d.name.toLowerCase().startsWith(letter.value.toLowerCase())) return false
    if (q && !d.name.toLowerCase().includes(q)) return false
    return true
  })
})

// ===== 操作 =====
const onLangChange = (e: Event) => {
  setLang((e.target as HTMLSelectElement).value as typeof lang.value)
}

const refresh = () => { loadFirstPage(true) }

const goDetail = (name: string) => {
  router.push(`/jns/${encodeURIComponent(name)}`)
}

onMounted(() => {
  loadFirstPage()
})
</script>

<style scoped>
.jns-domains {
  max-width: 1080px;
  margin: 0 auto;
  padding: 20px;
}

.header { margin-bottom: 20px; }

.title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
}

.title-row h1 { margin: 0; font-size: 24px; color: var(--jv-text-primary); }

.lang-select {
  background: var(--jv-bg-surface);
  color: var(--jv-text-primary);
  border: 1px solid var(--jv-border);
  border-radius: var(--jv-radius-md);
  padding: 6px 10px;
  font-size: 13px;
  cursor: pointer;
}
.lang-select:focus { outline: none; border-color: var(--jv-border-focus); }

.subtitle { margin: 8px 0 0 0; color: var(--jv-text-muted); font-size: 14px; }

.back-btn {
  background: var(--jv-bg-subtle);
  color: var(--jv-text-muted);
  border: none;
  padding: 8px 16px;
  border-radius: var(--jv-radius-md);
  cursor: pointer;
  margin-bottom: 12px;
  font-size: 14px;
  transition: background var(--jv-duration-fast) var(--jv-ease);
}
.back-btn:hover { background: var(--jv-bg-hover); }

/* 统计卡片 */
.stats-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.stat-card {
  background: var(--jv-bg-subtle);
  border: 1px solid var(--jv-border);
  border-radius: var(--jv-radius-lg);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat-value { font-size: 22px; font-weight: 700; color: var(--jv-text-primary); }
.stat-label { font-size: 12px; color: var(--jv-text-muted); }
.stat-partial { font-size: 11px; color: var(--jv-text-disabled); }

/* 工具栏 */
.toolbar { display: flex; gap: 10px; margin-bottom: 12px; }

.search-input {
  flex: 1;
  padding: 10px 16px;
  border: 1px solid var(--jv-border);
  border-radius: var(--jv-radius-md);
  font-size: 15px;
  background: var(--jv-bg-surface);
  color: var(--jv-text-primary);
  transition: border-color var(--jv-duration-fast) var(--jv-ease);
}
.search-input:focus {
  outline: none;
  border-color: var(--jv-border-focus);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--jv-brand) 12%, transparent);
}

.refresh-btn {
  background: var(--jv-bg-subtle);
  color: var(--jv-text-muted);
  border: 1px solid var(--jv-border);
  padding: 8px 16px;
  border-radius: var(--jv-radius-md);
  cursor: pointer;
  font-size: 14px;
  transition: all var(--jv-duration-fast) var(--jv-ease);
}
.refresh-btn:hover:not(:disabled) { background: var(--jv-bg-hover); color: var(--jv-text-primary); }
.refresh-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* 字母筛选 */
.filter-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px; }

.filter-chip {
  background: var(--jv-bg-subtle);
  color: var(--jv-text-muted);
  border: 1px solid var(--jv-border);
  padding: 4px 10px;
  border-radius: 16px;
  cursor: pointer;
  font-size: 13px;
  transition: all var(--jv-duration-fast) var(--jv-ease);
}
.filter-chip:hover { background: var(--jv-bg-hover); color: var(--jv-text-primary); }
.filter-chip.active {
  background: var(--jv-brand);
  border-color: var(--jv-brand);
  color: #fff;
}

/* 域名网格 */
.domains-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
}

.domain-card {
  background: var(--jv-bg-surface);
  border: 1px solid var(--jv-border);
  border-radius: var(--jv-radius-lg);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: border-color var(--jv-duration-fast) var(--jv-ease);
}
.domain-card:hover { border-color: var(--jv-border-focus); }

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.domain-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--jv-text-primary);
  word-break: break-all;
}

.domain-status {
  flex-shrink: 0;
  font-size: 12px;
  padding: 2px 10px;
  border-radius: 12px;
}
.domain-status.bound {
  background: color-mix(in srgb, var(--jv-success) 14%, transparent);
  color: var(--jv-success);
}
.domain-status.unbound {
  background: var(--jv-bg-subtle);
  color: var(--jv-text-muted);
}
.domain-status.unknown {
  background: color-mix(in srgb, var(--jv-warning) 14%, transparent);
  color: var(--jv-warning);
}

.card-body { display: flex; flex-direction: column; gap: 4px; }

.owner-line {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.owner-label { font-size: 12px; color: var(--jv-text-muted); flex-shrink: 0; }

.card-meta { font-size: 12px; color: var(--jv-text-disabled); }

.card-actions { display: flex; justify-content: flex-end; }

/* 加载更多 */
.load-more-row {
  margin-top: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.progress-hint { margin: 0; font-size: 13px; color: var(--jv-text-muted); }
.failed-hint { margin: 0; font-size: 12px; color: var(--jv-warning); }
.sort-hint { margin: 0; font-size: 12px; color: var(--jv-text-disabled); }

.load-buttons { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }

/* 响应式 */
@media (max-width: 640px) {
  .stats-row { grid-template-columns: 1fr 1fr; }
  .domains-grid { grid-template-columns: 1fr; }
  .toolbar { flex-direction: column; }
}
</style>
