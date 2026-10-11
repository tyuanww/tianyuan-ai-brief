# SOP 单行删除后继候选

状态：**DRAFT · NOT FROZEN · NOT EXPORTED · NOT INTAKE**。正式 OpenAPI/schema 版本、迁移编号仍未分配；`productionConsumerReady=false`。这是既有手工删除需求的修正，不新增业务范围。旧冻结 SQL、产品 migration 0038/0039 和已消费 DELETE/204 接口未改。

## 所有者与边界

治理仓拥有 `storage.source.sql` 与协议提案，生成器从它生成 `storage.candidate.sql`、`openapi.delta.json`、`manifest.json`，校验冻结 OpenAPI 1.23 和 schema 1.27 overlay 的精确哈希。安装前还校验旧删除函数正文；候选仅在调用者拥有的隔离事务内试装，不是正式 migration。

产品解析器唯一拥有工作表行到 businessEntryId 的映射，返回 `rowBindings`（行号、业务键、标题、文字）。已有编号仍沿用 `sop1…`，不得从图片顺序猜行键。新 `sop_candidate_rows` 持久绑定完整候选的每条 entry。可信解析服务通过新 `freeze_sop_parsed_candidate(actor,job,material,rows,media)` 一次性冻结候选、词项、完整行、图片和 job 状态。候选新入口不再依赖应用角色直写这些表，正式生产 runner 尚未接线。旧候选无绑定时拒绝单行删除；重新导入或既有继承行的可靠映射闭包到位后才能正式接入，不能伪造缺失映射。

比较过两种边界：给旧媒体删除函数直接补 EXECUTE 仍会留下正文并沿用旧质量证据；选择新命令生成下一版本，保留不可变历史，复用现有候选/授权/永久回执机制。没有第二份发布指针、独立权限角色或数据库直写入口。

## 操作语义

- 当前有 `candidate-cancel` 资格的四岗可在自己有权的来源删除未使用行；登记映射另需 `import` 资格。身份来自受信服务端会话，不来自请求体。冻结、继承读取、删除和四个预约生命周期窄函数只给 `intake_business` EXECUTE，函数属主仍为已有 NOLOGIN `intake_runtime_fn_owner`；新表不给应用角色读写，行登记／媒体登记 helper 仅属主内部调用，旧媒体删除函数继续拒绝该角色。
- 校验当前候选 key、来源版本和 mode、发布基线、发布中/未知提交；沿既有 content lock → legacy publish lock 顺序执行。
- 剩余行非空：原候选失效但正文/摘要不改，新候选版本删除目标文字及差异项、保留其他行，来源确认从 0 开始，质量重新冻结检查。风险分类保守保留，不能删除一行降低审核要求。
- 删除最后一条未使用行：取消本次候选，保留历史正文；不生成空的可发布全目录。
- 当前或历史发布谱系出现过的业务行、发布媒体、已经 adopted/released 的目标图片，拒绝删除。候选新增 lineage 语句级触发器统一建立图片发布关系并 adoption；真实三种发布入口的业务验收仍须由组合测试证明，安装通过不等于发布行为通过。
- 一行多图一起解除当前关联；只有没有任何候选/发布引用的未用 staged 对象才标 discarded。共享图片和历史引用保持；不执行物理对象删除、不设自动保留期。
- 新 POST `/v1/intake/sop/candidates/{candidateId}/versions/{version}/row-deletions` 提案返回 `IntakeCandidate`，要求 operationId/key/rowId。永久回执同请求重放，换载荷拒绝；提交未知先保留预览，重放确认后按回执中的完整剩余行集合投影；投影绑定候选版本，旧回执不能删除重新导入后的新版或发布预览。正式 HTTP 接线必须检查路径与 key 一致，迁移客户端后才能停用旧命令。该路由目前不存在于生产 API。

## 当前合成证据

产品 `apps/api/tests/sop-row-deletion-candidate.integration.test.ts` 显式加载本候选，在一次性 PG15 上用真实解析器生成合成六表；旧轮 parser-stage 与绑定由测试夹具准备，**删除使用非超级用户业务池**。旧轮 16 项检查通过：纯文字、图片、共享图片、完整历史/摘要、来源/质量失效、最后一行取消、越权/缺行/旧摘要、撤权/到期/岗位变化/跨租户、错误绑定、并发相同请求、COMMIT 回执丢失恢复、函数后故障整笔回滚，以及真实 source/quality/publish 后与下一候选的历史行拒绝，以及同候选重导/发布后旧删除回执不再影响新版预览。

这些旧轮证据不覆盖新增可信冻结入口；新入口的独立受限角色验收及组合安装结果需按新 source 哈希记录。它不是 HTTP/Electron/生产装配验收。机器合同、静态生成和产品检查的命令/退出码另见本轮仓外证据《客服Agent-SOP单行删除修复-20261011/核对与交接.md》。完整 `/review` 和 `externalCompleteReview` 保持 INCOMPLETE。

## 正式版本化交接包条件

1. 将本候选与已通过业务 PG 矩阵的 `publication-compatibility-candidate` 纳入同一后继范围审定，分配新的 OpenAPI/schema/迁移号。不得覆盖前序冻结字节。
2. 验收并审定新可信冻结候选，将产品实验 producer 与完整安装 ACL 固定到相同哈希；审定新 POST 的错误/响应与 Main 恢复规则。旧 DELETE 不能仅补授权继续对外声称“删除文字”。
3. 按生成器生成完整后继合同，检查全部安装依赖、ACL 与反向失败路径；治理 `test:release` 在最终冻结输入上通过，记录批准/冻结及封闭 export profile，取得 export 回执。
4. 产品按回执进行版本化 intake、生成迁移及合同，再接 runner/HTTP/Main 并验上传→单行删除→重新检查→确认发布→第二客服查询。未满足上述条件前，不把本 SQL 复制为正式 migration，不打开真实账号/来源或生产入口。

## 可信解析候选的原子边界

- `freeze_sop_parsed_candidate(text,text,jsonb,jsonb,jsonb)` 只接服务端 parser 已校验的材料，不增加客户端可提交任意 material 的 HTTP 路由。当前主体必须拥有该 job，且仍有来源 import 资格；job 可为 reading/parsing，同 job validated 只接受相同材料及完整登记载荷重放。
- DB 核对 source 版本/mode、job 对象及来源、当前发布基线、expected prior key、不确定发布、完整 rowBindings、媒体行位置/hash/类型/字节数。新表 `sop_asset_registrations` 固定完整登记摘要，即使首轮没有图片，也不能重放时追加图片。
- `read_sop_inherited_assets(actor,job)` 仅返回该有权 job 的 base release 同来源谱系。每条历史 entry 必须存在可靠 rowId；未知历史关系拒绝，不从 sop1… 顺序或图片行号猜。`freshRowIds` 明确区分本次解析行与继承行；只有继承 entry 的文字和媒体集合必须精确继承，本次解析行允许保持文字而更换或去掉图片，无法完成映射时整单失败。
- `register_sop_candidate_rows` 和 `stage_sop_candidate_assets` 只供 NOLOGIN 属主内部使用；旧 `stage_sop_candidate_media` 仍不授予 business。`intake_business` 得到冻结、继承读取、删除与四个预约生命周期 EXECUTE，不获得新表读写。NOLOGIN 属主拥有 job 完成字段、对象与预约账本的内部写权限；`intake_usage` 只增加绑定租约的 metadata reader EXECUTE。
- 所有写入都属于调用方事务；任何末段失败会同时撤销候选、prior 状态、词项、job、行、媒体与登记摘要。COMMIT 未知仍由既有事务/回执所有者处理。SQL 只核对媒体元数据，实际图片字节与 hash 必须由可信 parser 校验，不能以 SQL 通过冒称文件解析已通过。

## 删除历史与新内容版本复用（本轮后继候选）

已选语义：新内容版本可以重新使用从未发布、无任何当前引用的已删图片；同内容版本重放不能恢复已删行。`contentVersion` 只来自唯一 parser：文件有版本列时保留其原值为 `declared`，没有版本列时用整份文件 SHA-256 为 `sha256`。新 job、operationId、候选修订号或单纯重新导出的字节变化都不能替代同一声明版本；SQL 不自行解析 XLSX，信封只准来自受信服务。

`media` 信封现在必含严格 `contentVersion: {kind,value}`，value 使用既有单元格 32767 字符上限，不引入额外 128 限制。`sop_asset_registrations.content_version` 绑定候选版本；手工删除派生版本继承该身份，其 payload_digest=NULL 明确不是可重放 parser 登记。

每次删行追加不可变 `sop_row_deletion_events`，保留来源、内容版本、候选、行、操作者、删除时间及媒体删除后的精确状态/时间/元数据；纯文字与共享图行同样留事件。UPDATE/DELETE 被历史触发器拒绝，新表不授应用角色权限。任何新 job 的完整行集合如果包含同来源、同内容版本已经删掉的行，整单拒绝。

选择了比“保留 tombstone 并改新对象 ID”更小的边界：保持已有来源+字节对象 ID、唯一约束和 FK。新版本复用时，只有 fresh parser 行、对象无候选/发布引用、从未 adopted、同源同 hash/大小/MIME，且不可变事件能证明当前 discarded_at 的原删除事实才可恢复当前投影为 staged。current discarded_at 清空遵循旧状态 CHECK；原时间在不可变事件中永久保留，不是抹掉删除史。任何历史同内容版本已经完全 discard 的对象都不得借当前对象已恢复为 staged 绕过。无审计事件的旧 tombstone 不猜版本，继续拒绝，需单独获批修复。

本轮后继现在补齐两张关系表含 row_id 的主键及旧 stage 冲突目标，保留完整 provenance UNIQUE/FK；冻结原件不变。不把本候选验收写成正式 freeze/export/intake。新生命周期源码变化后，旧 42/42 和旧 release 只覆盖其旧输入，须引用新的定向矩阵与后续最终 release。


## 图片发布与私有持久 payload 后继（待组合业务验收）

新增 `sop-media` 用途复用原 objects 与 object_reservations 容量账本，不新建配额。用途与 MIME 显式配对，旧 CSV/XLSX、report/review-package 不因图片 MIME 扩展而放宽。`sop_payload_bindings` 固定 `(job,media)` 的首个 obj_ 预约，四个窄能力分别预约、确认持久化、开始释放、完成释放。reserve ACK 未知可按原身份重放；文件适配器在私有独占锁下重读状态，releasing/released 不写。cleanup 仅检查原预约身份和未采用，不要求保留 import 资格；提交未知不自动释放。

media items 增加 `payloadObjectId`，freeze 内部原子采用真实已持久预约并以精确 source/hash/bytes/MIME/purpose FK 绑定。多行共用一个媒体对象；不同 job 并发产生副本时，全局已采用 payload 优先，另一副本仍可按明确未采用回收。释放不能触及已登记历史 payload。validated 恢复时，`read_sop_inherited_assets` 的 `pendingPayloads` 只返回该 job／actor／source 的 reserved、persisted、releasing 描述符，供产品在确认恢复结果后调用原受保护释放能力；不返回 adopted/released，不直接删除文件或放宽释放约束。旧缺 payload 不猜路径，不虚构迁移修复。

`release_lineage` AFTER INSERT 语句级 trigger 是图片发布关系唯一写入者，按精确 candidate/version/source/businessEntryId→row 复制并首次 adoption；新发布、回退、合法旧发布继承均经过此数据入口。缺 row mapping/登记/payload、discarded 媒体或材料矛盾导致整笔发布回滚。`sop_release_media` UPDATE/DELETE 拒绝，历史不会因新图片覆盖。语句级集合按唯一候选展开材料，避免每行重复展开全集。

`read_sop_release_assets(actor,entitlementHash,sessionHash)` 仅供 usage 调用，校验租约身份、session、代数和当前 query 来源后返回行级 metadata，私有 payload ID 不进入 HTTP。原 usage 仍拥有完整 scopes/binding/releaseDeadline/contentDeadline 及最终提交前截止；文本生效时间同租约 issued_at。产品层按行适用性过滤后去重、只在打开时读取单图和复核字节，不能回退内存 Map 掩盖磁盘丢失。

当前新增证据是生成器／SQL语法 4 项及真实 PG15 安装、无权函数调用、空 lineage 语句触发器运行和事务回滚。完整非超级用户预约→文件→freeze→发布/回退/继承→冷读取业务矩阵由产品／主 Agent 组合验收；这里不提前写成通过。正式版本、冻结、导出与接收仍未发生。
