import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import Ajv from 'ajv/dist/2020.js';
import {buildIntakeContractFiles,buildIntakeUsageContractFiles,INTAKE_CONTRACT_PATHS,INTAKE_USAGE_CONTRACT_PATHS,INTAKE_USAGE_SOURCES} from '../../business-docs/08-工具/build_customer_agent_backend_contract.mjs';
import * as builder from '../../business-docs/08-工具/build_customer_agent_backend_contract.mjs';
import {OWNER_PROFILE_PATH,OWNER_CONTRACT_PATHS} from '../../business-docs/08-工具/build_customer_agent_owner_contract.mjs';
import {CONTRACT_SOURCE_PATHS,loadContractSetFromCommit,assertIntakeUsageExportGate} from '../../business-docs/08-工具/export_customer_agent_contract_set.mjs';
const read=file=>readFileSync(new URL(`../../${file}`,import.meta.url));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const used=new Set();
const generated=buildIntakeUsageContractFiles(file=>{used.add(file);return read(file);});
const prior=buildIntakeContractFiles(read);
const lines=generated.openapi.toString().split('\n');
const schemas=Object.fromEntries(lines.filter(line=>/^    Intake[A-Za-z0-9]+: /.test(line)).map(line=>{
  const at=line.indexOf(': ');return [line.slice(4,at),JSON.parse(line.slice(at+2))];
}));
const ajv=new Ajv({strict:true,allowUnionTypes:true});ajv.addKeyword('components');
ajv.addFormat('date-time',v=>Number.isFinite(Date.parse(v)));
ajv.addSchema({$id:'urn:synthetic:intake-usage',components:{schemas}});
const validate=name=>ajv.compile({$ref:`urn:synthetic:intake-usage#/components/schemas/Intake${name}`});
const refs=(kind,count)=>Array.from({length:count},(_,i)=>({id:`${kind}-${i}`,displayVersion:1}));
const entry=(products=0,scenarios=0)=>({businessEntryId:'faq-one',scriptVersion:1,operation:'upsert',title:'合成标题',answerText:'合成正文',questions:[],
 productRefs:refs('product',products),scenarioRefs:refs('scenario',scenarios),effectiveFrom:'2026-01-01T00:00:00Z',effectiveTo:null,
 applicabilityNote:'',familySourceId:null,familyBusinessEntryId:null,brandNonOverridable:false,category:'合成分类',riskNote:''});

test('approved pair is deterministic and preserves frozen predecessor and candidate bytes',()=>{
 for(const kind of ['openapi','database']) {
  assert.ok(read(INTAKE_USAGE_CONTRACT_PATHS[kind]).equals(generated[kind]));
  assert.ok(read(INTAKE_CONTRACT_PATHS[kind]).equals(prior[kind]));
 }
 assert.equal(hash(prior.openapi),'2f029b210baa27164f2fbddc237f9775ac994629f354a5307c7c9f339f72ebb2');
 assert.equal(hash(prior.database),'1418537f66274657f8221896387933b4a00a15c23253993541c3bb0ca8964d41');
 assert.ok(generated.database.includes(prior.database));
 assert.equal(hash(generated.openapi),'3e0a3f122aefa0bff9c330e105f1a5cbb2b26662fd5f04db1ef3a93ac1bc1121');
 assert.equal(hash(generated.database),'5f958e4f7dcde7e11f9a6d38d8339b96654517209a493776acbfc7c3f5202013');
 assert.match(generated.openapi.toString(),/version: 1.17.0/);
});
test('all real generated intake schemas compile with standard JSON Schema',()=>{
 for(const name of Object.keys(schemas)) validate(name.slice(6));
});
test('selection is explicit, bounded and cannot carry identity or an authority override',()=>{
 const check=validate('EntitlementRequest');
 const req={shopId:'shop-one',contextGeneration:1,releaseId:null,productIds:[],scenarioIds:[]};
 assert.ok(check(req));
 assert.ok(check({...req,productIds:['product-b','product-a']}),'API canonicalizes ordering');
 for(const key of ['productIds','scenarioIds']) {
  const missing={...req};delete missing[key];assert.equal(check(missing),false);
  for(const value of [null,['*'],['x','x'],[''],Array.from({length:101},(_,i)=>`x${i}`)]) assert.equal(check({...req,[key]:value}),false);
 }
 for(const key of ['userId','sessionId','sessionTokenHash','role','sourceIds','allCompany']) assert.equal(check({...req,[key]:'forged'}),false);
});
test('every 100-ref boundary passes and 101-ref upserts fail for both producers and consumers',()=>{
 const pub=validate('PublishedEntry'),full=validate('Entry');
 for(let products=0;products<=100;products++) {
  const good=entry(products,100-products),bad=entry(products,101-products);
  assert.ok(pub(good),JSON.stringify(pub.errors));
  assert.equal(pub(bad),false,`published ${products}+${101-products}`);
  assert.ok(full({...good,internalNote:'',attachmentNote:''}));
  assert.equal(full({...bad,internalNote:'',attachmentNote:''}),false);
 }
 assert.ok(full({...entry(60,51),operation:'disable',internalNote:'',attachmentNote:''}),'old over-budget entries remain removable');
});
test('snapshot keeps its page ceiling, narrow query and private fields absent',()=>{
 assert.equal(schemas.IntakeSnapshot.properties.vocabulary.maxItems,100);
 const line=lines.find(v=>v.startsWith('  "/v1/intake/snapshot": '));
 const operation=JSON.parse(line.slice(line.indexOf(': ')+2)).get;
 assert.deepEqual(operation.parameters.map(p=>p.name),['entitlementId','cursor','limit']);
 assert.deepEqual(operation.security,[{ProductSession:[]}]);
 assert.equal(validate('PublishedEntry')({...entry(),internalNote:'private'}),false);
 for(const key of ['sessionId','sessionTokenHash','productIds','scenarioIds']) assert.equal(key in schemas.IntakeEntitlement.properties,false);
});
test('generator refuses a budget change that was not versioned with the snapshot',()=>{
 const changed=JSON.parse(read(INTAKE_USAGE_SOURCES.openapi));changed.vocabularyLimit=200;
 assert.throws(()=>buildIntakeUsageContractFiles(file=>file===INTAKE_USAGE_SOURCES.openapi?Buffer.from(JSON.stringify(changed)):read(file)),/budget/);
});
test('freeze selects the approved profile without widening snapshot or runtime activation',()=>{
 const profile=JSON.parse(read('business-docs/01-客服Agent项目/30-开发-进行中/contract-profile.v1.json'));
 assert.equal(profile.profile,'content-intake-usage-v1');
 assertIntakeUsageExportGate(read,{openapiHash:hash(generated.openapi),databaseHash:hash(generated.database)});
 assert.equal(schemas.IntakeSnapshot.properties.sopNodes.maxItems,0);
 assert.equal(schemas.IntakeSnapshot.properties.media.maxItems,0);
});

test('usage export binds exact approval, normative hashes, generation and commit; rejects draft/downgrade',()=>{
 const repo=mkdtempSync(path.join(tmpdir(),'intake-usage-export-'));
 const git=(...args)=>execFileSync('git',args,{cwd:repo,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 const write=(file,bytes)=>{mkdirSync(path.dirname(path.join(repo,file)),{recursive:true});writeFileSync(path.join(repo,file),bytes);};
 try {
  const files=new Set([...used,...Object.values(CONTRACT_SOURCE_PATHS),...Object.values(OWNER_CONTRACT_PATHS),OWNER_PROFILE_PATH,
   'business-docs/01-客服Agent项目/90-评审/2026-09-09_后端合成开发批准.md',builder.INTAKE_APPROVAL_PATH]);
  for(const key of ['BACKEND_CONTRACT_PATHS','CLOSURE_CONTRACT_PATHS','OPS_LOOP_CONTRACT_PATHS','COACH_PUBLISH_CONTRACT_PATHS','INTAKE_CONTRACT_PATHS','INTAKE_USAGE_CONTRACT_PATHS'])for(const file of Object.values(builder[key]))files.add(file);
  for(const file of files)write(file,read(file));
  git('init','-q');git('config','user.email','synthetic@example.invalid');git('config','user.name','Synthetic');
  const commit=()=>{git('add','--all');git('commit','-qm','synthetic usage export fixture');return git('rev-parse','HEAD');};
  const options={repository:repo,expectedOpenapiSha256:hash(generated.openapi),expectedDatabaseSha256:hash(generated.database)};
  const load=()=>loadContractSetFromCommit({...options,sourceGitSha:commit()});
  assert.throws(load,'old 1.16 approval cannot authorize 1.17');
  const approved=read(builder.INTAKE_USAGE_APPROVAL_PATH).toString();
  write(builder.INTAKE_USAGE_APPROVAL_PATH,approved.replace(options.expectedDatabaseSha256,'f'.repeat(64)));
  assert.throws(load,/双哈希不一致/);
  write(builder.INTAKE_USAGE_APPROVAL_PATH,approved);
  const frozen=read(INTAKE_USAGE_CONTRACT_PATHS.increment).toString();
  write(INTAKE_USAGE_CONTRACT_PATHS.increment,frozen.replace('FROZEN · NOT EXPORTED','DRAFT · NOT FROZEN · NOT EXPORTED'));
  assert.throws(load,/未冻结/);
  write(INTAKE_USAGE_CONTRACT_PATHS.increment,frozen.replaceAll(options.expectedOpenapiSha256,'f'.repeat(64)));
  assert.throws(load,/双哈希不一致/);
  write(INTAKE_USAGE_CONTRACT_PATHS.increment,frozen);
  const sha=commit();const exported=loadContractSetFromCommit({...options,sourceGitSha:sha});
  assert.equal(exported.manifest.openapi.version,'1.17.0');assert.equal(exported.manifest.database.version,'schema.v1.21');
  write(builder.INTAKE_USAGE_APPROVAL_PATH,'NOT APPROVED');
  assert.equal(loadContractSetFromCommit({...options,sourceGitSha:sha}).manifest.source_git_sha,sha,'dirty approval is ignored');
  assert.throws(load,/缺 P2/);
  write(builder.INTAKE_USAGE_APPROVAL_PATH,approved);
  const drift=Buffer.concat([generated.database,Buffer.from('\n-- drift\n')]);write(INTAKE_USAGE_CONTRACT_PATHS.database,drift);
  assert.throws(()=>loadContractSetFromCommit({...options,sourceGitSha:commit(),expectedDatabaseSha256:hash(drift)}),/派生产物漂移/);
  write(INTAKE_USAGE_CONTRACT_PATHS.database,generated.database);
  write(OWNER_PROFILE_PATH,JSON.stringify({schema:'customer-agent-contract-profile/v1',profile:'content-intake-v2'}));
  assert.throws(load,/拒绝降级 content-intake-usage/);
  rmSync(path.join(repo,builder.INTAKE_USAGE_APPROVAL_PATH));
  assert.throws(load,/拒绝降级 content-intake-usage/,'approval history prevents deletion bypass');
 } finally {rmSync(repo,{recursive:true,force:true});}
});
test('generated SQL and PL/pgSQL parse and add no application grants',async()=>{
 const parser=createRequire(import.meta.url)('@libpg-query/parser');await parser.loadModule();
 assert.ok(parser.parseSync(generated.database.toString()).stmts.length>550);
 assert.ok(parser.parsePlPgSQLSync(generated.database.toString()).plpgsql_funcs.length>100);
 const sql=read(INTAKE_USAGE_SOURCES.storage).toString();assert.doesNotMatch(sql,/^GRANT /m);
 assert.match(sql,/DEFERRABLE INITIALLY DEFERRED/);
});
