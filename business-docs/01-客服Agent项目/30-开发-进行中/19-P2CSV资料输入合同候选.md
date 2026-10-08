# P2 CSV 资料输入合同候选

> 状态：DRAFT · NOT FROZEN · NOT EXPORTED · NOT INTAKE。2026-10-08。仅合成准备，不授权真实来源登记、运行激活、员工或客户资料读取。

首批资料的日常维护入口是飞书表格导出的 CSV。现有 P2 新上传链只接受标准 XLSX；本候选把原 CSV 作为第一类输入接入同一候选、质量检查、二次确认直发及查询复制链。产品历史内容管理的 CSV 能力不能代替新链合同，解析器实验通过也不代表 HTTP、桌面或安装包已支持 CSV。

本仓拥有输入格式、机器合同与冻结状态，产品仓拥有受控文件、共享解析器、Main/API/worker 实施。用户已确认 B 为首个 FAQ 来源及一次性整理后写回稳定编号的方向；候选不重新发起 A/B 选择，也不发明正式来源编号、员工主体、活动期限、图片语义或空表头列含义。四岗角色上限和总监／经理首批范围保持原决定。

## 边界选择

比较两种表示：拆成 FAQ CSV 与问法 CSV 会要求多文件原子接收、跨文件摘要和失败恢复；单文件扁平表只复用现有一个对象和一个候选。选择后者：每条记录携带一个 FAQ 和可选的一条独立问法；同 FAQ 的多问法通过重复 FAQ 字段表达。不用 JSON 单元格，不永久兼容任意旧列名，也不把 CSV 转成 XLSX 后宣称已验证原 CSV。

原 CSV 字节从 Main 进入受控对象；API 独立计算原字节 SHA-256，worker 使用同一格式策略解析。格式校验后复用原有稳定条目／问法版本、缺行保留、显式停用、词项和范围、质量与确认发布机制。未知提交、材料变化、授权到期和回退策略不变。`candidate-p1.1` 是规范业务材料编码，仍适用；`selectedSheets=["CSV"]` 在本格式表示逻辑单数据集，不声称 CSV 有三张 Excel 工作表。

## 单文件格式

机器 SSOT 为 [protocol.json](content-intake-csv-candidate/protocol.json)。文件为严格 UTF-8，允许一个开头 BOM；拒绝非法编码、NUL、不配对引号、非法引号位置、行宽变化和重复／缺失／错序表头。记录分隔支持 CRLF、LF、CR；引号内的 CR/LF、逗号与双引号按 CSV 转义读取并保留，不能把引号内换行计成多条记录。错误坐标 `sheet=CSV`，行是从 1 开始的逻辑记录（表头为 1），模板列为 A–W，超出模板的错误仍按实际字母坐标（例如 X）报告；首个超预算数据记录可报 A5002（5,000 条数据加表头后的下一条），沿用 HTTP 坐标的 row≤5002、column≤32；错误报告继续是可打开的 XLSX，只包含位置和修复说明，不带客户正文。

精确 23 列，按以下顺序，不增删空列：

| 分组 | 有序列 |
| --- | --- |
| 来源 5 列 | `sourceId`、`templateVersion`、`brandId`、`scope`、`domain` |
| FAQ 15 列 | 条目编号、标题、标准话术、商品编号、场景编号、分类、适用说明、状态、生效时间、失效时间、对应通用条目、内部说明、风险提示、附件说明、品牌不可覆盖 |
| 问法 3 列 | 问法编号、问法、问法状态 |

每条记录的来源 5 列必须等于当前已认证请求捕获的可信来源登记，文件不能自行改店铺、品牌、领域、source 或授权。scope 保留现行解析上下文语义（店铺范围用店铺 ID，品牌范围用 `brand`）；domain 为既有 product／presale／aftersale／campaign。模板下载可以预填来源，不以空值或浏览器状态替代登记。

同条目编号可出现多次，仅用于多问法；该条目的 FAQ 15 个字段须逐值完全一致，不做 trim、大小写折叠或“选最后一行”。问法 3 列全空表示本记录没有新问法；只填一部分拒绝。无问法记录不得重复，也不能与同条目的有问法记录混用。问法编号在整文件唯一，仍是可独立版本化的稳定身份；不能跨条目迁移。没有上传的旧条目／问法保留，不把缺行当删除。停用必须显式填写既有状态值。

FAQ 校验复用 XLSX 业务规则：稳定编号、必填标题／话术、启用或停用、带时区有效时间和先后关系、活动必须到期、品牌关联及不可覆盖、附件和媒体标记拒绝、过敏话术必须含“停手”和“确认”。CSV 不包含二进制图片；出现图片／附件标记不静默删去，其必要含义未确认前不得带入正式内容。解析不执行公式，字符串也不据此自动生成外链或媒体请求。

## 预算与完整性

- 原字节最多 10 MiB；数据记录最多 5,000（不含表头）。归并后的 FAQ 数加问法数也不得超过 5,000。
- 每格 32,767 个 JS UTF-16 code units；总文字 3,000,000，包含表头和重复元信息／FAQ；全部单元格最多 200,000，包含表头。重复记录不能绕过预算。
- 严格格式错误、来源不一致、重复问法 ID、FAQ 冲突和任一业务校验失败均整批拒绝，不返回可用的部分候选。空模板无数据不能发布。
- CSV 固定组合：`text/csv` / `faq-csv-v1` / `intake-csv-v1` / `faq-csv-columns-v1`。结构摘要是 `SHA-256(UTF-8(JSON.stringify(23 列有序字符串数组)))`，无缩进或换行，值为 `daaa4126d63194f59949c2b6f464b108ed87a430090e4dfe36e255663ab59165`。
- XLSX 保留 `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` / `faq-p1.1` / `intake-p1.1` 及既有可信登记的 mapping／structureDigest。不能交叉搭配 CSV MIME／规则／模板。
- 原字节 object.sha256、候选 file_sha256 与 sourceClaim.fileSha256 保持相同。BOM、换行和引号写法属于原字节摘要；即使业务材料相同，原文件摘要也可不同。结构摘要不是文件摘要，也不包含正文。

## 版本化登记和存储门

新 [OpenAPI 1.22.0](openapi.v1.22.yaml) / [schema.v1.24](schema.v1.24.sql) 从已冻结的 1.21 / 1.23 原字节生成。只扩充输入格式和模板响应、精确来源组合及候选 material 条件；发布、授权、质量、回退、审批历史合同没有改变。`IntakePolicy` 保留旧默认字段，并增加精确的 `inputFormats` 两项，客户端不能通过全局“支持 CSV”忽略具体来源登记。

[storage.delta.sql](content-intake-csv-candidate/storage.delta.sql) 在来源新版本插入、input 对象创建、parse 作业创建、候选创建各自核对格式。对象先与当前来源版本匹配；parse 和候选使用它们捕获的 `source_version`，旧 XLSX 作业不因后来来源转 CSV 而被重解释。source mapping、object、candidate 的既有不可变守卫和原 SHA 外键保留。CSV 只允许 input，不允许伪装 report 或 review-package。没有新应用 GRANT、LOGIN 账号或运行配置。

正式冻结及产品 intake 之后，具体来源才能经已有有权管理接口 CAS 新增 CSV mapping 版本；不能 UPDATE 旧 mapping，也不默认迁移所有来源。受控 CSV 模板和新的记录头只能以该版本解析；旧候选、文件和审批证据按各自原版本保留。CSV 输入被格式门接受也不会产生 import、publish 或 query grant。

## 冻结与接入条件

候选的生成命令为 `node business-docs/08-工具/build_customer_agent_csv_contract.mjs --write`；校验用 `--check`。精确候选与输入／日志摘要见 [验证记录](content-intake-csv-candidate/verification.md)。冻结前要明确采用本文件的单文件表示、版本组合及预算，批准所列新 OpenAPI、schema、protocol 与 storage 字节；之后才新增独立批准记录、冻结规范锚点，并切换 profile 为 `content-intake-csv-v1`，再按完整来源 commit 执行版本化 export 与产品 intake。exporter 已具备未启用的 `content-intake-csv-v1` 候选 profile，当前 profile 仍为 runtime；DRAFT、缺独立批准／冻结锚点或安装清单批准哈希均拒绝导出。候选 bundle v3 必须包含全部 runtime 伴随物、新 CSV protocol/storage 及绑定新 schema 的安装清单。不能以旧 runtime profile 导出 CSV，也不能把旧安装清单的哈希当新 schema 的安装授权。

安装清单明确 `csvInputImplementationRequired=true`、`csvProductionConsumerReady=false`；合成导出验证只证明可消费的合同包，不代表产品 CSV 生产消费者已实现。

产品后续仍需接通格式选择、原字节上传、共享解析、错误报告、worker material、CSV 模板、Mac 真实安装包合成闭环；现有 XLSX 合成通过证据不覆盖这些变化。真实店铺来源、主体及图片／空列语义仍由业务元信息确定。Windows 实机验收另行安排。完整外部 `/review` 保持 INCOMPLETE，本候选未重新调用外部审核。
