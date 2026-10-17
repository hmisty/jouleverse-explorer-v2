// 通用 ERC721Enumerable 枚举：tokenOfOwnerByIndex + tokenURI（二级懒加载）
// 供 POPBadge / JNSVote / JTI 三类徽章类 NFT 展开枚举复用。
// 数据源：持有数 count 已由 useCoreAssets 的 multicall 提供，本 composable 不再读 balanceOf。
// 竞态：请求序号守卫，切换地址/切换展开类时过期响应丢弃；onScopeDispose 卸载停止。
// 兜底：枚举失败显式标记（「读取失败」/「元数据读取失败」），绝不用 0/空列表掩盖失败。

import { ref, toValue, onScopeDispose, type MaybeRefOrGetter } from 'vue'
import { publicClient } from '../config/client'
import { safeErrorMessage } from '../utils/error'

export interface NftItem {
  tokenId: number
  name: string
  /** data:image/... 内联图；解析失败或外链 URI 为 null（UI 显示占位） */
  image: string | null
}

/** 每批枚举数量 */
const BATCH_SIZE = 10

// 通用 ERC721Enumerable + Metadata 最小 ABI（三类徽章 NFT 的 tokenOfOwnerByIndex/tokenURI 签名一致）
const enumerationABI = [
  {
    inputs: [
      { internalType: 'address', name: 'owner', type: 'address' },
      { internalType: 'uint256', name: 'index', type: 'uint256' },
    ],
    name: 'tokenOfOwnerByIndex',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    name: 'tokenURI',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

function decodeBase64(b64: string): string {
  try {
    const binary = atob(b64)
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch {
    return ''
  }
}

// 解析 data:application/json;base64 元数据，提取 name + image
function parseMetadata(tokenId: number, uri: string): NftItem {
  try {
    const jsonB64 = uri.replace(/^data:application\/json;base64,/, '')
    const meta = JSON.parse(decodeBase64(jsonB64))
    return {
      tokenId,
      name: typeof meta.name === 'string' && meta.name ? meta.name : `#${tokenId}`,
      // 纵深防御：仅放行 data:image/ 内联图，拦截 http(s):// 外链 URI（避免泄露访问者 IP）
      image: typeof meta.image === 'string' && meta.image.startsWith('data:image/') ? meta.image : null,
    }
  } catch {
    return { tokenId, name: `#${tokenId}`, image: null }
  }
}

export function useNftEnumeration(
  contractAddress: MaybeRefOrGetter<string>,
  owner: MaybeRefOrGetter<string>,
  total: () => number,
) {
  const items = ref<NftItem[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const loaded = ref(0)

  let seq = 0
  let disposed = false
  onScopeDispose(() => { disposed = true })

  async function loadMore() {
    if (loading.value || disposed) return
    const totalN = total()
    if (loaded.value >= totalN) return
    const mySeq = ++seq
    loading.value = true
    error.value = null
    try {
      const contract = toValue(contractAddress) as `0x${string}`
      const addr = toValue(owner) as `0x${string}`
      const start = loaded.value
      const count = Math.min(BATCH_SIZE, totalN - start)

      // 步骤 1：tokenOfOwnerByIndex 批量读 tokenId
      const idxCalls = Array.from({ length: count }, (_, i) => ({
        address: contract,
        abi: enumerationABI,
        functionName: 'tokenOfOwnerByIndex' as const,
        args: [addr, BigInt(start + i)] as const,
      }))
      const idxRes = await publicClient.multicall({ contracts: idxCalls, allowFailure: true })
      if (mySeq !== seq || disposed) return

      const tokenIds = idxRes.map((r) => (r.status === 'success' ? Number(r.result as bigint) : -1))
      const validEntries = tokenIds.map((tid, i) => ({ tid, i })).filter((e) => e.tid >= 0)

      // 步骤 2：tokenURI 批量读元数据
      const uriCalls = validEntries.map((e) => ({
        address: contract,
        abi: enumerationABI,
        functionName: 'tokenURI' as const,
        args: [BigInt(e.tid)] as const,
      }))
      const uriRes = await publicClient.multicall({ contracts: uriCalls, allowFailure: true })
      if (mySeq !== seq || disposed) return

      const uriByIndex = new Map<number, string>()
      validEntries.forEach((e, j) => {
        uriByIndex.set(e.i, uriRes[j]?.status === 'success' ? String(uriRes[j].result) : '')
      })

      // 失败显式区分：tokenId 读失败 vs 元数据读失败，绝不用 0/空名掩盖
      const newItems: NftItem[] = tokenIds.map((tid, i) => {
        if (tid < 0) return { tokenId: -1, name: '(读取失败)', image: null }
        const uri = uriByIndex.get(i)
        if (uri === undefined || uri === '') return { tokenId: tid, name: `#${tid}（元数据读取失败）`, image: null }
        return parseMetadata(tid, uri)
      })
      items.value = [...items.value, ...newItems]
      loaded.value += count
    } catch (e) {
      if (mySeq !== seq || disposed) return
      error.value = safeErrorMessage(e)
    } finally {
      if (mySeq === seq && !disposed) loading.value = false
    }
  }

  function reset() {
    seq++
    items.value = []
    loaded.value = 0
    loading.value = false
    error.value = null
  }

  return { items, loading, error, loaded, loadMore, reset }
}
