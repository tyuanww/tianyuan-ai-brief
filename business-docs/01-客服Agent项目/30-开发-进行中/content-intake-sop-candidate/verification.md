# SOP 工作簿媒体候选验证

> 状态：`DRAFT · NOT FROZEN · NOT EXPORTED · NOT INTAKE · SYNTHETIC DEVELOPMENT ONLY`

本记录只证明候选格式与产品仓合成解析器的边界相互对应，不证明治理合同已批准，也不证明生产 runner、HTTP、数据库、桌面或真实飞书已接入。

## 输入与来源

- 产品实现提交：`customer-agent-prototype@8cbe5ec1fd24c40effa5d9716cd79ac635b85ad3`
- 产品解析器：`packages/content-intake/src/sop.ts`，SHA-256 `505963f89fb386a493e6b9717e63e4e4fb2f7b3f764bba383cf6474d8013c490`
- 归档预算实现：`packages/content-intake/src/archive.ts`，SHA-256 `efb30362312120187dfe36babf8650acff90fcbf7c598ba49ad61af5c094d4a6`
- 合成测试：`packages/content-intake/tests/sop.test.ts`，SHA-256 `9f61243f986ac343da555eab9df55dd70db751edc227d2f8f3d7a7e2110b1ca2`
- 测试日志：产品仓 `evidence/qa/intake-sop-candidate-20261009/vitest.log`，SHA-256 `492174005c62896f92ff779c8d3275401abcdad143f9588d039474a996b16dd9`

仓外曾对用户提供的工作簿做过只读结构核对；本候选不复制工作簿正文、图片、行数据、内部链接、员工资料或凭据。六个工作表名称来自已确认的首期结构决定。

## 产品仓已有合成覆盖

产品测试使用完全合成的六工作表 XLSX，并覆盖：

| 场景 | 结果 |
| --- | --- |
| 六工作表全部纳入，按行拼接文字并保留列顺序 | 通过 |
| 同一行两张内嵌图片均生成附件引用 | 通过 |
| 显式 `版本` 字段进入候选版本 | 通过 |
| 图片所在行没有文字 | 拒绝，`IMAGE_WITHOUT_TEXT` |
| 多出未登记工作表 | 拒绝，`UNKNOWN_SHEET` |
| 外部超链接仅保留标签、不跟随访问 | 通过 |

产品仓定向命令 `pnpm --filter @customer-agent/content-intake test` 已通过；测试日志及完整产品检查由产品仓维护。本治理仓没有重跑产品仓测试，也没有把该结果写成治理 release 通过。

## 待治理与待产品条件

1. 评审并批准本候选的格式与失败语义。
2. 另行设计并批准 HTTP、存储、附件对象生命周期、来源绑定及发布／回退的机器增量；不得直接修改冻结的 1.22/1.24 或旧 `ops-loop` 字节。
   本轮已形成仍为 DRAFT 的 [`openapi.delta.json`](openapi.delta.json)、[`storage.delta.sql`](storage.delta.sql) 和 [`boundary-verification.md`](boundary-verification.md)。它们只描述候选边界：复用既有上传/候选/发布/回退/operationId 路径，新增 SOP 图片对象与发布快照引用，并要求当前资格保护的媒体预览；没有正式版本号、迁移号或应用授权。
3. 由生成器产生版本化 OpenAPI／schema／installation，并分别完成冻结、export 和产品 intake 回执。
4. 产品 runner 以固定 `sop-xlsx-v1` 选择解析器，校验子进程输出，覆盖取消、超时、重复导入、未知提交和容量回收。
5. 用合成身份完成上传→检查→确认发布→另一客服查询复制；真实 Feishu、真实资料、生产账号和 Windows 验收仍关闭。

在上述条件完成前，`productionConsumerReady` 必须保持 `false`，本候选不得进入生产配置。
