# DEV-M2 运营闭环合同增量

> **状态：** `FROZEN · NOT EXPORTED · NOT INTAKE · SYNTHETIC DEVELOPMENT ONLY`
> **适用里程碑：** `DEV-M2`（能力合同；不自动放行真实飞书、真实数据、部署、Pilot 或付费）
> **父基线：** 产品仓已消费 `cs-ai-c11-openapi-1.13.0-schema-1.17-0904a0aa11f2`（治理仓 `0904a0a`）。OpenAPI 1.13.0 / schema.v1.17。
> **G0 / Ddev：** 既有 `EVD-G0-SIGN-20260831` 与 `EVD-DDEV-AUTH-20260831` 保持。本文件不重新签发 G0/Ddev，也不把 `runtime_activated` 改为 true。
> **产品仓事实：** `tyuanww/customer-agent-prototype` `main@af8a7ae`（0.3.17）。五项工作台、Owner dual-review 发布、loopback 代理绕过已合入。SOP 写、话术单条改删、「话术不准」落库、检索账 KPI、软件目录仍待本机器合同 export → intake。

**直接前序机器合同：** DDL `419d84fbe827a5803b731250145e97786f6cb76c6d7aa9b3bc21bcac3c90f133` / OpenAPI `c3c14659261ed01ff4f0c187026601844f59d3cd26be605a34f647bc130cc94c`。

**DEV-M2 机器合同增量：** DDL `5713f80e9abfd72592ad49955efb83cd8498ce9cd6c7be52b96c57bcde836caa` / OpenAPI `39f69edfdbffcad6a57d3e9fc43e1f6a3cbdc1e8fdd951e30bdbbfe97eb3e394`。

**实际产物必须精确匹配：** DDL `5713f80e9abfd72592ad49955efb83cd8498ce9cd6c7be52b96c57bcde836caa` / OpenAPI `39f69edfdbffcad6a57d3e9fc43e1f6a3cbdc1e8fdd951e30bdbbfe97eb3e394`。

固定生成器在 `backend-closure-v1` 之上追加 `ops-loop-candidate`，产出 OpenAPI 1.14.0 / schema.v1.18。不改 20-设计冻结的 OpenAPI 1.11.0 与 `33-schema-v1-草案.sql`。旧文件保持不变。DDL 是 clean-install reference，产品以不可变新增 migration 接收。`runtime_activated=false`；禁止 `latest.yml`。

## 1. 为什么开本增量

产品仓不得手改 `packages/contracts` YAML。下列能力若不上合同，工作台会永远 fail-closed：

| 能力 | 产品现状 | 需要的新 HTTP |
| --- | --- | --- |
| SOP 写库 | 五按钮「未接入」 | SOP catalog 读/写 |
| 话术单条改删 | 库可看/导/整表导入，不能改一条 | PATCH/DELETE 当前发布条目 |
| 话术不准落库 | overlay 只记本会话 | `POST /v1/inaccuracy-reports` |
| 检索账 KPI | 概览无命中率/复制完成率「未接入」 | `GET /v1/metrics/retrieval` |
| 软件版本目录 | 「检查更新」未接入 | `GET /v1/software/releases`；**禁止** `latest.yml` 自动更新 |

一期发布继续 **仅 Owner**。AuthMode 仍是 `mock \| feishu`。禁止 `/tickets`。禁止发明第二套搜索。

## 2. 冻结 HTTP 形状

### 2.1 `POST /v1/inaccuracy-reports`

与产品仓 `docs/plans/2026-09-20-inaccuracy-contracts-intake.md` 一致。

- operationId: `recordInaccuracyReport`
- roles: `agent` / `coach` / `owner`
- 必填 `Idempotency-Key`
- 体：`query_id`（uuid）、`script_id`；可选 `script_version`、`rank`（1–3）、`content_hash`
- 去重：`(query_id, script_id)`；重放同体 200 且计数不 +1
- 200：`{ ok: true, query_id, script_id }`，不得返回「已处理 / 已建单」
- 开单阈值（服务端计算，本增量只允许打开已有域 `iteration_task`）：同一 `script_id` 24h ≥ 3 或 7d ≥ 10。打开 ≠ start。不得自动改 Answer。

### 2.2 SOP 库

- `GET /v1/sop/catalog` — coach/owner 读当前产品会话 SOP 树；agent 403
- `POST /v1/sop/import` — coach/owner；multipart/csv；必填 Idempotency-Key
- `PATCH /v1/sop/nodes/{node_id}` — coach/owner；expected_version 冲突 409
- `DELETE /v1/sop/nodes/{node_id}` — owner；expected_version 冲突 409

坐席 overlay 只读预览继续走现有 SOP 窗，不经本写库。

### 2.3 话术单条

- `PATCH /v1/content/scripts/{script_id}` — owner；expected_version；只改 title/answer_text/有效期白名单字段；改完进入待审核草稿，不得绕过 dual-review 直接 current
- `DELETE /v1/content/scripts/{script_id}` — owner；expected_version；软删除进草稿，发布后才离开 current

整表导入/发布仍走既有 `/v1/content/import` + dual-review + `/v1/content/publish`。

### 2.4 `GET /v1/metrics/retrieval`

- roles: coach/owner
- 查询窗：固定 `window=current_release` 或 `last_7d`（枚举，禁止任意日历）
- 返回：`no_hit_rate`、`copy_complete_rate`、`open_task_count`、`current_release_script_count`、`window`、`release_id`
- 分母为有产品会话的查询/复制事件；`collection_disabled` 会话不进分母
- 不得返回个人排名或坐席姓名

### 2.5 软件目录

- `GET /v1/software/releases` — owner；返回 `{ items: [{ version, platform, sha256, download_url, created_at, signed }] }`
- `GET /v1/software/releases/current` — owner；当前建议版本
- `download_url` 只允许 https；`signed=false` 必须出现在 UNSIGNED 条目
- **禁止** electron-updater `latest.yml` 打正式域；客户端只展示目录并打开下载提示

## 3. 存储要点（schema.v1.18）

新表不得授予 `app_runtime` 直读 backing 明细。

- `inaccuracy_reports`：唯一 `(query_id, script_id)`；带 `actor_user_id`、时间、证据哈希
- `sop_nodes`：树、`version`、产品会话绑定
- `software_release_catalog`：版本、平台、sha256、url、signed
- retrieval 指标只从既有 `query` / `adoption_events` 聚合视图读取，不另建事件真源

破坏性变更进 `/v2`。本增量只追加。

## 4. 交接顺序

1. 本文件能力增量已在治理仓 PR #8 评审合入。
2. 机器合同由生成器写入 `30-开发-进行中/openapi.v1.14.yaml` 与 `schema.v1.18.sql`（本刀）。不改 20-设计冻结字节。
3. `export_customer_agent_contract_set.mjs --source-git-sha <40位SHA>` 生成新 `contract_set_id`（仍未做）。
4. 产品仓 `pnpm contracts:intake --source <id> --source-repository-root <立项仓>`。
5. 产品仓实现 SOP/不准/KPI/软件目录；UNSIGNED 重打。
6. 真实飞书、办公机 HTTPS、签名公证、Pilot 仍须专项批准，不因本增量自动获准。

## 5. 明确不做

- 不改 AuthMode，不加密码 OpenAPI
- 不合 embeddings-delivery
- 不改备案隧道 / `www.jianghua.site`
- 不把 UNSIGNED 标成已签名
- 不把 G0/Ddev 既有 Pass 写成「重新签发」
