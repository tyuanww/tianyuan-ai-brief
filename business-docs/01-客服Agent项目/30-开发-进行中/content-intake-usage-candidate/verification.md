# 使用资格上下文候选：合成验证与审查

2026-10-06；DRAFT / SYNTHETIC DEVELOPMENT ONLY。基线为治理仓 `d029cb0908faf9a0d1c1ffc1c8a5fcf39784d713`，本轮差异包含合同候选及交付门所需安全维护。用户持续授权本地实现、审核、修复与 commit；本记录不批准新合同冻结、不可变 export、产品 intake、三方公开交付或真实运行。

## 精确合同产物

| 产物 | 字节数 | SHA-256 |
| --- | ---: | --- |
| `openapi.v1.17.yaml` | 385070 | `3e0a3f122aefa0bff9c330e105f1a5cbb2b26662fd5f04db1ef3a93ac1bc1121` |
| `schema.v1.21.sql` | 630129 | `5f958e4f7dcde7e11f9a6d38d8339b96654517209a493776acbfc7c3f5202013` |

版本语义由[候选规范](../14-P2使用资格上下文合同候选.md)拥有。生成器确定性重建实际机器文件；测试固定前序 1.16 / schema1.20 双哈希并验证其原字节保持不变。export profile 仍是 `content-intake-v2`，产品消费锁不变。

## 实际运行

环境：macOS arm64、Node 24.19.0、PostgreSQL 15.18，现有 npm 11 与 Chromium。全部输入为合成 fixture；PG 执行器清除继承连接变量，仅启动自有 Unix socket 临时实例，完成后停止并清理。未触碰真实数据库。

| 命令（仓库根目录，Node 24） | 结果与证明边界 |
| --- | --- |
| `npm --prefix sites run test:intake-usage-contract` | 8/8 PASS；实际生成 schema 全部编译；选择必填/非法身份/重复/超限拒绝；101 个合法拆分与超限边界；SQL/PLpgSQL 解析 |
| `npm --prefix sites run test:intake-usage-contract:pg`（可指定 `PG_BIN`） | 92/92 PASS，前序 69 + 新增 23；上下文不可变、延期约束、用户/会话/期限绑定、注销/删除后不可读及六角色权限封闭。父 release 只是回滚事务内 FK fixture，不冒充发布端到端 |
| `node --test sites/tests/security-maintenance-archive.test.mjs` | 5/5 PASS；归档确定性重建、前序快照保护、实际 vendor 消费修复版本，KaTeX 不接受继承的 trust |
| `npm --prefix sites run test:release` | 修后 29/29 步骤 exit 0；249 项单元测试、15 项原 intake wire/export、浏览器/边界/业务/机器合同、架构图与依赖审计均通过。单元总数已含新增 schema/安全维护测试，不重复相加 |
| `git diff --check` | PASS；最终文档追加后补执行 `test:docs:fast` 与新引用核对，不重跑未变实现 |

完整 release 包含实际 HTTP/file 页面消费、重建后的 Mermaid 渲染、慢加载与立即打印。OpenAPI lint 有 19 条继承警告，旧 1.16 也是 19 条；均无 lint error，未借新候选改写冻结旧合同。

开发过程保留：首轮 strict AJV 暴露条件数组缺少显式 type，已在生成器修复；首轮 PG 合成会话误从 consumed 登录创建，修正为 ready → session → consumed，未放宽生产守卫。首轮 release 的 28 步通过，末尾 audit 发现既有依赖 3 条告警（2 low、1 high），不能记为完整通过。

依赖维护仅更新 KaTeX `0.16.47 → 0.18.2`、source-map-js `1.2.1 → 1.2.2`；[KaTeX 上游告警](https://github.com/advisories/GHSA-238p-pmpm-9mq7)、[source-map-js 上游告警](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)。Mermaid 上游预打包不会读取新 lockfile，因此生成器改为从 ESM 依赖图重建，并验证修复后的 KaTeX 实际进入 vendor、SRI 配对。新的 `2026-10-06` 安全快照 release 为 `shell-v3-f09552df234c`，30 文件中 24 与前次逐字节相同；旧 07-31、08-09、10-05 目录/manifest 均未改。两处 UI 慢加载拦截改为读取当前 vendor 名称并断言实际命中，避免版本升级后测试空跑。修后 audit 为 0 漏洞；未部署。

## 审查与证据复用

- OCR delegate：workspace 模式，`total_files=49`，`reviewable_files=29`，`reviewed_files=29`，`skipped_files=0`，`coverage_rate=100%`。另 20 个默认排除项逐一补核：Markdown、锁文件、二进制及 vendor；保留原排除原因。
- 生成合同审查依据是生成源、实际增量与确定性重建，前序冻结内容按哈希复用；归档 24 个未变副本复用前次内容审查，其余 6 个变化核对生成器、字节、SRI、实际浏览器消费。不是仅查看文件名或 exit 0。
- `/review` 完成核心清单、本机独立对抗及功能冒烟；最终无未修确认缺陷，零代码修改复审收敛。独立对抗只读取测试/fixture 的统计、覆盖说明和执行摘要，宿主 OCR 阅读了测试源；没有把缩减覆盖记成完整载荷审查。
- 本次功能冒烟 3 次 capture：实际 schema 8 项、隔离 PG 92 项、安全维护 5 项全部通过；有前置假设 checkpoint 和 materialized evidence。报告追加只记录结果；实现、测试与生成输入未变，复用其有效证据。
- 外部 Claude 先前多次 540000ms 超时为 missing coverage。本轮没有重启外部调用，记录仍为 unavailable / completed:false；本机通过不补写外部通过。

原始日志、逐文件 OCR 清单、规则、输入哈希、对抗报告和 QA checkpoint 位于 ignored `output/content-intake-usage-review/`；PG 安装/计划/摘要位于 `output/content-intake-usage-contract/`。400/4000 存量查询计划属于前序候选列表，不是新上下文查询的性能结论。

## 尚未验证与下一步

本候选不实现 API/认证/Main/renderer 接线，未做新合同产品迁移、签发与注销并发、网络恢复、Mac/Windows 原生桌面或真实飞书验收。上一切片 Mac/WSL 的 85 项后端证据仍只绑定当时产品提交，不能作为本候选接入证据。

下一步：针对上表精确版本对批准并冻结 → 扩展既有导出/批准门并生成不可变合同集 → 产品 versioned intake（保留现有 24 段 migration checksum）→ 实现持久上下文、认证私有会话引用和 Main 当前店/选择 → 两会话及 Mac/Windows 原生验收。真实数据、应用 ACL、v2-active 和发布继续受各自批准约束。
