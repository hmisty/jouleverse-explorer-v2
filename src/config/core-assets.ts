// 生态核心资产目录（M1：配置文件驱动，组件只消费本配置、不关心来源）
// 依据 issue #21 确认的技术组合：首批仅官方 6 合约 + 原生 J
// 新增资产 = 加一条配置，不改组件代码；M2 迁 GitHub 注册表时只换加载层，UI 零改动

// 官方资产图标（仓库内本地 SVG，24×24、fill=currentColor 自适应暗色）
import iconJ from '../assets/icons/asset-j.svg'
import iconWj from '../assets/icons/asset-wj.svg'
import iconJns from '../assets/icons/asset-jns.svg'
import iconPopbadge from '../assets/icons/asset-popbadge.svg'
import iconCoreid from '../assets/icons/asset-coreid.svg'
import iconJti from '../assets/icons/asset-jti.svg'
import iconJnsvote from '../assets/icons/asset-jnsvote.svg'

export type AssetKind = 'native' | 'erc20' | 'erc721'

export interface CoreAsset {
  /** 唯一 key，加载层结果映射用 */
  key: string
  /** 展示名 */
  name: string
  /** 符号/简称 */
  symbol: string
  /** 资产类型：原生币 / ERC20 / NFT */
  kind: AssetKind
  /** 合约地址（native 为 null） */
  address: `0x${string}` | null
  /** 仓库内本地图标（SVG URL） */
  icon: string
  /** ERC20 精度（native/erc721 无意义） */
  decimals?: number
  /** 可枚举 NFT：支持 tokenOfOwnerByIndex 二级懒加载（展开才枚举） */
  enumerable?: boolean
}

export const CORE_ASSETS: CoreAsset[] = [
  {
    key: 'j',
    name: 'Joule',
    symbol: 'J',
    kind: 'native',
    address: null,
    icon: iconJ,
    decimals: 18,
  },
  {
    key: 'wj',
    name: 'Wrapped Joule',
    symbol: 'WJ',
    kind: 'erc20',
    address: '0x7fba9BB966189Db8C4fE33B7bf67Bfa24203c6AD',
    icon: iconWj,
    decimals: 18,
  },
  {
    key: 'jns',
    name: 'JNS 域名',
    symbol: 'JNS',
    kind: 'erc721',
    address: '0xf8AbF36Bb2dc525b1E566d6B42F6Fd1BB2035b89',
    icon: iconJns,
  },
  {
    key: 'popbadge',
    name: 'POP 签到徽章',
    symbol: 'POP',
    kind: 'erc721',
    address: '0xCb1429da13cE40e75519148e796C6D58dD6b1a8E',
    enumerable: true,
    icon: iconPopbadge,
  },
  {
    key: 'coreid',
    name: 'Core ID',
    symbol: 'JVC',
    kind: 'erc721',
    address: '0x8d214415b9c5F5E4Cf4CbCfb4a5DEd47fb516392',
    icon: iconCoreid,
  },
  {
    key: 'jti',
    name: 'JTI 认证标识',
    symbol: 'JTI',
    kind: 'erc721',
    address: '0x826971d988d7d86Fdc9062A3f63E7b18D32Bc8EB',
    enumerable: true,
    icon: iconJti,
  },
  {
    key: 'jnsvote',
    name: 'JNSVote 投票徽章',
    symbol: 'JNSVote',
    kind: 'erc721',
    address: '0xEf1f38e95dd7F4FB564535F9317ecB3Bd419DA50',
    enumerable: true,
    icon: iconJnsvote,
  },
] as const

/** 排序：native → erc20 → erc721（同类型内按余额/数量降序，由加载层排序） */
export const KIND_ORDER: Record<AssetKind, number> = {
  native: 0,
  erc20: 1,
  erc721: 2,
}
