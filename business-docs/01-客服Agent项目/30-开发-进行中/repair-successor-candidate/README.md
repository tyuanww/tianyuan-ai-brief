# 发布兼容与 SOP 行修订后继组合候选

状态：**DRAFT · NOT FROZEN · NOT EXPORTED · NOT INTAKE**。本目录将两个已有候选及可信解析入口组合为完整、可复核的后继产物，不改前序冻结字节。OpenAPI `1.24.0`、schema `1.28`、迁移 `0040`、profile `content-intake-repair-successor-v1` 都只是待确认的建议；没有正式分配、schema 版本记账或产品迁移，没有消费锁更新。`productionConsumerReady=false`、`runtimeActivated=false`。

维护源：[组合生成器](../../../08-工具/build_customer_agent_repair_successor_candidate.mjs)、既有 [发布兼容候选](../publication-compatibility-candidate/README.md)、[SOP 单行删除候选](../sop-row-deletion-candidate/README.md)。`predecessor-lock.json` 是本次安装验收输入锁，来自产品 `292221d` 的 39 条迁移 manifest；不代替治理批准或运行合同。新生成器不在运行时读取产品仓。

## 本次交付

| 文件 | 用途 |
| --- | --- |
| `openapi.candidate.json` | 完整 OpenAPI；在冻结 1.23 的解析结果上应用带前置断言的发布角色/指标修订，并增加 SOP 行修订 POST；所有本地 `$ref` 已实际解析 |
| `schema.candidate.sql` | 完整前序 schema 1.26 精确字节 + schema 1.27 精确 overlay 字节 + 后继修订；1.27 实际是 overlay，不能因为旧文件头写“follows unchanged”而当成完整累计 schema |
| `upgrade.candidate.sql` | 已安装精确 0001–0039 的隔离测试库上使用；先验证全部迁移回执和 NOLOGIN owner，再保留 content → legacy publish 锁序，组合原发布候选与删除候选字节 |
| `installation.candidate.json` | 事务顺序、39 段前序、依赖、窄 ACL 差集和产品接线条件 |
| `manifest.json` | 所有读取输入与交付物 SHA-256、大小、原候选精确复用摘要和关闭的批准门 |

**`schema.candidate.sql` 是累计参考，不是空库 bootstrap 脚本。** 前序运行 companion SQL、角色与既有 migration 装配必须先经现有流程安装；本轮实际 PG 验收执行 39 条产品迁移后只执行 upgrade。不能把本文件直接复制为产品迁移，也没有执行正式 export。组合脚本只允许已有前序；错哈希、少回执、额外迁移或异常函数正文全部拒绝。升级回执应由未来已 intake 的迁移 runner 在同一事务记账，本候选不伪造第 40 行。

## 保持的行为与 ACL

- 旧 SQL publisher 恢复 owner 承接、tenant、完整性检查，保留既有 coach 在产品/活动范围的 SQL 能力与敏感内容限制；旧 HTTP 仍 owner-only，没有启用 coach HTTP。
- `MetricsStreamItem.push_method` 直接引用已可空的 `PushMethod`，解决 null 同时匹配两个 oneOf 分支的错误；合法枚举不变。
- SOP 新命令要求 operationId/key/rowId，未知字段拒绝；路径与 key 必须一致。行映射来自完整解析结果，不能从图片顺序猜。删除未使用行生成新候选版本，质量与来源重新检查，旧正文/摘要保留；最后一行取消候选。当前/历史发布、已使用媒体仍拒绝。
- `intake_business` 新增可信冻结、继承读取、行修订以及媒体预约／完成登记／开始释放／完成释放七项窄 EXECUTE；`intake_usage` 新增 `read_sop_release_assets` 一项只读 EXECUTE。精确签名与 NOLOGIN owner 的表／列权限以 `installation.candidate.json` 为准；新表不直接授权登录角色，旧 media-only DELETE、行登记和细粒度媒体 stage helper 不对 business 开放。publisher 原属主、ACL、SECURITY DEFINER、search_path 保持不变。
- 提交未知沿既有永久回执恢复；客户端保留 operationId/预览，完整候选返回后才更新匹配版本的投影。旧回执不能覆盖新导入或已发布预览。

`product-pack-19:49` 的 `NonAdoptedEventRequest` 允许 `dismissed + clipboard` 是**另一条尚需合同决定的主张**。本候选只修指标响应的可空语义，未声称解决非 adopted 事件允许值；没有擅自收紧 failed/pending 等字段，也没有证据宣称已经发生 HTTP 指标误算。

## 当前验证与复用界限

生成与机器检查命令（仓库根目录、Node 24）：

```sh
node business-docs/08-工具/build_customer_agent_repair_successor_candidate.mjs --write
node business-docs/08-工具/build_customer_agent_repair_successor_candidate.mjs --check
node --test sites/tests/repair-successor-candidate.test.mjs
npm --prefix sites run test:machine-contracts
npm --prefix sites run test:docs:fast
```

新增静态测试 5/5：产物/输入摘要和前序片段精确一致、所有本地引用闭包、nullable 正反例、窄 ACL、旧 DELETE 不变，以及同一路径只读一次并隔离读取器的可变 Buffer；修前新增回归实际失败，修后通过，生成物字节不变。新增 PG15 5/5（1 个父测试与 4 个子测试）：39 段前序安装、组合安装安全属性、表/helper 权限闭包、回执漂移拒绝、先替换 publisher 后碰撞失败整笔回滚、非超级用户业务角色缺资格拒绝、重复安装拒绝，以及结束删除自有临时库。没有第 40 行正式记账。

可复现 PG 命令：

```sh
CUSTOMER_AGENT_REPAIR_PG15=1 \
CUSTOMER_AGENT_SYNTHETIC_PRODUCT_TESTKIT=/absolute/path/to/existing/product-worktree \
npm --prefix sites run test:repair-successor:pg15
```

该参数只加载已有合成数据库 testkit，**不是数据库 URL，也不是跨仓运行依赖**；执行前必须匹配本目录锁中的 manifest 与 39 文件摘要。独立脚本未纳入默认 release；不传 `CUSTOMER_AGENT_REPAIR_PG15=1` 时只报告 1 项 skipped，不能记成 PG 通过。只用临时 PG15、合成缺失主体与资料标识，未读真实数据或凭据。本轮增加可信冻结／继承入口并收紧行登记 ACL；旧发布函数字节保持，可按精确输入复用发布 32 PG / 13 HTTP。行删除原函数未改，但 setup/ACL 已变，旧结果只能复用其删除语义，新增 producer/权限与完整安装必须重新验收。完整 `/review`、`externalCompleteReview` 继续 INCOMPLETE。

## 正式交接仍需满足的条件

1. 确认 `manifest.json` 建议的版本/迁移/profile，并审核其 SHA-256 对象；这些哈希是待批准对象，不是已经签发的冻结。输入再改动，相关检查与批准对象必须重算。
2. 冻结之前核对最终安装/ACL 闭包、运行治理 release 门，并以明确批准记录锁定完整 OpenAPI、累计参考 schema、升级增量、安装说明及前序锁。不能把旧发布门日志当作本轮生成物通过。
3. 新候选已提供同事务 `freeze_sop_parsed_candidate` 和有权 `read_sop_inherited_assets`：固定 job/来源/对象/基线/先前版本，完整行与图片登记，通过 `freshRowIds` 显式区分本次解析与继承，继承行缺映射失败关闭；只有属主内部能调用细粒度行/媒体 helper。产品实验消费者必须使用真实非超级用户验证此入口，正式 producer 仍待版本化 intake 后接线。已冻结的 `stage_sop_candidate_media` 继续不向应用角色授权。
4. 新 POST 应复用既有事务/永久回执所有者，检查路径/key、服务端主体、当前资格和 version-bound 预览恢复；本轮没有生产 runner/HTTP/Main 接线。明确 producer/阶段 ACL 条件后，按冻结 → 封闭 export profile 与批准 → 导出回执 → 产品 versioned intake 完成交接，再生成新迁移和接线验收。
5. 旧冻结 SQL、0030/0035/0038/0039、当前角色上限与现行锁不变。真实账号、资料、对象存储、生产启用和设备验收仍另受批准管理。

本轮新候选的专项检查与受限角色业务证据另见仓外 `客服Agent-SOP可信登记-20261011`；上段此前 5/5 与历史 release 结果不自动覆盖新函数。最终 release 由主 Agent 在整合后的同一输入上统一运行。

### 新内容版本与不可变删除记录

SOP 信封的 `contentVersion` 采用文件声明版本优先、否则文件 SHA-256；parser 唯一生成。后继候选新增 `sop_row_deletion_events`（不向应用角色授权），禁止同内容版本恢复已删行；允许明确新版本在严格无引用/未使用条件下复用同图片。对象当前状态可以恢复 staged，但原 discarded_at、源版本、行和对象元数据已在不可变事件中保留。此方案不改现有对象状态 CHECK、不改变稳定 media ID，不允许凭新 operationId 当作新内容版本。未知旧 tombstone 继续失败关闭；同图跨行关系键已在当前候选中包含 row_id，并经历史升级、共享图片和发布／回退验证。候选验证不替代正式冻结与接收。


### 2026-10-11 持久图片候选补验与交接边界

当前组合由生成器产生：OpenAPI 1.24.0、schema 1.28、0040 和 export profile 仍为建议值。现有 manifest 列出的 OpenAPI／累计参考 schema／升级 SQL／installation 哈希是待审核对象，全部批准标志保持 false。未新增正式迁移，也没有 export 回执。

固定 input-v3 的产品合成 PG/HTTP 组合65项通过、18项因缺专用开关跳过；随后行删除18/18独立通过。治理静态6项、完整安装PG5项、带历史数据升级PG7项通过。覆盖持久文件、同图跨行、旧发布器继承及缺映射整单回滚、直接发布／回退冷读取、读取中到期、用途MIME／大小约束、旧stage真实执行。500关系使用共享小型合成PNG；不声称最大附件全集或RSS验收。用途CHECK专项有隔离触发器的白盒部分，不能用它代替完整输入路径；两种测试分开记录。

此前合法继承触发5秒SQL超时，已在候选源内改成按唯一先前版本展开JSON，保留完整entry及来源／版本／行绑定的相等检查，没有抬高超时。旧失败与v3复验均保留。机器与文档检查的旧输入结果按哈希复用，发生变化的SQL／生成物以定向安装和升级结果绑定；本次完整治理release复验于2026-10-11 14:20:49 UTC退出0，47步骤均exit0，36个受测输入摘要重新核验无失配；原始日志及回执为仓外 `客服Agent-SOP图片闭环-20261011/review-v1/governance-release-v2.*`，日志SHA-256为 `b9281956c06c37daa5e6d58b80e296e9ef14275c366e4601b31ade4276d276b3`。这是验证门通过，不构成正式版本批准、冻结或发布。

本机及原生对抗已回收；本次三个外审小包均在540秒后超时无结论，当前图片增量审查尚未完成。此前完整审查的 COMPLETE_WITH_FINDINGS 只覆盖旧固定输入，历史段落中 INCOMPLETE 保留当时含义。下一步是取得有限增量外审结论，完成当前必需审查门禁，再对精确候选办理版本批准、release、冻结、导出和产品接收；生产runner／HTTP／Main及真实数据不由这些合成证据自动开启。
