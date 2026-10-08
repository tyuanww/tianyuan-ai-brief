# 确认直发候选验证

> DRAFT 候选验证；不构成冻结、导出、产品接入或生产批准。完整版本对以[候选规范](../17-P2权限配置与确认直发合同候选.md)为准。

2026-10-08，Node24、本机 macOS，全部身份与资料为合成 fixture。6项标准 JSON Schema / 生成一致性测试通过；覆盖 confirmed=true、拒绝审批/身份伪造、policy/approval形状、保留旧机器字节与非目标wire、路由/方法白名单。

实际 PostgreSQL 15.18 在临时Unix socket实例运行 `npm --prefix sites run test:intake-direct-contract:pg`：112项检查通过，含在已有旧候选上的1.21→1.22增量迁移、直发不带审批存储、旧审批门保留、跨政策关联拒绝、确认记录不可变、回退确认与新表ACL仍封闭。运行日志在仓外忽略目录 `output/content-intake-direct-contract/`。父release行仅为外键目标，探针事务在完整发布约束前回滚；不声称通过真实发布/并发/HTTP运行验收。

完整 `test:machine-contracts` 通过；最终直发定向测试、生成检查和 OpenAPI lint 通过。lint有23项非阻断警告：19项继承前序、4项为有意停用审批POST不再声明2xx成功，不能为消警告恢复伪成功。

本机核心与独立审查已完成；发现停用review POST仍声明202成功的问题，已删除四处2xx并补回归，独立复核确认关闭。见[review.json](review.json)。没有发起新外部模型审查；历史外部超时及完整审查INCOMPLETE保留。

完整 `npm --prefix sites run test:release` 已通过，包含浏览器/边界/架构检查、各版本合同及依赖审计（0 vulnerabilities）。本轮没有安装或改依赖。结束后只补充验证记录和工具入口说明，执行docs:fast，不机械重跑未变化的运行检查。命令、日志指纹及原输出见[checks.json](checks.json)与[logs.json](logs.json)。输入指纹见[input-sha256.json](input-sha256.json)，PG结果见[pg-summary.json](pg-summary.json)。

2026-10-08角色补充：规范新增四岗上传发布、两岗配置权限的需求；本轮仅改Markdown，机器产物、生成源、依赖和测试输入未变，复用上述原候选验证并运行docs:fast。上述结果不覆盖新增角色分工的实现，正式冻结前须补对应权限差异和四岗验收；不将本次文档补充记为运行规则已切换。
