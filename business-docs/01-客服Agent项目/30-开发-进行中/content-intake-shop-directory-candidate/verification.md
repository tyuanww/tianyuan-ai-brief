# 店铺目录候选验证

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
