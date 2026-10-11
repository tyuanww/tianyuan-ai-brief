import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { buildSopRowDeletionCandidate, CANDIDATE_DIR, SOURCES } from '../../business-docs/08-工具/build_customer_agent_sop_row_deletion_candidate.mjs';
const root = new URL('../../', import.meta.url);
const read = name => readFileSync(new URL(name, root));
const hash = value => createHash('sha256').update(value).digest('hex');
const built = buildSopRowDeletionCandidate(read);
const sql = built.storage.toString(), manifest = JSON.parse(built.manifest);
test('generated DRAFT bytes bind frozen predecessors without inventing a formal version', () => {
  for (const [name, data] of [['storage.candidate.sql', built.storage], ['openapi.delta.json', built.openapiDelta], ['manifest.json', built.manifest]]) assert.deepEqual(data, read(`${CANDIDATE_DIR}/${name}`));
  assert.equal(manifest.artifacts['storage.candidate.sql'], hash(built.storage));
  for (const field of ['freezeApproved', 'exportApproved', 'intakeApproved', 'runtimeActivated', 'productionConsumerReady']) assert.equal(manifest[field], false);
  for (const field of ['formalOpenapiVersion', 'formalSchemaVersion', 'migrationId']) assert.equal(manifest[field], null);
  for (const [name, source] of Object.entries(SOURCES)) assert.throws(() => buildSopRowDeletionCandidate(file => file === source.path ? Buffer.concat([read(file), Buffer.from('\n')]) : read(file)), new RegExp(`Frozen ${name} source drift`));
});
test('SQL parser accepts complete payload and lineage capability closure', async () => {
  const parser = createRequire(import.meta.url)('@libpg-query/parser'); await parser.loadModule();
  assert.ok(parser.parseSync(sql).stmts.length > 0);
  assert.equal((sql.match(/CREATE FUNCTION /g) ?? []).length, 13);
  assert.equal((sql.match(/CREATE TABLE /g) ?? []).length, 4);
  assert.equal((sql.match(/SECURITY DEFINER SET search_path=pg_catalog/g) ?? []).length, 13);
  assert.equal((sql.match(/GRANT EXECUTE[\s\S]*?TO intake_business;/g) ?? []).length, 4);
  assert.doesNotMatch(sql, /GRANT[^;]*(?:TO PUBLIC|ALL FUNCTIONS)/);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION content_intake.read_sop_release_assets\(text,text,text\) TO intake_usage/);
});
test('wire is an explicit versioned command, not a reinterpretation of DELETE 204', () => {
  const op = JSON.parse(built.openapiDelta).proposedOperation;
  assert.equal(op.method, 'POST'); assert.equal(op.response.status, 200); assert.equal(op.response.schema, 'IntakeCandidate');
  assert.deepEqual(op.request.required, ['operationId', 'key', 'rowId']);
  assert.equal(op.failures.missingOrUnauthorized, 404); assert.equal(op.failures.changedOrPublished, 409);
});

test('payload and lineage boundary is generated as one install without widening old MIME purposes', () => {
  assert.match(sql, /purpose IN \('report','review-package'\) AND mime IN \('application/);
  assert.match(sql, /purpose='sop-media' AND bytes<=5242880/);
  assert.match(sql, /FOREIGN KEY\(payload_object_id,source_id,sha256,bytes,mime,payload_purpose\)/);
  assert.match(sql, /PRIMARY KEY\(candidate_id,candidate_version,row_id,media_object_id,ordinal\)/);
  assert.match(sql, /PRIMARY KEY\(release_id,row_id,media_object_id,ordinal\)/);
  assert.match(sql, /ON CONFLICT \(candidate_id, candidate_version, row_id, media_object_id, ordinal\)/);
  assert.match(sql, /REFERENCING NEW TABLE AS sop_new_lineage FOR EACH STATEMENT/);
  assert.match(sql, /CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON content_intake.sop_release_media/);
  assert.doesNotMatch(sql, /CASCADE|GRANT[^;]*TO intake_worker/);
});
