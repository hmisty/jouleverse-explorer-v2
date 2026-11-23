// JNSDAO V 徽章解析：query(address) → data:application/json;base64 元数据
//
// v1 依据 `addressInfoController.js:1105-1122`：
//   contract.methods.query(addr).call(...) → parseTokenURI(tokenURI)
//   tokenInfo.npubkey = bech32.encode('npub', bech32.toWords(hexToBytes(tokenInfo.hex)))
//   tag = tokenInfo.name          ← 标签直接用元数据里的 name，不自己拼 "JNSDAO V #id"
//
// ⚠️ 两个与其它 NFT 不同的地方，都不能照抄通用枚举逻辑：
//   1. **没有 tokenOfOwnerByIndex 路径**：入口是 query(addr)，一次调用出结果。
//   2. **query() 对无徽章地址 revert**（实测 0x9c100856… 报 "Execution reverted"），
//      不是返回空串/零地址。所以「没持有」与「读取失败」在这里长得一样，
//      区别只能靠先读 balanceOf 判断——见 shouldQueryJnsdaoV()。
//      直接把 revert 当「无徽章」，会把 RPC 抖动显示成「你没加入」，同 11-22 的
//      jns-read-failed 教训。
//
// 长度/形状判定集中在 npub.ts（32 字节硬约束），本文件只负责 metadata 形状。

import { npubFromMetadata } from './npub'

export interface JnsdaoVBadge {
  /** 徽章展示名（元数据 name 字段；缺失时为 null，UI 用兜底文案且不显示假名字） */
  name: string | null
  /** nostr npub 公钥；元数据无 hex 或长度不对时为 null */
  npub: string | null
  /** 徽章图（仅放行 data:image/ 内联图，拦截外链避免泄露访问者 IP） */
  image: string | null
}

/** tokenURI 是否为可解析的内联 base64 JSON（不是则整体判失败，不猜） */
const DATA_JSON_B64 = /^data:application\/json;base64,/

function decodeBase64Utf8(b64: string): string | null {
  try {
    const binary = atob(b64)
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch {
    return null
  }
}

/**
 * 解析 JNSDAO V 的 tokenURI。
 * @returns 解析成功返回徽章对象；URI 形状不认识或 JSON 坏掉返回 null（调用方显式报错，不静默当「无徽章」）
 */
export function parseJnsdaoVTokenUri(uri: string): JnsdaoVBadge | null {
  if (typeof uri !== 'string' || !DATA_JSON_B64.test(uri)) return null
  const json = decodeBase64Utf8(uri.replace(DATA_JSON_B64, ''))
  if (json === null) return null
  let meta: unknown
  try {
    meta = JSON.parse(json)
  } catch {
    return null
  }
  // ⚠️ Array 的 typeof 也是 'object'，必须显式排除：JSON 载荷是 `[1,2]` 时
  // 取 m.name 会静默得到 undefined 并渲染一张「无名字、无图、无 npub」的空徽章。
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null
  const m = meta as { name?: unknown; image?: unknown }
  return {
    name: typeof m.name === 'string' && m.name.trim() ? m.name.trim() : null,
    npub: npubFromMetadata(meta),
    // 与 useNftEnumeration.parseMetadata 同一判据：只放行 data:image/ 内联图
    image: typeof m.image === 'string' && m.image.startsWith('data:image/') ? m.image : null,
  }
}

/**
 * 是否该发 query() 请求。
 *
 * query() 对无徽章地址 revert，所以**必须**先用 balanceOf 的结果决定要不要调用：
 * 余额 0 → 直接判定「未持有」，不发请求（也避免把预期的 revert 当错误）；
 * 余额 null（balanceOf 读失败）→ 也不发，交给上层显示「读取失败」。
 * 只有余额 > 0 才调用，此时 revert 才是真异常。
 */
export function shouldQueryJnsdaoV(balance: bigint | null): boolean {
  return balance !== null && balance > 0n
}
