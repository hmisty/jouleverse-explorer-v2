/**
 * WJ 操作数量与接收方的校验（v1 对等，P5-2）
 *
 * v1 的两条写链路各有一套边界（`addressInfoController.js`）：
 *
 * | 操作 | 位置 | 边界 |
 * |---|---|---|
 * | 释放 J（unwrap/withdraw） | `wjUnwrapTo` L299-315 | `0 < amt < 100`，`check_balance` 勾选时才校验 `amt < wjBalance` |
 * | 发送 WJ（transfer）       | `wjSendTo` L235-245   | `0 < amt <= 2000`，`amt <= wjBalance` 恒校验 |
 *
 * v2 的 `WJOperations.vue` 原来**一条都没做**：输入框只过滤非数字字符，
 * 直接把 `parseEther` 的结果发给合约。后果不是「少了个提示」，而是：
 * - 数量填成 `150` 释放时，v1 会拦住并提示「大额释放请用合约工具」，v2 直接上链；
 * - 数量填成 `3000` 转账时，v1 拦住，v2 直接上链；
 * - 数量超过余额时，v2 只能等合约 revert，用户看到的是一条被 revert 解码后的英文错误。
 *
 * ⚠️ 两条边界的**不等号方向不同**（v1 原样）：释放是 `amt < 100`（严格小于），
 * 转账是 `amt <= 2000`（含等于）。看着像笔误，但它是 v1 的现行行为，
 * 对等清单的要求是「保留 v1 边界不放宽」——放宽（把 `<` 改成 `<=`）会让
 * 恰好 100 的释放通过，这是**扩大**了 v1 允许的范围，不在对等范围里。
 *
 * 金额一律用 bigint(wei) 比较，不经 Number：`parseFloat` 在 v1 里能用是因为
 * 它比较的是「用户写的字符串」和「格式化后的余额字符串」，量级都在 1e4 以内；
 * 这里保留 bigint 是为了让「恰好等于上限」这类边界不受浮点表示影响。
 */
import { parseEther, formatEther } from 'viem'

/** v1 `wjUnwrapTo`: `!(amt < 100)` → 拒绝 */
export const WITHDRAW_LIMIT_J = 100n

/** v1 `wjSendTo`: `!(amt <= 2000)` → 拒绝 */
export const TRANSFER_LIMIT_J = 2000n

export type WjOperation = 'withdraw' | 'transfer'

export type AmountErrorCode =
  | 'empty'
  | 'not-a-number'
  | 'not-positive'
  | 'too-many-decimals'
  | 'exceeds-operation-limit'
  | 'exceeds-balance'

export type AmountCheck =
  | { ok: true; wei: bigint; amountJ: string }
  | { ok: false; code: AmountErrorCode; message: string }

/** 只接受纯十进制（可带一个小数点），不接受科学计数法、十六进制、正负号 */
const DECIMAL_RE = /^\d*(?:\.\d*)?$/

/**
 * 校验并解析操作数量。
 *
 * @param input        用户输入（字符串）
 * @param op           操作类型，决定上限口径
 * @param balanceWei   当前 WJ 余额（wei）；null 表示未知，跳过余额校验
 * @param opts.checkBalance 是否校验余额。v1 的「新手加油」刻意关掉这一项
 *                     （新用户 WJ 余额为 0，但这笔是从**当前连接的钱包**释放给新人，
 *                     被检查的余额应是操作者自己的，v1 用 `check_balance` 复选框控制）
 */
export function checkWjAmount(
  input: string | null | undefined,
  op: WjOperation,
  balanceWei: bigint | null,
  opts: { checkBalance?: boolean } = {},
): AmountCheck {
  const raw = (input ?? '').trim()
  if (raw === '') return { ok: false, code: 'empty', message: '请输入数量' }

  // '.' 能被下面的正则匹配（整数部分与小数部分都允许为空），但它不是数量
  if (raw === '.') {
    return { ok: false, code: 'not-a-number', message: `无效的数量: "${raw}"` }
  }

  if (!DECIMAL_RE.test(raw)) {
    return { ok: false, code: 'not-a-number', message: `无效的数量: "${raw}"` }
  }

  // 18 位是 ERC20 精度；多写会被 parseEther 直接抛，这里给可读错误
  const fracLen = raw.includes('.') ? raw.split('.')[1].length : 0
  if (fracLen > 18) {
    return { ok: false, code: 'too-many-decimals', message: '数量最多 18 位小数' }
  }

  let wei: bigint
  try {
    wei = parseEther(raw)
  } catch {
    return { ok: false, code: 'not-a-number', message: `无效的数量: "${raw}"` }
  }

  if (wei <= 0n) {
    return { ok: false, code: 'not-positive', message: '数量必须大于 0' }
  }

  const limit = op === 'withdraw' ? WITHDRAW_LIMIT_J : TRANSFER_LIMIT_J
  const limitWei = parseEther(limit.toString())
  // 释放是严格小于，转账是小于等于——见文件头，这是 v1 原样
  const overLimit = op === 'withdraw' ? wei >= limitWei : wei > limitWei

  if (overLimit) {
    if (op === 'withdraw') {
      return {
        ok: false,
        code: 'exceeds-operation-limit',
        message: `数量必须小于 ${WITHDRAW_LIMIT_J} WJ（大额释放请用合约工具进行，慎重操作！）`,
      }
    }
    return {
      ok: false,
      code: 'exceeds-operation-limit',
      message: `数量必须不超过 ${TRANSFER_LIMIT_J} WJ`,
    }
  }

  const shouldCheckBalance = opts.checkBalance ?? true
  if (shouldCheckBalance && balanceWei !== null) {
    // 释放用严格小于（v1 `!(amt < wjBalance)`），转账用小于等于（v1 `!(amt <= wjBalance)`）
    const exceeds = op === 'withdraw' ? wei >= balanceWei : wei > balanceWei
    if (exceeds) {
      const sym = op === 'withdraw' ? '<' : '≤'
      return {
        ok: false,
        code: 'exceeds-balance',
        message: `数量 ${raw} 不能${op === 'withdraw' ? '达到或超过' : '超过'}持有量（需 ${sym} ${formatEther(balanceWei)} WJ）`,
      }
    }
  }

  return { ok: true, wei, amountJ: raw }
}
