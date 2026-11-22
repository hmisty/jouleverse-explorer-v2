/**
 * 接收方解析：地址 / `.j` 域名（v1 对等，P5-2 §三·C 第 11 项）
 *
 * v1 在**两处**把「接收方」当同一个概念处理，都支持 `.j`：
 *   - `addressInfoController.js:200-233`（发送 wJ）
 *   - `jnsInfoController.js:125-155`（赠予 JNS 域名）
 * 两处逻辑逐行相同：`to.endsWith('.j')` → 去掉后缀 → `_nslookup(name)` 拿 tokenId
 * → tokenId > 0 才继续 → `_bound(tokenId)` 拿绑定地址 → 非零地址才算有效。
 *
 * v1 的错误文案把两种情况混成一句「无效的JNS域名」：**域名不存在**与**RPC 读取失败**。
 * 这是 v1 的缺陷——网络抖动被说成「这个域名不存在」，用户会去别的浏览器反复确认一个
 * 其实存在的域名。按对等清单「呈现不向 v1 回退」的判据，这里必须区分：
 *   - 域名不存在 → 「无效的 JNS 域名」（v1 文案照留）
 *   - 读取失败   → 「读取域名失败，请重试」并明确说明**不是**域名不存在
 *
 * 模块本身不碰 RPC：查询函数由调用方注入，纯逻辑可离线测。
 */
import { normalizeToHex, detectAddressFormat } from './jvaddress'

/** v1 的 `.j` 后缀（大小写都接受：后缀不属于域名本体，容忍写法不构成猜测） */
export const JNS_SUFFIX = '.j'

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

const HEX_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/

export type AddressFormat = 'hex' | 'b32' | 'full'

export type RecipientTarget =
  | { kind: 'address'; address: `0x${string}`; format: AddressFormat }
  | { kind: 'jns'; name: string; label: string }
  | { kind: 'empty' }
  | { kind: 'invalid'; reason: string }

/**
 * 把用户输入分类成「地址 / .j 域名 / 空 / 无效」。
 *
 * 顺序有讲究：**先判 `.j` 后缀，再判地址格式**。
 * 反过来不成立——40 位 B32 地址以 `j3` 开头但不以 `.j` 结尾；
 * 而以 `.j` 结尾的字符串不可能是合法 hex/B32 地址，两个集合本就互斥。
 * 之所以显式写下顺序，是因为 2026-11-20 在搜索框栽过一次同类问题：
 * `/^\d+$/` 抢先命中 40 位全数字地址，导致合法地址被当区块号。
 */
export function parseRecipient(input: string | null | undefined): RecipientTarget {
  const raw = (input ?? '').trim()
  if (raw === '') return { kind: 'empty' }

  if (raw.toLowerCase().endsWith(JNS_SUFFIX)) {
    const name = raw.slice(0, -JNS_SUFFIX.length).trim()
    if (name === '') return { kind: 'invalid', reason: '`.j` 前面不能为空' }
    if (/\s/.test(name)) return { kind: 'invalid', reason: '域名不能包含空格' }
    return { kind: 'jns', name, label: `${name}${JNS_SUFFIX}` }
  }

  const hex = normalizeToHex(raw)
  if (hex && HEX_ADDRESS_RE.test(hex)) {
    const format = detectAddressFormat(raw) as AddressFormat
    return { kind: 'address', address: hex as `0x${string}`, format }
  }

  return {
    kind: 'invalid',
    reason: '不是有效地址（HEX / JVA B32），也不以 .j 结尾',
  }
}

/** `_nslookup` + `_bound` 的最小读数结果 */
export interface JnsLookup {
  /** `_nslookup` 返回的 tokenId，0 表示域名不存在 */
  tokenId: bigint
  /** `_bound` 返回的绑定地址，零地址表示未绑定 */
  bound: string | null
}

export type ResolveErrorCode =
  | 'empty'
  | 'invalid'
  | 'jns-not-found'
  | 'jns-unbound'
  | 'jns-read-failed'

export type ResolveResult =
  | { ok: true; address: `0x${string}`; via: 'address' | 'jns'; display: string }
  | { ok: false; code: ResolveErrorCode; message: string }

/**
 * 解析接收方 → 最终链上地址。
 *
 * @param input      用户原始输入
 * @param lookupJns  `.j` 域名的链上查询（注入，便于离线测试）
 */
export async function resolveRecipient(
  input: string | null | undefined,
  lookupJns: (name: string) => Promise<JnsLookup>,
): Promise<ResolveResult> {
  const target = parseRecipient(input)

  if (target.kind === 'empty') {
    return { ok: false, code: 'empty', message: '请输入接收地址或 .j 域名' }
  }

  if (target.kind === 'invalid') {
    return { ok: false, code: 'invalid', message: `接收方无效：${target.reason}` }
  }

  if (target.kind === 'address') {
    return { ok: true, address: target.address, via: 'address', display: target.address }
  }

  // .j：读取失败与「不存在」必须分开报
  let lookup: JnsLookup
  try {
    lookup = await lookupJns(target.name)
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    return {
      ok: false,
      code: 'jns-read-failed',
      message: `读取域名 ${target.label} 失败，请重试（这不代表域名不存在）：${detail}`,
    }
  }

  if (!lookup || typeof lookup.tokenId !== 'bigint') {
    return {
      ok: false,
      code: 'jns-read-failed',
      message: `读取域名 ${target.label} 返回异常，请重试（这不代表域名不存在）`,
    }
  }

  if (lookup.tokenId === 0n) {
    return { ok: false, code: 'jns-not-found', message: `无效的 JNS 域名：${target.label} 不存在` }
  }

  const bound = lookup.bound
  if (!bound || bound === ZERO_ADDRESS || !HEX_ADDRESS_RE.test(bound)) {
    return { ok: false, code: 'jns-unbound', message: `JNS 域名 ${target.label} 未绑定有效地址` }
  }

  return { ok: true, address: bound as `0x${string}`, via: 'jns', display: `${target.label} → ${bound}` }
}

/** 只读客户端的最小结构（viem PublicClient 可直接满足，测试可传假对象） */
export interface JnsReadClient {
  readContract: (args: {
    address: `0x${string}`
    abi: readonly unknown[]
    functionName: string
    args?: readonly unknown[]
  }) => Promise<unknown>
}

/**
 * 链上查询 `.j` 域名：`_nslookup` → `_bound`。
 *
 * 顺序不能变：`_bound` 的入参是 **tokenId** 不是名字，
 * 所以必须先拿到 tokenId；tokenId 为 0 时直接返回，不发第二次 RPC。
 */
export function makeJnsLookup(client: JnsReadClient, jnsAddress: `0x${string}`, abi: readonly unknown[]) {
  return async (name: string): Promise<JnsLookup> => {
    const tokenId = (await client.readContract({
      address: jnsAddress,
      abi,
      functionName: '_nslookup',
      args: [name],
    })) as bigint

    if (tokenId === 0n) return { tokenId, bound: null }

    const bound = (await client.readContract({
      address: jnsAddress,
      abi,
      functionName: '_bound',
      args: [tokenId],
    })) as string

    return { tokenId, bound }
  }
}
