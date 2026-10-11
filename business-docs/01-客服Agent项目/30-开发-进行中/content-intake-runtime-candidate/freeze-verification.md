# 运行接入合同冻结验证

用户已精确批准治理候选6a253047的 OpenAPI1.21、schema1.23 和 installation，见[批准记录](../../90-评审/2026-10-08_P2运行接入合同批准.md)。本次只改变规范状态、显式profile、相关文档及生命周期测试断言；机器DRAFT元数据和全部SQL/生成器/exporter字节保持不变。

冻结前41步release和PG253的源记录保留在checks.json。本次逐项比较其25件输入，20件未变（包括机器合同、SQL、工具与PG测试）；3份状态文档和2份生命周期测试发生变化，另新增批准记录并切换profile。按AGENTS证据复用规则复用未受影响门禁，补跑合同/export7项、生成一致性、精确批准门与docs:fast，均通过；没有声称重新执行完整release或PG。精确输入与日志见freeze-checks.json。

冻结规范中的NOT EXPORTED/NOT INTAKE描述本次冻结源提交时状态；实际不可变包与产品接收将各有来源提交和回执，不通过改写机器字节推进阶段。完整/review仍INCOMPLETE；没有真实数据、凭据、环境LOGIN、生产ACL、push、PR或部署。

## 实际导出回执

冻结来源提交 `e35c0c01b5510ffcff75f2b19ba441ad53a9b504` 已通过实际 CLI 导出完整不可变包 `cs-ai-c11-openapi-1.21.0-schema-1.23-e35c0c01b551`，导出器随后按来源Git提交校验全部工件，exit=0。十二个文件及目录均只读，九件runtime工件完整；manifest SHA-256为 `a15e0193a8e577e9f1c4a1c52b5b7cba7a11674e3cd157c1eb135fa5e4f2aa1a`。详见[导出回执](export-receipt.json)。freeze-checks.json绑定冻结源提交时输入，不将后写的本回执倒算入旧检查。

此处只确认治理导出；产品intake及合成消费由产品仓拥有，导出时尚未确认。原 NOT EXPORTED/NOT INTAKE 是冻结源提交的时点状态，当前导出状态以回执为准。没有运行激活。
