# 管理上下文候选验证

2026-10-07；DRAFT / SYNTHETIC DEVELOPMENT ONLY。治理基线 `18297cf`，产品需求输入 `951269e`。只验证合同候选，不构成冻结、导出、产品 intake、运行或真实人员接入批准。

## 被测产物

| 产物 | SHA-256 | 字节数 |
| --- | --- | --- |
| OpenAPI 1.19.0 候选 | `ef4e6df57d9ba934827a2315329aea2e473e12e577441011b78b706243251d38` | 413,671 |
| schema.v1.21（未改变） | `5f958e4f7dcde7e11f9a6d38d8339b96654517209a493776acbfc7c3f5202013` | 630,129 |

Node.js 24.19.0，macOS，沿用治理仓已有 npm 工具与锁文件，无新增依赖。命令原始日志和 OCR 输入保存在 ignored `output/content-intake-management-review/`；最终结果与源码哈希记录在同目录的 `evidence.json`，包含本轮完整路径和内容摘要。

## 已执行的验证

- `npm --prefix sites run test:intake-management-contract`：10/10 PASS。实际生成 wire 由标准 JSON Schema 消费者编译，验证未发布 null 基线、身份与版本字段约束、旧参与人选择上限及禁用贡献人、100项长Unicode标签往返、生成碰撞/未知CLI选项拒绝，以及1.18正式export继续可读而1.19候选哈希被拒绝。
- 前序全部 path/schema 逐项不变，前序 OpenAPI 和 DDL 精确哈希不变；新 DDL、运行ACL、人员表和 export profile 均未增加。
- `npm --prefix sites run test:machine-contracts`：PASS / exit 0；包含新候选 check/lint 和全部既有机器合同检查。OpenAPI 1.19 为0错误、19项前序继承警告，未增加警告。
- `npm --prefix sites run test:release`：完整命令 **PASS / exit 0**，35个release检查点全部exit 0；全仓单元测试275/275通过，包含浏览器、公开边界、生成稳定点、全部机器合同、架构与依赖审计（0 vulnerabilities）。
- `git diff --check`：PASS。

100项参与人长字段实测127,739字节（每项128字符ID、256个emoji标签、最大安全整数事实版本），低于262,144字节约束；实际JSON往返保持全部标签。此证据不冒充尚未实现的HTTP读取/分页预算。

原始日志摘要：machine `fe73cbaee675926c2d193103ab2b891a2a56bb594306e81ce080c6aa36113bf0`；release `521d44b2e955bc4c750e95bd27ed127a209994f740a1385b3062f00bf38a3295`。

## 审查

使用用户指定的 OCR delegate 确定文件与规则，再由宿主审查；没有调用外部模型。最终 preview 共10个文件，其中6个 reviewable 文件已逐项审阅，无跳过，覆盖100%；4个被OCR按扩展名排除的Markdown也人工审阅。新增生成物以1.18精确字节为前序，人工核对全部新增wire和标准消费者结果。最终未确认可操作缺陷；验证记录与引用亦已复核，历史外审超时/失败仍保留原结论。

## 未验证范围

管理上下文handler、实际产品会话/撤权/并发发布、参与人目录服务、Main取消和UI尚未由本候选实现；本轮不能把schema测试当运行验证。产品现有principals生成类型不是已完成服务。真实显示名无已接入来源，本轮只允许合成身份登记标签。冻结须独立批准具体版本对，然后版本化export/intake；后续验收见[候选规范 §4](../16-P2管理上下文合同候选.md#4-验收与下一门)。
