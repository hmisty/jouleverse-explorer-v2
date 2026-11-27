// 账户一致性校正的纯逻辑单测（2026-11-27 签到 4100 故障根因）
//
// 故障链：界面用 store.address 校验、写操作 from 取自 wagmi state，
// 二者分叉时钱包报 4100 且不弹签名框。这里锁住「校正」本身的行为：
// 账户不同必须改写 state、账户相同必须不动、无 current 连接不得静默假装成功。
import { describe, it, expect } from 'vitest'
import { createConfig, createStorage, createConnector } from '@wagmi/core'
import { http } from 'viem'
import { accountChanged, correctStateAccount, syncWalletAccount } from '../src/utils/wallet-account'

const chain = {
  id: 3666,
  name: 'Jouleverse',
  nativeCurrency: { name: 'J', symbol: 'J', decimals: 18 },
  rpcUrls: { default: { http: ['http://localhost:1'] } },
} as const

const A = '0x1111111111111111111111111111111111111111' as const
const B = '0x2222222222222222222222222222222222222222' as const

/** 构造一个「钱包侧账户可任意指定」的假 connector 与 wagmi config。 */
function makeConfig(initialWalletAccount: readonly `0x${string}`[]) {
  const wallet = { accounts: initialWalletAccount }
  const connectorFn = createConnector(() => ({
    id: 'probe',
    name: 'Probe',
    type: 'probe',
    async connect() {
      // 测试替身：connector 的 connect 在 withCapabilities=true 时返回对象数组，
      // 这里只关心账户本身，统一按 tuple 返回（类型细节与本次修复无关）
      return { accounts: wallet.accounts, chainId: chain.id } as never
    },
    async disconnect() {},
    async getAccounts() {
      return wallet.accounts
    },
    async getChainId() {
      return chain.id
    },
    async getProvider() {
      return {} as never
    },
    async isAuthorized() {
      return wallet.accounts.length > 0
    },
    onAccountsChanged() {},
    onChainChanged() {},
    onDisconnect() {},
  }))
  const config = createConfig({
    chains: [chain],
    connectors: [connectorFn],
    storage: createStorage({
      storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    }),
    transports: { [chain.id]: http('http://localhost:1') },
  })
  return { config, wallet }
}

/** 手工把「已连接账户」写进 state，模拟「本会话已连过」的场景。 */
function primeConnection(config: ReturnType<typeof makeConfig>['config'], account: `0x${string}`) {
  const connector = config.connectors[0]
  config.setState((x) => ({
    ...x,
    connections: new Map(x.connections).set(connector.uid, {
      accounts: [account],
      chainId: chain.id,
      connector,
    }),
    current: connector.uid,
    status: 'connected',
  }))
}

describe('accountChanged', () => {
  it('大小写不同视为同一账户', () => {
    expect(accountChanged(A, A.toUpperCase().replace('0X', '0x'))).toBe(false)
  })

  it('不同账户判定为变化', () => {
    expect(accountChanged(A, B)).toBe(true)
  })

  it('任一为空视为变化（不假定相等）', () => {
    expect(accountChanged(null, A)).toBe(true)
    expect(accountChanged(A, null)).toBe(true)
    expect(accountChanged(undefined, undefined)).toBe(true)
  })
})

describe('correctStateAccount：就地校正 state 账户', () => {
  it('state 里是旧账户 → 改写为钱包真实账户', () => {
    const { config } = makeConfig([B])
    primeConnection(config, A)
    expect(config.state.connections.get(config.state.current!)?.accounts[0]).toBe(A)

    expect(correctStateAccount(config, B)).toBe(true)
    expect(config.state.connections.get(config.state.current!)?.accounts[0]).toBe(B)
  })

  it('账户本就一致 → 不改写，返回 false（避免无意义 setState 触发订阅）', () => {
    const { config } = makeConfig([A])
    primeConnection(config, A)
    expect(correctStateAccount(config, A)).toBe(false)
    expect(config.state.connections.get(config.state.current!)?.accounts[0]).toBe(A)
  })

  it('大小写不同但同账户 → 不改写', () => {
    const { config } = makeConfig([A])
    primeConnection(config, A.toLowerCase() as `0x${string}`)
    expect(correctStateAccount(config, A)).toBe(false)
  })

  it('无 current 连接 → 返回 false 且不凭空造连接', () => {
    const { config } = makeConfig([A])
    expect(config.state.current).toBeNull()
    expect(correctStateAccount(config, A)).toBe(false)
    expect(config.state.connections.size).toBe(0)
  })

  it('校正后不影响 chainId 与 status', () => {
    const { config } = makeConfig([B])
    primeConnection(config, A)
    correctStateAccount(config, B)
    expect(config.state.chainId).toBe(chain.id)
    expect(config.state.status).toBe('connected')
  })
})

describe('syncWalletAccount：读钱包 + 对齐 state', () => {
  it('已连接且账户已变 → state 跟上钱包', async () => {
    const { config, wallet } = makeConfig([A])
    primeConnection(config, A)
    wallet.accounts = [B]

    const account = await syncWalletAccount(config, chain.id)
    expect(account).toBe(B)
    expect(config.state.connections.get(config.state.current!)?.accounts[0]).toBe(B)
  })

  it('钱包无账户 → 返回 null，不把 state 清成垃圾', async () => {
    const { config, wallet } = makeConfig([A])
    primeConnection(config, A)
    wallet.accounts = []

    expect(await syncWalletAccount(config, chain.id)).toBeNull()
    expect(config.state.connections.get(config.state.current!)?.accounts[0]).toBe(A)
  })

  it('尚无连接 → 走 connect 写入 state（不抛错）', async () => {
    const { config } = makeConfig([A])
    expect(config.state.current).toBeNull()

    const account = await syncWalletAccount(config, chain.id)
    expect(account).toBe(A)
    expect(config.state.current).not.toBeNull()
    expect(config.state.connections.get(config.state.current!)?.accounts[0]).toBe(A)
  })

  it('钱包拒绝 getAccounts（抛错）→ 返回 null 而不是崩', async () => {
    const { config } = makeConfig([A])
    const connector = config.connectors[0]
    connector.getAccounts = async () => {
      throw new Error('provider unavailable')
    }
    expect(await syncWalletAccount(config, chain.id)).toBeNull()
  })
})
