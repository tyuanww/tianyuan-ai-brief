# 2026-10-06 安全维护与公开脱敏快照

> **性质：** 修复公开历史 Web 的第三方前端依赖，并按当前公开边界遮罩历史组合费用的精确金额；不改变项目状态、结论或审批记录。
> **派生基线：** `2026-07-31-ai-project-brief`（旧目录与旧 manifest 保持字节不动）。

## 变更

- DOMPurify `3.4.12` → `3.4.16`（含 GHSA-55q2-fjhq-7xh7、GHSA-p98j-92pf-mc4p；[上游说明](https://github.com/cure53/DOMPurify/releases/tag/3.4.16)）；
- Mermaid `10.9.6` → `10.9.8`（GHSA-c4c3-pg64-4m4v、GHSA-6x64-9x62-f2gx、GHSA-2v8p-3f2j-5mp7）；
- Mermaid 从 ESM 依赖图重新打包，实际包含 KaTeX `0.18.2`（[GHSA-238p-pmpm-9mq7](https://github.com/advisories/GHSA-238p-pmpm-9mq7)）；不能用锁文件升级冒充预打包文件已修复。
- 构建依赖 source-map-js 升至 `1.2.2`（[GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)）；不向浏览器增加该依赖。
- 公开副本只保留“历史组合费用提案未获批准”的结论，移除其精确金额；
- 同步本地 vendor、DOMPurify import、Mermaid loader/SRI，以及由构建器生成的 Bundle、release.json 和 index 资源指纹。

## 不变边界

除上述安全与公开脱敏白名单及本说明外，所有文件必须与基础归档逐字节一致。`data/content.json` 只允许两处确定性费用脱敏；Schema、CSS、业务源 JS、许可证与素材不得变化。
本目录仍是历史展示快照，不是当前客服 Agent 项目或任何业务状态的真源。
`ARCHITECTURE.md` 同步上述两项依赖版本并将 Markdown 行尾空格换行为反斜线换行，其余历史语义不变。
