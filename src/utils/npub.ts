// Nostr 公钥编码：32 字节 hex → bech32 `npub1…`
//
// 依据 v1 `addressInfoController.js:1118`：
//   tokenInfo.npubkey = bech32.encode('npub', bech32.toWords(hexToBytes(tokenInfo.hex)))
// 即 JNSDAO V 徽章的 metadata 里带 `hex`（32 字节 nostr 公钥），
// 页面把它转成 npub 展示，方便用户直接粘贴到 nostr 客户端。
//
// 为什么不用 `nip19` 那类库：仓库已有 @scure/base（viem 的传递依赖，已显式声明），
// bech32 编码是它的本职，不需要为 3 行逻辑再引一个包。
//
// ⚠️ 判定必须是「32 字节」而不是「长度像」：npub 的 payload 固定 32 字节，
// 31 或 33 字节同样能编码成合法 bech32 串，但解出来是**另一个公钥**（或直接无效）。
// 长度不对就返回 null，绝不截断/补零——那会给出一个指向别人的 npub。

import { bech32 } from '@scure/base'

/** npub payload 固定 32 字节 */
const NOSTR_PUBKEY_BYTES = 32

/**
 * 32 字节 hex → npub 字符串。
 *
 * @param hex 形如 `6fdc0877…`（可带 0x 前缀、大小写均可）
 * @returns `npub1…`；输入不是恰好 32 字节的合法 hex 时返回 null
 */
export function hexToNpub(hex: string): string | null {
  if (typeof hex !== 'string') return null
  const bare = hex.trim().replace(/^0x/i, '')
  // 必须是纯 hex 且长度恰好 64 字符（= 32 字节）
  if (!/^[0-9a-fA-F]+$/.test(bare)) return null
  if (bare.length !== NOSTR_PUBKEY_BYTES * 2) return null
  const bytes = new Uint8Array(NOSTR_PUBKEY_BYTES)
  for (let i = 0; i < NOSTR_PUBKEY_BYTES; i++) {
    bytes[i] = parseInt(bare.slice(i * 2, i * 2 + 2), 16)
  }
  return bech32.encode('npub', bech32.toWords(bytes))
}

/**
 * 从 tokenURI 解出的 metadata 对象里取 npub。
 * 字段缺失、类型不对、长度不对统一返回 null（UI 不渲染 npub 行）。
 */
export function npubFromMetadata(meta: unknown): string | null {
  if (!meta || typeof meta !== 'object') return null
  const hex = (meta as { hex?: unknown }).hex
  if (typeof hex !== 'string') return null
  return hexToNpub(hex)
}
