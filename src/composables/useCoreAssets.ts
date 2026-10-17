// 核心资产余额加载层（M1：一次 multicall 聚合所有 balanceOf）
// 依据 issue #21 铁律：余额类必须「收集 → 一次 multicall3」，严禁循环里逐个 await balanceOf
// 结果按「J → ERC20 余额降序 → NFT 数量降序」排序

import { ref, toValue, type MaybeRefOrGetter } from 'vue'
import { isAddress } from 'viem'
import { publicClient } from '../config/client'
import { CORE_ASSETS, KIND_ORDER, type CoreAsset, type AssetKind } from '../config/core-assets'

// 统一最小 balanceOf ABI：ERC20/ERC721 签名一致（balanceOf(address) → uint256）
const balanceOfABI = [
  {
    inputs: [{ internalType: 'address', name: 'owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

export interface AssetBalance {
  asset: CoreAsset
  /** 余额（wei/原始单位）；失败为 null */
  value: bigint | null
}

/** 排序：native → erc20（余额降序）→ erc721（数量降序）；同类型内保持配置数组顺序 */
function sortByRule(list: AssetBalance[]): AssetBalance[] {
  return [...list].sort((a, b) => {
    const ka = KIND_ORDER[a.asset.kind]
    const kb = KIND_ORDER[b.asset.kind]
    if (ka !== kb) return ka - kb
    // 同类型：余额/数量降序；失败(null)排最后；再按配置顺序稳定
    const va = a.value
    const vb = b.value
    if (va === null && vb === null) return 0
    if (va === null) return 1
    if (vb === null) return -1
    if (va > vb) return -1
    if (va < vb) return 1
    return 0
  })
}

export function useCoreAssets(address: MaybeRefOrGetter<string>) {
  const balances = ref<AssetBalance[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // 竞态保护：每次 load 自增，结果回填前校验是否仍是本次请求
  let requestId = 0

  const load = async () => {
    // 每次 load 都重新取当前地址（address 可能是 getter/ref/字符串），
    // 避免 setup 时 toValue 一次性求值冻结，导致地址切换后仍查旧地址
    const addr = toValue(address)
    if (!isAddress(addr)) {
      error.value = '地址格式无效'
      return
    }
    const myReq = ++requestId
    isLoading.value = true
    error.value = null

    try {
      const nativeAsset = CORE_ASSETS.find((a) => a.kind === 'native')
      const contractAssets = CORE_ASSETS.filter((a) => a.kind !== 'native' && a.address)

      // ── 余额类：一次 multicall 收集所有 balanceOf ──
      const mcResults = await publicClient.multicall({
        contracts: contractAssets.map((a) => ({
          address: a.address as `0x${string}`,
          abi: balanceOfABI,
          functionName: 'balanceOf' as const,
          args: [addr as `0x${string}`],
        })),
        allowFailure: true,
      })

      const byKey = new Map<string, bigint | null>()
      contractAssets.forEach((a, i) => {
        const r = mcResults[i]
        byKey.set(a.key, r.status === 'success' ? (r.result as bigint) : null)
      })

      // ── 原生 J：getBalance（multicall 无法覆盖，单独 1 次）──
      if (nativeAsset) {
        try {
          byKey.set(nativeAsset.key, await publicClient.getBalance({ address: addr as `0x${string}` }))
        } catch {
          byKey.set(nativeAsset.key, null)
        }
      }

      const list: AssetBalance[] = CORE_ASSETS.map((asset) => ({
        asset,
        value: byKey.get(asset.key) ?? null,
      }))

      if (myReq !== requestId) return // 过期结果丢弃
      balances.value = sortByRule(list)
    } catch (e) {
      if (myReq !== requestId) return
      console.error('[useCoreAssets] 加载失败:', e)
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      if (myReq === requestId) isLoading.value = false
    }
  }

  /** 某 key 的余额（供 NFT 枚举面板「共持有 N 个」使用） */
  const getBalance = (key: string): bigint | null => {
    const item = balances.value.find((b) => b.asset.key === key)
    return item?.value ?? null
  }

  return {
    balances,
    isLoading,
    error,
    load,
    getBalance,
  }
}

export { KIND_ORDER, type AssetKind, type CoreAsset }
