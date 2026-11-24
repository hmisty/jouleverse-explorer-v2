// DID 页面（`/did/:jnsId`）的域名 → 地址解析
//
// v1 基准（`addressInfoController.js` 的 `getNSAddress()`）：
//   1. `jnsId.match(/(.*)\.j$/)` —— 必须以 .j 结尾，否则 addressId 直接写「域名格式错误」
//   2. `_nslookup(name)` → tokenId；tokenId == 0 视为不存在
//   3. `_bound(tokenId)` → boundAddr；`== 0` 时把字符串 "未绑定地址" 当地址继续往下跑
//      ⚠️ 这是 v1 的一个真实 bug：未绑定的域名会把中文串塞给 encodeJVA，页面报错/空白。
//      v2 不复刻这个 bug —— 未绑定时明确提示「未绑定地址」，不渲染地址视图。
//
// 因此这里把「解析结果」建模成三态：ok / unbound / notfound，由视图分别渲染。

import { publicClient } from '../config/client'
import { JNS_ADDRESS, jnsABI } from '../contracts/jns'
import { normalizeJnsId, jnsNameOf } from './jns-endorse'

export type DidResolveResult =
  | { kind: 'ok'; jnsId: string; tokenId: bigint; owner: string; boundAddress: string }
  /** 域名存在但没绑定地址（v1 会把 "未绑定地址" 当地址用，这里显式建模） */
  | { kind: 'unbound'; jnsId: string; tokenId: bigint; owner: string }
  /** 域名不存在（_nslookup 返回 0） */
  | { kind: 'notfound'; jnsId: string }
  /** 域名格式非法 */
  | { kind: 'invalid'; raw: string; reason: string }

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

/** 判 boundAddr 是否为空（v1 用 `result3 == 0`，viem 返回的是零地址字符串） */
export function isUnbound(boundAddress: string | null | undefined): boolean {
  if (!boundAddress) return true
  return boundAddress.toLowerCase() === ZERO_ADDRESS
}

/**
 * 把链上读到的三件事拼成结果（纯函数，便于单测）。
 * 之所以拆出来：解析流程的错误分支很多，纯函数才能把每种组合都钉住。
 */
export function buildDidResult(params: {
  raw: string
  jnsId: string
  tokenId: bigint
  owner: string
  boundAddress: string
}): DidResolveResult {
  const { jnsId, tokenId, owner, boundAddress } = params
  if (tokenId === 0n) return { kind: 'notfound', jnsId }
  if (isUnbound(boundAddress)) return { kind: 'unbound', jnsId, tokenId, owner }
  return { kind: 'ok', jnsId, tokenId, owner, boundAddress }
}

/** 走链上解析一个 `.j` 域名。调用方负责把 invalid 分支在发请求前就拦掉（省一次 RPC）。 */
export async function resolveDid(raw: string | null | undefined): Promise<DidResolveResult> {
  const jnsId = normalizeJnsId(raw)
  if (!jnsId) {
    return { kind: 'invalid', raw: String(raw ?? ''), reason: '域名格式无效，应为 xxx.j（只含字母、数字、中横线）' }
  }
  const name = jnsNameOf(jnsId)

  const tokenId = (await publicClient.readContract({
    address: JNS_ADDRESS,
    abi: jnsABI,
    functionName: '_nslookup',
    args: [name],
  })) as bigint

  if (tokenId === 0n) {
    return { kind: 'notfound', jnsId }
  }

  const [owner, boundAddress] = await Promise.all([
    publicClient.readContract({
      address: JNS_ADDRESS,
      abi: jnsABI,
      functionName: 'ownerOf',
      args: [tokenId],
    }) as Promise<string>,
    publicClient.readContract({
      address: JNS_ADDRESS,
      abi: jnsABI,
      functionName: '_bound',
      args: [tokenId],
    }) as Promise<string>,
  ])

  return buildDidResult({ raw: String(raw ?? ''), jnsId, tokenId, owner, boundAddress })
}
