# 旧内容校验 ACL 完整导出回执

本回执记录已获[精确批准](../../90-评审/2026-10-09_P2旧内容校验ACL合同批准.md)的完整交付，不增加真实运行授权。[冻结规范](legacy-check-contract.md)及[冻结检查记录](legacy-check-freeze-checks.json)保留源提交形成前的检查时点；其中 `NOT EXPORTED` / `PENDING_SOURCE_COMMIT` 不覆盖本回执记录的后续实际结果。

- 来源提交：`db6ba13d4780a3abb1558e8673e016f7bfb5604e`。
- 合同集：`cs-ai-c11-openapi-1.22.0-schema-1.25-db6ba13d4780`。
- 包目录：治理仓 `output/customer-agent-contract-sets/cs-ai-c11-openapi-1.22.0-schema-1.25-db6ba13d4780`。
- Manifest SHA-256：`5824420144ff2a6267d588074594df56b9361df5908a03d5955d240826d58904`。
- 实际出口：`customer-agent-contract-set/v4`，OpenAPI 1.22.0 / schema.v1.25；共 16 个文件，含 13 件 runtime 工件。目录权限 `0555`，文件权限均为 `0444`。

实际 `--write` 返回 `CREATED`，随后独立 `--verify` 返回 `VERIFIED`，两条 CLI 均退出 0，来源和精确 OpenAPI/DDL 摘要一致。完整成员、字节数、各文件摘要、可复现命令和原始日志指纹见[机器回执](legacy-check-export-receipt.json)。三个获批机器对象以及原 CSV / runtime 依赖均保留批准原字节；机器 DRAFT/false 注记未翻转。

产品接收所有者另行完成了真实临时往返：实际 ingest CLI → verify CLI 成功，接收锁定的 13 件 runtime 源文件与包逐字节相等。真实数据库生成器在内存中生成 35 个迁移，前 34 个迁移的 SQL 与元数据都和产品 `f6f8cf35ef9a9007cddade8a0c7fa4b648bef9a1` 相同；第 35 个迁移摘要为 `01a674d1f5a996a511babf193c28c217ec91a72a3f974922e9580cf2bcdabda7`。该探针没有修改产品正式 lock，临时目录已清理。产品仓的正式接收、同事务前序核验、PG 升级、旧目录发布与回退验收由产品仓证据拥有，本回执不代填这些结果。

源提交的 required release 为 **46/46** 步通过，其中通用测试 **299/299**；冻结前 **17/17** PG15 证据因 18 项相关输入字节不变而复用，本次没有重跑。此后仅增加回执和文档链接，沿用未变代码与机器合同的 release 证据，并运行文档检查。完整外部 `/review` 仍为 **INCOMPLETE**。没有 push、PR、合并、部署、真实资料读取或生产运行启用。
