import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
export const CANDIDATE = 'business-docs/01-客服Agent项目/30-开发-进行中/readiness-successor-candidate';
export const FROZEN = 'business-docs/01-客服Agent项目/30-开发-进行中/content-intake-readiness-successor-v1';
export const APPROVAL = 'business-docs/01-客服Agent项目/90-评审/2026-10-12_就绪边界后继合同批准.json';
export const MEMBERS = Object.freeze({
  openapi: ['openapi.candidate.yaml', 'openapi.v1.yaml', '1.24.0'],
  database: ['schema.candidate.sql', 'schema-v1.29.sql', 'schema.v1.29'],
  upgrade: ['upgrade.candidate.sql', 'upgrade.v1.sql', '1'],
  assembly: ['assembly.candidate.json', 'assembly.v1.json', '1'],
  installation: ['installation.candidate.json', 'installation.v1.json', '1'],
  predecessor: ['predecessor-lock.json', 'predecessor-lock.v1.json', '1'],
  provenance: ['manifest.json', 'provenance.v1.json', '1'],
});
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const versions = { openapi: '1.24.0', schema: '1.29', migration: '0041', exportProfile: 'content-intake-readiness-successor-v1' };
const json = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);

/** Approval owns lifecycle state; the approved candidate bytes are never rewritten. */
export function approvedInputs(read, frozen = false) {
  const approvalBytes = Buffer.from(read(APPROVAL));
  const approval = JSON.parse(approvalBytes);
  assert.equal(approval.schema, 'customer-agent-readiness-successor-approval/v1');
  assert.equal(approval.status, 'APPROVED');
  assert.deepEqual(approval.versions, versions);
  for (const key of ['freezeApproved', 'exportApproved', 'intakeApproved', 'syntheticOnly']) assert.equal(approval[key], true, key);
  for (const key of ['runtimeActivated', 'productionConsumerReady']) assert.equal(approval[key], false, key);
  assert.deepEqual(Object.keys(approval.artifacts).sort(), Object.values(MEMBERS).map(v => v[0]).sort());
  const files = new Map();
  for (const [key, [candidate, name]] of Object.entries(MEMBERS)) {
    const bytes = Buffer.from(read(frozen ? `${FROZEN}/${name}` : `${CANDIDATE}/${candidate}`));
    assert.equal(hash(bytes), approval.artifacts[candidate], `Approved bytes drifted: ${key}`);
    files.set(name, bytes);
  }
  const provenance = JSON.parse(files.get('provenance.v1.json'));
  assert.equal(hash(files.get('provenance.v1.json')), approval.approvedCandidateManifestSha256);
  for (const [candidate, name] of Object.values(MEMBERS).filter(([candidate]) => provenance.artifacts[candidate])) {
    assert.equal(provenance.artifacts[candidate].sha256 ?? provenance.artifacts[candidate], hash(files.get(name)));
  }
  const predecessor = JSON.parse(files.get('predecessor-lock.v1.json'));
  assert.equal(predecessor.migrations.length, 40);
  assert.deepEqual(predecessor.migrations.map(m => m.position), Array.from({ length: 40 }, (_, i) => i + 1));
  files.set('approval.v1.json', approvalBytes);
  return { approval, files };
}

export function freezeReadinessSuccessor(sourceRoot = root, write = false) {
  const read = file => readFileSync(path.join(sourceRoot, file));
  const approved = approvedInputs(read);
  if (write) mkdirSync(path.join(sourceRoot, FROZEN), { recursive: true });
  for (const [name, bytes] of approved.files) {
    // Approval remains at its versioned authority path, and is included in the bundle later.
    if (name === 'approval.v1.json') continue;
    const destination = path.join(sourceRoot, FROZEN, name);
    if (existsSync(destination)) {
      assert.ok(lstatSync(destination).isFile() && !lstatSync(destination).isSymbolicLink(), 'Frozen input must be regular');
      assert.ok(readFileSync(destination).equals(bytes), `Refuse to overwrite frozen input: ${name}`);
    } else if (write) writeFileSync(destination, bytes, { flag: 'wx' });
    else throw new Error(`Frozen input missing: ${name}`);
  }
  approvedInputs(read, true);
  return { status: 'FROZEN_NOT_EXPORTED_NOT_INTAKE', versions };
}

/** Source Git is the authority. Uncommitted approval or payload cannot be exported. */
export function buildReadinessContractSet(sourceRoot = root) {
  const git = args => execFileSync('git', ['-C', sourceRoot, ...args], { maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  assert.equal(realpathSync(git(['rev-parse', '--show-toplevel']).toString().trim()), realpathSync(sourceRoot));
  assert.equal(git(['rev-parse', '--is-shallow-repository']).toString().trim(), 'false', 'Complete source history required');
  const sha = git(['rev-parse', 'HEAD']).toString().trim();
  const read = relative => {
    const bytes = git(['show', `${sha}:${relative}`]);
    const local = path.join(sourceRoot, relative);
    assert.ok(lstatSync(local).isFile() && !lstatSync(local).isSymbolicLink(), 'Source must be regular');
    assert.ok(readFileSync(local).equals(bytes), `Uncommitted frozen input: ${relative}`);
    return bytes;
  };
  const { files } = approvedInputs(read, true);
  const descriptors = Object.fromEntries(Object.entries(MEMBERS).map(([key, [, file, version]]) => [key, {
    version, source_path: `${FROZEN}/${file}`, file, sha256: hash(files.get(file)), bytes: files.get(file).length,
  }]));
  const approval = { version: '1', source_path: APPROVAL, file: 'approval.v1.json', sha256: hash(files.get('approval.v1.json')), bytes: files.get('approval.v1.json').length };
  const { openapi, database, ...readiness } = descriptors;
  const manifest = { schema: 'customer-agent-contract-set/v7', contract_set_id: `cs-ai-c11-openapi-1.24.0-schema-1.29-${sha.slice(0, 12)}`,
    source_repository: 'ai-赋能立项', source_git_sha: sha, architecture_version: '1.16', implementation_version: '1.22',
    openapi, database, readiness: { ...readiness, approval } };
  // Virtual artifacts are reconstructed from the verified installed predecessor.
  // Source Git still contains the complete frozen reference for provenance checks.
  files.delete('openapi.v1.yaml'); files.delete('schema-v1.29.sql');
  files.set('contract-set.json', json(manifest));
  return { manifest, files };
}

export function writeReadinessContractSet(sourceRoot = root, outputRoot = path.join(sourceRoot, 'output/customer-agent-readiness-contract-sets')) {
  const built = buildReadinessContractSet(sourceRoot); // Fail before creating output.
  mkdirSync(outputRoot, { recursive: true });
  const destination = path.join(outputRoot, built.manifest.contract_set_id);
  const matches = () => {
    assert.ok(lstatSync(destination).isDirectory() && !lstatSync(destination).isSymbolicLink());
    assert.deepEqual(readdirSync(destination).sort(), [...built.files.keys()].sort());
    for (const [name, bytes] of built.files) {
      const f = path.join(destination, name); assert.ok(lstatSync(f).isFile() && !lstatSync(f).isSymbolicLink());
      assert.ok(readFileSync(f).equals(bytes), `Existing export differs: ${name}`);
    }
  };
  if (existsSync(destination)) matches();
  else {
    const temporary = mkdtempSync(path.join(outputRoot, '.readiness-export-'));
    try {
      for (const [name, bytes] of built.files) writeFileSync(path.join(temporary, name), bytes, { flag: 'wx', mode: 0o444 });
      try { renameSync(temporary, destination); }
      catch (error) { if (!['EEXIST', 'ENOTEMPTY'].includes(error.code)) throw error; matches(); }
    } finally { rmSync(temporary, { recursive: true, force: true }); }
  }
  return { status: 'EXPORTED_NOT_INTAKE', directory: destination, contractSetId: built.manifest.contract_set_id, sourceGitSha: built.manifest.source_git_sha };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const command = process.argv[2];
  if (!['--freeze', '--check', '--export'].includes(command) || process.argv.length !== 3) throw new Error('Use --freeze, --check or --export');
  console.log(JSON.stringify(command === '--export' ? writeReadinessContractSet() : freezeReadinessSuccessor(root, command === '--freeze'), null, 2));
}
