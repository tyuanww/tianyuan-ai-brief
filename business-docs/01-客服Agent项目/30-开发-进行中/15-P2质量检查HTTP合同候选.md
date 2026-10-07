# P2 质量检查 HTTP 合同候选

> 状态：DRAFT · NOT FROZEN · NOT EXPORTED · NOT INTAKE · SYNTHETIC DEVELOPMENT ONLY
> 2026-10-07。接续用户要求继续 FAQ 合成闭环、审核修复并本地提交的授权。本候选不构成冻结批准；批准、export/intake、真实飞书、生产 ACL、v2-active 和对外交付仍分别办理。

**直接前序机器合同：** OpenAPI 1.17.0 SHA-256 `3e0a3f122aefa0bff9c330e105f1a5cbb2b26662fd5f04db1ef3a93ac1bc1121`；DDL schema.v1.21 SHA-256 `5f958e4f7dcde7e11f9a6d38d8339b96654517209a493776acbfc7c3f5202013`。

**P2 质量机器合同增量：** OpenAPI 1.18.0 SHA-256 `7982b5b05b1e686e446544db092e6c73325ad0386a1772e2b004e282ff792664`；DDL schema.v1.21 SHA-256 `5f958e4f7dcde7e11f9a6d38d8339b96654517209a493776acbfc7c3f5202013`。

**实际产物必须精确匹配：** OpenAPI SHA-256 `7982b5b05b1e686e446544db092e6c73325ad0386a1772e2b004e282ff792664`；DDL SHA-256 `5f958e4f7dcde7e11f9a6d38d8339b96654517209a493776acbfc7c3f5202013`。

## 1. 范围、所有者与边界选择

前序 [P2 接入](13-P2资料接入合同候选.md)和[使用资格](14-P2使用资格上下文合同候选.md)继续有效。本次只补质量 HTTP 读写；产品仓已有内部预览、不可变计划、逐条检查及原子发布门，当前 HTTP 上传/组织审核/发布链通过内部质量服务准备证据，尚未形成全 HTTP 管理流程。

治理仓拥有本规范和 OpenAPI 生成源。产品 API 复用现有质量事务及永久回执，拥有认证、授权、分页投影、预算与 HTTP 错误；数据库继续拥有阶段集合、历史不可变与质量结论。Main 后续持有会话、候选键和本地检查草稿，renderer 只给出逐条检查意图，不取得身份、seed、审核结论或发布票据。

比较 A 整个内部质量对象直接输出并分批写入，B 有界摘要/样本分页、完整阶段一次原子提交。选择 B：A 暴露内部 staging/risk 占位信息、放大响应，并需另造可中断提交状态；B 复用已验证的质量状态机，只为传输增加有界视图和精简回执。样本页直接复用完整 IntakeEntry，避免客户端跨接口拼装版本。没有新质量引擎、抽样算法、表、DDL 版本或应用授权。

质量内部表是产品 overlay `0023` 的既有实现；本增量成对引用 schema.v1.21 原字节，不把产品 overlay 复制为第二真源。`--write-intake-quality` 只写新 OpenAPI，核验旧 DDL 而不重写。export profile 保持 `content-intake-usage-v1`，新候选目前不能被既有导出器当作已批准合同导出。

## 2. 最小 wire

候选路径前缀为 `/v1/intake/candidates/{candidateId}/versions/{version}/quality`。所有路由使用 ProductSession；参数精确、未知/重复参数拒绝，认证先于载荷解析。GET 的 `digest` 是完整候选摘要，POST 地址与 body.key 必须完全一致。

| 路径 / 方法 | 输入 | 成功输出与含义 |
| --- | --- | --- |
| 前缀 GET | digest | IntakeQualityStatus：当前摘要、计划预览/冻结信息、每阶段检查数/缺陷数及主体事实版本 |
| `/samples` GET | digest、viewHash、phase；cursor、limit 可选 | IntakeQualitySamplePage：对应阶段的有序样本、完整条目、已有检查与 nextCursor |
| `/freeze` POST | operationId、key | IntakeQualityReceipt；服务器确定样本。已冻结时不重新抽样或清空检查 |
| `/checks` POST | operationId、key、phase、checks | IntakeQualityReceipt；完整阶段一次原子提交，结论由服务器计算 |
| `/v1/intake/quality/operations/{operationId}` GET | action=quality-freeze 或 quality-check | 原主体精简历史回执；独立于现有 publish/cancel/rollback 命名空间 |

状态沿用 `not_frozen / initial_required / expansion_required / passed / revision_required / blocked`，只由服务器投影。not_frozen 的 plan 仅为预览，frozen=null、rounds=[]；后续状态必须有冻结主体事实与时间。initial_required 不得有已完成轮次；expansion_required 只能含 initial；已检查的终态至少包含 initial，expanded 不能独立出现。expanded 提交回执不得仍为 expansion_required。零样本仍须显式提交一次空 initial，不能直接宣称 passed。initialTarget/expandedTarget 是常规稿抽样目标，initialCount/expandedCount 是实际阶段样本数（含关键稿必查项）。ordinaryCount + mandatoryCount 为启用条目分母，withdrawalCount 单独计数；停用仍受完整材料摘要绑定。

每项检查只有 scriptId/contentHash/defect/reason。scriptId 必须唯一，集合和 hash 精确匹配冻结阶段；空 checks 仅在该阶段真实没有启用样本时合法。扩样覆盖初样且初样检查逐字不变。常规稿可自审；关键稿排除全部贡献人及同人别名。2%/5% 规则与现有质量门相同；任一剩余缺陷不得发布，必须修订新候选。质量 passed 不能代替组织审核、来源确认、双方当前资格或发布票据。

样本只包含 upsert 条目；mandatory 来自整份候选的风险分类，不能接受客户端指定。check 若非空，其 scriptId/contentHash 必须与所在样本一致。内部说明仅向具备当前 review 权限的管理端返回，坐席发布投影仍禁止包含。接口不输出旧 staging_id、伪造的旧风险类别、人员姓名、提供方原文或凭据。

## 3. 分页、一致性与容量

IntakeQualityStatus.viewHash 是 key/plan/state/frozen/rounds 的规范 JSON SHA-256（排除 viewHash 本身）；规范编码沿用候选材料的排序对象键、原数组顺序与无多余空白编码。客户端只比较，不生成或解释。samples 必带刚读取的 viewHash。未冻结时仍可预览初样/扩样；服务端每页重验当前会话、review 权限、来源、base、候选键及计划，失效时不给出旧材料。

游标必须完整性保护，绑定路径、会话、主体事实/授权版本、key、viewHash、phase、limit、分页位置及最早截止。状态或检查轮次改变后旧 viewHash/游标返回 CONFLICT / MATERIAL_CHANGED；客户端从摘要及第一页重读。服务重启后旧游标失效。前次查询不续权；普通新页面不能接受另一会话、阶段或候选的游标。每页按服务器抽样顺序返回，既无重复也不跳项。

| 边界 | 固定限制 | 超限行为 |
| --- | --- | --- |
| freeze 请求 | 65,536 字节 | 413 / VALIDATION / FILE_LIMIT |
| checks 请求 | 8,388,608 字节 UTF-8 JSON body；不接受压缩请求 | 读取时有限制，整次拒绝，不截断、不分阶段偷偷提交 |
| checks 持久投影 | PostgreSQL `octet_length(checks::jsonb::text)` ≤ 8,388,608 | 写入前在同一事务校验，413 / FILE_LIMIT；不能等 CHECK 异常变成 INTERNAL_ERROR |
| 每轮检查 | 0–5,000 项，每项原因最多 1,000 Unicode code points | 集合/单项不合法为 400 / FILE_INVALID；字段合法不豁免整批字节预算 |
| 摘要 / 回执响应 | 65,536 字节 | 内部异常失败关闭，不回传部分对象 |
| 样本页响应 | 8,388,608 字节；limit 默认50、最大100 | 达字节限提前完整截页；单条绝不截断，nextCursor 非空时 items 不能空 |

原因禁止 NUL 和未配对 UTF-16 代理项；defect=true 要求存在非空白字符。Unicode code point 与 JS UTF-16 长度不同，产品接入时需统一校验；当前内部 `reason.length` 尚未按新 wire 调整。HTTP 原始字节和 PostgreSQL jsonb 文本字节分别校验，不能用 JSON.stringify 的字节数冒充数据库检查。失败不留下半个轮次或成功回执。

## 4. 幂等、恢复与错误

永久回执沿已有 `actor_user_id + intake:quality-freeze|intake:quality-check + operationId`。同一键和相同语义载荷恢复历史结果，不重新检查、更换抽样或写入新轮次；载荷变化为409 / IDEMPOTENCY_CONFLICT。键在 Main 中保留至结果确定；未知提交不新建键，不盲目宣布失败或成功。

POST 和专属 GET 只输出 operationId/action/key/state/phase。state 是该操作完成时的历史质量状态，当前页面必须另取摘要。不得将内部永久回执里的完整 population/checks 原样发给客户端。恢复要求当前会话和主体事实有效；业务 review 权撤销后，原主体仍能恢复不含正文及原因的历史回执，这与既有发布回执相同；它不授予新读写权。注销/禁用/事实过期拒绝，另一主体或不存在均为相同404 / COMMIT_UNKNOWN。404 不证明服务器没有提交，仍需原键原载荷恢复。

错误使用 IntakeError。非法请求400；会话无效401；具体资源无权/不存在404；陈旧材料、base、阶段、游标或载荷冲突409；容量413；过载及提交未知503。未知提交保留 COMMIT_UNKNOWN。诊断只包含脱敏 ID，不写正文、原因、真实身份或 token。读取、冻结和质量检查均不调用远端飞书；组织审核由既有认证适配器独立拥有。

## 5. 接入顺序与验收

本轮实际合同验证与审查见[验证记录](content-intake-quality-candidate/verification.md)。生成器、标准 JSON Schema、前序不变和合成最大字段往返属于候选证据，不等于质量 HTTP 运行已完成。

1. 审阅本页精确版本对并批准冻结；在本仓新增独立批准/导出门，拒绝旧批准、混配、DRAFT、漂移和降级。
2. 产品仓 versioned intake OpenAPI1.18/schema1.21，保留原DDL和全部 migration checksum，重新生成运行 validator。
3. API 增加有界投影和窄路由：复用内部质量状态，补 code point/字节验证，POST重放只投影精简回执，GET恢复不泄露完整内部记录；不接生产工厂或新 ACL。
4. 实际产品会话与 PG 验证：预览→冻结→样本分页→逐条提交→组织审核→发布→第二坐席消费；两会话/跨店/撤权/注销/旧键拒绝；0与5,000项、漏项/重复/hash不匹配、扩样历史不变、关键贡献者、超字节整批拒绝、游标跨阶段及状态变化、COMMIT丢响应/重启原键恢复。
5. Main/preload/管理 UI 接线及 Mac/Windows 原生验收。真实组织/审批 transport、业务现场演练、v2-active和生产运行继续按各自批准推进。
