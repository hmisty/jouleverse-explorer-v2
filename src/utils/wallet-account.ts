// 钱包账户与 wagmi state 的一致性校正（2026-11-27 签到 4100 故障的根因修复）
//
// 故障现象：桌面 MetaMask 刷新页面后点「签到」，钱包不弹签名框，直接报
//   The requested method and/or account has not been authorized by the user.
//   即 EIP-1193 **4100 UnauthorizedProvider**。点「断开」再「连接钱包」后同一操作成功。
//
// 根因：两处「账户」来源会分叉
//   ① 界面校验（CoreIdCheckIn 的「当前地址 == 页面地址」）用 store.address
//   ② 写操作的 from 用 **wagmi state**（config.state.connections[uid].accounts）
// 而 stores/wallet 的兜底路径曾用 `connect()` 去补写 state：本会话已连过时该 action
// 按设计抛 ConnectorAlreadyConnectedError → 被 catch 吞掉 → state 保留**旧账户**。
// 于是界面拿新账户过校验、交易却用旧账户签名，钱包判定该账户未被授权 → 4100，且不弹窗。
//
// 修复原则：不再用 connect() 去「改写」已存在的连接（它必然拒绝），
// 而是直接改写 state 里的账户字段；仅在**尚未建立连接**时才走 connect()。

import { connect as wagmiConnect } from '@wagmi/core'
import type { Config } from '@wagmi/core'
import type { Address } from 'viem'

/** 两个账户地址是否视为「不同」（大小写不敏感；任一为空视为不同）。 */
export function accountChanged(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return true
  return a.toLowerCase() !== b.toLowerCase()
}

/**
 * 把 wagmi state 里 current 连接的账户校正为钱包真实账户。
 * 纯 state 改写，不弹窗、不发交易、不触发 connect。
 *
 * @returns 是否发生了校正
 */
export function correctStateAccount<C extends Config>(config: C, walletAccount: Address): boolean {
  const { current, connections } = config.state
  if (!current) return false
  const connection = connections.get(current)
  if (!connection) return false
  if (!accountChanged(connection.accounts[0], walletAccount)) return false
  config.setState((x) => ({
    ...x,
    connections: new Map(x.connections).set(current, {
      ...connection,
      accounts: [walletAccount],
    }),
  }))
  return true
}

/**
 * 读取钱包侧真实账户并与 wagmi state 对齐。
 *
 * - 已存在连接 → 就地校正账户（`correctStateAccount`）
 * - 尚无连接（刷新后兜底路径）→ 走 connect action 正式写入 state，已授权时静默
 *
 * @returns 钱包侧账户；钱包未连接/无账户时返回 null
 */
export async function syncWalletAccount<C extends Config>(
  config: C,
  chainId: number,
): Promise<Address | null> {
  const connector = config.connectors[0]
  if (!connector) return null
  const accounts = await connector.getAccounts().catch(() => [])
  if (accounts.length === 0) return null
  const walletAccount = accounts[0]
  if (!correctStateAccount(config, walletAccount)) {
    // 未校正有两种情况：账户本就一致（无需处理），或 state 里没有 current 连接（需补写）
    if (!config.state.current) {
      await wagmiConnect(config, { connector, chainId } as never).catch(() => {})
    }
  }
  return walletAccount
}
