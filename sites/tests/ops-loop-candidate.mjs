import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Ajv = require('ajv/dist/2020');
const parser = require('@libpg-query/parser');
const root = new URL('../../business-docs/01-客服Agent项目/30-开发-进行中/ops-loop-candidate/', import.meta.url);
const api = JSON.parse(readFileSync(new URL('openapi.delta.json', root)));
for (const name of [
  'InaccuracyReportRequest',
  'InaccuracyReportResponse',
  'SopCatalogResponse',
  'SopNodePatch',
  'ScriptPatchRequest',
  'ScriptMutationResponse',
  'RetrievalMetrics',
  'SoftwareRelease',
]) {
  assert.equal(api.components.schemas[name].additionalProperties, false, name);
}
assert.deepEqual(api.paths['/v1/inaccuracy-reports'].post['x-required-roles'], ['agent', 'coach', 'owner']);
assert.deepEqual(api.paths['/v1/sop/catalog'].get['x-required-roles'], ['coach', 'owner']);
assert.ok(!api.paths['/v1/sop/catalog'].get['x-required-roles'].includes('agent'));
assert.equal(api.paths['/v1/sop/nodes/{node_id}'].delete['x-phase1-owner-only'], true);
assert.equal(api.paths['/v1/content/scripts/{script_id}'].patch['x-phase1-owner-only'], true);
assert.equal(api.paths['/v1/software/releases'].get['x-phase1-owner-only'], true);
assert.deepEqual(api.components.schemas.RetrievalWindow.enum, ['current_release', 'last_7d']);
assert.equal(api.components.schemas.SoftwareRelease.properties.download_url.pattern, '^https://');
assert.equal(api.paths['/v1/inaccuracy-reports'].post.operationId, 'recordInaccuracyReport');
assert.match(api.paths['/v1/software/releases'].get.description, /latest\.yml/);
assert.match(api.paths['/v1/inaccuracy-reports'].post.description, /不得自动改 Answer/);
assert.match(api.paths['/v1/inaccuracy-reports'].post.description, /禁止 \/tickets/);
assert.ok(!Object.keys(api.paths).some((route) => route.includes('ticket')));
const ajv = new Ajv({strict:false, validateFormats:false});
const doc = {$id:'urn:cs-ai:ops-loop', ...api};
ajv.addSchema(doc);
let cases=0;
const check = (name, value, expected) => { cases++; assert.equal(ajv.validate({$ref:`urn:cs-ai:ops-loop#/components/schemas/${name}`},value),expected, `${name}: ${JSON.stringify(ajv.errors)}`); };
check('InaccuracyReportRequest',{query_id:'11111111-1111-1111-1111-111111111111',script_id:'s1'},true);
check('InaccuracyReportRequest',{query_id:'11111111-1111-1111-1111-111111111111',script_id:'s1',ticket_id:'no'},false);
check('InaccuracyReportResponse',{ok:true,query_id:'11111111-1111-1111-1111-111111111111',script_id:'s1'},true);
check('InaccuracyReportResponse',{ok:true,query_id:'11111111-1111-1111-1111-111111111111',script_id:'s1',status:'已建单'},false);
check('ScriptMutationResponse',{ok:true,script_id:'s1',mutation_id:'m1',review_status:'pending_review'},true);
check('ScriptMutationResponse',{ok:true,script_id:'s1',mutation_id:'m1',review_status:'current'},false);
check('RetrievalMetrics',{no_hit_rate:0.1,copy_complete_rate:0.2,open_task_count:1,current_release_script_count:2,window:'last_7d',release_id:'rel_1'},true);
check('RetrievalMetrics',{no_hit_rate:0.1,copy_complete_rate:0.2,open_task_count:1,current_release_script_count:2,window:'yesterday',release_id:'rel_1'},false);
check('SoftwareRelease',{version:'0.3.17',platform:'mac-universal',sha256:'a'.repeat(64),download_url:'https://example.invalid/app.zip',created_at:'2026-09-21T00:00:00Z',signed:false},true);
check('SoftwareRelease',{version:'0.3.17',platform:'mac-universal',sha256:'a'.repeat(64),download_url:'http://example.invalid/app.zip',created_at:'2026-09-21T00:00:00Z',signed:false},false);
const sql=readFileSync(new URL('storage.delta.sql',root),'utf8');
await parser.loadModule();
const parsed=parser.parseSync(sql);
assert.ok(parsed.stmts.length>0);
assert.match(sql,/CREATE SCHEMA ops_loop/);
assert.match(sql,/REVOKE ALL ON ALL TABLES IN SCHEMA ops_loop FROM PUBLIC, app_runtime/);
assert.match(sql,/record_inaccuracy_report/);
assert.match(sql,/read_retrieval_metrics/);
assert.match(sql,/runtime_activated remains false/);
assert.doesNotMatch(sql,/GRANT SELECT ON ALL TABLES IN SCHEMA ops_loop TO app_runtime/);
assert.ok(cases>=8, `schema cases ${cases}`);
console.log(JSON.stringify({ok:true,cases,sqlStatements:parsed.stmts.length}));
