# Jouleverse Explorer v2 — 功能路线图

**文档日期**：2026-07-31  
**维护人**：zhangxin / claude / 大白  
**最近更新**：2026-11-20（大白：基线 276→290→314→344；合入 revert 解码修复、区块详情对等、全局搜索输入解析三批；2026-11-17 起项目目标修订为 v1 功能 100% 移植，P4「废弃功能」结论作废）  
**用途**：跟踪 v1 → v2 功能迁移进度 + 新功能规划，作为后续开发的唯一入口文档  

> ⚠️ **目标已修订（2026-11-17，教链确认）**：项目目标从「MVP + 选择性移植 + 果断废弃」改为 **「v1 全部功能 100% 移植，尽快达到可替代 v1 的可用性」**。
> 原先判定「考虑废弃」的 CryptoJunks / Redpacket / 合约验证**全部改为必须移植**；§二 P4 废弃结论作废，见 **§二 P5**。
> 完整对等清单（v1 全部路由、字段级差异、批次划分、验收判据）：[`docs/v1-parity-checklist.md`](./v1-parity-checklist.md)。
> 判定原则：v1 只要还托管任何独占功能，就不能下线；切换 DNS/302 之前必须先 100% 对等。

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
| 6 | 网络状态指示 | ✅ 已完成 | `Home.vue` 内联 status-pill | 原独立组件 `src/components/NetworkStatus.vue` 已于 f567f0c（2026-06-28）删除，逻辑并入 Home.vue（`status-pill` 模板区块 / `networkStatus` ref / `fetchLatestBlocks` 内 diff 判定）|
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
| 19 | JNS 完整记录展示 | ✅ 已完成 | `JNSQuery.vue`（`/jns/:name` 路由复用） | 域名详情页 + 持有者其他域名 + /jns/:name 路由（2026-07-27，commit c6953b6 实改 `src/views/JNSQuery.vue`；无独立 JNSDetail.vue） |
| 20 | JNS 域名操作 | ✅ 已完成 | `JNSQuery.vue`（钱包操作面板） | 绑定/解绑/发送J + 钱包连接 + B32支持（2026-07-28，commit 406a0fa 实改 `src/views/JNSQuery.vue` L126-215；无独立 JNSOperations.vue） |
| 21 | 区块列表页 | ✅ 已完成 | `Blocks.vue` | `/blocks` 路由，区块号搜索 + 刷新（2026-03-20，commit bc33ed0；首页 `Home.vue` 之外另有独立列表页） |
| 22 | 全网签到统计页 | ✅ 已完成 | `CoreCheckinStats.vue` | `/core/checkin` 路由，Naive UI 设计系统首批页面（2026-06-27，commit f6a09ff，PR#2） |
| 23 | 工具集入口页 | ✅ 已完成 | `ToolsHome.vue` | `/tools` 路由，卡片式分类入口，未迁移工具外链 v1（2026-08-01，commit 0325566，PR#8；本分支将数据分析面板/多签管理改为可点击内页） |
| 24 | 合约交互通用工具 | ✅ 已完成 | `ContractToolView.vue` + `contracts/toolbox.ts` | `/tools/contract/:key` 路由，toolbox 注册表驱动 **12** 个合约（core 4 / eco 8），PR#9（66aa9af）2026-08-03 + 交易监听/WS 推送 PR#10（2026-08-04） |
| 25 | 默克尔证明生成器 | ✅ 已完成 | `MerkleProofGenerator.vue` | `/tools/merkle` 路由，OZ v1.0.8 兼容算法（viem 重写），root/proof 已对官方库验证（2026-08-05，commit 66b1417） |
| 26 | JNSVote 治理投票（列表） | ✅ 已完成 | `JNSVote.vue` | `/jnsvote` 路由，提案列表 + SBT 徽章 + 资格校验（JTI + JNS 持仓）；2026-08-14 commit 7b1b813（PR#15）起迭代，2026-10-22 全模块收尾（详见 §二 P3-1） |
| 27 | JNSVote 提案详情页 | ✅ 已完成 | `JNSVoteProposalDetail.vue` | `/jnsvote/:id` 路由；组件 2026-10-17 commit 145fdbb 落地，路由接线 commit a5d3d76 于 2026-10-20 合入（已核 `git merge-base --is-ancestor a5d3d76 upstream/explorer-v2` 为真） |
| 28 | JNS 域名总览页 | ✅ 已完成 | `JnsDomains.vue` | `/domains` 路由，域名总览 + i18n + smoke 用例（2026-10-16，commit 86d1553；2026-10-19 commit 0b4ad5c 收敛为中文单语种） |
| 29 | JNSVote 治理端（创建提案） | ✅ 已完成 | `JNSVoteGovernancePanel.vue` + `composables/useJNSVoteGovernance.ts` | 多签签名人专属（`v-if="isSigner"`），Gnosis 2/3 多签 submit → confirm → execute 三段流程；三条安全边界（列表过滤 / RPC 前置短路 / 防造死提案）详见 §二 P3-1；PR #62，merge ac5d8ce（2026-11-03） |
| 30 | 生态合约注册目录 | ✅ 已完成 | `ContractRegistry.vue` + `contracts/toolbox.ts` | `/contracts`；复用本地 toolboxContracts 部署清单（12 个：核心 4 / 生态 8），搜索、分类、地址复制/跳转、合约工具入口；默认零 RPC，支持按需只读核验单个合约；目录源自 PR #66 |
| 31 | 验证者 / 签名人目录 | ✅ 已完成 | `Validators.vue` + `utils/clique-signers.ts` | `/validators`；最新高度 + 最近 epoch（30000 块）检查点 extraData，未命中缓存时两次逻辑读取；60 秒缓存及并发合并；仅检查点快照，不重放后续投票、不验证 seal、不提供出块分布/在线状态，PR #66 |
| 32 | 近期数据分析面板 | ✅ 已完成 | `Analytics.vue` | `/tools/analytics`；12/24个区块有界样本、缓存，无全链日志扫描 |
| 33 | 通用经典多签管理 | ✅ 已完成 | `Multisig.vue` | `/tools/multisig`；任意兼容地址、分页、审阅、发送前复核 |
| 34 | 链上交易核验与记录导出工具 | ✅ 已完成 | `ReceiptVerifier.vue` + `services/receipt-verifier.ts` | `/tools/receipt`；最多5个只读请求；归属一致性/重组检查；机器可读快照导出；不等于支付/履约成功，详见 `receipt-verifier.md` |
| 35 | 生态接入验收 | ✅ 已完成 | `NetworkReadiness.vue` + `services/network-readiness.ts` | `/tools/integration`；本地清单导出、最多8次只读请求、能力边界明确；详见network-readiness.md |

> **本表覆盖度自检（2026-11-03 更新，并行 PR #65/#66/#67/#68 合入后顺延编号）**：`src/views/` 下共 **22** 个视图，本表 #1–#35 已全部覆盖（0 漏项）。
> 注：#29 是组件层（`components/` + `composables/`）而非独立视图，从 #36 起如再新增组件级模块可延续此编号。
> 复算方法：
> ```bash
> node scripts/check-feature-roadmap.ts
> ```
> 新增视图必须同步加行——历史上本表在 2026-07-28 后停更近 3 个月（缺 8 个视图），
> 而 §二 P3-1 / §五 优先级表同期一直在记 JNSVote「✅ 全部完成」，两份清单互相矛盾却无人发现。

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
- **源码位置**：候选 `i29/JVCore-CheckIn`（不在当前仓库）；2026-11-03读取正式站点入口，与候选提交 `8e30541` 的 `index.html` SHA-256逐字节一致。兼容修复在候选仓库准备；仍需教链/维护者确认正式提交与发布位置、完成欧易手机实机验收，故本项未标记已上线。

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
- **文件**：`src/views/JNSQuery.vue`（`/jns/:name` 路由复用同一组件）、`/jns/:name` 路由
- **commit**：c6953b6（2026-07-27）

---

### P2 — 全网签到统计页（规划文档遗漏功能，第二阶段）

#### ⏳ P2-2：V2 工具集入口页 + V1 工具迁移（2026-08-01 立项）
- **背景**：V1 工具集入口（`/tools/index.html`）卡片式布局，但框架/风格与主站不统一（Bootstrap 3 + web3.js + 外部 CDN），需按 V2 主站框架（Vue 3 + design-system）重写
- **方案**：先建 V2 `/tools` 入口页（卡片式分类，未迁移工具外链 V1），再逐步迁移：①合约交互工具（core+contractx 合并，viem 重写）②默克尔证明生成器 ③JNSVote（随 P3-1）
- **详细方案**：见 `docs/tools-migration.md`
- **进展**：
  - ✅ 入口页（PR#8，2026-08-01）
  - ✅ 合约交互工具迁移 — toolbox 注册表 + 通用 ContractTool 组件（PR#9，2026-08-03；PR#10 交易监听/WS 推送 2026-08-04）
  - ✅ 默克尔证明生成器迁移（2026-08-05）— `MerkleProofGenerator.vue` + `/tools/merkle`，OZ v1.0.8 兼容算法（viem 重写，已验证 root/proof 与官方库一致）
  - ⏳ 剩余：JNSVote 投票（随 P3-1）
- **状态**：🟡 进行中（剩余 JNSVote）

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
  - JNSVote SBT 徽章 + 资格校验（原「POAP 徽章验证」为命名错误：真实对应物是 JNSVote SBT 徽章，资格校验依赖 JTI + JNS 持仓，非 Core ID 的 POPBadge）✅ 已完成
  - 投票资格检查（JTI + JNS 持仓）✅ 已完成
  - 投票列表页 ✅ 已完成
  - 投票详情页（站内）✅ 已完成（路由 + 卡片跳转已接线，2026-10-20 commit a5d3d76）
  - 投票写操作（钱包签名）✅ 已完成
  - 投票进度展示（实时更新）✅ 已完成
  - 治理端创建提案入口（多签签名人专属）✅ 已完成（PR #62，merge ac5d8ce，2026-11-03）
- **复杂度**：极高，建议单独规划一轮迭代
- **合约**：需要获取 JNSVote 合约 ABI 和地址（v1 中的 `JNSVote.sol`）
- **参考**：v1 `views/jnsVote*.html` 系列
- **进展**（核对日期 2026-10-22）：
  - ✅ 提案列表只读展示（#15，commit 7b1b813）
  - ✅ 投票写操作 voteFor/voteAgainst（#16，commit 852ae1b）
  - ✅ 投票徽章画廊 + 区块实时更新（#19，commit b86a579）
  - ✅ 资格校验 `useJNSVote.ts` 函数 `checkEligibility`（JTI + JNS 持仓）
  - ✅ 提案详情页（站内）：已完整接线（commit a5d3d76，2026-10-20 合入 explorer-v2）——`router/index.ts` 有 `/jnsvote/:id` 路由、`JNSVote.vue` 提案卡片 `@click` 跳转、`JNSVoteProposalDetail.vue` 组件三个入口齐备（核实方式：`git merge-base --is-ancestor a5d3d76 upstream/explorer-v2` 为真，且构建产物 `dist/assets/index-*.js` 内含 `jnsvoteProposalDetail` 路由名）
- **状态**：✅ P3-1 全部子功能已完成，展示层收尾亦已闭环——`/tools` 工具集页的 JNSVote 卡片已从「即将推出」分区移出、改为可点击卡片（PR #48，commit bfb29a8，2026-10-22 合入）；核实方式：`src/views/ToolsHome.vue` 的「链上功能」分区含 `router-link to="/jnsvote"` 卡片并标注「已迁移」

  **治理端（2026-11-03 补齐，PR #62）**：`createProposal` 是 `onlyOwner`，owner = 2/3 多签 `0x4eF599b6E39D950D6Ddbd830fF5f95e06770C1B3`（签名人 Koant J-0 / 剪云为裳 J-37 / 明海云 J-7）。此前前端只有「投票端」，签名人无创建入口。现新增 `JNSVoteGovernancePanel.vue` + `useJNSVoteGovernance.ts` + `contracts/jnsvoteGovernance.ts`，`v-if="isSigner"` 门控。

  三条安全边界（均有实测依据，后续改动不得回退）：
  1. **列表过滤**：只保留 `destination === JNSVote` 且 `selector === createProposal(0x6b5e1766)` 且 `value === 0` 且可成功解码的待执行交易。否则会把多签里积压的 WJ 提现等交易误展示成「创建提案」并可被误执行。实测（2026-11-03）：多签 pending 30 笔（26 笔目标 `0xf8AbF36B` + 4 笔 WJ 提现每笔 1 J），过滤后命中 0 笔。
  2. **RPC 零负担**：`isOwner` 前置短路——非签名人 1 次 call 即返回，不触发后续扫描；签名人亦只对过滤后少数交易读确认状态。
  3. **防造死提案**：`timeBegin > currentBlock` 在表单端 + 执行端双层硬校验。合约侧 `vote()` 要求 `timeBegin < block.number < timeEnd`；`disableProposal` / `reenableProposal` 检查链上原 `timeBegin`，开始后不可执行。注意 `modifyProposal` 检查的是入参的新 `timeBegin`，不能据此声称合约禁止修改已开始提案（见 `docs/reference/jnsvote/jns_vote.sol`）。若产品要求“开始后不可修改”，三操作后续实现须在提交端和执行端独立复核链上原开始高度；本 PR #66 不涉及治理写操作。

  已知非阻塞瑕疵（后续可改）：① `executeTx(txId)` 在 composable 层不校验 txId 归属（当前唯一调用点已过滤，安全；属防御深度缺口）；② `getConfirmations` 读取失败时静默降级为空数组，已确认过的签名人仍看到「确认」按钮，点击会 revert；③ `isTxExpired` 用 `<=`，`timeBegin == currentBlock` 时其实下一块即可投票，被偏保守禁掉。

---

**最近更新**：2026-11-20（大白：修 `ContractTool` revert 解码真实 bug + 抽 `utils/revert`，基线 276→290；2026-11-17 起项目目标修订为 v1 功能 100% 移植，P4「废弃功能」结论作废，新增 P5 对等补齐批次）  
| 功能 | 原规划建议 | **现结论** | 现依据 |
|------|-----------|-----------|--------|
| CryptoJunks NFT | 考虑废弃 | **必须移植**（P5-4） | 10000 枚铭文的唯一浏览入口，属链上资产浏览器本职；离线参照表（`punks/*.json`）无需额外 RPC |
| Redpacket 红包 | 考虑废弃 | **必须移植**（P5-5） | 社区发红包的既有入口，废弃等于砍功能；写链路 v2 已具备（WJ 授权 + JTI 资格校验） |
| 合约验证功能 | 考虑废弃 | **必须移植**（P5-7） | 纯客户端 solc 编译 + 字节码比对，是浏览器内置审计的差异化能力；`ContractDeployment.vue` 的代码摘要比对**不等价** |

---

### P5 — v1 功能 100% 对等补齐（2026-11-17 立项，当前主线）

> 详细字段级差异、v1 源码位置、验收判据见 [`docs/v1-parity-checklist.md`](./v1-parity-checklist.md)。
> 排序原则：先补「影响日常浏览与钱包操作」的，再补「工具型 / 运营型」的。

| 批次 | 内容 | 预估 | 状态 |
|---|---|---|---|
| **P5-1 浏览基础对等** | ~~首页 Free/Reserved Energy 四宫格~~（⛔ 撤销，见下）、一键添加主网（EIP-3085）、全局搜索补全（五类输入 + 帮助弹层）、区块详情（确认数 + extraData + 交易输入数据）、交易详情（区块哈希 + **ABI 解码切换** + 地址标签 + gasPrice 双单位） | 1.5–2 天 | 🟡 进行中 |
| **P5-2 地址页对等** | 资产面板补 Planet / FlyingJ / JNSDAO V（含 npub）/ CryptoJunks 墙；「新手加油 0.005 J」；WJ 发送与 JNS 转移支持 `.j` 解析 | 1.5–2 天 | ⏳ 待开工 |
| **P5-3 JNS 对等** | `/#/did/:name` DID 页；打赏 endorse（1/2/5/10 + 手动 ≤100 WJ）；owner-only mint 入口 | 1–1.5 天 | ⏳ 待开工 |
| **P5-4 CryptoJunks** | 全量浏览页：supply 状态 / 分页（100 一页）/ 铭文墙 / 标注说明 / 静态统计表 | 1–1.5 天 | ⏳ 待开工 |
| **P5-5 链上红包** | 创建（总额 ≤2000 WJ、≤500 个、WJ 授权）+ 红包信息 + 抢（幸运数字 + JTI 资格）+ 复制 | 1.5–2 天 | ⏳ 待开工 |
| **P5-6 工具集对等** | 合约工具补**事件查询/订阅面板**；补 6 个缺失合约注册（`节点PoS` / `投票权PoS` / `CJDAO多签` / `Timelock0` / `JTI2Config` / `ecofund1`）；**自定义 ABI 交互**（`/tools/custom`）并下线 `contractx` 外链 | 2–3 天 | ⏳ 待开工 |
| **P5-7 合约验证** | 地址页合约源码展示 + solc Web Worker 编译比对（版本/optimizer/evmVersion 取自部署清单），复现 v1 的 `exactMatch / partialMatch` | 2–3 天 | ⏳ 待开工 |
| **P5-8 切换就绪** | 全量回归 + v1/v2 双跑逐页对照 + 切换方案（301/302 + 公告） | 1–2 天 | ⏳ 待开工 |

**P5-1 已完成项（2026-11-20）**：

- ✅ 全局搜索五类输入解析（`src/utils/search-resolve.ts`，PR #95）——并修了两个实际 bug：
  - 40 位全数字地址被 `/^\d+$/` 抢走当区块号（`1234567890…` 这类合法地址搜不到）；
  - 无法识别时静默 `router.push('/block/<乱码>')`，用户只看到「区块不存在」。
    现改为弹帮助面板列 5 类示例（示例可点击填入），并对 JVA 校验失败给出专门提示。
  - **未移植「区块哈希搜索」**：v1 那条分支永不可达（`/[0-9a-zA-Z]{64}?/` 对区块哈希同样为真，
    必然先命中 tx 分支），v1 从未真正支持过。详见对等清单 §二·二 核实纠错注。
- ✅ 稳定运行补 `since block 0` 链接（时长呈现保持 v2，只补链接）
- ✅ 首页最新区块补 `size` 字段（卡片式布局不回退，三个短数值紧凑横排）
- ✅ 区块详情：确认数 / extraData / 交易输入数据（PR #93）
- ⛔ 首页能量合计**撤销**（PR #92 已关闭）——`used` ≠ 流通、`available` ≠ 锁中，v1 语义站不住
- ⏳ 一键添加主网（EIP-3085）
- ⏳ 交易详情：区块哈希行 / ABI 解码切换 / 地址标签 / 双单位

**每批硬性门禁**：`npm run build` EXIT 0（非 `vue-tsc --noEmit`）/ `npm test` 全绿 / `check-feature-roadmap.ts` 通过 / 新增纯逻辑配 spec 且做反向验证 / 真实链验证记录进 PR / 有 UI 改动做双主题验证。

**明确不在对等范围**（避免误解「100%」）：SEO/SSR（v1 本身是 hash 静态站）、技术栈复刻（Angular 1.x / Bower / Bootstrap 3）、`:8503`/`:8505` 遗留端点、v1 中被注释掉的历史代码路径。
**保留 v1 边界不放宽**：JNS mint 仅 owner 可见、红包 2000 WJ / 500 个、WJ 发送 ≤2000 WJ、打赏 0<x≤100 WJ。

---

## 三、性能问题清单（全局扫描，需同步解决）

> 2026-06-25 全局 review 结果。所有 🔴 问题需在功能开发前先解决，🟡 随对应功能开发时一并处理。

### 🔴 严重性能问题

#### ✅ PERF-1：地址交易历史串行 RPC 爆炸（已修复，2026-07-25）
- **修复**：改用 `eth_getLogs` 按年查询，RPC 调用从 700+ 降至 4。
- **关联**：✅ P0-1

#### ✅ PERF-2：JNS 持有列表无分批保护（已修复，2026-07-29）
- **问题**：JNS 为 NFT，某些地址可能持有几十至数百个域名。若全量 `tokenOfOwnerByIndex` 一次打出，可能触发 RPC 限速（`rpc.jnsdao.com` 是小型公共节点）。
- **当前 ABI 状态**：`jns.ts` 缺少 `balanceOf` 和 `tokenOfOwnerByIndex` 方法，需补充。
- **解决方案**（已实现）：
  1. 先调 `balanceOf(addr)` 拿总数，立即渲染"持有 X 个 JNS 域名" ✅
  2. 自动加载前 10 个（`tokenOfOwnerByIndex` 0-9），用 `_allTokensName(tokenId)` 获取域名字符串 ✅
  3. 超过 10 个时显示"加载更多"按钮，每次追加 10 个 ✅
  4. 超过 50 个提示"前往 JNS 页查看全部" ✅
- **实现**：`AddressDetail.vue` JNS 持有面板（`JNS_BATCH_SIZE=10` / `JNS_MAX_DISPLAY=50`）

### 🟡 中等性能问题（全部已解决 ✅）

#### ✅ PERF-3：首页创世区块重复 fetch（已修复，2026-08-11 确认）
- **问题**：`fetchLatestBlocks` 每次调用都 `await publicClient.getBlock({ blockNumber: 0n })` 获取创世区块计算运行时间。创世区块内容永远不变，但每次刷新都多一次 RPC。
- **解决方案**：创世区块时间戳已硬编码为常量 `GENESIS_TIMESTAMP = 1664451960`（`Home.vue` 常量 `GENESIS_TIMESTAMP`），省去该 RPC 调用。

#### ✅ PERF-4：首页区块串行加载（已修复，2026-08-11 确认）
- **问题**：`for (let i = 0; i < 10; i++) { await publicClient.getBlock(...) }` 串行获取 10 个区块。
- **解决方案**：已改为 `await Promise.all(blockNumbers.map(n => publicClient.getBlock({ blockNumber: n })))`（`Home.vue` 函数 `fetchLatestBlocks`），并行加载。
- **关联**：原列于代码质量表，已提升为性能问题并解决

#### ✅ PERF-5：POP 历史加载无上限保护（已修复，2026-07-29）
- **问题**：`loadMyPopHistory` 对地址持有的所有 POP Badge 一次性全量加载（`balanceOf` → 全量 `tokenOfOwnerByIndex` → 全量 `tokenURI`）。每月签到产生 1 个，3 年社区用户约 36 个，目前可接受；但若将来出现异常账号（自动化签到或合约 bug），无任何保护。
- **解决方案**（已实现）：加上限 `MAX_POP_DISPLAY=50` + 分批加载 `POP_BATCH_SIZE=10`，显示总持有数，超出时提示"仅显示最近 N 条，共 X 条"。
- **实现**：`useCoreId.ts`（commit 3a52c0f / 0a2b772，2026-07-29）

### 🟢 低优先级问题

#### ✅ PERF-6：`jns.ts` 模块级 `console.log`（已修复，2026-08-11 确认）
- **问题**：模块加载时直接 `console.log('=== jns.ts Module Load ===')` + `JNS_ADDRESS`，每次 import 都执行，生产环境会持续输出调试日志。
- **解决方案**：已删除，`contracts/*.ts` 无残留 console.log。

---

## 四、代码质量待处理项

### 结构性问题（全部已解决 ✅，2026-08-11 确认）

| 优先级 | 问题 | 文件 | 说明 |
|--------|------|------|------|
| ✅ 已修复 | 地址交易历史根本缺陷（见 PERF-1 + P0-1） | `AddressDetail.vue` | getLogs 重构完成（2026-07-25） |
| ✅ 已修复 | `formatAddress/formatHash/formatAge` 各文件重复 | 各 View | 已抽 `src/utils/format.ts` 统一，各 View 均从 utils 导入，无本地重复 |
| ✅ 已修复 | `useBlockchain.ts` 死代码 | `src/composables/useBlockchain.ts` | 无引用，文件已删除 |
| ✅ 已修复 | `Home.vue` 区块串行加载（见 PERF-4） | `Home.vue` | 已改 `Promise.all` 并行加载 |
| ✅ 已修复 | `HelloWorld.vue` 脚手架残留 | `src/components/HelloWorld.vue` | 无引用，已删除 |

### 测试与类型检查基础设施（2026-10-24 ~ 10-26 建成）

> 这一段此前**完全缺失**：2026-08-11 的收尾只覆盖了运行时性能与死代码，测试/类型检查侧的三个盲区直到 10 月才逐个补齐。
> 记录于此避免后续误以为「质量项已全部收尾」。

| 项 | 内容 | 状态 | 落点 |
|---|---|---|---|
| 测试环境 mock | `tests/setup.ts` 装 `window.matchMedia` mock，`vitest.config.ts` 挂 `setupFiles` | ✅ 已合入 | PR #51（c570d0f）|
| `tests/` 纳入 typecheck | 新增 `tsconfig.test-vitest.json`（spec + setup + vitest.config）/ `tsconfig.test-node.json`（`jvaddress.test.ts`，node:test + 原生 strip-types），根 `tsconfig.json` references 追加两者 | ✅ 已合入 | PR #53（c2c6149）|
| mock 归因注释修正 | 查明真根因是 **jsdom 30.1.3 全包 0 处 `matchMedia` 实现**（非 node 版本差异、非 npm/pnpm 布局差异）；此前 CI 未暴露是因**无 spec 覆盖该路径**（覆盖盲区），非环境差异 | ✅ 已合入 | PR #54（8984455）|
| theme store 冒烟用例 | `tests/theme-store.spec.ts` 9 条（初始化 2 / 三态 4 / 写操作 2 / `$dispose` 清理 1），前两条初始化用例**不自装 mock**，完全依赖 `setup.ts` | ✅ 已合入 | PR #56（dd192ab → merge 20a19cc）|
| 多签治理端待执行交易编号 | `tests/gov-pending-ids.spec.ts` 7 条（id=0 保留 / 混合编号顺序 / 补齐位截断 / 非零编号不变 / 目标+selector 双重过滤 / pending=0 清空 / value>0 过滤），只 mock 合约读取，编解码走真实实现 | ✅ 已合入 | PR #62（08a5734…4b9b3cb → merge ac5d8ce）|
| 路由可达性门禁加固 | 2026-11-09 审计实测盲区：`route-gap.spec.ts` 只查「有无引用」不查「从入口可达」，删掉路由 + 加一个死模块引用即可全绿放行。改为从 `src/main.ts` + `src/router/*` 做传递闭包 BFS，只有真正可达的视图才不算孤立；新增 2 条反向用例（死模块绕过 / 多级不可达引用链） | ✅ 已合入 | PR #76（6447b43）|
| 部署基线常量冻结 | 2026-11-09 审计实测盲区：`deployment-verification.spec.ts` 的 reader 默认值取 `baselineBlock.hash` 再喂回被测代码，基线常量本身无守护——把 WJ 摘要末位 `…1e89` 改 `…1e88` 仍 5 passed 全绿。新增 `tests/deployment-baseline-frozen.spec.ts` 3 条，用独立副本冻结三地址摘要 + 基线块号/哈希，改基线必须双改、CR 可见 | ✅ 已合入 | PR #76（6447b43）|
| 路线图**状态词**一致性 | `tests/roadmap-status.spec.ts` 7 条（真实仓库 1 / 反向 3：未上线却已接线、待审核发布却已接线、已完成但路由不存在 / 正向 3：未上线且未接线、已完成且路由存在、无路由声明不误伤）。判据可执行：登记「待审/未上线」的模块其路由不应出现在 `src/router/index.ts`，「✅ 已完成」的模块声明路由必须真实存在 | ✅ 已合入 | PR #77（444ad6d）|
| 区块详情页对等字段（确认数 / extraData / 输入数据）| `tests/block-detail.spec.ts` 18 条纯函数用例（确认数 bigint 减法 / hex 解码 0x 前缀与大小写 / 不可打印字节判定 / 输入数据判据 / 折行）+ `tests/block-detail-view.spec.ts` 6 条视图用例（确认数呈现 / 不可读 extraData 不吐乱码 / 可读 extraData 给解读 / 纯转账不展示输入数据 / 最新高度失败时降级为 0 不拖垮页面 / 区块不存在不渲染确认数）。反向注入两次：Number 相减 → 1 failed，不剥 0x → 6 failed，去掉 `v-if` 输入数据判据 → 1 failed，均部分红 | ✅ 本分支 | 本 PR |
| 组件层用例（JNSVote 指南）| `tests/jnsvote-guide.spec.ts` 4 条（非签名人提示中性化 / 签名人无提示 / 步骤区为 `<ol>` 非完成态 / `DECISION_RULE_DISPLAY` 与判据同源）。**注意：这只补了一个组件，`src/components/` 整体仍无门禁**——`check-feature-roadmap.ts` 只扫 `src/views/`、`route-gap.spec.ts` 也只遍历 views，新增组件既不需登记路线图也不需写测试即可三道闸全绿（PR #87 期间实测确认） | ✅ 已合入 | PR #87（1a38ae7）|
| 合约工具 revert 解码 | `tests/revert-decode.spec.ts` 14 条（Error(string) 5 条含 UTF-8/32 字节边界 + Panic 映射 5 条 + 兜底健壮性 2 条 + 边界 2 条）。修复 `ContractTool.vue` 抽取到 `src/utils/revert.ts` 时发现的**真实解码 bug**：`Error(string)` 分支偏移量多算一格，任何标准 revert 消息都解成空串（详见下方教训）| ✅ 已合入 | PR #90 |
| 全局搜索输入解析 | `tests/search-resolve.spec.ts` 30 条（JNS/HEX/B32/交易/区块号五类 + 无法识别 + 帮助示例自校验）。抽自 `Home.vue handleSearch` 内联分支，改为 `src/utils/search-resolve.ts` 纯函数。修了两个真 bug：① 40 位全数字地址被 `/^\d+$/` 抢走当区块号；② 无法识别时静默 `push('/block/<乱码>')` | ✅ 已合入 | PR #95 |
| **交易详情四项对等** | 按 `docs/v1-parity-checklist.md` §2.3·C 补 v1 的四个字段：① 区块哈希行（`receipt.blockHash ?? tx.blockHash`，可点进区块页）② 地址标签（`src/utils/address-label.ts`，复用 `toolbox.ts` 12 合约注册表，11 条用例含大小写/空白/未注册不误判）③ ABI 解码切换（`src/utils/abi-decode.ts`，按 4 字节选择器索引 12 份 ABI 后 `viem.decodeFunctionData`，14 条用例含碰撞兜底与解不出返回 null）④ 双单位 Gas 价格与手续费（`src/utils/amount-dual.ts`，`1 J = 1e9 Gwei`，21 条用例含 2^53 精度边界）。另 `src/utils/add-chain.ts` 一键添加主网（EIP-3085 + EIP-3326，切换优先失败再添加，20 条用例覆盖 4902/4001/无钱包） | 🟡 待合入 | 本 PR |
| **签到 4100 未授权（账户状态分叉）** | 真实故障（2026-11-27 教链实测）：桌面 MetaMask 刷新页后点「签到」，钱包不弹签名框，直接报 `The requested method and/or account has not been authorized by the user.`（EIP-1193 **4100**），**断开再重连即好**。根因：界面校验用 `store.address`，写操作 `from` 用 **wagmi state**；`checkConnection()` 兜底曾用 `connect()` 补写 state，本会话已连过时必抛 `ConnectorAlreadyConnectedError` 被 catch 吞掉 → state 保留**旧账户** → 钱包判定该账户未授权。修复：① 新增 `src/utils/wallet-account.ts`（`correctStateAccount` 就地改写 state 账户，不再用会自我拒绝的 `connect()`）② store 增 `syncAccount()` / `reauthorize()` ③ 签到写前同步 + 显式 `account` ④ 4100 自愈（重授权 + 重试）与中文文案 ⑤ `App.vue` 全局 `watchAccount` 跟随换账户 ⑥ `isUnauthorizedProvider()` 按类型/码判定，与 4001 严格区分。用例 `tests/wallet-account.spec.ts` 12 + `tests/wallet-errors.spec.ts` +11 | 🟡 待合入 | 本 PR |
| **测试基线一致性门禁** | 治「基线腐烂」第三次复发：`docs/feature-roadmap.md` 的用例数**从未绑定任何会失败的检查**，靠自觉维护，于是 11-10 落后 231 条 / 11-11 落后 238 条 / 11-16 落后 4 条。新增 `scripts/check-test-baseline.ts`：实跑 vitest（JSON reporter）+ node:test（TAP reporter），把 vitest passed / files、node:test passed、合计、以及「计数口径提醒」行的三个数字逐项与文档比对，任一不等即 EXIT 1；测试自身有失败也拒绝给绿灯；文档自身不自洽（合计 ≠ 两项之和）同样拦。配套 `tests/test-baseline-gate.spec.ts` 15 条（正向 3 / 解析失败负向 4 / 数字不符负向 6 / 产物格式负向 2） | ✅ 已合入 | 本 PR |
**当前基线**（`explorer-v2` 分支 `c216a60`（本 PR 合入后），2026-11-27 实测）：`npm run build` EXIT 0 / `vitest run` **445 passed**（33 files）/ `node --test tests/jvaddress.test.ts` **3 passed**（合计 **448** 条）。

> 基线演进：13（PR #51~#54 前）→ **22**（PR #56 theme store 9 条）→ **29**（PR #62 gov-pending-ids 7 条）→ **209**（PR #69 路线图检查器 + 之前各批用例）→ **260**（PR #75 前实测，20 files）→ **267**（PR #77 roadmap-status 7 条，21 files）→ **272**（PR #76 路由可达性净增 2 条 + 部署基线冻结 3 条，22 files）→ **276**（PR #87 补 `tests/jnsvote-guide.spec.ts` 4 条，23 files）→ **290**（`tests/revert-decode.spec.ts` 14 条，24 files）→ **314**（区块详情页对等：`tests/block-detail.spec.ts` 18 条 + `tests/block-detail-view.spec.ts` 6 条，26 files）→ **344**（全局搜索输入解析：`tests/search-resolve.spec.ts` 30 条，27 files）→ **359**（基线门禁 `tests/test-baseline-gate.spec.ts` 15 条，28 files）→ **427**（交易详情四项对等 + 一键添加主网：`tests/address-label.spec.ts` 11 + `tests/abi-decode.spec.ts` 14 + `tests/amount-dual.spec.ts` 21 + `tests/add-chain.spec.ts` 22，32 files）→ **445**（签到 4100 根因修复：`tests/wallet-account.spec.ts` 12 + `tests/wallet-errors.spec.ts` +11，33 files）。
> 上表各项现全部为「已合入」。**2026-10-30 这批（#57/#58/#56/#59）与 2026-11-03 这批（#60/#61/#62）均已全部 merge**；#76 与 #77 于 2026-11-13 合入，#87 于 2026-11-15 合入，#90/#91/#93/#94/#95 于 2026-11-20 合入；open PR 仅剩 **#78**（维持不合入，待作者在独立 repo 落地自持地址表/可安装/补 LICENSE）。
>
> ⚠️ 计数口径提醒：`npm test` = vitest **445** + node:test 3 = **448 条**。写 PR 描述或文档时别只抄 vitest 数字又说「npm test N passed」——PR #62 描述里写「vitest 22 passed」就是这个错（当时实际已是 29）。
> ✅ **本行已由 `scripts/check-test-baseline.ts` 强制守护**（2026-11-16 起）。此前它无任何会失败的检查绑定，只能靠自觉，先后腐烂三次（11-10 落后 231 条、11-11 落后 238 条、11-16 落后 4 条）。现规则有牙齿：数字不符 CI 直接红，`npm run check:baseline` 本地可复现。

**两条必须记住的规则**：

1. **`vue-tsc -b` 只走 `references`**，新增目录（如 `tests/`）不主动挂 project 就**永远假绿**。验证覆盖是否成立只能用**负向注入**（往目标文件写一行类型错误，看 `build` 是否变 EXIT 2），不能看「build 成功」就当覆盖了。
2. **写测试必须做反证**：断言通过 ≠ 覆盖成立。绿可能来自 ①真的覆盖了 ②自己重复造了被测依赖（在 `beforeEach` 里自装 mock，spec 压根没依赖 `setup.ts`）③压根没执行到断言。唯一判定法是——**把你声称守护的那个依赖拿掉，看测试是否变红**。PR #56 第一版就是典型的假覆盖：9 条全绿，但摘掉 `setup.ts` 的 mock 后仍然 9 条全绿。

**2026-11-17 新增第 3 条教训（真实线上 bug）**：`src/components/ContractTool.vue` 的 `decodeRevertReason` 里 `Error(string)` 分支偏移量多算一格（`slice(offset + 64, offset + 128)` 当作长度字），导致**任何标准 revert 消息都解码成空串**——用户在合约交互工具里发交易失败，看到的永远是「❌ 上链失败，错误信息是：」后面一片空白。`offset` 已是「字节偏移 × 2 = hex 字符偏移」，再 +32 字节（+64 字符）就越过了长度字、直接读进内容区，parseInt 得到 `4.7e76` 这种量级，最终 slice 越界。

它能在线上活很久的原因不是隐蔽，而是**恰好落在所有门禁的盲区交集**：组件层不在 `check-feature-roadmap.ts` 扫描范围（只扫 `src/views/`）、不在 `route-gap.spec.ts` 遍历范围（同样只 views）、也没有任何 spec 引用它。三道闸全绿。

另一层：这个函数**纯、无副作用、10 行**，是整条链路上唯一可离线验证的部分，却被埋在 673 行组件里。抽到 `src/utils/revert.ts` 后 14 条用例 10ms 跑完。**「能在 10 毫秒内测完的逻辑，不要留在需要模拟钱包、RPC、区块确认的地方」**——不是测试难写，是位置放错了。

**合并请求自动验收（本分支新增，尚未上线）**：`pr-validation.yml` 对目标 `explorer-v2` 的合并请求执行路线图检查、`npm test` 与 `npm run build`；还支持合并队列与手动触发。只读权限、无部署步骤，不更改原 Pages 工作流。平台运行与必需状态检查仍待提交后由维护者确认；首次外部分支运行可能需要批准，不能把“无检查”当成通过。详见 `docs/pr-validation.md`。

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

## 五、开发优先级建议

```
当前主线（2026-11-17 目标修订后）────────────────
  P5-1 ~ P5-8  v1 功能 100% 对等补齐（详见 §二 P5 与 docs/v1-parity-checklist.md）
                切换判据：清单 100% 打勾 + 双跑对照无差异 → v1 方可 302

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
  P3-1    JNSVote 治理投票 — ✅ 全部完成（列表/详情/写操作/资格校验/进度实时，2026-10-22 核实；/tools 入口卡片可点化随 PR #48 于 2026-10-22 合入，无残留）

2026-08-11 已清理（代码质量/性能收尾）────────
  ✅ format.ts 统一（utils/format.ts）
  ✅ useBlockchain.ts 死代码删除
  ✅ HelloWorld.vue 脚手架删除
  ✅ PERF-3 创世区块硬编码（GENESIS_TIMESTAMP）
  ✅ PERF-4 Home.vue 区块并行加载
  ✅ PERF-6 jns.ts console.log 清理
  ✅ GitHub Pages 正式部署配置（hmisty 仓库）

已作废 ─────────────────────────────────────────
  ~~P4 废弃功能（维持现状，不主动实现）~~ → 2026-11-17 撤销，转为 P5 补齐批次
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

> ⚠️ **2026-11-17 更新**：本节只记了「v1 2026 年新增」的遗漏。**完整遗漏面远不止于此**——
> v1 的路由 `/did/:jnsId`、`/cryptojunks*`、`/redpacket*`、合约验证、事件订阅面板、
> 首页 Free/Reserved Energy、一键添加主网、ABI 解码、JNS 打赏、新手加油、`.j` 地址解析
> 等当时都未列入计划。完整字段级基线见 [`docs/v1-parity-checklist.md`](./v1-parity-checklist.md)。

---

## 七、外部部署说明

| 部署目标 | 地址 | 状态 |
|---------|------|------|
| GitHub Pages（fork） | `https://xiaopiao009.github.io/jouleverse-explorer-v2/` | ✅ 运行中 |
| GitHub Pages（上游正式） | `https://hmisty.github.io/jouleverse-explorer-v2/` | ✅ 已配置（2026-08-11，source: explorer-v2 分支，已 built） |

### 钱包交互环境域名要求

涉及钱包连接、签名、转账等写操作的场景，对部署域名有硬性要求：

| 场景 | 域名要求 | 说明 |
|------|---------|------|
| 生产环境 | **自持域名** + 自有 HTTPS 证书 | 禁止使用免费共享隧道域名 |
| 真机测试 | localhost + 局域网代理（钱包 App 与开发机同网段） | 或通过正规域名完成 |
| 纯页面预览 | 共享免费隧道可用 | 仅限无钱包交互的展示 |

**为什么不能用共享免费隧道域名**：cloudflared 免费快速隧道（`*.trycloudflare.com`）、localtunnel、ngrok 免费域名等共享子域，会被 MetaMask 等钱包的安全策略标记为「高风险 / 恶意域名」，导致钱包连接、签名、转账等写操作失效。

来源：PR #28（wallet injected connector）真机测试期间实测，`*.trycloudflare.com` 被 MetaMask 拦截（见 issue #34）。

### RPC 端点配置（2026-10-29 起，PR #59）

链上读写全部走 **无端口正式端点**，旧 `:8503` / `:8505` 已废弃：

| 用途 | 端点 |
|------|------|
| HTTP RPC | `https://rpc.jnsdao.com` |
| WebSocket | `wss://rpc.jnsdao.com/ws` |

- 落点：`src/config/client.ts`、`src/config/chain.ts`、`src/stores/wallet.ts` 及 `CoreIdCheckIn.vue` / `WJOperations.vue` / `JNSVote.vue` / `JNSVoteProposalDetail.vue` 用户提示文案，共 10 处硬编码
- 验收（2026-10-30）：构建产物 `dist/assets/*.js` 内 `rpc.jnsdao.com` 命中 9 处、`:8503`/`:8505` 残留 **0**；
  `scripts/smoke-jnsvote.mjs` 真实链 10/10 通过（含 WS 收到 2 个区块，间隔 15.2s，块号单调递增）
- ⚠️ 新代码**不得**再引入带端口端点；jscan v1（`/var/www/explorer/app/.rpc.txt`）仍为 `:8503`，属遗留待处理

---

*最后更新：2026-11-20（大白 💎）—— P5-1 收尾两项：**交易详情四项 v1 对等**（区块哈希行 / 地址标签 / ABI 解码切换 / Gas 双单位）+ **一键添加主网**（EIP-3085，切换优先、4902 时自动添加）。新增 4 个纯函数模块与 66 条用例（address-label 11 / abi-decode 14 / amount-dual 21 / add-chain 22），基线 359 → **427 passed（32 files）**，含 node:test 3 = 430。反向注入 6 组验证用例有效性，其中「手续费用 Number 相乘」第一版**未变红**（3e19 恰好能被浮点精确表示），补了 2^53+1 边界的对账用例后才真正锁住 bigint 路径——反向验证本身也会假绿。真实链验证锚点交易 0x76c241e5…（块 8664408）：接收方标签 `JVCore 核心身份`、解码出 `checkIn(uint256)` tokenId=18、gasPrice 2.500000007 Gwei、手续费 0.000610815 J 与 gasUsed×gasPrice 对账一致。*
*（同日修正）教链指出 EIP-3085 的 `chainName` 应为「Jouleverse」而非「Jouleverse Mainnet」——钱包里已按前者建过网络，传后者会被当成另一条新链再添一遍。同步改 `src/config/chain.ts`（它原本与 `stores/wallet.ts` 的 `name` 不一致），补 2 条用例锁死网络名与「RPC 不带显式端口」（用 `URL.port` 判定而非 grep 字符串），反向注入两组均验红。*
*（同日另记）新增**测试基线一致性门禁**（`scripts/check-test-baseline.ts` + 15 条用例 + CI 步骤）；区块详情页对等（确认数 / extraData / 交易输入数据）、revert 解码修复、全局搜索五类输入解析、v1 100% 对等目标修订均已合入主线。*


### PR #66 审计补全（2026-11-03）

新增两个只读目录已登记到 §一；本分支共 18 个视图、模块编号 1–31。覆盖度脚本改为按表头/自检标记提取，避免固定行号漏掉新增行；`tests/feature-roadmap.spec.ts` 自动检查视图覆盖、重复/跳号和自检数字。编号仅对应本分支，#65/#67 等并行 PR 合入时须保留条目并按主线末尾顺延，同步实际视图数。检查点名单仅代表该高度的节点响应快照，不代表实时授权集合、节点在线、seal 已验证或逐块出块者。
