import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import Ajv from 'ajv/dist/2020.js';
import {buildIntakeContractFiles,buildIntakeUsageContractFiles,INTAKE_CONTRACT_PATHS,INTAKE_USAGE_CONTRACT_PATHS,INTAKE_USAGE_SOURCES} from '../../business-docs/08-工具/build_customer_agent_backend_contract.mjs';
const read=file=>readFileSync(new URL(`../../${file}`,import.meta.url));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const generated=buildIntakeUsageContractFiles(read);
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

test('draft pair is deterministic and preserves frozen 1.16/schema1.20 bytes',()=>{
 for(const kind of ['openapi','database']) {
  assert.ok(read(INTAKE_USAGE_CONTRACT_PATHS[kind]).equals(generated[kind]));
  assert.ok(read(INTAKE_CONTRACT_PATHS[kind]).equals(prior[kind]));
 }
 assert.equal(hash(prior.openapi),'2f029b210baa27164f2fbddc237f9775ac994629f354a5307c7c9f339f72ebb2');
 assert.equal(hash(prior.database),'1418537f66274657f8221896387933b4a00a15c23253993541c3bb0ca8964d41');
 assert.ok(generated.database.includes(prior.database));
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
test('draft does not select a new export profile or mutate the consumed snapshot format',()=>{
 const profile=JSON.parse(read('business-docs/01-客服Agent项目/30-开发-进行中/contract-profile.v1.json'));
 assert.equal(profile.profile,'content-intake-v2');
 assert.match(read(INTAKE_USAGE_CONTRACT_PATHS.increment).toString(),/DRAFT.*NOT FROZEN.*NOT EXPORTED.*NOT INTAKE/);
 assert.equal(schemas.IntakeSnapshot.properties.sopNodes.maxItems,0);
 assert.equal(schemas.IntakeSnapshot.properties.media.maxItems,0);
});
test('generated SQL and PL/pgSQL parse and add no application grants',async()=>{
 const parser=createRequire(import.meta.url)('@libpg-query/parser');await parser.loadModule();
 assert.ok(parser.parseSync(generated.database.toString()).stmts.length>550);
 assert.ok(parser.parsePlPgSQLSync(generated.database.toString()).plpgsql_funcs.length>100);
 const sql=read(INTAKE_USAGE_SOURCES.storage).toString();assert.doesNotMatch(sql,/^GRANT /m);
 assert.match(sql,/DEFERRABLE INITIALLY DEFERRED/);
});
