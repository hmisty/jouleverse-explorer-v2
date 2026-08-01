# Jouleverse Explorer v2 — 功能路线图

**文档日期**：2026-07-31  
**维护人**：zhangxin / claude / 大白  
**用途**：跟踪 v1 → v2 功能迁移进度 + 新功能规划，作为后续开发的唯一入口文档  

> v2 规划文档（`explorer-v2-mvp-plan.md` / `jouleverse-explorer-refactor-plan.md`，撰写于 2026-03-18）的"V1 功能清单"基于当时的 v1 快照，**遗漏了 v1 在 2026 年 1–3 月新增的功能**（Core ID、JVA/B32 地址）。本文档在此基础上补全，以 v1 当前线上版本（jscan.jnsdao.com）为权威基线。

---

## 一、当前 v2 实现状态总览

| # | 功能模块 | 状态 | 实现位置 | 备注 |
|---|---------|------|---------|------|
| 1 | 区块列表（首页） | ✅ 已完成 | `Home.vue` | |
| 2 | 区块详情页 | ✅ 已完成 | `BlockDetail.vue` | |
| 3 | 交易详情页 | ✅ 已完成 | `TransactionDetail.vue` | |
| 4 | 地址详情页（基础） | ✅ 已完成 | `AddressDetail.vue` | |
| 5 | 搜索框（区块/交易/地址） | ✅ 已完成 | `Home.vue` 内联 | |
| 6 | 网络状态指示 | ✅ 已完成 | `NetworkStatus.vue` | |
| 7 | Timelock 能量信息 | ✅ 已完成 | `Home.vue` | |
| 8 | 运行时间统计 | ✅ 已完成 | `Home.vue` | |
| 9 | MetaMask 钱包连接 | ✅ 已完成 | `App.vue` + `stores/wallet.ts` | |
| 10 | WJ 操作（转账/提款） | ✅ 已完成 | `WJOperations.vue` | |
| 11 | JNS 域名查询 | ✅ 已完成 | `JNSQuery.vue` | 大白实现（2026-06-19） |
| 12 | Core ID NFT 展示 | ✅ 已完成 | `CoreIdSection.vue` | PR#1（2026-06-18 合入） |
| 13 | 链上签到面板 | ✅ 已完成 | `CoreIdCheckIn.vue` | PR#1，真实链上测试通过 |
| 14 | JVA/B32/HEX 多格式地址 | ✅ 已完成 | `utils/jvaddress.ts` | 大白实现（2026-06-19）；搜索框已集成 |
| 15 | GitHub Pages 自动部署 | ✅ 已完成 | `.github/workflows/deploy-pages.yml` | hash路由 + 相对路径 |
| 16 | Naive UI 设计系统基础 | ✅ 已完成 | `src/design-system/` | 本次实现（2026-06-23） |
| 17 | 暗色/浅色/系统主题 | ✅ 已完成 | `stores/theme.ts` + `App.vue` | 本次实现 |
| 18 | 地址交易历史 | ✅ 已完成 | `AddressDetail.vue` | getLogs + 按年翻页（2026-07-25，commit 1b7273c） |
| 19 | JNS 完整记录展示 | ✅ 已完成 | `JNSDetail.vue` | 域名详情页 + 持有者其他域名 + /jns/:name 路由（2026-07-27，commit c6953b6） |
| 20 | JNS 域名操作 | ✅ 已完成 | `JNSOperations.vue` | 绑定/解绑/发送J + 钱包连接 + B32支持（2026-07-28，commit 406a0fa） |

---

## 二、待开发功能清单

### P0 — 缺陷修复（影响核心体验，优先处理）

#### P0-2：J-Checkin 签到 App 在欧易 DeFi 浏览器失效
- **现象**：`jvcore-checkin.505606.xyz` 在手机欧易 DeFi 浏览器上无法正常签到，页面无响应。
- **根因分析（2026-06-28）**：
  1. **CDN 超时**：`cdn.bootcdn.net/web3.min.js` 加载耗时 9.8s，欧易沙箱环境大概率超时，导致 `Web3` 未定义，整页静默崩溃。
  2. **网络切换兼容性**：`wallet_switchEthereumChain` 失败后靠 `error.code === 4902` 触发 `wallet_addEthereumChain`，欧易钱包返回的错误码与 MetaMask 不同，导致切链逻辑永远走不进去。
- **对比 v1**：v1 使用本地 Web3.js 文件 + 不做主动切链，因此正常工作。
- **修复方案**：① 将 Web3.js 改为本地托管文件；② `wallet_addEthereumChain` 错误处理改为宽松判断（不只依赖 4902）。
- **状态**：⏸ 待处理（记录于 2026-06-28）
- **源码位置**：待确认（不在当前 explorer-v2 仓库内）

#### ✅ P0-1：地址交易历史 getLogs 重构（已完成，2026-07-25）
- **方案**：改用 `getLogs` 按年查询 Transfer 事件
  - 新建 `src/utils/timestamp-to-block.ts`：区块1锚点 + 平均出块时间推算各年份区块范围
  - 重写 `AddressDetail.vue` 交易历史：← 年份 → 翻页导航，覆盖全历史区块
  - 并行查询转入/转出 Transfer 事件
  - RPC 调用从 700+ 降至 4
  - `viem getLogs topics bug` 绕行（改用 raw JSON-RPC 请求，commit 92771ae）
- **文件**：`src/views/AddressDetail.vue`、`src/utils/timestamp-to-block.ts`
- **commit**：1b7273c（2026-07-25），后续修复 caf341f / c1623b1 / 92771ae

---

### P1 — 功能补全（原规划 P1，已列入计划未实现）

#### ~~P1-1：JNS Mint 功能~~ — 暂不实现（合约限制）
- **结论**：JNS `claim(name)` 函数为 owner-only，普通用户无法自助注册域名。v1 中 mint 按钮仅对合约 owner 显示，属于运营方后台工具，非用户侧功能。
- **待办**：若 JNS 合约升级支持公开注册，再重新评估。

#### ✅ P1-2：JNS 完整记录展示（已完成，2026-07-27）
- **说明**：域名详情页展示 JNS 的所有记录（Ethereum address、Twitter、GitHub、description 等 NFT metadata 字段）。
- **文件**：`JNSDetail.vue`、`/jns/:name` 路由
- **commit**：c6953b6（2026-07-27）

---

### P2 — 全网签到统计页（规划文档遗漏功能，第二阶段）

#### ⏳ P2-2：V2 工具集入口页 + V1 工具迁移（2026-08-01 立项）
- **背景**：V1 工具集入口（`/tools/index.html`）卡片式布局，但框架/风格与主站不统一（Bootstrap 3 + web3.js + 外部 CDN），需按 V2 主站框架（Vue 3 + design-system）重写
- **方案**：先建 V2 `/tools` 入口页（卡片式分类，未迁移工具外链 V1），再逐步迁移：①合约交互工具（core+contractx 合并，viem 重写）②默克尔证明生成器 ③JNSVote（随 P3-1）
- **详细方案**：见 `docs/tools-migration.md`
- **状态**：📋 待开发

#### ✅ P2-1：全网 Core ID 签到统计页 `/#/core/checkin`（已完成，2026-06-24）
- **来源**：v1 `views/coreCheckInInfo.html` + `coreCheckInInfoController.js`（2026年新增，规划文档未覆盖）
- **功能**：
  - 按月（UTC+8）遍历全部 POPBadge token，分组统计每个 Core ID 签到次数/首末次时间
  - 月份导航（上月/下月切换）
  - 完整性校验（对比 Core ID 总数与签到数）
  - 分批懒加载（POPBadge token 数量随时间增长）
- **复杂度**：高（需大量链上读取 + 分批 + 月份分组逻辑）
- **已实现文件**：
  - `src/views/CoreCheckinStats.vue` ✅
  - `src/router/index.ts` 已添加 `/core/checkin` 路由 ✅
  - `src/composables/useCheckinStats.ts`（独立 composable，未扩展 useCoreId）✅
  - `src/contracts/popbadge.ts` 补充 ABI（totalSupply / tokenByIndex / getPOPInfo）✅
- **v1 源文件参考**：`v1-explorer/app/scripts/controllers/coreCheckInInfoController.js`（v1 功能完整，无待办）

---

### P3 — JNSVote 治理投票（原规划 P2，复杂度高）

#### P3-1：JNSVote 治理投票全模块
- **子功能**：
  - POAP 徽章验证（用于投票资格，注意：这里的 POAP 是 JNSVote 专属的，不是 Core ID 的 POPBadge）
  - 投票资格检查
  - 投票列表页
  - 投票详情页
  - 投票写操作（钱包签名）
  - 投票进度展示（实时更新）
- **复杂度**：极高，建议单独规划一轮迭代
- **合约**：需要获取 JNSVote 合约 ABI 和地址（v1 中的 `JNSVote.sol`）
- **参考**：v1 `views/jnsVote*.html` 系列

---

### P4 — 废弃功能评估（维持原规划结论）

| 功能 | 原规划建议 | 维持建议 | 原因 |
|------|-----------|---------|------|
| CryptoJunks NFT | 考虑废弃 | 维持废弃 | 与浏览器核心定位不符，使用频率低 |
| Redpacket 红包 | 考虑废弃 | 维持废弃 | 同上 |
| 合约验证功能 | 考虑废弃 | 维持废弃 | 复杂度高，维护成本高，可独立工具化 |

---

## 三、性能问题清单（全局扫描，需同步解决）

> 2026-06-25 全局 review 结果。所有 🔴 问题需在功能开发前先解决，🟡 随对应功能开发时一并处理。

### 🔴 严重性能问题

#### ✅ PERF-1：地址交易历史串行 RPC 爆炸（已修复，2026-07-25）
- **修复**：改用 `eth_getLogs` 按年查询，RPC 调用从 700+ 降至 4。
- **关联**：✅ P0-1

#### ✅ PERF-2：JNS 持有列表无分批保护（已修复，2026-07-29）
- **问题**：JNS 为 NFT，某些地址可能持有几十至数百个域名。若全量 `tokenOfOwnerByIndex` 一次打出，可能触发 RPC 限速（`rpc.jnsdao.com:8503` 是小型公共节点）。
- **当前 ABI 状态**：`jns.ts` 缺少 `balanceOf` 和 `tokenOfOwnerByIndex` 方法，需补充。
- **解决方案**（已实现）：
  1. 先调 `balanceOf(addr)` 拿总数，立即渲染"持有 X 个 JNS 域名" ✅
  2. 自动加载前 10 个（`tokenOfOwnerByIndex` 0-9），用 `_allTokensName(tokenId)` 获取域名字符串 ✅
  3. 超过 10 个时显示"加载更多"按钮，每次追加 10 个 ✅
  4. 超过 50 个提示"前往 JNS 页查看全部" ✅
- **实现**：`AddressDetail.vue` JNS 持有面板（`JNS_BATCH_SIZE=10` / `JNS_MAX_DISPLAY=50`）

### 🟡 中等性能问题

#### PERF-3：首页创世区块重复 fetch（`Home.vue:321`）
- **问题**：`fetchLatestBlocks` 每次调用都 `await publicClient.getBlock({ blockNumber: 0n })` 获取创世区块计算运行时间。创世区块内容永远不变，但每次刷新都多一次 RPC。
- **解决方案**：将创世区块时间戳硬编码为常量（或 module 级单次缓存），省去该 RPC 调用。需确认 Jouleverse 创世区块时间戳。

#### PERF-4：首页区块串行加载（`Home.vue:344-356`）
- **问题**：`for (let i = 0; i < 10; i++) { await publicClient.getBlock(...) }` 串行获取 10 个区块。
- **解决方案**：改为 `await Promise.all(Array.from({length:10}, (_,i) => publicClient.getBlock({blockNumber: latest - BigInt(i)})))`，并行加载，速度约提升 5-8 倍。
- **关联**：已在代码质量表，提升为性能问题

#### ✅ PERF-5：POP 历史加载无上限保护（已修复，2026-07-29）
- **问题**：`loadMyPopHistory` 对地址持有的所有 POP Badge 一次性全量加载（`balanceOf` → 全量 `tokenOfOwnerByIndex` → 全量 `tokenURI`）。每月签到产生 1 个，3 年社区用户约 36 个，目前可接受；但若将来出现异常账号（自动化签到或合约 bug），无任何保护。
- **解决方案**（已实现）：加上限 `MAX_POP_DISPLAY=50` + 分批加载 `POP_BATCH_SIZE=10`，显示总持有数，超出时提示"仅显示最近 N 条，共 X 条"。
- **实现**：`useCoreId.ts`（commit 3a52c0f / 0a2b772，2026-07-29）

### 🟢 低优先级问题

#### PERF-6：`jns.ts` 模块级 `console.log`（`jns.ts:152-156`）
- **问题**：模块加载时直接 `console.log('=== jns.ts Module Load ===')` + `JNS_ADDRESS`，每次 import 都执行，生产环境会持续输出调试日志。
- **解决方案**：直接删除这 5 行。不需要等功能开发，随时可清理。

---

## 四、代码质量待处理项

### 结构性问题

| 优先级 | 问题 | 文件 | 说明 |
|--------|------|------|------|
| ✅ 已修复 | 地址交易历史根本缺陷（见 PERF-1 + P0-1） | `AddressDetail.vue` | getLogs 重构完成（2026-07-25） |
| 🟡 中 | `formatAddress/formatHash/formatAge` 各文件重复 | 4个View文件 | 应抽 `src/utils/format.ts` 统一 |
| 🟡 中 | `useBlockchain.ts` 死代码 | `src/composables/useBlockchain.ts` | `Home.vue` 从未 import，确认后删除 |
| 🟡 中 | `Home.vue` 区块串行加载（见 PERF-4） | `Home.vue:344-356` | for 循环 getBlock x10，改 Promise.all |
| 🟢 低 | `HelloWorld.vue` 脚手架残留 | `src/components/HelloWorld.vue` | 无引用，可删除 |

### 设计系统接入

新功能必须使用 `src/design-system/` 中的组件，旧页面**不主动迁移**，触达时随业务修改替换：

```
src/design-system/
  tokens.css          ← CSS变量，全局引入（已完成）
  theme.ts            ← Naive UI 主题覆盖（已完成）
  index.ts            ← 统一导出
  components/
    JvLoading.vue      ← J字涨水 loading（已完成）
    JvPageState.vue    ← 空状态/异常状态（已完成）
    JvHashText.vue     ← 地址/哈希展示+复制+跳转（已完成）
    JvActionButton.vue ← 带loading防重复提交按钮（已完成）
    JvStatusTag.vue    ← 交易/网络/Core ID状态标签（已完成）
    JvAmount.vue       ← 链上金额展示（已完成）
```

---

## 四、开发优先级建议

```
立即（性能/体验阻塞）─────────────────────────────
  （所有 P0/PERF 已解决 ✅）

近期（功能开发，含性能保护）──────────────────────
  ~~JNS-1~~  地址页 JNS 主域名反向显示（addr2name）✅ 已完成（PR#3）
  ~~JNS-2~~  地址页 JNS 持有列表（含 PERF-2 分批加载保护）✅ 已完成（2026-07-29）
  ~~PERF-5~~ POP 历史上限保护 ✅ 已完成（2026-07-29）
  ~~P1-1~~ JNS Mint 功能 — 暂不实现（合约限制）
  ~~P1-2~~ JNS 完整记录展示 ✅ 已完成（2026-07-27）

已完成 ─────────────────────────────────────────
  ✅ P2-1  全网签到统计页（2026-06-24）
  ✅ P0-1  地址交易历史 getLogs 重构（2026-07-25）
  ✅ PERF-1  地址交易历史串行 RPC 爆炸（2026-07-25）
  ✅ PERF-2  JNS 持有列表分批加载保护（2026-07-29）
  ✅ PERF-3  首页创世区块硬编码（2026-06-28 前）
  ✅ PERF-4  Home.vue 区块并行加载（2026-06-28 前）
  ✅ PERF-5  POP 历史上限保护（2026-07-29）
  ✅ PERF-6  jns.ts console.log 删除（2026-06-28 前）
  ✅ P1-2  JNS 完整记录展示（2026-07-27）
  ✅ JNS-2  地址页 JNS 持有列表 + 分批加载（2026-07-29）
  ✅ JNS 域名操作 — 绑定/解绑/发送J（2026-07-28）

中期 ───────────────────────────────────────────
  P3-1    JNSVote 治理投票（复杂，单独排期）
  代码质量：format.ts 统一、useBlockchain 清理、HelloWorld 删除

待定 ───────────────────────────────────────────
  P4 废弃功能（维持现状，不主动实现）
```

---

## 六、v1 遗漏功能补充记录

以下功能在 v1 2026 年新增，但 v2 规划文档（2026-03-18 撰写）未覆盖，已在 v2 中补实现或记录：

| 功能 | v1 新增时间 | v2 状态 |
|------|-----------|---------|
| Core ID NFT 展示 + 一键签到 | 2025.1–2026.1 | ✅ PR#1 已合入（2026-06-18） |
| JVA/B32/HEX 多格式地址 | 2026.1.19–22 | ✅ 大白实现（2026-06-19） |
| 全网签到统计页 | 2026年 | ✅ P2-1 已完成（2026-06-24） |

> 根因：规划文档基线可能是 2026-03-18 之前的 v1 快照，2026 年 1–3 月新增功能未被覆盖。建议将本表同步给大白，补充到 `explorer-v2-mvp-plan.md` 的 V1 功能清单。

---

## 七、外部部署说明

| 部署目标 | 地址 | 状态 |
|---------|------|------|
| GitHub Pages（fork） | `https://xiaopiao009.github.io/jouleverse-explorer-v2/` | ✅ 运行中 |
| 上游合并后正式部署 | `hmisty/jouleverse-explorer-v2` 的 Pages | 等大白配置 GitHub Pages Source |

---

*最后更新：2026-06-25*
