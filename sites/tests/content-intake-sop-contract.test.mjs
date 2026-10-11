import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { buildSopContractFiles, SOP_GENERATION, SOP_PATHS } from '../../business-docs/08-工具/build_customer_agent_sop_contract.mjs';

const root = new URL('../../', import.meta.url);
const read = file => readFileSync(new URL(file, root));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const generated = buildSopContractFiles(read);

test('SOP generator is reproducible and appends the frozen schema predecessor', () => {
  assert.ok(generated.openapi.equals(read(SOP_PATHS.openapi)));
  assert.ok(generated.database.equals(read(SOP_PATHS.database)));
  const predecessor = read(SOP_PATHS.predecessorDatabase);
  assert.ok(generated.database.includes(predecessor));
  assert.match(generated.openapi.toString(), /version: 1\.23\.0/);
  assert.equal(SOP_GENERATION.openapiVersion, '1.23.0');
  assert.equal(SOP_GENERATION.schemaVersion, '1.26');
  assert.match(SOP_GENERATION.description, /0036/);
  assert.doesNotMatch(generated.openapi.toString(), /0036/);
  assert.doesNotMatch(generated.database.toString(), /0036/);
  assert.equal(sha256(predecessor), '0620ee58a19543736f58b8dcf54ad5a2d0865cd48a74e24a245bbb384f1b7998');
});

test('SOP OpenAPI records the selected rollback and retention contract', () => {
  const openapi = generated.openapi.toString();
  for (const marker of ['SCOPE_DENIED', '404', '整单不撤', '整单', 'NOT_FOUND', '整次上传', '一条条删', '不设自动到期', '永久 URL', 'productionConsumerReady']) assert.match(openapi, new RegExp(marker));
  assert.match(openapi, /"403":\{"description":"顶层 code 为 FORBIDDEN，details\.reason 为 SCOPE_DENIED/);
  assert.match(openapi, /"404":\{"description":"顶层 code 为 NOT_FOUND/);
  assert.match(openapi, /#\/components\/schemas\/IntakeError/);
  assert.doesNotMatch(openapi, /SopError/);
  assert.match(openapi, /deleteUnusedSopUpload/);
  for (const sheet of SOP_GENERATION.sheets) assert.match(openapi, new RegExp(sheet));
  assert.match(openapi, /"runtime_activated":false/);
  assert.match(openapi, /"syntheticOnly":true/);
  assert.doesNotMatch(openapi, /SRC-LOCAL-04|s3:\/\/|oss\.|BEGIN PRIVATE KEY/);
});

test('SOP schema adds exactly three owned tables with public access revoked and no application grants', () => {
  const sql = generated.database.toString();
  const appended = sql.slice(sql.indexOf('-- BEGIN SOP MEDIA CONTRACT'));
  assert.equal((appended.match(/CREATE TABLE content_intake\.sop_/g) ?? []).length, 3);
  for (const table of ['sop_media_objects', 'sop_candidate_media', 'sop_release_media']) {
    assert.match(appended, new RegExp(`ALTER TABLE content_intake\\.${table} OWNER TO intake_runtime_fn_owner;`));
    assert.match(appended, new RegExp(`REVOKE ALL ON TABLE content_intake\\.${table} FROM PUBLIC;`));
  }
  assert.doesNotMatch(appended, /\bGRANT\b/);
  assert.doesNotMatch(appended, /CREATE ROLE|CREATE USER|SRC-LOCAL-04/);
  assert.match(appended, /state='discarded' AND adopted_at IS NULL/);
  assert.match(appended, /过敏流程SOP/);
  assert.match(appended, /history.*permanent|历史永久保留/);
  assert.match(appended, /不设自动到期/);
});

test('generator rejects predecessor drift and never reads the candidate delta', () => {
  const requested = [];
  assert.throws(() => buildSopContractFiles(file => {
    requested.push(file);
    const value = read(file);
    return file === SOP_PATHS.predecessorOpenapi ? Buffer.concat([value, Buffer.from('\n')]) : value;
  }), /Frozen OpenAPI/);
  assert.equal(requested[0], SOP_PATHS.predecessorOpenapi);
  assert.equal(requested.some(file => file.includes('content-intake-sop-candidate')), false);
});
