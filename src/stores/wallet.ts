import { defineStore } from 'pinia'
import { ref } from 'vue'
import { createConfig, http } from 'wagmi'
import { metaMask } from 'wagmi/connectors'
import { getPublicClient, reconnect } from '@wagmi/core'

// Jouleverse chain config
const jouleverse = {
  id: 3666,
  name: 'Jouleverse',
  nativeCurrency: {
    name: 'Joule',
    symbol: 'J',
    decimals: 18,
  },
  rpcUrls: {
    default: { http: ['https://rpc.jnsdao.com:8503'] },
  },
  blockExplorers: {
    default: { name: 'JScan', url: 'https://jscan.jnsdao.com' },
  },
} as const

// Wagmi config
export const config = createConfig({
  chains: [jouleverse],
  connectors: [metaMask()], // MetaMask
  transports: {
    [jouleverse.id]: http('https://rpc.jnsdao.com:8503'),
  },
})

export const useWalletStore = defineStore('wallet', () => {
  const isConnected = ref(false)
  const address = ref<string | null>(null)
  const balance = ref<bigint | null>(null)
  const wjBalance = ref<bigint | null>(null)
  const isConnecting = ref(false)

  // 检查是否连接
  const checkConnection = async () => {
    try {
      const connector = config.connectors[0]
      if (!connector) {
        isConnected.value = false
        return
      }

      // 尝试获取当前连接的账户
      const accounts = await connector.getAccounts()
      if (accounts && accounts.length > 0) {
        address.value = accounts[0]
        isConnected.value = true
        await getBalance()
      } else {
        isConnected.value = false
        address.value = null
      }
    } catch (error) {
      console.error('Failed to check connection:', error)
      isConnected.value = false
      address.value = null
    }
  }

  // 等待钱包 provider 注入就绪（刷新页面后 MetaMask 扩展注入有延迟）
  // 最长等待 5s，轮询检查 window.ethereum
  const waitForProvider = (timeoutMs = 5000): Promise<boolean> =>
    new Promise((resolve) => {
      const win = window as unknown as { ethereum?: unknown }
      const start = Date.now()
      const timer = setInterval(() => {
        if (win.ethereum) {
          clearInterval(timer)
          resolve(true)
        } else if (Date.now() - start > timeoutMs) {
          clearInterval(timer)
          resolve(false)
        }
      }, 200)
    })

  // 恢复已连接状态（页面刷新后调用）：
  // 1. 等待 provider 就绪（避免扩展注入延迟导致误判未连接）
  // 2. 用 wagmi 官方 reconnect 静默恢复已授权连接（不弹窗）
  // 3. 兜底走 checkConnection
  const restoreConnection = async () => {
    try {
      const ready = await waitForProvider()
      if (!ready) {
        // 5s 内 provider 未就绪（如未安装钱包扩展），保持未连接状态
        return
      }
      const result = await reconnect(config)
      const conn = result[0]
      if (conn) {
        address.value = conn.accounts[0]
        isConnected.value = true
        await getBalance()
        await getWJBalance()
      } else {
        await checkConnection()
      }
    } catch (error) {
      console.error('Failed to restore connection:', error)
      await checkConnection()
    }
  }

  // 连接钱包
  const connect = async () => {
    if (isConnecting.value) return

    isConnecting.value = true
    try {
      const connector = config.connectors[0]
      if (!connector) {
        throw new Error('MetaMask connector not found')
      }

      const result = await connector.connect()
      if (result && result.accounts && result.accounts.length > 0) {
        address.value = result.accounts[0]
        isConnected.value = true
        await getBalance()
        await getWJBalance()
      }
    } catch (error) {
      console.error('Failed to connect wallet:', error)
      isConnected.value = false
      address.value = null
      throw error
    } finally {
      isConnecting.value = false
    }
  }

  // 断开连接
  const disconnect = async () => {
    try {
      const connector = config.connectors[0]
      if (!connector) return

      await connector.disconnect()
      address.value = null
      isConnected.value = false
      balance.value = null
      wjBalance.value = null
    } catch (error) {
      console.error('Failed to disconnect wallet:', error)
    }
  }

  // 获取 J 余额
  const getBalance = async () => {
    if (!address.value) return

    try {
      const client = getPublicClient(config)
      const balanceData = await client.getBalance({
        address: address.value as `0x${string}`,
      })
      balance.value = balanceData
    } catch (error) {
      console.error('Failed to get balance:', error)
    }
  }

  // 获取 WJ 余额
  const getWJBalance = async () => {
    if (!address.value) return

    try {
      const client = getPublicClient(config)
      
      // WJ 合约 ABI（简化版）
      const wjABI = [
        {
          inputs: [{ name: '', type: 'address' }],
          name: 'balanceOf',
          outputs: [{ name: '', type: 'uint256' }],
          stateMutability: 'view',
          type: 'function',
        },
      ] as const

      const wjAddress = '0x7fba9BB966189Db8C4fE33B7bf67Bfa24203c6AD' as const

      const balanceData = await client.readContract({
        address: wjAddress,
        abi: wjABI,
        functionName: 'balanceOf',
        args: [address.value as `0x${string}`],
      })

      wjBalance.value = balanceData as bigint
    } catch (error) {
      console.error('Failed to get WJ balance:', error)
    }
  }

  // 刷新所有余额
  const refreshBalances = async () => {
    await Promise.all([
      getBalance(),
      getWJBalance(),
    ])
  }

  // 格式化地址
  const formatAddress = (addr: string | null): string => {
    if (!addr) return ''
    return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`
  }

  // 格式化余额
  const formatBalance = (bal: bigint | null): string => {
    if (bal === null || bal === 0n) return '0'
    return (Number(bal) / 1e18).toFixed(4)
  }

  return {
    isConnected,
    address,
    balance,
    wjBalance,
    isConnecting,
    connect,
    disconnect,
    getBalance,
    getWJBalance,
    refreshBalances,
    checkConnection,
    restoreConnection,
    formatAddress,
    formatBalance,
  }
})
