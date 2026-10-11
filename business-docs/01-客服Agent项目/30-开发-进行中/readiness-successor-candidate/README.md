# 就绪边界后继合同候选

候选文件保留原始 DRAFT 字节。2026-10-12 用户已明确批准 manifest `60c0a22e31d6ed1f6d08f1e1305266a4a634da5d1fb5a95f3e1a21c4cd0e2a71` 及固定前序＋差量组合，已按精确对象冻结；正式状态由 [就绪边界后继合同批准](../../90-评审/2026-10-12_就绪边界后继合同批准.json) 与后续导出/接收回执拥有。当前尚未正式导出或产品接收。拟 OpenAPI 1.24.0（前序原字节）、schema 1.29、迁移 0041、profile `content-intake-readiness-successor-v1`。产品版本保持 0.3.26。本候选没有新增业务能力或生产启用许可。

## 问题与最小修订

已消费 schema 1.28 的 public/ops_loop 版本注释仍停在 1.17/1.18，且 0034 创建的五个格式函数保留默认 PUBLIC EXECUTE，导致严格 runtime readiness 拒绝。原产品 CI 旧 API 集成 110 通过、2 失败；本候选测试不能改写那个 CI 结果。

生成器仅追加五函数 PUBLIC 撤权、为既有 `intake_business`、`intake_worker`、`intake_runtime_fn_owner` 保留纯格式谓词 EXECUTE，以及 schema 1.29 版本标记。不改函数体、属主、SECURITY DEFINER、search_path、业务角色上限、表授权或 API 探针；不向 app_runtime 加权。已存在的触发器保留，触发器内部调用的纯谓词由这三种角色执行。

维护源是 [生成器](../../../08-工具/build_customer_agent_readiness_successor.mjs) 和本目录 `predecessor-lock.json`。生成器固定冻结 schema 1.28、OpenAPI 和前序回执锁的 SHA-256，输出累计参考 schema、升级 SQL、原字节 OpenAPI、安装说明、组合说明及 manifest；禁止手改生成物。累计参考 schema 不是空库 bootstrap，运行装配和 0001–0040 闭包仍由已消费合同拥有。

## 生成与验证

从治理仓根目录，Node 24：

```sh
node business-docs/08-工具/build_customer_agent_readiness_successor.mjs --write
node business-docs/08-工具/build_customer_agent_readiness_successor.mjs --check
node --test sites/tests/readiness-successor.test.mjs
CUSTOMER_AGENT_READINESS_PG15=1 CUSTOMER_AGENT_SYNTHETIC_PRODUCT_TESTKIT="/absolute/path/to/product-testkit" node --test sites/tests/readiness-successor.pg15.mjs
npm --prefix sites run test:machine-contracts
npm --prefix sites run test:docs:fast
```

PG 路径仅在显式启用测试时使用，不是跨仓运行依赖；不接受真实数据库 URL。测试先校验产品迁移清单和四十段字节，再建立、销毁自有合成 PG15。11 个子检查及父测试共 12 PASS：前序缺失/篡改、角色异常、安装后异常完整回滚、正文/安全属性不变、ACL 收紧、未来版本匹配、旧消费者拒绝、较新回执拒绝和三类 ACL 漂移拒绝。

同一候选升级 SQL 在仓外隔离产品副本的真实四十段迁移后安装；既有受限 HTTP/PG15 套件加一条 XLSX 成功断言，9 PASS，覆盖四域 CSV 发布→另一客服读取、幂等、worker 错误报告及修正重传、角色/来源格式拒绝。正式产品源码、迁移和探针未改。首次从非规范临时路径运行未加载测试文件；随后在规范工作目录运行通过，两个日志均保留。原始脚本、补丁、输入哈希和日志位于仓外交付目录 `readiness-successor-20261012`，不冒充远端可访问证据。

当前产品 provenance 仍是 1.28，必须拒绝候选 1.29。PG 测试用未改的严格 SQL 与拟 1.29 参数验证下一版门，同时断言旧解释器仍返回 not_ready。正式产品 readiness 和 CI 恢复要等批准、冻结、export、intake 后实跑，不能提前标为通过。

## 接收体积约束

当前产品 frozen-contracts 实测15.7/16 MiB；直接再存完整候选会约17.3 MiB，不能以放宽预算解决。本候选新增 `assembly.candidate.json`：明确复用已消费1.28的固定合同ID、OpenAPI与schema摘要；新schema由已核验前序原字节、固定分隔符、升级SQL确定性组合，并校验结果摘要。治理仓保留完整可审参考，产品拟只保存升级、组合说明、安装说明、manifest、前序锁。不得接受任意路径、符号链接或网络补件；缺件或错哈希拒绝。

生成器5项通过（含逐字节还原与篡改差量拒绝）。五件候选采用4 KiB块投影不足64 KiB；这不包含尚未实现的正式导出回执/签章，不能冒充最终workspace验收。正式export/intake对这种固定前序组合的消费者支持仍须在后续阶段实现并验证，不直接使用当前只接受完整副本的旧入口，也不删历史或改预算。

## 正式交接条件

用户此前只批准了 1.24.0/1.28/0040 的精确对象。本次精确版本、profile、产物摘要与组合方式已获批准；导出与产品接收仍须经过对应验证。导出器封闭名单未改；没有产品 0041；没有正式迁移回执。未来安装器仍拥有迁移锁和事务，按精确前序验证→执行升级→验证安全边界→写回执→提交；提交未知按原回执恢复，不盲目重做。完整 `/review` 与 `externalCompleteReview` 保持 INCOMPLETE。
