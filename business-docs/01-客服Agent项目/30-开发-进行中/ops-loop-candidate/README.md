# DEV-M2 运营闭环机器合同候选

状态：能力增量见 [11-DEV-M2运营闭环合同增量.md](../11-DEV-M2运营闭环合同增量.md)。本目录只提供追加到 `backend-closure-v1`（OpenAPI 1.13.0 / schema.v1.17）之上的机器增量，生成 OpenAPI 1.14.0 / schema.v1.18。不改 20-设计冻结的 1.11.0 / 33-schema，不激活 `runtime_activated`，不 export、不 intake。

- [OpenAPI 增量](openapi.delta.json)
- [存储增量](storage.delta.sql)

生成：

```sh
node ../business-docs/08-工具/build_customer_agent_backend_contract.mjs --write-ops-loop
node ../business-docs/08-工具/build_customer_agent_backend_contract.mjs --check-ops-loop
npm --prefix sites run test:ops-loop-candidate
```
