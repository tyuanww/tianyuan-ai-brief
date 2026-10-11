import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const CANDIDATE_DIR = 'business-docs/01-客服Agent项目/30-开发-进行中/readiness-successor-candidate';
const prior = 'business-docs/01-客服Agent项目/30-开发-进行中/content-intake-repair-successor-v1';
export const INPUTS = {
  [`${prior}/schema-v1.28.sql`]: 'c676b8a580e51f6a0cc2ce0b25919fb9aec2b5e470076461131ea233972e6c69',
  [`${prior}/openapi.v1.yaml`]: '9bc9071cb36ad75c0f0131aeb5648c477e26580579769bf1090a3e2a5f2d38b5',
  [`${CANDIDATE_DIR}/predecessor-lock.json`]: 'c9b85e65a83925c2520394b562f26f8e07a6d2e7f1d5b91b62e8a07dd4d41c0d',
};
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const FUNCTIONS = ['candidate_format_guard()', 'input_format_matches(text,text,text,text,text)',
  'input_object_format_guard()', 'parse_format_guard()', 'source_format_guard()'].map(name => `content_intake.${name}`);
export const PREDICATE_ROLES = ['intake_business', 'intake_worker', 'intake_runtime_fn_owner'];
export const PROPOSAL = { openapi: '1.24.0', schema: '1.29', migration: '0041', exportProfile: 'content-intake-readiness-successor-v1' };
const json = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);

/** DRAFT only. Frozen predecessor bytes are captured once; no export or runtime input discovery. */
export function buildReadinessSuccessor(read) {
  const inputs = new Map(Object.entries(INPUTS).map(([name, expected]) => {
    const bytes = Buffer.from(read(name));
    assert.equal(sha256(bytes), expected, `READINESS_INPUT_DRIFT: ${name}`);
    return [name, bytes];
  }));
  const lock = JSON.parse(inputs.get(`${CANDIDATE_DIR}/predecessor-lock.json`));
  assert.equal(lock.migrations.length, 40);
  const receipts = lock.migrations.map(m => `(${m.position},'${m.id}','${m.sha256}')`).join(',\n');
  // Keep the current release/procedure implementation untouched. Trigger functions
  // remain installed; only their nested pure predicate needs explicit caller ACL.
  const delta = Buffer.from(`-- DRAFT schema.v1.29; requires the exact installed 0001–0040 closure and caller-owned transaction.
-- No receipt is issued here. The future approved migration runner owns install/receipt/COMMIT.
DO $readiness$ BEGIN
  IF (SELECT count(*) FROM customer_agent_meta.schema_migrations) <> 40 OR EXISTS (
    SELECT 1 FROM (VALUES ${receipts}) expected(position,id,hash)
    LEFT JOIN customer_agent_meta.schema_migrations actual ON actual.position=expected.position
    WHERE actual.migration_id IS DISTINCT FROM expected.id OR actual.migration_sha256 IS DISTINCT FROM expected.hash
  ) THEN RAISE EXCEPTION 'READINESS_PREDECESSOR_RECEIPTS_MISMATCH'; END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_roles WHERE rolname IN ('intake_business','intake_worker','intake_runtime_fn_owner')
      AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls) <> 3 THEN
    RAISE EXCEPTION 'READINESS_ROLE_BOUNDARY_MISMATCH'; END IF;
END $readiness$;
REVOKE ALL ON FUNCTION ${FUNCTIONS.join(',\n  ')} FROM PUBLIC;
GRANT EXECUTE ON FUNCTION content_intake.input_format_matches(text,text,text,text,text)
  TO ${PREDICATE_ROLES.join(', ')};
COMMENT ON SCHEMA public IS 'CS-AI-C11 schema.v1.29; content-intake readiness successor; runtime activation and production NOT_CERTIFIED';
`);
  const separator = Buffer.from('\n-- EXACT schema.v1.28 predecessor above; DRAFT schema.v1.29 delta below.\n');
  const files = new Map([
    ['openapi.candidate.yaml', inputs.get(`${prior}/openapi.v1.yaml`)],
    ['schema.candidate.sql', Buffer.concat([inputs.get(`${prior}/schema-v1.28.sql`), separator, delta])],
    ['upgrade.candidate.sql', delta],
  ]);
  // Keep full reference artifacts reviewable in governance. A future compact
  // product bundle must verify and reuse the already consumed predecessor bytes,
  // rather than storing another identical OpenAPI and cumulative schema copy.
  files.set('assembly.candidate.json', json({ schema: 'readiness-successor-assembly-proposal/v1', status: 'DRAFT',
    predecessorContractSetId: lock.contractSetId,
    predecessorArtifacts: {
      openapi: { file: 'openapi.v1.yaml', sha256: INPUTS[`${prior}/openapi.v1.yaml`] },
      database: { file: 'schema-v1.28.sql', sha256: INPUTS[`${prior}/schema-v1.28.sql`] },
    },
    composition: {
      openapi: { operation: 'exact-reuse', predecessor: 'openapi', sha256: sha256(files.get('openapi.candidate.yaml')) },
      database: { operation: 'concat', predecessor: 'database', separatorUtf8: separator.toString(),
        delta: 'upgrade.candidate.sql', deltaSha256: sha256(delta), sha256: sha256(files.get('schema.candidate.sql')) },
    },
    retainInProduct: ['upgrade.candidate.sql', 'assembly.candidate.json', 'installation.candidate.json', 'manifest.json', 'predecessor-lock.json'],
    consumerRequirements: ['Only the fixed predecessor contract ID and closed artifact names; no caller paths, symlinks or network fallback.',
      'Verify predecessor export provenance and every reused hash, then verify reconstructed result before codegen, migration generation or runtime startup.',
      'Missing or changed predecessor, composition or delta fails closed. Full reference artifacts remain in governance; consumer support is not implemented by this proposal.'],
  }));
  const installation = { schema: 'readiness-successor-installation/v1', status: 'DRAFT', approved: false,
    proposal: PROPOSAL, predecessor: { contractSetId: lock.contractSetId, migrationCount: 40, newDatabaseBootstrap: false },
    order: ['BEGIN with existing migration-runner lock', 'verify exact predecessor receipts and role boundary', 'upgrade.candidate.sql',
      'verify strict runtime ACL using proposed schema provenance and record migration receipt', 'COMMIT'],
    failure: 'Failure before COMMIT rolls back ACL, marker and receipt together. Unknown COMMIT requires receipt recovery, not blind reapply.',
    aclDelta: { revokePublicExecute: FUNCTIONS, grantPredicateExecute: PREDICATE_ROLES, applicationTableGrants: [], newRoles: [], newFunctionBodies: [] },
    versionMarker: 'CS-AI-C11 schema.v1.29;',
    compatibility: 'HTTP/OpenAPI bytes and business semantics unchanged. app_runtime receives no new privileges. No production activation.',
  };
  files.set('installation.candidate.json', json(installation));
  files.set('manifest.json', json({ schema: 'readiness-successor-review-candidate/v1', status: 'DRAFT', proposedVersions: PROPOSAL,
    formalVersionAssigned: false, freezeApproved: false, exportApproved: false, intakeApproved: false,
    productionConsumerReady: false, runtimeActivated: false, syntheticOnly: true, inputs: INPUTS,
    artifacts: Object.fromEntries([...files].map(([name, bytes]) => [name, { sha256: sha256(bytes), bytes: bytes.length }])),
    remainingApprovals: ['Approve exact proposed version/profile and artifact hashes before freeze/export/intake.',
      'Run release gate and formal installer verification on the approved artifacts. Candidate tests do not activate production.'],
  }));
  return files;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2]; assert.ok(['--write', '--check'].includes(mode)); assert.equal(process.argv.length, 3);
  const root = fileURLToPath(new URL('../../', import.meta.url));
  for (const [name, bytes] of buildReadinessSuccessor(name => readFileSync(path.join(root, name)))) {
    const target = path.join(root, CANDIDATE_DIR, name);
    if (mode === '--check') assert.deepEqual(readFileSync(target), bytes, `Candidate drift: ${name}`);
    else writeFileSync(target, bytes);
  }
  console.log(`DRAFT readiness successor ${mode.slice(2)}; no freeze/export/intake.`);
}
