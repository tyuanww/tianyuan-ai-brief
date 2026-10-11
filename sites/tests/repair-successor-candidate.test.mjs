import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { buildRepairSuccessor, CANDIDATE_DIR, parseFrozenOpenapi, sha256 } from '../../business-docs/08-工具/build_customer_agent_repair_successor_candidate.mjs';
const root = new URL('../../', import.meta.url);
const read = name => readFileSync(new URL(name, root));
const files = buildRepairSuccessor(read, parseFrozenOpenapi);
const manifest = JSON.parse(files.get('manifest.json'));
const doc = JSON.parse(files.get('openapi.candidate.json'));

test('complete successor artifacts are reproducible, retain exact predecessor segments and closed approval gates', () => {
  for (const [name, bytes] of files) {
    assert.deepEqual(read(`${CANDIDATE_DIR}/${name}`), bytes);
    if (name !== 'manifest.json') assert.equal(sha256(bytes), manifest.artifacts[name].sha256);
  }
  for (const field of ['freezeApproved','exportApproved','intakeApproved','productionConsumerReady','runtimeActivated','formalVersionAssigned']) assert.equal(manifest[field],false);
  const schema = files.get('schema.candidate.sql');
  for (const file of ['schema.v1.26.sql','schema.v1.27.sql']) assert.ok(schema.includes(read(`business-docs/01-客服Agent项目/30-开发-进行中/${file}`)));
  for (const [name, hash] of Object.entries(manifest.inputs)) assert.equal(sha256(read(name)), hash);
  assert.throws(() => buildRepairSuccessor(name => name.endsWith('predecessor-lock.json') ? Buffer.concat([read(name),Buffer.from(' ')]) : read(name), parseFrozenOpenapi), /lock drift/);
});

test('complete OpenAPI resolves every local reference and keeps owner HTTP and nullable metric semantics', () => {
  const resolve = ref => ref.slice(2).split('/').reduce((v,k)=>v[k.replaceAll('~1','/').replaceAll('~0','~')],doc);
  const visit = value => { if (!value || typeof value !== 'object') return; if (value.$ref) { assert.ok(value.$ref.startsWith('#/')); assert.ok(resolve(value.$ref),value.$ref); } for(const item of Object.values(value)) visit(item); };
  visit(doc);
  const route=doc.paths['/v1/content/publish'].post;
  assert.deepEqual(route['x-required-roles'],['coach','owner']);
  assert.deepEqual(route['x-current-http-runtime-profile'].roles,['owner']);
  assert.equal(route['x-current-http-runtime-profile'].coachHttpEnabled,false);
  const Ajv=createRequire(import.meta.url)('ajv/dist/2020').default;
  const ajv=new Ajv({strict:false,validateFormats:false});
  const validate=ajv.compile({components:{schemas:{PushMethod:doc.components.schemas.PushMethod}},...doc.components.schemas.MetricsStreamItem.properties.push_method});
  for(const value of [null,'clipboard','autofill','failed','pending'])assert.ok(validate(value));
  for(const value of ['sent',0,false,{},[]])assert.equal(validate(value),false);
});

test('row command rejects unknown fields, retains DELETE and returns full candidate with explicit unknown-commit recovery', () => {
  const post=doc.paths['/v1/intake/sop/candidates/{candidateId}/versions/{version}/row-deletions'].post;
  assert.equal(post.requestBody.content['application/json'].schema.additionalProperties,false);
  assert.deepEqual(post.requestBody.content['application/json'].schema.required,['operationId','key','rowId']);
  assert.equal(post.responses['200'].content['application/json'].schema.$ref,'#/components/schemas/IntakeCandidate');
  assert.match(post.responses['409'].description,/COMMIT_UNKNOWN/);
  const original=parseFrozenOpenapi(read('business-docs/01-客服Agent项目/30-开发-进行中/openapi.v1.23.yaml'));
  for(const [name, route] of Object.entries(original.paths)) if(name.includes('/sop/')&&route.delete)assert.deepEqual(doc.paths[name],route);
});

test('upgrade SQL parses and installs only the unchanged approved-scope candidate functions and narrow ACL', async () => {
  const parser=createRequire(import.meta.url)('@libpg-query/parser');await parser.loadModule();
  const sql=files.get('upgrade.candidate.sql').toString();assert.ok(parser.parseSync(sql).stmts.length>0);
  assert.match(sql,/REPAIR_PREDECESSOR_RECEIPTS_MISMATCH/);
  assert.match(sql,/REPAIR_ROLE_BOUNDARY_MISMATCH/);
  assert.ok(files.get('upgrade.candidate.sql').includes(read('business-docs/01-客服Agent项目/30-开发-进行中/publication-compatibility-candidate/publisher.candidate.sql')));
  assert.ok(files.get('upgrade.candidate.sql').includes(read('business-docs/01-客服Agent项目/30-开发-进行中/sop-row-deletion-candidate/storage.candidate.sql')));
  assert.doesNotMatch(sql,/GRANT[^;]*(?:TO PUBLIC|ALL FUNCTIONS)/);
  const usageGrants=sql.match(/GRANT EXECUTE[^;]*TO intake_usage/g)??[];
  assert.deepEqual(usageGrants,['GRANT EXECUTE ON FUNCTION content_intake.read_sop_release_assets(text,text,text) TO intake_usage']);
  assert.equal((sql.match(/GRANT EXECUTE[^;]*TO intake_business/g)??[]).length,4);
  assert.ok(doc['x-trusted-sop-parser-stage'].media.itemFields.includes('payloadObjectId'));
});

test('generation pins one immutable snapshot per input despite a drifting reader or reused mutable buffers', () => {
  const calls=new Map();
  const once=name=>{
    const count=(calls.get(name)??0)+1;calls.set(name,count);
    return count===1 ? read(name) : Buffer.from('changed after verification');
  };
  const pinned=buildRepairSuccessor(once,parseFrozenOpenapi);
  assert.deepEqual(pinned,files);
  assert.ok([...calls.values()].every(count=>count===1),'Every input is read exactly once');
  const returned=[];
  const reuseBuffer=name=>{
    // Simulate a provider reusing/mutating its previous buffers during the next read.
    for(const bytes of returned)bytes.fill(0);
    const bytes=read(name);returned.push(bytes);return bytes;
  };
  assert.deepEqual(buildRepairSuccessor(reuseBuffer,parseFrozenOpenapi),files);
});

test('trusted parser contract exposes one atomic freeze and explicit fresh/inherited provenance', () => {
  const doc=JSON.parse(files.get('openapi.candidate.json'));
  const stage=doc['x-trusted-sop-parser-stage'];
  assert.equal(stage.function,'content_intake.freeze_sop_parsed_candidate(text,text,jsonb,jsonb,jsonb)');
  assert.equal(stage.readInheritanceFunction,'content_intake.read_sop_inherited_assets(text,text)');
  assert.ok(stage.media.required.includes('freshRowIds'));
  assert.ok(stage.media.required.includes('contentVersion'));
  assert.equal(stage.media.contentVersion.additionalProperties,false);
  assert.deepEqual(stage.media.contentVersion.properties.kind.enum,['declared','sha256']);
  assert.match(stage.lifecycle,/immutable deletion events/);
  assert.equal(stage.media.additionalProperties,false);
  const installation=JSON.parse(files.get('installation.candidate.json'));
  assert.equal(installation.aclDelta.grantExecuteToBusiness.length,7);
  assert.deepEqual(installation.aclDelta.grantExecuteToUsage,['content_intake.read_sop_release_assets(text,text,text)']);
  assert.ok(installation.aclDelta.revokeFromBusiness.includes('content_intake.stage_sop_candidate_assets(text,text,bigint,jsonb,jsonb)'));
  assert.equal(installation.aclDelta.applicationTableGrants.length,0);
});
