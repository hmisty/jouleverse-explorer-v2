// JNS 打赏（endorse）金额与 DID 域名规范化 —— 纯函数，无 RPC
//
// v1 基准（`jnsInfoController.js` 的 endorseJNSAmountDialog / endorseJNSConfirmDialog）：
//   - 快选 1 / 2 / 5 / 10 WJ，或「手动输入」
//   - 手动输入框提示「大于0小于100 WJ」，校验写成 `<= 0 || > 100` 才拦
//     → 边界是 **0 < x ≤ 100**（100 是允许的，v1 弹窗文案写「小于100」是文案自身的错）
//   - `Number.isNaN(amount) || amount <= 0 || amount > 100` → 报错
//   - 通过 `web3.utils.toWei(amount.toString(), 'ether')` 转 wei
//
// ⚠️ 为什么不用 Number 做金额：
//   v1 用 parseFloat + toWei(String)，`0.1` 这类值靠 toWei 内部字符串解析才不出错。
//   这里直接按字符串切小数位构造 bigint，避免任何浮点往返。

/** v1 快选档位（WJ） */
export const ENDORSE_PRESETS = [1, 2, 5, 10] as const

/** 打赏上限（WJ） */
export const MAX_ENDORSE_WJ = 100

/** wei 的十进制位数 */
const WEI_DECIMALS = 18

export interface EndorseAmountOk {
  ok: true
  /** 转好的 wei */
  wei: bigint
  /** 规范化后的 WJ 字符串（去尾零、去前导零），用于回显与二次确认 */
  wj: string
}

export interface EndorseAmountErr {
  ok: false
  error: string
}

export type EndorseAmountResult = EndorseAmountOk | EndorseAmountErr

/** 去掉小数尾部的 0，以及多余的 `.`（"1.500" → "1.5"，"2.000" → "2"） */
function trimTrailingZeros(s: string): string {
  if (!s.includes('.')) return s
  const trimmed = s.replace(/0+$/, '').replace(/\.$/, '')
  return trimmed === '' ? '0' : trimmed
}

/** 去掉整数部分的前导 0（保留单个 "0"） */
function stripLeadingZeros(s: string): string {
  return s.replace(/^0+(?=\d)/, '')
}

/**
 * 校验并转换打赏金额。
 *
 * 边界严格对齐 v1：**0 < x ≤ 100**，否则报错（不静默截断、不自动夹到上限）。
 * 允许小数（v1 注释写明 `// float number allowed`），最多 18 位小数。
 *
 * 上限比较用 bigint 而不是 Number：`100.000000000000000001` 这种输入
 * 转 Number 会变成 100 而放过去，bigint 才拦得住。
 *
 * @param raw 用户输入或快选档位（字符串或数字都接受，统一按字符串解析）
 */
export function parseEndorseAmount(raw: string | number | null | undefined): EndorseAmountResult {
  if (raw === null || raw === undefined) {
    return { ok: false, error: '请填写打赏金额' }
  }
  // 数字转字符串走 String() 而不是模板拼接，避免 NaN 记号污染
  const text = (typeof raw === 'number' ? String(raw) : raw).trim()

  if (text === '') {
    return { ok: false, error: '请填写打赏金额' }
  }

  // 只接受「整数」或「整数.整数」；拒绝科学计数法、正负号、千分位、内嵌空格
  if (!/^\d+(\.\d+)?$/.test(text)) {
    return { ok: false, error: '金额格式无效，请输入正数' }
  }

  const [intPartRaw, fracPart = ''] = text.split('.')

  if (fracPart.length > WEI_DECIMALS) {
    return { ok: false, error: `金额最多 ${WEI_DECIMALS} 位小数` }
  }

  const intPart = stripLeadingZeros(intPartRaw)
  const wj = trimTrailingZeros(fracPart ? `${intPart}.${fracPart}` : intPart)

  // 拼 wei：整数位 + 补齐到 18 位的小数位
  const wei = BigInt(`${intPart}${fracPart.padEnd(WEI_DECIMALS, '0')}`)

  if (wei <= 0n) {
    return { ok: false, error: '打赏金额须大于 0' }
  }

  if (wei > BigInt(MAX_ENDORSE_WJ) * 10n ** BigInt(WEI_DECIMALS)) {
    return { ok: false, error: `打赏金额须不超过 ${MAX_ENDORSE_WJ} WJ` }
  }

  return { ok: true, wei, wj }
}

/**
 * 链上真实存在的「含大写字母」域名（2026-11-24 全量扫描 822 个 token 实测）。
 *
 * ⚠️ 这不是「v1 的任意特例」，而是链上事实：
 *   `_nslookup` **区分大小写**，且 `WJ.TV`(=652) 与 `wj.tv`(=815)、
 *   `DC`(=653) 与 `dc`(=816) … 是**两两不同的域名**（不同 tokenId、不同 owner）。
 *
 * 所以「一律 toLowerCase 再查」是错的：查 `WJ.TV` 会被改写成 `wj.tv`，
 * 返回**另一个域名**的数据 —— 页面不报错，但显示的是别人的身份资料。
 * 这比查不到更危险。
 *
 * v1 只硬编码了 GM / Nana 两个，是因为 v1 没有『大小写归一化』这一步
 * （它直接用原始 route param 查），不需要维护这张表。
 * v2 因为要做「用户随手输入」的归一化，必须知道哪些名字大写是有意义的。
 */
export const CASE_SENSITIVE_JNS: ReadonlyArray<{ name: string; hasLowercaseTwin: boolean }> = [
  // tokenId 28 / _nslookup("gm") = 0 → 小写查不到，可安全回退到大写
  { name: 'GM', hasLowercaseTwin: false },
  // tokenId 29 / _nslookup("nana") = 0 → 同上
  { name: 'Nana', hasLowercaseTwin: false },
  // ⚠️ 以下 5 个**都有**小写孪生域名（不同 tokenId、不同 owner），绝不可互转：
  { name: 'WJ.TV', hasLowercaseTwin: true }, // 652 vs wj.tv 815
  { name: 'DC', hasLowercaseTwin: true },    // 653 vs dc 816
  { name: 'MC', hasLowercaseTwin: true },    // 654 vs mc 817
  { name: 'Bybit', hasLowercaseTwin: true }, // 656 vs bybit 819
  { name: 'Trader', hasLowercaseTwin: true },// 660 vs trader 818
]

/**
 * 域名输入规范化（DID 页 `/did/:jnsId` 用）。
 *
 * 规则（顺序敏感）：
 *   1. 用户输入**原样**命中大小写敏感表 → 原样返回，绝不小写化
 *      （否则查 `WJ.TV` 会被改写成 `wj.tv`，返回另一个域名的资料 —— 不报错但是错的）
 *   2. 否则小写化。
 *   3. 小写化后若是某个「**无小写孪生**」的大小写敏感域名 → 回退到大写形式。
 *      这一条对齐 v1 的 `if (id == "gm.j") id = "GM.j";`：用户敲 `gm.j` 时
 *      链上并没有 `gm` 这个域名，回退到 `GM.j` 才查得到，且不会指向错误对象。
 *   4. 其余保持小写。对小写孪生域名（`wj.tv` / `dc` / …）**不做任何纠正** ——
 *      它们本身就是真实域名。
 *
 * 三条信息缺一不可：只做 1 会丢掉 v1 的 `gm.j` 便利性；只做 3 会把 `wj.tv` 改成 `WJ.TV`。
 *
 * @returns 规范化后的 `.j` 域名；格式不对返回 null
 */
export function normalizeJnsId(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null
  const trimmed = raw.trim()
  if (trimmed === '') return null

  const lower = trimmed.toLowerCase()
  if (!lower.endsWith('.j')) return null

  const name = lower.slice(0, -2)
  if (name === '') return null
  // 与 v1 mint 的名称字符集一致：大小写字母、数字、中横线
  // 查询用的字符集比 mint 宽：允许内部点号（链上有 `WJ.TV` 这种带点的真实域名）。
  // mint 的严格字符集（不许点）另由 validateMintName 负责 —— 两者职责不同，不能共用一条。
  if (!/^[a-z0-9.-]+$/i.test(name)) return null
  if (name.startsWith('.') || name.endsWith('.')) return null

  // ① 原样命中（保留用户输入的大写）
  const rawName = trimmed.slice(0, -2)
  const exact = CASE_SENSITIVE_JNS.find(e => e.name === rawName)
  if (exact) return `${exact.name}.j`

  // ②③ 小写化后，仅对「无小写孪生」的名字回退到大写
  const byLower = CASE_SENSITIVE_JNS.find(e => e.name.toLowerCase() === name)
  if (byLower && !byLower.hasLowercaseTwin) return `${byLower.name}.j`

  // ④ 其余保持小写（含 wj.tv 这类真实存在的小写域名）
  return lower
}

/**
 * 判断某个名字是否需要走「大小写敏感」查询路径。
 * 用于视图层给用户提示：`WJ.TV` 与 `wj.tv` 是两个不同域名。
 */
export function isCaseSensitiveName(name: string): boolean {
  return CASE_SENSITIVE_JNS.some(e => e.name === name)
}

/**
 * 从 `.j` 域名取裸名字（`_nslookup` 的入参）。
 * `normalizeJnsId` 之后调用，因此保留大小写特例。
 */
export function jnsNameOf(jnsId: string): string {
  return jnsId.endsWith('.j') ? jnsId.slice(0, -2) : jnsId
}

/**
 * JNS mint 的名称校验（v1 `mintJNS` 的两道前置检查）。
 * 顺序与 v1 一致：先判 `.j` 结尾，再判字符集。
 */
export function validateMintName(raw: string): { ok: true; name: string } | { ok: false; error: string } {
  const trimmed = (raw || '').trim()
  if (!trimmed.toLowerCase().endsWith('.j') || trimmed.length <= 2) {
    return { ok: false, error: `错误：JNS 名称 ${trimmed} 必须以 .j 结尾` }
  }
  const name = trimmed.slice(0, -2)
  if (!/^[a-zA-Z0-9-]+$/.test(name)) {
    return { ok: false, error: `错误：JNS 名称 ${trimmed} 只可以包含大小写字母、数字以及中横线` }
  }
  return { ok: true, name }
}

/**
 * 是否应显示 owner-only 的 mint 入口。
 * v1 条件：`chainId == '0xe52' && account == jnsContractOwner`（且该域名不存在）。
 * 地址比较一律小写 —— v1 模板里是 `account.toLowerCase() == jnsContractOwner.toLowerCase()`
 * （addressInfo.html 那处漏了，但 jnsInfo.html 有）。这里统一小写，避免校验和大小写差异。
 */
export function canMintJns(params: {
  connectedAccount: string | null | undefined
  contractOwner: string | null | undefined
  chainId: number | null | undefined
  /** 该域名是否已存在（存在则不需要 mint 入口） */
  exists: boolean
}): boolean {
  const { connectedAccount, contractOwner, chainId, exists } = params
  if (exists) return false
  if (chainId !== 3666) return false
  if (!connectedAccount || !contractOwner) return false
  if (!connectedAccount.startsWith('0x') || !contractOwner.startsWith('0x')) return false
  return connectedAccount.toLowerCase() === contractOwner.toLowerCase()
}
