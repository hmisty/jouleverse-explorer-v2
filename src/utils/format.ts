import { formatUnits } from 'viem'

export function formatAge(timestamp: number | bigint): string {
  const ts = typeof timestamp === 'bigint' ? Number(timestamp) : timestamp
  const diff = Math.floor((Date.now() - ts * 1000) / 1000)
  if (diff < 60) return `${diff} 秒前`
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`
  return `${Math.floor(diff / 86400)} 天前`
}

export function formatNumber(num: bigint): string {
  return formatUnits(num, 0)
}

export function formatAddress(addr: string): string {
  if (!addr) return ''
  return `${addr.substring(0, 10)}...${addr.substring(addr.length - 8)}`
}
