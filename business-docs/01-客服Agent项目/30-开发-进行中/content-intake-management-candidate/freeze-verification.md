# 管理上下文冻结门验证

2026-10-07，合成合同治理切片。候选基线 `63e7130ba096949a60eda56106f69f512a7af5a6`；机器版本对不变：OpenAPI1.19 SHA-256 `ef4e6df57d9ba934827a2315329aea2e473e12e577441011b78b706243251d38`，schema.v1.21 SHA-256 `5f958e4f7dcde7e11f9a6d38d8339b96654517209a493776acbfc7c3f5202013`。

## 范围与审查

本轮先按用户要求执行 OCR delegate，复审 `63e7130`：6个可审文件逐项完成、0跳过，4个被扩展名排除的Markdown另行核对。前序机器合同和旧验证字节复用，全部新增管理wire、生成入口和消费者约束已核对；候选专项10/10通过，无确认的可操作缺陷，无外部模型调用。新增冻结支持另做父代理及独立宿主审查，发现1项生产问题：浅克隆隐藏已删除的批准历史，可绕过降级门；另发现管理和前序质量历史测试依赖固定开发提交。两项均先实际复现，再修复。修复后再次按 OCR delegate 复核全部10个变更文件（5个可审源文件及5个Markdown），0跳过、0剩余可操作问题；父代理已逐项复核源码与测试，独立宿主修后复核也确认0剩余问题；两项发现均已闭合，不用候选审查替代最终审查。

本轮只新增独立批准、冻结规范、`content-intake-management-v1` profile及导出门。已批准机器文件和旧批准原字节保留；原[候选验证](verification.md)的DRAFT、未接入和运行未验证结论保留当时语境。声明与真实授权范围见[批准记录](../../90-评审/2026-10-07_P2管理上下文合同批准.md)。

## 验证输入与退出条件

Node.js24.19.0，治理仓既有npm工具和锁文件，无新增依赖。原始日志、OCR文件/规则、最终路径与哈希记录位于 ignored `output/content-intake-management-freeze-review/`。

新增专项使用隔离临时Git仓验证：缺管理批准、复制旧质量批准、非APPROVED记录、DRAFT规范、规范/双哈希漂移、机器产物或生成源漂移、批准后降级以及删除批准/profile均拒绝；成功时完整manifest/OpenAPI/DDL字节和版本匹配，脏工作树不能替代精确提交。导出入口要求完整 Git 历史，浅克隆明确拒绝且不自动 fetch；专项覆盖完整合法、浅克隆合法、完整删除批准降级、浅克隆删除批准降级。管理与质量前序回归在各自临时仓构造旧 profile 提交，不依赖开发分支 SHA。临时fixture提交不属于治理正式提交，也不写实际不可变导出目录。

首轮完整 `test:release` 在修复前结束，35步全部通过；额外浅克隆probe随后提供失败证据。修复只改变导出历史前提及其测试，已重跑全部单位测试和真实浅克隆专项；未变化的浏览器、边界、架构、机器生成/语法/lint及依赖检查复用首轮结果，不把首轮结果伪写成修后全量重跑。

| 检查 | 实际结果 |
| --- | --- |
| 原候选专项（冻结支持修改前） | 10/10 PASS |
| 初版冻结专项（浅克隆修复前） | 11/11 PASS |
| 修复前完整release | 35步全部PASS，276单测PASS；不替代后续修复验证 |
| 浅克隆降级同脚本红→绿 | 修复前错误导出1.18（exit1），修复后完整/浅仓均拒绝（exit0） |
| 修复后 `npm --prefix sites test` | 274/274 PASS，158.855s；两项历史回归合并到已有fixture，场景保留 |
| 修复后真实浅克隆双专项 | management 10 + quality 14 = 24/24 PASS，136.359s |
| 父代理 `/review` capture001 | 真实management freeze矩阵1/1 PASS，99.111s；capture materialize PASS |
| 修后审查 | OCR delegate 10/10覆盖，父代理及独立宿主复核0剩余问题，无外部模型 |
| 最终差异与引用 | `test:docs:fast` PASS；38个相对Markdown引用有效 |

可复验命令（均从治理仓根运行，无安装、无自动fetch）：

```sh
node output/content-intake-management-freeze-review/shallow-downgrade-probe.mjs
python3 output/content-intake-management-freeze-review/shallow-tests-probe.py
npm --prefix sites test
npm --prefix sites run test:docs:fast
```

同一个降级probe修复前后分别留下 `shallow-downgrade-red-exact.log` / `shallow-downgrade-green.log`；原固定SHA失败留在 `shallow-history-red.log`。真实浅克隆专项创建独立单提交快照，通过 `file:// --depth=1` 克隆并确认 `is-shallow-repository=true`，仅链接既有依赖，测试内自行构造完整临时历史。最新输入哈希、命令及日志哈希保存在 `final-review-inputs.json` / `verification.json`。

## 证据边界

最终审查已完成，本次正式来源提交、实际不可变export和产品intake尚待按顺序执行；分别保存完整Git SHA、contract_set_id及双哈希。测试fixture的成功不能替代实际产品消费。管理上下文handler、真实HTTP/PG读取、Main/UI新上传流程及真实数据/身份接入也不由本页声明完成；各自在所属产品切片或真实运行门留证。
