# 运行合同组合：窄范围工程评审

目标仅为本轮 A/B/C 的安装、权限及交接边界。复用现有批准与角色审核；不重启 P1/P2、autoplan 或历史角色审查。按 plan-eng-review 的架构、质量、测试、性能四个面复核；本记录不替代完整外部 /review。

## 已有能力与范围

产品 cff9fa9 已拥有组织 observer/writer、actual business/usage/worker service 和合成消费者。治理已拥有目录 CAS、游标、维护人/key 生命周期。复用这些所有者；本次新增的是稳定命名、组合清单、附表不变量、能力安装与来源哈希。没有复制产品发布/回退或授权函数正文，也没有增加生产账号、HTTP、真实数据、店铺认领或新业务功能。

不在范围：环境 LOGIN/凭据实际配置、真实人员/店铺名称、正式冻结/export/intake、部署；这些不能由合成测试代替。主计划/TODO由主 Agent更新，不新增碎片待办。

## Scope Challenge 与边界选择

R1：分 A/B/C 三个连续版本，或一个运行接入候选。选一个 1.21/schema1.23 DRAFT；模块源仍分离，但组合和依赖由一个机器 manifest 拥有，避免部分 ACL 与消费者错配。主 Agent 已明确接受。

R2：全部放进参考 DDL，或核心参考 DDL＋产品 overlay 后安装的伴随 ACL。初次实际 PG 安装前者报 publish_candidate 不存在，证明参考 DDL不拥有运行函数。选择后者，不以复制产品正文、条件跳过函数或空替身伪装安装成功。主 Agent 已明确接受。

R3：能力角色直接 LOGIN，或 NOLOGIN capability＋环境 LOGIN 显式 SET ROLE。选择后者；角色源只记录能力，环境密钥不进入合同。实际 session_user/current_user 分开验证，不能复用旧探针二者相等的证明。主 Agent 已明确接受。

## 架构

[Layer 1] 使用 PG15 原生角色/NOINHERIT/SET ROLE 与现有 TS 事务所有者，无新事务框架。PG官方说明 SET ROLE 改变 current_user 而不等于更换会话登录身份，NOINHERIT 角色需显式切换才能取得所属能力；候选通过实库验证该事实。[SET ROLE](https://www.postgresql.org/docs/15/sql-set-role.html)、[CREATE ROLE](https://www.postgresql.org/docs/15/sql-createrole.html)。

```text
产品已钉住migrations → 候选角色/组织/锁/目录/核心ACL → 同事务伴随运行ACL
环境LOGIN → 单能力SET ROLE/assert_purpose → 已有服务 → 原事务最终截止 → COMMIT
治理生成源 → OpenAPI/schema + installation manifest + 伴随SQL/协议/provenance → 待精确批准的版本化包
```

权限所有者分离：runtime_fn_owner保管既有发布/回退的执行权限；directory_fn_owner只拥有目录/key，普通能力不能成为它们的成员。组织附表只关联已有 principal/facts。漏洞修复保持业务角色上限未变。

## 代码质量

只保留一个用途 ACL 真源；旧 purpose_gap 不进入正式命名合同，因为它代表旧探针而非新消费者。assert_purpose 只验证连接身份与成员边界，明确不假称完整 ACL 审计或最终用户隔离。组织证据延迟检查在 INSERT 的 WHEN 固定排队，避免 RESET ROLE 导致提交时跳过；历史不可改与指针 CAS 属于存储不变量，原 writer 继续唯一拥有业务时序和请求摘要。

来源与生成物分离：生成器拒绝 probe/candidate schema 名和复制发布/授权函数正文；精确 NOLOGIN 角色清单拒绝 LOGIN/凭据/成员漂移。installation manifest 将伴随 ACL 列入必需工件，不能只把安装条件藏在注释。显式 v2 出口拥有整包完整性、精确批准与源提交校验；与旧 v1 路径分离并保留兼容，不用机器 DRAFT 字段翻转更改批准字节。

## 测试与失败路径

| 失败 | 处理与验证所有者 |
| --- | --- |
| 缺产品 overlay 函数 | ACL安装在GRANT前55000；治理PG反例，B校验实际overlay源SHA |
| 角色同名/环境高权/跨用途成员 | 角色创建失败关闭；实际LOGIN/SET ROLE、REPLICATION与多能力反例 |
| 会话停用、等待跨截止 | 原窄锁及目录最终守卫按数据库时钟拒绝，现有C回归复用到新core |
| 组织事实缺证据或提交前RESET ROLE | 同事务约束失败并回滚，实际PG反例 |
| 有效绑定直接换人、旧CAS、历史修改 | SQL拒绝；只能停用再登记，不新建用户/岗位/grant |
| 包漏伴随ACL或实现源漂移 | 出口拒绝缺件/错字节/错批准；完整临时包由真实verifier消费，产品安装侧校验每个overlay文件及manifest SHA |
| 未知COMMIT | 原消费者保留unknown和原请求恢复；不得把响应丢失标为回滚 |

Node合同测试验证生成、旧字节、manifest及负例；治理PG验证参考core+A/C与NOINHERIT真实连接；B负责相同SQL在产品overlay上的实际上传→检查→确认发布→查询消费者。最终源稳定后整轮治理release，不用旧运行覆盖新字节。具体通过项以 verification/checks 记录为准。

## 性能

本轮不新增逐行远程查询或重试队列。assert_purpose仅在受控连接借入/启动检查，不替代每笔业务权限；组织观察保持5页×50条×2扫描硬上限，超过即拒绝。全局内容锁和目录锁保留已有序列，额外组织证据查询使用已存在的复合主键。未做生产性能承诺或无限规模目录承诺。

## Implementation Tasks

1. C治理线独占生成器/SQL/协议/manifest，证明core与安装负例。
2. B产品线消费固定SQL字节并验证产品overlay哈希、用途连接与真实消费者；与C并行，SQL改变须重新核对。
3. 主 Agent汇总证据、现有计划和业务输入；冻结/export/intake留待精确新工件批准。

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
| --- | --- | --- | --- | --- | --- |
| Eng Review | plan-eng-review · 本轮安装边界 | 结构变化 | 1 | SCOPED · 决定与修复已落实 | 5项原生问题已解决：缺overlay、角色高权、延迟证据绕过、真实consumer缺权限、完整bundle出口；最终release结果见checks |
| Outside Review | claude-code · 本轮安装边界 | 独立挑战 | 1 | UNAVAILABLE · 单次180秒超时 | 没有审查结论；保留调用记录，不无限重试 |

**Completion summary:** FULL_REVIEW仅指本轮已接受的窄范围，issues_found=5（已解决），unresolved=0，critical_gaps=0；不代表整个功能的外部代码审查完成。
**OUTSIDE COVERAGE:** 仅本轮安装边界的一次有界调用，180秒超时，没有外部结论。output/content-intake-runtime-contract/engineering-outside.json 保留工具结果。
**VERDICT:** 原生窄范围边界与可运行证明已完成；最终门禁以checks/verification精确输入为准。完整 /review 仍 INCOMPLETE。
NO UNRESOLVED DECISIONS
