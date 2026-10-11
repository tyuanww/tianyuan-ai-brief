import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const development = 'business-docs/01-客服Agent项目/30-开发-进行中';
export const CANDIDATE_DIR = `${development}/sop-row-deletion-candidate`;
export const SOURCES = {
  schema: { path: `${development}/schema.v1.27.sql`, sha256: 'ad80e456ff1dd26017e893dd211e84ff6a7e9032bb029811d49ac3df36b9aa85' },
  openapi: { path: `${development}/openapi.v1.23.yaml`, sha256: '82443864e4459af4a9575b304ccecfcbb2cbb4e3c1f08cff13bd512616fe54b0' },
};
const hash = value => createHash('sha256').update(value).digest('hex');
const json = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
export function buildSopRowDeletionCandidate(read) {
  for (const [name, input] of Object.entries(SOURCES)) assert.equal(hash(read(input.path)), input.sha256, `Frozen ${name} source drift`);
  const original = read(SOURCES.schema.path).toString();
  const prior = original.match(/CREATE (?:OR REPLACE )?FUNCTION content_intake\.delete_unused_sop_row\([\s\S]*?AS \$\$([\s\S]*?)\$\$;/);
  assert.ok(prior, 'Missing predecessor function');
  const source = read(`${CANDIDATE_DIR}/storage.source.sql`);
  const oldStage = original.match(/CREATE FUNCTION content_intake\.stage_sop_candidate_media\([\s\S]*?AS \$\$([\s\S]*?)\$\$;/);
  assert.ok(oldStage, 'Missing predecessor stage');
  const conflict = 'ON CONFLICT (candidate_id, candidate_version, media_object_id, ordinal)';
  assert.equal(oldStage[0].split(conflict).length, 2, 'Predecessor stage conflict anchor');
  const newStage = oldStage[0].replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION').replace(conflict, 'ON CONFLICT (candidate_id, candidate_version, row_id, media_object_id, ordinal)');
  const storage = Buffer.from(`-- GENERATED DRAFT. Caller must own the installation transaction. No official migration number.
DO $precondition$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc WHERE oid=to_regprocedure('content_intake.delete_unused_sop_row(content_intake.identifier,content_intake.version,text)')
    AND encode(public.digest(prosrc,'sha256'),'hex')='${hash(prior[1])}') THEN
    RAISE EXCEPTION 'SOP_ROW_DELETION_PREDECESSOR_MISMATCH';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc WHERE oid=to_regprocedure('content_intake.stage_sop_candidate_media(content_intake.identifier,content_intake.version,content_intake.identifier,content_intake.identifier,content_intake.identifier,content_intake.sha256,bigint,text,text,integer,integer,integer)')
    AND encode(public.digest(prosrc,'sha256'),'hex')='${hash(oldStage[1])}') THEN
    RAISE EXCEPTION 'SOP_STAGE_PREDECESSOR_MISMATCH';
  END IF;
END;
$precondition$;
\n${source}\n-- Preserve the old stage signature and ACL while matching the successor row key.\n${newStage}\n`);
  // A new command avoids reinterpreting the already-consumed media-only DELETE/204 wire.
  const openapiDelta = json({ status: 'DRAFT', formalVersion: null, predecessor: SOURCES.openapi,
    proposedOperation: { method: 'POST', path: '/v1/intake/sop/candidates/{candidateId}/versions/{version}/row-deletions',
      actor: 'authenticated product session, never body principal',
      request: { required: ['operationId', 'key', 'rowId'], additionalProperties: false,
        properties: { operationId: { $ref: '#/components/schemas/IntakeId' }, key: { $ref: '#/components/schemas/IntakeCandidateKey' },
          rowId: { type: 'string', pattern: '^sop:[^:]{1,128}:[1-9][0-9]{0,3}$' } } },
      response: { status: 200, schema: 'IntakeCandidate', emptyResult: 'cancelled original candidate; never an empty publishable catalog' },
      permission: 'candidate-cancel, current tenant/app/source and four-role ceiling; import separately required for trusted row binding',
      replay: 'same actor/operation/body returns durable response; changed body conflicts; COMMIT_UNKNOWN preserves preview until replay',
      failures: { missingOrUnauthorized: 404, changedOrPublished: 409, malformed: 400 },
      oldDelete: 'unchanged and not granted to intake_business; successor consumer must migrate explicitly' },
    trustedParserStage: { function: 'freeze_sop_parsed_candidate(text,text,jsonb,jsonb,jsonb)', read: 'read_sop_inherited_assets(text,text)', validatedRecovery: 'frozenMedia exposes only job result exact row/media payload descriptors; validated jobs also expose own pendingPayloads for guarded redundant-payload cleanup; original freeze state/material/registration digest checks still apply', authority: 'current import; actor and job bound; complete material/row/media registration in one transaction', internalOnly: ['register_sop_candidate_rows', 'stage_sop_candidate_assets', 'stage_sop_candidate_media', 'sop_payload_transition', 'adopt_sop_payloads'], payloadCapabilities: ['reserve_sop_media_payload(text,text,text,text,bigint,text)', 'complete_sop_media_payload(text,text,text,text)', 'begin_sop_media_release(text,text,text,text)', 'complete_sop_media_release(text,text,text,text)'], usageRead: 'read_sop_release_assets(text,text,text)', publication: 'AFTER INSERT statement projection on release_lineage; exact row mapping and persisted payload required; immutable release media', mediaItemRequired: 'payloadObjectId', payloadPurpose: 'sop-media', byteTrust: 'Server parser validates actual bytes; SQL validates source, version, metadata hashes and complete row provenance; no arbitrary HTTP material input' },
    invariants: ['immutable old material', 'new version resets source evidence and quality', 'published/history/adopted rows cannot be removed',
      'only exclusive unused media is discarded; shared media survives', 'last unused row cancels upload',
      'unbound old candidates fail closed and require reimport', 'same content version never restores deleted rows; new version reuse preserves immutable deletion history', 'no automatic expiry or physical object deletion'] });
  const manifest = json({ schema: 'sop-row-deletion-candidate/v1', status: 'DRAFT', formalOpenapiVersion: null, formalSchemaVersion: null,
    migrationId: null, freezeApproved: false, exportApproved: false, intakeApproved: false, runtimeActivated: false,
    productionConsumerReady: false, syntheticOnly: true, inputs: { ...SOURCES, source: { path: `${CANDIDATE_DIR}/storage.source.sql`, sha256: hash(source) } },
    artifacts: { 'storage.candidate.sql': hash(storage), 'openapi.delta.json': hash(openapiDelta) } });
  return { storage, openapiDelta, manifest };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const read = name => readFileSync(path.join(root, name));
  const built = buildSopRowDeletionCandidate(read);
  for (const [name, bytes] of [['storage.candidate.sql', built.storage], ['openapi.delta.json', built.openapiDelta], ['manifest.json', built.manifest]]) {
    const dest = path.join(root, CANDIDATE_DIR, name);
    if (process.argv.includes('--check')) assert.deepEqual(readFileSync(dest), bytes, `Generated drift: ${name}`);
    else writeFileSync(dest, bytes);
  }
}
