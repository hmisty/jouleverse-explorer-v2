/**
 * CryptoJunks 链上读取层（P5-4）。
 *
 * 与 `utils/clique-signers.ts` 同一套路：客户端注入，便于离线测；
 * 真实页面传 `publicClient`。
 *
 * RPC 预算（这是本页唯一的链上开销，验收要点是「不额外压 RPC」）：
 *   - totalSupply：1 次
 *   - 每页 tokenURI：100 次，用 multicall3 合并成 1 个请求（每批 100）
 *   → 打开任一页 ≈ 2 个 RPC 请求。10000 枚全量浏览才需要 100 批。
 *
 * 不用 v1 那条「逐枚 tokenURI 单独 call」的写法：v1 一页 100 枚就是 100 个
 * 独立 HTTP 请求，实测对 rpc.jnsdao.com 这种小型公共节点很不友好。
 */
import { CRYPTOJUNKS_ADDRESS, cryptojunksABI } from '../contracts/cryptojunks'
import { parseJunkMetadata, type JunkMetadata } from './cryptojunks'

/** multicall3 单批合约数上限（与仓库内其他批量读取一致） */
export const MULTICALL_BATCH = 100

export interface JunkReaderClient {
  readContract: (args: {
    address: `0x${string}`
    abi: typeof cryptojunksABI
    functionName: 'totalSupply'
  }) => Promise<bigint>
  multicall: (args: {
    contracts: readonly {
      address: `0x${string}`
      abi: typeof cryptojunksABI
      functionName: 'tokenURI'
      args: readonly [bigint]
    }[]
    allowFailure: true
  }) => Promise<{ status: 'success' | 'failure'; result?: unknown }[]>
}

/** 读 supply。失败时抛出，由视图转成错误态（不静默当 0，0 会被误读成「还没开始铭刻」） */
export async function fetchSupply(client: JunkReaderClient): Promise<number> {
  const supply = await client.readContract({
    address: CRYPTOJUNKS_ADDRESS,
    abi: cryptojunksABI,
    functionName: 'totalSupply',
  })
  return Number(supply)
}

export interface JunkItem {
  id: number
  /** null = 该枚不存在 / 元数据读不出 */
  meta: JunkMetadata | null
}

function toBigInt(id: number): bigint {
  return BigInt(id)
}

/**
 * 分批读一页的 tokenURI 并解析。
 *
 * `allowFailure: true` + 逐项给 null，是对的行为：10000 枚里理论上都可能有人 burn，
 * 单枚失败不该让整页空白。v1 也是逐枚 catch 后塞 `tokenInfo: undefined`。
 */
export async function loadJunkPage(
  client: JunkReaderClient,
  ids: readonly number[],
): Promise<JunkItem[]> {
  if (ids.length === 0) return []
  const out: JunkItem[] = []
  for (let i = 0; i < ids.length; i += MULTICALL_BATCH) {
    const batch = ids.slice(i, i + MULTICALL_BATCH)
    const results = await client.multicall({
      contracts: batch.map((id) => ({
        address: CRYPTOJUNKS_ADDRESS,
        abi: cryptojunksABI,
        functionName: 'tokenURI' as const,
        args: [toBigInt(id)] as const,
      })),
      allowFailure: true,
    })
    // 结果顺序必须与入参一致；长度不符说明客户端行为异常，宁可报错也不静默错位，
    // 错位会让「#123 显示的是别人的图」这种事发生。
    if (results.length !== batch.length) {
      throw new Error(`multicall 返回 ${results.length} 项，预期 ${batch.length} 项`)
    }
    for (let j = 0; j < batch.length; j++) {
      const r = results[j]
      out.push({
        id: batch[j],
        meta: r.status === 'success' ? parseJunkMetadata(r.result) : null,
      })
    }
  }
  return out
}
