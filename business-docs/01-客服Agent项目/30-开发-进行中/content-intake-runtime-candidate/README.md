# 运行接入合同候选

DRAFT · NOT FROZEN · NOT EXPORTED · NOT INTAKE。沿 OpenAPI1.21/schema1.23 组合组织注册输入、用途受限执行和店铺目录，不添加业务范围、真实数据、登录凭据或自动同步。业务角色上限沿冻结 authorization_deadline：两岗配置、四岗范围业务、agent/enabler 查询。首批 FAQ/售前/售后/活动和 Mac 合成验收由产品计划管理，不改变本存储边界。

## 安装边界与所有者

方案一按 A/B/C 分三个连续合同版本，每次分别交接。它可以细分回收，却会造成组织证据、目录权限和实际消费者矩阵分期错配。方案二一次运行接入候选，保持模块源文件独立、以一个安装 manifest 约束组合和阶段。采用方案二。

一次组合不等于把全部产品实现复制进治理 DDL。冻结 schema1.22 是参考核心，未定义 publish_candidate / preview_rollback / quality_state 等产品 overlay 函数；实际安装已证明直接拼入 B ACL 会报函数不存在。因此保留两个明确安装形态：

```text
治理参考验证：schema1.23 = 冻结核心原字节 + 能力角色 + 组织 + 窄锁 + C目录 + 核心ACL
产品合成装配：已钉住的产品migrations → roles → organization → session → C目录 → directory-acl → purpose-acl
环境装配：独立 LOGIN NOINHERIT → 唯一能力 membership → SET ROLE → assert_purpose → 借入用途服务
```

参考形态只能证明核心、组织和目录。伴随 `purpose-acl.sql` 依赖产品拥有的既有实现；缺依赖在任何 GRANT 前明确 `55000 INTAKE_RUNTIME_IMPLEMENTATION_REQUIRED`，禁止跳过。运行装配不应执行完整参考 schema 到既有产品库；产品在正式 intake 后编制 migration，保留相同增量和安装顺序。在一个事务安装全部候选 SQL，任一错误回滚，不能留下部分用途开权。

`roles.sql` 的安装者需 CREATEROLE 与相应 DDL/ALTER OWNER 权限。候选创建七个 NOLOGIN、NOINHERIT、非 super/createdb/createrole/bypassrls/replication 的能力或函数属主角色；同名冲突直接失败，不把已有不明角色改成“安全”。安装角色是受控迁移所有者，不是运行账号。已有冻结角色的原属性不由这次重写。

- intake_usage：实际使用资格、目录读取和查询使用。
- intake_business：上传/解析/质量/普通授权/受控发布回退，以及目录名称维护；服务仍核认证身份、范围与业务规则。
- intake_worker：解析失败的 report 和容量/终态。
- intake_org_writer：已登记组织输入、事实与同事务 provenance；不能创建 principal、身份绑定、岗位规则或 grant。
- intake_runtime_fn_owner：窄会话锁及既有发布/回退函数的 NOLOGIN 属主。
- intake_directory_fn_owner：独立持有目录当前行、历史、签名 key 与目录函数；不取得发布表写入。
- intake_directory_key_operator：只可执行私有 key 轮换，不从产品岗位自动授予。

目录内部的登记者与维护人继续要求当前唯一 director/manager 加显式同 tenant/app 登记；此处 DB 能力没有替代岗位/范围资格。

## 连接身份与消费者

环境 LOGIN 不在合同创建，不记录密码、DSN 或真实主体。它须 NOINHERIT、无高权标志，直接成员恰好为自己的单一能力且无 ADMIN OPTION；能力本身不得成为其他角色成员，任何环境账号不得属于函数属主。借入连接先受控 SET ROLE，session_user 是环境登录、current_user 是选定能力；不能沿用旧探针二者相同的假设。

`intake_runtime.assert_purpose(purpose)` 验证这个边界，purpose 为 usage/business/worker/organization/directory-key。它是连接检查，不是任意 SQL 调用者的最终用户身份或完整 ACL 认证。LOGIN 不能 RESET ROLE 后继续拥有能力；不允许通用 SQL/客户端传入 SET ROLE。服务必须绑定已认证私有 ProductSession，数据库用途隔离不宣称逐用户行隔离。

唯一事务所有者继续是产品 transaction.ts，最小切换是 `intake_runtime.lock_product_session(hash,user)`；读取 ZA003/SESSION_UNAVAILABLE 后按既有 SCOPE_DENIED/UNAUTHORIZED 归一化，不把未知 SQL 错误伪装授权拒绝。内容锁先于会话锁，事务末尾复核 DB 时钟与最早截止。业务实例借 business pool，失败收尾借 terminalPool/worker；usage 与组织 writer 仍独立，不重建四池路由框架。

## 注册组织输入

正式命名为 intake_organization，mappingVersion 为 feishu-contact-job-title-v1。协议参数在 protocol.json；映射仍由产品现有 observer 拥有，事实 CAS、代际和截止仍由原 writer 拥有，附表只固定注册来源及同事务证据。

bindings/observations 不可改历史；current 指针版本只能加一，有效登记不能直接换人，须原 writer 写停用事实并追加停用登记后再注册。每个 tenant/app 的 open_id 只能对应一条 current。观察证据绑定事实、注册版本及 tenant/app，复核观察结束/事实/登记截止。intake_org_writer 插入事实后，同事务提交前必须存在 provenance；缺失会回滚。确定性请求摘要和未知提交恢复仍由唯一服务消费者执行，不另写一套事实 writer。

有限双扫描与令牌共享 owner 的已实现边界已登记在 protocol.json：每扫描最多 5 页、每页 50 条、两次完整扫描，超界拒绝；用户 50/s/1000min、职务10/min 由单 tenant/app owner 共享，令牌更新不清配额。两个相同扫描不证明上游原子快照，单进程配额不冒充多实例协调。真实 provider 的租户证明、日志和多实例运行策略是实际装配输入，不阻碍合成协议评审。

## 版本与出口

provenance.json 固定产品输入 commit cff9fa9 和各源文件/overlay SHA；治理生成器只读本仓源，不从产品仓运行时读取。installation.generated.json 是机器可核对的组合登记，包含 core/OpenAPI 哈希、每个 SQL/协议/provenance 哈希、产品 overlay 依赖、安装顺序和必需 bundle 工件。

exporter 已支持显式 `content-intake-runtime-v1` profile 与 `customer-agent-contract-set/v2`：在原 OpenAPI/DDL 描述外增加固定九件 runtime 工件，共十二个扁平文件（含 manifest），逐件校验字节、哈希和源提交，验证 installation 的反向引用及 overlay 依赖。历史 profile 继续生成 v1 双工件。实际 `contract-profile.v1.json` 保持原 direct profile，本候选仍拒绝导出。

正式冻结必须在规范文档标记 FROZEN，并由独立 `90-评审/2026-10-08_P2运行接入合同批准.md` 精确批准 OpenAPI/DDL 和 installation SHA；installation 绑定全部伴随件及 overlay 依赖。机器源中的 DRAFT/exportApproved:false 是原始候选元数据，冻结时不通过翻转这些字段改写已批准字节。受控出口要求独立批准记录与源提交中的生成字节一致；没有批准、遗漏伴随 ACL、错哈希或依赖漂移均拒绝。当前仅临时合成 Git 仓产生测试包并实际交给 verifier，不冻结、不导出本仓候选。

## 验证与未完成边界

治理一次性 PG 验证实际 NOINHERIT LOGIN→单能力、跨用途/属主拒绝、组织 provenance 与 CAS、目录真实消费者及参考形态缺实现拒绝；B 在产品既有 overlay 上安装同一伴随 SQL 并进入真实 service 消费者。只有两边证据都匹配同一源哈希才能说明本候选可安装/可消费。合成通过仍不代表精确冻结批准、真实名单就绪或部署许可。
