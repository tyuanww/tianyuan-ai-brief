# SOP 媒体运行边界候选验证

> 状态：`DRAFT · NOT FROZEN · NOT EXPORTED · NOT INTAKE · SYNTHETIC DEVELOPMENT ONLY`

本记录验证候选边界是否能被现有资料接入合同消费。它不是数据库迁移、OpenAPI 正式版本、生产 runner 或真实对象存储配置。

## 本轮新增候选

| 文件 | 作用 |
| --- | --- |
| [`openapi.delta.json`](openapi.delta.json) | 复用现有上传、候选、发布、回退和 operationId 路径，补充 SOP 图片引用、受资格保护的预览和失败映射 |
| [`storage.delta.sql`](storage.delta.sql) | 为图片对象、候选附件链接、发布附件快照增加独立的 additive schema 候选；不修改现有 XLSX 对象表 |
| [`protocol.json`](protocol.json) | 固化 `sop-xlsx-v1` 的输入格式、行文字、六表和解析失败边界 |
| [`review-gate.md`](review-gate.md) | 列出冻结、导出和产品 intake 前必须由治理仓确认的六项合同决定与最小证据包 |

## 关键不变量

1. 原始 XLSX 仍进入既有 input object；图片对象单独保存为 PNG/JPEG/GIF 元数据，不能把图片 MIME 塞入既有通用对象表。
2. `sourceId + version` 只产生一个候选。重放沿现有 operationId 查询，不重复创建图片对象或附件链接。
3. 候选材料固定后，工作表、行号、列号、行 ID、图片哈希和 MIME 不能改写；外链只保留标签。
4. 发布必须在同一事务中核对来源、候选 digest、图片对象 `adopted` 状态，并同时写文字 release 与 `sop_release_media`；不能生成只有文字或只有图片的半发布。
5. 查询预览每次重验当前会话、资格、release 范围和 release-media 关联，不返回永久对象 URL；客服复制仍只复制文字答案。
6. 回退复制完整媒体集合并生成新 release lineage；部分来源失权返回 403，全部失权返回 404，历史 release 与媒体行不被修改。
7. `COMMIT_UNKNOWN` 保留原 operationId 和临时对象，不能换新键重发；失败回收只处理明确未采用的 `staged` 对象。

## 负面场景矩阵

| 场景 | 预期结果 |
| --- | --- |
| 图片行没有文字 | `IMAGE_WITHOUT_TEXT`，整批无可用 rows/attachments |
| 图片超过单张/总量预算 | `MEDIA_LIMIT`，不创建可发布候选 |
| 来源不属于当前会话或权限撤销 | 具体资源统一 404，不能泄露存在性 |
| 候选图片尚未 adopted | 发布 409 `MEDIA_NOT_READY`，不写 release |
| 发布事务提交未知 | 503 `COMMIT_UNKNOWN`，沿原 operationId 恢复 |
| 发布后部分来源失权再回退 | 403 `SCOPE_DENIED`，整单拒绝 |
| 发布后全部来源失权再回退 | 404 `NOT_FOUND`，整单拒绝 |
| 预览请求带外链或对象存储 key | 拒绝；响应不重定向、不暴露永久 URL |
| 删除仍被 release/lease 引用的图片 | 外键/策略拒绝，保留历史 |

## 静态验证范围

- `node -e 'JSON.parse(fs.readFileSync("openapi.delta.json"))'`：验证机器候选可解析。
- `node -e 'JSON.parse(fs.readFileSync("protocol.json"))'`：验证输入协议可解析。
- SQL 静态检查：确认只创建 `sop_*` 增量表、只接受三种图片 MIME、无应用角色 `GRANT`，并保留 `BEGIN/COMMIT`。
- `npm --prefix sites run test:intake-sop-media-boundary`：用 Node test 和 `@libpg-query/parser` 重复验证 DRAFT 状态、七条路径、错误恢复面、三张 `sop_*` 表、三种图片 MIME 和封闭 ACL。
- `npm --prefix sites run test:docs:fast`：验证文档和本候选没有空白错误。
- 2026-10-10 的 `npm --prefix sites run test:release` 已完成并退出 0；既有 release 质量计划的测试、边界、机器合同、架构和依赖审计均通过，Redocly 的历史非阻断 warning 保留。由于本候选尚未接入生成器 profile，这次 release 不被写成 SOP 媒体合同的冻结或产品消费证据。
- 不运行真实 PostgreSQL 安装、真实对象存储、真实飞书或生产 HTTP；正式 release 必须在合同获批准、生成器接线和冻结 profile 后重新执行。

## 仍未定义且不能提前实现

- 正式 OpenAPI/schema 版本号、迁移编号和生成器 profile；
- 附件保留期、清理任务和对象存储供应商/加密配置；
- 真实 Feishu 来源绑定、生产账号和 runner 激活；
- Windows 和真人系统对话框验收。

因此本轮只能把边界做成治理候选，不能把这些文件复制为产品迁移或生产路由。下一道门仍是治理评审、批准、冻结、导出和产品 intake。
