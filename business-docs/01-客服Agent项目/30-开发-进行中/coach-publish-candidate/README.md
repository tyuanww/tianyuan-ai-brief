# 话术师发布产品/活动机器合同候选

状态：能力增量见 [12-DEV-M3话术师发布产品活动合同增量.md](../12-DEV-M3话术师发布产品活动合同增量.md)。本目录追加到 `ops-loop-v1`（OpenAPI 1.14.0 / schema.v1.18）之上，生成 OpenAPI 1.15.0 / schema.v1.19。不改 20-设计冻结的 1.11.0 / 33-schema，不激活 `runtime_activated`，回滚仍仅 Owner。

- [存储增量](storage.delta.sql)

生成：

```sh
node ../business-docs/08-工具/build_customer_agent_backend_contract.mjs --write-coach-publish
node ../business-docs/08-工具/build_customer_agent_backend_contract.mjs --check-coach-publish
npm --prefix sites run test:coach-publish-candidate
```
