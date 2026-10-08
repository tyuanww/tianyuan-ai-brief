# 旧内容校验 ACL 冻结与完整交付验证

本轮承接已批准候选 `231cba56aa81afca43f009f3990f7a25b67f4f0f`，授权和精确摘要见[独立批准](../../90-评审/2026-10-09_P2旧内容校验ACL合同批准.md)。三个机器对象与原 OpenAPI 保持原字节；机器 DRAFT/false 注记不翻转，生命周期由[冻结规范](legacy-check-contract.md)、批准、源提交和实际导出/接收回执分别证明。

导出工具新增 `content-intake-legacy-check-v1` → `customer-agent-contract-set/v4`，完整十六件。十三件 runtime 工件包含全部 CSV 十项依赖、新 installation、原 CSV installation 和新 ACL。新的 current 选择只在本次精确批准后切换，原版本定义和旧不可变导出包保留。

本轮验证面是工具和生命周期：精确版本/路径/成员集合、同一来源 SHA、生成字节、双层安装清单、schema1.24 原块加 ACL 的确定性组合、缺批准/DRAFT/错摘要、缺件或未声明件、非法能力标记和安装顺序、批准后删除记录/profile 降级、浅历史拒绝，以及真正旧来源 SHA 的兼容性。Git 子进程设有 60 秒上限；实际完整 export 和独立产品 intake 仍必须执行，临时 fixture 包不能代替实际交付。

冻结前 PG15 **17/17** 证据复用，未重跑：PG 探针、生成器、三个机器对象、schema1.24、原 CSV installation 及其全部十项依赖均与候选提交原字节相等。原 PG summary 包含真实约束/触发器目录和两套一次性集群结果，见[候选验证](legacy-check-verification.md)。本轮变化是 human 批准/规范/current、导出/接收工具与测试，不能写成重做了数据库实验。

本轮命令：

```sh
node business-docs/08-工具/build_customer_agent_runtime_closure.mjs --check
npm --prefix sites run test:intake-runtime-closure-contract
npm --prefix sites run test:release
node business-docs/08-工具/export_customer_agent_contract_set.mjs --verify=output/customer-agent-contract-sets/cs-ai-c11-openapi-1.22.0-schema-1.24-adbc7b1ce251
```

初始目标测试 4/4 PASS；最终根工件精确路径校验也已进入完整 release，最终结论和输入/日志摘要以[冻结检查记录](legacy-check-freeze-checks.json)为准。旧真实十四件 CSV 包由新工具按原 `adbc7b1ce251816fc02957a0042742ae2d053f9a` 成功验证，未覆盖旧包。

主 Agent 已独立只读审查 v4 producer/consumer keys、文件名和批准锚、嵌套 CSV、DDL 原块加增量及历史防降级链，未发现可操作缺陷；实现者完成同范围自查。完整外部 `/review` 维持 **INCOMPLETE**，不把本机审查、批准或测试通过写成外部审核通过。

原始日志位于治理仓 `output/content-intake-runtime-closure-freeze/`。实际来源提交、只读十六件完整包及独立临时产品往返已记录在[导出回执](legacy-check-export-receipt.md)；产品正式接收、迁移和旧目录发布/回退结果由产品仓另行拥有，不由本页代填。
