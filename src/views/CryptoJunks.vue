<script lang="ts">
// 链上客户端只在这里接一次；逻辑层（utils/cryptojunks.ts）不依赖它，可离线测。
import { publicClient } from '../config/client'
import type { JunkReaderClient } from '../utils/cryptojunks-chain'
const chainClient: JunkReaderClient = publicClient as unknown as JunkReaderClient
export { chainClient }
</script>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { NAlert } from 'naive-ui'
import { JvActionButton, JvHashText, JvPageState } from '../design-system'
import { CRYPTOJUNKS_ADDRESS } from '../contracts/cryptojunks'
import {
  CRYPTOJUNKS_SUPPLY_LIMIT,
  PAGE_SIZE,
  buildPageNav,
  isGolden,
  junkPath,
  junkStats,
  pageKind,
  pagePath,
  pageTokenIds,
  parseJunkIdParam,
  parsePageParam,
  rarityEmoji,
  rarityOf,
  sealedLabel,
  type JunkPageKind,
} from '../utils/cryptojunks'
import { fetchSupply, loadJunkPage, type JunkItem } from '../utils/cryptojunks-chain'

const route = useRoute()

const nav = buildPageNav()
const stats = junkStats()

/** 页号：路由缺省时等同 v1 的 pageId = 0 */
const pageId = computed(() => {
  const raw = route.params.pageId
  if (raw === undefined || raw === '') return 0
  return parsePageParam(Array.isArray(raw) ? raw[0] : raw)
})

const kind = computed<JunkPageKind | null>(() =>
  pageId.value === null ? null : pageKind(pageId.value),
)

/** 单枚详情：v1 的 /page/:pageId/id/:junkId */
const focusJunkId = computed(() => {
  const raw = route.params.junkId
  if (raw === undefined || raw === '') return null
  return parseJunkIdParam(Array.isArray(raw) ? raw[0] : raw)
})

const supply = ref<number | null>(null)
const items = ref<JunkItem[]>([])
const loading = ref(false)
const error = ref('')

const title = computed(() => {
  if (kind.value === 'broken') return '打坏的铭文（broken）'
  if (kind.value === 'precious') return '珍品（precious 🌟）'
  if (kind.value === 'rare') return '绝品（rare 💎）'
  if (kind.value === 'legend') return '传奇（legend 👑）'
  return '常规页'
})

/** 该页应显示的 tokenId。单枚详情模式只看那一枚 */
const targetIds = computed<number[]>(() => {
  if (pageId.value === null || kind.value === null) return []
  if (focusJunkId.value !== null) return [focusJunkId.value]
  return pageTokenIds(pageId.value)
})

/** 单枚详情模式下给一个「返回本页」链接用的页号 */
const pageForJunk = computed(() => {
  if (focusJunkId.value === null) return null
  // 尽量回到该枚真正所在的常规页（v1 是把 pageId 原样带到 id 路由上的）
  return Math.floor(focusJunkId.value / PAGE_SIZE)
})

async function load() {
  if (pageId.value === null || kind.value === null) return
  loading.value = true
  error.value = ''
  try {
    // supply 只在首次读，之后复用：它等于 10000 是 set in stone，不会变
    if (supply.value === null) supply.value = await fetchSupply(chainClient)
    items.value = await loadJunkPage(chainClient, targetIds.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '读取链上数据失败'
    items.value = []
  } finally {
    loading.value = false
  }
}

// 翻页 / 切换单枚详情都要重新拉。watch 里必须把 error 清掉，
// 否则上一页的网络错误会一直挂在下一页上。
watch(
  () => [pageId.value, focusJunkId.value] as const,
  () => { void load() },
  { immediate: true },
)
</script>

<template>
  <main class="cryptojunks" :aria-busy="loading">
    <RouterLink to="/tools">← 工具集</RouterLink>
    <h1>CryptoJunks <small>所有已上链的 Junk 铭文</small></h1>

    <!-- 页号非法：v1 会静默显示一张空表，这里给明确空态 -->
    <template v-if="pageId === null || kind === null">
      <JvPageState
        type="search-empty"
        title="页号无效"
        :description="`CryptoJunks 只有 0–${99} 常规页、1000–1002 打坏页，以及 10000 / 100000 / 1000000 三个稀有度页。`"
        action="回到第 1 页"
        @action="$router.push(pagePath(0))"
      />
    </template>

    <template v-else>
      <!-- 状态行：与 v1 同一句话 -->
      <p class="status">
        Current supply:
        <strong data-testid="supply">{{ supply === null ? '…' : supply }}</strong>.
        Supply limit: {{ CRYPTOJUNKS_SUPPLY_LIMIT }}.
        Sealed: <strong data-testid="sealed">{{ supply === null ? '…' : sealedLabel(supply) }}</strong>.
      </p>

      <NAlert v-if="error" type="error" :show-icon="false">
        <div>读取失败：{{ error }}</div>
        <JvActionButton :loading="loading" @click="load">重试</JvActionButton>
      </NAlert>

      <h2>{{ title }}</h2>
      <p v-if="focusJunkId !== null" class="focus">
        只看 <strong>#{{ focusJunkId }}</strong>
        <RouterLink :to="pagePath(pageForJunk ?? 0)">← 回到第 {{ (pageForJunk ?? 0) + 1 }} 页</RouterLink>
      </p>

      <p v-if="loading && items.length === 0" role="status" class="loading">
        loading junks... please be patient...
      </p>

      <!-- 铭文墙：64px 像素图 + 金/灰标 + 稀有度符号 -->
      <div v-if="items.length > 0" class="wall">
        <RouterLink
          v-for="item in items"
          :key="item.id"
          :to="junkPath(pageId, item.id)"
          class="cell"
          :class="item.meta === null ? 'cell--void' : ''"
          :title="item.meta?.name ?? `#${item.id} 不存在`"
        >
          <div
            class="frame"
            :style="{ backgroundColor: item.meta === null ? '#638596' : isGolden(item.id) ? '#638596' : '#95554f' }"
          >
            <span class="badge">{{ rarityEmoji(rarityOf(item.id)) }}</span>
            <img
              v-if="item.meta?.image"
              :src="item.meta.image"
              :alt="item.meta.name ?? `#${item.id}`"
              width="64"
              height="64"
            />
            <span v-else class="void">空</span>
          </div>
          <div class="label" :style="{ backgroundColor: item.meta === null ? 'transparent' : isGolden(item.id) ? '#ffd700' : '#cccccc' }">
            #{{ item.id }}
          </div>
        </RouterLink>
      </div>

      <!-- 翻页 -->
      <nav class="pager" aria-label="分页">
        <RouterLink
          v-for="p in nav"
          :key="p.pageId"
          :to="pagePath(p.pageId)"
          class="pager__item"
          :class="{ 'pager__item--active': p.pageId === pageId }"
          :aria-current="p.pageId === pageId ? 'page' : undefined"
        >{{ p.label }}</RouterLink>
      </nav>

      <!-- 标注说明 + 统计表 + 合约地址（v1 页面底部三块） -->
      <section class="notes">
        <h2>annotations 标注</h2>
        <p>
          <span class="chip chip--gold">金标</span> good/良品 ·
          <span class="chip chip--grey">灰标</span> broken/打坏 ·
          👑 legend/传奇 · 💎 rare/绝品 · 🌟 precious/珍品
        </p>

        <h2>statistics 统计</h2>
        <table class="stats">
          <thead>
            <tr><th></th><th>legend</th><th>rare</th><th>precious</th><th>normal</th><th>sum</th></tr>
          </thead>
          <tbody>
            <tr>
              <th>good</th>
              <td v-for="r in stats.rows" :key="r.rarity">{{ r.good }}</td>
              <td>{{ stats.goodTotal }}</td>
            </tr>
            <tr>
              <th>broken</th>
              <td v-for="r in stats.rows" :key="r.rarity">{{ r.broken || '' }}</td>
              <td>{{ stats.brokenTotal }}</td>
            </tr>
            <tr>
              <th>total</th>
              <td v-for="r in stats.rows" :key="r.rarity">{{ r.total }}</td>
              <td>{{ stats.total }}</td>
            </tr>
          </tbody>
        </table>

        <h2>contract address 合约地址</h2>
        <p><JvHashText :value="CRYPTOJUNKS_ADDRESS" type="address" :truncate="0" /></p>
      </section>
    </template>
  </main>
</template>

<style scoped>
.cryptojunks { max-width: 1100px; margin: 0 auto; padding: 1.5rem; }
.status { font-variant-numeric: tabular-nums; }
.wall { display: flex; flex-wrap: wrap; gap: 1px; }
.cell { text-decoration: none; color: inherit; display: block; }
.frame { position: relative; width: 68px; height: 68px; display: flex; align-items: center; justify-content: center; }
.frame img { image-rendering: pixelated; }
.badge { position: absolute; top: 0; right: 2px; font-size: 12px; line-height: 1; }
.void { font-size: 12px; }
.label { text-align: center; font-size: 12px; font-family: monospace; }
.pager { display: flex; flex-wrap: wrap; gap: 6px; margin: 1.5rem 0; }
.pager__item { font-variant-numeric: tabular-nums; text-decoration: none; padding: 1px 4px; }
.pager__item--active { font-weight: 700; font-size: 1.15em; }
.stats { border-collapse: collapse; font-variant-numeric: tabular-nums; }
.stats th, .stats td { border: 1px solid currentColor; padding: 2px 8px; text-align: right; }
.chip { padding: 0 4px; }
.chip--gold { background: #ffd700; color: #000; }
.chip--grey { background: #cccccc; color: #000; }
.notes { margin-top: 2rem; }
</style>
