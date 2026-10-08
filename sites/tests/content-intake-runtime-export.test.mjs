import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import * as builder from '../../business-docs/08-工具/build_customer_agent_backend_contract.mjs';
import {OWNER_PROFILE_PATH,OWNER_CONTRACT_PATHS} from '../../business-docs/08-工具/build_customer_agent_owner_contract.mjs';
import {CONTRACT_SOURCE_PATHS,INTAKE_RUNTIME_APPROVAL_PATH,RUNTIME_BUNDLE_PATHS,
  loadContractSetFromCommit,writeImmutableContractSet,verifyContractSetDirectory} from '../../business-docs/08-工具/export_customer_agent_contract_set.mjs';
const read=file=>readFileSync(new URL('../../'+file,import.meta.url));
const hash=value=>createHash('sha256').update(value).digest('hex');
const used=new Set();
const generated=builder.buildIntakeShopDirectoryContractFiles(file=>{used.add(file);return read(file);});
const paths=builder.INTAKE_SHOP_DIRECTORY_CONTRACT_PATHS;

test('runtime v2 export refuses draft/missing approvals and delivers a complete immutable consumer bundle only in a synthetic repository',async()=>{
  const repo=mkdtempSync(path.join(tmpdir(),'runtime-export-fixture-'));
  const git=(...args)=>execFileSync('git',args,{cwd:repo,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  const write=(file,bytes)=>{mkdirSync(path.dirname(path.join(repo,file)),{recursive:true});writeFileSync(path.join(repo,file),bytes);};
  const pair=(api,db)=>`OpenAPI 1.21.0 SHA-256 \`${hash(api)}\`；DDL schema.v1.23 SHA-256 \`${hash(db)}\``;
  const predecessor=builder.buildIntakeDirectContractFiles(read);
  const frozen=`> 状态：FROZEN · NOT EXPORTED · NOT INTAKE · SYNTHETIC DEVELOPMENT ONLY\n**直接前序机器合同：** ${pair(predecessor.openapi,predecessor.database)}\n**P2 运行接入机器合同增量：** ${pair(generated.openapi,generated.database)}\n**实际产物必须精确匹配：** ${pair(generated.openapi,generated.database)}\n**运行安装清单：** \`${hash(generated.installation)}\`\n`;
  const approval=`> 状态：APPROVED · CONTRACT ONLY · SYNTHETIC DEVELOPMENT ONLY\n**批准产物：** ${pair(generated.openapi,generated.database)}\n**批准安装清单：** \`${hash(generated.installation)}\`\n`;
  try {
    const files=new Set([...used,...Object.values(CONTRACT_SOURCE_PATHS),...Object.values(OWNER_CONTRACT_PATHS),OWNER_PROFILE_PATH,
      'business-docs/01-客服Agent项目/90-评审/2026-09-09_后端合成开发批准.md']);
    for(const [key,value] of Object.entries(builder)) {
      if(key.endsWith('_CONTRACT_PATHS')) for(const file of Object.values(value)) files.add(file);
      if(key.endsWith('_APPROVAL_PATH')) files.add(value);
    }
    for(const file of files) write(file,read(file));
    write('.gitignore','output/\n');
    git('init','-q');git('config','user.email','synthetic@example.invalid');git('config','user.name','Synthetic');git('config','commit.gpgsign','false');
    const commit=()=>{git('add','--all');git('commit','-qm','synthetic runtime export fixture');return git('rev-parse','HEAD');};
    const options={repository:repo,expectedOpenapiSha256:hash(generated.openapi),expectedDatabaseSha256:hash(generated.database)};
    const load=()=>loadContractSetFromCommit({...options,sourceGitSha:commit()});
    write(OWNER_PROFILE_PATH,JSON.stringify({schema:'customer-agent-contract-profile/v1',profile:'content-intake-runtime-v1'}));
    assert.throws(load,/运行接入合同未冻结/);
    write(paths.increment,frozen);assert.throws(load,/git rev-parse 失败/);
    write(INTAKE_RUNTIME_APPROVAL_PATH,approval.replace('APPROVED','DRAFT'));assert.throws(load,/缺 P2 运行接入/);
    write(INTAKE_RUNTIME_APPROVAL_PATH,approval.replace(hash(generated.installation),'f'.repeat(64)));assert.throws(load,/安装清单批准/);
    write(INTAKE_RUNTIME_APPROVAL_PATH,approval);
    const sourceGitSha=commit();
    const complete=loadContractSetFromCommit({...options,sourceGitSha});
    assert.equal(complete.manifest.schema,'customer-agent-contract-set/v2');
    assert.deepEqual(Object.keys(complete.manifest.runtime),Object.keys(RUNTIME_BUNDLE_PATHS));
    assert.equal(complete.files.size,12);
    // The original machine DRAFT bytes stay unchanged; exact approval lives in
    // the independent normative record, not an invented machine flag flip.
    assert.ok(complete.files.get('intake-runtime-installation.v1.json').equals(generated.installation));
    const out=await writeImmutableContractSet({contractSet:complete,repository:repo,outputRoot:path.join(repo,'output/contracts')});
    const consumed=await verifyContractSetDirectory({contractSetDirectory:out.target,repository:repo});
    assert.equal(consumed.runtime.acl.sha256,hash(read(builder.INTAKE_RUNTIME_SOURCES.acl)));
    // Recomputed outer hashes do not excuse an invalid installation protocol.
    const replaceOutput=(file,bytes)=>{const target=path.join(out.target,file);chmodSync(target,0o644);writeFileSync(target,bytes);chmodSync(target,0o444);};
    for (const mutate of [
      value=>value.requiredBundleArtifacts.pop(),
      value=>value.productMode.order.reverse(),
      value=>{value.productMode.implementation.commit='f'.repeat(40);},
    ]) {
      const install=JSON.parse(generated.installation);mutate(install);
      const bytes=Buffer.from(JSON.stringify(install));const envelope=structuredClone(consumed);
      envelope.runtime.installation.sha256=hash(bytes);envelope.runtime.installation.bytes=bytes.length;
      replaceOutput(consumed.runtime.installation.file,bytes);replaceOutput('contract-set.json',JSON.stringify(envelope));
      await assert.rejects(verifyContractSetDirectory({contractSetDirectory:out.target,repository:repo,againstSource:false}),/runtime安装边界不一致|runtime overlay依赖不一致/);
      replaceOutput(consumed.runtime.installation.file,generated.installation);
      replaceOutput('contract-set.json',complete.files.get('contract-set.json'));
    }
    const aclFile=path.join(out.target,consumed.runtime.acl.file);
    chmodSync(aclFile,0o644);writeFileSync(aclFile,'changed');chmodSync(aclFile,0o444);
    await assert.rejects(verifyContractSetDirectory({contractSetDirectory:out.target,repository:repo}),/bytes 不匹配|SHA-256 不匹配/);
    chmodSync(aclFile,0o644);writeFileSync(aclFile,complete.files.get(consumed.runtime.acl.file));chmodSync(aclFile,0o444);
    chmodSync(out.target,0o755);rmSync(aclFile);chmodSync(out.target,0o555);
    await assert.rejects(verifyContractSetDirectory({contractSetDirectory:out.target,repository:repo}),/缺失或未声明成员/);
    // Source drift, including an overlay fingerprint change, must not inherit
    // an approval over the previous installation manifest.
    const provenancePath=RUNTIME_BUNDLE_PATHS.provenance.source_path;
    const provenance=JSON.parse(read(provenancePath));
    provenance.implementationDependencies.overlayFiles['0032_intake_direct_publication.sql']='f'.repeat(64);
    write(provenancePath,JSON.stringify(provenance));
    const changed=builder.buildIntakeShopDirectoryContractFiles(file=>readFileSync(path.join(repo,file)));
    write(paths.installation,changed.installation);
    assert.throws(load,/安装清单批准/);
    write(provenancePath,read(provenancePath));write(paths.installation,generated.installation);
    rmSync(path.join(repo,builder.INTAKE_RUNTIME_SOURCES.acl));assert.throws(load,/git rev-parse 失败/);
    write(builder.INTAKE_RUNTIME_SOURCES.acl,read(builder.INTAKE_RUNTIME_SOURCES.acl));
    write(OWNER_PROFILE_PATH,JSON.stringify({schema:'customer-agent-contract-profile/v1',profile:'content-intake-direct-v1'}));
    rmSync(path.join(repo,INTAKE_RUNTIME_APPROVAL_PATH));assert.throws(load,/拒绝降级 content-intake-runtime/);
  } finally {
    // Only this disposable synthetic repository/output is removed.
    chmodSync(repo,0o700);execFileSync('chmod',['-R','u+w',repo]);rmSync(repo,{recursive:true,force:true});
  }
});
