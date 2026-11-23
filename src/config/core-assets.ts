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
import iconPlanet from '../assets/icons/asset-planet.svg'
import iconFlyingj from '../assets/icons/asset-flyingj.svg'
import iconJnsdaov from '../assets/icons/asset-jnsdaov.svg'
import iconCryptojunks from '../assets/icons/asset-cryptojunks.svg'

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
    // ⚠️ 指向 JTI **V2**（0x7e72…），不是 V1（0x8269…）。
    // 判据：v1 地址页 `addressInfo.html:83` 显示的是 `countJTI2`（JTI(v2)），
    // V1 那行在同一文件里被 `<!-- -->` 注释掉了（L84）。此处曾误配 V1，
    // 导致「只持有 JTI v2」的地址在本面板显示 0 个 —— 已实测：v2 最新 3 个
    // 持有人的 V1 balanceOf 全为 0，而 V2 各为 1，两者持有人集合不同。
    key: 'jti',
    name: 'JTI 认证标识',
    symbol: 'JTI',
    kind: 'erc721',
    address: '0x7e722837Ff19BE2687c2089DBf70D064fB9622AE',
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
  {
    key: 'planet',
    name: 'Planet 星球',
    symbol: 'Planet',
    kind: 'erc721',
    address: '0x9c100856f5C60a3ec87Aa408567304DB2AfC241F',
    enumerable: true,
    icon: iconPlanet,
  },
  {
    key: 'flyingj',
    name: 'Flying J',
    symbol: 'FLYING-J',
    kind: 'erc721',
    address: '0x045B997B5E05DF9795985aB9e6720d94557255BE',
    enumerable: true,
    icon: iconFlyingj,
  },
  {
    key: 'jnsdaov',
    name: 'JNSDAO V',
    symbol: 'JNSDAO-V',
    kind: 'erc721',
    address: '0x9F57e77585E05CA7Def98f3171F448Fc8eb13A83',
    // ⚠️ 不能走 tokenOfOwnerByIndex 面板：JNSDAO V 的唯一查询入口是
    // `query(address) → tokenURI 字符串`，且**对无徽章地址直接 revert**
    // （实测 0x9c100856… 调用报 "Execution reverted"，不是返回空串）。
    // 故 enumerable=false，改由 query 面板处理 revert → 「未持有」。
    enumerable: false,
    icon: iconJnsdaov,
  },
  {
    key: 'cryptojunks',
    name: 'CryptoJunks',
    symbol: 'JUNK',
    kind: 'erc721',
    address: '0x1b1d15726d64c5027b627138f2bf051cc1EF2680',
    enumerable: true,
    icon: iconCryptojunks,
  },
] as const

/** 排序：native → erc20 → erc721（同类型内按余额/数量降序，由加载层排序） */
export const KIND_ORDER: Record<AssetKind, number> = {
  native: 0,
  erc20: 1,
  erc721: 2,
}
