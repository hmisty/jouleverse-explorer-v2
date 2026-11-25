#!/usr/bin/env node
/**
 * 从 v1 源码仓库生成 CryptoJunks 的静态参照表（P5-4）。
 *
 * v1 的参照表在 `app/scripts/misc/punks/golden_idx.json`，是「10000 枚全部铭刻完成、
 * set in stone」之后冻结的快照。`punks/{page}.json`（每页 base64 像素图）已废弃，
 * v1 代码里对应分支被注释掉并标注 DONOT DELETE，仅保留作历史参照。本脚本只取
 * `golden_idx.json`。
 *
 * 为什么不直接 fetch v1 的 JSON：v2 是纯静态站，且 v1 将来会下线（P5-8 切换后 302），
 * 依赖 v1 域名会让本页跟着一起坏。所以把参照表编译进产物。
 *
 * 生成物 `src/data/crypto-junks-golden.ts` 需提交进仓库（构建不依赖 v1 仓库存在）。
 *
 * 用法：
 *   node scripts/gen-cryptojunks-golden.mjs [v1仓库路径]
 *   默认猜测 ~/git/explorer
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const v1Root = process.argv[2] || join(homedir(), 'git', 'explorer')
const srcPath = join(v1Root, 'app', 'scripts', 'misc', 'punks', 'golden_idx.json')

const raw = JSON.parse(readFileSync(srcPath, 'utf8'))

const need = ['golden', 'alien', 'ape', 'zombie', 'broken']
for (const k of need) {
  if (!Array.isArray(raw[k])) throw new Error(`参照表缺少字段 ${k}`)
}

// 完整性自检：这些数字是 v1 页面上写死的统计表，改了就说明参照表换了版本，
// 必须人工复核后再更新，不能让生成脚本静默漂移。
const expect = { golden: 10000, alien: 9, ape: 24, zombie: 88, broken: 299 }
for (const [k, n] of Object.entries(expect)) {
  if (raw[k].length !== n) {
    throw new Error(`字段 ${k} 长度 ${raw[k].length} ≠ 预期 ${n}，参照表可能已变更`)
  }
}
if (raw.golden.some((v) => v !== 0 && v !== 1)) {
  throw new Error('golden 数组只允许 0/1')
}
const goldenOnes = raw.golden.filter((v) => v === 1).length
if (goldenOnes !== 9701) {
  throw new Error(`golden=1 的枚数 ${goldenOnes} ≠ 预期 9701（= 10000 - 299 broken）`)
}

const num = (a) => `[${a.join(',')}]`

const out = `// 本文件由 scripts/gen-cryptojunks-golden.mjs 生成，请勿手改。
//
// 来源：v1 \`app/scripts/misc/punks/golden_idx.json\`
//       （CryptoJunks 10000 枚全部铭刻、set in stone 之后冻结的快照）
// 生成时间：${new Date().toISOString()}
//
// 字段含义（与 v1 junksInfoController.js 的对应关系）：
//   golden  —— 长度 10000 的 0/1 数组，1 = good（金标），0 = broken（灰标）
//   alien   —— legend 👑 的 tokenId 列表
//   ape     —— rare 💎 的 tokenId 列表
//   zombie  —— precious 🌟 的 tokenId 列表
//   broken  —— 全部 299 枚 broken 的 tokenId 列表（升序，供 /page/1000-1002 使用）
//
// ⚠️ v1 的命名与页面文案是反的直觉的：alien 对应「legend」、ape 对应「rare」、
//    zombie 对应「precious」。这三组是 CryptoPunks 风格的物种稀有度，不是健康度。
//    真正的「金标/灰标」是 golden 字段，与稀有度正交。

export const CRYPTOJUNKS_SUPPLY_LIMIT = 10000

/** 0/1 数组，长度 10000。1 = good/金标，0 = broken/灰标 */
export const GOLDEN: readonly number[] = ${num(raw.golden)}

/** legend 👑 */
export const LEGEND_IDS: readonly number[] = ${num(raw.alien)}

/** rare 💎 */
export const RARE_IDS: readonly number[] = ${num(raw.ape)}

/** precious 🌟 */
export const PRECIOUS_IDS: readonly number[] = ${num(raw.zombie)}

/** 299 枚 broken 的 tokenId（升序） */
export const BROKEN_IDS: readonly number[] = ${num(raw.broken)}
`

const outDir = join(repoRoot, 'src', 'data')
mkdirSync(outDir, { recursive: true })
const outPath = join(outDir, 'crypto-junks-golden.ts')
writeFileSync(outPath, out)
console.log(`✅ 已生成 ${outPath}`)
console.log(`   golden=1: ${goldenOnes} / broken: ${raw.broken.length} / legend: ${raw.alien.length} / rare: ${raw.ape.length} / precious: ${raw.zombie.length}`)
