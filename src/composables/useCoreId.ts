import { ref, unref } from 'vue'
import { isAddress } from 'viem'
import { publicClient } from '../config/client'
import { JVCORE_ADDRESS, jvcoreABI } from '../contracts/jvcore'
import { POPBADGE_ADDRESS, popbadgeABI } from '../contracts/popbadge'
import { parseTokenURI } from '../utils/nftMetadata'
import type { CoreIdInfo, PopHistoryEntry } from '../types/coreid'

// 超过此数量只显示最近的，按 tokenId 降序取高位 index（最新先入）
const MAX_POP_DISPLAY = 120

export function useCoreId(address: string) {
  const addr = unref(address)
  const coreIds = ref<CoreIdInfo[]>([])
  const popHistory = ref<PopHistoryEntry[]>([])
  const popHistoryTotal = ref(0)
  const popHistoryTruncated = ref(false)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // 我的Core ID：port自 v1 getAllJVCore（addressInfoController.js 第808-843行）
  const loadMyCoreIds = async () => {
    const balance = await publicClient.readContract({
      address: JVCORE_ADDRESS,
      abi: jvcoreABI,
      functionName: 'balanceOf',
      args: [addr as `0x${string}`],
    })

    const indices = Array.from({ length: Number(balance) }, (_, i) => BigInt(i))
    const tokenIds = (await Promise.all(
      indices.map(i =>
        publicClient.readContract({
          address: JVCORE_ADDRESS,
          abi: jvcoreABI,
          functionName: 'tokenOfOwnerByIndex',
          args: [addr as `0x${string}`, i],
        }).catch(() => null)
      )
    )).filter((id): id is bigint => id !== null)

    const tokenURIs = await Promise.all(
      tokenIds.map(tokenId =>
        publicClient.readContract({
          address: JVCORE_ADDRESS,
          abi: jvcoreABI,
          functionName: 'tokenURI',
          args: [tokenId],
        }).catch(() => null)
      )
    )

    coreIds.value = tokenIds.map((tokenId, i) => ({
      tokenId,
      metadata: tokenURIs[i] ? parseTokenURI(tokenURIs[i] as string) : null,
    }))
  }

  // 我的POP签到历史：port自 v1 getAllPOP（addressInfoController.js 第845-891行）
  const loadMyPopHistory = async () => {
    // 当前地址自己的Core ID，用于"代打卡"判断；地址本身没有Core ID则全部置灰
    const coreId = coreIds.value.length > 0 ? coreIds.value[0].tokenId : null

    const balance = await publicClient.readContract({
      address: POPBADGE_ADDRESS,
      abi: popbadgeABI,
      functionName: 'balanceOf',
      args: [addr as `0x${string}`],
    })

    const total = Number(balance)
    popHistoryTotal.value = total
    popHistoryTruncated.value = total > MAX_POP_DISPLAY
    // tokenOfOwnerByIndex 按持有顺序排列（index 0=最旧，index total-1=最新）
    // 超上限时从高位取最近 MAX_POP_DISPLAY 条
    const startIndex = popHistoryTruncated.value ? total - MAX_POP_DISPLAY : 0
    const indices = Array.from({ length: total - startIndex }, (_, i) => BigInt(startIndex + i))
    const tokenIds = (await Promise.all(
      indices.map(i =>
        publicClient.readContract({
          address: POPBADGE_ADDRESS,
          abi: popbadgeABI,
          functionName: 'tokenOfOwnerByIndex',
          args: [addr as `0x${string}`, i],
        }).catch(() => null)
      )
    )).filter((id): id is bigint => id !== null)

    const tokenURIs = await Promise.all(
      tokenIds.map(tokenId =>
        publicClient.readContract({
          address: POPBADGE_ADDRESS,
          abi: popbadgeABI,
          functionName: 'tokenURI',
          args: [tokenId],
        }).catch(() => null)
      )
    )

    const result: PopHistoryEntry[] = tokenIds.map((tokenId, i) => {
      const metadata = tokenURIs[i] ? parseTokenURI(tokenURIs[i] as string) : null
      // v1: var is_valid = tokenInfo.coreId == core_id (松类型比较)；这里桥接number/bigint
      const isValid = coreId !== null && metadata !== null && BigInt(metadata.coreId ?? -1) === coreId

      let monthLabel: string
      if (metadata === null) {
        monthLabel = '未知'
      } else {
        const ts = metadata.checkInTimestamp ?? 0
        if (ts === 0) {
          monthLabel = '未知'
        } else {
          const date = new Date(ts * 1000)
          const yy = date.getFullYear().toString().slice(-2)
          const mm = date.getMonth() + 1
          const dd = date.getDate()
          monthLabel = `${yy}.${mm}.${dd}`
        }
      }

      return { tokenId, metadata, monthLabel, isValid }
    })

    // 按tokenId降序排序（最新在前），方便用户查看近期签到
    result.sort((a, b) => (a.tokenId > b.tokenId ? -1 : a.tokenId < b.tokenId ? 1 : 0))
    popHistory.value = result
  }

  const load = async () => {
    if (!isAddress(addr)) {
      error.value = '地址格式无效'
      return
    }
    isLoading.value = true
    error.value = null
    try {
      await loadMyCoreIds()
      await loadMyPopHistory()
    } catch (err) {
      console.error('[useCoreId] 加载失败:', err)
      error.value = err instanceof Error ? err.message : String(err)
    } finally {
      isLoading.value = false
    }
  }

  return {
    coreIds,
    popHistory,
    popHistoryTotal,
    popHistoryTruncated,
    isLoading,
    error,
    load,
  }
}
