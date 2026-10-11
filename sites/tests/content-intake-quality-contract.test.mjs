import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import Ajv from 'ajv/dist/2020.js';
import {
  buildIntakeQualityContractFiles, buildIntakeUsageContractFiles,
  INTAKE_QUALITY_CONTRACT_PATHS, INTAKE_QUALITY_SOURCE, INTAKE_USAGE_CONTRACT_PATHS,
} from '../../business-docs/08-工具/build_customer_agent_backend_contract.mjs';
import * as builder from '../../business-docs/08-工具/build_customer_agent_backend_contract.mjs';
import { OWNER_PROFILE_PATH, OWNER_CONTRACT_PATHS } from '../../business-docs/08-工具/build_customer_agent_owner_contract.mjs';
import { CONTRACT_SOURCE_PATHS, assertIntakeQualityExportGate, loadContractSetFromCommit } from '../../business-docs/08-工具/export_customer_agent_contract_set.mjs';

const root = new URL('../../', import.meta.url);
const read = file => readFileSync(new URL(file, root));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const used = new Set();
const generated = buildIntakeQualityContractFiles(file => { used.add(file); return read(file); });
const previous = buildIntakeUsageContractFiles(read);
const delta = JSON.parse(read(INTAKE_QUALITY_SOURCE));
const schemasFrom = bytes => Object.fromEntries(bytes.toString().split('\n')
  .filter(line => /^    Intake[A-Za-z0-9]+: /.test(line))
  .map(line => { const i = line.indexOf(': '); return [line.slice(4, i), JSON.parse(line.slice(i + 2))]; }));
const pathsFrom = bytes => Object.fromEntries(bytes.toString().split('\n')
  .filter(line => /^  "\/v1\/intake\//.test(line))
  .map(line => { const i = line.indexOf(': '); return [JSON.parse(line.slice(2, i)), JSON.parse(line.slice(i + 2))]; }));
const schemas = schemasFrom(generated.openapi);
const paths = pathsFrom(generated.openapi);
const ajv = new Ajv({ strict: true, allowUnionTypes: true });
ajv.addKeyword('components');
ajv.addFormat('date-time', value => Number.isFinite(Date.parse(value)));
ajv.addSchema({ $id: 'urn:synthetic:intake-quality', components: { schemas } });
const validate = name => ajv.compile({ $ref: `urn:synthetic:intake-quality#/components/schemas/IntakeQuality${name}` });
const key = { candidateId: 'candidate-synthetic', version: 1, digest: 'a'.repeat(64) };
const check = i => ({ scriptId: `intake_${hash(String(i))}`, contentHash: hash(`content-${i}`), defect: false, reason: '' });
const plan = { policyVersion: 'intake-quality-v1', ordinaryCount: 3, mandatoryCount: 0, withdrawalCount: 0,
  initialTarget: 3, expandedTarget: 3, initialCount: 3, expandedCount: 3,
  seedHash: 'a'.repeat(64), populationManifestHash: 'b'.repeat(64), selectionManifestHash: 'c'.repeat(64) };
const attribution = { principalId: 'reviewer-synthetic', factsVersion: 1, recordedAt: '2026-10-07T00:00:00Z' };
const status = { key, viewHash: 'd'.repeat(64), state: 'not_frozen', plan, frozen: null, rounds: [] };
const round = { phase: 'initial', reviewer: attribution, checkedCount: 3, defectCount: 0 };
const entry = { businessEntryId: 'faq-one', scriptVersion: 1, operation: 'upsert', title: '合成标题', answerText: '第一行\n第二行',
  questions: [], productRefs: [], scenarioRefs: [], effectiveFrom: '2026-01-01T00:00:00Z', effectiveTo: null,
  applicabilityNote: '', familySourceId: null, familyBusinessEntryId: null, brandNonOverridable: false,
  category: '合成分类', internalNote: '审核可见说明', riskNote: '', attachmentNote: '' };
const sample = { scriptId: check(1).scriptId, contentHash: check(1).contentHash, mandatory: false, entry, check: null };

test('quality candidate is deterministic, HTTP-only and preserves every previous path and schema', () => {
  assert.ok(read(INTAKE_QUALITY_CONTRACT_PATHS.openapi).equals(generated.openapi));
  assert.ok(generated.database.equals(previous.database));
  assert.equal(INTAKE_QUALITY_CONTRACT_PATHS.database, INTAKE_USAGE_CONTRACT_PATHS.database);
  assert.equal(hash(previous.openapi), '3e0a3f122aefa0bff9c330e105f1a5cbb2b26662fd5f04db1ef3a93ac1bc1121');
  assert.equal(hash(previous.database), '5f958e4f7dcde7e11f9a6d38d8339b96654517209a493776acbfc7c3f5202013');
  for (const [name, schema] of Object.entries(schemasFrom(previous.openapi))) assert.deepEqual(schemas[name], schema, name);
  for (const [route, item] of Object.entries(pathsFrom(previous.openapi))) assert.deepEqual(paths[route], item, route);
  assert.match(generated.openapi.toString(), /version: 1.18.0/);
  assert.match(generated.openapi.toString(), /x-content-intake-quality-development: .*"status":"DRAFT".*"runtime_activated":false/);
});

test('real generated schemas compile with standard JSON Schema, including predecessor references', () => {
  for (const name of Object.keys(schemas)) ajv.compile({ $ref: `urn:synthetic:intake-quality#/components/schemas/${name}` });
});

test('five authenticated routes have bounded transport and an isolated recovery namespace', () => {
  assert.equal(Object.keys(delta.paths).length, 5);
  const operations = new Set();
  for (const route of Object.keys(delta.paths)) for (const operation of Object.values(paths[route])) {
    assert.deepEqual(operation.security, [{ ProductSession: [] }]);
    assert.equal(operations.has(operation.operationId), false); operations.add(operation.operationId);
    for (const code of ['400', '401', '404', '409', '413', '503']) assert.ok(operation.responses[code]);
    assert.ok(operation['x-max-response-bytes'] <= 8 * 1024 ** 2);
    if (operation.requestBody) assert.ok(operation['x-max-request-bytes'] <= 8 * 1024 ** 2);
  }
  const sampleRead = paths[Object.keys(delta.paths).find(p => p.endsWith('/samples'))].get;
  assert.deepEqual(sampleRead.parameters.map(p => p.name), ['candidateId', 'version', 'digest', 'viewHash', 'phase', 'cursor', 'limit']);
  assert.equal(sampleRead.parameters.find(p => p.name === 'viewHash').required, true);
  assert.deepEqual(sampleRead.parameters.at(-1).schema, { type: 'integer', minimum: 1, maximum: 100, default: 50 });
  const recovery = paths['/v1/intake/quality/operations/{operationId}'].get;
  assert.deepEqual(recovery.parameters[1].schema.enum, ['quality-freeze', 'quality-check']);
  assert.deepEqual(paths['/v1/intake/operations/{operationId}'].get.parameters[1].schema.enum, ['publish', 'cancel', 'rollback']);
});

test('quality commands cannot supply authority, sample plans or conclusions', () => {
  const command = { operationId: 'operation-synthetic', key };
  assert.ok(validate('Command')(command));
  const submit = { ...command, phase: 'initial', checks: [check(1)] };
  assert.ok(validate('Submission')(submit));
  for (const name of ['actorId', 'role', 'seedHash', 'sampleIds', 'state', 'approved', 'reviewer', 'factsVersion', 'ticket']) {
    assert.equal(validate('Command')({ ...command, [name]: 'forged' }), false, name);
    assert.equal(validate('Submission')({ ...submit, [name]: 'forged' }), false, name);
  }
  for (const phase of ['passed', 'final', null]) assert.equal(validate('Submission')({ ...submit, phase }), false);
  assert.equal(validate('Submission')({ ...submit, checks: Array.from({ length: 5001 }, (_, i) => check(i)) }), false);
  assert.equal(validate('Submission')({ ...submit, key: { ...key, version: 0 } }), false);
});

test('defects require meaningful bounded Unicode reasons and reject invalid database strings', () => {
  const valid = validate('Check');
  assert.ok(valid({ ...check(1), defect: true, reason: '合成问题\n需要修订' }));
  for (const reason of ['', ' ', '\n\t', '\u00a0']) assert.equal(valid({ ...check(1), defect: true, reason }), false);
  assert.ok(valid({ ...check(1), defect: true, reason: '🧪'.repeat(1000) }), 'length is code points, not UTF-16 units');
  for (const reason of ['x'.repeat(1001), '\0', '\ud800', '\udfff']) assert.equal(valid({ ...check(1), reason }), false);
  assert.equal(valid({ ...check(1), scriptId: 'client-selected' }), false);
  assert.equal(valid({ ...check(1), contentHash: 'not-a-hash' }), false);
});

test('current summary separates preview, durable attribution and unique phase rounds', () => {
  const valid = validate('Status');
  assert.ok(valid(status), JSON.stringify(valid.errors));
  assert.ok(valid({ ...status, state: 'passed', frozen: attribution, rounds: [round] }));
  assert.equal(valid({ ...status, frozen: attribution }), false);
  assert.equal(valid({ ...status, rounds: [round] }), false);
  assert.equal(valid({ ...status, state: 'passed' }), false);
  assert.equal(valid({ ...status, state: 'passed', frozen: attribution, rounds: [round, { ...round, checkedCount: 2 }] }), false);
  assert.equal(valid({ ...status, plan: { ...plan, population: [] } }), false);
});

test('sample page preserves complete review text without making a published-entry projection', () => {
  const page = { key, viewHash: status.viewHash, phase: 'initial', selectionManifestHash: plan.selectionManifestHash, items: [sample], nextCursor: null };
  const valid = validate('SamplePage');
  assert.ok(valid(JSON.parse(JSON.stringify(page))), JSON.stringify(valid.errors));
  assert.equal(page.items[0].entry.answerText, '第一行\n第二行');
  assert.equal(page.items[0].entry.internalNote, '审核可见说明');
  assert.equal(valid({ ...page, items: Array(101).fill(sample) }), false);
  assert.equal(valid({ ...page, nextCursor: '' }), false);
  assert.equal(valid({ ...page, sessionToken: 'forged' }), false);
});

test('5000-check bodies and long review entries have measurable aggregate byte limits', () => {
  const route = paths[Object.keys(delta.paths).find(p => p.endsWith('/checks'))].post;
  const body = { operationId: 'capacity-synthetic', key, phase: 'initial', checks: Array.from({ length: 5000 }, (_, i) => ({ ...check(i), reason: '🧪'.repeat(100) })) };
  assert.ok(validate('Submission')(body));
  const bytes = Buffer.from(JSON.stringify(body));
  assert.ok(bytes.length > 65536 && bytes.length < route['x-max-request-bytes']);
  assert.equal(JSON.parse(bytes).checks.length, 5000);
  for (const c of body.checks) c.reason = '🧪'.repeat(1000);
  assert.ok(validate('Submission')(body), 'per-field validity does not bypass aggregate transport/storage limits');
  const oversized = Buffer.byteLength(JSON.stringify(body));
  assert.ok(oversized > route['x-max-request-bytes']);
  const longEntry = { ...entry, title: '🧪'.repeat(512), answerText: '🧪'.repeat(32767),
    category: '🧪'.repeat(32767), internalNote: '🧪'.repeat(32767), riskNote: '🧪'.repeat(32767),
    applicabilityNote: '🧪'.repeat(4096), questions: Array.from({ length: 100 }, (_, i) => ({ id: `q${i}`, version: 1, text: '🧪'.repeat(4096), active: true })) };
  const longPage = { key, viewHash: status.viewHash, phase: 'initial', selectionManifestHash: plan.selectionManifestHash, items: [{ ...sample, entry: longEntry }], nextCursor: null };
  assert.ok(validate('SamplePage')(longPage));
  const encoded = Buffer.from(JSON.stringify(longPage));
  assert.ok(encoded.length > 2 * 1024 ** 2 && encoded.length < 8 * 1024 ** 2);
  assert.deepEqual(JSON.parse(encoded), longPage, 'consumer round-trip does not truncate material');
  console.log(JSON.stringify({ probe: 'quality-capacity', acceptedRequestBytes: bytes.length, oversizedRequestBytes: oversized,
    largestFieldSamplePageBytes: encoded.length, transportLimit: route['x-max-request-bytes'], checks: body.checks.length }));
});

test('receipts contain historical status only and discriminate freeze from check', () => {
  const valid = validate('Receipt');
  const receipt = { operationId: 'operation-synthetic', action: 'quality-freeze', key, state: 'initial_required', phase: null };
  assert.ok(valid(receipt));
  assert.ok(valid({ ...receipt, action: 'quality-check', state: 'passed', phase: 'initial' }));
  for (const bad of [{ ...receipt, state: 'not_frozen' }, { ...receipt, phase: 'initial' },
    { ...receipt, action: 'quality-check' }, { ...receipt, action: 'quality-check', phase: 'initial' },
    { ...receipt, action: 'publish' }, { ...receipt, checks: [check(1)] }, { ...receipt, plan }]) assert.equal(valid(bad), false);
});

test('generator rejects collisions instead of mutating the approved predecessor', () => {
  for (const [kind, key] of [['paths', '/v1/intake/snapshot'], ['schemas', 'IntakeCandidateKey']]) {
    const mutated = structuredClone(delta);
    if (kind === 'paths') mutated.paths[key] = { get: {} }; else mutated.components.schemas[key] = {};
    assert.throws(() => buildIntakeQualityContractFiles(file => file === INTAKE_QUALITY_SOURCE ? Buffer.from(JSON.stringify(mutated)) : read(file)), /collision/);
  }
});

test('quality freeze exports only the approved exact pair and rejects every downgrade path', () => {
  const repo = mkdtempSync(path.join(tmpdir(), 'intake-quality-export-'));
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const write = (file, bytes) => {
    mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
    writeFileSync(path.join(repo, file), bytes);
  };
  try {
    const files = new Set([...used, ...Object.values(CONTRACT_SOURCE_PATHS), ...Object.values(OWNER_CONTRACT_PATHS),
      OWNER_PROFILE_PATH, builder.INTAKE_APPROVAL_PATH, builder.INTAKE_USAGE_APPROVAL_PATH,
      'business-docs/01-客服Agent项目/90-评审/2026-09-09_后端合成开发批准.md']);
    for (const name of ['BACKEND_CONTRACT_PATHS', 'CLOSURE_CONTRACT_PATHS', 'OPS_LOOP_CONTRACT_PATHS',
      'COACH_PUBLISH_CONTRACT_PATHS', 'INTAKE_CONTRACT_PATHS', 'INTAKE_USAGE_CONTRACT_PATHS', 'INTAKE_QUALITY_CONTRACT_PATHS']) {
      for (const file of Object.values(builder[name])) files.add(file);
    }
    for (const file of files) write(file, read(file));
    write(OWNER_PROFILE_PATH, JSON.stringify({ schema: 'customer-agent-contract-profile/v1', profile: 'content-intake-quality-v1' }));
    git('init', '-q'); git('config', 'user.email', 'synthetic@example.invalid'); git('config', 'user.name', 'Synthetic');
    git('config', 'commit.gpgsign', 'false');
    const commit = () => { git('add', '--all'); git('commit', '-qm', 'synthetic quality export fixture'); return git('rev-parse', 'HEAD'); };
    const options = { repository: repo, expectedOpenapiSha256: hash(generated.openapi), expectedDatabaseSha256: hash(generated.database) };
    const load = () => loadContractSetFromCommit({ ...options, sourceGitSha: commit() });
    // The predecessor is a complete local fixture, independent of branch history.
    write(OWNER_PROFILE_PATH, JSON.stringify({ schema: 'customer-agent-contract-profile/v1', profile: 'content-intake-usage-v1' }));
    const historical = { ...options, sourceGitSha: commit(), expectedOpenapiSha256: hash(previous.openapi), expectedDatabaseSha256: hash(previous.database) };
    const predecessor = loadContractSetFromCommit(historical);
    assert.equal(predecessor.manifest.openapi.version, '1.17.0');
    assert.ok(predecessor.files.get(predecessor.manifest.openapi.file).equals(previous.openapi));
    assert.throws(() => loadContractSetFromCommit({ ...historical, expectedOpenapiSha256: options.expectedOpenapiSha256 }), /OpenAPI blob 哈希不匹配/);
    write(OWNER_PROFILE_PATH, JSON.stringify({ schema: 'customer-agent-contract-profile/v1', profile: 'content-intake-quality-v1' }));
    assert.throws(load, 'usage approval cannot approve new quality HTTP');
    const approval = read(builder.INTAKE_QUALITY_APPROVAL_PATH).toString();
    write(builder.INTAKE_QUALITY_APPROVAL_PATH, approval.replace(options.expectedOpenapiSha256, 'f'.repeat(64)));
    assert.throws(load, /双哈希不一致/);
    write(builder.INTAKE_QUALITY_APPROVAL_PATH, approval);
    const frozen = read(INTAKE_QUALITY_CONTRACT_PATHS.increment).toString();
    write(INTAKE_QUALITY_CONTRACT_PATHS.increment, frozen.replace('FROZEN · NOT EXPORTED', 'DRAFT · NOT FROZEN · NOT EXPORTED'));
    assert.throws(load, /未冻结/);
    write(INTAKE_QUALITY_CONTRACT_PATHS.increment, frozen.replaceAll(options.expectedOpenapiSha256, 'f'.repeat(64)));
    assert.throws(load, /双哈希不一致/);
    write(INTAKE_QUALITY_CONTRACT_PATHS.increment, frozen);
    const sourceGitSha = commit();
    const exported = loadContractSetFromCommit({ ...options, sourceGitSha });
    assert.equal(exported.manifest.openapi.version, '1.18.0');
    assert.equal(exported.manifest.database.version, 'schema.v1.21');
    assert.ok(exported.files.get(exported.manifest.database.file).equals(previous.database));
    assertIntakeQualityExportGate(read, { openapiHash: options.expectedOpenapiSha256, databaseHash: options.expectedDatabaseSha256 });
    write(builder.INTAKE_QUALITY_APPROVAL_PATH, 'NOT APPROVED');
    assert.equal(loadContractSetFromCommit({ ...options, sourceGitSha }).manifest.source_git_sha, sourceGitSha, 'dirty approval is ignored');
    assert.throws(load, /缺 P2/);
    write(builder.INTAKE_QUALITY_APPROVAL_PATH, approval);
    const drift = Buffer.concat([generated.openapi, Buffer.from('\n# drift\n')]);
    write(INTAKE_QUALITY_CONTRACT_PATHS.openapi, drift);
    assert.throws(() => loadContractSetFromCommit({ ...options, sourceGitSha: commit(), expectedOpenapiSha256: hash(drift) }), /派生产物漂移/);
    write(INTAKE_QUALITY_CONTRACT_PATHS.openapi, generated.openapi);
    write(OWNER_PROFILE_PATH, JSON.stringify({ schema: 'customer-agent-contract-profile/v1', profile: 'content-intake-usage-v1' }));
    assert.throws(load, /拒绝降级 content-intake-quality/);
    rmSync(path.join(repo, builder.INTAKE_QUALITY_APPROVAL_PATH));
    assert.throws(load, /拒绝降级 content-intake-quality/, 'deleting approval cannot erase the milestone');
    rmSync(path.join(repo, OWNER_PROFILE_PATH));
    assert.throws(load, /删除了既有合同 profile/);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test('regression: quality response cannot claim completed checks without initial history', () => {
  const valid = validate('Status');
  for (const value of [
    { ...status, state: 'passed', frozen: attribution },
    { ...status, state: 'passed', frozen: attribution, rounds: [{ ...round, phase: 'expanded' }] },
    { ...status, state: 'initial_required', frozen: attribution, rounds: [round] },
    { ...status, state: 'expansion_required', frozen: attribution, rounds: [round, { ...round, phase: 'expanded' }] },
  ]) assert.equal(valid(value), false, JSON.stringify(value));
  assert.equal(validate('Receipt')({ operationId: 'synthetic-check', action: 'quality-check', key,
    phase: 'expanded', state: 'expansion_required' }), false);
  assert.ok(valid({ ...status, state: 'initial_required', frozen: attribution }));
  assert.ok(valid({ ...status, state: 'expansion_required', frozen: attribution, rounds: [round] }));
  assert.ok(valid({ ...status, state: 'passed', frozen: attribution,
    plan: { ...plan, ordinaryCount: 0, initialTarget: 0, expandedTarget: 0, initialCount: 0, expandedCount: 0 },
    rounds: [{ ...round, checkedCount: 0 }] }), 'zero population passes after an explicit empty initial round');
});

test('regression: quality response sample excludes withdrawals without changing IntakeEntry', () => {
  const disabled = { ...sample, entry: { ...entry, operation: 'disable' } };
  assert.equal(validate('Sample')(disabled), false);
  const priorEntry = ajv.compile({ $ref: 'urn:synthetic:intake-quality#/components/schemas/IntakeEntry' });
  assert.ok(priorEntry(disabled.entry), 'full material retains explicit withdrawals');
  assert.ok(validate('Sample')(sample));
});

test('regression: quality response pagination requires progress for a continuation', () => {
  const page = { key, viewHash: status.viewHash, phase: 'initial', selectionManifestHash: plan.selectionManifestHash,
    items: [], nextCursor: 'synthetic-continuation' };
  assert.equal(validate('SamplePage')(page), false);
  assert.ok(validate('SamplePage')({ ...page, nextCursor: null }), 'empty terminal phase is valid');
  assert.ok(validate('SamplePage')({ ...page, items: [sample] }));
});
