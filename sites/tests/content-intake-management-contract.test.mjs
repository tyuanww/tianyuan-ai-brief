import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Ajv from 'ajv/dist/2020.js';
import {
  buildIntakeManagementContractFiles, buildIntakeQualityContractFiles,
  INTAKE_MANAGEMENT_CONTRACT_PATHS, INTAKE_MANAGEMENT_SOURCE, INTAKE_QUALITY_CONTRACT_PATHS,
} from '../../business-docs/08-工具/build_customer_agent_backend_contract.mjs';
import * as builder from '../../business-docs/08-工具/build_customer_agent_backend_contract.mjs';
import { OWNER_PROFILE_PATH, OWNER_CONTRACT_PATHS } from '../../business-docs/08-工具/build_customer_agent_owner_contract.mjs';
import { CONTRACT_SOURCE_PATHS, assertIntakeManagementExportGate, loadContractSetFromCommit } from '../../business-docs/08-工具/export_customer_agent_contract_set.mjs';

const root = new URL('../../', import.meta.url);
const read = file => readFileSync(new URL(file, root));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const used = new Set();
const generated = buildIntakeManagementContractFiles(file => { used.add(file); return read(file); });
const previous = buildIntakeQualityContractFiles(read);
const delta = JSON.parse(read(INTAKE_MANAGEMENT_SOURCE));
const schemasFrom = bytes => Object.fromEntries(bytes.toString().split('\n')
  .filter(line => /^    Intake[A-Za-z0-9]+: /.test(line))
  .map(line => { const i = line.indexOf(': '); return [line.slice(4, i), JSON.parse(line.slice(i + 2))]; }));
const pathsFrom = bytes => Object.fromEntries(bytes.toString().split('\n')
  .filter(line => /^  "\/v1\/intake\//.test(line))
  .map(line => { const i = line.indexOf(': '); return [JSON.parse(line.slice(2, i)), JSON.parse(line.slice(i + 2))]; }));
const schemas = schemasFrom(generated.openapi), paths = pathsFrom(generated.openapi);
const ajv = new Ajv({ strict: true, allowUnionTypes: true });
ajv.addKeyword('components');
ajv.addFormat('date-time', value => Number.isFinite(Date.parse(value)));
ajv.addSchema({ $id: 'urn:synthetic:intake-management', components: { schemas } });
const validate = name => ajv.compile({ $ref: `urn:synthetic:intake-management#/components/schemas/${name}` });
const context = { sourceId: 'source-synthetic', sourceVersion: 3, baseReleaseId: null,
  principalId: 'principal-synthetic', factsVersion: 2, validUntil: '2026-10-07T00:05:00Z' };
const participant = { principalId: 'principal-synthetic', displayLabel: '合成参与人', factsVersion: 2,
  validUntil: context.validUntil, enabled: true };

test('management generation adds one read while preserving all frozen paths, schemas and SQL bytes', () => {
  assert.ok(read(INTAKE_MANAGEMENT_CONTRACT_PATHS.openapi).equals(generated.openapi));
  assert.ok(read(INTAKE_QUALITY_CONTRACT_PATHS.openapi).equals(previous.openapi));
  assert.equal(hash(previous.openapi), '7982b5b05b1e686e446544db092e6c73325ad0386a1772e2b004e282ff792664');
  assert.equal(hash(previous.database), '5f958e4f7dcde7e11f9a6d38d8339b96654517209a493776acbfc7c3f5202013');
  assert.ok(generated.database.equals(previous.database));
  assert.equal(INTAKE_MANAGEMENT_CONTRACT_PATHS.database, INTAKE_QUALITY_CONTRACT_PATHS.database);
  for (const [name, schema] of Object.entries(schemasFrom(previous.openapi))) assert.deepEqual(schemas[name], schema, name);
  for (const [route, item] of Object.entries(pathsFrom(previous.openapi))) assert.deepEqual(paths[route], item, route);
  assert.equal(Object.keys(delta.paths).length, 1);
  assert.match(generated.openapi.toString(), /version: 1.19.0/);
  assert.match(generated.openapi.toString(), /x-content-intake-management-development: .*"status":"DRAFT".*"exportApproved":false/);
});

test('all actual generated Intake schemas compile with a standard consumer', () => {
  for (const name of Object.keys(schemas)) validate(name);
});

test('context accepts no publication yet and exact source/self versions without exposing authority', () => {
  const valid = validate('IntakeManagementContext');
  assert.ok(valid(context), JSON.stringify(valid.errors));
  assert.ok(valid({ ...context, baseReleaseId: 'release-synthetic' }));
  const wire = JSON.parse(JSON.stringify(context));
  assert.deepEqual(wire, context);
  for (const field of Object.keys(context)) {
    const missing = { ...context }; delete missing[field];
    assert.equal(valid(missing), false, field);
  }
  for (const name of ['userId', 'sessionToken', 'tenantId', 'role', 'displayLabel', 'mayPublish', 'source', 'entitlement', 'approved']) {
    assert.equal(valid({ ...context, [name]: 'forged' }), false, name);
  }
});

test('context rejects malformed identifiers, ambiguous versions and invalid expiry', () => {
  const valid = validate('IntakeManagementContext');
  for (const sourceId of ['', '../other', 'x'.repeat(129)]) assert.equal(valid({ ...context, sourceId }), false);
  for (const principalId of ['', 'with space', 'x'.repeat(129)]) assert.equal(valid({ ...context, principalId }), false);
  for (const baseReleaseId of ['', '../release', 1, false]) assert.equal(valid({ ...context, baseReleaseId }), false);
  for (const name of ['sourceVersion', 'factsVersion']) {
    for (const value of [0, -1, 1.5, '1', 9007199254740992, null]) assert.equal(valid({ ...context, [name]: value }), false);
  }
  assert.equal(valid({ ...context, validUntil: 'not-time' }), false);
});

test('management read uses ProductSession, import authority and bounded no-store response', () => {
  const operation = paths['/v1/intake/sources/{sourceId}/management-context'].get;
  assert.deepEqual(operation.security, [{ ProductSession: [] }]);
  assert.equal(operation['x-required-intake-action'], 'import');
  assert.equal(operation['x-max-response-bytes'], 65536);
  assert.equal(operation.responses['200'].headers['Cache-Control'].schema.const, 'no-store');
  assert.deepEqual(operation.parameters, [{ name: 'sourceId', in: 'path', required: true,
    schema: { $ref: '#/components/schemas/IntakeId' } }]);
  assert.equal(operation.requestBody, undefined);
  for (const status of ['400', '401', '404', '409', '503']) assert.ok(operation.responses[status]);
});

test('existing participant selector retains source/purpose limits and disabled contributor identity', () => {
  const selector = paths['/v1/intake/principals'].get;
  assert.deepEqual(selector.parameters.map(p => p.name), ['sourceId', 'limit', 'cursor', 'purpose']);
  assert.deepEqual(selector.parameters.at(-1).schema.enum, ['grant-recipient', 'contributor']);
  assert.deepEqual(selector.parameters.find(p => p.name === 'limit').schema,
    { type: 'integer', minimum: 1, maximum: 100, default: 50 });
  const valid = validate('IntakePrincipalPage');
  assert.ok(valid({ items: [participant, { ...participant, principalId: 'former-synthetic', enabled: false }], nextCursor: null }));
  assert.equal(valid({ items: [{ ...participant, email: 'synthetic@example.invalid' }], nextCursor: null }), false);
  assert.equal(valid({ items: Array(101).fill(participant), nextCursor: null }), false);
  assert.equal(valid({ items: [], nextCursor: 'x'.repeat(513) }), false);
  assert.ok(valid({ items: [], nextCursor: 'next-synthetic' }), 'filtered scan may advance with an empty page');
});

test('maximum directory fields survive JSON and fit the specified bounded page', () => {
  const page = { items: Array.from({ length: 100 }, (_, i) => ({ ...participant,
    principalId: `${i}`.padEnd(128, 'x'), displayLabel: '🧪'.repeat(256), factsVersion: 9007199254740991 })),
  nextCursor: 'x'.repeat(512) };
  assert.ok(validate('IntakePrincipalPage')(page));
  const encoded = Buffer.from(JSON.stringify(page));
  assert.ok(encoded.length < 262144);
  assert.deepEqual(JSON.parse(encoded), page);
  assert.equal(page.items[0].displayLabel, '🧪'.repeat(256));
});

test('generator rejects route/schema collisions, new writes and external namespaces', () => {
  const rejects = (change, pattern) => {
    const changed = structuredClone(delta); change(changed);
    assert.throws(() => buildIntakeManagementContractFiles(file => file === INTAKE_MANAGEMENT_SOURCE
      ? Buffer.from(JSON.stringify(changed)) : read(file)), pattern);
  };
  rejects(d => { d.paths['/v1/intake/principals'] = Object.values(d.paths)[0]; }, /collision/);
  rejects(d => { d.paths['/v1/unrelated'] = Object.values(d.paths)[0]; }, /namespace/);
  rejects(d => { Object.values(d.paths)[0].post = Object.values(d.paths)[0].get; }, /Unsupported management method/);
  rejects(d => { d.components.schemas.IntakeId = {}; }, /schema collision/);
});

test('CLI unknown options fail before writing any generated output', () => {
  const before = read(INTAKE_MANAGEMENT_CONTRACT_PATHS.openapi);
  const command = new URL('../../business-docs/08-工具/build_customer_agent_backend_contract.mjs', import.meta.url);
  const result = spawnSync(process.execPath, [fileURLToPath(command), '--write-intake-management', '--unexpected'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Use exactly one of/);
  assert.ok(read(INTAKE_MANAGEMENT_CONTRACT_PATHS.openapi).equals(before));
});

test('management freeze exports only the exact approved pair and fails closed across drift, missing approval and downgrade history', () => {
  const repo = mkdtempSync(path.join(tmpdir(), 'intake-management-export-'));
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const write = (file, bytes) => {
    mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
    writeFileSync(path.join(repo, file), bytes);
  };
  try {
    const files = new Set([...used, ...Object.values(CONTRACT_SOURCE_PATHS), ...Object.values(OWNER_CONTRACT_PATHS),
      OWNER_PROFILE_PATH, builder.INTAKE_APPROVAL_PATH, builder.INTAKE_USAGE_APPROVAL_PATH, builder.INTAKE_QUALITY_APPROVAL_PATH,
      'business-docs/01-客服Agent项目/90-评审/2026-09-09_后端合成开发批准.md']);
    for (const name of ['BACKEND_CONTRACT_PATHS', 'CLOSURE_CONTRACT_PATHS', 'OPS_LOOP_CONTRACT_PATHS',
      'COACH_PUBLISH_CONTRACT_PATHS', 'INTAKE_CONTRACT_PATHS', 'INTAKE_USAGE_CONTRACT_PATHS', 'INTAKE_QUALITY_CONTRACT_PATHS', 'INTAKE_MANAGEMENT_CONTRACT_PATHS']) {
      for (const file of Object.values(builder[name])) files.add(file);
    }
    for (const file of files) write(file, read(file));
    git('init', '-q'); git('config', 'user.email', 'synthetic@example.invalid'); git('config', 'user.name', 'Synthetic');
    git('config', 'commit.gpgsign', 'false');
    const commit = () => { git('add', '--all'); git('commit', '-qm', 'synthetic management export fixture'); return git('rev-parse', 'HEAD'); };
    const options = { repository: repo, expectedOpenapiSha256: hash(generated.openapi), expectedDatabaseSha256: hash(generated.database) };
    const load = () => loadContractSetFromCommit({ ...options, sourceGitSha: commit() });
    // Build the predecessor history here; a fresh checkout need not contain any
    // unpublished development commit from the repository that authored this test.
    write(OWNER_PROFILE_PATH, JSON.stringify({ schema: 'customer-agent-contract-profile/v1', profile: 'content-intake-quality-v1' }));
    const historical = { ...options, sourceGitSha: commit(), expectedOpenapiSha256: hash(previous.openapi), expectedDatabaseSha256: hash(previous.database) };
    const predecessor = loadContractSetFromCommit(historical);
    assert.equal(predecessor.manifest.openapi.version, '1.18.0');
    assert.ok(predecessor.files.get(predecessor.manifest.openapi.file).equals(previous.openapi));
    assert.throws(() => loadContractSetFromCommit({ ...historical, expectedOpenapiSha256: options.expectedOpenapiSha256 }), /OpenAPI blob 哈希不匹配/);
    write(OWNER_PROFILE_PATH, JSON.stringify({ schema: 'customer-agent-contract-profile/v1', profile: 'content-intake-management-v1' }));
    const rejectShallow = sourceGitSha => {
      const shallow = mkdtempSync(path.join(tmpdir(), 'intake-management-shallow-'));
      try {
        git('clone', '--quiet', '--depth=1', pathToFileURL(repo).href, shallow);
        assert.equal(execFileSync('git', ['rev-parse', '--is-shallow-repository'], { cwd: shallow, encoding: 'utf8' }).trim(), 'true');
        assert.throws(() => loadContractSetFromCommit({ ...options, sourceGitSha, repository: shallow }), /完整 Git 历史/);
      } finally { rmSync(shallow, { recursive: true, force: true }); }
    };
    assert.throws(load, /git rev-parse 失败/, 'management requires its own approval, not just the quality approval');
    const approval = read(builder.INTAKE_MANAGEMENT_APPROVAL_PATH).toString();
    write(builder.INTAKE_MANAGEMENT_APPROVAL_PATH, read(builder.INTAKE_QUALITY_APPROVAL_PATH));
    assert.throws(load, /双哈希不一致/, 'the previous approved version cannot approve new bytes');
    write(builder.INTAKE_MANAGEMENT_APPROVAL_PATH, approval.replace('APPROVED · CONTRACT ONLY', 'DRAFT · CONTRACT ONLY'));
    assert.throws(load, /缺 P2 管理上下文合同增量批准/);
    write(builder.INTAKE_MANAGEMENT_APPROVAL_PATH, approval);
    const frozen = read(INTAKE_MANAGEMENT_CONTRACT_PATHS.increment).toString();
    write(INTAKE_MANAGEMENT_CONTRACT_PATHS.increment, frozen.replace('FROZEN · NOT EXPORTED', 'DRAFT · NOT FROZEN · NOT EXPORTED'));
    assert.throws(load, /未冻结/);
    write(INTAKE_MANAGEMENT_CONTRACT_PATHS.increment, frozen.replaceAll(options.expectedOpenapiSha256, 'f'.repeat(64)));
    assert.throws(load, /双哈希不一致/);
    write(INTAKE_MANAGEMENT_CONTRACT_PATHS.increment, frozen);
    const sourceGitSha = commit();
    const exported = loadContractSetFromCommit({ ...options, sourceGitSha });
    assert.equal(exported.manifest.openapi.version, '1.19.0');
    assert.equal(exported.manifest.database.version, 'schema.v1.21');
    assert.ok(exported.files.get(exported.manifest.openapi.file).equals(generated.openapi));
    assert.ok(exported.files.get(exported.manifest.database.file).equals(previous.database));
    rejectShallow(sourceGitSha); // Even a valid current pair cannot prove unseen history.
    assertIntakeManagementExportGate(read, { openapiHash: options.expectedOpenapiSha256, databaseHash: options.expectedDatabaseSha256 });
    assert.throws(() => loadContractSetFromCommit({ ...options, sourceGitSha, expectedOpenapiSha256: hash(previous.openapi) }), /OpenAPI blob 哈希不匹配/);
    assert.throws(() => loadContractSetFromCommit({ ...options, sourceGitSha, expectedDatabaseSha256: 'f'.repeat(64) }), /DDL blob 哈希不匹配/);
    write(builder.INTAKE_MANAGEMENT_APPROVAL_PATH, 'NOT APPROVED');
    assert.equal(loadContractSetFromCommit({ ...options, sourceGitSha }).manifest.source_git_sha, sourceGitSha, 'dirty worktree cannot replace committed approval');
    assert.throws(load, /缺 P2/);
    write(builder.INTAKE_MANAGEMENT_APPROVAL_PATH, approval);
    const drift = Buffer.concat([generated.openapi, Buffer.from('\n# synthetic drift\n')]);
    write(INTAKE_MANAGEMENT_CONTRACT_PATHS.openapi, drift);
    assert.throws(() => loadContractSetFromCommit({ ...options, sourceGitSha: commit(), expectedOpenapiSha256: hash(drift) }), /派生产物漂移/);
    write(INTAKE_MANAGEMENT_CONTRACT_PATHS.openapi, generated.openapi);
    const changed = structuredClone(delta); Object.values(changed.paths)[0].get.summary += ' synthetic changed';
    write(INTAKE_MANAGEMENT_SOURCE, JSON.stringify(changed));
    assert.throws(load, /派生产物漂移/, 'matching frozen hashes cannot conceal changed generation sources');
    write(INTAKE_MANAGEMENT_SOURCE, read(INTAKE_MANAGEMENT_SOURCE));
    write(OWNER_PROFILE_PATH, JSON.stringify({ schema: 'customer-agent-contract-profile/v1', profile: 'content-intake-quality-v1' }));
    assert.throws(load, /拒绝降级 content-intake-management/);
    rmSync(path.join(repo, builder.INTAKE_MANAGEMENT_APPROVAL_PATH));
    const removedApprovalSha = commit();
    assert.throws(() => loadContractSetFromCommit({ ...options, sourceGitSha: removedApprovalSha }), /拒绝降级 content-intake-management/, 'deleting the approval does not erase its historical milestone');
    rejectShallow(removedApprovalSha);
    rmSync(path.join(repo, OWNER_PROFILE_PATH));
    assert.throws(load, /删除了既有合同 profile/);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});
