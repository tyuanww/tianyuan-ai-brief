# 30 · 正式开发阶段（进行中）

> **状态：** `DEV-M1 COMPLETE` · `G1A-E0 T1～T3 COMPLETE · MERGED` · `T4 BLOCKED` · `T5 ATTEMPTED / BLOCKED · NOT_EVALUATED`
> **进入与推进证据：** 设计评审、G0 / Ddev、DEV-M0 / DEV-M1 退出证据；产品仓 comparison v2 合同 PR #23（`main@b0a52d9`）与 CI run `33889553752`；仓外 `EVD-G1A-DATA-01`、`EVD-G1A-EVALSET-01`、`EVD-G1A-BLIND-01`、`EVD-G1A-COMPARISON-02`、`EVD-G1A-HOST-01`、`EVD-G1A-PACKAGE-01`、`EVD-G1A-RUN-01`、`EVD-G1A-CLEANUP-01`
> **下一动作：** [DEV-M3 话术师发布产品/活动](12-DEV-M3话术师发布产品活动合同增量.md) 机器合同 OpenAPI 1.15.0 / schema.v1.19 已生成，尚未 export / intake。DEV-M2 1.14.0 已在产品仓消费。G0/Ddev 既有 Pass 不因本增量重签。T4/T5 历史状态见正文，不自动签发 T6。

当前新增合同：[P2 资料接入、权限与人工审批](13-P2资料接入合同候选.md)（OpenAPI 1.16.0 / schema.v1.20，2026-10-05 已按本次用户授权冻结，仅限合成开发，未提交/导出/接入）。本次[合同批准记录](../90-评审/2026-10-04_P2内容接入合同批准.md)不代替最终 bundle 的三方发布 EVD。其前序 1.15.0 已有不可变 export；本页上方及 DEV-M3 条目的 NOT EXPORTED 是保留的历史文字，不能代替具体合同集核验。

2026-10-06 接续候选：[P2 使用资格上下文与词项预算](14-P2使用资格上下文合同候选.md)（OpenAPI 1.17.0 / schema.v1.21，DRAFT）。上项 1.16/1.20 已从本仓 `d029cb0` 导出，并由产品仓接收；历史未导出措辞保留原时间语境。新候选不改写旧冻结字节或批准，只有合成合同验证，不代表桌面接线或真实运行。

2026-10-07 [P2 质量检查 HTTP](15-P2质量检查HTTP合同候选.md)（OpenAPI 1.18.0 / 原字节 schema.v1.21）已按[独立批准](../90-评审/2026-10-07_P2质量HTTP合同批准.md)冻结，profile 为 `content-intake-quality-v1`。只新增质量摘要、样本分页、冻结、逐条提交和专属回执；旧冻结字节保留，导出/产品接入与运行验证分别留证，不授予真实运行。

2026-10-07 并行增量：[P2 管理上下文](16-P2管理上下文合同候选.md)（OpenAPI 1.19.0 / 原字节 schema.v1.21）已按[独立批准](../90-评审/2026-10-07_P2管理上下文合同批准.md)冻结，profile 为 `content-intake-management-v1`。只增加按来源 import 权限读取发布基线和认证主体映射的读口，参与人仍复用既有 principals 合同；机器原字节及此前批准不变，导出、产品 intake 和运行实现各自留证，仅限合成开发。

2026-10-08 并行候选：[P2 店铺目录](18-P2店铺目录合同候选.md)（OpenAPI 1.21.0 / schema.v1.23，DRAFT · NOT FROZEN · NOT EXPORTED · NOT INTAKE）。只增加只读店铺显示名；已冻结的 OpenAPI 1.20.0 / schema.v1.22 原字节和 content-intake-direct-v1 导出 profile 不变。1.21.0 / schema.v1.23 只是下一空位，A/B 回收前不视为已批准版本，也不启用真实数据。

2026-10-08 CSV 增量：[P2 CSV 资料输入合同候选](19-P2CSV资料输入合同候选.md)（OpenAPI 1.22.0 / schema.v1.24）已按[本次独立批准](../90-评审/2026-10-08_P2CSV输入合同批准.md)冻结精确五项字节，profile 已切换 `content-intake-csv-v1`，后续通过 v3 完整十四件包交接。CSV 生产消费者尚未启用；运行接入组合 1.21 / 1.23 的冻结与导出状态以其独立记录为准，上文店铺目录段保留的是冻结前历史。本候选不改变其字节、不迁移真实来源、不激活运行。

2026-10-10 SOP 增量：[P2 SOP 工作簿媒体合同候选](20-P2 SOP工作簿媒体合同候选.md)（`sop-xlsx-v1`，DRAFT · NOT FROZEN · NOT EXPORTED · NOT INTAKE）。首期六个工作表全部纳入，按工作表行聚合文字并关联同一行的内嵌 PNG/JPEG/GIF；图片行缺文字整批拒绝，版本优先读取 `版本`/`版本号`，否则使用原字节 SHA-256，同来源同版本幂等。机器候选与验证见 `content-intake-sop-candidate/`；本轮另形成仍未批准的媒体 HTTP/存储边界增量与验证记录。它们只定义独立图片对象、候选/发布快照引用、受当前资格保护的预览和未知提交恢复，不修改既有 FAQ／CSV、运行接入或旧 `ops-loop` SOP 合同，生产 runner 仍关闭。
2026-10-10 SOP 边界增量：[P2 SOP 媒体运行边界合同候选](21-P2 SOP媒体运行边界合同候选.md)继续保持 DRAFT。它只补齐图片对象生命周期、候选/发布媒体引用、资格保护预览、整单回退与 `COMMIT_UNKNOWN` 恢复。

2026-10-10 业务方案：[SOP 与四张文字表的业务方案选定](../90-评审/2026-10-10_SOP与四表业务方案选定.md) 已选定回退甲、具名总监/经理、四张桌面文字表、SOP 原文路径、旧资料保持原样，以及永久保留下的手工删除。合同衔接定为前序 OpenAPI 1.22.0 / schema 1.25，新版本 OpenAPI 1.23.0 / schema 1.26，迁移编号 `0036`，表所有者 `intake_runtime_fn_owner`。真实对象存储本轮不定，正式 `sourceId` 本轮不编、不导入。`fe2f35e` 已生成 [openapi.v1.23.yaml](openapi.v1.23.yaml) 与 [schema.v1.26.sql](schema.v1.26.sql)，`9038928` 补上六个工作表、`IntakeError`、整次未使用删除，以及已发布图片不能 discarded。核对步骤见 [22-P2 SOP合同候选生成与核对](22-P2 SOP合同候选生成与核对.md)。用户已在 [SOP 合同冻结批准](../90-评审/2026-10-10_SOP合同冻结批准.md) 冻结 `9038928` 的这两份字节；`acccaa1` 未改字节。机器字段仍写着 DRAFT。不 export、不 intake。决策记录第 10 节写的是生成前的状态，保留原字节，因为生成器锁定了该文件哈希。

2026-10-10 来源编号：[Menokin 来源编号](../90-评审/2026-10-10_Menokin来源编号.md) 确认 FAQ 为 `src-menokin-faq`、售前为 `src-menokin-presale`、售后为 `src-menokin-aftersale`、活动为 `src-menokin-campaign`、SOP 为 `src-menokin-sop`。只记名字，未写入来源表，未导入。品牌 `brand-menokin`、店铺 `shop-menokin`、租户 `tenant-menokin`、应用 `app-customer-agent` 已确认。四张文字表的登记种子在产品仓，不随迁移自动执行，不导入原表。SOP 不插入来源表。已冻结字节不改。[预览存放](../90-评审/2026-10-10_Menokin预览存放.md) 确认图片预览只在当前进程，重启后消失，不选厂商，不把字节写入 `0036`。[旧目录](../90-评审/2026-10-10_Menokin旧目录.md) 确认继续不认领、不合并、不删除。

目录名保持技术第 4 关兼容入口。本项目记录仓只保存阶段、决定和证据；产品代码继续只在独立产品实施仓中维护。`DEV-M0`、`DEV-M1` W0～W5 与 G1A-E0 T1～T3 退出证据已完成；comparison v2 合同已通过 PR #23 合并。仓外 T4 输入包以四个 0600 成员装配，实际产品解析器静态校验通过；宿主网络沙箱与异常残留回收先以纯合成数据预演通过。首次 T5 在任何 case 执行前因临时目录别名与 sandbox profile 不一致而失败关闭，RUN/CLEANUP 证据确认 0 条评测与 0 残留；共享来源修复经 PR #24 合并至 `main@4dbee4b`，合并后 CI run `33930030132` 三路全绿；仍只具备合成验证证据，后续 Attempt06/07 仍失败关闭，四域业务版本已确认；33 条工程风险记录待负责人承接合同转换，结果仍固定为 `NOT_SIGNED / NOT_EVALUATED`，不自动放行真实 G1a、`DEV-M2`、飞书运行接入、desktop adapter、部署、Pilot 或付费调用。

- [DEV-M2 运营闭环合同增量](11-DEV-M2运营闭环合同增量.md)：已生成并被产品仓 intake（OpenAPI 1.14.0 / schema.v1.18）。
- [DEV-M3 话术师发布产品/活动合同增量](12-DEV-M3话术师发布产品活动合同增量.md)：DRAFT · NOT EXPORTED。OpenAPI 1.15.0 / schema.v1.19 已生成；未 export，未 intake。
- [后端身份与内容闭环候选](backend-runtime-candidate/README.md)：DRAFT 未冻结、未 intake；静态检查已接入 `test:release`，隔离 PG15 行为为独立命令。不代表 HTTP/worker 已实现或 DEV-M2 已获准。

当前决定与执行入口：

- [2026-09-06 本批负责人确认记录](../90-评审/2026-09-06_G1a本批负责人确认记录.md)：33 条精确范围、处置及风险已确认，仓外实际承接记录已有独立摘要锚点；新包与真实 T5 分别留证，本确认不授权 T5。
- [`../90-评审/2026-09-04_DEC-SEARCH-01真实G1a准入复核.md`](../90-评审/2026-09-04_DEC-SEARCH-01真实G1a准入复核.md)
- 产品仓 `docs/plans/2026-09-04-g1a-search-admission.md`
- [G1A 负责人承接合同增量](02-G1A负责人承接合同增量.md)：元数据与 SQL 登记/撤销/审核前摘要候选已合成验证；完整内容约束/发布/回滚转换与产品接线仍待完成，不改变 T4/T5/T6。

- [A2b-1 承接内容摘要](03-A2b-1承接内容摘要.md)：最终摘要候选及纯合成验证；完整 A2b 与产品消费仍待完成。

- [A2b-2 承接候选范围核对](04-A2b-2承接候选范围核对.md)：内部断言核对实际候选、来源事实及有效承接；存储/发布接线仍待后续 PR。

- [A2b-3 承接存储完整性](05-A2b-3承接存储完整性.md)：三表实际行、条目版本、租户与有效承接绑定；完整消费者和产品接线尚待完成。

- [A2b-4 承接导入终结](06-A2b-4承接导入终结.md)：worker 引用经数据库派生审核元数据，实际暂存整批核对后原子终结；发布与产品接线仍待完成。

- [A2b-5 承接发布与读取门](07-A2b-5承接发布与读取门.md)：发布/回滚保持精确版本和范围，current/搜索/租约重验承接生命周期；完整合同导出及产品消费仍待完成。
- [A3 负责人承接完整合同交接](08-A3负责人承接合同交接.md)：版本化完整 DDL / OpenAPI、确定性生成与精确 commit 导出；产品消费和真实数据验收另行留证。
