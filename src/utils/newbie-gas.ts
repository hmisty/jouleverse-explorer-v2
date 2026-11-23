// 「新手加油」入口判定（P5-2 · v1 对等）
//
// v1 依据 `addressInfo.html:58-61` 的显示条件：
//   ng-style="{ display: allJTI2.length > 0 && balance == 0 && account ? 'inline-block' : 'none' }"
// 即三个条件同时成立才显示按钮：
//   ① 该地址持有 JTI(v2) 徽章   → allJTI2.length > 0
//   ② 该地址原生 J 余额为 0     → balance == 0
//   ③ 已连接钱包                → account（非空）
//
// 动作见 `addressInfoController.js:164-187`：withdrawTo(to=页面地址, 0.005)，
// 且刻意 `checkBalance=false`（注释原文 "don't check newbie's WJ balance"）——
// 给新手加油的人和被加油的人是两个不同地址，检查「页面地址」的 WJ 余额没有意义。
//
// ⚠️ 判据必须是「恰好等于 0」而不是「小于阈值」：v1 是 `balance == 0`。
// 改成 `< 0.005 J` 会改变产品语义（一个还有 0.001 J 的老用户会被判定为需要加油），
// 属于「顺手放宽」，对等移植不允许。
//
// ⚠️ 余额读取失败（null）绝不等于 0：把两者混同会在 RPC 抖动时给一个余额充足的
// 地址显示「新手加油」，并且真的转出 0.005 J（不可逆）。失败即不显示。

/** 新手加油金额（固定 0.005 J，v1 硬编码 amt='0.005'） */
export const NEWBIE_GAS_AMOUNT_J = '0.005'

export interface NewbieGasInputs {
  /** 页面地址的原生 J 余额（wei）；读取失败传 null */
  nativeBalance: bigint | null
  /** 页面地址持有的 JTI(v2) 数量；读取失败传 null */
  jtiBalance: bigint | null
  /** 当前连接的钱包地址；未连接传 null/空串 */
  connectedAccount: string | null | undefined
}

export interface NewbieGasDecision {
  /** 是否显示「新手加油」按钮 */
  show: boolean
  /** 不显示的原因（便于界面给提示 / 测试断言；show=true 时为 null） */
  reason: 'not-connected' | 'balance-unknown' | 'jti-unknown' | 'not-newbie' | 'no-jti' | null
}

/**
 * 判定是否显示「新手加油」。
 *
 * 顺序按「越基础的条件越先判」：未连接 → 余额未知 → JTI 未知 → 余额非零 → 无 JTI。
 * 这样报出来的 reason 是最外层那个，用户看到的提示不会被更细的条件盖住。
 */
export function decideNewbieGas(inputs: NewbieGasInputs): NewbieGasDecision {
  const { nativeBalance, jtiBalance, connectedAccount } = inputs

  if (!connectedAccount) return { show: false, reason: 'not-connected' }
  // 失败 ≠ 零：余额读不到就不显示，避免对余额充足的地址转出 0.005 J
  if (nativeBalance === null) return { show: false, reason: 'balance-unknown' }
  if (jtiBalance === null) return { show: false, reason: 'jti-unknown' }
  if (nativeBalance !== 0n) return { show: false, reason: 'not-newbie' }
  if (jtiBalance === 0n) return { show: false, reason: 'no-jti' }
  return { show: true, reason: null }
}
