import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const root = new URL('../../', import.meta.url);
const read = path => readFileSync(new URL(path, root));
const protocol = JSON.parse(read('business-docs/01-客服Agent项目/30-开发-进行中/content-intake-sop-candidate/protocol.json'));
const wire = JSON.parse(read('business-docs/01-客服Agent项目/30-开发-进行中/content-intake-sop-candidate/openapi.delta.json'));
const checks = JSON.parse(read('business-docs/01-客服Agent项目/30-开发-进行中/content-intake-sop-candidate/checks.json'));
const sql = read('business-docs/01-客服Agent项目/30-开发-进行中/content-intake-sop-candidate/storage.delta.sql').toString();

const sheets = [
  '过敏流程SOP',
  '少错破SOP',
  '品质售后SOP',
  '税收相关规则',
  '品牌对接资源汇总',
  '长痘痘SOP',
];

test('SOP candidate stays synthetic and unapproved', () => {
  assert.equal(protocol.schema, 'customer-agent-content-intake-sop-xlsx-candidate/v1');
  assert.equal(protocol.status, 'DRAFT');
  assert.equal(protocol.exportApproved, false);
  assert.equal(protocol.intakeApproved, false);
  assert.equal(protocol.productionConsumerReady, false);
  assert.equal(protocol.syntheticOnly, true);
  assert.deepEqual(protocol.scope.selectedSheets, sheets);
  assert.equal(protocol.scope.exactSheetSet, true);
  assert.ok(protocol.media.metadata.includes('ordinal'));
  assert.equal(protocol.media.sameRowAllImages, true);
  assert.equal(protocol.media.imageWithoutText, 'reject_batch');
  assert.deepEqual(protocol.version.idempotencyKey, 'sourceId + NUL + version');
  assert.deepEqual(wire.schemas.SopMediaRef.fields.sheet.enum, sheets);
  assert.deepEqual(protocol.media.extensions.sort(), ['gif', 'jpeg', 'png']);
  assert.deepEqual(wire.schemas.SopMediaRef.fields.mime, 'image/png|image/jpeg|image/gif');
  assert.equal(checks.status.protocol, 'DRAFT');
  assert.equal(checks.status.exportApproved, false);
  assert.equal(checks.status.intakeApproved, false);
  assert.equal(checks.status.productionConsumerReady, false);
  assert.equal(checks.status.syntheticOnly, true);
});

test('SOP evidence ledger still matches the candidate bytes', async () => {
  const { createHash } = await import('node:crypto');
  for (const [relative, expected] of Object.entries(checks.inputs)) {
    const digest = createHash('sha256').update(read(`business-docs/01-客服Agent项目/30-开发-进行中/content-intake-sop-candidate/${relative}`)).digest('hex');
    assert.equal(digest, expected, relative);
  }
  assert.equal(checks.checks.every(item => item.exitCode === 0), true);
});

test('SOP media boundary covers the complete recovery surface', () => {
  const paths = wire.paths;
  for (const path of [
    '/v1/intake/sources/{sourceId}/objects',
    '/v1/intake/sources/{sourceId}/candidates',
    '/v1/intake/candidates/{candidateId}/versions/{version}/material',
    '/v1/intake/candidates/{candidateId}/versions/{version}/publish',
    '/v1/intake/releases/{releaseId}/sop-media/{mediaObjectId}',
    '/v1/intake/rollback',
    '/v1/intake/operations/{operationId}',
  ]) assert.ok(paths[path], path);
  assert.equal(wire.security.noClientRoleOrScope, true);
  assert.equal(wire.security.noDirectObjectStoreUrl, true);
  assert.equal(paths['/v1/intake/releases/{releaseId}/sop-media/{mediaObjectId}'].get.response.cacheControl, 'private, no-store');
  assert.equal(wire.schemas.SopPreviewReference.permanentUrl, false);
  assert.equal(wire.schemas.SopPreviewReference.externalUrl, false);
  for (const code of ['IMAGE_WITHOUT_TEXT', 'MEDIA_NOT_READY', 'SOURCE_CHANGED', 'SCOPE_DENIED', 'COMMIT_UNKNOWN']) {
    assert.ok(wire.errors[code], code);
  }
  assert.match(paths['/v1/intake/candidates/{candidateId}/versions/{version}/publish'].post.rules.join('\n'), /atomically/);
  assert.match(paths['/v1/intake/operations/{operationId}'].get.rules.join('\n'), /original operationId/);
});

test('SOP storage candidate parses and remains closed to application grants', async () => {
  const parser = createRequire(import.meta.url)('@libpg-query/parser');
  await parser.loadModule();
  const parsed = parser.parseSync(sql);
  const tables = parsed.stmts
    .map(item => item.stmt?.CreateStmt?.relation?.relname)
    .filter(Boolean);
  assert.deepEqual(tables.sort(), ['sop_candidate_media', 'sop_media_objects', 'sop_release_media'].sort());
  assert.equal(parsed.stmts.some(item => item.stmt?.GrantStmt?.is_grant === true), false);
  // libpg-query represents REVOKE as GrantStmt with DROP_RESTRICT behavior.
  assert.equal(parsed.stmts.some(item => item.stmt?.GrantStmt?.behavior === 'DROP_RESTRICT'), true);
  for (const token of [
    "mime IN ('image/png','image/jpeg','image/gif')",
    'REFERENCES content_intake.sources',
    'REFERENCES content_intake.candidate_versions',
    'REFERENCES public.content_releases',
    'COMMIT;',
  ]) assert.ok(sql.includes(token), token);
  assert.doesNotMatch(sql, /CREATE\s+OR\s+REPLACE\s+FUNCTION/i);
});
