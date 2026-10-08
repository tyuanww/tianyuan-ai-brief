import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { assertIntakeLegacyCheckExportGate } from '../../business-docs/08-工具/export_customer_agent_contract_set.mjs';
import { buildRuntimeClosure, CLOSURE_PATHS } from '../../business-docs/08-工具/build_customer_agent_runtime_closure.mjs';

const read = file => readFileSync(new URL('../../' + file, import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const development = 'business-docs/01-客服Agent项目/30-开发-进行中';
const generated = buildRuntimeClosure(read);
const manifest = JSON.parse(generated.manifest);
const delta = read(CLOSURE_PATHS.delta);

test('approved closure is reproducible and preserves raw DRAFT metadata and frozen predecessor', () => {
  for (const [name, bytes] of Object.entries(generated)) assert.ok(bytes.equals(read(CLOSURE_PATHS[name])));
  const predecessor = read(manifest.predecessor.path);
  const prefix = Buffer.from('-- schema.v1.25 — DRAFT legacy CHECK execution closure; immutable v1.24 follows\n');
  assert.ok(generated.database.subarray(prefix.length, prefix.length + predecessor.length).equals(predecessor));
  assert.equal(generated.database.subarray(prefix.length + predecessor.length).toString(),
    `\n-- BEGIN INTAKE LEGACY CHECK ACL ${sha(delta)}\n${delta}-- END INTAKE LEGACY CHECK ACL\n`);
  assert.equal(manifest.database.sha256, sha(generated.database));
  assert.doesNotThrow(() => assertIntakeLegacyCheckExportGate(read, { databaseHash: sha(generated.database), openapiHash: manifest.openapi.sha256 }));
  assert.equal(manifest.status, 'DRAFT');
  for (const flag of ['freezeApproved', 'exportApproved', 'runtimeActivated', 'loginRoleGrants', 'tablePrivileges', 'membershipChanges', 'functionBodyChanges']) assert.equal(manifest[flag], false);
  assert.equal(manifest.referenceMode.runtimeReady, false);
  assert.equal(manifest.referenceMode.includesProductFunctionBodies, false);
  assert.equal(manifest.productOrder[0], 'verified-v1.24-product-migrations-and-complete-runtime-ACL');
  assert.equal(JSON.parse(read(`${development}/contract-profile.v1.json`)).profile, 'content-intake-legacy-check-v1');
});

test('generator rejects any drift in the approved predecessor and every dependency', () => {
  for (const file of [manifest.predecessor.path, manifest.openapi.path, manifest.predecessor.installation,
    ...Object.values(manifest.dependencies).map(dependency => dependency.path)]) {
    assert.throws(() => buildRuntimeClosure(source => source === file ? Buffer.concat([read(source), Buffer.from('\n')]) : read(source)), /Frozen .*drift/);
  }
});

test('the only appended SQL statement is eight exact EXECUTE grants to the NOLOGIN function owner', async () => {
  const parser = createRequire(import.meta.url)('@libpg-query/parser');
  await parser.loadModule();
  const parsed = parser.parseSync(delta.toString());
  assert.equal(parsed.stmts.length, 1);
  const grant = parsed.stmts[0].stmt.GrantStmt;
  assert.ok(grant);
  assert.equal(grant.is_grant, true);
  assert.equal(grant.objtype, 'OBJECT_FUNCTION');
  assert.equal(grant.objects.length, 8);
  assert.deepEqual(grant.privileges.map(item => item.AccessPriv.priv_name), ['execute']);
  assert.deepEqual(grant.grantees.map(item => item.RoleSpec.rolename), ['intake_runtime_fn_owner']);
  assert.equal(grant.grant_option ?? false, false);
  const names = grant.objects.map(item => item.ObjectWithArgs.objname.map(part => part.String.sval).join('.')).sort();
  assert.deepEqual(names, ['content_template_placeholders_are_valid', 'content_text_array_is_nonblank_unique',
    'content_questions_align_intent', 'content_questions_are_valid', 'content_question_hash', 'content_utc_timestamp_text',
    'content_risk_categories_are_valid', 'owner_acceptance_review_shape'].map(name => 'public.' + name).sort());
  assert.equal(parser.parseSync(generated.database.toString()).stmts.length,
    parser.parseSync(read(manifest.predecessor.path).toString()).stmts.length + 1);
});
