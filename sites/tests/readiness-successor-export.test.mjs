import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APPROVAL, CANDIDATE, FROZEN, MEMBERS, freezeReadinessSuccessor, writeReadinessContractSet } from '../../business-docs/08-工具/export_customer_agent_readiness_successor.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
function fixture(t, committed = true) {
  const dir = mkdtempSync(path.join(tmpdir(), 'readiness-export-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const relative of [APPROVAL, ...Object.values(MEMBERS).map(v => `${CANDIDATE}/${v[0]}`)]) {
    mkdirSync(path.dirname(path.join(dir, relative)), { recursive: true }); cpSync(path.join(root, relative), path.join(dir, relative));
  }
  freezeReadinessSuccessor(dir, true);
  const git = args => execFileSync('git', ['-C', dir, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  git(['init', '-q']); git(['-c','user.name=Contract Test','-c','user.email=test@example.invalid','commit','--allow-empty','--no-verify','-qm','synthetic base']);
  if (committed) {
    git(['add','--',APPROVAL,FROZEN]);
    git(['-c','user.name=Contract Test','-c','user.email=test@example.invalid','commit','--no-verify','-qm','synthetic approved bytes']);
  }
  return dir;
}
test('exact freeze preserves historical candidate bytes and does not activate runtime', () => {
  assert.equal(freezeReadinessSuccessor(root).status, 'FROZEN_NOT_EXPORTED_NOT_INTAKE');
  assert.equal(JSON.parse(readFileSync(path.join(root,FROZEN,'provenance.v1.json'))).status, 'DRAFT');
});
test('committed approved compact closure exports seven members and replays identically', t => {
  const dir=fixture(t); const first=writeReadinessContractSet(dir); const second=writeReadinessContractSet(dir);
  assert.deepEqual(second, first);
  const manifest=JSON.parse(readFileSync(path.join(first.directory,'contract-set.json')));
  assert.equal(manifest.schema,'customer-agent-contract-set/v7');
  assert.equal(existsSync(path.join(first.directory,manifest.openapi.file)),false);
  assert.equal(existsSync(path.join(first.directory,manifest.database.file)),false);
  for(const desc of Object.values(manifest.readiness)) {
    assert.deepEqual(readFileSync(path.join(first.directory,desc.file)),readFileSync(path.join(dir,desc.source_path)));
  }
  const frozen=path.join(dir,FROZEN,'upgrade.v1.sql');writeFileSync(frozen,readFileSync(frozen,'utf8')+'\n');
  assert.throws(()=>writeReadinessContractSet(dir),/Uncommitted frozen input/);
});
test('uncommitted approval fails before output is created',t=>{
  const dir=fixture(t,false);assert.throws(()=>writeReadinessContractSet(dir));
  assert.equal(existsSync(path.join(dir,'output')),false);
});
test('unapproved or changed candidates never overwrite frozen bytes',t=>{
  const dir=fixture(t);const f=path.join(dir,CANDIDATE,'upgrade.candidate.sql');writeFileSync(f,'SELECT 1;');
  assert.throws(()=>freezeReadinessSuccessor(dir,true),/Approved bytes drifted/);
  const approved=JSON.parse(readFileSync(path.join(dir,APPROVAL)));approved.exportApproved=false;writeFileSync(path.join(dir,APPROVAL),JSON.stringify(approved));
  assert.throws(()=>freezeReadinessSuccessor(dir,true),/exportApproved/);
});
test('altered existing export is rejected instead of replaced',t=>{
  const dir=fixture(t);const out=writeReadinessContractSet(dir);const f=path.join(out.directory,'upgrade.v1.sql');chmodSync(f,0o644);writeFileSync(f,'SELECT 1;');
  assert.throws(()=>writeReadinessContractSet(dir),/Existing export differs/);
});
