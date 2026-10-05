import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import Ajv from 'ajv/dist/2020.js';
import * as builder from '../../business-docs/08-工具/build_customer_agent_backend_contract.mjs';
import {OWNER_PROFILE_PATH,OWNER_CONTRACT_PATHS} from '../../business-docs/08-工具/build_customer_agent_owner_contract.mjs';
import {CONTRACT_SOURCE_PATHS,loadContractSetFromCommit,assertIntakeExportGate} from '../../business-docs/08-工具/export_customer_agent_contract_set.mjs';
const read=file=>readFileSync(new URL(`../../${file}`,import.meta.url));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const used=new Set();
const generated=builder.buildIntakeContractFiles(file=>{used.add(file);return read(file);});
const delta=JSON.parse(read(builder.INTAKE_SOURCES.openapi));
const parser=createRequire(import.meta.url)('@libpg-query/parser');await parser.loadModule();
const hashes={openapiHash:hash(generated.openapi),databaseHash:hash(generated.database)};
// Rejection fixtures own their lifecycle state; freezing this repository must not turn them into approved inputs.
const draftIncrement=read(builder.INTAKE_CONTRACT_PATHS.increment).toString()
 .replace(/^> 状态：[^\r\n]+$/m,'> 状态：DRAFT · NOT FROZEN · NOT EXPORTED · NOT INTAKE · SYNTHETIC DEVELOPMENT ONLY');

test('deterministic candidate preserves all predecessor bytes, SQL and PL/pgSQL parse',()=>{
 for(const key of ['openapi','database']) assert.ok(read(builder.INTAKE_CONTRACT_PATHS[key]).equals(generated[key]),key);
 const previous=builder.buildCoachPublishContractFiles(read);
 assert.ok(generated.database.includes(previous.database));
 assert.equal(hash(previous.database),'7bfa432637b8fcf07668e3c308cd00616869097c04d6951944dbdc26f2a61a34');
 assert.equal(hash(previous.openapi),'ab328c09293df5b534594f46469381b312f8aa3644fab214ac7278fe4f91435e');
 assert.ok(parser.parseSync(generated.database.toString()).stmts.length>550);
 assert.ok(parser.parsePlPgSQLSync(generated.database.toString()).plpgsql_funcs.length>100);
});

const ajv=new Ajv({strict:true,allowUnionTypes:true});
ajv.addKeyword('components');
ajv.addFormat('date-time',value=>/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value)&&Number.isFinite(Date.parse(value)));
ajv.addSchema({$id:'urn:synthetic:intake-contract',components:delta.components});
const validate=name=>ajv.compile({$ref:`urn:synthetic:intake-contract#/components/schemas/Intake${name}`});
const scope={tenantId:'tenant',appId:'app',brandId:'brand',shopId:null,domain:'product',sourceId:'source'};
const key={candidateId:'candidate',version:1,digest:'a'.repeat(64)};

test('all schemas compile, objects are closed and arrays bounded',()=>{
 const inspect=value=>{
  if(!value||typeof value!=='object')return;
  if(value.type==='object')assert.equal(value.additionalProperties,false);
  if(value.type==='array')assert.ok(Number.isInteger(value.maxItems));
  for(const child of Object.values(value))inspect(child);
 };
 for(const [name,schema] of Object.entries(delta.components.schemas)) {validate(name.slice(6));inspect(schema);}
});
test('scope rejects missing shop/source, wildcard company and candidate null source',()=>{
 const general=validate('Scope'),specific=validate('SourceScope');assert.ok(specific(scope));
 assert.ok(general({...scope,sourceId:null}));assert.equal(specific({...scope,sourceId:null}),false);
 for(const field of Object.keys(scope)){const copy={...scope};delete copy[field];assert.equal(specific(copy),false,field);}
 assert.equal(specific({...scope,allCompany:true}),false);
});
test('receive cannot trust client rows/digest/role; review cannot accept self-attested PASS',()=>{
 const input={operationId:'operation',objectId:'object',sourceVersion:1,baseReleaseId:null,expectedPriorKey:null,contributorDeclaration:{preparerPrincipalId:'preparer',editorPrincipalIds:['editor'],confirmed:true}};
 assert.ok(validate('Receive')(input));
 for(const [field,value] of Object.entries({rows:[],digest:'a'.repeat(64),role:'owner',actorId:'manager'}))assert.equal(validate('Receive')({...input,[field]:value}),false,field);
 const review={operationId:'operation',key,expectedEvidenceVersion:0};assert.ok(validate('ReviewRequest')(review));
 for(const field of ['reviewerId','approved','instanceCode','ticket'])assert.equal(validate('ReviewRequest')({...review,[field]:'forged'}),false,field);
});
test('publish pins all material/evidence versions and never accepts a client ticket',()=>{
 const input={operationId:'operation',key,baseReleaseId:null,sourceEvidenceVersion:1,approvalEvidenceVersion:1,title:'合成发布',summary:'合成资料更新'};
 assert.ok(validate('Publish')(input));
 for(const field of ['key','baseReleaseId','sourceEvidenceVersion','approvalEvidenceVersion','operationId']){const copy={...input};delete copy[field];assert.equal(validate('Publish')(copy),false,field);}
 assert.equal(validate('Publish')({...input,ticket:'forged'}),false);
 assert.equal(validate('Publish')({...input,approvalEvidenceVersion:0}),false);
});
test('cancellation works before evidence; operation result discriminates rollback and publish',()=>{
 assert.ok(validate('Cancel')({operationId:'cancel-op',key}));
 const receipt={operationId:'publish-op',key,action:'publish',state:'unknown',releaseId:null,announcementId:null,reason:'COMMIT_UNKNOWN'};
 assert.ok(validate('OperationReceipt')(receipt));
 assert.equal(validate('OperationReceipt')({...receipt,action:'rollback'}),false);
 assert.ok(validate('OperationReceipt')({operationId:'rollback-op',rollbackPlanId:'plan',action:'rollback',state:'unknown',releaseId:null,announcementId:null,reason:'COMMIT_UNKNOWN'}));
});
test('all paths authenticate, page lists bound input and error envelope retains details.reason',()=>{
 const operations=new Set();
 for(const [route,item] of Object.entries(delta.paths))for(const op of Object.values(item)) {
  assert.ok(route.startsWith('/v1/intake/'));assert.equal(operations.has(op.operationId),false);operations.add(op.operationId);
  for(const p of op.parameters??[]) if(p.name==='limit')assert.deepEqual(p.schema,{type:'integer',minimum:1,maximum:100,default:50});
  assert.ok(op.responses['401']);assert.ok(op.responses['404']);
 }
 const actual=generated.openapi.toString();
 for(const route of Object.keys(delta.paths)) {
  const line=actual.split('\n').find(x=>x.startsWith(`  ${JSON.stringify(route)}:`));
  for(const op of Object.values(JSON.parse(line.slice(line.indexOf(': ')+2))))assert.deepEqual(op.security,[{ProductSession:[]}]);
 }
 assert.ok(validate('Error')({error:{code:'CONFLICT',message:'请核对原操作',details:{reason:'COMMIT_UNKNOWN',diagnosticId:'diagnostic'}}}));
});
test('draft export is denied even when machine hashes match',()=>{
 const readDraft=file=>file===builder.INTAKE_CONTRACT_PATHS.increment?Buffer.from(draftIncrement):read(file);
 assert.throws(()=>assertIntakeExportGate(readDraft,hashes),/未冻结/);
 const doc=read(builder.INTAKE_CONTRACT_PATHS.increment).toString();
 for(const value of Object.values(hashes))assert.ok(doc.includes(value),'normative candidate hashes must match');
});
test('exact-commit export requires new paired approval, rejects drift/downgrade and ignores dirty files',()=>{
 const repo=mkdtempSync(path.join(tmpdir(),'intake-export-'));
 const git=(...args)=>execFileSync('git',args,{cwd:repo,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 const write=(file,bytes)=>{mkdirSync(path.dirname(path.join(repo,file)),{recursive:true});writeFileSync(path.join(repo,file),bytes);};
 const parentApproval='business-docs/01-客服Agent项目/90-评审/2026-09-09_后端合成开发批准.md';
 try {
  const files=new Set([...used,...Object.values(CONTRACT_SOURCE_PATHS),...Object.values(OWNER_CONTRACT_PATHS),OWNER_PROFILE_PATH,parentApproval]);
  for(const key of ['BACKEND_CONTRACT_PATHS','CLOSURE_CONTRACT_PATHS','OPS_LOOP_CONTRACT_PATHS','COACH_PUBLISH_CONTRACT_PATHS','INTAKE_CONTRACT_PATHS'])for(const file of Object.values(builder[key]))files.add(file);
  for(const file of files)write(file,read(file));
  write(builder.INTAKE_CONTRACT_PATHS.increment,draftIncrement);
  write(OWNER_PROFILE_PATH,JSON.stringify({schema:'customer-agent-contract-profile/v1',profile:'content-intake-v2'}));
  git('init','-q');git('config','user.email','synthetic@example.invalid');git('config','user.name','Synthetic');
  const commit=()=>{git('add','--all');git('commit','-qm','synthetic contract fixture');return git('rev-parse','HEAD');};
  const options={repository:repo,expectedOpenapiSha256:hashes.openapiHash,expectedDatabaseSha256:hashes.databaseHash};
  assert.throws(()=>loadContractSetFromCommit({...options,sourceGitSha:commit()}),/未冻结/);
  const frozen=draftIncrement.replace('DRAFT · NOT FROZEN · NOT EXPORTED · NOT INTAKE','FROZEN · NOT EXPORTED · NOT INTAKE');
  write(builder.INTAKE_CONTRACT_PATHS.increment,frozen);
  assert.throws(()=>loadContractSetFromCommit({...options,sourceGitSha:commit()}));
  const approval=`# SYNTHETIC TEST FIXTURE ONLY\n> 状态：APPROVED · CONTRACT ONLY · SYNTHETIC DEVELOPMENT ONLY\n**批准产物：** OpenAPI SHA-256 \`${hashes.openapiHash}\`；DDL SHA-256 \`${hashes.databaseHash}\`。\n`;
  write(builder.INTAKE_APPROVAL_PATH,approval);
  const sha=commit();const exported=loadContractSetFromCommit({...options,sourceGitSha:sha});
  assert.equal(exported.manifest.openapi.version,'1.16.0');assert.equal(exported.manifest.database.version,'schema.v1.20');
  write(builder.INTAKE_APPROVAL_PATH,'NOT APPROVED');assert.equal(loadContractSetFromCommit({...options,sourceGitSha:sha}).manifest.source_git_sha,sha);
  assert.throws(()=>loadContractSetFromCommit({...options,sourceGitSha:commit()}),/缺 P2/);
  write(builder.INTAKE_APPROVAL_PATH,approval.replace(hashes.databaseHash,'f'.repeat(64)));
  assert.throws(()=>loadContractSetFromCommit({...options,sourceGitSha:commit()}),/双哈希不一致/);
  write(builder.INTAKE_APPROVAL_PATH,approval);
  const drift=Buffer.concat([generated.database,Buffer.from('\n-- drift\n')]);write(builder.INTAKE_CONTRACT_PATHS.database,drift);
  assert.throws(()=>loadContractSetFromCommit({...options,sourceGitSha:commit(),expectedDatabaseSha256:hash(drift)}),/派生产物漂移/);
  write(builder.INTAKE_CONTRACT_PATHS.database,generated.database);
  write(OWNER_PROFILE_PATH,JSON.stringify({schema:'customer-agent-contract-profile/v1',profile:'coach-publish-v1'}));
  assert.throws(()=>loadContractSetFromCommit({...options,sourceGitSha:commit()}),/拒绝降级 content-intake/);
 } finally {rmSync(repo,{recursive:true,force:true});}
});

test('allocation-only authorization, explicit recovery action and contributor declaration are representable',()=>{
 const facts={factsVersion:1,revocationGeneration:0,policyVersion:1,validUntil:'2026-10-04T14:00:00Z',capabilities:[{scope,actions:[],mayAllocate:['publish'],mayDelegate:[],validUntil:'2026-10-04T14:00:00Z'}],nextCursor:null};
 assert.ok(validate('Authorization')(facts));
 const operation=delta.paths['/v1/intake/operations/{operationId}'].get;
 assert.deepEqual(operation.parameters.find(p=>p.name==='action'),{name:'action',in:'query',required:true,schema:{type:'string',enum:['publish','cancel','rollback']}});
 const input={operationId:'op',objectId:'object',sourceVersion:1,baseReleaseId:null,expectedPriorKey:null};
 assert.equal(validate('Receive')(input),false);
 const contributorDeclaration={preparerPrincipalId:'preparer',editorPrincipalIds:['editor'],confirmed:true};
 assert.ok(validate('Receive')({...input,contributorDeclaration}));
 assert.equal(validate('Receive')({...input,contributorDeclaration:{...contributorDeclaration,confirmed:false}}),false);
 assert.equal(validate('Receive')({...input,contributorDeclaration:{...contributorDeclaration,editorPrincipalIds:[]}}),false);
});
test('frozen FAQ entry retains all reviewed template semantics',()=>{
 const entry={businessEntryId:'faq-1',scriptVersion:1,operation:'upsert',title:'合成问题',answerText:'合成多行\n答案',questions:[],productRefs:[],scenarioRefs:[],effectiveFrom:'2026-10-04T00:00:00Z',effectiveTo:null,applicabilityNote:'',familySourceId:null,familyBusinessEntryId:null,brandNonOverridable:false,category:'产品',internalNote:'合成内部说明',riskNote:'合成风险提示',attachmentNote:''};
 assert.ok(validate('Entry')(entry));
 assert.equal(validate('Entry')({...entry,attachmentNote:'不能当作已解析附件'}),false);
 assert.equal(validate('Entry')({...entry,familySourceId:'common'}),false);
 assert.ok(validate('Entry')({...entry,familySourceId:'common',familyBusinessEntryId:'faq-common'}));
 for(const name of ['category','internalNote','riskNote','attachmentNote']){const copy={...entry};delete copy[name];assert.equal(validate('Entry')(copy),false,name);}
});
test('seat snapshot excludes internal review-only text and disabled entries',()=>{
 const schema=delta.components.schemas.IntakeSnapshot.properties.faq.items.properties.entry;
 assert.equal(schema.$ref,'#/components/schemas/IntakePublishedEntry');
 const published=delta.components.schemas.IntakePublishedEntry;
 assert.equal(published.properties.internalNote,undefined);
 assert.equal(published.properties.attachmentNote,undefined);
 assert.deepEqual(published.properties.operation.enum,['upsert']);
});
test('recipient selection supplies CAS facts and receive explicitly selects new or revised candidate',()=>{
 const item=delta.components.schemas.IntakePrincipalPage.properties.items.items;
 assert.ok(item.required.includes('factsVersion'));assert.ok(item.required.includes('validUntil'));
 assert.ok(delta.paths['/v1/intake/principals'].get.parameters.some(p=>p.name==='purpose'&&p.required));
 const input={operationId:'op',objectId:'object',sourceVersion:1,baseReleaseId:null,contributorDeclaration:{preparerPrincipalId:'manager',editorPrincipalIds:['manager'],confirmed:true}};
 assert.equal(validate('Receive')(input),false);
 assert.ok(validate('Receive')({...input,expectedPriorKey:null}));
 assert.ok(validate('Receive')({...input,expectedPriorKey:key}));
 assert.equal(validate('Receive')({...input,expectedPriorKey:{candidateId:'candidate',version:1}}),false);
});
test('rollback review carries bounded evidence and coverage family keys are paired',()=>{
 const schema=delta.components.schemas.IntakeRollbackReview;
 for(const field of ['impactDigest','checkedAt','validUntil','revocationGeneration','instanceCode','reviewPackageObjectId','reviewPackageSha256'])assert.ok(schema.required.includes(field),field);
 const refresh=delta.paths['/v1/intake/rollback/{rollbackPlanId}/review/refresh'].post;
 assert.equal(refresh.requestBody.content['application/json'].schema.$ref,'#/components/schemas/IntakeRollbackReviewRequest');
 const request={operationId:'refresh',impactDigest:'a'.repeat(64),expectedEvidenceVersion:1};
 assert.ok(validate('RollbackReviewRequest')(request));
 assert.equal(validate('RollbackReviewRequest')({...request,instanceCode:'client-supplied'}),false);
 for(const name of ['IntakeEntry','IntakePublishedEntry'])assert.ok(delta.components.schemas[name].if);
 assert.equal(delta.components.schemas.IntakeEntry.properties.attachmentNote.maxLength,0);
});

test('grant changes retain original and per-version reasons without blank audit entries',()=>{
 const grant={grantId:'grant',version:1,kind:'business',issuerPrincipalId:'director',recipientPrincipalId:'manager',action:'publish',scope,startsAt:'2026-10-04T00:00:00Z',expiresAt:'2026-10-05T00:00:00Z',revokedAt:null,stewardPrincipalId:'manager',reason:'合成授予',lastChangeReason:null,mayRedelegate:false};
 assert.ok(validate('Grant')(grant));
 assert.equal(validate('Grant')({...grant,version:2}),false);
 assert.ok(validate('Grant')({...grant,version:2,lastChangeReason:'合成接管'}));
 assert.equal(validate('Grant')({...grant,version:2,lastChangeReason:'   '}),false);
 assert.equal(validate('Grant')({...grant,lastChangeReason:'不能伪造初始变更'}),false);
 const change={operationId:'revoke',expectedVersion:2,change:'revoke',stewardPrincipalId:null,reason:'合成撤权'};
 assert.ok(validate('GrantChange')(change));
 assert.equal(validate('GrantChange')({...change,reason:'   '}),false);
});
