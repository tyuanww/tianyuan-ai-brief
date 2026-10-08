# 运行接入候选验证

本轮只交付 OpenAPI1.21/schema1.23 的组合 DRAFT 与显式 v2 导出工具支持。实际 profile 保持 direct，未冻结、未导出、未 intake。精确源、命令、原始日志指纹和 41 步退出码在 [checks.json](checks.json)。旧目录 lifecycle/recovery 证据完整保留，不能把旧 PASS 当作新组合门禁。

## 实际结果

- 一次性 PG15 参考 core 与 A/C 协议 253 项 PASS：真实 LOGIN NOINHERIT→单一 NOLOGIN capability，跨用途/属主/高权/REPLICATION 拒绝，组织绑定 CAS 与历史不可变、缺 provenance/RESET ROLE 提交绕过拒绝，目录授权、分页、维护人与 key 生命周期沿原矩阵回归。最终 core、DDL 与 PG 输入没有变化，复用这次实库结果；之后出口测试/文档变更不重跑无关数据库矩阵。
- 新运行合同/出口 7 项 PASS，旧 direct 合同 7 项 PASS。临时合成 Git 仓实测 DRAFT、缺批准、错批准哈希、缺件、错字节、overlay 漂移拒绝；重算外层哈希后缺必需工件、反序安装和错依赖仍拒绝。已批准的合成精确包包含 12 个文件，原机器 DRAFT 字节不改写。
- 产品工具实际消费同一临时包：v2 verify→临时产品根 ingest→受锁 snapshot 读取全部 9 件 runtime 工件，状态 VERIFIED_NOT_ACTIVATED，真实产品 lock 未变。结果由主 Agent 执行，原始报告已复制并索引；不是本仓真实批准或正式 intake。
- 最终源码稳定后完整 test:release 单次 41/41 PASS，shell 记录实际 exit=0；源码输入在运行前后逐一比对相同。最终只新增验证报告，不修改合同、工具或测试输入。

B 产品线在相同 SQL 哈希上验证用途池、真实 HTTP/Main 与 Mac Electron 四库闭环，以及取消记录只能 pending→cancelled、不能冒充发布/回退结果。完整产品安装/运行证据由主 Agent 在产品交接回收，治理参考 DDL 的成功不代替该证据。

## 工程评审及边界

窄范围 plan-eng-review 的 core＋伴随 ACL、单一组合版本、NOLOGIN 能力三个边界已明确，详见 [工程评审](engineering-review.md)。本轮仅一次外部挑战在 180 秒超时，无结论；完整 /review 保持 INCOMPLETE，不因本地检查通过改变。

真实人员、店铺显示名、业务授权、私有 key 保管与环境 LOGIN 配置仍是实际运行输入，不能由合成夹具代替。精确新字节批准后，才可按既有治理流程切换显式 profile、冻结/导出，并由产品版本化 intake；本轮没有执行这些动作，也没有修改已冻结1.20/1.22、业务岗位上限或产品代码。
