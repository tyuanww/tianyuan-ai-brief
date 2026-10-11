# 质量 HTTP 合同候选验证

2026-10-07；DRAFT / SYNTHETIC DEVELOPMENT ONLY。基线治理仓 `53906e3`；产品 `c046b15`。本记录验证候选产物，不构成冻结、导出、产品 intake 或运行接入批准。

## 1. 被测产物与环境

| 产物 | SHA-256 | 实际大小 |
| --- | --- | --- |
| OpenAPI 1.18.0 | `7982b5b05b1e686e446544db092e6c73325ad0386a1772e2b004e282ff792664` | 409,489 字节 |
| schema.v1.21（未修改） | `5f958e4f7dcde7e11f9a6d38d8339b96654517209a493776acbfc7c3f5202013` | 630,129 字节 |

Node.js 24.19.0，macOS 独立工作树；沿用已有依赖及锁文件。原始命令、退出状态、源码哈希及日志保存在 ignored `output/content-intake-quality-review/`。完整前序路径/schema 与 DDL 原字节对照通过；现有 `content-intake-usage-v1` export profile 保持原值，并拒绝将此 DRAFT 作为已批准合同导出。

## 2. 实际检查结果

| 检查 | 实际结果与边界 |
| --- | --- |
| `npm --prefix sites run test:intake-quality-contract` | **14/14 PASS**；实际生成的所有 Intake schema 由标准 JSON Schema 校验器编译，覆盖身份字段拒绝、状态/阶段、原因 Unicode、完整样本与回执、前序不变、生成碰撞拒绝及导出隔离 |
| `node business-docs/08-工具/build_customer_agent_backend_contract.mjs --check-intake-quality` | **PASS**；核对磁盘 OpenAPI 与旧 DDL 的精确字节，不能只靠生成函数返回成功 |
| 上述命令追加 `--unexpected` | **预期 exit 1**；未知参数拒绝、没有写入，修后重新核验实际产物 |
| `npm --prefix sites run test:machine-contracts` | **PASS / exit 0**；修复后的最终源码运行，含本次新门禁 |
| `npm --prefix sites run test:release` | 两次完整执行均在第32项依赖审计因 registry 网络失败而 **exit 1**。修后运行前31项全部通过，单元测试 **264/264 PASS**；不能将此完整命令记为 exit 0 |
| `npm --prefix sites run audit:deps` 单项补验 | 使用 Mac 已有系统代理、仅对本次进程设置 HTTP(S)_PROXY 后 **PASS / exit 0，0 vulnerabilities**。另一次 IPv4 优先的独立审计也通过；未修改全局配置或依赖。复用未变输入的前31项结果，32项要求均有通过证据 |
| OpenAPI lint | **0 errors**；19项前序继承警告，与1.17一致，本增量未增加警告 |

完整发布检查的失败属于网络层；代理重试不是外部模型审查。原始失败日志继续保留，不用重试覆盖。关键日志 SHA-256：

| 日志 | SHA-256 |
| --- | --- |
| `machine-final.log` | `e5a40094ff6adaacc20efac29430fc2296b77dfb4774d1175f2044063f7755b3` |
| `release-final.log`（exit 1） | `291230eb50effd0bd84a67522c3d4637c1cf36dd6a15380c37dc5991405e18ba` |
| `audit-system-proxy.log`（exit 0） | `b5800dcec73a0e1b53d128f485282e6e75d7c9aa30dea60e3486f819fd6adefd` |

## 3. 容量与修复证据

合成5,000项检查实测：每项100个 emoji 原因为 **2,975,197 字节**；每项1,000个 emoji 为 **20,975,197 字节**，虽各字段合法但超过8,388,608字节整轮预算。含最大长度话术、标题、说明及100条最大长度问题的单样本页为 **2,186,920 字节**；并非所有字段同时取最大值。JSON 序列化/解析往返保持全文一致。这里证明预算必要性和合同可消费，不冒充尚未实现的 HTTP 流读取限制或 PostgreSQL jsonb 写前校验。

首审发现并修复三项响应约束缺口：已完成状态缺少 initial 历史、样本意外允许停用条目、空页仍携带继续游标。三个新增回归在修复前以相同命令连续两次 **3 FAIL**，修复后 **3 PASS**；完整14项及原始 CLI 探针随后通过。零样本仍保留显式空 initial 轮次；既有 IntakeEntry schema 没有被改写。

OCR delegate 列出6个源码/配置/产物文件，宿主逐项审阅6/6、跳过0、覆盖100%；另外4个被 OCR 按扩展名排除的 Markdown 文件由宿主手工审阅。原生对抗审查只看测试摘要，宿主完整审阅测试；两者不计为独立外部模型。修复记录、最终复审和9个执行检查点汇入 ignored `final-review.md`，材料化 QA `evidence.json` SHA-256 为 `13285907bece308631237b87511b3fe611a2373843ad0155ce83de963e414c5e`。

## 4. 未验证与下一步

本轮未新增 DDL、运行 ACL、HTTP handler 或桌面代码。HTTP 认证/撤权/并发、游标失效、原键恢复、真实 PG 字节门、Main/preload/UI 和 Mac/Windows 原生验收均在精确版本冻结与 versioned intake 后实施；旧产品运行证据只覆盖 `c046b15`，不覆盖新 wire。真实飞书、生产注册、v2-active、发布及外部 Git 操作仍未办理。

下一入口为[候选规范 §5](../15-P2质量检查HTTP合同候选.md#5-接入顺序与验收)：批准本页精确版本对，再建立独立导出门与产品 intake，然后完成质量 HTTP 及管理端合成闭环。
