# CSV DRAFT 验证

> 本文件保留治理候选 `5335107` 冻结前的验证时点；当前精确批准、冻结与后续导出回执见[冻结验证](freeze-verification.md)。

状态：DRAFT · NOT FROZEN · NOT EXPORTED · NOT INTAKE。实际验证和输入摘要写入同目录 checks.json。当前只验证格式合同，不证明生产账号、真实资料、Main/HTTP/worker CSV 接入或安装包 CSV 闭环已完成。

2026-10-08：Node 定向合同与合成导出 **7/7**、一次性 Unix socket PostgreSQL 15.18 存储检查 35/35 已通过；原始旧 XLSX 对象、作业和候选兼容，新 CSV 的来源／MIME／版本／mapping／结构及 material 绑定得到验证。PostgreSQL 使用合成元信息，不继承数据库 URL；临时 cluster 在 finally 清理。检查使用数据库 owner 验证 DDL 守卫，不充当用途 LOGIN、HTTP 或真实数据证据。

OpenAPI lint 为 0 error、23 条继承 warning。所有生成物由 CSV 专属生成器产生，前序 1.21 / 1.23 两个冻结文件未修改，旧 profile、批准记录和导出物未改；exporter 新增只由 CSV profile 选中的分支。CSV 的预备 profile 分支与 v3 完整安装清单已实现，但当前 profile 未切换；未来冻结／export 必须有独立批准，不可拿旧 runtime installation 的哈希宣称已覆盖 1.24。

完整 `npm --prefix sites run test:release` **44/44 步 exit 0，最终退出 0**；机器合同、实际临时 Git v3 导出与回读均在其中通过，依赖 audit 为 0 vulnerabilities。最终输入 17 项在运行前后逐一核对 SHA-256，无变化。最终状态和日志摘要在 checks.json 单列。旧历史 release 证据保留。本轮没有外部模型审核，完整 `/review` 仍为 INCOMPLETE。

第一次 release 在早期被主动中断（exit 130），用于补齐本机自查发现的 material.object.sourceId 一致性和新增导出准备；日志单独保留，不作为最终通过证据。

随后第一次完整尝试在 `test` 阶段失败：新 CSV PG 命令已有独立脚本，但 `release-test-wiring.test.mjs` 的显式 PG 路由清单漏登记。补齐同类三行路由断言后定向 4/4 PASS，独立审查复核无问题，再执行上述最终完整 release。失败日志以 `release-before-pg-route-fix.log` 保留，不冒充最终通过。

环境：Mac arm64、Node v24.19.0、npm 11.17.0、PostgreSQL 15.18；没有安装或更新依赖。普通 DRAFT 导出拒绝；完整 v3 包只在临时合成 Git 仓中造测试批准、导出、回读及篡改／漏件验证，结束后清理。正式 profile 仍为 `content-intake-runtime-v1`。

| 待批准候选 | SHA-256 |
| --- | --- |
| OpenAPI 1.22.0 | `3f741eb980aba1cd9a2a273b25771b50299e1aef3acbc6a1579b57541ed43a94` |
| schema.v1.24 | `c4ceffa961728423b755b00d551b9ab67fbf33ffe1dd87d8e671f6d151f744c5` |
| CSV protocol | `ff83a005795f6a5bdd6597329d93c5fdc132267613886b701193bdf8583b62ca` |
| CSV storage delta | `f88db715af84ff0a4dc056ab3a37fdaf71cdd0ae439a78b2d565952a1b93b535` |
| CSV installation | `e7bee22391c96c498d96e20e868cbf90429405ac3793eeb02bbc93e817939a28` |

最终 release 日志 SHA-256：`fd012facde0fe10890a7a708e1bc7abc93e72fa5c3f3c80901afc8eb907932e8`。最终代码由独立本机 reviewer 复核，无待修问题；这不是外部 `/review` 通过。产品接收工具的临时 ingest→verify 由产品仓单独留证，不用本仓自校验代替产品消费。
