import { formatUnits } from 'viem'

/**
 * Jouleverse 能量口径（v1 对等）
 *
 * v1 `app/scripts/controllers/mainController.js:43-52` 的三值映射：
 *   released  → total energy（总释放量）
 *   available → reserved energy（仍在时间锁中）
 *   used      → free energy（已进入流通）
 *
 * 链上恒等式：released = used + available（core 与 eco 各自成立，见
 * `scripts/smoke-energy.mjs` 的真实 RPC 校验）。因此三分法不是「三种独立
 * 统计口径」，而是同一笔释放量的三种状态划分——这也是 v2 原先的
 * Timelock 面板（月度预算/已使用/已释放/可用余额）无法与之对等的原因：
 * 那张表混入了 MONTHLY_BUDGET 这个「速率」字段，且没有把 core+eco 合并。
 *
 * ⚠️ 不要在此处做「四舍五入到 M」之后再相加。v1 是先把 wei 累加、再除
 * 10^6 取 M，若先各自取整再相加会出现最多 1M 的偏差。本实现保持
 * 「先累加 bigint，最后一次格式化」的顺序。
 */

export interface TimelockTriple {
  /** 已进入流通（v1: free energy） */
  used: bigint
  /** 总释放量（v1: total energy） */
  released: bigint
  /** 仍在时间锁中（v1: reserved energy） */
  available: bigint
}

export interface EnergyBreakdown {
  /** 总释放量 = core.released + eco.released */
  total: bigint
  /** 流通能量 = core.used + eco.used */
  free: bigint
  /** 锁定能量 = core.available + eco.available */
  reserved: bigint
  /** 锁定能量中的核心部分 */
  reservedCore: bigint
  /** 锁定能量中的生态部分 */
  reservedEco: bigint
}

/**
 * 把 core / eco 两份 Timelock 读数合并成 v1 的 five-value 口径。
 *
 * 纯函数：不读 RPC、不碰 DOM、不依赖时间，可用 bigint 字面量直接断言。
 */
export function mergeEnergy(core: TimelockTriple, eco: TimelockTriple): EnergyBreakdown {
  return {
    total: core.released + eco.released,
    free: core.used + eco.used,
    reserved: core.available + eco.available,
    reservedCore: core.available,
    reservedEco: eco.available,
  }
}

/**
 * 恒等式校验：released 必须等于 used + available。
 *
 * core 与 eco 两个 Timelock 实例各自独立成立。返回不成立的实例名单，
 * 供 UI 在链上数据异常时降级提示，而不是继续展示一组自相矛盾的数字。
 * 空数组表示两个实例都自洽。
 */
export function checkEnergyInvariant(
  core: TimelockTriple,
  eco: TimelockTriple,
): Array<'core' | 'eco'> {
  const broken: Array<'core' | 'eco'> = []
  if (core.released !== core.used + core.available) broken.push('core')
  if (eco.released !== eco.used + eco.available) broken.push('eco')
  return broken
}

/**
 * v1 的 M（百万）单位格式化：`(value / 10^6).toLocaleString() + "M"`。
 *
 * v1 `mainController.js:48-52` 对 5 个值统一套这个格式，故 0 也会显示成
 * "0M"（保留），不做特殊省略——对等优先于好看。
 */
export function formatEnergyM(value: bigint): string {
  const millions = Number(formatUnits(value, 18)) / 1e6
  return `${millions.toLocaleString('en-US', { maximumFractionDigits: 2 })}M`
}

/**
 * 单值读数的人性化格式（J / 万 J / 亿 J）。
 *
 * 与 M 口径并用：M 用于 v1 对等的四宫格，本函数用于需要更高精度的场合
 * （如 available 很小的时候，2.4e7 J 用 M 显示是 "24M"，看不出细节）。
 */
/** 保留两位小数，但裁掉无意义的尾零（29.40→29.4，2400.00→2400）。 */
function trimZeros(n: number): string {
  const s = n.toFixed(2)
  if (!s.includes('.')) return s
  return s.replace(/0+$/, '').replace(/\.$/, '')
}

export function formatEnergyJ(value: bigint): string {
  const v = Number(formatUnits(value, 18))
  if (v >= 1e8) return `${trimZeros(v / 1e8)} 亿 J`
  if (v >= 1e4) return `${trimZeros(v / 1e4)} 万 J`
  return `${trimZeros(v)} J`
}
