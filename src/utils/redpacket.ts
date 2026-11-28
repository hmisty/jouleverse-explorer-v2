// 链上红包（RedPacketJoule）纯逻辑：入参校验 / 状态判定 / ID 编解码
//
// 全部为纯函数（无 RPC、无钱包、无 Vue），便于在 10 毫秒内测完。
// 合约侧规则见 src/contracts/redpacket.ts 注释与 v1 app/scripts/contracts/redpacket.sol。
//
// ⚠️ 这里的所有校验都只是「提前给出可读提示」，最终判定仍在合约里。
// 前端放行不等于链上成功，不能把本模块当成安全边界。

export const MAX_PACKET_AMOUNT_WEI = 2000n * 10n ** 18n
export const MAX_PACKET_QUANTITY = 500n
export const UINT256_MAX = 2n ** 256n - 1n
/** 合约 expiry = block.number + 24h/15s = +5760 块 */
export const EXPIRY_BLOCKS = 5760n
/** 平均出块时间（毫秒），仅用于把「剩余块数」粗算成时间给用户看 */
export const BLOCK_TIME_MS = 15_000

/** v1 用 web3.utils.randomHex(32) 生成的 32 字节红包 ID */
const HEX32_RE = /^0x[0-9a-fA-F]{1,64}$/
const DECIMAL_RE = /^\d+$/

/**
 * 解析红包 ID。
 *
 * v1 分享出去的链接形如 `/#/redpacket/0x1f3a…`（32 字节 hex），
 * 而链上是 `mapping(uint256 => RedPacket)`。所以既要能吃 hex（老链接），
 * 也要能吃十进制（用户从合约工具复制的值）。
 *
 * 返回 null 表示不合法——调用方必须显式处理，不要静默当 0 处理，
 * 否则会把「ID 打错」变成「打开 0 号红包」，用户看到的现象会是「红包不存在」。
 */
export function parsePacketId(input: string | null | undefined): bigint | null {
  if (typeof input !== 'string') return null
  const s = input.trim()
  if (!s) return null

  if (HEX32_RE.test(s)) {
    const body = s.slice(2)
    if (!body) return null
    const v = BigInt(`0x${body}`)
    return v <= UINT256_MAX ? v : null
  }
  if (DECIMAL_RE.test(s)) {
    const v = BigInt(s)
    return v <= UINT256_MAX ? v : null
  }
  return null
}

/** 把 bigint ID 还原成 v1 那种定长 32 字节 hex，用于展示与生成分享链接 */
export function formatPacketId(id: bigint): string {
  if (id < 0n || id > UINT256_MAX) throw new Error('红包 ID 超出 uint256 范围')
  return `0x${id.toString(16).padStart(64, '0')}`
}

// ---------------------------------------------------------------- 入参校验

export interface CreateValidation {
  /** 面向用户的错误文案，空数组表示通过 */
  errors: string[]
  /** 解析出的 wei 金额；解析失败为 null */
  amountWei: bigint | null
  /** 解析出的个数；解析失败为 null */
  quantity: bigint | null
  /** 现有授权额度是否足够，不足时需要先 approve */
  needsApproval: boolean
  /** 授权额度未知（未连接钱包）时也视为「需要授权」，但不算错误 */
  allowanceUnknown: boolean
}

/**
 * 解析用户输入的小数金额为 wei。
 *
 * 不用 parseEther 的原因：parseEther 对 "1.2.3"、""、"." 会抛异常，
 * 抛异常在视图层容易变成「点了没反应」或未捕获的白屏，这里统一返回 null。
 * 超过 18 位小数直接返回 null——静默截断会让用户以为金额是对的。
 */
export function parseAmountToWei(input: string | null | undefined): bigint | null {
  if (typeof input !== 'string') return null
  const s = input.trim()
  if (!s) return null
  if (!/^\d*\.?\d*$/.test(s)) return null
  const [intPart = '', fracPart = ''] = s.split('.')
  if (!intPart && !fracPart) return null
  if (fracPart.length > 18) return null
  const digits = (intPart || '0') + fracPart.padEnd(18, '0')
  try {
    return BigInt(digits)
  } catch {
    return null
  }
}

/** 解析个数：必须是正整数（合约 quantity 是 uint256，但 0 个红包没有意义） */
export function parseQuantity(input: string | null | undefined): bigint | null {
  if (typeof input !== 'string') return null
  const s = input.trim()
  if (!DECIMAL_RE.test(s)) return null
  const v = BigInt(s)
  return v > 0n && v <= MAX_PACKET_QUANTITY ? v : null
}

/**
 * 创建红包表单校验，逐条对齐合约 require：
 *   quantity <= 500 / amount <= 2000 WJ / amount >= quantity（wei 口径）
 * 外加 v1 界面就有的「总额必须大于 0」。
 */
export function validateCreate(
  amountInput: string | null | undefined,
  quantityInput: string | null | undefined,
  allowanceWei: bigint | null,
): CreateValidation {
  const errors: string[] = []
  const amountWei = parseAmountToWei(amountInput)
  const rawQty = typeof quantityInput === 'string' ? quantityInput.trim() : ''

  let quantity: bigint | null = null
  if (!rawQty) {
    errors.push('红包个数不能为空')
  } else if (!DECIMAL_RE.test(rawQty)) {
    errors.push('红包个数必须是整数')
  } else {
    const q = BigInt(rawQty)
    if (q === 0n) errors.push('红包个数必须大于 0')
    else if (q > MAX_PACKET_QUANTITY) errors.push(`红包个数不能超过 ${MAX_PACKET_QUANTITY} 个`)
    else quantity = q
  }

  if (amountInput === null || amountInput === undefined || String(amountInput).trim() === '') {
    errors.push('红包总额不能为空')
  } else if (amountWei === null) {
    errors.push('红包总额格式不正确（最多 18 位小数）')
  } else if (amountWei === 0n) {
    errors.push('红包总额必须大于 0 WJ')
  } else if (amountWei > MAX_PACKET_AMOUNT_WEI) {
    errors.push('红包总额不能超过 2000 WJ')
  } else if (quantity !== null && amountWei < quantity) {
    // 合约 require(amount >= quantity)：每个红包至少 1 wei
    errors.push('红包总额太小：至少要保证每个红包有 1 wei')
  }

  const needsApproval = allowanceWei === null ? true : amountWei === null ? false : allowanceWei < amountWei

  return {
    errors,
    amountWei: errors.length ? null : amountWei,
    quantity: errors.length ? null : quantity,
    needsApproval: errors.length ? false : needsApproval,
    allowanceUnknown: allowanceWei === null,
  }
}

/** 抢红包的幸运数字：0 ~ 2^256-1 的整数（合约只用它当 keccak 种子） */
export function validateLuckyNumber(input: string | null | undefined): { error: string | null; value: bigint | null } {
  if (typeof input !== 'string' || !input.trim()) return { error: '幸运数字不能为空', value: null }
  const s = input.trim()
  if (!DECIMAL_RE.test(s)) return { error: '幸运数字必须是 0 到 2^256-1 之间的整数', value: null }
  const v = BigInt(s)
  if (v > UINT256_MAX) return { error: '幸运数字必须是 0 到 2^256-1 之间的整数', value: null }
  return { error: null, value: v }
}

/** v1 是 Math.floor(Math.random()*10001)，即 0–10000，这里保持一致（不是 2^256 随机） */
export function randomLuckyNumber(): bigint {
  const buf = new Uint32Array(1)
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint32Array) => Uint32Array } }).crypto
  if (c?.getRandomValues) c.getRandomValues(buf)
  else buf[0] = Math.floor(Math.random() * 0x1_0000_0000)
  return BigInt(buf[0]! % 10001)
}

/** 生成 32 字节随机红包 ID（等价 v1 的 web3.utils.randomHex(32)） */
export function randomPacketId(): bigint {
  const bytes = new Uint8Array(32)
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto
  if (c?.getRandomValues) {
    c.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  let hex = ''
  for (const b of bytes) hex += b.toString(16).padStart(2, '0')
  return BigInt(`0x${hex}`)
}

// ---------------------------------------------------------------- 状态判定

export interface RedPacketSnapshot {
  created: boolean
  creator: string
  expiry: bigint
  totalE: bigint
  totalN: bigint
  leftE: bigint
  leftN: bigint
  finalE: bigint
  finalN: bigint
}

export type PacketStatus = 'not-found' | 'active' | 'finished' | 'expired'

/**
 * 红包状态。注意「抢完」与「过期」是两种不同的结局：
 *   - finished：left 归零（钱发完了）
 *   - expired ：left 还有，但 block.number >= expiry（剩下的发起人可 withdraw）
 * 合约里 expiry 硬编码 24 小时，超过之后 open 必然 revert "ERROR: expired"，
 * 所以「还有剩余」不等于「还能抢」——这两个信息必须同时展示，否则用户会一直点。
 */
export function packetStatus(s: RedPacketSnapshot, currentBlock: bigint): PacketStatus {
  if (!s.created) return 'not-found'
  if (s.leftE === 0n || s.leftN === 0n) return 'finished'
  if (currentBlock >= s.expiry) return 'expired'
  return 'active'
}

export function canOpen(s: RedPacketSnapshot, currentBlock: bigint): boolean {
  return packetStatus(s, currentBlock) === 'active'
}

/** 发起人才能在过期后取回剩余（合约 require(msg.sender == creator)） */
export function canWithdraw(
  s: RedPacketSnapshot,
  currentBlock: bigint,
  account: string | null | undefined,
): boolean {
  if (!s.created || !account) return false
  if (packetStatus(s, currentBlock) !== 'expired') return false
  return s.creator.toLowerCase() === account.toLowerCase()
}

/** 过期高度距当前还有多少块（已过期返回 0n） */
export function blocksUntilExpiry(s: RedPacketSnapshot, currentBlock: bigint): bigint {
  return s.expiry > currentBlock ? s.expiry - currentBlock : 0n
}

/** 把剩余块数粗算成「约 X 分钟/小时」，仅作提示；不承诺精确出块时间 */
export function describeRemaining(s: RedPacketSnapshot, currentBlock: bigint): string {
  const blocks = blocksUntilExpiry(s, currentBlock)
  if (blocks === 0n) return '已过期'
  const ms = Number(blocks) * BLOCK_TIME_MS
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `约 ${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  const restMin = minutes % 60
  return restMin ? `约 ${hours} 小时 ${restMin} 分钟` : `约 ${hours} 小时`
}

// ---------------------------------------------------------------- 领取历史

export interface OpenedEntry {
  /** 该笔领到的金额（wei） */
  e: bigint
  opener: string
  blockHeight: bigint
}

/** 历史条目最多扫多少条：合约总量上限 500，所以这是「有界扫描」而非无界 */
export const MAX_HISTORY_SCAN = 500

/**
 * 判断某地址是否已在这个红包里领过。
 *
 * 合约里 `openers` 是 private mapping，没有 getter（ABI 里也没有），
 * 唯一办法是遍历 `opened[0..final_n-1]` 找 opener。
 * 好处是有界（≤500），坏处是每次都要读 final_n 条——所以调用方必须
 * 先把 `redpackets(id)` 读回来再决定要不要扫，别盲目全量扫。
 */
export function findOpenerIndex(entries: readonly OpenedEntry[], account: string | null | undefined): number {
  if (!account) return -1
  const target = account.toLowerCase()
  return entries.findIndex(e => e.opener.toLowerCase() === target)
}

/**
 * 把 inspect 返回的原始 tuple 数组装配成有界历史。
 * 传入的 n 必须是 0..final_n-1，否则说明读到了未发生的槽位（全 0 且 opener 是零地址），
 * 那种条目要丢弃——否则页面会显示一堆「0x0000…0000 领了 0 WJ」。
 */
export function assembleHistory(
  raw: readonly { e: bigint; opener: string; blockHeight: bigint }[],
  limit = MAX_HISTORY_SCAN,
): OpenedEntry[] {
  const zero = '0x0000000000000000000000000000000000000000'
  return raw
    .filter(r => r.opener.toLowerCase() !== zero)
    .slice(0, limit)
}

/** 按块高倒序（最近领的在前），同块按链上顺序逆序 */
export function sortHistoryDesc(entries: readonly OpenedEntry[]): OpenedEntry[] {
  return [...entries].sort((a, b) => {
    if (a.blockHeight === b.blockHeight) return 0
    return a.blockHeight > b.blockHeight ? -1 : 1
  })
}

/** 分享链接里的红包信息文案（v1 copyRedpacketInfoToClipboard 的对齐版） */
export function buildShareText(params: {
  url: string
  totalAmount: string
  quantity: string
}): string {
  return [
    `红包地址：${params.url}`,
    '',
    `红包总额：${params.totalAmount} WJ`,
    '',
    `红包个数：${params.quantity}`,
  ].join('\n')
}
