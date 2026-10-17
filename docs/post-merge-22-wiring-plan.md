# PR #22 合并后的接线方案（post-merge-22 wiring plan）

> 本文为「PR #22（feat/jns-domains-overview）合并进 explorer-v2 之后」的施工准备方案。
> 撰写日期：2026-10-17。当前均为**待接线**事项，不随 PR #22/#23 一起提交。
> 依据：git log / 已核实源码（router/index.ts、JNSVote.vue、ToolsHome.vue、useJNSVote.ts、CoreAssetsPanel.vue、core-assets.ts）。

---

## （一）JNSVote 提案详情页接线

### 现状

- 组件已就绪：`feat/jnsvote-proposal-detail` 分支（commit `849ad64`），含
  - `src/composables/useProposalDetail.ts`（复用 jnsvote.ts `_proposals` getter，不新增 ABI）
  - `src/views/JNSVoteProposalDetail.vue`（`proposalId` prop 驱动，投票复用 `useJNSVote` 的 `vote()` / `checkEligibility` / `checkVoted`）
- 该分支基于 `upstream/explorer-v2` @ 5f03775，与 PR #22/#23 无文件重叠。

### 后续步骤（PR #22 合并后执行）

1. **router/index.ts**：新增 `/jnsvote/:id` 路由（`name: 'jnsvoteDetail'`，component `JNSVoteProposalDetail`，`props: true`）。注意 `JNSVoteProposalDetail` 已按 `proposalId: number` prop 定义。
2. **JNSVote.vue**：提案卡片 `.proposal-card` 增加 `@click` 跳转（`router.push('/jnsvote/' + p.id)`），或加一个「详情」按钮。当前卡片无任何点击跳转。
3. **ToolsHome.vue**：已有 JNSVote 入口，若详情页需独立入口可加（通常不需要，从列表页进入即可）。

### ⚠️ 已知隐患：useJNSVote 是实例状态，详情页投票后列表页不会自动刷新

- `useJNSVote()` 内的 `proposals` / `votedProposals` / `eligibility` 都是**组件实例内**的 `ref`。
- 详情页 `JNSVoteProposalDetail.vue` 会**各自 new 一个** `useJNSVote()` 实例；投票成功后只更新详情页实例的本地状态，列表页（JNSVote.vue）的 `votedProposals` / 票数**不会联动**。
- 若详情页与列表页是**两个不同路由组件**（用户点详情跳走、返回列表），返回时列表页会重新 `onMounted` 加载，票数可自然刷新；但若用户在同页面「详情+列表」并存（如侧栏），则不会。
- **建议方案（三选一，接线时定）**：
  1. **详情页 emits 事件**：`JNSVoteProposalDetail` 投票成功后 `emit('voted', { proposalId })`，列表页监听后重载该提案（或全量 `loadProposals({ silent: true })`）。改动最小。
  2. **返回列表时重载**：详情页路由返回列表页时触发 `loadProposals`（依赖路由守卫/onActivated），最简单但依赖导航时机。
  3. **共享同一 composable 实例**：将 `useJNSVote` 提升为跨组件共享（provide/inject 或 pinia store），列表页与详情页读同一份 `proposals`/`votedProposals`。最彻底，但改动面最大。

### 与 PR #22 的文件重叠点

| 文件 | PR #22 改动 | 详情页接线改动 | 冲突？ |
|---|---|---|---|
| `src/router/index.ts` | 加 `/domains` 路由 | 加 `/jnsvote/:id` 路由 | **同一文件，不同行**，合并时需注意顺序（`/jns/:name` 与 `/jnsvote/:id` 不冲突，`/domains` 静态段也不冲突） |
| `src/views/ToolsHome.vue` | 加 /domains 入口 | （详情页通常不加独立入口） | 低 |
| `src/views/JNSVote.vue` | 无 | 卡片加 @click | 无 |

**合并顺序**：先合 PR #22（#22 改动较小、已在等 review），再基于合并后的 explorer-v2 做详情页接线（新开分支），避免在 PR #22 未合并时同时改 router/index.ts 造成冲突。

---

## （二）i18n 迁移清单（PR #23 内的中文硬编码）

> 背景：7 语种 i18n 基建只在 PR #22（feat/jns-domains-overview）分支，尚未合并进 explorer-v2。因此 PR #23（feat/asset-center-m1）的中文文案目前是硬编码 + `TODO(i18n)` 标注，待 #22 合并后统一迁移。

文件：`src/components/CoreAssetsPanel.vue`（含新增的 NFT 枚举文案）。

| 位置 | 中文硬编码 | 建议 i18n key | 备注 |
|---|---|---|---|
| `JvLoading` label | 资产加载中... | `assetsLoading` | |
| `JvPageState` action | 重试 | `retry`（复用 #22 已有 key） | #22 的 `retry` 已是通用 key |
| 空态 title | 暂无资产 | `noAssetsTitle` | 已加 `TODO(i18n)` 标注 |
| 空态 description | 该地址暂未持有任何生态资产 | `noAssetsDesc` | 同上 |
| 展开按钮 | 展开 / 收起 | `expand` / `collapse` | NFT 枚举二级懒加载新增 |
| 枚举明细头 | {name} 明细 | `nftDetailSuffix`（如 `{name} 明细`） | |
| 枚举加载 | 加载中... | `loading`（复用） | |
| 枚举失败 | 枚举失败：{err} | `enumError`（`枚举失败：{err}`） | |
| 枚举加载更多 | 加载更多（已显示 {loaded} / {total}） | `loadMoreProgress` | |
| JNS 明细头 | JNS 域名持有明细 | `jnsHoldingDetail` | |
| JNS 读取失败 | 域名数量读取失败，无法确定持有数量 | `jnsCountUnknown` | |
| JNS 加载更多 | 加载更多（已显示 ...） | `loadMoreProgress`（复用） | |
| JNS 溢出提示 | 前往 JNS 查询页 可查看全部域名 | `jnsOverflowHint` | |
| `formatCount` 单位 | 万 / 亿 | `tenThousand` / `hundredMillion` | 已加 `TODO(i18n)` 标注；注意英文语境可能需换 K/M/B 缩写，接线时定 |

另有 `src/composables/useNftEnumeration.ts` 两处中文兜底文案：
- `(读取失败)` → 建议 key `enumReadFailed`
- `（元数据读取失败）` → 建议 key `enumMetadataFailed`

**注意**：上述 key 需 **7 语种同步补齐**（en / zh-Hans / zh-Hant / ja / ko / de / fr），沿用 #22 的 `en.ts` 为键来源 + `I18nDict = typeof en` 编译校验模式。

---

## （三）官方图标替换清单

> 当前 `src/config/core-assets.ts` 的 `icon` 字段是 emoji 占位，维护者要求「官方资产图标走仓库内本地文件」。

### 需要的 7 个图标

| asset key | 名称 | symbol | 当前 emoji |
|---|---|---|---|
| j | Joule（原生币） | J | ⚡ |
| wj | Wrapped Joule | WJ | 💰 |
| jns | JNS 域名 | JNS | 🏷️ |
| popbadge | POP 签到徽章 | POPBadge | 🎖️ |
| coreid | Core ID | JVC | 🆔 |
| jti | JTI 认证标识 | JTI | 🪪 |
| jnsvote | JNSVote 投票徽章 | JNSVote | 🗳️ |

### 建议

- **格式**：SVG（矢量、体积小、可随主题变色）；如官方只给 PNG，可先 PNG 后转 SVG。
- **命名规范**：`asset-j.svg`、`asset-wj.svg`、`asset-jns.svg`、`asset-popbadge.svg`、`asset-coreid.svg`、`asset-jti.svg`、`asset-jnsvote.svg`（前缀 `asset-` 防与品牌 logo 混）。
- **存放目录**：`src/assets/icons/`（7 个官方资产 SVG 已在 PR #23 落地于此目录，详见下方「状态」）。
- **替换方式**：`core-assets.ts` 的 `icon` 字段从 emoji 改为 import 的本地 SVG 路径（或 URL）；渲染方式见下方 mask 注意项。

**状态**：7 个官方资产 SVG（`asset-j` / `wj` / `jns` / `jnsvote` / `jti` / `popbadge` / `coreid`）已在 **PR #23 落地、待合并**，路径 `src/assets/icons/`。

> ⚠️ 渲染方式注意（#23 审计踩坑记录）：单色 SVG 若用 `<img :src>` 加载，SVG 是独立文档，`currentColor` 解析为默认黑色，宿主页 CSS 变量传不进去，暗色模式下图标全黑不可见。正确做法是 **CSS mask + background: currentColor**（`CoreAssetsPanel.vue` 已按此实现：模板 `<span class="asset-icon">` + 内联 mask-image，颜色由宿主 CSS 变量驱动，暗/亮自动跟随）。

---

## 附：本方案对应的「未提交文档改动」范围

- 本文档为纯规划文档，不改任何业务代码。
- 配套的 `docs/feature-roadmap.md` P3-1 措辞修正（POAP→JNSVote SBT 徽章 + 资格校验，更新完成度）已在 explorer-v2 分支完成，核对日期 2026-10-17。
