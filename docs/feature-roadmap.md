# Jouleverse Explorer v2 — 功能路线图

**文档日期**：2026-06-23  
**维护人**：zhangxin / claude  
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
| 18 | 地址交易历史 | ⚠️ 有缺陷 | `AddressDetail.vue` | 当前扫描区块方式翻页大量空白，需改用 getLogs 或索引 API |

---

## 二、待开发功能清单

### P0 — 缺陷修复（影响核心体验，优先处理）

#### P0-1：地址交易历史 getLogs 重构
- **问题**：`AddressDetail.vue` 当前扫描全部区块来找某地址的交易，翻页时出现大量空页，且随区块高度增长越来越慢。
- **正确方案**：改用 `getLogs` 过滤 Transfer/内部交易，或接入链上索引 API（如果 Jouleverse 有）。
- **v1 现状**：v1 同样用扫描方式（历史遗留，已知慢），但 v2 应趁机修正。
- **文件**：`src/views/AddressDetail.vue`
- **参考**：`viem.sh getLogs` / Jouleverse RPC 是否支持 `eth_getLogs`

---

### P1 — 功能补全（原规划 P1，已列入计划未实现）

#### P1-1：JNS Mint 功能
- **说明**：在当前 JNS 域名查询页（`JNSQuery.vue`）基础上，添加"购买/Mint 域名"功能，调用 JNS 合约写操作。
- **依赖**：钱包连接（已有）、`src/contracts/jns.ts`（已有合约定义）
- **参考**：v1 `views/jnsInfo.html` + `controllers/jnsInfoController.js`
- **新文件**：`src/views/JNSMint.vue` 或在 `JNSQuery.vue` 中扩展

#### P1-2：JNS 完整记录展示
- **说明**：域名详情页展示 JNS 的所有记录（Ethereum address、Twitter、GitHub、description 等 NFT metadata 字段）。
- **当前 v2 状态**：`JNSQuery.vue` 只有基础查询，记录展示不完整。
- **参考**：v1 JNS 记录字段定义、`jns.ts` 合约 ABI
- **文件**：扩展 `JNSQuery.vue` 或拆分 `JNSDetail.vue`

---

### P2 — 全网签到统计页（规划文档遗漏功能，第二阶段）

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

#### PERF-1：地址交易历史串行 RPC 爆炸（`AddressDetail.vue:299-345`）
- **问题**：`loadTransactions` 对每个区块串行调 `getBlock`，对每笔 tx 串行调 `getTransaction`，匹配后再串行调 `getTransactionReceipt`。10个区块 × N笔 tx，最坏情况数百次串行 RPC。
- **现象**：页面加载时间极长（数十秒），用户可感知卡死。
- **解决方案**：改用 `eth_getLogs` 过滤地址相关事件（即 P0-1）。若 Jouleverse RPC 不支持地址过滤，可退化为只并行化：`Promise.all(blocks.map(getBlock))` + 区块内并行 `Promise.all(txHashes.map(getTransaction))`。
- **关联**：P0-1

#### PERF-2：JNS 持有列表无分批保护（待开发功能）
- **问题**：JNS 为 NFT，某些地址可能持有几十至数百个域名。若全量 `tokenOfOwnerByIndex` 一次打出，可能触发 RPC 限速（`rpc.jnsdao.com:8503` 是小型公共节点）。
- **当前 ABI 状态**：`jns.ts` 缺少 `balanceOf` 和 `tokenOfOwnerByIndex` 方法，需补充。
- **解决方案**：
  1. 先调 `balanceOf(addr)` 拿总数，立即渲染"持有 X 个 JNS 域名"
  2. 自动加载前 10 个（`tokenOfOwnerByIndex` 0-9），用 `_allTokensName(tokenId)` 获取域名字符串
  3. 超过 10 个时显示"加载更多"按钮，每次追加 10 个
  4. 超过 50 个提示"前往 JNS 页查看全部"

### 🟡 中等性能问题

#### PERF-3：首页创世区块重复 fetch（`Home.vue:321`）
- **问题**：`fetchLatestBlocks` 每次调用都 `await publicClient.getBlock({ blockNumber: 0n })` 获取创世区块计算运行时间。创世区块内容永远不变，但每次刷新都多一次 RPC。
- **解决方案**：将创世区块时间戳硬编码为常量（或 module 级单次缓存），省去该 RPC 调用。需确认 Jouleverse 创世区块时间戳。

#### PERF-4：首页区块串行加载（`Home.vue:344-356`）
- **问题**：`for (let i = 0; i < 10; i++) { await publicClient.getBlock(...) }` 串行获取 10 个区块。
- **解决方案**：改为 `await Promise.all(Array.from({length:10}, (_,i) => publicClient.getBlock({blockNumber: latest - BigInt(i)})))`，并行加载，速度约提升 5-8 倍。
- **关联**：已在代码质量表，提升为性能问题

#### PERF-5：POP 历史加载无上限保护（`useCoreId.ts`）
- **问题**：`loadMyPopHistory` 对地址持有的所有 POP Badge 一次性全量加载（`balanceOf` → 全量 `tokenOfOwnerByIndex` → 全量 `tokenURI`）。每月签到产生 1 个，3 年社区用户约 36 个，目前可接受；但若将来出现异常账号（自动化签到或合约 bug），无任何保护。
- **解决方案**：加上限（如 `MAX_DISPLAY = 120`），超出时提示"仅显示最近 N 条，共 X 条"。不需要立即实施，随 JNS 持有列表一起加防护意识。

### 🟢 低优先级问题

#### PERF-6：`jns.ts` 模块级 `console.log`（`jns.ts:152-156`）
- **问题**：模块加载时直接 `console.log('=== jns.ts Module Load ===')` + `JNS_ADDRESS`，每次 import 都执行，生产环境会持续输出调试日志。
- **解决方案**：直接删除这 5 行。不需要等功能开发，随时可清理。

---

## 四、代码质量待处理项

### 结构性问题

| 优先级 | 问题 | 文件 | 说明 |
|--------|------|------|------|
| 🔴 高 | 地址交易历史根本缺陷（见 PERF-1 + P0-1） | `AddressDetail.vue` | 串行 RPC 爆炸，需 getLogs 重构 |
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
  PERF-6  删除 jns.ts 模块级 console.log（5分钟，随时可做）
  PERF-4  Home.vue 区块并行加载（改一行 Promise.all）
  PERF-3  首页创世区块时间戳硬编码（确认时间戳后10分钟）
  P0-1    地址交易历史 getLogs 重构（核心体验，最重要）

近期（功能开发，含性能保护）──────────────────────
  JNS-1   地址页 JNS 主域名反向显示（addr2name，1次RPC，快）
  JNS-2   地址页 JNS 持有列表（含 PERF-2 分批加载保护）
  PERF-5  POP 历史上限保护（随 JNS 持有列表一起加）
  P1-1    JNS Mint 功能
  P1-2    JNS 完整记录展示

已完成 ─────────────────────────────────────────
  ✅ P2-1  全网签到统计页（2026-06-24）

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
