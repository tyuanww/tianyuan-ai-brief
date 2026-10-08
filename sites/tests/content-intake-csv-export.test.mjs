import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import * as builder from '../../business-docs/08-工具/build_customer_agent_backend_contract.mjs';
import {buildCsvContractFiles,CSV_SOURCES,CSV_PATHS} from '../../business-docs/08-工具/build_customer_agent_csv_contract.mjs';
import {OWNER_PROFILE_PATH,OWNER_CONTRACT_PATHS} from '../../business-docs/08-工具/build_customer_agent_owner_contract.mjs';
import {CONTRACT_SOURCE_PATHS,INTAKE_RUNTIME_APPROVAL_PATH,INTAKE_CSV_APPROVAL_PATH,CSV_BUNDLE_PATHS,
 loadContractSetFromCommit,writeImmutableContractSet,verifyContractSetDirectory} from '../../business-docs/08-工具/export_customer_agent_contract_set.mjs';
const read=file=>readFileSync(new URL('../../'+file,import.meta.url));
const hash=value=>createHash('sha256').update(value).digest('hex');
const used=new Set();const capture=file=>{used.add(file);return read(file);};
const predecessor=builder.buildIntakeShopDirectoryContractFiles(capture);const generated=buildCsvContractFiles(capture);
test('CSV candidate profile refuses DRAFT and only consumes a complete v3 bundle in a disposable synthetic repository',async()=>{
 const repo=mkdtempSync(path.join(tmpdir(),'csv-export-fixture-'));
 const git=(...args)=>execFileSync('git',args,{cwd:repo,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 const write=(file,bytes)=>{mkdirSync(path.dirname(path.join(repo,file)),{recursive:true});writeFileSync(path.join(repo,file),bytes);};
 const pair=(api,db)=>`OpenAPI SHA-256 \`${hash(api)}\`；DDL SHA-256 \`${hash(db)}\``;
 const frozen=`> 状态：FROZEN · NOT EXPORTED · NOT INTAKE · SYNTHETIC DEVELOPMENT ONLY\n**直接前序机器合同：** ${pair(predecessor.openapi,predecessor.database)}\n**P2 CSV 机器合同增量：** ${pair(generated.openapi,generated.database)}\n**实际产物必须精确匹配：** ${pair(generated.openapi,generated.database)}\n**CSV 安装清单：** \`${hash(generated.installation)}\`\n`;
 const approval=`> 状态：APPROVED · CONTRACT ONLY · SYNTHETIC DEVELOPMENT ONLY\n**批准产物：** ${pair(generated.openapi,generated.database)}\n**批准安装清单：** \`${hash(generated.installation)}\`\n`;
 try {
  const files=new Set([...used,...Object.values(CONTRACT_SOURCE_PATHS),...Object.values(OWNER_CONTRACT_PATHS),...Object.values(CSV_PATHS),OWNER_PROFILE_PATH,INTAKE_RUNTIME_APPROVAL_PATH,'business-docs/01-客服Agent项目/90-评审/2026-09-09_后端合成开发批准.md']);
  for(const [key,value] of Object.entries(builder)) {if(key.endsWith('_CONTRACT_PATHS')) for(const file of Object.values(value)) files.add(file);if(key.endsWith('_APPROVAL_PATH')) files.add(value);}
  for(const file of files) write(file,read(file));
  write('.gitignore','output/\n');git('init','-q');git('config','user.email','synthetic@example.invalid');git('config','user.name','Synthetic');git('config','commit.gpgsign','false');
  const commit=()=>{git('add','--all');git('commit','-qm','synthetic CSV export fixture');return git('rev-parse','HEAD');};
  const options={repository:repo,expectedOpenapiSha256:hash(generated.openapi),expectedDatabaseSha256:hash(generated.database)};
  const load=()=>loadContractSetFromCommit({...options,sourceGitSha:commit()});
  write(OWNER_PROFILE_PATH,JSON.stringify({schema:'customer-agent-contract-profile/v1',profile:'content-intake-csv-v1'}));
  write(CSV_PATHS.increment,frozen.replace('FROZEN','DRAFT'));
  assert.throws(load,/CSV 输入合同未冻结/);
  write(CSV_PATHS.increment,frozen);assert.throws(load,/git rev-parse 失败/);
  write(INTAKE_CSV_APPROVAL_PATH,approval.replace('APPROVED','DRAFT'));assert.throws(load,/缺 P2 CSV/);
  write(INTAKE_CSV_APPROVAL_PATH,approval.replace(hash(generated.installation),'f'.repeat(64)));assert.throws(load,/CSV 安装清单批准/);
  write(INTAKE_CSV_APPROVAL_PATH,approval);
  const complete=load();assert.equal(complete.manifest.schema,'customer-agent-contract-set/v3');
  assert.deepEqual(Object.keys(complete.manifest.runtime),Object.keys(CSV_BUNDLE_PATHS));assert.equal(complete.files.size,14);
  const out=await writeImmutableContractSet({contractSet:complete,repository:repo,outputRoot:path.join(repo,'output/contracts')});
  const consumed=await verifyContractSetDirectory({contractSetDirectory:out.target,repository:repo});
  assert.equal(consumed.runtime.csv.sha256,hash(read(CSV_SOURCES.storage)));assert.equal(consumed.runtime.csvProtocol.sha256,hash(read(CSV_SOURCES.protocol)));
  const replace=(file,bytes)=>{const target=path.join(out.target,file);chmodSync(target,0o644);writeFileSync(target,bytes);chmodSync(target,0o444);};
  for(const mutate of [value=>value.requiredBundleArtifacts.pop(),value=>value.productMode.order.splice(value.productMode.order.indexOf('csv'),1),value=>{value.productMode.csvProductionConsumerReady=true;}]) {
   const install=JSON.parse(generated.installation);mutate(install);const bytes=Buffer.from(JSON.stringify(install));const manifest=structuredClone(consumed);
   manifest.runtime.installation.sha256=hash(bytes);manifest.runtime.installation.bytes=bytes.length;
   replace(consumed.runtime.installation.file,bytes);replace('contract-set.json',JSON.stringify(manifest));
   await assert.rejects(verifyContractSetDirectory({contractSetDirectory:out.target,repository:repo,againstSource:false}),/runtime安装边界不一致|CSV 产品实施边界不一致/);
   replace(consumed.runtime.installation.file,generated.installation);replace('contract-set.json',complete.files.get('contract-set.json'));
  }
  for(const key of ['csv','csvProtocol','acl']) {
   const member=path.join(out.target,consumed.runtime[key].file);chmodSync(out.target,0o755);chmodSync(member,0o644);rmSync(member);chmodSync(out.target,0o555);
   await assert.rejects(verifyContractSetDirectory({contractSetDirectory:out.target,repository:repo}),/缺失或未声明成员/);
   chmodSync(out.target,0o755);writeFileSync(member,complete.files.get(consumed.runtime[key].file),{mode:0o444});chmodSync(out.target,0o555);
  }
  replace(consumed.runtime.csvProtocol.file,'changed');
  await assert.rejects(verifyContractSetDirectory({contractSetDirectory:out.target,repository:repo}),/bytes 不匹配|SHA-256 不匹配/);
  replace(consumed.runtime.csvProtocol.file,complete.files.get(consumed.runtime.csvProtocol.file));
  rmSync(path.join(repo,CSV_SOURCES.storage));assert.throws(load,/git rev-parse 失败/);write(CSV_SOURCES.storage,read(CSV_SOURCES.storage));
  write(OWNER_PROFILE_PATH,JSON.stringify({schema:'customer-agent-contract-profile/v1',profile:'content-intake-runtime-v1'}));rmSync(path.join(repo,INTAKE_CSV_APPROVAL_PATH));assert.throws(load,/拒绝降级 content-intake-csv/);
 } finally {chmodSync(repo,0o700);execFileSync('chmod',['-R','u+w',repo]);rmSync(repo,{recursive:true,force:true});}
});
