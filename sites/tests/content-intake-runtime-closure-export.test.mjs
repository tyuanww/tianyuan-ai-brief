import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as builder from '../../business-docs/08-工具/build_customer_agent_backend_contract.mjs';
import { buildCsvContractFiles, CSV_PATHS } from '../../business-docs/08-工具/build_customer_agent_csv_contract.mjs';
import { buildRuntimeClosure, CLOSURE_PATHS } from '../../business-docs/08-工具/build_customer_agent_runtime_closure.mjs';
import { OWNER_PROFILE_PATH, OWNER_CONTRACT_PATHS } from '../../business-docs/08-工具/build_customer_agent_owner_contract.mjs';
import { CONTRACT_SOURCE_PATHS, INTAKE_RUNTIME_APPROVAL_PATH, INTAKE_CSV_APPROVAL_PATH, INTAKE_LEGACY_CHECK_APPROVAL_PATH,
  LEGACY_CHECK_CONTRACT_PATHS, LEGACY_CHECK_BUNDLE_PATHS, loadContractSetFromCommit, writeImmutableContractSet,
  verifyContractSetDirectory } from '../../business-docs/08-工具/export_customer_agent_contract_set.mjs';

const read = file => readFileSync(new URL('../../' + file, import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');
const used = new Set(); const capture = file => { used.add(file); return read(file); };
builder.buildIntakeShopDirectoryContractFiles(capture);
const csv = buildCsvContractFiles(capture), generated = buildRuntimeClosure(capture);
const frozen = read(LEGACY_CHECK_CONTRACT_PATHS.increment).toString();
const approval = read(INTAKE_LEGACY_CHECK_APPROVAL_PATH).toString();

test('v4 exports only the complete approved legacy-check closure and preserves genuine historical CSV', async () => {
  const repo = mkdtempSync(path.join(tmpdir(), 'legacy-check-export-fixture-'));
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 }).trim();
  const write = (file, bytes) => { mkdirSync(path.dirname(path.join(repo, file)), { recursive: true }); writeFileSync(path.join(repo, file), bytes); };
  try {
    const files = new Set([...used, ...Object.values(CONTRACT_SOURCE_PATHS), ...Object.values(OWNER_CONTRACT_PATHS), ...Object.values(CSV_PATHS),
      ...Object.values(LEGACY_CHECK_CONTRACT_PATHS), OWNER_PROFILE_PATH, INTAKE_RUNTIME_APPROVAL_PATH, INTAKE_CSV_APPROVAL_PATH,
      'business-docs/01-客服Agent项目/90-评审/2026-09-09_后端合成开发批准.md']);
    for (const [key, value] of Object.entries(builder)) {
      if (key.endsWith('_CONTRACT_PATHS')) for (const file of Object.values(value)) files.add(file);
      if (key.endsWith('_APPROVAL_PATH')) files.add(value);
    }
    for (const file of files) write(file, read(file));
    write('.gitignore', 'output/\n'); git('init', '-q'); git('config', 'user.email', 'synthetic@example.invalid');
    git('config', 'user.name', 'Synthetic'); git('config', 'commit.gpgsign', 'false');
    const commit = () => { git('add', '--all'); git('commit', '-qm', 'synthetic closure export fixture'); return git('rev-parse', 'HEAD'); };
    const profile = name => write(OWNER_PROFILE_PATH, JSON.stringify({ schema: 'customer-agent-contract-profile/v1', profile: name }));
    const options = { repository: repo, expectedOpenapiSha256: hash(csv.openapi), expectedDatabaseSha256: hash(generated.database) };
    const load = () => loadContractSetFromCommit({ ...options, sourceGitSha: commit() });
    profile('content-intake-csv-v1'); write(LEGACY_CHECK_CONTRACT_PATHS.increment, frozen.replace('FROZEN', 'DRAFT'));
    const historicalSha = commit();
    const historical = () => loadContractSetFromCommit({ ...options, expectedDatabaseSha256: hash(csv.database), sourceGitSha: historicalSha });
    assert.equal(historical().manifest.schema, 'customer-agent-contract-set/v3');
    profile('content-intake-legacy-check-v1'); assert.throws(load, /旧内容校验 ACL 合同未冻结/);
    write(LEGACY_CHECK_CONTRACT_PATHS.increment, frozen); assert.throws(load, /git rev-parse 失败/);
    write(INTAKE_LEGACY_CHECK_APPROVAL_PATH, approval.replace('APPROVED', 'DRAFT')); assert.throws(load, /缺 P2 旧内容校验 ACL/);
    write(INTAKE_LEGACY_CHECK_APPROVAL_PATH, approval.replace(hash(generated.manifest), 'f'.repeat(64))); assert.throws(load, /安装\/ACL批准哈希/);
    write(INTAKE_LEGACY_CHECK_APPROVAL_PATH, approval.replace(hash(read(CLOSURE_PATHS.delta)), 'f'.repeat(64))); assert.throws(load, /安装\/ACL批准哈希/);
    write(INTAKE_LEGACY_CHECK_APPROVAL_PATH, approval);
    const complete = load(); assert.equal(complete.manifest.schema, 'customer-agent-contract-set/v4');
    assert.equal(complete.manifest.database.version, 'schema.v1.25');
    assert.equal(complete.files.size, 16); assert.deepEqual(Object.keys(complete.manifest.runtime), Object.keys(LEGACY_CHECK_BUNDLE_PATHS));
    const out = await writeImmutableContractSet({ contractSet: complete, repository: repo, outputRoot: path.join(repo, 'output/contracts') });
    const consumed = await verifyContractSetDirectory({ contractSetDirectory: out.target, repository: repo });
    assert.equal(consumed.runtime.legacyAcl.sha256, hash(read(CLOSURE_PATHS.delta)));
    assert.equal(consumed.runtime.csvInstallation.sha256, hash(csv.installation));
    const replace = (file, bytes) => { const target = path.join(out.target, file); chmodSync(target, 0o644); writeFileSync(target, bytes); chmodSync(target, 0o444); };
    const restore = () => { for (const [file, bytes] of complete.files) replace(file, bytes); };
    const wrongRoot = structuredClone(consumed); wrongRoot.database.source_path = CSV_PATHS.database;
    replace('contract-set.json', JSON.stringify(wrongRoot));
    await assert.rejects(verifyContractSetDirectory({ contractSetDirectory: out.target, repository: repo, againstSource: false }), /根工件不匹配/); restore();
    for (const mutate of [
      value => { value.runtimeActivated = true; }, value => { value.loginRoleGrants = true; }, value => { value.functionBodyChanges = true; },
      value => { value.predecessor.installationSha256 = 'f'.repeat(64); }, value => { value.dependencies.acl.sha256 = 'f'.repeat(64); },
      value => { value.productOrder.reverse(); }, value => { value.referenceMode.runtimeReady = true; },
    ]) {
      const installation = JSON.parse(generated.manifest); mutate(installation); const bytes = Buffer.from(JSON.stringify(installation));
      const manifest = structuredClone(consumed); manifest.runtime.installation.sha256 = hash(bytes); manifest.runtime.installation.bytes = bytes.length;
      replace(consumed.runtime.installation.file, bytes); replace('contract-set.json', JSON.stringify(manifest));
      await assert.rejects(verifyContractSetDirectory({ contractSetDirectory: out.target, repository: repo, againstSource: false }), /旧内容校验安装边界|旧内容校验依赖/);
      restore();
    }
    // Self-consistent transport hashes cannot replace the exact DDL append closure.
    const delta = Buffer.concat([read(CLOSURE_PATHS.delta), Buffer.from('\n')]), installation = JSON.parse(generated.manifest), tampered = structuredClone(consumed);
    installation.delta.sha256 = hash(delta); tampered.runtime.legacyAcl.sha256 = hash(delta); tampered.runtime.legacyAcl.bytes = delta.length;
    const installationBytes = Buffer.from(JSON.stringify(installation)); tampered.runtime.installation.sha256 = hash(installationBytes); tampered.runtime.installation.bytes = installationBytes.length;
    replace(consumed.runtime.legacyAcl.file, delta); replace(consumed.runtime.installation.file, installationBytes); replace('contract-set.json', JSON.stringify(tampered));
    await assert.rejects(verifyContractSetDirectory({ contractSetDirectory: out.target, repository: repo, againstSource: false }), /DDL并非精确前序加ACL/); restore();
    for (const key of ['legacyAcl', 'csvInstallation', 'acl']) {
      const member = path.join(out.target, consumed.runtime[key].file); chmodSync(out.target, 0o755); chmodSync(member, 0o644); rmSync(member); chmodSync(out.target, 0o555);
      await assert.rejects(verifyContractSetDirectory({ contractSetDirectory: out.target, repository: repo }), /缺失或未声明成员/);
      chmodSync(out.target, 0o755); writeFileSync(member, complete.files.get(consumed.runtime[key].file), { mode: 0o444 }); chmodSync(out.target, 0o555);
    }
    replace(consumed.runtime.csvInstallation.file, 'changed'); await assert.rejects(verifyContractSetDirectory({ contractSetDirectory: out.target, repository: repo }), /bytes 不匹配|SHA-256 不匹配/); restore();
    write(CLOSURE_PATHS.delta, Buffer.concat([read(CLOSURE_PATHS.delta), Buffer.from('\n')])); assert.throws(load, /派生产物漂移/); write(CLOSURE_PATHS.delta, read(CLOSURE_PATHS.delta));
    profile('content-intake-csv-v1'); rmSync(path.join(repo, INTAKE_LEGACY_CHECK_APPROVAL_PATH));
    assert.throws(load, /拒绝降级 content-intake-legacy-check/);
    assert.equal(historical().manifest.schema, 'customer-agent-contract-set/v3');
    rmSync(path.join(repo, OWNER_PROFILE_PATH)); assert.throws(load, /删除了既有合同 profile/);
    write('.git/shallow', git('rev-parse', 'HEAD') + '\n'); assert.throws(() => historical(), /浅克隆/);
  } finally {
    chmodSync(repo, 0o700); execFileSync('chmod', ['-R', 'u+w', repo], { timeout: 30_000 }); rmSync(repo, { recursive: true, force: true });
  }
});
