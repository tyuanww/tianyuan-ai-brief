import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { buildPublicationCompatibilityCandidate, SOURCES } from './build_customer_agent_publication_compatibility_candidate.mjs';
import { buildSopRowDeletionCandidate } from './build_customer_agent_sop_row_deletion_candidate.mjs';

export const CANDIDATE_DIR = 'business-docs/01-客服Agent项目/30-开发-进行中/repair-successor-candidate';
export const sha256 = value => createHash('sha256').update(value).digest('hex');
const json = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
export const FUNCTIONS = [
  'content_intake.freeze_sop_parsed_candidate(text,text,jsonb,jsonb,jsonb)',
  'content_intake.revise_unused_sop_row(text,text,bigint,text,text)',
  'content_intake.read_sop_inherited_assets(text,text)',
  'content_intake.reserve_sop_media_payload(text,text,text,text,bigint,text)',
  'content_intake.complete_sop_media_payload(text,text,text,text)',
  'content_intake.begin_sop_media_release(text,text,text,text)',
  'content_intake.complete_sop_media_release(text,text,text,text)',
];
export const USAGE_FUNCTIONS = ['content_intake.read_sop_release_assets(text,text,text)'];
export const OLD_DELETE = 'content_intake.delete_unused_sop_row(content_intake.identifier,content_intake.version,text)';
const rowPath = '/v1/intake/sop/candidates/{candidateId}/versions/{version}/row-deletions';

/** A reproducible review candidate, never an export or approved installation. */
export function buildRepairSuccessor(read, parseOpenapi) {
  const inputs = new Map(), snapshots = new Map();
  // Pin the checked bytes once. Providers may reuse mutable Buffers; neither later
  // reads nor a consumer mutating its returned copy may replace a verified input.
  const capture = name => {
    if (!snapshots.has(name)) {
      const bytes = Buffer.from(read(name));
      snapshots.set(name, bytes); inputs.set(name, sha256(bytes));
    }
    return Buffer.from(snapshots.get(name));
  };
  const publication = buildPublicationCompatibilityCandidate(capture);
  const deletion = buildSopRowDeletionCandidate(capture);
  const doc = parseOpenapi(capture(SOURCES.openapi.path));
  assert.equal(doc.info.version, '1.23.0');
  for (const operation of JSON.parse(publication.openapiDelta).operations) {
    const parts = operation.path.slice(1).split('/').map(s => s.replaceAll('~1', '/').replaceAll('~0', '~'));
    const key = parts.pop(), parent = parts.reduce((v, k) => v[k], doc);
    if (operation.op === 'test') assert.deepEqual(parent[key], operation.value);
    else { assert.ok(['replace', 'add'].includes(operation.op)); parent[key] = structuredClone(operation.value); }
  }
  assert.ok(!Object.hasOwn(doc.paths, rowPath));
  const proposal = JSON.parse(deletion.openapiDelta).proposedOperation;
  const error = description => ({ description, content: { 'application/json': { schema: { $ref: '#/components/schemas/IntakeError' } } } });
  doc.info.version = '1.24.0';
  doc.info['x-successor-status'] = { status: 'DRAFT', proposedVersion: true, freezeApproved: false, exportApproved: false, intakeApproved: false, productionConsumerReady: false };
  doc.paths[rowPath] = { post: {
    operationId: 'reviseUnusedSopRow', summary: '删除未使用的 SOP 行并生成下一候选版本',
    description: '路径 candidateId/version 必须与 key 一致，身份只来自产品会话。保留旧正文和摘要；剩余行生成新版本，来源证据与质量必须重新检查。最后一行取消候选，不生成空的可发布目录。当前或历史发布行不得删除。旧候选无可靠行绑定时拒绝，不从图片顺序推断。相同 operationId 与载荷返回永久回执；改载荷拒绝；提交未知保留预览直到原操作重放确认。响应只投影至匹配候选版本，旧回执不得清除新预览。',
    tags: ['content-intake', 'sop'], security: [{ ProductSession: [] }],
    'x-required-intake-action': 'candidate-cancel', 'x-production-consumer-ready': false,
    parameters: [
      { name: 'candidateId', in: 'path', required: true, schema: { $ref: '#/components/schemas/IntakeId' } },
      { name: 'version', in: 'path', required: true, schema: { $ref: '#/components/schemas/IntakeVersion' } },
    ],
    requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', ...proposal.request } } } },
    responses: {
      '200': { description: '完整下一候选或已取消的原候选；历史不改写。', headers: { 'Cache-Control': { schema: { type: 'string', const: 'no-store' } } }, content: { 'application/json': { schema: { $ref: '#/components/schemas/IntakeCandidate' } } } },
      '400': error('输入非法或路径与 key 不一致。'), '401': error('产品会话无效。'),
      '404': error('资源不存在或无权；同一 NOT_FOUND，不泄露存在性。'),
      '409': error('版本/来源/基线变化，已发布或提交未知。COMMIT_UNKNOWN 时保留 operationId 并重放，不能重新生成操作。'),
      '503': error('暂时无法确认，保留 operationId 与预览以重放核对。'),
    },
  } };
  doc['x-trusted-sop-parser-stage'] = {
    status: 'DRAFT', transport: 'server-owned transaction only; not an HTTP or renderer operation',
    function: FUNCTIONS[0], readInheritanceFunction: FUNCTIONS[2], actor: 'authenticated service principal, never request-body principal',
    rows: { completeMaterialEntries: true, fields: ['rowId', 'businessEntryId', 'title', 'answerText'], additionalProperties: false },
    media: { required: ['sourceId', 'sourceVersion', 'fileSha256', 'materialDigest', 'contentVersion', 'freshRowIds', 'items'], additionalProperties: false,
      contentVersion: { type: 'object', additionalProperties: false, required: ['kind', 'value'], properties: { kind: { enum: ['declared', 'sha256'] }, value: { type: 'string', minLength: 1, maxLength: 32767 } }, description: 'Parser uses declared workbook version verbatim when present, otherwise exact file SHA256; a new job/operation is not a new version.' },
      itemFields: ['mediaObjectId', 'payloadObjectId', 'sha256', 'bytes', 'mime', 'sheetName', 'rowNumber', 'columnNumber', 'ordinal'] },
    atomicity: 'Single function freezes the parsing job, candidate, vocabulary, rows and media in one transaction. Same candidate/version/material exact replay is idempotent. Any changed payload fails closed. No broad application table writes.',
    inheritance: 'Every material entry needs exact parser row provenance. Prior release lineage must have the same row binding; explicit freshRowIds partition parser rows from inherited rows; only inherited rows retain the exact prior entry and media set. Missing provenance never inferred.',
    authorization: 'Current import scope/tenant/role deadline, source mode/version and material/file digest checked. Old media stage and row-only registration are not callable by business.',
    lifecycle: 'Deleted rows remain blocked for every replay of their source/content version. A new content version may restage an unreferenced never-adopted discarded object only after immutable deletion events preserve the original timestamp and metadata. Current projection may clear discarded_at; immutable events never change. Unknown old tombstones fail closed.',
    byteTrust: 'SQL checks metadata consistency only. Trusted parser must verify actual media bytes and sha256 before this call; raw client media metadata is forbidden.',
  };
  const lockBytes = capture(`${CANDIDATE_DIR}/predecessor-lock.json`);
  assert.equal(sha256(lockBytes), '0e33365085437efa1c2bf899ca87c7cef68147848edc8a3f9e42d6d3b2c8caf2', 'Predecessor installation lock drift');
  const predecessorLock = JSON.parse(lockBytes);
  const receipts = predecessorLock.migrations.map(m => `(${m.position},'${m.id}','${m.sha256}')`).join(',\n');
  const installGuard = Buffer.from(`DO $installation$ BEGIN
    IF (SELECT count(*) FROM customer_agent_meta.schema_migrations) <> 39 OR EXISTS (
      SELECT 1 FROM (VALUES ${receipts}) AS expected(position,id,hash)
      LEFT JOIN customer_agent_meta.schema_migrations actual ON actual.position=expected.position
      WHERE actual.migration_id IS DISTINCT FROM expected.id OR actual.migration_sha256 IS DISTINCT FROM expected.hash
    ) THEN RAISE EXCEPTION 'REPAIR_PREDECESSOR_RECEIPTS_MISMATCH'; END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='intake_runtime_fn_owner' AND NOT rolcanlogin AND NOT rolsuper)
      OR to_regrole('intake_business') IS NULL THEN RAISE EXCEPTION 'REPAIR_ROLE_BOUNDARY_MISMATCH'; END IF;
  END $installation$;\n`);
  const delta = Buffer.concat([installGuard,
    Buffer.from('-- DRAFT successor. Requires caller-owned transaction over the verified 0039 predecessor.\nSELECT backend_review.lock_content();\nSELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(\'cs_ai_content_publish\'));\n'),
    publication.storage, Buffer.from('\n'), deletion.storage,
  ]);
  // schema 1.27 is an overlay, NOT a cumulative schema. Preserve both byte segments.
  const schema = Buffer.concat([capture(SOURCES.database.path), Buffer.from('\n-- EXACT schema 1.27 OVERLAY (not a second cumulative baseline)\n'), capture(SOURCES.overlay.path), Buffer.from('\n-- PROPOSED schema 1.28 REPAIR DELTA; dependency assembly is specified separately\n'), delta]);
  const files = new Map([['openapi.candidate.json', json(doc)], ['schema.candidate.sql', schema], ['upgrade.candidate.sql', delta]]);
  const installation = {
    schema: 'repair-successor-installation-proposal/v1', status: 'DRAFT', approved: false,
    proposal: { openapi: '1.24.0', schema: '1.28', migration: '0040', exportProfile: 'content-intake-repair-successor-v1' },
    predecessor: { productHead: '292221d080006a86a3b5a4a950b055cef2e94eaa', migrationCount: 39, newDatabaseBootstrap: false,
      note: 'Install the existing verified 0001–0039 closure first. The cumulative reference schema is not a standalone bootstrap: runtime companion SQL and original role ownership remain prerequisites.' },
    order: ['BEGIN', 'verify predecessor migration receipts/checksums 0001–0039 and role/ACL closure', 'upgrade.candidate.sql', 'assert resulting security/ACL; record approved migration receipt only after future intake', 'COMMIT'],
    failure: 'Any precondition or installation error rolls back the whole transaction. Unknown COMMIT requires receipt recovery, never blind reapply.',
    owner: 'intake_runtime_fn_owner',
    aclDelta: { grantExecuteToBusiness: FUNCTIONS, grantExecuteToUsage: USAGE_FUNCTIONS, revokeFromBusiness: [OLD_DELETE, 'content_intake.register_sop_candidate_rows(text,text,bigint,jsonb)', 'content_intake.stage_sop_candidate_assets(text,text,bigint,jsonb,jsonb)'],
      grantToFunctionOwner: { 'content_intake.candidate_vocabulary': ['SELECT', 'INSERT'], 'content_intake.objects': ['SELECT', 'INSERT'], 'content_intake.object_reservations': ['SELECT', 'INSERT', 'UPDATE'], 'content_intake.entitlement_scopes': ['SELECT'], 'content_intake.parse_jobs': ['SELECT', 'UPDATE(state,finished_at,result_candidate_id,result_candidate_version)'], 'content_intake.release_catalogs': ['SELECT'], 'content_intake.vocabulary': ['SELECT'], 'content_intake.vocabulary_displays': ['SELECT'] },
      applicationTableGrants: [], publicGrants: [], changesExistingPublisherOwnerAcl: false },
    requiredFunctions: ['backend_review.lock_content()', 'content_intake.authorization_deadline(text,text,text,text,timestamp with time zone)', 'public.jsonb_jcs(jsonb)', 'content_intake.guard_legacy_write(text,text)', 'content_intake.inherit_legacy_catalog(text,text)'],
    consumerBoundary: { rowBinding: 'Trusted parser supplies validated material, exact rowBindings for ALL entries and digest-bound media envelope to freeze_sop_parsed_candidate; it atomically freezes the job and candidate, vocabulary, rows and media. read_sop_inherited_assets returns authorized exact predecessor provenance. Row/media helpers are owner-internal.',
      command: 'Existing transaction/receipt owner maps request to revise_unused_sop_row, enforces path/key identity and returns IntakeCandidate. Never expose actor body or database result directly.',
      preview: 'On unknown commit retain operationId and preview; durable response and rowIds apply only to their candidate version. Read immutable release-media bindings only after the existing session/lease/source authorization, filter each row before deduplication, then verify one private payload. Missing or corrupted bytes fail closed; no cache fallback.',
      payload: 'Same job/media reservation returns the same private object. sop-media shares the existing tenant quota; immutable files and database adoption are separate recoverable steps. Filesystem object locks cover writes and reclaim independently of database connectivity; crashed locks remain busy and charged, with no automatic TTL reclaim.',
      publication: 'One statement-level release_lineage trigger projects exact row media in the same publish/rollback/inheritance transaction. Shared images retain distinct row bindings; missing provenance or payload rejects the entire publication. Existing frozen migrations remain unchanged.',
      blocked: ['production parser must adopt the bounded freeze function after versioned intake; no broad business table write grant', 'inherited material must carry reliable complete row mapping and explicitly inherited media; unbound history fails closed', 'new POST is not wired in production; old media-only DELETE cannot stand in for text deletion'] },
  };
  files.set('installation.candidate.json', json(installation));
  files.set('manifest.json', json({ schema: 'repair-successor-review-candidate/v1', status: 'DRAFT', formalVersionAssigned: false,
    proposedVersions: installation.proposal, freezeApproved: false, exportApproved: false, intakeApproved: false, productionConsumerReady: false, runtimeActivated: false, syntheticOnly: true,
    inputs: Object.fromEntries(inputs), exactReuse: { publisherSql: sha256(publication.storage), reuseScope: 'Only unchanged publisher body. Row revision now writes immutable deletion history; all SOP lifecycle functions, ACL and combined installation require fresh evidence.' }, newSopCandidateSql: sha256(deletion.storage),
    artifacts: Object.fromEntries([...files].map(([name, bytes]) => [name, { sha256: sha256(bytes), bytes: bytes.length }])),
    remainingApprovals: ['Confirm proposed versions, migration and profile; hashes in this manifest are review objects, NOT approval.', 'Review exact final artifacts and installation closure, then run release gate on frozen input and record explicit freeze.', 'Separate export approval/profile, export receipt and product versioned intake; no direct copy to migrations.'],
  }));
  return files;
}
export function parseFrozenOpenapi(bytes) {
  const require = createRequire(new URL('../../sites/package.json', import.meta.url));
  // Redocly owns YAML parsing; do not add a second parser dependency.
  const temporary = mkdtempSync(path.join(tmpdir(), 'repair-openapi-'));
  try {
    const file = path.join(temporary, 'openapi.yaml'); writeFileSync(file, bytes);
    return JSON.parse(execFileSync(process.execPath, [require.resolve('@redocly/cli/bin/cli.js'), 'bundle', file, '--ext', 'json'], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }));
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2]; assert.ok(['--write', '--check'].includes(mode)); assert.equal(process.argv.length, 3);
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const files = buildRepairSuccessor(name => readFileSync(path.join(root, name)), parseFrozenOpenapi);
  for (const [name, bytes] of files) {
    const target = path.join(root, CANDIDATE_DIR, name);
    if (mode === '--check') assert.deepEqual(readFileSync(target), bytes, `Candidate drift: ${name}`);
    else writeFileSync(target, bytes);
  }
  console.log(`DRAFT successor ${mode.slice(2)}: ${files.size} artifacts; no freeze/export/intake.`);
}
