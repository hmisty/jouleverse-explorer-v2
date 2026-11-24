<template>
  <div class="did-profile">
    <div class="page-header">
      <button @click="$router.push('/')" class="back-btn">← 返回首页</button>
      <h1>数字身份 DID</h1>
    </div>

    <JvLoading v-if="loading" text="正在解析域名…" />

    <!-- 域名格式非法 -->
    <JvPageState
      v-else-if="result?.kind === 'invalid'"
      type="search-empty"
      title="域名格式无效"
      :description="result.reason"
      action="去 JNS 查询页"
      @action="$router.push('/jns')"
    />

    <!-- 域名不存在 -->
    <JvPageState
      v-else-if="result?.kind === 'notfound'"
      type="search-empty"
      title="域名不存在"
      :description="`链上没有找到 ${result.jnsId} 这个域名`"
      action="去 JNS 查询页"
      @action="$router.push('/jns')"
    />

    <!-- 域名存在但未绑定地址 -->
    <div v-else-if="result?.kind === 'unbound'" class="did-unbound">
      <div class="did-banner">
        <span class="did-badge">DID</span>
        <span class="did-name">{{ result.jnsId }}</span>
        <span class="did-token">#{{ result.tokenId.toString() }}</span>
      </div>
      <JvPageState
        type="empty"
        title="该域名未绑定地址"
        description="DID 资料页需要域名先绑定到一个钱包地址。请域名所有者在此域名详情页完成绑定后重试。"
        action="打开域名详情"
        @action="$router.push(`/jns/${result.jnsId}`)"
      />
      <div class="owner-row">
        <span class="owner-label">域名所有者</span>
        <JvHashText :value="result.owner" type="address" :truncate="8" />
      </div>
    </div>

    <!-- 解析成功：渲染地址视图 + DID 横幅 -->
    <template v-else-if="result?.kind === 'ok'">
      <div class="did-banner">
        <span class="did-badge">DID</span>
        <span class="did-name">{{ result.jnsId }}</span>
        <button class="did-link" @click="$router.push(`/jns/${result.jnsId}`)">域名详情 ↗</button>
      </div>
      <p v-if="caseTwinHint" class="did-case-hint">
        ⚠️ 该域名含大写字母，与 <span class="mono">{{ result.jnsId.toLowerCase() }}</span> 是<strong>两个不同</strong>的域名（不同 tokenId / 不同持有者）。当前显示的是大写这一个。
      </p>
      <!-- 地址视图按绑定地址渲染；:key 保证换域名时彻底重建，不残留上一份状态 -->
      <AddressDetail :key="result.boundAddress" :address="result.boundAddress" />
    </template>

    <JvPageState
      v-else-if="error"
      type="network-error"
      :description="error"
      action="重试"
      @action="load"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { JvLoading, JvPageState, JvHashText } from '../design-system'
import AddressDetail from './AddressDetail.vue'
import { resolveDid, type DidResolveResult } from '../utils/did-resolve'
import { isCaseSensitiveName } from '../utils/jns-endorse'

interface Props { jnsId: string }
const props = defineProps<Props>()

const loading = ref(false)

/**
 * 只在「该域名是小写版也存在的那几个大小写敏感名」时提示。
 * GM / Nana 不需要提示（链上没有 gm / nana，不存在混淆）。
 */
const caseTwinHint = computed(() => {
  const r = result.value
  if (!r || (r.kind !== 'ok' && r.kind !== 'unbound')) return false
  const bare = r.jnsId.slice(0, -2)
  if (!isCaseSensitiveName(bare)) return false
  // 有孪生的才提示；GM/Nana 这类没有小写版本的不提示
  return bare !== bare.toLowerCase()
})
const error = ref('')
const result = ref<DidResolveResult | null>(null)

// 世代号：同一页面内切换域名时作废在途请求，避免「B 的域名 + A 的地址」这种过期响应回写。
let seq = 0

const load = async () => {
  const my = ++seq
  loading.value = true
  error.value = ''
  result.value = null
  try {
    const r = await resolveDid(props.jnsId)
    if (my !== seq) return
    result.value = r
  } catch (e: any) {
    if (my !== seq) return
    error.value = '读取链上数据失败：' + (e?.shortMessage || e?.message || '未知错误')
  } finally {
    if (my === seq) loading.value = false
  }
}

onMounted(load)
// 同一个组件实例复用于 /did/a.j → /did/b.j 时（路由参数变化），必须重新解析
watch(() => props.jnsId, load)
</script>

<style scoped>
.did-profile { max-width: 1100px; margin: 0 auto; padding: 24px 16px 64px; }

.did-banner {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 16px; margin-bottom: 16px;
  border: 1px solid var(--jv-border); border-radius: 10px;
  background: var(--jv-bg-secondary);
}
.did-badge {
  font-size: 11px; font-weight: 700; letter-spacing: .5px;
  padding: 2px 7px; border-radius: 5px;
  background: var(--jv-primary); color: #fff;
}
.did-name { font-family: var(--jv-font-mono); font-weight: 600; font-size: 15px; }
.did-token { font-family: var(--jv-font-mono); font-size: 12px; color: var(--jv-text-secondary); }
.did-link {
  margin-left: auto; background: none; border: none; cursor: pointer;
  color: var(--jv-primary); font-size: 13px;
}
.did-link:hover { text-decoration: underline; }

.did-case-hint {
  font-size: 12px; line-height: 1.6; color: var(--jv-warning, #f5a524);
  margin: 0 0 16px; padding: 0 2px;
}
.mono { font-family: var(--jv-font-mono); }
.owner-row {
  display: flex; align-items: center; gap: 10px;
  margin-top: 12px; font-size: 13px;
}
.owner-label { color: var(--jv-text-secondary); }
</style>
