import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { buildPublicationCompatibilityCandidate, CANDIDATE_DIR, SOURCES } from '../../business-docs/08-工具/build_customer_agent_publication_compatibility_candidate.mjs';

const require = createRequire(import.meta.url);
const Ajv = require('ajv/dist/2020').default;
const parser = require('@libpg-query/parser');
const root = new URL('../../', import.meta.url);
const read = name => readFileSync(new URL(name, root));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const built = buildPublicationCompatibilityCandidate(read);
const delta = JSON.parse(built.openapiDelta);
const manifest = JSON.parse(built.manifest);
const sql = built.storage.toString();
// Reuse the installed OpenAPI tool; no YAML dependency installation or source rewrite.
const originalOpenapi = JSON.parse(execFileSync(process.execPath, [
  require.resolve('@redocly/cli/bin/cli.js'), 'bundle', fileURLToPath(new URL(SOURCES.openapi.path, root)), '--ext', 'json',
], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }));

// Apply only the proposal's JSON Patch subset, checking predecessor assertions.
function applyProposal(document, operations) {
  const result = structuredClone(document);
  for (const operation of operations) {
    const parts = operation.path.slice(1).split('/').map(part => part.replaceAll('~1', '/').replaceAll('~0', '~'));
    const key = parts.pop();
    const parent = parts.reduce((node, part) => node[part], result);
    if (operation.op === 'test') assert.deepEqual(parent[key], operation.value);
    else {
      assert.ok(['replace', 'add'].includes(operation.op));
      if (operation.op === 'replace') assert.ok(Object.hasOwn(parent, key));
      parent[key] = structuredClone(operation.value);
    }
  }
  return result;
}

function validateMetricPush(doc, value) {
  const ajv = new Ajv({ strict: false, validateFormats: false });
  const validate = ajv.compile({
    components: { schemas: { PushMethod: doc.components.schemas.PushMethod } },
    ...doc.components.schemas.MetricsStreamItem.properties.push_method,
  });
  return validate(value);
}

test('DRAFT artifacts are reproducible with exact frozen inputs and no official version or activation', () => {
  assert.deepEqual(built, buildPublicationCompatibilityCandidate(read));
  assert.ok(built.storage.equals(read(`${CANDIDATE_DIR}/publisher.candidate.sql`)));
  assert.ok(built.openapiDelta.equals(read(`${CANDIDATE_DIR}/openapi.delta.json`)));
  assert.ok(built.manifest.equals(read(`${CANDIDATE_DIR}/manifest.json`)));
  assert.equal(manifest.artifacts['publisher.candidate.sql'], hash(built.storage));
  assert.equal(manifest.artifacts['openapi.delta.json'], hash(built.openapiDelta));
  for (const key of ['formalOpenapiVersion', 'formalSchemaVersion', 'migrationId']) assert.equal(manifest[key], null);
  for (const key of ['freezeApproved', 'exportApproved', 'intakeApproved', 'runtimeActivated', 'productionConsumerReady']) assert.equal(manifest[key], false);
  assert.equal(manifest.syntheticOnly, true);
  for (const [name, source] of Object.entries(SOURCES)) {
    assert.throws(() => buildPublicationCompatibilityCandidate(file => file === source.path ? Buffer.concat([read(file), Buffer.from('\n')]) : read(file)), new RegExp(`Frozen ${name} source drift`));
  }
});

test('publisher composition retains owner acceptance and tenant guards with the approved coach scope', () => {
  const owner = read(SOURCES.owner.path).toString();
  const coach = read(SOURCES.coach.path).toString();
  const functionOf = value => value.match(/CREATE OR REPLACE FUNCTION (?:public\.)?publish_content_release\([\s\S]*?AS \$\$[\s\S]*?\$\$;/)[0];
  const roleOf = value => value.slice(value.indexOf('  -- p_actor_role is a server-verified end-user claim'), value.indexOf("  IF p_import_batch_id IS NULL OR pg_catalog.btrim(p_import_batch_id) = '' THEN"));
  const generated = functionOf(sql);
  assert.equal(roleOf(generated), roleOf(functionOf(coach)), 'SQL role/scope policy must not be tightened or opened');
  const normalized = generated
    .replace('FUNCTION public.publish_content_release(', 'FUNCTION publish_content_release(')
    .replace(roleOf(generated), roleOf(functionOf(owner)))
    .replace('  PERFORM content_intake.guard_legacy_write(p_import_batch_id,NULL);\n', '')
    .replace('  PERFORM content_intake.inherit_legacy_catalog(v_prev,v_release_id);\n', '');
  assert.equal(normalized, functionOf(owner), 'Every other owner-publisher byte is preserved, not hand-reconstructed');
  assert.match(sql, /existing\.tenant_id IS DISTINCT FROM v_tenant/);
  assert.match(sql, /source\.tenant_id IS DISTINCT FROM v_tenant/);
  assert.match(sql, /WHERE sc\.tenant_id = v_tenant AND EXISTS/);
  assert.match(sql, /s\.review_mode <> 'owner_acceptance' AND s\.content_hash IS DISTINCT FROM/);
  assert.match(sql, /coalesce\(s\.script_version,1\)/);
  assert.match(sql, /owner_acceptance_record_sha256 = EXCLUDED\.owner_acceptance_record_sha256/);
  assert.ok(sql.indexOf('owner_acceptance_release_content_ready(v_release_id)') < sql.indexOf('INSERT INTO public.content_current'));
  assert.doesNotMatch(generated, /now\(\), 'default'/);
});

test('fence, inheritance, predecessor guard and security envelope stay in the candidate', async () => {
  await parser.loadModule();
  const parsed = parser.parseSync(sql);
  assert.equal(parsed.stmts.length, 2, 'Only prerequisite assertion and existing-function replacement');
  assert.match(sql, /PUBLICATION_COMPATIBILITY_PREDECESSOR_MISMATCH/);
  assert.match(sql, /SECURITY DEFINER\nSET search_path = pg_catalog, public, pg_temp/);
  assert.ok(sql.indexOf('PERFORM content_intake.guard_legacy_write') < sql.indexOf('pg_try_advisory_xact_lock'));
  assert.ok(sql.indexOf('PERFORM content_intake.inherit_legacy_catalog') < sql.indexOf('  release_id := v_release_id;'));
  assert.doesNotMatch(sql, /\b(?:GRANT|REVOKE|ALTER ROLE|CREATE ROLE|CREATE TABLE|ALTER TABLE)\b/);
  assert.equal(manifest.prerequisites.installsMissingDependencies, false);
  assert.equal(manifest.prerequisites.productFenceMigrationSha256, '8df4f9127362aa49c320b87d7afffd910312d54fab7193224e3bece5993a8b03');
});

test('OpenAPI proposal distinguishes SQL capability from the unchanged owner-only HTTP profile', () => {
  const original = structuredClone(originalOpenapi);
  const candidate = applyProposal(original, delta.operations);
  const route = candidate.paths['/v1/content/publish'].post;
  assert.deepEqual(route['x-required-roles'], ['coach', 'owner']);
  assert.deepEqual(route['x-current-http-runtime-profile'].roles, ['owner']);
  assert.equal(route['x-current-http-runtime-profile'].coachHttpEnabled, false);
  assert.deepEqual(candidate.info['x-phase1-invariants'].ownerOnlyWrites, ['POST /v1/content/rollback', 'POST /v1/policy/flags']);
  assert.deepEqual(candidate.paths['/v1/content/rollback'], original.paths['/v1/content/rollback']);
  assert.deepEqual(candidate.components.schemas.MetricsStreamItem.properties.outcome, original.components.schemas.MetricsStreamItem.properties.outcome);
  assert.equal(delta.formalVersion, null);
  assert.equal(delta.exportProfile, null);
  const drifted = structuredClone(original);
  drifted.paths['/v1/content/publish'].post['x-required-roles'] = ['owner'];
  assert.throws(() => applyProposal(drifted, delta.operations));
});

test('MetricsStreamItem push_method null is accepted exactly once, with no extra accepted values', () => {
  const original = structuredClone(originalOpenapi);
  const candidate = applyProposal(original, delta.operations);
  assert.equal(validateMetricPush(original, null), false, 'Reproduces the overlapping nullable oneOf');
  assert.equal(validateMetricPush(candidate, null), true);
  for (const value of ['clipboard', 'autofill', 'failed', 'pending']) {
    assert.equal(validateMetricPush(original, value), true);
    assert.equal(validateMetricPush(candidate, value), true);
  }
  for (const value of ['', 'sent', 0, false, {}, []]) assert.equal(validateMetricPush(candidate, value), false);
  assert.deepEqual(candidate.components.schemas.PushMethod, original.components.schemas.PushMethod);
});
