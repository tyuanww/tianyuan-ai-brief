# P2 SOP 媒体运行边界合同候选

> **状态：** `DRAFT · NOT FROZEN · NOT EXPORTED · NOT INTAKE · SYNTHETIC DEVELOPMENT ONLY`

这份候选承接 [SOP 工作簿媒体合同候选](20-P2 SOP工作簿媒体合同候选.md)，只补齐“解析结果如何进入既有候选、发布、查询和回退链”的边界。它不改变 FAQ、售前、售后、活动的 CSV/XLSX 合同，不替换旧 `ops-loop` SOP CSV 树，也不授权生产 runner。

## 1. 复用边界

候选复用现有资料接入的上传原字节、候选版本、来源资格、发布、回退和 `operationId` 恢复路径。SOP 不新增一套审批或权限模型：上传与发布继续使用当前四岗业务授权和确认直发规则，确认弹窗只表达操作意图。审批历史不得伪造成通过。

候选输入仍固定为 `sop-xlsx-v1`，六个工作表、行文字、图片归属、版本优先级和幂等规则以 20 号候选及 `protocol.json` 为准。

## 2. 图片对象与候选材料

既有通用 `content_intake.objects` 继续保存原始 XLSX、报告和审核包；它不被扩展成任意图片容器。SOP 图片进入独立的 `sop_media_objects`，只接受 PNG/JPEG/GIF，保存原始字节摘要、MIME、大小、来源和状态。

候选版本通过 `sop_candidate_media` 固定工作表、行、列、行 ID、同一行顺序、图片摘要和媒体对象。候选摘要一旦固定，不能把另一张图片、另一来源或另一行替换进来。整批解析失败时不返回部分附件，也不产生可发布候选。

## 3. 发布、预览与复制

发布前必须在同一事务中重新核对当前来源模式、发布资格、候选摘要、基线、质量状态和所有媒体对象的 `adopted` 状态；文字 release 与 `sop_release_media` 必须原子提交。发布成功后媒体对象进入 `released`，历史 release 和媒体链接不可改写。

查询预览使用当前产品会话、资格、release 范围和媒体链接逐次核验的受控读取，不返回永久对象存储 URL，不跳转外部链接。客服复制只复制该行文字答案，图片只是辅助预览，不被转成答案正文。

## 4. 回退与失败恢复

回退计划必须包含目标 release 的完整媒体链接集合，生成新的 release lineage，不修改历史 release。部分来源失权按用户已确认的整单策略返回 403，全部失权返回 404；任一受保护 release/lease 仍引用的媒体不能清理。

上传、解析、发布和回退都使用现有 operation namespace。`COMMIT_UNKNOWN` 保留原 operationId 和未能确定状态的对象，不能换新键重发；只有明确未采用且未被引用的 `staged` 媒体才可回收。保留期和清理任务未获批准前，不删除历史媒体。

## 5. 机器候选与验证

- [openapi.delta.json](content-intake-sop-candidate/openapi.delta.json)：既有 HTTP 路径的 SOP 媒体字段、预览和错误语义增量。
- [storage.delta.sql](content-intake-sop-candidate/storage.delta.sql)：图片对象、候选媒体链接和发布媒体快照的 additive SQL 候选；不授予应用角色权限。
- [boundary-verification.md](content-intake-sop-candidate/boundary-verification.md)：状态机、失败矩阵和静态验证范围。

这些文件只做候选层验证。正式 OpenAPI/schema 版本、迁移编号、对象存储供应商、附件保留期、真实飞书绑定和 runner 激活，必须在评审后由生成器产生并独立冻结、export、intake。冻结前不得复制 SQL 到产品迁移，不得把候选路径注册到生产 HTTP。
