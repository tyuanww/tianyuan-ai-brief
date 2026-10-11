import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const development = 'business-docs/01-客服Agent项目/30-开发-进行中';
export const CANDIDATE_DIR = `${development}/publication-compatibility-candidate`;
export const SOURCES = Object.freeze({
  owner: { path: `${development}/owner-acceptance.publish.v1.sql`, sha256: 'e2d92ff440e333b066a638accf6ca0942de21415832b92a24dc172a123174edd' },
  coach: { path: `${development}/coach-publish-candidate/storage.delta.sql`, sha256: '2bb50cabc8b7ce0fd77c25c0800c35c17b4bfaa3419f7a140d70719ac2ba5847' },
  openapi: { path: `${development}/openapi.v1.23.yaml`, sha256: '82443864e4459af4a9575b304ccecfcbb2cbb4e3c1f08cff13bd512616fe54b0' },
  database: { path: `${development}/schema.v1.26.sql`, sha256: '1c0a4e508ea0aab97d40abff4829ea5a0ce65882ad6a044187fc231872bbe39c' },
  overlay: { path: `${development}/schema.v1.27.sql`, sha256: 'ad80e456ff1dd26017e893dd211e84ff6a7e9032bb029811d49ac3df36b9aa85' },
});
const hash = value => createHash('sha256').update(value).digest('hex');
const json = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const lock = "  v_got := pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtext('cs_ai_content_publish'));";
const result = '  release_id := v_release_id;';
const fence = '  PERFORM content_intake.guard_legacy_write(p_import_batch_id,NULL);\n';
const inherit = '  PERFORM content_intake.inherit_legacy_catalog(v_prev,v_release_id);\n';
const roleStart = '  -- p_actor_role is a server-verified end-user claim';
const roleEnd = "  IF p_import_batch_id IS NULL OR pg_catalog.btrim(p_import_batch_id) = '' THEN";

function replaceOnce(text, from, to) {
  assert.equal(text.split(from).length, 2, `Non-unique candidate anchor: ${from}`);
  return text.replace(from, to);
}
function publisher(text) {
  const found = text.match(/CREATE OR REPLACE FUNCTION publish_content_release\([\s\S]*?AS \$\$[\s\S]*?\$\$;/g);
  assert.equal(found?.length, 1, 'Expected one canonical publisher');
  return found[0];
}
function body(sql) {
  return sql.slice(sql.indexOf('AS $$') + 5, sql.lastIndexOf('$$;'));
}
function roleGuard(sql) {
  const start = sql.indexOf(roleStart);
  const end = sql.indexOf(roleEnd);
  assert.ok(start >= 0 && end > start, 'Missing role policy boundary');
  return sql.slice(start, end);
}

/** Proposal only: no official version, export profile, runtime wiring or role grant.
 * Source hashes bind historical intent without rewriting any frozen predecessor.
 * SQL uses already-installed product fence helpers; this is not a standalone schema. */
export function buildPublicationCompatibilityCandidate(readSource) {
  const source = Object.fromEntries(Object.entries(SOURCES).map(([key, entry]) => {
    const bytes = readSource(entry.path);
    assert.equal(hash(bytes), entry.sha256, `Frozen ${key} source drift`);
    return [key, bytes.toString('utf8')];
  }));
  const oldOwner = publisher(source.owner);
  const oldCoach = publisher(source.coach);
  const currentBody = replaceOnce(replaceOnce(body(oldCoach), lock, fence + lock), result, inherit + result);
  let restored = replaceOnce(oldOwner, roleGuard(oldOwner), roleGuard(oldCoach));
  restored = replaceOnce(restored, lock, fence + lock);
  restored = replaceOnce(restored, result, inherit + result);
  restored = replaceOnce(restored, 'FUNCTION publish_content_release(', 'FUNCTION public.publish_content_release(');
  const expectedPriorBody = hash(currentBody);
  const storage = Buffer.from(`-- GENERATED DRAFT proposal. NOT FROZEN / NOT EXPORTED / NOT INTAKE.
-- No version or migration number assigned. Requires a caller-owned transaction.
-- Existing function ownership, ACL and API idempotency remain unchanged.
-- Current HTTP is owner-only; the approved SQL coach scope is preserved.
-- Does not install prerequisites or authorize a production consumer.
DO $candidate_precondition$
BEGIN
  IF to_regprocedure('content_intake.guard_legacy_write(text,text)') IS NULL
    OR to_regprocedure('content_intake.inherit_legacy_catalog(text,text)') IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc
      WHERE oid=to_regprocedure('public.publish_content_release(text,text,text,text,text)')
        AND encode(public.digest(prosrc,'sha256'),'hex')='${expectedPriorBody}'
    ) THEN
    RAISE EXCEPTION 'PUBLICATION_COMPATIBILITY_PREDECESSOR_MISMATCH';
  END IF;
END;
$candidate_precondition$;

${restored}
`);
  const openapiDelta = {
    schema: 'publication-compatibility-openapi-proposal/v1',
    status: 'DRAFT', formalVersion: null, exportProfile: null,
    predecessor: SOURCES.openapi,
    capabilityRoles: ['coach', 'owner'], httpRuntimeRoles: ['owner'],
    operations: [
      { op: 'test', path: '/info/x-phase1-invariants/ownerOnlyWrites', value: ['POST /v1/content/publish', 'POST /v1/content/rollback', 'POST /v1/policy/flags'] },
      { op: 'replace', path: '/info/x-phase1-invariants/ownerOnlyWrites', value: ['POST /v1/content/rollback', 'POST /v1/policy/flags'] },
      { op: 'test', path: '/paths/~1v1~1content~1publish/post/x-required-roles', value: ['coach', 'owner'] },
      { op: 'add', path: '/paths/~1v1~1content~1publish/post/x-current-http-runtime-profile', value: {
        roles: ['owner'], coachHttpEnabled: false,
        note: 'SQL capability keeps the approved in-scope coach branch. Current product HTTP rejects non-owner before taking the admin pool. This proposal does not activate coach HTTP.',
      } },
      { op: 'test', path: '/components/schemas/MetricsStreamItem/properties/push_method', value: { oneOf: [{ $ref: '#/components/schemas/PushMethod' }, { type: 'null' }] } },
      { op: 'replace', path: '/components/schemas/MetricsStreamItem/properties/push_method', value: { $ref: '#/components/schemas/PushMethod' } },
    ],
  };
  const manifest = {
    schema: 'publication-compatibility-proposal/v1', status: 'DRAFT',
    formalOpenapiVersion: null, formalSchemaVersion: null, migrationId: null,
    freezeApproved: false, exportApproved: false, intakeApproved: false,
    runtimeActivated: false, productionConsumerReady: false, syntheticOnly: true,
    sources: SOURCES,
    prerequisites: {
      productHead: '292221d080006a86a3b5a4a950b055cef2e94eaa',
      currentPublisherBodySha256: expectedPriorBody,
      requiredFunctions: ['content_intake.guard_legacy_write(text,text)', 'content_intake.inherit_legacy_catalog(text,text)'],
      productFenceMigration: '0022_intake_legacy_fence',
      productFenceMigrationSha256: '8df4f9127362aa49c320b87d7afffd910312d54fab7193224e3bece5993a8b03',
      installsMissingDependencies: false,
    },
    artifacts: {
      'publisher.candidate.sql': hash(storage),
      'openapi.delta.json': hash(json(openapiDelta)),
    },
    remaining: [
      'Keep PostgreSQL acceptance bound to this exact candidate and product predecessor; current bounded results and remaining conditions are recorded in README',
      'Explicit successor version, complete prerequisite/ACL closure, freeze/export and product intake approval',
      'HTTP stays owner-only; no authorization to enable coach HTTP or tighten the approved SQL role branch',
    ],
  };
  return { storage, openapiDelta: json(openapiDelta), manifest: json(manifest) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2];
  if (!['--write', '--check'].includes(mode) || process.argv.length !== 3) throw new Error('Use --write or --check');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const built = buildPublicationCompatibilityCandidate(file => readFileSync(path.join(root, file)));
  for (const [name, bytes] of Object.entries({ 'publisher.candidate.sql': built.storage, 'openapi.delta.json': built.openapiDelta, 'manifest.json': built.manifest })) {
    const file = path.join(root, CANDIDATE_DIR, name);
    if (mode === '--write') writeFileSync(file, bytes);
    else assert.ok(readFileSync(file).equals(bytes), `Candidate generation drift: ${name}`);
  }
  console.log(`Publication compatibility DRAFT ${mode.slice(2)} complete; no official version, export or runtime activation.`);
}
