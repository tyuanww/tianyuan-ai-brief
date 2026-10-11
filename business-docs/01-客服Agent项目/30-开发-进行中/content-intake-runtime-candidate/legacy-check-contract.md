# 既有运行接入：旧内容校验 ACL 冻结规范

> 状态：FROZEN · NOT EXPORTED · NOT INTAKE · SYNTHETIC DEVELOPMENT ONLY

本规范承接 [18 · 运行接入](../18-P2店铺目录合同候选.md) 内发现的旧目录复制校验执行权限缺口。三个机器对象已按[独立批准](../../90-评审/2026-10-09_P2旧内容校验ACL合同批准.md)精确冻结；机器 DRAFT/false 元数据保留原字节。实际导出、产品接收与回归以各自回执为准，本规范状态是冻结检查点，不能据此推断真实运行已启用。

**直接前序机器合同：** OpenAPI 1.22.0 SHA-256 `3f741eb980aba1cd9a2a273b25771b50299e1aef3acbc6a1579b57541ed43a94`；DDL schema.v1.24 SHA-256 `c4ceffa961728423b755b00d551b9ab67fbf33ffe1dd87d8e671f6d151f744c5`。

**P2 旧内容校验 ACL 机器合同增量：** OpenAPI 1.22.0 SHA-256 `3f741eb980aba1cd9a2a273b25771b50299e1aef3acbc6a1579b57541ed43a94`；DDL schema.v1.25 SHA-256 `0620ee58a19543736f58b8dcf54ad5a2d0865cd48a74e24a245bbb384f1b7998`。

**实际产物必须精确匹配：** OpenAPI 1.22.0 SHA-256 `3f741eb980aba1cd9a2a273b25771b50299e1aef3acbc6a1579b57541ed43a94`；DDL schema.v1.25 SHA-256 `0620ee58a19543736f58b8dcf54ad5a2d0865cd48a74e24a245bbb384f1b7998`。

**旧内容校验安装清单：** `fbc601f305013b54e5273e3c4b97faf009f348c3db6a6b4c9f397cfd87707418`。

**旧内容校验 ACL 增量：** `6e286747d15b8af6a11a03d9b00c33d36ac62c36f25efa653285c1cbc6984584`。

唯一新能力是 [legacy-check-acl.v1.sql](legacy-check-acl.v1.sql) 的八项纯函数 EXECUTE 到既有 NOLOGIN 函数属主。权限闭包、24 个历史表约束与相关触发器、所有者和失败路径见[候选验证](legacy-check-verification.md)，不改发布/回退正文、LOGIN、membership、表/DDL、角色上限和 HTTP 合同。原 17 项隔离 PG15 验证可按精确未变输入复用。

## 完整交付和安装

显式 profile 为 `content-intake-legacy-check-v1`，包 schema 为 `customer-agent-contract-set/v4`。固定十六件：根 manifest、OpenAPI、schema1.25，以及十三件 runtime 工件。沿用 CSV 的十个依赖键 `roles`、`organization`、`session`、`acl`、`directoryAcl`、`directory`、`provenance`、`protocol`、`csv`、`csvProtocol`；`installation` 对应新 `intake-legacy-check-installation.v1.json`，另外包含 `csvInstallation` → 旧 `intake-csv-installation.v1.json`、`legacyAcl` → `intake-legacy-check-acl.v1.sql`。

所有件来自同一精确源提交，逐项验证路径、字节、SHA-256、完整集合及安装清单交叉引用。前序 CSV installation 保持原字节，既有角色、ACL、来源版本和产品 overlay 依赖仍完整验证；schema1.25 必须等于精确 schema1.24 原字节块加本 ACL。缺少批准、DRAFT 规范、错哈希、缺件/多件、非法安装顺序、扩大权限标记、源历史删除批准或批准后降级均拒绝。真正旧来源提交仍按当时批准消费，不以当前 profile 抹去历史合法性。

完整参考 DDL 含旧 NOLOGIN 角色声明，仍不含产品 publisher/rollback 正文，不能作为生产启动脚本。产品已有迁移链先核验已消费的 schema1.24、runtime 角色/用途 ACL 和 CSV 增量，再在唯一迁移事务内追加本 ACL，随后执行启动核验和旧目录发布/回退合成回归。不得在已有产品库重放完整参考 DDL，不得提前绑定真实运行账号或启用 v2-active。

完整外部 `/review` 维持 INCOMPLETE。冻结和工具成功不表示真实组织、真实资料或生产装配已获准。
