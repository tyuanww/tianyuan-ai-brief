# 确认直发候选验证

> DRAFT 候选验证；不构成冻结、导出、产品接入或生产批准。完整版本对以[候选规范](../17-P2权限配置与确认直发合同候选.md)为准。

2026-10-08，Node 24.19.0、本机 macOS，PostgreSQL 15.18。全部身份与资料为合成 fixture，没有真实 open_id、员工或凭据。

本轮机器字节：OpenAPI 1.20.0 SHA-256 `1513fe499773c83f4a2b9f0ca8e3a5f7369638f72dc1d18a291235093cfc034d`；schema.v1.22 SHA-256 `c5e4896e8ed1ff587e23a70723bd9d81c056ba65561cd9d94963aa6b5f1ae3ce`。文件由 `build_customer_agent_backend_contract.mjs --write-intake-direct` 生成，随后 `--check-intake-direct` 通过。OpenAPI 与 af81473 直发 wire 字节相同。schema 已替换 af81473 的旧字节 `3b7d7e67fcf18b9d00cbb916220b862b4f6b4f1e942d6bf367d66dd20dd60c0f`。旧证据只覆盖旧字节。

`storage.delta.sql` 末尾含 `CREATE OR REPLACE FUNCTION content_intake.authorization_deadline`。角色上限已经进入存储增量，不再只是文字。没有新的 OpenAPI 角色体系，也没有新的分配函数或第二套审批表。

`npm --prefix sites run test:intake-direct-contract` 通过：6 项，0 失败。覆盖 confirmed=true、拒绝审批/身份伪造、policy/approval 形状、保留旧机器字节与非目标 wire、路由/方法白名单。

`PG_BIN` 指向本机 PostgreSQL 15.18 后运行 `npm --prefix sites run test:intake-direct-contract:pg`：126 项检查通过。含在已有旧候选上的 1.21→1.22 增量迁移、直发不带审批存储、旧审批门保留、跨政策关联拒绝、确认记录不可变、回退确认与新表 ACL 仍封闭。追加的合成主体断言为：director、manager、supervisor、lead 在有效 business grant 上 `authorization_deadline` 非空；agent 与 enabler 对 query 非空，对 publish/import 为空，历史 business grant 仍在；旧 approval-v1 行未被改写；direct-v1 票据的审核人字段为空。运行日志在仓外忽略目录 `output/content-intake-direct-contract/`。父 release 行仅为外键目标，探针事务在完整发布约束前回滚；不声称通过真实发布/并发/HTTP 运行验收。分配谓词没有对应存储函数，本测试不证明分配资格。

`npm --prefix sites run test:machine-contracts` 通过，退出码 0。其中直发定向测试、生成检查和 OpenAPI lint 通过。lint 有 23 项非阻断警告。OpenAPI 字节未变，这些警告不是本轮新增；不能为消警告恢复伪成功。

`npm --prefix sites run test:docs:fast` 通过，只检查 diff 空白。它不证明业务规则。

完整 `npm --prefix sites run test:release` 本轮没有跑。原因：草稿未冻结，本轮不以含浏览器的完整 release 为冻结门。上一轮 release 日志 SHA-256 `6f6b916d21224434009e43cc8765a7c92604e13f5497de3da2d982170774fec8` 绑定的是旧 schema 字节，SQL 已变，该证据失效。没有为了消除 INCOMPLETE 发起无界外部审查；[review.json](review.json) 的外部覆盖缺口保留。

命令、日志指纹及原输出见 [checks.json](checks.json) 与 [logs.json](logs.json)。输入指纹见 [input-sha256.json](input-sha256.json)，PG 结果见 [pg-summary.json](pg-summary.json)。本记录不构成冻结、export、intake、push、PR、合并或部署。
