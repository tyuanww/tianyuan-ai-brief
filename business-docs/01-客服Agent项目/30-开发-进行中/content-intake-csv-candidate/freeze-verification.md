# CSV 输入合同冻结验证

用户已精确批准治理候选 `5335107563510f54f656237b3d11bc375d179edb` 的五项摘要，见[批准记录](../../90-评审/2026-10-08_P2CSV输入合同批准.md)。本次只改变规范状态、显式 profile、导航文档和生命周期测试断言；五项机器文件、全部 SQL、生成器与 exporter 原字节不变。CSV DRAFT 元数据作为批准原字节保留。

冻结前完整 release 44 步和隔离 PG15 35 项证据保留在 checks.json。本次按 AGENTS 证据复用规则逐项核对原 17 件输入：12 件未变，包括五项批准机器工件、生成器、exporter、PG 测试、依赖和 release 路由；5 件为规范／导航及生命周期测试变化。另新增批准记录，切换 profile，并更新前序目录测试的当前 profile 断言。CSV 合同／导出 7/7、前序目录／runtime 导出 7/7、生成一致性、精确批准门和 docs:fast 均通过；输入／日志摘要写入 freeze-checks.json。没有把复用写成重新运行完整 release 或 PG。

冻结规范中的 NOT EXPORTED／NOT INTAKE 描述冻结源提交时状态；实际不可变包和产品接收将分别绑定来源提交与回执，不修改机器字节推进状态。本记录不证明 CSV HTTP／Main／worker 或安装包闭环已完成，产品仓拥有对应实施与消费结果。完整外部 `/review` 保持 INCOMPLETE。没有真实数据、凭据、生产 ACL、push、PR 或部署。


## 实际导出回执

冻结来源提交 `adbc7b1ce251816fc02957a0042742ae2d053f9a` 已由实际 CLI 成功导出不可变包 `cs-ai-c11-openapi-1.22.0-schema-1.24-adbc7b1ce251`，并在同次命令内按精确来源提交逐件验证，exit 0。十四件文件包含十一件 runtime 伴随物；目录为 0555，文件均为 0444。manifest SHA-256 为 `0bb26dccad0c3007435cff0666a5033f4ee439504c70fe47eead66f8e9a6d977`，详见[导出回执](export-receipt.json)。

freeze-checks.json 绑定冻结源提交 `adbc7b1` 时的输入；本回执在导出后追加，不倒算进原验证输入。当前只确认治理导出；产品实际 intake 和 CSV 合成消费由产品仓独立留证，不能把导出成功当运行激活。机器五项批准字节保持不变。
