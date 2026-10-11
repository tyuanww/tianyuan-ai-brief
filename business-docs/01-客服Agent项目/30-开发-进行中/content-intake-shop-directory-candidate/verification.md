# 店铺目录候选验证

## 2026-10-08 维护人、私有 key 与可信消费者补齐

本轮仍为 DRAFT，未冻结、未 export、未 intake。维护人登记／撤销／轮换已具备实际 CAS、期限、审计与同操作 ID 重放；操作人和目标维护人均须当前唯一 director/manager，再叠加显式 tenant/app 登记，不由岗位自动授权。名称管理不写业务 grant。真实维护人名单只阻塞真实运行，不是合成协议审阅／冻结的技术前置。

签名 key 已有独立受限注入、版本轮换、有效期、撤销清空与不可变元数据审计；新 keyId 即使重用合成材料也拒绝旧游标。只有合成 key，未创建真实 secret。合成消费者在同一事务遵守全局内容锁→真实会话／事实→目录操作→最终截止→COMMIT，只在成功提交后返回，未知管理提交使用原操作 ID 恢复。实际非 owner LOGIN 覆盖 read/write/manage 与独立 key 操作；未给既有产品账号开权限。

最终 PG15 **208/208**、Node 合同 **5/5**、完整 `npm --prefix sites run test:release` **41 步全部 exit 0，最终 EXIT:0**。本轮最终源／合同／测试／依赖输入在完整 release 运行期间保持不变，结束后逐项比较 SHA-256，未沿用旧运行覆盖改动。冻结 OpenAPI 1.20.0 / schema.v1.22 原字节不变。OpenAPI lint 仍有 23 条既有 warning，没有 error。

覆盖真实会话撤销／到期、全局锁等待后重查、维护人换岗失效、最终岗位与截止守卫回滚、缺名不返回部分页且保留 SHOP_DISPLAY_MISSING、普通角色不能取 key／越过函数／SET ROLE、同材料版本轮换、key 写入跨截止回滚、未知管理提交恢复和时区无关重放。故障注入仅发生在一次性合成 PG，不是生产性能或真实飞书证据。

最终结果及输入／日志哈希见 [lifecycle-checks.json](lifecycle-checks.json)，日志目录是 gitignore 的 `output/content-intake-shop-directory-contract/lifecycle/`。较早完整 release 已通过，但随后发现消费者漏映射 SHOP_DISPLAY_MISSING；该修复前日志与输入独立保留为 `before-missing-reason-*`，不当作最终消费者证据。历史 recovery 证据保持原内容。

尚待正式决定的是采用该候选协议、与用途 ACL 的版本仲裁及冻结／export／intake；真实名单、正式名称、secret 保管注入／日志和运行账号另属真实运行条件。当前没有生产／产品消费者接入，完整外部 `/review` 保持 **INCOMPLETE**，没有新一轮外部审核。

## 2026-10-08 提交 70dab62 的历史回收修复证据

回收实际 PG 复现旧游标暴露会话哈希、两字段联动篡改、延长过期截止、无效名称和停用维护人更名。原复现为 `/tmp/recover-c-probe.log`，冻结旧字节未改。新候选改用独立服务端私有 HMAC key，仅合成 fixture；读写在锁后检查真实时钟和当前身份事实，SQL/JSONSchema 名称规则一致，合法 Unicode 最大页提高为 128 KiB。

定向 Node 合同测试 3/3、PG15 实际检查 140/140 已通过。PG 新增锁等待到期、已知会话哈希无法重签、篡改页界/截止/limit/会话拒绝、授权续期不延长原游标、身份/事实停用拒绝、SET GUC 不能绕过应用 ACL。完整 release 实际退出 0，41 步均退出 0。执行中追加了最终 RETURN 时钟门与 PG 故障注入；因此这是组合证据，不声称单次不可变最终输入全量验证。最终字节另行通过 PG140、合同3、生成一致性与 OpenAPI lint（23 条既有 warning），未受影响步骤复用。HMAC 延迟仅在一次性 PG 内故障注入，用于证明计算跨截止时拒绝，不代表生产性能。

维护人登记、撤销与轮换规则，以及正式签名 key 持有/注入/轮换，仍是冻结前条件；本次未批准任何真人名单或生产配置。

实际命令与输入、日志 SHA-256 见 [recovery-checks.json](recovery-checks.json)。日志目录仍为 gitignore 的 `output/content-intake-shop-directory-contract/`，本轮日志均使用 `recovery-` 前缀；原 release 日志及原 PG 安装/结果按原哈希保留。完整外部 `/review` 仍为 **INCOMPLETE**，本次没有调用外部审核。

## 原提交 7e4a3bd 的历史证据（不得用于修复后候选）

> 状态：DRAFT 合成验证。不是合同批准，不能接真实租户或真实店铺名称。

环境：Node `v24.19.0`（`$HOME/homebrew/opt/node@24/bin`），PostgreSQL `15.18`（`PG_BIN=$HOME/homebrew/opt/postgresql@15/bin`）。治理仓脚本使用 npm。锁文件未改。一次性数据库只走本机 Unix socket、trust、端口 `55444`，跑完即删。

| 命令 | 结果 |
| --- | --- |
| `node business-docs/08-工具/build_customer_agent_backend_contract.mjs --check-intake-shop-directory` | exit 0。OpenAPI `208cb229e7f8e05b20b924a375309225a4c4ecb0f9536db0a47d0b52ad7cfbda`，654517 字节的 schema 为 `fe8714646ac2a8a0fe3ea495c80e0edcdd8491515163e303e28fc1fd0dfe8d64` |
| `node business-docs/08-工具/build_customer_agent_backend_contract.mjs --check-intake-direct` | exit 0。冻结 OpenAPI `1513fe499773c83f4a2b9f0ca8e3a5f7369638f72dc1d18a291235093cfc034d`，schema.v1.22 `c5e4896e8ed1ff587e23a70723bd9d81c056ba65561cd9d94963aa6b5f1ae3ce` |
| `npm --prefix sites run test:intake-shop-directory-contract` | 3 pass / 0 fail |
| `npm --prefix sites run lint:intake-shop-directory-openapi` | exit 0，23 条既有 warning，没有新的 error |
| `PG_BIN=$HOME/homebrew/opt/postgresql@15/bin node sites/tests/content-intake-shop-directory-contract.pg.mjs` | `{"status":"PASS","checks":121}` |

PG 日志留在 gitignore 的 `output/content-intake-shop-directory-contract/`：

- `install.log` SHA-256 `5ebca18df99fd30624a86f652a379a376fdbbcea95f06300305d0c497d8b6350`
- `pg-summary.json` SHA-256 `576af760b27f76bb96a6477f9350ac11aa9b8b4a96ddfbb3fce210fd5d9a0165`

`npm --prefix sites run test:release` 的质量步骤全部记录为 `exit=0`，最后一步是 `audit:deps: 0.99s, exit=0`，`found 0 vulnerabilities`。其中店铺目录三步为 `test:intake-shop-directory-contract: 0.64s`、`check:intake-shop-directory-contract: 0.17s`、`lint:intake-shop-directory-openapi: 0.80s`。PG 脚本不在 release 内。日志 `test-release.log` 202151 字节，SHA-256 `f8a9ad4119a48cc42031ac5c9c594ae71adac0859738f1e68e3876108700a234`。收尾壳子随后因 zsh 的只读变量 `status` 赋值失败，没有写入 `EXIT:` 行；质量计划本身没有失败步骤。

第一次 release 在 `test` 的归档检查失败：当时 `sites/node_modules` 是指向集成工作区的符号链接，esbuild 把 KaTeX 解析到工作区外，触发「必须消费当前锁定的 KaTeX」。该日志 SHA-256 `99dfc852eb2a30d41f2e4d849b601c7a79bf2d79c8df1a78c3bb9475bbd626a8`。随后用 `cp -cR` 把未改锁的集成安装克隆到本工作区再重跑。克隆目录被 gitignore，不进入提交。

相对冻结对的新增字节：OpenAPI `419565 - 415022 = 4543`，schema `654517 - 636987 = 17530`。schema.v1.23 内含 schema.v1.22 原字节。未跑产品仓 `workspace:check`，也未改它的 32MiB 阈值。
