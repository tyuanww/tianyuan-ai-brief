# 既有运行接入事项：旧内容校验 ACL 冻结前候选验证

> DRAFT · NOT FROZEN · NOT EXPORTED · NOT INTAKE · SYNTHETIC ONLY

本页保留候选提交 `231cba56aa81afca43f009f3990f7a25b67f4f0f` 的冻结前证据，以下 DRAFT、current 和未实现说明均对应该检查点。当前精确批准、完整交付接口和生命周期见[冻结规范](legacy-check-contract.md)及其独立批准；机器三个对象与原 PG17 项输入未变，不用后来状态改写过去的验证结果。

2026-10-08，在 CSV 合成接线后的扩大回归中，既有非空目录发布在复制历史 `release_items` 时得到 `42501 / permission denied for function content_template_placeholders_are_valid`。原因属于既有运行 ACL：产品 `0033` 把发布及回退函数设为 `intake_runtime_fn_owner` 的 SECURITY DEFINER，但历史表 CHECK 调用的纯 INVOKER 校验闭包没有给这个新属主 EXECUTE。空目录发布不会触发该缺口。产品 `0032` 的逐字段历史复制和 CHECK 原义均正确，不能通过改成高权限属主、移除校验或向产品夹具偷偷补权掩盖失败。

本候选留在 [18 · 运行接入](../18-P2店铺目录合同候选.md) 的缺口修复内，不新增业务事项。治理拥有正式权限合同；产品继续拥有发布、回退正文和事务消费者。候选只给既有 NOLOGIN `intake_runtime_fn_owner` 八个纯函数 EXECUTE；不增加 LOGIN 角色、membership、表/DDL 权限、HTTP 字段或业务动作，不更改函数正文、属主、SECURITY DEFINER、角色上限或历史授权。

## 待批准的精确对象

| 对象 | SHA-256 | 字节 |
| --- | --- | --- |
| [legacy-check-acl.v1.sql](legacy-check-acl.v1.sql) | `6e286747d15b8af6a11a03d9b00c33d36ac62c36f25efa653285c1cbc6984584` | 865 |
| [schema.v1.25.sql](../schema.v1.25.sql) | `0620ee58a19543736f58b8dcf54ad5a2d0865cd48a74e24a245bbb384f1b7998` | 706504 |
| [legacy-check-installation.v1.json](legacy-check-installation.v1.json) | `fbc601f305013b54e5273e3c4b97faf009f348c3db6a6b4c9f397cfd87707418` | 4261 |
| 复用已冻结 [openapi.v1.22.yaml](../openapi.v1.22.yaml)，原字节不变 | `3f741eb980aba1cd9a2a273b25771b50299e1aef3acbc6a1579b57541ed43a94` | 见原 CSV 合同 |

生成器 [build_customer_agent_runtime_closure.mjs](../../../08-工具/build_customer_agent_runtime_closure.mjs) 验证旧 schema、OpenAPI、CSV installation 及 installation 全部十项来源哈希。新完整 DDL 保留 schema1.24 的整块原字节，只在最后追加一条 GRANT（八个函数）。既有 `purpose-acl.sql`、已冻结 CSV 五项、独立批准记录、current profile 与已导出十四件包保持原字节。新 installation 将所有旧依赖连同补丁重新绑定，但仍明确 `freezeApproved/exportApproved/runtimeActivated: false`。

## 完整权限闭包

实库目录枚举了 `release_items` 全部 **24 个约束、14 个触发器**，以及发布复制路径上的 `content_releases` / `release_source_bindings` **48 个触发器**（包括 PostgreSQL 内部 FK 触发器）。目录查询结果与函数定义保留在 PG 证据中，不仅根据首报的函数名推断权限。

| CHECK / 路径 | 必需执行函数与已有边界 |
| --- | --- |
| `release_placeholders` | `content_template_placeholders_are_valid(text,text[])` → `content_text_array_is_nonblank_unique(text[])` |
| `release_platform_scope` / `release_product_scope` | `content_text_array_is_nonblank_unique(text[])` |
| `release_questions_array` | `content_questions_align_intent(jsonb,text,text)` → `content_questions_are_valid(jsonb)` → `content_question_hash(jsonb)` → `content_utc_timestamp_text(timestamptz)`；`jsonb_jcs(jsonb)` 和 `digest(bytea,text)` 已由旧 purpose ACL 授予，不重复扩大 |
| `release_risk_categories` | `content_risk_categories_are_valid(text,text[])` → `content_text_array_is_nonblank_unique(text[])` |
| `release_review_shape` | `owner_acceptance_review_shape(text,boolean,text,text,text,text,text,text,text,text)` |
| `owner_acceptance_storage_guard` | 保持既有 `cs_ai_definer` SECURITY DEFINER；有效旧 single/dual 行及假 owner acceptance 拒绝均实测。没有给新属主额外 owner acceptance 权限 |
| 不可变历史与来源绑定守卫 | 既有 INVOKER 触发器通过一致性标记/拒绝历史修改工作；不增加低层调用权限 |
| 延迟来源完整性与 FK | `release_source_set_complete` 保持 `cs_ai_definer` SECURITY DEFINER；真实 COPY 后执行 `SET CONSTRAINTS ALL IMMEDIATE`，内部 FK 保持 PostgreSQL 原执行规则 |

这八个新增授权函数在实库均是 IMMUTABLE、INVOKER。补丁前全部对新属主拒绝；应用后整个实库函数 ACL 差异恰好是这八项，角色属性、membership、所有 public 表 ACL 均无变化。各用途角色、`app_runtime` 和合成 LOGIN 仍没有这些新增 EXECUTE。

## 候选提交时的安装语义和未完成项

1. **完整参考 DDL**：schema1.25 已在全新隔离 PG15 实际安装。它包含 schema1.24 既有的 NOLOGIN 角色声明，所以能执行追加授权；它仍不含产品 publisher / rollback 正文和完整用途装配，`runtimeReady` 保持 false。不可把它当成生产启动脚本，也不可对已有产品库重放完整 DDL。
2. **产品增量顺序**：先验证既有 schema1.24 对应迁移、完整 runtime 角色/ACL（含产品 `0033`）和 CSV 增量（`0034`），再在唯一迁移事务内追加本候选 SQL，最后才能执行既有启动核验。不能先给未核实的同名角色补权，也不能跳过失败的前序。
3. **尚未实现**：现行 exporter 和产品 intake 尚不支持此 schema1.25 successor 的完整版本化 bundle；当前 profile 仍为 `content-intake-csv-v1`。本次没有伪造可一键完整导出的状态。后续需在同一事项内补足完整导出/接收工具，取得这三个新对象及未变 OpenAPI 的精确批准，再执行冻结 → 完整 export → intake → 产品追加迁移/核验 → 非空旧目录发布和回退回归。
4. 本次合成通过不构成合同冻结、真实数据或生产装配授权。完整外部 `/review` 仍为 **INCOMPLETE**。未触碰真实来源、员工资料、凭据、生产账户或产品合同锁。

## 实际验证与复现

环境：macOS arm64、Node 24.19.0、PostgreSQL 15.18；无安装依赖。命令在治理仓根目录执行，使用本机 Node 24 路径或正确的 PATH：

```sh
node business-docs/08-工具/build_customer_agent_runtime_closure.mjs --check
node --test sites/tests/content-intake-runtime-closure.test.mjs
node sites/tests/content-intake-runtime-closure.pg.mjs
npm --prefix sites run test:release
```

候选静态验证和生成核验已接入 `test:machine-contracts` / release；PG 保持显式隔离入口 `npm --prefix sites run test:intake-runtime-closure-contract:pg`，不在 release 中自动连接数据库。发布门首轮发现新 PG 脚本漏登记 wiring，修复入口后重新执行；该修复没有改变三个精确候选对象。

- 静态 **3/3 PASS**：完整新 DDL 可重生且解析有效；旧冻结来源漂移逐项拒绝；唯一新 SQL 只能是八项 EXECUTE 到指定函数属主，没有 grant option。OpenAPI、旧字节和 current profile 保持。
- 一次性 PG15 **17/17 PASS**：在现行 schema1.24 上仅提取已有冻结 ACL 的必要基线能力，真实复制历史行并复现 42501；唯一新增能力来自原样候选 SQL。补丁事务回滚不残留；应用后逐字段相等，单审、中风险和高风险双审/SKU 范围路径成功。占位、重复范围、问题哈希、分类、风险、审核材料及假 owner acceptance 继续拒绝；不可变历史和 LOGIN 提权/读写拒绝继续成立。最后另建全新 PG15 安装完整 schema1.25 并确认没有产品 publisher。测试结束清理两个一次性集群。
- 产品消费者附证由 API Agent 独立运行：仅在隔离库对原非空 `legacy-other-domain` 发布用例临时应用同一 SQL，原发布及八行逐字段相等/无伪 owner acceptance 断言通过（1 PASS / 151 skipped）。这证明候选能修复该消费者，**不是正式产品已经 intake 或全量 API 已通过**。原测试与正式锁未改；原无补权基线失败证据仍保留。产品完整 rollback 暂未验证。
- 全量治理发布门结果和输入/日志指纹见 [验证记录](legacy-check-verification.json)；未变的旧合同专项 PG 不机械重跑，新权限由本次专门实库验证覆盖。

主 Agent 已独立只读审查本候选的生成器、SQL、installation、静态测试和 PG 探针源码；确认新增权限范围、旧字节保护和安装边界，没有新增可操作代码缺陷。实现者也已复核约束/调用闭包。以上是本机核心与独立审查，不等于完整外部审核完成。

日志保存在治理仓 `output/content-intake-runtime-closure/`。PG summary 含完整实际约束、触发器、函数定义和机器候选；安装命令使用 quiet 模式，空 stdout 日志不能代替该结构化成功证据。产品附证位于产品集成工作区 `.gstack/qa-reports/intake-csv-candidate/`，路径和指纹只作本次本地合成证据，不接入正式运行。
