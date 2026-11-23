// CryptoJunks 参照表加载：public/reference/punks/golden_idx.json
//
// 为什么放在 public/ 而不是 import 进 bundle：这份表 22KB、只在「该地址持有 CryptoJunks
// 且用户点开墙」时才需要。打进 bundle 会让所有访问者为一个多数人用不到的功能付流量
// （同 v1 的做法：`$.get('scripts/misc/punks/golden_idx.json')` 运行时拉）。
//
// ⚠️ 加载失败不等于「没有金标」：返回 null，调用方据此显示「参照表未加载」提示，
// 而不是把 10000 枚全部渲染成灰标普通款（那正是 v1 的降级行为，用户看不出来）。

import type { JunkReference } from './cryptojunks'
import { parseJunkReference } from './cryptojunks'

/** 参照表路径（相对站点根，public 目录直出） */
export const JUNK_REFERENCE_URL = '/reference/punks/golden_idx.json'

let cached: JunkReference | null = null
let inFlight: Promise<JunkReference | null> | null = null

/**
 * 拉取参照表（进程内缓存；并发的多次调用共用同一次请求）。
 * @returns 解析成功返回表；HTTP 非 2xx / JSON 坏 / 形状不对返回 null（不抛）
 */
export async function loadJunkReference(): Promise<JunkReference | null> {
  if (cached) return cached
  if (inFlight) return inFlight

  inFlight = (async () => {
    try {
      const res = await fetch(JUNK_REFERENCE_URL)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const ref = parseJunkReference(await res.json())
      if (!ref) throw new Error('参照表结构不符合预期')
      cached = ref
      return ref
    } catch (e) {
      console.warn('[cryptojunks] 参照表加载失败，金标/稀有度标记将不显示:', e)
      return null
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

/** 仅供测试：清空缓存 */
export function __resetJunkReferenceCache(): void {
  cached = null
  inFlight = null
}
