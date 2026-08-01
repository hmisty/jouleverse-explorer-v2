<template>
  <div class="tools-home">
    <div class="tools-header">
      <h1>🧰 工具集</h1>
      <p class="tools-subtitle">Jouleverse 生态实用工具 —— 合约交互、空投管理、链上功能</p>
    </div>

    <section v-for="cat in categories" :key="cat.title" class="tools-category">
      <h2 class="category-title">
        <span class="category-icon">{{ cat.icon }}</span>
        {{ cat.title }}
      </h2>
      <div class="tools-grid">
        <component
          :is="tool.route ? 'router-link' : tool.link ? 'a' : 'div'"
          v-for="tool in cat.tools"
          :key="tool.title"
          :to="tool.route"
          :href="tool.link"
          :target="tool.link ? '_blank' : undefined"
          :rel="tool.link ? 'noopener' : undefined"
          :class="['tool-card', { 'is-disabled': !tool.link && !tool.route }]"
        >
          <div class="tool-card-header">
            <h3 class="tool-card-title">
              <span class="tool-icon">{{ tool.icon }}</span>
              {{ tool.title }}
            </h3>
            <span :class="['tool-status', `status-${tool.statusType}`]">{{ tool.status }}</span>
          </div>
          <p class="tool-desc">{{ tool.desc }}</p>
          <div class="tool-card-footer">
            <span v-if="tool.route" class="tool-link">进入 →</span>
            <span v-else-if="tool.link" class="tool-link">打开工具 ↗</span>
            <span v-else class="tool-link muted">即将推出</span>
          </div>
        </component>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
interface ToolItem {
  title: string
  icon: string
  desc: string
  /** V2 内页路由 */
  route?: string
  /** V1 外链地址 */
  link?: string
  status: string
  statusType: 'migrated' | 'pending' | 'planned'
}

interface ToolCategory {
  title: string
  icon: string
  tools: ToolItem[]
}

const categories: ToolCategory[] = [
  {
    title: '合约工具',
    icon: '🧊',
    tools: [
      {
        title: '核心合约交互工具集',
        icon: '⚙️',
        desc: '与 Jouleverse 核心合约交互：合约部署、函数调用、事件查询（V1 版本，待迁移至 V2）',
        link: 'https://jscan.jnsdao.com/tools/core/index.html',
        status: 'V1 待迁移',
        statusType: 'pending',
      },
      {
        title: '其他合约交互工具集',
        icon: '🔗',
        desc: '与 Jouleverse 生态其他智能合约交互，支持自定义 ABI（V1 版本，待迁移至 V2）',
        link: 'https://jscan.jnsdao.com/tools/contractx/index.html',
        status: 'V1 待迁移',
        statusType: 'pending',
      },
    ],
  },
  {
    title: '空投管理工具',
    icon: '🎁',
    tools: [
      {
        title: '默克尔证明生成器',
        icon: '🌳',
        desc: '为 Core 空投生成默克尔证明，验证空投资格并生成链上可验证的证明文件（V1 版本，待迁移）',
        link: 'https://jscan.jnsdao.com/tools/airdrop/merkle-proof-generator.html',
        status: 'V1 待迁移',
        statusType: 'pending',
      },
    ],
  },
  {
    title: '链上功能',
    icon: '⛓️',
    tools: [
      {
        title: 'JNS 域名查询',
        icon: '🌐',
        desc: 'JNS 域名信息查询、记录展示与域名操作（绑定/解绑/发送 J）',
        route: '/jns',
        status: '已迁移',
        statusType: 'migrated',
      },
      {
        title: 'Core ID 签到统计',
        icon: '📅',
        desc: '全网 Core ID 按月签到统计，支持月份导航与完整性校验',
        route: '/core/checkin',
        status: '已迁移',
        statusType: 'migrated',
      },
    ],
  },
  {
    title: '即将推出',
    icon: '⏳',
    tools: [
      {
        title: 'JNSVote 治理投票',
        icon: '🗳️',
        desc: 'JNSVote 治理投票模块：资格验证、投票列表、投票操作（规划中，P3-1）',
        status: '规划中',
        statusType: 'planned',
      },
      {
        title: '数据分析面板',
        icon: '📊',
        desc: 'Jouleverse 链上数据可视化：交易量、地址增长、合约活动等关键指标',
        status: '规划中',
        statusType: 'planned',
      },
      {
        title: '多签钱包管理',
        icon: '🔐',
        desc: '多签钱包创建、管理与交易签名工具',
        status: '规划中',
        statusType: 'planned',
      },
    ],
  },
]
</script>

<style scoped>
.tools-home {
  max-width: 1100px;
  margin: 0 auto;
  padding: 28px 24px;
}

.tools-header {
  margin-bottom: 32px;
}

.tools-header h1 {
  margin: 0 0 8px 0;
  font-size: 1.9rem;
  font-weight: 700;
  color: var(--jv-text-primary);
}

.tools-subtitle {
  margin: 0;
  font-size: 0.95rem;
  color: var(--jv-text-secondary);
}

.tools-category {
  margin-bottom: 36px;
}

.category-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 1.15rem;
  font-weight: 600;
  color: var(--jv-text-primary);
  margin: 0 0 16px 0;
  padding-bottom: 10px;
  border-bottom: 2px solid var(--jv-brand-subtle);
}

.category-icon {
  font-size: 1.1rem;
}

.tools-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 18px;
}

.tool-card {
  display: flex;
  flex-direction: column;
  background: var(--jv-bg-surface);
  border: 1px solid var(--jv-border);
  border-radius: var(--jv-radius-lg);
  padding: 18px 20px;
  text-decoration: none;
  color: inherit;
  transition: border-color var(--jv-duration-fast) var(--jv-ease),
              box-shadow var(--jv-duration-fast) var(--jv-ease),
              transform 0.15s ease;
}

a.tool-card:hover {
  border-color: var(--jv-brand);
  box-shadow: var(--jv-shadow-md);
  transform: translateY(-2px);
}

.tool-card.is-disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.tool-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.tool-card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 1.02rem;
  font-weight: 600;
  color: var(--jv-text-primary);
}

.tool-icon {
  font-size: 1.1rem;
}

.tool-status {
  flex-shrink: 0;
  font-size: 0.72rem;
  padding: 3px 10px;
  border-radius: var(--jv-radius-full);
  white-space: nowrap;
}

.status-migrated {
  background: var(--jv-success-bg);
  color: var(--jv-success);
}

.status-pending {
  background: var(--jv-warning-bg);
  color: var(--jv-warning);
}

.status-planned {
  background: var(--jv-bg-subtle);
  color: var(--jv-text-muted);
}

.tool-desc {
  margin: 0 0 14px 0;
  font-size: 0.85rem;
  line-height: 1.6;
  color: var(--jv-text-secondary);
  flex-grow: 1;
}

.tool-card-footer {
  display: flex;
  justify-content: flex-end;
}

.tool-link {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--jv-brand);
}

.tool-link.muted {
  color: var(--jv-text-muted);
  font-weight: 500;
}

@media (max-width: 640px) {
  .tools-home {
    padding: 20px 14px;
  }

  .tools-grid {
    grid-template-columns: 1fr;
  }
}
</style>
