import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APPROVAL, CANDIDATE, FROZEN, MEMBERS, freezeRepairSuccessor, writeRepairContractSet } from '../../business-docs/08-工具/export_customer_agent_repair_successor.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
function fixture(t, committed = true) {
  const dir = mkdtempSync(path.join(tmpdir(), 'repair-export-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const relative of [APPROVAL, ...Object.values(MEMBERS).map(v => `${CANDIDATE}/${v[0]}`)]) {
    mkdirSync(path.dirname(path.join(dir, relative)), { recursive: true }); cpSync(path.join(root, relative), path.join(dir, relative));
  }
  freezeRepairSuccessor(dir, true);
  const git = args => execFileSync('git', ['-C', dir, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  git(['init', '-q']); git(['-c','user.name=Contract Test','-c','user.email=test@example.invalid','commit','--allow-empty','--no-verify','-qm','synthetic base']);
  if (committed) {
    git(['add','--',APPROVAL,FROZEN]);
    git(['-c','user.name=Contract Test','-c','user.email=test@example.invalid','commit','--no-verify','-qm','synthetic approved bytes']);
  }
  return dir;
}
test('exact freeze preserves historical candidate bytes and does not activate runtime', () => {
  assert.equal(freezeRepairSuccessor(root).status, 'FROZEN_NOT_EXPORTED_NOT_INTAKE');
  assert.equal(JSON.parse(readFileSync(path.join(root,FROZEN,'provenance.v1.json'))).status, 'DRAFT');
});
test('committed approved closure exports all eight members and replays identically', t => {
  const dir=fixture(t); const first=writeRepairContractSet(dir); const second=writeRepairContractSet(dir);
  assert.deepEqual(second, first);
  const manifest=JSON.parse(readFileSync(path.join(first.directory,'contract-set.json')));
  assert.equal(manifest.schema,'customer-agent-contract-set/v6');
  for(const desc of [manifest.openapi,manifest.database,...Object.values(manifest.repair)]) {
    assert.deepEqual(readFileSync(path.join(first.directory,desc.file)),readFileSync(path.join(dir,desc.source_path)));
  }
  const frozen=path.join(dir,FROZEN,'upgrade.v1.sql');writeFileSync(frozen,readFileSync(frozen,'utf8')+'\n');
  assert.throws(()=>writeRepairContractSet(dir),/Uncommitted frozen input/);
});
test('uncommitted approval fails before output is created',t=>{
  const dir=fixture(t,false);assert.throws(()=>writeRepairContractSet(dir));
  assert.equal(existsSync(path.join(dir,'output')),false);
});
test('unapproved or changed candidates never overwrite frozen bytes',t=>{
  const dir=fixture(t);const f=path.join(dir,CANDIDATE,'upgrade.candidate.sql');writeFileSync(f,'SELECT 1;');
  assert.throws(()=>freezeRepairSuccessor(dir,true),/Approved bytes drifted/);
  const approved=JSON.parse(readFileSync(path.join(dir,APPROVAL)));approved.exportApproved=false;writeFileSync(path.join(dir,APPROVAL),JSON.stringify(approved));
  assert.throws(()=>freezeRepairSuccessor(dir,true),/exportApproved/);
});
test('altered existing export is rejected instead of replaced',t=>{
  const dir=fixture(t);const out=writeRepairContractSet(dir);const f=path.join(out.directory,'upgrade.v1.sql');chmodSync(f,0o644);writeFileSync(f,'SELECT 1;');
  assert.throws(()=>writeRepairContractSet(dir),/Existing export differs/);
});
