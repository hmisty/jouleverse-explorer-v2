import { describe, it, expect } from 'vitest'
import { fetchSupply, loadJunkPage, MULTICALL_BATCH, type JunkReaderClient } from '../src/utils/cryptojunks-chain'
import { CRYPTOJUNKS_ADDRESS } from '../src/contracts/cryptojunks'

/** 造一个 tokenURI 字符串（与真实链上格式一致） */
function uriFor(obj: Record<string, unknown>): string {
  return `data:application/json;base64,${Buffer.from(JSON.stringify(obj)).toString('base64')}`
}

function goodUri(id: number) {
  return uriFor({ name: `CryptoJunks #${id}`, id, description: 'd', image: `data:image/png;base64,IMG${id}` })
}

/**
 * 假客户端。刻意记录调用次数/批大小，因为本模块的验收要点是
 * 「不额外压 RPC」——每页只能打 1 个 multicall 请求。
 */
function makeClient(opts: {
  supply?: bigint
  /** 返回 undefined 表示该项 failure */
  uri?: (id: number) => string | undefined
  /** 故意让 multicall 返回错长度，用于测健壮性 */
  truncateResults?: boolean
} = {}) {
  const stats = { readContractCalls: 0, multicallCalls: 0, batchSizes: [] as number[] }
  const client: JunkReaderClient = {
    async readContract() {
      stats.readContractCalls++
      return opts.supply ?? 10000n
    },
    async multicall({ contracts }) {
      stats.multicallCalls++
      stats.batchSizes.push(contracts.length)
      const results = contracts.map((c) => {
        const id = Number(c.args[0])
        const uri = (opts.uri ?? goodUri)(id)
        return uri === undefined
          ? { status: 'failure' as const }
          : { status: 'success' as const, result: uri }
      })
      return opts.truncateResults ? results.slice(0, -1) : results
    },
  }
  return { client, stats }
}

describe('CryptoJunks 链上读取 · supply', () => {
  it('返回数字而不是 bigint（视图要显示）', async () => {
    const { client } = makeClient({ supply: 10000n })
    expect(await fetchSupply(client)).toBe(10000)
  })

  it('只打一次 RPC', async () => {
    const { client, stats } = makeClient()
    await fetchSupply(client)
    expect(stats.readContractCalls).toBe(1)
  })

  it('读取失败时抛出，不静默返回 0', async () => {
    const client: JunkReaderClient = {
      async readContract() { throw new Error('rpc down') },
      async multicall() { return [] },
    }
    // 0 会被误读成「还没开始铭刻」，比报错更误导
    await expect(fetchSupply(client)).rejects.toThrow('rpc down')
  })
})

describe('CryptoJunks 链上读取 · 分页', () => {
  it('空页不打任何 RPC', async () => {
    const { client, stats } = makeClient()
    expect(await loadJunkPage(client, [])).toEqual([])
    expect(stats.multicallCalls).toBe(0)
  })

  it('🔴 一页 100 枚只打 1 个 multicall 请求（v1 是 100 个独立 call）', async () => {
    const ids = Array.from({ length: 100 }, (_, i) => i)
    const { client, stats } = makeClient()
    await loadJunkPage(client, ids)
    expect(stats.multicallCalls).toBe(1)
    expect(stats.batchSizes).toEqual([100])
  })

  it('超过 100 枚按批切分', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => i)
    const { client, stats } = makeClient()
    await loadJunkPage(client, ids)
    expect(stats.multicallCalls).toBe(3)
    expect(stats.batchSizes).toEqual([MULTICALL_BATCH, MULTICALL_BATCH, 50])
  })

  it('解析出元数据，顺序与入参严格一致', async () => {
    const ids = [5, 3, 9]
    const { client } = makeClient()
    const items = await loadJunkPage(client, ids)
    expect(items.map((x) => x.id)).toEqual([5, 3, 9])
    expect(items[0].meta?.name).toBe('CryptoJunks #5')
    expect(items[1].meta?.image).toBe('data:image/png;base64,IMG3')
  })

  it('🔴 单枚失败只让该枚为 null，不拖垮整页', async () => {
    const { client } = makeClient({ uri: (id) => (id === 7 ? undefined : goodUri(id)) })
    const items = await loadJunkPage(client, [6, 7, 8])
    expect(items[0].meta).not.toBeNull()
    expect(items[1].meta).toBeNull()
    expect(items[2].meta).not.toBeNull()
  })

  it('🔴 结果长度与入参不符时报错，不静默错位（错位会显示别人的图）', async () => {
    const { client } = makeClient({ truncateResults: true })
    await expect(loadJunkPage(client, [1, 2, 3])).rejects.toThrow('预期 3 项')
  })

  it('元数据存在但图片为空 → null（沿用 v1 特例）', async () => {
    const { client } = makeClient({
      uri: (id) => uriFor({ name: `#${id}`, id, image: 'data:image/png;base64,' }),
    })
    const items = await loadJunkPage(client, [1])
    expect(items[0].meta).toBeNull()
  })

  it('合约地址用的是 v1 页面展示的那个', () => {
    expect(CRYPTOJUNKS_ADDRESS).toBe('0x1b1d15726d64c5027b627138f2bf051cc1EF2680')
  })
})
