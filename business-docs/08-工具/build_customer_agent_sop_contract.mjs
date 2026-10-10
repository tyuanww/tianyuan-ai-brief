import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const development = 'business-docs/01-客服Agent项目/30-开发-进行中';
const review = 'business-docs/01-客服Agent项目/90-评审';

export const SOP_PATHS = Object.freeze({
  predecessorOpenapi: `${development}/openapi.v1.22.yaml`,
  predecessorDatabase: `${development}/schema.v1.25.sql`,
  decision: `${review}/2026-10-10_SOP与四表业务方案选定.md`,
  openapi: `${development}/openapi.v1.23.yaml`,
  database: `${development}/schema.v1.26.sql`,
});

export const SOP_GENERATION = Object.freeze({
  description: 'SOP additive contract candidate for the later 0036 migration; generated only from frozen predecessor bytes and the selected business decision.',
  profile: 'content-intake-sop-xlsx-v1',
  openapiVersion: '1.23.0',
  schemaVersion: '1.26',
  owner: 'intake_runtime_fn_owner',
});

const EXPECTED = Object.freeze({
  predecessorOpenapi: '3f741eb980aba1cd9a2a273b25771b50299e1aef3acbc6a1579b57541ed43a94',
  predecessorDatabase: '0620ee58a19543736f58b8dcf54ad5a2d0865cd48a74e24a245bbb384f1b7998',
  decision: '89167a0b049777a4c51cbfabefa0cb089549b61294d4ec7d35800404574f6614',
});

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const text = bytes => Buffer.from(bytes).toString('utf8');

function replaceOnce(value, needle, replacement, name) {
  const count = value.split(needle).length - 1;
  if (count !== 1) throw new Error(`SOP ${name} anchor count ${count}`);
  return value.replace(needle, replacement);
}

function assertDecision(decision) {
  const required = [
    '方案甲', '整单不撤', '全部失权', '不把一批发布拆开',
    '历史一直保留', '整次上传里没被使用的部分', '一条条删', '已经发布、正在使用的内容不删',
    '新版本定为 OpenAPI 1.23.0、schema 1.26', '迁移编号定为 `0036`',
    'intake_runtime_fn_owner', '正式 `sourceId` 本轮明确不编、不导入',
    '真实供应商、私有桶或路径、服务端加密和密钥本轮不定',
  ];
  for (const marker of required) if (!decision.includes(marker)) throw new Error(`SOP decision marker missing: ${marker}`);
}

const errorSchema = { $ref: '#/components/schemas/SopError' };

function sopResponses(extra = {}) {
  return {
    '400': { description: '请求格式、表格行定位或文字答案不完整；整次导入拒绝。', content: { 'application/json': { schema: errorSchema } } },
    '401': { description: '产品会话无效；不返回来源、候选或图片存在性。', content: { 'application/json': { schema: errorSchema } } },
    '403': { description: '用途或当前权限拒绝；不把具体资源的存在性当作 403 泄露。', content: { 'application/json': { schema: errorSchema } } },
    '404': { description: '资源不存在或当前主体对该资源全部失权；统一返回 NOT_FOUND。', content: { 'application/json': { schema: errorSchema } } },
    '409': { description: '版本、来源或材料已经变化；调用方丢弃本次草稿并重新读取。', content: { 'application/json': { schema: errorSchema } } },
    '413': { description: '文件、单行或图片超出合同上限；不留下部分结果。', content: { 'application/json': { schema: errorSchema } } },
  ...extra,
  };
}

function buildSopPaths() {
  return {
    '/v1/intake/sop/sources/{sourceId}/objects': {
      post: {
        operationId: 'uploadSopWorkbook',
        summary: '接收 SOP XLSX 并保留工作表图片引用',
        description: '仅接收已在服务端登记的 SOP 来源。六个工作表全部纳入首期候选；工作表名称成为分类。每一行必须有文字答案，图片按所在工作表和行号关联到同一行，同一行多张图片全部保留。空文字答案行整次拒绝并指出工作表、行号。版本优先取文件内版本列，没有版本列时取原始文件 SHA-256。同一来源同一版本幂等，不重复生成内容。真实 sourceId 尚未编制，本路径不绑定桌面文件。',
        tags: ['content-intake', 'sop'],
        parameters: [{ name: 'sourceId', in: 'path', required: true, schema: { $ref: '#/components/schemas/IntakeId' } }],
        requestBody: { required: true, content: { 'multipart/form-data': { schema: { $ref: '#/components/schemas/SopWorkbookUpload' } } } },
        responses: { '201': { description: '候选已登记；图片只返回系统内预览引用，不返回永久对象 URL。', content: { 'application/json': { schema: { $ref: '#/components/schemas/SopUploadReceipt' } } }, headers: { 'Cache-Control': { schema: { type: 'string', const: 'no-store' } } } }, ...sopResponses() },
        'x-required-intake-action': 'import',
        security: [{ ProductSession: [] }],
      },
    },
    '/v1/intake/sop/candidates/{candidateId}/versions/{version}/material': {
      get: {
        operationId: 'readSopCandidateMaterial',
        summary: '按工作表分类读取 SOP 文字和系统图片预览引用',
        description: '读取的是候选材料，不是已发布内容。文字保留每个工作表的列顺序和换行；图片预览通过系统短期引用打开，不暴露永久 URL、供应商、桶或密钥。',
        tags: ['content-intake', 'sop'],
        parameters: [{ name: 'candidateId', in: 'path', required: true, schema: { $ref: '#/components/schemas/IntakeId' } }, { name: 'version', in: 'path', required: true, schema: { $ref: '#/components/schemas/IntakeVersion' } }],
        responses: { '200': { description: '按分类返回候选文字与图片引用。', content: { 'application/json': { schema: { $ref: '#/components/schemas/SopCandidateMaterial' } } } }, ...sopResponses() },
        security: [{ ProductSession: [] }],
      },
    },
    '/v1/intake/sop/candidates/{candidateId}/versions/{version}/publish': {
      post: {
        operationId: 'publishSopCandidate',
        summary: '确认并发布 SOP 候选',
        description: '发布前重新检查来源、候选版本和当前资格；文字答案是检索所需的权威内容，图片只是辅助说明。发布将文字和图片关联在同一不可变发布单元中。该合同候选仍未冻结、未导出、未 intake，也不打开生产 runner。',
        tags: ['content-intake', 'sop'],
        parameters: [{ name: 'candidateId', in: 'path', required: true, schema: { $ref: '#/components/schemas/IntakeId' } }, { name: 'version', in: 'path', required: true, schema: { $ref: '#/components/schemas/IntakeVersion' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/SopPublishCommand' } } } },
        responses: { '200': { description: '候选已发布；历史发布保持不变。', content: { 'application/json': { schema: { $ref: '#/components/schemas/SopPublishReceipt' } } } }, ...sopResponses({ '422': { description: '文字答案缺失、行定位不一致或图片绑定不完整；整次发布拒绝。', content: { 'application/json': { schema: errorSchema } } } }) },
        'x-required-intake-action': 'publish',
        security: [{ ProductSession: [] }],
      },
    },
    '/v1/intake/sop/releases/{releaseId}/media/{mediaObjectId}': {
      get: {
        operationId: 'previewSopMedia',
        summary: '在系统内预览已发布 SOP 图片',
        description: '只返回系统内短期预览响应，不返回永久对象 URL、真实供应商、私有桶、对象密钥或凭据。调用方必须仍具备该发布来源的 query 资格。',
        tags: ['content-intake', 'sop'],
        parameters: [{ name: 'releaseId', in: 'path', required: true, schema: { $ref: '#/components/schemas/IntakeId' } }, { name: 'mediaObjectId', in: 'path', required: true, schema: { $ref: '#/components/schemas/IntakeId' } }],
        responses: { '200': { description: '系统内短期图片预览。', content: { 'application/json': { schema: { $ref: '#/components/schemas/SopPreview' } } } }, ...sopResponses({ '410': { description: '短期预览已失效；重新读取当前发布材料。', content: { 'application/json': { schema: errorSchema } } } }) },
        security: [{ ProductSession: [] }],
      },
    },
    '/v1/intake/sop/rollback': {
      post: {
        operationId: 'rollbackSopRelease',
        summary: '按整单策略回退 SOP 发布',
        description: '方案甲：操作者还能看到一部分来源但已失去另一部分资格时，整单不撤并返回 403 SCOPE_DENIED，已失权内容不展示，已经发布的版本原样保留；操作者对相关来源全部失权，或回退单不属于当前操作者时，按不存在处理并返回 404 NOT_FOUND。绝不拆开只撤仍有权的部分。',
        tags: ['content-intake', 'sop'],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/SopRollbackCommand' } } } },
        responses: { '200': { description: '整单回退成功；关联图片与文字一起切换到目标发布。', content: { 'application/json': { schema: { $ref: '#/components/schemas/SopRollbackReceipt' } } } }, ...sopResponses({ '403': { description: 'SCOPE_DENIED：只失去部分来源资格，整单拒绝且不暴露失权部分。', content: { 'application/json': { schema: errorSchema } } }, '404': { description: 'NOT_FOUND：全部失权或回退单不属于当前操作者。', content: { 'application/json': { schema: errorSchema } } } }) },
        'x-required-intake-action': 'rollback',
        security: [{ ProductSession: [] }],
      },
    },
    '/v1/intake/sop/candidates/{candidateId}/versions/{version}/rows/{rowId}': {
      delete: {
        operationId: 'deleteUnusedSopRow',
        summary: '手工删除未使用的 SOP 单行',
        description: '只允许删除尚未发布且未被使用的一行及只属于该行的图片。可以按整次上传删除未使用部分，也可以一条条删；已经发布或正在使用的内容不删。历史永久保留，不设自动到期或自动清理。',
        tags: ['content-intake', 'sop'],
        parameters: [{ name: 'candidateId', in: 'path', required: true, schema: { $ref: '#/components/schemas/IntakeId' } }, { name: 'version', in: 'path', required: true, schema: { $ref: '#/components/schemas/IntakeVersion' } }, { name: 'rowId', in: 'path', required: true, schema: { type: 'string', pattern: '^sop:[^:]{1,128}:[1-9][0-9]{0,3}$' } }],
        responses: { '204': { description: '未使用行及其图片已删除。' }, ...sopResponses({ '409': { description: '该行已发布或正在使用，不能删除。历史记录保持不变。', content: { 'application/json': { schema: errorSchema } } } }) },
        security: [{ ProductSession: [] }],
      },
    },
  };
}

function buildSopSchemas() {
  return {
    SopWorkbookUpload: { type: 'object', additionalProperties: false, required: ['file'], properties: { file: { type: 'string', format: 'binary' } } },
    SopMediaObject: { type: 'object', additionalProperties: false, required: ['mediaObjectId', 'sheetName', 'rowNumber', 'ordinal', 'sha256', 'mime', 'bytes'], properties: { mediaObjectId: { $ref: '#/components/schemas/IntakeId' }, sheetName: { type: 'string', minLength: 1, maxLength: 128 }, rowNumber: { type: 'integer', minimum: 1, maximum: 5000 }, ordinal: { type: 'integer', minimum: 1, maximum: 100 }, sha256: { type: 'string', pattern: '^[0-9a-f]{64}$', minLength: 64, maxLength: 64 }, mime: { type: 'string', enum: ['image/png', 'image/jpeg', 'image/gif'] }, bytes: { type: 'integer', minimum: 1, maximum: 5242880 }, preview: { $ref: '#/components/schemas/SopPreview' } } },
    SopPreview: { type: 'object', additionalProperties: false, required: ['previewToken', 'expiresAt'], properties: { previewToken: { type: 'string', minLength: 1, maxLength: 512 }, expiresAt: { type: 'string', format: 'date-time', maxLength: 35 } }, description: '系统内短期预览引用，不是永久 URL。' },
    SopCandidateRow: { type: 'object', additionalProperties: false, required: ['rowId', 'sheetName', 'rowNumber', 'answer', 'media'], properties: { rowId: { type: 'string', pattern: '^sop:[^:]{1,128}:[1-9][0-9]{0,3}$' }, sheetName: { type: 'string', minLength: 1, maxLength: 128 }, rowNumber: { type: 'integer', minimum: 1, maximum: 5000 }, answer: { type: 'string', minLength: 1, maxLength: 20000 }, media: { type: 'array', maxItems: 100, items: { $ref: '#/components/schemas/SopMediaObject' } } } },
    SopCandidateMaterial: { type: 'object', additionalProperties: false, required: ['candidateId', 'version', 'sheets', 'contentHash'], properties: { candidateId: { $ref: '#/components/schemas/IntakeId' }, version: { $ref: '#/components/schemas/IntakeVersion' }, sheets: { type: 'array', minItems: 1, maxItems: 6, items: { type: 'object', additionalProperties: false, required: ['name', 'rows'], properties: { name: { type: 'string', minLength: 1, maxLength: 128 }, rows: { type: 'array', items: { $ref: '#/components/schemas/SopCandidateRow' } } } } }, contentHash: { type: 'string', pattern: '^[0-9a-f]{64}$', minLength: 64, maxLength: 64 } } },
    SopUploadReceipt: { type: 'object', additionalProperties: false, required: ['operationId', 'candidateId', 'version', 'state'], properties: { operationId: { $ref: '#/components/schemas/IntakeId' }, candidateId: { $ref: '#/components/schemas/IntakeId' }, version: { $ref: '#/components/schemas/IntakeVersion' }, state: { type: 'string', enum: ['staged', 'idempotent'] } } },
    SopPublishCommand: { type: 'object', additionalProperties: false, required: ['operationId', 'contentHash', 'confirm'], properties: { operationId: { $ref: '#/components/schemas/IntakeId' }, contentHash: { type: 'string', pattern: '^[0-9a-f]{64}$', minLength: 64, maxLength: 64 }, confirm: { const: true } } },
    SopPublishReceipt: { type: 'object', additionalProperties: false, required: ['releaseId', 'contentHash', 'state'], properties: { releaseId: { $ref: '#/components/schemas/IntakeId' }, contentHash: { type: 'string', pattern: '^[0-9a-f]{64}$', minLength: 64, maxLength: 64 }, state: { const: 'published' } } },
    SopRollbackCommand: { type: 'object', additionalProperties: false, required: ['rollbackPlanId', 'operationId', 'confirm'], properties: { rollbackPlanId: { $ref: '#/components/schemas/IntakeId' }, operationId: { $ref: '#/components/schemas/IntakeId' }, confirm: { const: true } } },
    SopRollbackReceipt: { type: 'object', additionalProperties: false, required: ['releaseId', 'state'], properties: { releaseId: { $ref: '#/components/schemas/IntakeId' }, state: { const: 'rolled_back' } } },
    SopError: { type: 'object', additionalProperties: false, required: ['code', 'message', 'details'], properties: { code: { type: 'string', enum: ['VALIDATION', 'UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'CONFLICT', 'INTERNAL_ERROR'] }, message: { type: 'string', minLength: 1, maxLength: 512 }, details: { type: 'object', additionalProperties: false, required: ['reason'], properties: { reason: { type: 'string', enum: ['SCOPE_DENIED', 'SOURCE_FORMAT_MISMATCH', 'MATERIAL_CHANGED', 'NOT_FOUND'] } } } } },
  };
}

function buildOpenapi(predecessor, decision) {
  let openapi = text(predecessor);
  openapi = replaceOnce(openapi, '  version: 1.22.0\n', '  version: 1.23.0\n', 'OpenAPI version');
  const pathLines = Object.entries(buildSopPaths()).map(([route, value]) => `  ${JSON.stringify(route)}: ${JSON.stringify(value)}`).join('\n') + '\n';
  openapi = replaceOnce(openapi, 'paths:\n', `paths:\n${pathLines}`, 'paths');
  const schemaLines = Object.entries(buildSopSchemas()).map(([name, value]) => `    ${name}: ${JSON.stringify(value)}`).join('\n') + '\n';
  openapi = replaceOnce(openapi, '  schemas:\n', `  schemas:\n${schemaLines}`, 'schemas');
  openapi = replaceOnce(openapi, '\ntags:\n', '\ntags:\n  - {"name":"sop","description":"SOP 六工作表、文字答案与行内图片的候选合同；未冻结/intake 不启用。"}\n', 'sop tag');
  const metadata = {
    status: 'DRAFT', freezeApproved: false, exportApproved: false, runtime_activated: false,
    productionConsumerReady: false, syntheticOnly: true, profile: SOP_GENERATION.profile,
    openapi: SOP_GENERATION.openapiVersion, schema: SOP_GENERATION.schemaVersion,
    sourceIds: 'not-defined', storageProvider: 'not-defined', permanentObjectUrl: false,
    history: 'permanent', manualDeletion: 'unused-upload-or-single-row-only', automaticExpiry: false,
    rollback: { partialScopeLoss: '403 SCOPE_DENIED whole-unit refusal', allScopeLossOrNotOwner: '404 NOT_FOUND', partialRollback: false },
    decisionSha256: sha256(decision), predecessorOpenapiSha256: EXPECTED.predecessorOpenapi,
    predecessorDatabaseSha256: EXPECTED.predecessorDatabase,
  };
  return Buffer.from(`${openapi}\nx-content-intake-sop-development: ${JSON.stringify(metadata)}\n`);
}

const SOP_SQL = `
-- SOP media is an additive candidate only. The real storage provider, bucket, key and secret are undecided.
BEGIN;
CREATE TABLE content_intake.sop_media_objects (
  media_object_id content_intake.identifier PRIMARY KEY,
  source_id content_intake.identifier NOT NULL REFERENCES content_intake.sources,
  actor_id content_intake.identifier NOT NULL REFERENCES content_intake.principals,
  sha256 content_intake.sha256 NOT NULL,
  bytes BIGINT NOT NULL CHECK (bytes BETWEEN 1 AND 5242880),
  mime TEXT NOT NULL CHECK (mime IN ('image/png','image/jpeg','image/gif')),
  state TEXT NOT NULL DEFAULT 'staged' CHECK (state IN ('staged','adopted','released','discarded')),
  created_at TIMESTAMPTZ NOT NULL CHECK (isfinite(created_at)),
  adopted_at TIMESTAMPTZ,
  discarded_at TIMESTAMPTZ,
  UNIQUE (source_id,sha256,bytes,mime),
  UNIQUE (media_object_id,source_id,sha256,bytes,mime),
  CHECK ((state='staged' AND adopted_at IS NULL AND discarded_at IS NULL)
    OR (state IN ('adopted','released') AND adopted_at IS NOT NULL AND discarded_at IS NULL)
    OR (state='discarded' AND discarded_at IS NOT NULL)),
  CHECK (adopted_at IS NULL OR adopted_at>=created_at),
  CHECK (discarded_at IS NULL OR discarded_at>=created_at)
);
CREATE TABLE content_intake.sop_candidate_media (
  candidate_id content_intake.identifier NOT NULL,
  candidate_version content_intake.version NOT NULL,
  source_id content_intake.identifier NOT NULL,
  media_object_id content_intake.identifier NOT NULL,
  sheet_name TEXT NOT NULL CHECK (length(sheet_name) BETWEEN 1 AND 128 AND sheet_name NOT LIKE '%:%'),
  row_number INTEGER NOT NULL CHECK (row_number BETWEEN 1 AND 5000),
  column_number INTEGER NOT NULL CHECK (column_number BETWEEN 1 AND 32),
  row_id TEXT NOT NULL CHECK (row_id = 'sop:' || sheet_name || ':' || row_number::TEXT),
  ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 1 AND 100),
  sha256 content_intake.sha256 NOT NULL,
  mime TEXT NOT NULL CHECK (mime IN ('image/png','image/jpeg','image/gif')),
  bytes BIGINT NOT NULL CHECK (bytes BETWEEN 1 AND 5242880),
  PRIMARY KEY (candidate_id,candidate_version,media_object_id,ordinal),
  UNIQUE (candidate_id,candidate_version,source_id,sheet_name,row_number,column_number,ordinal),
  UNIQUE (candidate_id,candidate_version,source_id,media_object_id,sheet_name,row_number,column_number,row_id,ordinal,sha256,mime,bytes),
  FOREIGN KEY (candidate_id,candidate_version,source_id) REFERENCES content_intake.candidate_versions(candidate_id,version,source_id),
  FOREIGN KEY (media_object_id,source_id,sha256,bytes,mime) REFERENCES content_intake.sop_media_objects(media_object_id,source_id,sha256,bytes,mime)
);
CREATE TABLE content_intake.sop_release_media (
  release_id TEXT NOT NULL REFERENCES public.content_releases,
  candidate_id content_intake.identifier NOT NULL,
  candidate_version content_intake.version NOT NULL,
  source_id content_intake.identifier NOT NULL,
  media_object_id content_intake.identifier NOT NULL,
  sheet_name TEXT NOT NULL CHECK (length(sheet_name) BETWEEN 1 AND 128 AND sheet_name NOT LIKE '%:%'),
  row_number INTEGER NOT NULL CHECK (row_number BETWEEN 1 AND 5000),
  column_number INTEGER NOT NULL CHECK (column_number BETWEEN 1 AND 32),
  row_id TEXT NOT NULL CHECK (row_id = 'sop:' || sheet_name || ':' || row_number::TEXT),
  ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 1 AND 100),
  sha256 content_intake.sha256 NOT NULL,
  mime TEXT NOT NULL CHECK (mime IN ('image/png','image/jpeg','image/gif')),
  bytes BIGINT NOT NULL CHECK (bytes BETWEEN 1 AND 5242880),
  PRIMARY KEY (release_id,media_object_id,ordinal),
  FOREIGN KEY (candidate_id,candidate_version,source_id,media_object_id,sheet_name,row_number,column_number,row_id,ordinal,sha256,mime,bytes)
    REFERENCES content_intake.sop_candidate_media(candidate_id,candidate_version,source_id,media_object_id,sheet_name,row_number,column_number,row_id,ordinal,sha256,mime,bytes)
);
ALTER TABLE content_intake.sop_media_objects OWNER TO intake_runtime_fn_owner;
ALTER TABLE content_intake.sop_candidate_media OWNER TO intake_runtime_fn_owner;
ALTER TABLE content_intake.sop_release_media OWNER TO intake_runtime_fn_owner;
REVOKE ALL ON TABLE content_intake.sop_media_objects FROM PUBLIC;
REVOKE ALL ON TABLE content_intake.sop_candidate_media FROM PUBLIC;
REVOKE ALL ON TABLE content_intake.sop_release_media FROM PUBLIC;
COMMENT ON TABLE content_intake.sop_media_objects IS 'SOP 图片对象候选；真实对象存储未定，预览不暴露永久 URL；历史永久保留，未使用内容允许人工删除。';
COMMENT ON TABLE content_intake.sop_candidate_media IS 'SOP 图片按工作表、行号和列号绑定；每行必须另有文字答案，同一行可有多图。';
COMMENT ON TABLE content_intake.sop_release_media IS 'SOP 发布单元的不可变图片关系；已发布或正在使用的内容不得删除，不设自动到期。';
COMMIT;
`;

function buildDatabase(predecessor, decision) {
  const prefix = Buffer.from(`-- schema.v1.26 — DRAFT SOP additive successor; immutable schema.v1.25 follows unchanged\n-- predecessor_sha256=${EXPECTED.predecessorDatabase}\n-- decision_sha256=${sha256(decision)}\n`);
  return Buffer.concat([prefix, predecessor, Buffer.from(`\n-- BEGIN SOP MEDIA CONTRACT ${sha256(Buffer.from(SOP_SQL))}\n`), Buffer.from(SOP_SQL.trimStart()), Buffer.from('\n-- END SOP MEDIA CONTRACT\n')]);
}

export function buildSopContractFiles(read) {
  const predecessorOpenapi = read(SOP_PATHS.predecessorOpenapi);
  const predecessorDatabase = read(SOP_PATHS.predecessorDatabase);
  const decision = read(SOP_PATHS.decision);
  if (sha256(predecessorOpenapi) !== EXPECTED.predecessorOpenapi) throw new Error('Frozen OpenAPI 1.22 drift');
  if (sha256(predecessorDatabase) !== EXPECTED.predecessorDatabase) throw new Error('Frozen schema 1.25 drift');
  if (sha256(decision) !== EXPECTED.decision) throw new Error('Selected SOP decision drift');
  assertDecision(text(decision));
  return { openapi: buildOpenapi(predecessorOpenapi, decision), database: buildDatabase(predecessorDatabase, decision) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !['--write', '--check'].includes(args[0])) throw new Error('Use --write or --check');
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const generated = buildSopContractFiles(file => readFileSync(path.join(root, file)));
  for (const [name, bytes] of Object.entries(generated)) {
    const target = path.join(root, SOP_PATHS[name]);
    if (args[0] === '--write') writeFileSync(target, bytes);
    else if (!readFileSync(target).equals(bytes)) throw new Error(`SOP generated drift: ${name}`);
    console.log(`${name} ${sha256(bytes)} ${bytes.length} bytes`);
  }
}
