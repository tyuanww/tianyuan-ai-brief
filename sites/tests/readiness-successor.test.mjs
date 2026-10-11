import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { buildReadinessSuccessor, CANDIDATE_DIR, INPUTS, sha256 } from '../../business-docs/08-工具/build_customer_agent_readiness_successor.mjs';
const read = name => readFileSync(new URL(`../../${name}`, import.meta.url));
test('candidate is deterministic, preserves frozen bytes and changes only ACL/marker', () => {
  const files = buildReadinessSuccessor(read);
  for (const [name, bytes] of files) assert.deepEqual(read(`${CANDIDATE_DIR}/${name}`), bytes);
  const [schema, openapi] = Object.keys(INPUTS);
  assert.deepEqual(files.get('schema.candidate.sql').subarray(0, read(schema).length), read(schema));
  assert.deepEqual(files.get('openapi.candidate.yaml'), read(openapi));
  const sql = files.get('upgrade.candidate.sql').toString();
  assert.doesNotMatch(sql, /CREATE |ALTER |DROP |GRANT .* TO PUBLIC|GRANT .* TO app_runtime/i);
  assert.match(sql, /schema\.v1\.29;/);
  const manifest = JSON.parse(files.get('manifest.json'));
  assert.deepEqual(manifest.proposedVersions, { openapi:'1.24.0',schema:'1.29',migration:'0041',exportProfile:'content-intake-readiness-successor-v1' });
  for (const key of ['formalVersionAssigned','freezeApproved','exportApproved','intakeApproved','productionConsumerReady','runtimeActivated']) assert.equal(manifest[key],false);
  for (const [name, artifact] of Object.entries(manifest.artifacts)) assert.equal(sha256(files.get(name)), artifact.sha256);
});
for (const changed of Object.keys(INPUTS)) test(`rejects changed frozen input: ${changed}`, () => {
  assert.throws(() => buildReadinessSuccessor(name => name === changed ? Buffer.concat([read(name),Buffer.from(' ')]) : read(name)), /READINESS_INPUT_DRIFT/);
});

test('compact proposal reconstructs exact reference bytes and rejects any changed delta by hash', () => {
  const files = buildReadinessSuccessor(read);
  const assembly = JSON.parse(files.get('assembly.candidate.json'));
  const [schema,openapi] = Object.keys(INPUTS);
  const spec = assembly.composition.database;
  const compose = delta => {
    assert.equal(sha256(delta),spec.deltaSha256);
    const prior = read(schema); assert.equal(sha256(prior),assembly.predecessorArtifacts.database.sha256);
    const result = Buffer.concat([prior,Buffer.from(spec.separatorUtf8),delta]);
    assert.equal(sha256(result),spec.sha256); return result;
  };
  assert.deepEqual(compose(files.get(spec.delta)),files.get('schema.candidate.sql'));
  assert.equal(sha256(read(openapi)),assembly.composition.openapi.sha256);
  assert.throws(()=>compose(Buffer.concat([files.get(spec.delta),Buffer.from(' ')])));
  // Conservative allocation for the five proposal members, excluding future
  // export signatures/receipts. This is not a claim about an unbuilt exporter.
  const bytes = assembly.retainInProduct.reduce((n,name)=>n+Math.ceil((files.get(name) ?? read(`${CANDIDATE_DIR}/${name}`)).length/4096)*4096,0);
  assert.ok(bytes < 64*1024);
});
