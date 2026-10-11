# 旧发布合同兼容修订候选

状态：**DRAFT · NOT FROZEN · NOT EXPORTED · NOT INTAKE**。没有分配正式 OpenAPI/schema 版本、迁移编号或导出 profile，`productionConsumerReady=false`、`runtimeActivated=false`。这里只准备现有发布合同的修订，不开放真实资料、生产装配或 HTTP coach。

## 问题与边界

[DEV-M3](../12-DEV-M3话术师发布产品活动合同增量.md)批准 SQL coach 在产品/活动范围内发布，但其整函数替换丢失了前序[承接发布](../07-A2b-5承接发布与读取门.md)的租户、批准版本、承接锚点和发布完整性检查。现有旧 HTTP service 仍只允许 owner。冻结 OpenAPI 同时列出 ownerOnlyWrites 和 coach/owner，不能用这处冲突来暗示不同层的能力。

本候选保留已批准 SQL coach 的作用域与敏感内容检查，恢复承接/tenant 不变量；旧 HTTP 继续 owner-only。另行启用 HTTP coach 或收紧 SQL 为 owner-only 都需要独立决定，不属于本候选。新 intake 四岗业务权限、0030 上限与既有合同字节不变。

## 维护源与生成结果

维护源是 [独立生成器](../../../08-工具/build_customer_agent_publication_compatibility_candidate.mjs)，只读 `manifest.json` 中五份精确输入。它从完整 owner publisher 提取函数，组合原字节 coach 授权块，再保留产品现行围栏和目录继承调用。不会重生成或覆盖历史 schema/OpenAPI，也不从产品工作区读取运行依赖。

- `publisher.candidate.sql`：仅当前函数正文指纹及已有围栏依赖的前置断言、一个 `CREATE OR REPLACE FUNCTION`；无新表、角色或 GRANT。恢复批准版本/锚点、tenant 一致性、归档范围、承接 hash 与切换 current 前的完整承接检查。
- `openapi.delta.json`：针对冻结 OpenAPI 1.23 的 JSON Patch 提案。保留 capability `x-required-roles=[coach,owner]`，添加明确的当前 HTTP owner-only profile，移除顶层与能力声明矛盾的 publish 条目；回退和 policy 的 owner-only 保留。正式版本尚未分配，不能把 patch 当作已导出的合同。
- `manifest.json`：前序输入、产物摘要、产品前置函数正文摘要、关闭状态和剩余条件。schema 1.27 被绑定为现有 overlay，而非另一个已接收完整 schema。

SQL 依赖已经安装的 `guard_legacy_write` / `inherit_legacy_catalog`，保留 content lock → legacy publish lock 顺序。安装事务、冻结前完整依赖/ACL 核对仍属于后续版本化交接，不能把候选直接复制成产品新迁移。API 的幂等回执/COMMIT_UNKNOWN 所有权仍在现有 service。

`MetricsStreamItem.push_method` 的旧 `oneOf` 同时引用已经可空的 `PushMethod` 和显式 null，null 会命中两支而失败。候选改为直接引用现有 `PushMethod`，不增加枚举值；`outcome` 引用的 `AdoptionOutcome` 本身不可空，所以其合法 `oneOf` 保持原样。这是同一 OpenAPI 后继候选的局部一致性修订，不改变指标业务含义。

## 合成检查

在仓库根目录使用 Node 24 和已安装依赖：

```sh
node business-docs/08-工具/build_customer_agent_publication_compatibility_candidate.mjs --write
node business-docs/08-工具/build_customer_agent_publication_compatibility_candidate.mjs --check
node --test sites/tests/publication-compatibility-candidate.test.mjs
npm --prefix sites run test:machine-contracts
npm --prefix sites run test:docs:fast
```

专项检查实际解析候选 SQL；对组合后函数去掉唯一新增围栏/继承、还原角色块后，与 owner 原函数逐字节比较；coach 授权块也逐字节核对。使用已安装 Redocly 将冻结 OpenAPI 在内存读取为 JSON，再应用带 test 前置条件的 patch；AJV 实际证明旧 null 失败、新 null 成功，既有合法枚举保持通过、非法值拒绝。没有另装 YAML 包或新增依赖。

上述专项是静态/机器合同合成检查，与实际 PostgreSQL 验收分开记录。前序安装冒烟在仓外 `客服Agent-审查分块收口-20261011/publication-candidate-install-smoke.mjs` 完成：在空库安装现行39段产品迁移，再于合法前缀上安装候选；前序正文匹配，函数属主/ACL/SECURITY DEFINER/search_path 不变，agent调用拒绝，安装事务回滚恢复原正文，篡改前序正文拒绝。输入未变，复用该退出0证据，不声称安装了尚不存在的正式后继迁移。

2026-10-11 新增业务矩阵：产品实施仓 `scripts/publication-compatibility-pg.test.mjs` 在新建、独立 Unix socket 的 PG15 临时库运行，32/32 PASS，其中30项业务验收、2项审核主张探针。产品原有 `apps/api/tests/content-release.integration.test.ts` 显式加载同一候选，13/13 PASS。实际入口均由非超级用户工作负载角色调用；admin只负责造合成资料和读取断言。输入SQL SHA-256为 `268b0ecc1b25d7c9d55c737e2e60040d1abef923f88c83dd68f0a4bc4f8df813`。

| 验证面 | 实际结果与边界 |
| --- | --- |
| 承接成功 | release保留tenant、批准版本、承接锚点，读取资格和可检索正文成立；普通single/dual仍通过 |
| 失效/完整性 | 撤销、到期、来源停用、批准版本跳号、预期来源集改变、只发布批准范围子集均拒绝；对比脚本、release、条目、谱系、审计、公告和current，无部分写入 |
| 租户 | 批次与来源不同tenant、当前release与批次不同tenant均拒绝 |
| 角色 | SQL coach仅产品/活动子集且无过敏敏感内容；可以使用已有合法owner承接，不能因此签发承接记录；旧HTTP仍拒绝coach；新intake四岗口径不变 |
| 围栏/恢复 | 原HTTP/worker套件验证围栏、继承、CAS、锁序及回退；新增矩阵实际观察pg_blocking_pids，验证撤销先提交时发布拒绝、发布先持锁时撤销等待并使后续读取资格失效 |
| 幂等 | 相同key并发返回同一发布，改正文拒绝；真实COMMIT成功后丢弃确认回执，service报告unknown，原key恢复且只有一次发布 |

复现时，先将本目录 `publisher.candidate.sql` 和 `manifest.json` 复制至仓外独立合成测试输入目录（这不是合同export）。产品已构建服务产物需与被测源码对应，然后在产品根目录执行：

```sh
CUSTOMER_AGENT_PUBLICATION_CANDIDATE_DIR=/absolute/synthetic-input node --test scripts/publication-compatibility-pg.test.mjs
CUSTOMER_AGENT_PUBLICATION_CANDIDATE_DIR=/absolute/synthetic-input CUSTOMER_AGENT_API_PG15_INTEGRATION=1 pnpm --filter @customer-agent/api exec vitest run tests/content-release.integration.test.ts
```

加载器核对DRAFT、关闭状态和固定SQL摘要，默认HTTP套件不加载候选；没有把SQL写进产品migration或注册生产入口。仓外日志与输入/源码摘要见 `客服Agent-合同业务PG验收-20261011/结果.json`。前几轮夹具失败如实保留，最终矩阵为32通过0失败。承接矩阵从暂存发布边界造数据，不代替承接记录签发入口或真实资料的全链路；不代替完整DDL/OpenAPI语义审查、真机或Windows验收。

## 正式版本化交接准备

1. 治理所有者确认后继OpenAPI/schema版本、迁移编号、安装profile和完整前序闭包；本候选仍保留null编号，不回写冻结文件。当前五份输入与前置函数摘要沿用manifest，SQL业务候选不变。
2. 正式生成器应消费上述获批输入，保留围栏/继承调用、owner承接检查、SQL coach范围及当前HTTP owner-only；确认完整安装依赖、属主与逐函数ACL。正式产物变化后重跑对应候选矩阵及治理机器合同/发布门，不能把本轮日志贴成新字节通过。
3. 正式冻结、export回执和产品intake按所属仓门禁逐步完成；之后才生成产品新迁移、更新消费锁并验证升级/拒绝/恢复。真实运行启用另有门，不由合成测试授权。

本轮同时确认一个独立缺口：产品0038的SOP单行删除函数归属NOLOGIN owner，但未授予intake_business EXECUTE，受限调用实际42501。仅补GRANT不足以处理无图片行及业务正文的删除语义，须在SOP后继合同中一并核定，不混入本发布兼容候选、不手改旧0038。本轮没有修复该项。另一条“ALL FUNCTIONS自动覆盖未来函数”主张已用实际PG反驳。剩余未复核主张不批量关闭。

候选仍为DRAFT，`productionConsumerReady=false`、`runtimeActivated=false`。上述结果不改变完整 `/review`、`externalCompleteReview` 或历史失败记录；未冻结/export/intake，未接真实数据。
