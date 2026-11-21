// 区块详情页路由参数解析（纯函数，零 RPC / 零 DOM）
//
// 对接 v1 的一个既有能力：`app/scripts/controllers/blockInfosController.js:71`
// 直接把 `$routeParams.blockId` 交给 `web3.eth.getBlock(blockId)`，
// 而 web3 0.x 的 getBlock 同时接受「区块号」与「32 字节区块哈希」——
// 也就是说 v1 的 `/#/block/:blockId` 本来就是高度/哈希双入参。
//
// v2 的 `/block/:number` 一直把参数当高度用（`BigInt(props.number)`），
// 于是任何区块哈希入参都会在 `BigInt('0x0952…')` 这一步抛错或变成天文数字，
// 最终显示「未找到区块」。这不是理论缺口：交易详情页的「区块哈希」行
// （PR #96 加的，`JvHashText type="block"`）可点击跳到 `/block/<哈希>`，
// 点过去必然失败 —— 生产上是一条死链。
//
// 判定规则（与 v1/web3 的宽松语义保持一致，但把歧义显式化）：
//   1. 剥掉可选的 `0x` 前缀；
//   2. **64 位 hex 一律当哈希**（32 字节）。这里不排除「64 位全数字」的情况：
//      它同样是合法哈希，而 64 位十进制数不可能是真实区块高度（链高远小于 2^53），
//      所以按哈希处理能得到干净的「该区块不存在」，比按高度抛 RPC 参数错误更好；
//   3. 其余全数字当区块号（前导零归一化，`007` → 7，与 v1 的 parseInt 一致）；
//   4. 其它一律 null（交给视图报「参数无效」，不要静默猜）。

const HEX_PREFIX = /^0x/i
const HEX64 = /^[0-9a-fA-F]{64}$/
const DECIMAL = /^\d+$/

export type BlockParam =
  | { kind: 'number'; number: bigint }
  // `0x${string}` 而不是裸 string：viem 的 `getBlock({ blockHash })` 只接受模板字面量类型，
  // 用裸 string 会在视图层报 TS2322。类型本身就表达了「这里一定是 0x 前缀的 hex」。
  | { kind: 'hash'; hash: `0x${string}` }

/**
 * 把路由参数解析成「按高度」或「按哈希」。
 * @param raw `route.params.number` 的原始字符串
 * @returns 无法判定时返回 null
 */
export function parseBlockParam(raw: string | null | undefined): BlockParam | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (trimmed.length === 0) return null

  const body = HEX_PREFIX.test(trimmed) ? trimmed.slice(2) : trimmed
  if (body.length === 0) return null

  if (HEX64.test(body)) {
    // 统一成小写 + 0x 前缀：同一区块哈希的两种写法（带/不带前缀）要能互相命中，
    // 也让视图里的「区块哈希」展示与链上返回值逐字可比。
    return { kind: 'hash', hash: `0x${body.toLowerCase()}` as `0x${string}` }
  }

  if (DECIMAL.test(body)) {
    return { kind: 'number', number: BigInt(body) }
  }

  return null
}

/** 参数无法解析时的展示用摘要（截断长串，避免把 64 位哈希整行铺在标题里） */
export function shortBlockParam(raw: string | null | undefined): string {
  if (typeof raw !== 'string' || raw.length === 0) return '—'
  if (raw.length <= 18) return raw
  return `${raw.slice(0, 10)}…${raw.slice(-6)}`
}
