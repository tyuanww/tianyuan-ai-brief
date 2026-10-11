# P2 合同候选验证记录

> FROZEN · CONTRACT ONLY · SYNTHETIC ONLY · NOT EXPORTED · NOT INTAKE。当前冻结来源见规范及独立批准记录；测试成功不代签批准，也不代表运行上线。

工作区：`codex/content-intake-p2-contracts`，基线 `7c9460be6e2cba9a498f350fbb3c07acf39b0e2a`。Node.js 24.19.0、PostgreSQL 15.18。测试只创建合成对象、临时 Git 仓及 Unix socket 的隔离 PG；不连接真实数据库。

## 当前证据

- 生成器以已冻结 1.15 / schema1.19 为前序确定性生成。前序双哈希保持不变，候选双哈希以[规范页](../13-P2资料接入合同候选.md)为准。
- 首轮复现：授权响应不能表达纯分配资格、导入缺少贡献人声明、冻结条目无法保留模板字段；新增 wire 用例修复前失败，修复后通过。
- 首轮 PG 复现：身份代际/绑定、解析对象来源、风险计数与跨店词项共 5 项缺少存储守卫；修复前回归记录实际失败。
- 首轮 release 在 `release-test-wiring.test.mjs` 发现隔离 PG 脚本未登记；完整命令重放与最小用例均失败，补登记后最小用例 4/4 通过。
- 隔离 PostgreSQL 69 项检查通过；包括审核包/实例事实绑定、撤销不复活、操作键不可改写、一次票据、回退回执、同键不同动作、租约主体与 release、封闭 ACL、400/4000 候选查询计划，以及候选修订目标/结果、贡献人派生、共用永久回执、整体策略版本和逐次授权变更原因历史。后续运行和最终审查的逐次日志保存在下述本地证据目录，交接报告须以实际退出码为准。
- 最终 wire/export 15项通过；第三轮新增授权变更原因用例修复前失败，修复后通过。初始原因保持不可变，接管/撤权原因逐版本保存，缺失/空白与历史改写拒绝。回退人工审批增加显式原实例刷新，GET 不续期；本 P2 只支持不可再转授。
- 完整审核条目与坐席快照分离：坐席 schema 不含内部说明/附件说明，且只含启用条目。新增投影回归修复前失败、修复后通过。

- 修复后完整 `test:machine-contracts` 通过（checkpoint 011）。最终 OpenAPI 无错误、19条警告：18条继承前序、1条为独立完整材料 schema 的未引用提示；该 schema 由服务端材料验收消费，当前不作为 HTTP 完整响应。

## 历史审查（2026-10-04）

按用户指定 `open-code-review-delegate`，OCR 仅选择文件与解析规则，宿主负责审核。另执行 `/review`。首轮原生委派与两份外部 Claude Code 审查均完成；实际 modelUsage 为 claude-opus-5，保留逐次输出。原生测试/fixture 仅摘要审查，宿主读取和运行实际测试。外部声称 ProductSession 未定义经前序生成物、定义源与 OpenAPI lint 复核为误报；其余可支持问题进入修复。不得把修复前审查写成通过。第二轮原生审查及外部结构化审查完成，补充正常流程缺口；另一外部对抗调用540秒超时，无有效结论。第二轮问题已修复。第三轮原生审查未发现新问题；外部结构化审查提出授权变更原因落盘及回退刷新/转授措辞问题，均完成修复与针对性回归；外部对抗审查再次540秒超时。三轮修复后，依技能上限停止，不启动第四轮。最终状态为 INCOMPLETE / converged:false / cycles:3：修后宿主复核和测试不替代一次完整零修改复审；必需 release 的依赖审计仍失败。OCR 覆盖11个代码/生成物文件；另外4个 Markdown 虽被 OCR 排除，已由宿主检查。生成物通过增量源、生成器、字节一致性和完整 PG 安装审查，不声称重新人工审阅全部冻结历史。

## 历史发布检查阻塞（2026-10-04，已由下轮维护消除）

完整 `test:release` 已执行：前25项通过，末尾 `audit:deps` 失败并独立重放确认。现有锁文件与基线 Git blob 均为 `3463fa8750401ab7b3747d5f9e11422dc37a4eea`，本轮未修改依赖。告警为 DOMPurify 3.4.13（low）、fast-uri 3.1.7（moderate）、undici 7.29.0（high）。官方 registry 修复候选分别为 3.4.16、3.1.8、7.30.0。DOMPurify 与 `sites/scripts/build-security-maintenance-archive.mjs` 和已冻结的安全维护归档强绑定，须独立安全维护版本与生成验证；不在本合同工单覆盖旧归档，也不以跳过审计假报 release 通过。

## 冻结前复审与维护结果（2026-10-05）

用户追加授权先用 `open-code-review-delegate` 审核，再修复全部已确认问题并继续后续事项。本轮先保存 OCR 选择、规则与宿主结论，再修改依赖和生成链；前次 15 个候选文件在复审开始时与最终修复快照逐字节一致，可复用其完整源审查，重点重核最后的授权原因和回退刷新变更。此次是新的宿主 OCR 复审，不改写上面的 `/review` 超时和未收敛记录。

- 已确认的 4 项问题已修复：undici 7.29.0 → 7.30.0、fast-uri 3.1.7 → 3.1.8、DOMPurify 3.4.13 → 3.4.16，以及发布清单只识别旧日期安全快照的问题。锁文件仅变更这 3 个包；新快照由既有生成器产生，旧两份目录和 manifest 均保持冻结字节，正文与前次公开脱敏稿一致。
- 新快照为 `archive/2026-10-05-ai-project-brief-security-maintenance/`，绑定 `shell-v3-cf071103fc67`。Pages 构建器与测试从生成器读取当前版本，实际 vendor、HTTP/file Bundle 与依赖镜像一致；不手改压缩产物。
- 回归先失败后通过：vendor 镜像检查、新日期缺少自身 manifest 的拒绝检查。第一次完整 release 又定位到 Pages 测试固定旧入口哈希的断言，改为核对当前生成器所选 manifest，并增加实际发布副本 vendor/Bundle 验证；定向 9 项通过。
- 最终完整 `npm --prefix sites run test:release`：26/26 步骤退出 0，含 240/240 单元测试、浏览器 HTTP/file 与布局、公共边界、业务视图、全部机器合同和依赖审计；审计为 **0 vulnerabilities**。隔离 PG15 另跑 **69/69 PASS**，范围仍为存储约束和当前授权谓词。
- `npm --prefix sites run build:pages` 实际生成 32 个公开文件；对真实 `sites/dist/pages` 校验链接、vendor 与两个 Bundle 字节，并用 Chromium 通过 HTTP 和 file 两种入口消费，均显示当前 release，无未捕获脚本异常。本地构建不等于部署。
- OCR 最终选择 64 路径：43 个代码/生成物已按对应规则复核，21 个 OCR 排除项有逐项理由和额外的文档、锁文件或字节核验；全预览审阅覆盖 67.19%，可审项覆盖 100%。生成物按生成源、确定性重建与真实消费者核验，不声称逐行审查压缩库或重审冻结历史。没有剩余已确认待修代码问题。

该次维护证据保存在 ignored `output/content-intake-maintenance-review/`：`review-before.json`、`review.json`、`review.md`、`release-r1-red.log`、`release.log`、`pg.log`、`pages-consumer.json` 和最终逐文件摘要。旧 15 路径 bundle 已被维护变更取代，不得继续用于批准。该次维护结束时合同双哈希未变、profile 仍为 `coach-publish-v1`，尚无本次正式批准或冻结；以下接续记录拥有当前冻结状态。冻结/profile/批准记录改变工作树，须再生成最终 bundle，并按 Product/Security/Tech 三方同 bundle EVD 门及有效 Git 授权交付，不能复用漂移前清单。

## 当前冻结接续（2026-10-05）

用户在上轮具体交接后指示“开始下一步”；本次独立[批准记录](../../90-评审/2026-10-04_P2内容接入合同批准.md)保留原指令及上下文解释，只覆盖精确合同的合成开发冻结。规范状态已改为 FROZEN，profile 选择 `content-intake-v2`，API/DDL 成对机器字节未修改。记录日期为 10 月 5 日，导出器固定批准路径的文件名保留 10 月 4 日。

冻结前先复用逐字节未变的 64 路径 OCR 证据，并复核冻结与导出门，识别了两处负例依赖当前仓库 DRAFT 状态的测试问题。冻结后实际复现 13 PASS / 2 FAIL，改为显式合成 DRAFT/FROZEN 输入后 15/15 通过；缺批准、精确成对哈希、漂移、降级、脏工作树不影响已提交快照的正反例均保留。不是放宽生产导出器。

冻结后实际预检通过：生成字节等于当前成对文件、双哈希匹配、profile 为 `content-intake-v2`，生产 `assertIntakeExportGate` 接受当前冻结规范与批准记录；该结果明确为工作树预检，不是已提交 export。完整 release 重新运行 26/26 步骤退出 0（240 单元测试、15 项 wire/export、浏览器/公开边界/机器合同及审计），依赖审计 0 漏洞。机器合同与运行代码不变，上一轮 PG69 和实际 Pages HTTP/file 产物证据复用。

最终 OCR 范围 66 路径：44 个可审项已完成复核，22 个排除项逐项保留理由及补充核验；其中 59 个文件与前次已审字节一致，7 个变更文件重新复核。无剩余已确认待修问题。证据在 ignored `output/content-intake-freeze-review/`，含 `freeze-state-red.log`、`freeze-state-green.log`、`freeze-preflight.json`、`release.log` 和最终 `review.json`。完整验证后重建最终清单；冻结前 64 路径 bundle 不再适用。当前三方 EVD 未齐，未暂存、未提交、未 export/intake；本次用户授权不冒充三方分别签发。

## 本地提交前复审（2026-10-05）

用户明确要求再次使用 `open-code-review-delegate` 复审、修复后本地 commit 并继续下一步。复审开始时 66 个候选文件与冻结复核输入逐字节一致；本次复用对应规则、逐文件覆盖及实际 release / PG / Pages 证据，重点复核授权、不可变 export 和产品接收边界，未发现新的可支持代码缺陷。此前依赖、清单配对及 DRAFT 测试耦合修复保持有效。

提交阶段首次精确暂存核验发现新安全快照继承历史 Markdown 的行尾空格而失败；已从生成器改为保留相同语义的反斜线硬换行，并重新生成本次未提交快照与 manifest，旧归档保持原字节。对应生成物回归新增无行尾空格和换行保真断言；新快照的运行文件、release ID、合同机器字节及依赖不变。受批准文本影响的导出正反例 15/15 通过；生成器修复后再次运行完整 release，实际结果和最后精确暂存核验见本次回执。当前审查输入、结果与精确暂存回执保存在 ignored `output/content-intake-commit-review/`。本地 commit/export/intake 的直接授权见独立批准记录；三方受控 EVD 仍缺失，不据此声称公开交付或真实运行获准。提交与导出实际结果由工具回执及产品交接页记录，不预填提交 SHA。


## 验证边界

PG 检查是存储关联、单记录状态/版本守卫、封闭 ACL 与当前授权谓词；不是完整授权分配或发布事务。发布并发、撤权竞争、正式历史审核、两会话接手、桌面/Main、Windows sandbox、人工飞书实例、真实工作簿、凭据和线上环境均未运行。部分 PG 外键测试在回滚事务中创建临时父 release 行，只测立即关联约束，不据此声称旧四域发布验收成功。400/4000 候选的 EXPLAIN 只反映当前合成分布，不代表生产性能。

## 重跑

在仓库根使用 Node 24：

```sh
npm --prefix sites run test:intake-contract
npm --prefix sites run check:intake-contract
npm --prefix sites run lint:intake-openapi
PG_BIN=/path/to/postgresql15/bin npm --prefix sites run test:intake-contract:pg
npm --prefix sites run test:machine-contracts
npm --prefix sites run test:release
git diff --check
```

PG 默认采用 `pg_config --bindir`，也可显式传 `PG_BIN`。本地详细产物位于被忽略的 `output/content-intake-contract/` 与 `output/content-intake-review/`，不将输出缓存当作业务真源。正式最终证据须绑定候选哈希、命令、环境与输入。
