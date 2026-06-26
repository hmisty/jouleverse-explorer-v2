import { ref } from 'vue'
import { publicClient } from '../config/client'
import { POPBADGE_ADDRESS, popbadgeABI } from '../contracts/popbadge'

const BATCH_SIZE = 20
const UTC8_OFFSET = 8 * 60 * 60

export interface TokenData {
  tokenId: number
  coreId: number
  blockNumber: number
  timestamp: number
  utc8Timestamp: number
  monthKey: string   // 'YYYY-MM'
  monthYear: string  // 'YYYY年M月'
}

export interface CoreStat {
  coreId: string
  count: number
  firstCheckInTime: string
  firstBlockNumber: number | string
  lastCheckInTime: string
  lastBlockNumber: number | string
}

export interface MonthStats {
  monthYear: string
  totalCheckIns: number
  uniqueCores: number
  coreStats: CoreStat[]
}

export interface IntegrityState {
  status: 'valid' | 'loading' | 'warning' | 'error'
  message: string
  isComplete: boolean
}

interface MonthData {
  monthKey: string
  monthYear: string
  tokenIds: number[]
  minId: number
  maxId: number
  count: number
  isComplete: boolean
}

export function useCheckinStats() {
  // 内部状态（非响应式）
  const cache: (TokenData | null)[] = []
  const monthsMap: Record<string, MonthData> = {}
  const monthKeysArr: string[] = []
  const failedTokenIds = new Set<bigint>()
  let totalSupplyVal = 0
  let nextLoadStartId = -1
  let isAutoLoadingForCurrent = false
  let loadingGeneration = 0  // 用于取消过期的异步回调

  // 响应式状态
  const totalSupply = ref(0)
  const loadedCount = ref(0)
  const hasMoreData = ref(true)
  const isLoading = ref(false)
  const monthKeys = ref<string[]>([])
  const currentMonthKey = ref<string | null>(null)
  const currentMonthStats = ref<MonthStats | null>(null)
  const currentMonthIntegrity = ref<IntegrityState | null>(null)
  const canGoPrevMonth = ref(false)
  const canGoNextMonth = ref(false)
  const error = ref<string | null>(null)

  function resetState() {
    for (const k of Object.keys(monthsMap)) delete monthsMap[k]
    monthKeysArr.length = 0
    cache.length = 0
    failedTokenIds.clear()
    nextLoadStartId = -1
    isAutoLoadingForCurrent = false
    loadingGeneration++  // 使所有进行中的异步回调失效

    totalSupply.value = 0
    loadedCount.value = 0
    hasMoreData.value = true
    isLoading.value = false
    monthKeys.value = []
    currentMonthKey.value = null
    currentMonthStats.value = null
    currentMonthIntegrity.value = null
    canGoPrevMonth.value = false
    canGoNextMonth.value = false
    error.value = null
  }

  async function fetchTotalSupply() {
    const supply = await publicClient.readContract({
      address: POPBADGE_ADDRESS,
      abi: popbadgeABI,
      functionName: 'totalSupply',
    })
    totalSupplyVal = Number(supply)
    totalSupply.value = totalSupplyVal
    cache.length = totalSupplyVal
    cache.fill(null)
    nextLoadStartId = totalSupplyVal - 1
  }

  // endId：本批次最高 index（从高到低遍历，endId 即起始点）
  async function loadBatch(endId: number, count: number): Promise<TokenData[]> {
    const actualStart = Math.max(0, endId - count + 1)
    const actualEnd = endId
    const size = actualEnd - actualStart + 1
    const indices = Array.from({ length: size }, (_, i) => actualStart + i)

    // 第一步：并行取 tokenId
    const tokenIds = await Promise.all(
      indices.map(i =>
        publicClient.readContract({
          address: POPBADGE_ADDRESS,
          abi: popbadgeABI,
          functionName: 'tokenByIndex',
          args: [BigInt(i)],
        })
      )
    )

    // 第二步：并行取 POPInfo，单个失败记录到 failedTokenIds 不影响整批
    const popInfos = await Promise.all(
      tokenIds.map(tokenId =>
        publicClient.readContract({
          address: POPBADGE_ADDRESS,
          abi: popbadgeABI,
          functionName: 'getPOPInfo',
          args: [tokenId],
        }).catch(() => { failedTokenIds.add(tokenId); return null })
      )
    )

    const results: TokenData[] = []
    for (let i = 0; i < tokenIds.length; i++) {
      const popInfo = popInfos[i]
      if (!popInfo) continue

      const tokenId = Number(tokenIds[i])
      // viem 多输出返回 readonly tuple，用索引访问
      const coreId = Number(popInfo[0])
      const blockNumber = Number(popInfo[1])
      const timestamp = Number(popInfo[2])

      const utc8Timestamp = timestamp + UTC8_OFFSET
      const date = new Date(utc8Timestamp * 1000)
      const year = date.getUTCFullYear()
      const month = date.getUTCMonth() + 1
      const monthKey = `${year}-${String(month).padStart(2, '0')}`
      const monthYear = `${year}年${month}月`

      const data: TokenData = { tokenId, coreId, blockNumber, timestamp, utc8Timestamp, monthKey, monthYear }
      cache[tokenId] = data
      results.push(data)
    }

    loadedCount.value = cache.filter(t => t !== null).length
    return results
  }

  // 重试所有失败的 tokenId（getPOPInfo 之前曾报错的）
  async function retryFailed() {
    if (failedTokenIds.size === 0 || isLoading.value) return
    isLoading.value = true
    const gen = loadingGeneration

    try {
      const toRetry = [...failedTokenIds]
      failedTokenIds.clear()

      const popInfos = await Promise.all(
        toRetry.map(tokenId =>
          publicClient.readContract({
            address: POPBADGE_ADDRESS,
            abi: popbadgeABI,
            functionName: 'getPOPInfo',
            args: [tokenId],
          }).catch(() => { failedTokenIds.add(tokenId); return null })
        )
      )

      if (gen !== loadingGeneration) return

      const tokens: TokenData[] = []
      for (let i = 0; i < toRetry.length; i++) {
        const popInfo = popInfos[i]
        if (!popInfo) continue

        const tokenId = Number(toRetry[i])
        const coreId = Number(popInfo[0])
        const blockNumber = Number(popInfo[1])
        const timestamp = Number(popInfo[2])

        const utc8Timestamp = timestamp + UTC8_OFFSET
        const date = new Date(utc8Timestamp * 1000)
        const year = date.getUTCFullYear()
        const month = date.getUTCMonth() + 1
        const monthKey = `${year}-${String(month).padStart(2, '0')}`
        const monthYear = `${year}年${month}月`

        const data: TokenData = { tokenId, coreId, blockNumber, timestamp, utc8Timestamp, monthKey, monthYear }
        cache[tokenId] = data
        tokens.push(data)
      }

      loadedCount.value = cache.filter(t => t !== null).length

      if (tokens.length > 0) processNewTokens(tokens)

      if (currentMonthKey.value) {
        currentMonthIntegrity.value = checkIntegrity(currentMonthKey.value)
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
    } finally {
      isLoading.value = false
    }
  }

  function insertMonthKey(mk: string) {
    const [y, m] = mk.split('-').map(Number)
    const idx = monthKeysArr.findIndex(k => {
      const [ky, km] = k.split('-').map(Number)
      return y > ky || (y === ky && m > km)
    })
    if (idx === -1) monthKeysArr.push(mk)
    else monthKeysArr.splice(idx, 0, mk)
  }

  function processNewTokens(tokens: TokenData[]) {
    if (tokens.length === 0) return

    const groups: Record<string, { tokens: TokenData[]; minId: number; maxId: number; monthYear: string }> = {}
    for (const t of tokens) {
      if (!groups[t.monthKey]) {
        groups[t.monthKey] = { tokens: [], minId: t.tokenId, maxId: t.tokenId, monthYear: t.monthYear }
      }
      groups[t.monthKey].tokens.push(t)
      groups[t.monthKey].minId = Math.min(groups[t.monthKey].minId, t.tokenId)
      groups[t.monthKey].maxId = Math.max(groups[t.monthKey].maxId, t.tokenId)
    }

    for (const [mk, g] of Object.entries(groups)) {
      if (!monthsMap[mk]) {
        monthsMap[mk] = {
          monthKey: mk,
          monthYear: g.monthYear,
          tokenIds: g.tokens.map(t => t.tokenId).sort((a, b) => b - a),
          minId: g.minId,
          maxId: g.maxId,
          count: g.tokens.length,
          isComplete: false,
        }
        insertMonthKey(mk)
      } else {
        const md = monthsMap[mk]
        for (const t of g.tokens) {
          if (!md.tokenIds.includes(t.tokenId)) md.tokenIds.push(t.tokenId)
        }
        md.tokenIds.sort((a, b) => b - a)
        md.minId = Math.min(md.minId, g.minId)
        md.maxId = Math.max(md.maxId, g.maxId)
        md.count = md.tokenIds.length
      }
    }

    monthKeys.value = [...monthKeysArr]

    if (currentMonthKey.value) {
      const hasNew = tokens.some(t => t.monthKey === currentMonthKey.value)
      if (hasNew) displayMonth(currentMonthKey.value)
    }
  }

  function checkIntegrity(mk: string): IntegrityState {
    const md = monthsMap[mk]
    if (!md) return { status: 'error', message: '月份不存在', isComplete: false }

    const expectedCount = md.maxId - md.minId + 1
    const actualCount = md.count

    let hasLeft = true
    let hasRight = true

    if (md.minId > 0) {
      const left = cache[md.minId - 1]
      hasLeft = left !== null && left !== undefined && left.monthKey !== mk
    }
    if (md.maxId < totalSupplyVal - 1) {
      const right = cache[md.maxId + 1]
      hasRight = right !== null && right !== undefined && right.monthKey !== mk
    }

    if (actualCount === expectedCount && hasLeft && hasRight) {
      md.isComplete = true
      return { status: 'valid', message: `数据完整（${actualCount} 条记录）`, isComplete: true }
    }

    if (actualCount !== expectedCount) {
      // 所有数据已加载完毕但数量仍不足 → 部分 RPC 失败，可重试
      if (nextLoadStartId < 0 && failedTokenIds.size > 0) {
        return { status: 'warning', message: `${actualCount}/${expectedCount} 条，部分数据加载失败（可重试）`, isComplete: false }
      }
      return { status: 'loading', message: `加载中 ${actualCount}/${expectedCount}`, isComplete: false }
    }
    return { status: 'loading', message: '验证边界中...', isComplete: false }
  }

  function updateNavButtons() {
    const idx = currentMonthKey.value ? monthKeysArr.indexOf(currentMonthKey.value) : -1
    canGoPrevMonth.value = idx < monthKeysArr.length - 1
    canGoNextMonth.value = idx > 0
  }

  function displayMonth(mk: string) {
    const md = monthsMap[mk]
    if (!md) return

    currentMonthKey.value = mk
    updateNavButtons()

    const coreMap: Record<string, { coreId: string; count: number; tokens: TokenData[] }> = {}
    for (const tokenId of md.tokenIds) {
      const t = cache[tokenId]
      if (!t) continue
      const cid = String(t.coreId)
      if (!coreMap[cid]) coreMap[cid] = { coreId: cid, count: 0, tokens: [] }
      coreMap[cid].count++
      coreMap[cid].tokens.push(t)
    }

    const coreStats: CoreStat[] = Object.values(coreMap)
      .sort((a, b) => Number(a.coreId) - Number(b.coreId))
      .map(stat => {
        const sorted = [...stat.tokens].sort((a, b) => a.tokenId - b.tokenId)
        const first = sorted[0]
        const last = sorted[sorted.length - 1]
        return {
          coreId: stat.coreId,
          count: stat.count,
          firstCheckInTime: first
            ? new Date(first.utc8Timestamp * 1000).toLocaleString('zh-CN', { timeZone: 'UTC' })
            : '-',
          firstBlockNumber: first ? first.blockNumber : '-',
          lastCheckInTime: last
            ? new Date(last.utc8Timestamp * 1000).toLocaleString('zh-CN', { timeZone: 'UTC' })
            : '-',
          lastBlockNumber: last ? last.blockNumber : '-',
        }
      })

    currentMonthStats.value = {
      monthYear: md.monthYear,
      totalCheckIns: md.count,
      uniqueCores: coreStats.length,
      coreStats,
    }

    currentMonthIntegrity.value = checkIntegrity(mk)
  }

  function shouldContinue(): boolean {
    if (monthKeysArr.length === 0) return true

    if (isAutoLoadingForCurrent && currentMonthKey.value) {
      const ok = checkIntegrity(currentMonthKey.value)
      if (ok.isComplete) { isAutoLoadingForCurrent = false; return false }
      return true
    }

    return false
  }

  async function loadMore() {
    if (isLoading.value || !hasMoreData.value) return
    const gen = loadingGeneration  // 捕获当前代，用于检测过期结果

    isLoading.value = true
    const batchSize = Math.min(BATCH_SIZE, nextLoadStartId + 1)

    if (batchSize <= 0) {
      hasMoreData.value = false
      isLoading.value = false
      isAutoLoadingForCurrent = false
      return
    }

    try {
      const tokens = await loadBatch(nextLoadStartId, batchSize)
      nextLoadStartId -= batchSize

      if (gen !== loadingGeneration) return  // 月份已切换，丢弃本批结果

      processNewTokens(tokens)

      if (currentMonthKey.value) {
        currentMonthIntegrity.value = checkIntegrity(currentMonthKey.value)
      }

      // 默认展示最新月份（monthKeysArr 升序，最后一项最新）
      if (!currentMonthKey.value && monthKeysArr.length > 0) {
        displayMonth(monthKeysArr[monthKeysArr.length - 1])
      }

      hasMoreData.value = nextLoadStartId >= 0

      if (shouldContinue() && hasMoreData.value) {
        setTimeout(() => loadMore(), 200)
      } else {
        updateNavButtons()
        isAutoLoadingForCurrent = false
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
    } finally {
      isLoading.value = false
    }
  }

  function goPrevMonth() {
    if (!currentMonthKey.value) return
    const idx = monthKeysArr.indexOf(currentMonthKey.value)
    if (idx < monthKeysArr.length - 1) {
      loadingGeneration++  // 使当前进行中的自动加载失效
      const target = monthKeysArr[idx + 1]
      displayMonth(target)
      if (hasMoreData.value && !monthsMap[target]?.isComplete) {
        isAutoLoadingForCurrent = true
        setTimeout(() => loadMore(), 300)
      }
    }
  }

  function goNextMonth() {
    if (!currentMonthKey.value) return
    loadingGeneration++  // 使当前进行中的自动加载失效
    const idx = monthKeysArr.indexOf(currentMonthKey.value)
    if (idx > 0) displayMonth(monthKeysArr[idx - 1])
  }

  async function init() {
    resetState()
    try {
      await fetchTotalSupply()
      if (totalSupplyVal === 0) {
        hasMoreData.value = false
        return
      }
      isAutoLoadingForCurrent = true
      await loadMore()
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
    }
  }

  return {
    totalSupply,
    loadedCount,
    hasMoreData,
    isLoading,
    monthKeys,
    currentMonthKey,
    currentMonthStats,
    currentMonthIntegrity,
    canGoPrevMonth,
    canGoNextMonth,
    error,
    loadMore,
    retryFailed,
    goPrevMonth,
    goNextMonth,
    init,
  }
}
