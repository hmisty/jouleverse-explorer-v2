# v1 → v2 功能对等清单（100% 移植目标）

**文档日期**：2026-11-17
**维护人**：大白（💎）
**状态**：📋 立项（本节为后续开发的唯一“对等基线”）

---

## 一、目标修订：从「MVP + 选择性移植」改为「100% 对等替代 v1」

### 1.1 旧目标（2026-03-18 制定，现作废）

`explorer-v2-mvp-plan.md` 与 `jouleverse-explorer-refactor-plan.md` 当初的判定是：

> MVP 原型 → 增量移植 → **果断废弃旧功能**

并按「使用频率低 / 与浏览器核心定位不符 / 复杂度高」为理由，把以下模块列为「考虑废弃」：

- CryptoJunks NFT（`/#/cryptojunks`）
- Redpacket 链上红包（`/#/redpacket`）
- 合约验证功能（v1 地址页内嵌的 solc 编译 + 字节码比对）

### 1.2 新目标（2026-11-17 教链确认，本文件为准）

> **v1 的全部功能 100% 移植到 v2，尽快达到可替代 v1 的可用性。**

废弃结论**全部作废**。理由：

1. **离线即失守**：只要 v1 还托管着任何一个独占功能，v1 就一天不能下线，v2 就永远是「更好的前端」而不是「替代品」。运维成本、双份 RPC 压力、双份安全面都持续存在。
2. **废弃判断本身证据不足**：「使用频率低」没有量化依据；实际上 `redpacket` 是社区发红包的入口、`cryptojunks` 是 10000 枚铭文的唯一浏览入口，两者都不是「可以悄悄消失」的功能。
3. **钱包交互链路已打通**：v2 已有 wagmi/viem + 设计系统 + 多签治理端，原先「复杂度高」的阻力已大幅降低。
4. **替代要能真正切换**：切换动作（DNS / 302 / 公告）之前，必须先做到 100% 对等，否则切换即回滚。

### 1.3 达成判据（可执行，不靠主观判断）

一个功能算「已对等」，必须同时满足：

1. **入口等价**：v1 的路由在 v2 有对应路由（或明确的功能合并说明），站内导航可直达；
2. **读写等价**：v1 能查的字段、能发的交易，v2 都能做；**语义口径**一致（同一笔量是什么、怎么算）；
3. **边界等价**：v1 的限制与告警（额度上限、资格校验、不可逆提示）在 v2 同样存在，且**不得放宽**；
4. **门禁覆盖**：该视图已在 `docs/feature-roadmap.md` 登记，`node scripts/check-feature-roadmap.ts` 通过；有可离线验证的逻辑必须有 spec（见 AGENTS.md 原则五）；
5. **真实链验证**：至少一次对 `https://rpc.jnsdao.com` 的真实读写验证记录（脚本或人工截图），写进 PR 描述；
6. **呈现以 v2 为准，不向 v1 回退**（教链 2026-11-18 明确定调）：

   > jscan2 新版的 timelock、最新区块、稳定运行时间等呈现细节均比 v1 更好，不必再向 v1 版本倒退。

   对等的是**能力与语义**，不是**像素与文案**。凡是 v2 已经更好的呈现层（布局、单位、精度、可读性、交互反馈），一律保持 v2 做法，**不得为了「跟 v1 一样」而做得更难读**。

   判据：若 v1 的呈现存在下列任一问题，v2 必须用自己的更优做法，且在该模块的记录里写明「语义对等 / 呈现优于 v1」：
   - 单位重复或歧义（例：v1 能量写作 `636M J`，M 与 J 并存）；
   - 精度损失（例：v1 把 24,000,000 J 压成 `24M`，看不出细节）；
   - 已过时的技术痕迹（例：只给单档数字、无加载/错误态、无实时推送）。

> ⚠️ 只写「已实现」不算数。第 5 条是硬要求——历史上多次出现「代码合了但线上不可用」。
> ⚠️ 第 6 条是 2026-11-18 的实际返工教训：PR #92 第一版把 v1 的「Free/Reserved 两卡 + `636M J`」当成了对等目标，被教链纠偏。**拿落后当标准，比不做更糟**——它会主动把已经更好的界面改差。
>
> ⚠️ 2026-11-19 补记：PR #92 第二版（改成 v2 卡片样式的全宽聚合卡）仍被否决——**光把呈现改得好看不够，语义本身错了就不该做**（`used≠流通`、`available≠锁中`）。教训萃取为两条：① 不要在更好的界面上「画蛇添足」加聚合卡；② **先验证 v1 的字段语义是否成立，再把它当对等目标**——本项已从缺口表删除。

---

## 二、v1 功能全量盘点（权威基线：`jscan.jnsdao.com` / `~/git/explorer`）

> 基线取自本地 v1 仓库 `~/git/explorer`（HEAD `7371e07`，RPC 已切无端口端点），
> 路由表来自 `app/app.js`，页面来自 `app/views/*.html`，控制器来自 `app/scripts/controllers/*.js`。

### 2.1 v1 路由与 v2 现状对照

| v1 路由 | v1 页面 / 控制器 | v2 对应 | 对等状态 |
|---|---|---|---|
| `/#/` | `main.html` / `mainController.js` | `/` `Home.vue` | 🟡 部分（见 §三 A） |
| `/#/block/:blockId` | `blockInfos.html` | `/block/:number` `BlockDetail.vue` | 🟡 部分（仅支持高度，不支持哈希；缺确认数/extraData 文本） |
| `/#/tx/:transactionId` | `transactionInfos.html` | `/tx/:hash` `TransactionDetail.vue` | 🟡 部分（缺 ABI 解码、地址标签、区块哈希跳转） |
| `/#/address/:addressId` | `addressInfo.html`（618 行） | `/address/:address` `AddressDetail.vue` | 🟡 部分（资产面板覆盖 7 类，v1 有 9 类，见 §三 C） |
| `/#/did/:jnsId` | `addressInfo.html`（DID 视图复用） | ❌ **无路由** | ❌ 缺失 |
| `/#/cryptojunks` | `junksInfo.html` | `/cryptojunks` `CryptoJunks.vue` | ✅ 已对等（P5-4，2026-11-25） |
| `/#/cryptojunks/page/:pageId` | 同上 | `/cryptojunks/page/:pageId` `CryptoJunks.vue` | ✅ 已对等（P5-4；页号方案原样保留 0-99/1000-1002/10000/100000/1000000） |
| `/#/cryptojunks/page/:pageId/id/:junkId` | 同上 | `/cryptojunks/page/:pageId/id/:junkId` `CryptoJunks.vue` | ✅ 已对等（P5-4；单枚模式只拉那一枚） |
| `/#/redpacket`（创建） | `redpacketInfo.html` | ❌ 无（仅 toolbox 里有 redpacket 合约工具页） | ❌ 缺失（原判「废弃」，现要求移植） |
| `/#/redpacket/:redpacketId`（抢） | 同上 | ❌ 无 | ❌ 缺失 |
| `/#/jns/:jnsId` | `jnsInfo.html` | `/jns/:name` `JNSQuery.vue` | 🟡 部分（缺打赏/owner-only mint） |
| `/#/jnsvote/` | `jnsVoteInfo.html` | `/jnsvote` `JNSVote.vue` | ✅ 对等并超出（v2 有详情页 + 治理端） |
| `/#/core/checkin/` | `coreCheckInInfo.html` | `/core/checkin` `CoreCheckinStats.vue` | ✅ 对等 |
| `/tools/index.html` | 工具集入口 | `/tools` `ToolsHome.vue` | 🟡 部分（`contractx` 仍外链 v1） |
| `/tools/core/index.html` | 核心合约工具（部署/调用/事件订阅） | `/tools/contract/:key` × 12 | 🟡 部分（缺**事件查询面板**、缺自定义 ABI） |
| `/tools/contractx/index.html` | 其他合约工具（含自定义 ABI 输入） | ❌ 仍外链 v1 | ❌ 缺失 |
| `/tools/airdrop/merkle-proof-generator.html` | 默克尔证明生成 | `/tools/merkle` | ✅ 对等 |

### 2.2 v1 全局能力（不在路由里但影响可用性）

| 能力 | v1 实现 | v2 现状 |
|---|---|---|
| 全局搜索框 | `index.html:378-411 processRequest()`。**实际支持的输入（按代码顺序判定）**：`.j` 域名 → `j3…` JVA/B32 → **40 位 hex 地址** → 64 位（**注意：只会进 tx 分支**，见下方警告）→ 正整数区块号；不匹配则弹帮助弹层 | 🟡 `Home.vue:handleSearch` 只识别 区块号 / `.j` / 66 位 tx / hex+JVA；**40 位 hex 会被当区块号**、无帮助提示 |

> ⚠️ **2026-11-18 核实纠错——v1 的「区块哈希搜索」是死代码，不是功能。**
> 初稿把「区块哈希」列为 v1 能力，并据此给 v2 记了缺口。逐行读 `processRequest()` 后发现：
> ```js
> else if(requestStr.length === 64) {
>   if(/[0-9a-zA-Z]{64}?/.test(requestStr))   // ← 这个正则几乎总是真
>     return goToTxInfos('0x'+requestStr)
>   else if(/[0-9]{1,7}?/.test(requestStr))   // ← 永远走不到
>     return goToBlockInfos(requestStr)
> }
> ```
> 任何 64 位字符串都会命中第一个分支（`[0-9a-zA-Z]{64}` 对区块哈希同样成立），
> 所以 **v1 会把区块哈希当交易哈希去查，然后报「交易不存在」**。那个 `else if` 是永不可达的死分支。
> 结论：**v2 不需要移植「区块哈希搜索」**，因为 v1 从未真正支持过。如果要补，那是 v2 的新功能，不是对等项。
> 同类教训：读别人的代码判断「有什么功能」时，要看到**分支是否可达**，不能看到一行 `if` 就算功能存在。
>
> ✅ **仍然成立的对等缺口**：v1 的 `40 位 hex 地址`搜索（v2 会误入区块号分支）、无法识别时的**帮助弹层**（v1 列了 5 类示例，体验差距明显）。
| 顶部「连接账户」+ 网络标识 | `showHideConnect()`，含 chainId 显示、JNS 头像、切网按钮 | 🟡 `App.vue` 有连接按钮与地址，无网络标识/切网入口 |
| 一键添加 Jouleverse 主网（EIP-3085） | 首页底部按钮 `switchNetwork()`，`wallet_addEthereumChain` 带完整参数 | ❌ **无入口**（仅 `stores/wallet.ts` 连接失败时静默兜底） |
| 地址标签（`address2tag`） | `deployments.js:getAddressTag()`，区块/交易/地址三页都用 | 🟡 仅 `BlockDetail.vue` 内置本地映射，`TransactionDetail` / `AddressDetail` 没有 |
| 地址格式三态展示（JVA/B32/HEX） | 地址页顶部同屏展示 | ✅ `AddressDetail.vue` 已做且更好（可切换 + 可选中） |
| JNS 反查（地址 → 域名） | `getAddressNS()` | ✅ `jvaddress` + `AddressDetail` 主域名展示 |
| 合约源码展示 + 一致性验证 | `addressInfoController.js` + `contractVerificationService.js` + `scripts/workers/solcWorker.js`（Web Worker 编译 + 去元数据比对 + 相似度） | ❌ 无（`ContractDeployment.vue` 只做代码摘要比对，**不是**源码编译验证） |

### 2.3 v1 各页面字段级清单（用于逐项打勾）

#### A. 首页 `main.html`（70 行）

| 卡片 | 字段 | v2 `Home.vue` |
|---|---|---|
| 区块链实时状态 | 状态文案（🟢 数据正常 / 🔴 数据异常，判据：最新块龄 <60s）+ 最新区块号 | 🟡 有「网络在线/离线」（判据 <300s）+ 最新区块 |
| 稳定运行时间 | `{{updays}}` 年/天 + since block 0 链接 | ✅ 有（`networkUptime`）。**呈现优于 v1**（见判据 6），只需补 block 0 链接 |
| Free Energy | `free` + `total`（M 单位，`released/used/available` 三分法） | ⛔ **不算缺口，不补**（见下方订正注） |
| Reserved Energy | `reserved` + `reserved_core` + `reserved_eco` | ⛔ 同上 |
| 最新区块表 | Block / Txn / Size / Timestamp 四列 | ✅ **呈现优于 v1**（卡片式 + WS 实时推送 + 新块高亮），只缺 size 字段 |
| 一键添加主网 | `switchNetwork()` 按钮 | ❌ 无 |

> ⛔ **2026-11-19 订正：本项不是缺口，已从工作面删除。**
>
> 原清单按 v1 `mainController.js:43-52` 的三值映射把首页能量记成缺口：
> `free = used`、`reserved = available`、`total = released`。**这个映射本身是错的**：
> - `used` 是「已使用量」，不是「已进入流通」——两者不是同一件事，「流通」这个标签会误导人；
> - `available` 是「已释放但未使用」，不是 v1 注释写的「尚在时间锁中」。
>
> 也就是说 v1 界面上的 Free / Reserved 两个词，与实际链上字段对不上。照抄它等于把 v1 的语义错误放大成一组全网数字。
>
> 加上布局代价：v2 现有「核心时间锁 / 生态时间锁」两卡已经比 v1 好（判据 6），再插一张全宽聚合卡把面板撑成三卡，观感变差、收益是一个口径存疑的合计值。教链 2026-11-19 定调「不要画蛇添足，保留既有两个卡片即可」。
>
> ❌ PR #92 已关闭，相关 `src/utils/energy.ts` / `Home.vue` 聚合卡 / `scripts/smoke-energy.mjs` / `tests/energy.spec.ts` 全部作废。
> ✅ v2 Timelock 面板保持原样（月度预算 / 已使用 / 已释放 / 可用余额，core 与 eco 各一张卡）。

#### B. 区块详情 `blockInfos.html`（114 行）

字段：区块哈希（可点自身）、区块高度、上一区块、时间戳（含本地串）、难度、尺寸、燃料上限、**确认数**、燃料消耗量、**附加数据 extraData**（含 `hex2a` 转文本）；下方交易列表含 从/至（带标签）/ 燃料消耗量 / 传输能量 / 输入数据。

v2 缺：确认数、extraData、交易列表里的「输入数据」与「gas（桶）」口径。

#### C. 交易详情 `transactionInfos.html`（104 行）

字段：交易哈希、时间戳、区块高度、**区块哈希**、从/至（带标签）、传输能量、**每桶燃料能量值（gasPrice，J + Gwei 双单位）**、燃料消耗量（桶）、燃料消耗限制、**交易手续费（J + Gwei 双单位，已确认用 receipt.gasUsed 实算，未确认用 gas×gasPrice 预估）**、Nonce、**输入数据（ABI 解码 ←→ 原始数据切换）**、确认数。

v2 缺：区块哈希行、ABI 解码切换、地址标签、双单位换算说明（v2 用 JvAmount 只给一档）。

> ABI 解码在 v1 是**离线可验证**的纯函数（`abi-decoder.js` + 12 份 ABI），
> 在 v2 应该抽成 `src/utils/abi-decode.ts` 并配 spec —— 这是 AGENTS.md 原则五「10ms 能测完的逻辑别埋在组件里」的典型例子。

#### D. 地址详情 `addressInfo.html`（618 行）

| 区块 | 内容 | v2 现状 |
|---|---|---|
| 头部 | JNS 头像 + description +「查看该 DID 数字身份资料」链接 | 🟡 有域名，无 DID 链接（DID 页也没了） |
| 格式 | JVA / B32 / HEX / DID（含 Core ID 头像） | 🟡 DID 行缺失 |
| 能量余额 | J + wei 双单位；**「新手加油 0.005 J」**按钮（余额 0 且有 JTI2 时出现，走 `withdrawTo` 且跳过余额校验） | ❌ 无新手加油 |
| 数字资产 | WJ 余额 + unwrap / send 按钮（**send 支持 `.j` 域名解析**） | 🟡 有 WJ 操作，但**接收地址不支持 `.j`** |
| 藏品和徽章 | Planet / JTI(v2)（含认证编号+日期）/ FlyingJ / CryptoJunks / JNS / **JNSVote POAP** / **JNSDAO V**（含 npub 生成 + register 按钮） | ❌ Planet、FlyingJ、JNSDAO V、npub 均缺（`core-assets.ts` 实为 **7 类**：Joule / WJ / JNS / POP 徽章 / Core ID / JTI / JNSVote 徽章——初稿写「6 类」是数错了） |
| Core ID | 逐个列 `#id` + 头像 | ✅ |
| Core 链上签到 | POP 徽章按月墙（失效置灰） | ✅（且带分批保护） |
| CryptoJunks 墙 | 64px 像素图 + 金标/灰标 + 稀有度 👑💎🌟 + 跳详情 | ❌ 无 |
| JNS 墙 | 头像 + `#id` + 跳域名页 | ✅（更细，含分页加载） |
| 合约源码区 | 部署信息（tag/network/src/key）+ 源码高亮 + 复制/下载 | ❌ 无 |
| 合约一致性验证 | 编译 → 去元数据比对 → 相似度/编译版本/optimizer/evmVersion/构造参数/字节码长度/对比预览 | ❌ 无 |

#### E. JNS 域名页 `jnsInfo.html`（197 行）

| 功能 | v1 | v2 |
|---|---|---|
| 概要（合约地址 / NFT 编号 / 图案 / 持有者 / 绑定地址） | ✅ | ✅ |
| DID 链接（绑定后 `/#/did/:name`） | ✅ | ❌ |
| 绑定 / 解绑 | ✅ | ✅ |
| **赠予（give）** | ✅ 支持 `.j` 目标解析，二次确认弹窗 | 🟡 有「转移域名」，但**只支持地址，不支持 `.j`** |
| **打赏（endorse）** | ✅ 1/2/5/10 WJ 快选 + 手动（0<x≤100），转 WJ 到绑定地址 | ❌ 无 |
| owner-only **mint** | ✅ 合约 owner 才显示 🔨 | ⏸ 原判「暂不实现（合约 owner-only）」，**但 UI 对等要求保留入口**（见 §四 P5-11） |
| 错误提示（名称格式、`GM.j`/`Nana.j` 大小写例外） | ✅ | 🟡 部分 |

#### F. CryptoJunks `junksInfo.html`（108 行）

- `Current supply / Supply limit 10000 / Sealed` 状态行
- 分页导航（100 一页，里程碑标记 💔🌟💎👑）
- 每页铭文墙：tokenURI 元数据（像素图、稀有度、金/灰标）
- 标注说明 + **静态统计表**（legend/rare/precious/normal × good/broken/total）
- 合约地址展示
- 依赖 `scripts/misc/punks/{pageId}.json` 本地参照表 + `golden_idx.json`

#### G. 链上红包 `redpacketInfo.html`（212 行）

| 功能 | 细节 |
|---|---|
| 创建红包 | 总额（≤2000 WJ）+ 个数（≤500）+ WJ 授权（allowance 展示 + 变更授权）→ `createRedPacket()` |
| 红包信息 | 总额 / 总个数 / 剩余金额 / 剩余个数 |
| 抢红包 | 幸运数字输入（`preGenLuckyNum` 预生成，0~2^256-1）+ `openRedPacket()`；资格：JTI 认证；每地址每包一次；抢完显示「抢完了」 |
| 网络提示 | 未切链时给「切换网络」按钮 |
| 复制红包信息 | `copyRedpacketInfoToClipboard()` |
| 我的入口 | 「我也发一个」→ `/#/redpacket` |

#### H. 工具集（`/tools/*`）

| 工具 | v1 能力 | v2 现状 |
|---|---|---|
| `core/index.html`（1286 行） | 读/写函数表单；**主控台 console**；**事件订阅面板**（`allEvents`，可按「最近 N 块」或「从块号」拉取 + WS 实时）。启用中的合约：JVCore签到 / 创世金库 / Timelock核心 / **节点PoS** / **投票权PoS** / WJ | 🟡 v2 有 12 合约读写表单 + 交易回执事件数，**缺事件查询/订阅面板**，**缺 2 个启用中的合约**（`节点PoS` `0xDb11…3646`、`投票权PoS` `0xB17b…8dC3`，两者 ABI 均为 `abi_multisig`，是持有 PoS 的多签钱包） |
| `contractx/index.html`（1380 行） | 同上 + **任意 ABI 粘贴交互 / calldata 生成**。启用中：Planet / **JTI2Config** / JNS / JNSVote / **JNSDAO多签** / Timelock生态 / **ecofund1** / WJ / 红包 / CryptoJunks | ❌ 仍外链 v1。若重写，需补 3 个启用中的合约（`JTI2Config` `0x7713…24db`、`JNSDAO多签` `0x4eF5…C1B3`、`ecofund1` `0x50fe…9760`） |

> ⚠️ **2026-11-18 核实纠错**：本文件初稿写的「缺 6 个合约」是错的。逐行解析 v1 两个工具页后发现：
> `CJDAO多签`（`0x7494…54a6`）与 `Timelock0`（`0x0De0…75E8`）在 v1 **两个页面里都是 `/* */` 注释掉的状态**，从来不可达——按本文件 §五 自订规则「已注释掉的历史代码路径不在移植范围」，它们**不应计入对等缺口**。
> 真正启用中、v2 尚未注册的是 **5 个**：`节点PoS`、`投票权PoS`、`JTI2Config`、`JNSDAO多签`、`ecofund1`。
> 教训：写「缺什么」必须**逐行解析源文件并区分注释状态**，不能靠 `grep` 到名字就算数——`grep` 会把注释块里的死配置一并算进来。
| `contractx/index.html`（1380 行） | 同上 + **任意 ABI 粘贴交互 / calldata 生成**；`CryptoJunks` 带源码校验标记 | ❌ 仍外链 v1 |
| `airdrop/merkle-proof-generator.html` | 默克尔证明 | ✅ 已迁移 |

#### I. 合约验证（`contractVerificationService.js`，283 行）

流程：本地源码（`/scripts/contracts/*.sol`）→ Web Worker（`solcWorker.js`）按部署清单里的 `solc.version / evmVersion / optimizer` 编译 → 与 `eth_getCode` 比对 → 去 metadata 后再比 → 输出 `verified / message / similarity / compilerVersion / optimizer / evmVersion / contractName / constructorArgs / onChainLength / compiledLength / partialMatch / exactMatch`。

这是 v1 独有的、**纯客户端**能力，是「浏览器内置合约审计」的差异化点，必须移植。

---

## 二·五、v2 存量功能盘点（v1 没有，必须保留）

> ⚠️ **本节是 2026-11-18 核实补的，原清单漏了这一整块。**
> 清单只写了「v1 → v2 要补什么」，没写「v2 已经比 v1 多了什么」。
> 后果很实际：做 100% 对等时容易把这些当成「v1 没有的东西」而顺手简化掉，
> 或者以为「P5 全部做完就等于对等」，实际上 v2 的独有能力也需要纳入验收。

v1 的路由表里只有 14 条，v2 现有 **22 个视图**。多出来的部分是微尘（fangsheng-sudo）等贡献者在 2026-10～11 期间建的：

| v2 视图 | 路由 | 功能 | 来源 PR | v1 是否具备 |
|---|---|---|---|---|
| `ContractRegistry.vue` | `/contracts` | 生态合约注册目录 + 逐个展开部署档案 + 只读代码核验 | #66 #73 | ❌ 无（v1 只在工具页内部嵌合约列表） |
| `Validators.vue` | `/validators` | 验证者 / 签名人目录（Clique signers 快照） | #66 | ❌ 无 |
| `ReceiptVerifier.vue` | `/tools/receipt` | 链上交易核验与记录导出（独立核验器） | #67 | ❌ 无 |
| `NetworkReadiness.vue` | `/tools/integration` | 生态接入清单与只读验收工具 | #68 | ❌ 无 |
| `Analytics.vue` | `/tools/analytics` | 数据分析面板（链上指标采集 + 缓存） | #65 | ❌ 无 |
| `Multisig.vue` | `/tools/multisig` | 通用经典多签管理页（提案列表 / payload 校验） | #65 | ❌ 无（v1 只能逐个合约工具点） |
| `JnsDomains.vue` | `/domains` | JNS 域名总览（7 语种 i18n） | #22 | ❌ 无（v1 只能单个域名查） |
| `WJOperations.vue` | （地址页入口） | WJ 包装/解包独立操作页 | #23 | 🟡 v1 内联在地址页 |
| `JNSVoteProposalDetail.vue` | `/jnsvote/:id` | 提案详情页 | #42 #46 | ❌ 无 |
| `CoreIdSection.vue` / `CoreIdCheckIn.vue` | — | Core ID 分区 + 链上签到 | #1 | 🟡 有但更粗 |

另外 v2 在既有页面上也超出了 v1：

| 能力 | v2 现状 | 来源 PR |
|---|---|---|
| 交易详情：确认数 | ✅ `.info-item 确认数` | #43 |
| 交易详情：交易手续费总额 | ✅ `txFee = gasUsed × effectiveGasPrice`（非 1559 回退 gasPrice） | #26 |
| 区块详情：交易列表补全 + 跳转修复 | ✅ 含发送方/接收方/金额/Gas 限制 | #27 |
| 区块详情：矿工标签 | ✅ `labelOf(block.miner)` + 地址标签 | #27 |
| 地址页：资产中心配置驱动 | ✅ `useCoreAssets` + 一次 multicall | #23 #40 #44 |
| JNSVote 治理端 | ✅ 创建/修改/禁用/重新启用（多签签名人专属） | #62 #64 #71 |
| 合并请求自动验收 CI | ✅ PR 门禁 + 路线图完整性检查 | #69 |
| 孤立视图可达性检测 | ✅ 传递闭包 BFS | #72 |

### 对「100% 对等」目标的影响（必读）

1. **对等下限提高了**：达成判据里的「不得放宽」现在要理解为「不得相对 v2 存量放宽」，不只是「不得相对 v1 放宽」。
2. **`/contracts` 与 `/validators` 是可复用底座**：P5-14 要补 5 个缺失合约注册，**应该扩 `toolboxContracts` 而不是新建一套注册表**——`ContractRegistry.vue` 直接 `toolboxContracts.filter(...)` 渲染，加一条就自动出现在目录页，零额外代码。
3. **`Multisig.vue` 已经是通用多签页**：P5 清单里没有「多签」独立项，因为 v2 已超出 v1。清单要保持这个事实可见，避免下一个人重复开发。
4. **验收口径**：P5-8「切换就绪」的全量回归必须同时跑「v1 对等清单打勾」**和**「v2 存量功能未回退」两组；只跑前者会漏掉后者（历史上 #26 就是 v2 重构时把 v1 有的手续费总额弄丢了，已修）。

---

## 三、按模块的缺口汇总（这就是后续开发的工作面）

### A. 首页 / 全局（P5-1 ~ P5-3）
1. ⛔ **撤销（原 PR #92，2026-11-19）** 首页全网能量合计：`used`/`available` 与 v1 的「流通 / 锁中」并不是同一口径，且现有两卡布局已优于 v1。**不补，保持 v2 原样。**
2. 一键添加 Jouleverse 主网（EIP-3085，带 `iconUrls` 注释说明）
3. 全局搜索补全：**40 位 hex 地址**（现在会误入区块号分支）、`.j` 之外的 `j3…`、**无法识别时给帮助弹层**（v1 那个弹层列了 5 类示例，v2 直接 fallback 到 `/block/<乱码>`）。⚠️ **区块哈希搜索不是对等项**——v1 那个分支永不可达，见 §二·一 纠错注
4. 稳定运行时间补 **block 0 链接**（v1 有，v2 只有时长）——仅补链接，时长呈现保持 v2
5. 首页最新区块补 **size 字段**（v1 四列有 Size；v2 卡片式布局不回退）

### B. 区块 / 交易详情（P5-4 ~ P5-5）
6. 区块详情：确认数、`extraData` 及 hex→文本、交易列表「输入数据」+ 「gas 桶」口径
7. 交易详情：区块哈希行、**ABI 解码切换（12 份 ABI，纯函数 + spec）**、地址标签、gasPrice/手续费双单位
8. 区块详情支持区块哈希入参（v1 `/#/block/:blockId` 同时接受高度和哈希）

### C. 地址页资产与操作（P5-6 ~ P5-8）
9. 资产面板补齐 **4 类**：Planet、FlyingJ、JNSDAO V（含 npub 展示）、CryptoJunks 墙（现有 7 类 → 11 类）。⚠️ 加完后记得同步 `KIND_ORDER` 与 `useCoreAssets` 的分批保护
10. 「新手加油 0.005 J」入口（余额 0 且有 JTI2 时）
11. WJ 发送 / JNS 转移支持 `.j` 域名解析（v1 两处都有）

### D. JNS（P5-9 ~ P5-11）
12. DID 页 `/#/did/:jnsId`（复用地址视图，按域名反查地址）
13. 打赏 endorse（1/2/5/10 + 手动 ≤100 WJ）
14. owner-only mint 入口（保留 🔨，仅合约 owner 可见）

### E. CryptoJunks（P5-12）
15. 全量浏览页：supply 状态、分页、铭文墙、标注说明、统计表、本地参照表 `punks/*.json`

### F. 链上红包（P5-13）
16. 创建（总额/个数/授权）+ 红包信息 + 抢（幸运数字）+ 资格校验 + 复制

### G. 工具集（P5-14 ~ P5-16）
17. 合约工具补 **事件查询/订阅面板**（最近 N 块 / 从块号 + WS 实时）
18. 补 **5 个**缺失合约注册：`节点PoS`、`投票权PoS`、`JTI2Config`、`JNSDAO多签`、`ecofund1`（**不含** `CJDAO多签` / `Timelock0`——v1 里已注释，见 §二 G 纠错注）。直接扩 `toolboxContracts` 即可自动进 `/contracts` 目录
19. **自定义 ABI 交互工具**（`/tools/custom`，粘贴 ABI + 地址 → 函数表单 + calldata 生成），下线 `contractx` 外链

### H. 合约验证（P5-17）
20. 源码展示 + solc 编译比对（Web Worker，版本/optimizer/evmVersion 取自部署清单）

---

## 四、批次划分与验收

> 排序原则：**先补「影响日常浏览与钱包操作」的，再补「工具型/运营型」的**。
> 每一批独立可交付、独立可验收、独立可上线；不追求一次推平。

| 批次 | 内容 | 对应项 | 预估 | 验收要点 |
|---|---|---|---|---|
| **P5-1 浏览基础对等** | 一键添加主网 + 全局搜索补全 + 区块/交易详情缺字段（首页能量项已于 11-19 撤销） | A + B | 1.5–2 天 | 搜索 **5 类**输入全部命中（`.j` / `j3…` / 40位hex / 66位tx / 区块号）+ 无法识别时弹帮助；区块页有确认数/extraData；交易页能切 ABI 解码 |
| **P5-2 地址页对等** | 资产 4 类 + 新手加油 + `.j` 解析 | C | 1.5–2 天 | 4 类徽章显示且分批保护；两处 `.j` 解析成功 |
| **P5-3 JNS 对等** | DID 页 + 打赏 + owner-only mint | D | 1–1.5 天 | DID 页可从地址页/域名页双向进入；打赏金额边界 0<x≤100 |
| **P5-4 CryptoJunks** | 全量浏览 + 统计 | E | 1–1.5 天 | 10000 枚分页不漏；元数据来源与 v1 一致（不额外压 RPC） |
| **P5-5 链上红包** | 创建 / 抢 / 授权 | F | 1.5–2 天 | 2000 WJ / 500 个上限；JTI 资格校验；抢过提示 |
| **P5-6 工具集对等** | 事件面板 + 5 合约 + 自定义 ABI | G | 2–3 天 | 事件按块号区间拉取不扫全链；自定义 ABI calldata 与 v1 一致；新增合约自动出现在 `/contracts` 目录 |
| **P5-7 合约验证** | 源码 + solc 编译比对 | H | 2–3 天 | 对 3 个已知合约复现 v1 的 `exactMatch/partialMatch` 结论 |
| **P5-8 切换就绪** | 全量回归 + 双跑对照 + 切换方案 | — | 1–2 天 | **两组回归均通过**：① v1 对等清单 100% 打勾；② v2 存量功能（§二·五 22 视图全部）未回退。v1 可安全 302 |

**合计约 11–17 人天**（不含 review 与等待）。

### 每批的硬性门禁（缺一不可）

1. `npm run build` EXIT 0（不是 `vue-tsc --noEmit`，见 AGENTS.md 原则五）
2. `npm test` 全绿（vitest + `node --test`）
3. `node scripts/check-feature-roadmap.ts` 通过（新视图必须登记）
4. 新增的纯逻辑必须有 spec，并做**反向验证**（拿掉依赖看是否变红）
5. 真实链验证记录写进 PR
6. 双主题（暗/亮）视觉验证（有 UI 改动时）

---

## 五、明确不做的部分（避免误解「100%」）

以下**不是** v1 功能，不在移植范围：

- SEO / SSR：v1 是 `html5Mode(false)` 纯 hash 静态站，v2 同为 hash 路由，无对等义务
- Angular 1.x / Bower / jQuery / Bootstrap 3 的技术栈复刻（v2 用 Vue 3 + Naive UI 是既定方向）
- v1 遗留的 `:8503` / `:8505` 带端口 RPC 端点（已于 2026-10-29 统一废弃）
- 已注释掉的历史代码路径（如 v1 `addressInfo.html` 里被 `<!-- -->` 注释掉的 JTI v1 / Planet 星球来源展示）

以下**保留 v1 行为但不放宽**：

- `JNS mint` 仍只对合约 owner 显示（v1 就是 owner-only，不新增公开注册）
- 红包创建上限 2000 WJ / 500 个
- WJ 发送上限 2000 WJ
- 打赏 0 < x ≤ 100 WJ

---

## 六、与既有文档的关系

| 文档 | 关系 |
|---|---|
| `docs/feature-roadmap.md` | **状态追踪主表**。本清单是「要做什么」，路线图是「做到哪了」。§二 P4「废弃功能评估」作废，改为 P5 批次 |
| `docs/explorer-v2-mvp-plan.md` | 历史规划（2026-03-18）。§「废弃建议」段已加超链接指向本文件，**不再作为范围依据** |
| `docs/jouleverse-explorer-refactor-plan.md` | 历史重构方案。同上，废弃结论作废 |
| `docs/tools-migration.md` | 工具集专项。`contractx` 从「外链」改为「必须重写迁移」；`core` 补事件面板与缺失合约 |
| `AGENTS.md` | 工程门禁（构建/测试/PR 流程），与本清单 §四 门禁一致 |

---

*创建时间：2026-11-17*
*创建人：大白（💎）*
*依据：教链 2026-11-17 指示「v1 全部功能 100% 移植，尽快达到替代 v1 的可用性」*

---

## 七、2026-11-18 核实记录（查漏补缺）

教链当日指示：「这个清单你保存下来了吗？再逐一核实一下，查漏补缺。微尘此前 PR 过不少有关 jnsdao 的功能，有没有和你的清单重叠的地方？」

### 7.1 逐项核了哪些（对照实际代码，不是照抄清单）

| 清单结论 | 核实方法 | 结果 |
|---|---|---|
| 交易详情缺确认数 | `grep confirmations src/views/TransactionDetail.vue` | ❌ **清单过时**：PR #43 已补（`确认数 N 个区块`） |
| 交易详情缺交易手续费 | 同上 | ❌ **清单过时**：PR #26 已补回 `txFee` |
| 区块详情缺确认数 / extraData | `grep -c extraData` | ✅ 确实缺（v2 = 0 处，v1 `blockInfos.html:57,66` 有） |
| 区块详情缺交易列表 | 读 `BlockDetail.vue:71-116` | ❌ **清单过时**：PR #27 已补全（发送方/接收方/金额/Gas 限制） |
| 交易详情缺区块哈希 | `grep -c blockHash` | ✅ 确实缺（v2 = 0 处） |
| 交易详情缺 ABI 解码 | `grep -ci "decode\|abi"` | ✅ 确实缺（v2 = 0 处，v1 有 12 份 ABI） |
| 资产面板"只 6 类" | `grep -c "key: '" src/config/core-assets.ts` | ❌ **数错了**：实为 **7 类** |
| 缺 6 个合约 | 逐行解析 v1 工具页 + 区分 `/* */` 注释状态 | ❌ **错 2 个**：`CJDAO多签`/`Timelock0` 在 v1 是注释状态，不算缺口。真名单 **5 个** |
| 全局搜索支持区块哈希 | 读 `processRequest()` 分支可达性 | ❌ **v1 也是死代码**：64 位必进 tx 分支，区块哈希分支永不可达 |
| DID / cryptojunks / redpacket 路由 | `grep -c` 三条路由 | ✅ 当时三条确实全缺（v2 = 0）。**2026-11-25 更新：cryptojunks 三条已由 P5-4 补齐**，DID（PR #102）与 redpacket 仍待 |
| JNS 打赏 / mint | `grep -ci "endorse\|打赏\|mint"` | ✅ 确实全缺 |
| 新手加油 | `grep -c withdrawTo AddressDetail.vue` | ✅ 确实缺 |
| `.j` 解析：JNS 转移 | 读 `transferJnsDomain()` | ✅ 确实缺（只支持 hex / B32 / full JVA） |
| contractx 仍外链 | `grep -rn contractx src/` | ✅ 确实外链 v1（`ToolsHome.vue:101`） |

### 7.2 微尘（fangsheng-sudo）PR 与清单的重叠 —— 这是最大的漏洞

**结论：清单漏了一整个维度。** 原稿只写「v1 有什么、v2 缺什么」，没写「v2 已经比 v1 多了什么」。

微尘共 **41 个 PR**（合并 34 / 关闭 7），其中与 jnsdao 功能直接相关的：

| PR | 内容 | 是否已在清单中 |
|---|---|---|
| #16 #20 | JNSVote 投票写操作 voteFor/voteAgainst | ✅ 已记为「对等并超出」 |
| #22 | JNS 域名总览页 + 7 语种 i18n | ❌ **原清单完全没有** |
| #23 | 地址页资产分区（配置驱动 + 一次 multicall） | 🟡 只在「资产 6 类」里被间接提到 |
| #26 | 补回交易手续费总额 | ❌ 清单反而写「v2 缺」→ 已纠正 |
| #27 | 区块页交易列表补全 | ❌ 清单反而写「v2 缺」→ 已纠正 |
| #42 #46 | JNSVote 提案详情页 | ❌ **原清单没有** |
| #43 | 交易详情确认数 | ❌ 清单反而写「v2 缺」→ 已纠正 |
| #62 #64 #71 | JNSVote 治理端（创建/修改/禁用/重启用） | ✅ 已记为「对等并超出」 |
| #65 | 数据分析面板 + 通用多签管理页 | ❌ **原清单没有** |
| #66 | 生态合约注册目录 + 验证者/签名人目录 | ❌ **原清单没有** |
| #67 | 链上交易核验与记录导出 | ❌ **原清单没有** |
| #68 | 生态接入清单与只读验收工具 | ❌ **原清单没有** |
| #73 | 部署档案 + 只读代码核验 | ❌ **原清单没有** |

已新增 **§二·五「v2 存量功能盘点」** 收录这些内容。

### 7.3 这次核实最重要的一条

> **「对等清单」如果只朝一个方向写，会变成「退化清单」。**

原稿的全部条目都是「v1 有 → v2 要补」。这个方向本身没错，但缺了反向约束：
一旦有人按清单干活，很容易把 v2 已有的更好实现当成「不在清单里 = 可以动」而简化掉。
PR #26 就是这个机制的历史实证 —— v2 重构时把 v1 有的手续费总额弄丢了，后来才发现补回。

所以：
1. 清单一律要**双向**写（v1→v2 缺口 + v2 存量保护）；
2. 验收要**两组**回归（对等打勾 + 存量不回退）；
3. 判断「v1 有什么」必须看**分支可达性**，不能 `grep` 到名字就算（区块哈希搜索、CJDAO多签两处都是这么错的）。
