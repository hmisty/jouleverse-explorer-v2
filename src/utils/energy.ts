/**
 * Jouleverse 能量口径
 *
 * ## 语义（来自 v1，必须对等）
 *
 * v1 `app/scripts/controllers/mainController.js:43-52` 的三值映射：
 *   released  → total energy（总释放量）
 *   available → reserved energy（仍在时间锁中）
 *   used      → free energy（已进入流通）
 *
 * 链上恒等式：released = used + available（core 与 eco 各自独立成立，见
 * `scripts/smoke-energy.mjs` 的真实 RPC 校验）。因此三分法不是「三种独立
 * 统计口径」，而是同一笔释放量的三种状态划分。
 *
 * ## 呈现（以 v2 设计系统为准，不从 v1 回退）
 *
 * v1 首页把 5 个值拍平成两张小卡，且数值统一套 `(x/1e6) + "M"`，实际渲染
 * 形如 `636M J`——M 与 J 并存，单位重复；同时 24,000,000 J 会被压成 `24M`，
 * 丢掉可读精度。**这是 v1 的历史将就，不是对等目标。**
 *
 * 本模块只负责「算对 + 给定语义标签」，格式化交给设计系统
 * （`JvAmount`：千分位 + 截断小数 + 单一单位后缀）。此处不提供 M 口径。
 *
 * ⚠️ 不要做「四舍五入到某个单位」之后再相加。这里是先把 wei 累加
 * （bigint），格式化只在最外层发生一次，避免分步取整误差。
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
 * 把 core / eco 两份 Timelock 读数合并成全网五值口径。
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
