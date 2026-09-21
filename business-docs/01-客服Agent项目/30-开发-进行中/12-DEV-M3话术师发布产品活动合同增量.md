# DEV-M3 话术师发布产品/活动合同增量

> **状态：** `DRAFT · NOT EXPORTED · NOT INTAKE · SYNTHETIC DEVELOPMENT ONLY`
> **适用里程碑：** `DEV-M3`（能力合同；不自动放行真实飞书、真实数据、部署、Pilot 或付费）
> **父基线：** 产品仓已消费 `cs-ai-c11-openapi-1.14.0-schema-1.18-260ef224c534`。OpenAPI 1.14.0 / schema.v1.18。
> **G0 / Ddev：** 既有签发保持。本文件不重新签发，也不把 `runtime_activated` 改为 true。
> **产品仓事实：** `tyuanww/customer-agent-prototype` `main@4c1d87a`（0.3.18）。桌面 `contentPublishGate` 已允许 coach 发产品/活动；`POST /v1/content/publish` 与 `publish_content_release` 仍一期仅 Owner。

固定生成器在 `ops-loop-v1` 之上追加 `coach-publish-candidate`，产出 OpenAPI 1.15.0 / schema.v1.19。不改 20-设计冻结的 OpenAPI 1.11.0 与 `33-schema-v1-草案.sql`。DDL 是 clean-install reference，产品以不可变新增 migration 接收。回滚仍仅 Owner。

## 1. 为什么开本增量

拍板 #2：产品/活动话术师可发；售后及过敏/赔付仅管理员。一期 HTTP 写成 `x-required-roles: [owner]` 与 `x-phase1-owner-only: true`，比拍板更窄。产品仓不得手改 YAML。

## 2. 冻结 HTTP 形状

`POST /v1/content/publish`：

- `x-required-roles: [coach, owner]`
- 删除 `x-phase1-owner-only`
- Owner：任意 staged 且过质量门的批次（现状不变）
- coach：仅当该批次 `import_batch_source_bindings.domain` 与 `staging_scripts.category` 全是 `product` 或 `campaign`，且 `title`/`answer_text` 都不含「过敏」「赔付」
- 超出范围 403 `FORBIDDEN`，不得伪装成 200
- 回滚 `POST /v1/content/rollback` 仍仅 Owner
- dual-review 与 quality_gate 不绕过

## 3. 存储要点（schema.v1.19）

`CREATE OR REPLACE FUNCTION publish_content_release`：把「phase1 publish requires owner」换成上面的 coach 范围检查。不改 backing 表、不授予 `app_runtime` 直读。

## 4. 非目标

不合 embeddings-delivery；不改 AuthMode；不发明 `/tickets`；不让 coach 发售后/过敏/赔付；不让 agent 发布。
