# 生态资产目录 + 地址资产中心 · M1 开工前方案文档

**任务**：地址页资产分区（配置驱动 + 一次 multicall 加载层）
**Issue**：#21（hmisty/jouleverse-explorer-v2）
**分支**：`feat/asset-center-m1`（自 `upstream/explorer-v2` @ 5f03775）
**状态**：开工前方案 · 待开工
**日期**：2026-10-16

---

## 0. 上游反馈结论（@dabai2140 代教链回复，2026-10-16）

方向认可、方案基本可行，确认后的技术组合如下（**本方案以此为唯一依据**）：

| 环节 | 确认方案 |
|---|---|
| 1 托管 | A 起步，配置文件驱动（为迁 B 铺路） |
| 2 范围 | 首批仅官方 6 合约 |
| 3 图标 | 官方=仓库内本地图标；用户=链上元数据 + `data:image/` 白名单 |
| 4 形态 | 地址页资产分区（**增强，非新模块**）+ 独立路由域名发现页（M2，带缓存） |
| 5 边界 | JNS 持仓面板归并；**WJ 操作区原位保留**（只余额展示纳入） |
| 6 RPC | 余额类一次 multicall；NFT 枚举分页懒加载；发现页预生成/缓存 |
| 新增 | 资产排序规则 M1 定死 |

**两个定位纠正（必须遵守）**：
1. 「资产中心」不是新模块，是 `AddressDetail.vue` 的增强。⚠️ 不另起炉灶做独立路由/模块。
2. 性能铁律：**严禁循环里逐个 `await balanceOf`**；余额类必须「收集 → 一次 multicall3 聚合」。

**分阶段**：M1 地址页资产分区 → M2 JNS 域名发现页（缓存/预生成）→ M3（长期可选）链上注册表。

---

## ① 功能规格书（M1 范围）

### 1. 范围（做什么）

- [ ] 新建 `config/core-assets.ts`：类型 + 官方 6 合约资产数组（M1 即配置文件驱动，组件只消费配置、不关心来源）
- [ ] 新建余额加载层：收集全部余额类查询（原生 J 用 `getBalance`，其余 `balanceOf`）→ **一次 multicall3 聚合**
- [ ] `AddressDetail.vue` 内新增「资产」统一分区，替代现有 J / WJ / JNS 三个各写各的面板
- [ ] 资产排序：原生币 J 永远第一 → ERC20 按余额降序 → NFT 按持有数降序（同类型内固定顺序）
- [ ] NFT 枚举类（JNS / POPBadge / CoreID / JTI / JNSVote SBT）分页懒加载：首屏只显示「共持有 N 个」+ 前几个，「加载更多」再拉

### 2. 非目标（明确不做什么）

- [ ] 不做独立 `/assets` 浏览页、不做独立「资产中心」路由
- [ ] 不改 `/jns`（按名字查询场景保留不动）
- [ ] 不做 JNS 域名发现页 `/domains`（属于 M2）
- [ ] 不做第三方资产收录、链上注册表（M3）
- [ ] 不动 WJ 操作区（WJOperations 原位保留）

### 3. 验收标准（每条可测、可判定）

- [ ] 配置文件驱动：新增资产 = 加一条配置，不改组件代码
- [ ] 余额类加载：6 个合约 `balanceOf` + 1 个 `getBalance` 合计 RPC ≤ 2 次（1 multicall + 1 getBalance）
- [ ] 排序正确：J 第一 → WJ（ERC20）→ NFT 按持有数降序
- [ ] NFT 首屏只出「共持有 N 个」+ 前几个，点「加载更多」再拉下一批
- [ ] JNS 持仓面板已并入资产分区；WJ 操作区仍可正常存取

### 4. 数据源 / 依赖

- 合约：`wj.ts` / `jns.ts` / `popbadge.ts` / `jvcore.ts` / `jnsvote.ts`（JTI 在 jnsvote.ts）
- 复用：`publicClient`（chain 3666，multicall3 自部署 `0x52E8BB61...`）、`JvAmount`、`JvLoading`、`JvPageState`、`JvHashText`
- 复用已有分页模式：`useCoreId` 的 POP 历史分页、`fetchJnsHoldingBatch` 的 multicall 两步法

---

## ② 技术方案

**架构决策**：配置驱动 + 一次 multicall 加载层。所有余额类资产统一走 `balanceOf`（ERC20/ERC721 签名一致），用**一份最小 balanceOf ABI** 即可覆盖全部，配置只需声明地址/符号/图标/类型，不携带 ABI。

### 1. 数据流

```
config/core-assets.ts（资产数组）
        │
        ▼
useCoreAssets(address) 加载层
  ├─ 余额类：getBalance(J) + multicall[balanceOf × 6 合约]（allowFailure: true）
  ├─ 结果 → { key: 余额/数量 } 映射
  └─ 排序：J → ERC20(余额降序) → NFT(数量降序)
        │
        ▼
AddressDetail.vue「资产」分区（v-for 渲染配置，不关心来源）
  ├─ native/erc20 → JvAmount
  └─ erc721 → 「共持有 N 个」+ 前几个（懒加载枚举）
```

### 2. 关键决策记录

| 决策 | 选项 | 结论 | 理由 |
|---|---|---|---|
| 资产中心形态 | 新模块 vs 增强 AddressDetail | **增强** | 教链明确定位：地址页即事实上的资产中心 |
| 余额类加载 | 循环 await vs 一次 multicall | **一次 multicall** | 教链铁律，成本近乎恒定 |
| balanceOf ABI | 各合约独立 ABI vs 统一最小 ABI | **统一最小 ABI** | ERC20/ERC721 签名一致，配置不携带 ABI，加资产零改组件 |
| 配置位置 | 硬编码散落 vs config/core-assets.ts | **config 独立文件** | 教链要求 M1 即配置驱动，M2 迁 B 只换加载层 |
| 排序 | 无序 vs 规则排序 | **J→ERC20降序→NFT降序** | 教链补充，M1 定死防 UI 乱 |
| JNS 面板 | 独立保留 vs 归并 | **归并** | 教链确认，JNS 是资产的一种 |

### 3. 复用 vs 新造

- 复用：`publicClient.multicall`、`JvAmount`、`JvLoading`、`JvPageState`、`JvHashText`、`parseTokenURI`、`fetchJnsHoldingBatch` 的两步 multicall 模式
- 新造：`config/core-assets.ts`（配置）、`useCoreAssets`（一次 multicall 余额加载 + 排序）。**仅当无可复用时新造**，此处为配置驱动的核心，无现成可复用。

---

## ③ 边界清单

### 五态

- **空态**：全部资产余额为 0 → 分区显示「暂无资产」，不报错
- **加载态**：`JvLoading`，分区占位不跳动
- **错误态**：`allowFailure: true` 单项失败置 `null`，不阻断整区；全失败显示 `JvPageState network-error` + 重试
- **切换态**：地址路由切换时重查（`watch` 地址 + 竞态保护：`requestId` 令牌丢弃过期结果）
- **竞态**：排序渲染与懒加载枚举并发；「加载更多」防重复点击（loading 守卫，复用 JNS 现有模式）

### 异常处理

- **balanceOf 失败**：单项 `null`，展示「—」，不影响其它资产
- **getBalance 失败**：J 余额 `null`，不报全局错
- **tokenURI 解析失败**：`parseTokenURI` 返回 `null`，跳过该项（复用现有）
- **订阅清理**：M1 余额类无订阅；若枚举走 `watchBlockNumber` 则必须在 setup 顶层同步注册 cleanup

---

## ④ 性能预算

| 指标 | 目标 | 手段 |
|---|---|---|
| 余额类 RPC | ≤ 2 次（1 multicall + 1 getBalance） | 收集后一次聚合，禁循环 await |
| NFT 枚举首屏 | 只出「N 个」+ 前几个 | 分页懒加载，复用每批 ≤10 模式 |
| 首屏 | < 1.5s | 资产区与转账记录并行，不串行等待 |
| 交互反馈 | < 100ms | 点击立即 loading 态 |
| 帧率 | 60fps | 无动画（静态面板），DOM 分批渲染 |

---

## ⑤ UI / 交互规范

- 一个分区一个核心任务：资产概览
- 复用 `JvAmount`（金额）、`JvHashText`（地址）、`JvLoading`、`JvPageState`
- NFT 列表分批渲染（复用 JNS 每批 10 个），不一次渲染几百 DOM

---

## ⑥ 测试计划

- [ ] 功能测试：6 合约余额正确显示；排序 J→WJ→NFT 降序正确
- [ ] 边界测试：③ 清单每条过（空/加载/错误/切换/竞态）
- [ ] 回归测试：`vue-tsc -b` + `vite build` + 手工点击（WJ 操作区不受影响）
- [ ] 性能验证：RPC 次数实测 ≤2（余额类）

---

## ⑦ 审核清单（提交前自审）

- [ ] 换 GLM-5.3 自审：逐条过 ①~⑥
- [ ] 重点查：性能预算（一次 multicall）+ 边界清单 + 竞态
- [ ] 自审发现缺陷 → 自我修正 → 复测通过
- [ ] 发用户审查 → 用户点头 → 提交 J-25（**未点头前绝不 push/PR**）
