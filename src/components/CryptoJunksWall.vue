<!--
  CryptoJunks 墙（P5-2 · 地址页对等）
  依据 v1 `addressInfo.html:154-176`：64px 像素图 + 金标色底 + 稀有度 👑💎🌟 + 跳详情。

  ⚠️ 三处刻意与 v1 不同，都不是风格问题：

  1. **详情链接按路由是否存在决定**。v1 链到 `/#/cryptojunks/page/{p}/id/{id}`，
     但 v2 的全量浏览页属于 P5-4，**尚未实现**。照抄 v1 就是造一条死链
     （2026-11-21 的教训：/block/<哈希> 在加链接之前没人点得到，加了才暴露是坏的）。
     这里用 `router.hasRoute('cryptojunks')` 判定：P5-4 把路由注册上，链接自动生效，无需改本组件。

  2. **参照表加载失败要明说**。v1 拉 `golden_idx.json` 失败时静默降级成「全部灰标普通」，
     用户无法区分「这枚确实不是金标」和「表没加载」。这里显式提示。

  3. **空图不占位成色块**。v1 在 tokenInfo==undefined 时渲染一个写着「空」的方块；
     那是在掩盖读取失败。这里读取失败就写明「读取失败」，不给假像素图。
-->
<template>
  <div class="junk-wall">
    <div class="junk-wall-head">
      <span class="muted">{{ t('junkWallTitle') }}</span>
      <span v-if="!referenceLoaded" class="junk-ref-warn">{{ t('junkRefMissing') }}</span>
    </div>

    <JvLoading v-if="loading && items.length === 0" :label="t('loadingText')" />
    <div v-else-if="error" class="junk-wall-error muted">
      {{ t('enumError', { err: error }) }}
      <button class="btn-load-more" @click="loadMore">{{ t('retry') }}</button>
    </div>
    <div v-else class="junk-grid">
      <component
        :is="isLinkable ? 'router-link' : 'div'"
        v-for="(it, index) in items"
        :key="`${it.tokenId}-${index}`"
        v-bind="isLinkable && it.tokenId >= 0 ? { to: junkPath(it.tokenId) } : {}"
        class="junk-cell"
        :title="cellTitle(it.tokenId)"
      >
        <span class="junk-frame" :class="{ 'is-gold': decoration(it.tokenId).golden }">
          <span v-if="decoration(it.tokenId).rarity !== 'normal'" class="junk-rarity">
            {{ RARITY_EMOJI[decoration(it.tokenId).rarity] }}
          </span>
          <img
            v-if="it.image"
            :src="it.image"
            :alt="it.name"
            class="junk-img"
            loading="lazy"
          />
          <span v-else class="junk-img junk-img-empty">{{ t('junkImageFailed') }}</span>
        </span>
        <span class="junk-id" :class="{ 'is-gold-id': decoration(it.tokenId).golden }">
          #{{ it.tokenId >= 0 ? it.tokenId : '?' }}
        </span>
      </component>
    </div>

    <div v-if="loaded < total" class="junk-wall-more">
      <button class="btn-load-more" :disabled="loading" @click="loadMore">
        {{ loading ? t('loadingText') : t('loadMoreProgress', { loaded, total }) }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useNftEnumeration } from '../composables/useNftEnumeration'
import { JvLoading } from '../design-system'
import { t } from '../i18n'
import { CORE_ASSETS } from '../config/core-assets'
import {
  decorateJunk,
  junkPageId,
  RARITY_EMOJI,
  RARITY_LABEL,
  type JunkDecoration,
  type JunkReference,
} from '../utils/cryptojunks'
import { loadJunkReference } from '../utils/junk-reference'

const props = defineProps<{
  address: string
  /** 持有的 CryptoJunks 数量（由父级一次 multicall 得出，本组件不重复读 balanceOf） */
  total: number
}>()

const router = useRouter()

const junkAddress = CORE_ASSETS.find((a) => a.key === 'cryptojunks')?.address as `0x${string}` | undefined

const {
  items,
  loading,
  error,
  loaded,
  loadMore,
  reset,
} = useNftEnumeration(
  () => junkAddress ?? '0x0000000000000000000000000000000000000000',
  () => props.address,
  () => props.total,
)

// 参照表：只加载一次（模块级缓存），失败为 null
const junkRef = ref<JunkReference | null>(null)
const referenceLoaded = ref(false)

async function ensureReference() {
  const r = await loadJunkReference()
  junkRef.value = r
  referenceLoaded.value = r !== null
}

/** 单枚装饰（含 null 参照表 → 全 false/normal 的降级） */
function decoration(tokenId: number): JunkDecoration {
  return decorateJunk(junkRef.value, tokenId)
}

function cellTitle(tokenId: number): string {
  if (tokenId < 0) return t('junkImageFailed')
  const d = decoration(tokenId)
  const parts = [t('junkGoldenLabel', { mark: d.golden ? '✓' : '✗' })]
  if (d.rarity !== 'normal') parts.push(RARITY_LABEL[d.rarity])
  return [`CryptoJunks #${tokenId}`, ...parts].join(' · ')
}

/** 详情页路由是否已注册（P5-4 之前不应生成链接） */
const isLinkable = computed(() => router.hasRoute('cryptojunks'))

function junkPath(tokenId: number): string {
  return `/cryptojunks/page/${junkPageId(tokenId)}/id/${tokenId}`
}

onMounted(async () => {
  await ensureReference()
})

watch(() => props.address, async () => {
  reset()
  await ensureReference()
})
</script>

<style scoped>
.junk-wall { border-top: 1px dashed var(--jv-border); padding-top: 14px; }

.junk-wall-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 10px; }

.junk-ref-warn { font-size: 0.72rem; color: var(--jv-warning, #b8860b); }

.junk-grid { display: flex; flex-wrap: wrap; gap: 6px; }

.junk-cell { display: flex; flex-direction: column; align-items: center; gap: 2px; }

.junk-frame {
  position: relative;
  display: inline-flex;
  width: 64px;
  height: 64px;
  border-radius: var(--jv-radius-sm);
  /* 非金标底色（v1 #95554f）；金标见 .is-gold */
  background: #95554f;
  overflow: hidden;
}

.junk-frame.is-gold { background: #638596; }

.junk-rarity {
  position: absolute;
  top: 0;
  right: 2px;
  font-size: 0.7rem;
  line-height: 1;
  z-index: 1;
}

.junk-img {
  width: 64px;
  height: 64px;
  /* v1: image-rendering: pixelated —— 像素图放大不能抗锯齿 */
  image-rendering: pixelated;
  display: block;
}

.junk-img-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.6rem;
  color: #e8e8e8;
  text-align: center;
  padding: 4px;
}

.junk-id { font-size: 0.68rem; color: var(--jv-text-secondary); }

.junk-id.is-gold-id {
  background: #ffd700;
  color: #333;
  padding: 0 3px;
  border-radius: 2px;
}

.junk-wall-more { margin-top: 10px; }

.junk-wall-error { display: flex; align-items: center; gap: 8px; font-size: 0.82rem; }
</style>
