# P2 SOP 合同候选生成与核对

> **状态：** `FROZEN · NOT EXPORTED · NOT INTAKE · SYNTHETIC DEVELOPMENT ONLY`
> **冻结记录：** [2026-10-10 SOP 合同冻结批准](../90-评审/2026-10-10_SOP合同冻结批准.md)
> **合同字节提交：** `9038928`。说明提交 `acccaa1` 没有改这两份文件。

这份说明告诉你怎么核对已经冻结的 SOP 合同。冻结批准不改写机器文件里的 `DRAFT` 和 `freezeApproved:false`。它不执行 export，也不把合同送进产品仓。

## 你现在有什么

生成器 [build_customer_agent_sop_contract.mjs](../../08-工具/build_customer_agent_sop_contract.mjs) 读取三份已冻结或已选定的输入：

- `openapi.v1.22.yaml`
- `schema.v1.25.sql`
- [2026-10-10 业务方案](../90-评审/2026-10-10_SOP与四表业务方案选定.md)

它写出：

- [openapi.v1.23.yaml](openapi.v1.23.yaml)
- [schema.v1.26.sql](schema.v1.26.sql)

`9038928` 在生成结果上补了四件事：六个工作表名称固定为过敏流程SOP、少错破SOP、品质售后SOP、税收相关规则、品牌对接资源汇总、长痘痘SOP；回退错误使用既有 `IntakeError`；可以手工删除整次未使用上传或单行；已采用或已发布的图片不能再标成 discarded。

`0036` 只是以后产品迁移的目标编号。产品仓里还没有这个文件。三张新表的所有者是已有的 `intake_runtime_fn_owner`。导出器封闭名单里没有 `content-intake-sop-xlsx-v1`。

决策记录第 10 节仍写着“还没有生成这些文件”。那一句记录的是生成之前的状态。不要改那一节，生成器按该文件的哈希拒绝漂移。

## 怎么核对

在治理仓根目录执行：

```bash
node business-docs/08-工具/build_customer_agent_sop_contract.mjs --check
node --test sites/tests/content-intake-sop-contract.test.mjs
npm --prefix sites run test:docs:fast
```

三条都退出 0，才表示仓内文件和生成器一致。`--check` 失败时不要手改 `openapi.v1.23.yaml` 或 `schema.v1.26.sql`。先改生成器，再用 `--write` 重写这两份文件，然后重新跑上面三条。

本机 Node 使用 `$HOME/homebrew/opt/node@24/bin`。不要为了这次核对去 `npm install`。

## 还不能做的事

- 不要改写 `openapi.v1.23.yaml` 或 `schema.v1.26.sql` 来把机器字段改成 FROZEN。冻结状态在批准记录里。
- 不要把 SOP profile 加进导出器封闭名单，也不要运行 export。
- 不要把 `0036` 写进产品仓。
- 不要编正式 `sourceId`，不要读取桌面上的真实表格。
- 不要接真实对象存储、真实飞书或生产 runner。
- `productionConsumerReady` 保持 false。完整 `/review` 仍是 INCOMPLETE。

旧的 `content-intake-sop-candidate/` 仍是草稿，不是这次冻结的文件。
