import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import Ajv from 'ajv/dist/2020.js';
import { releaseSteps } from '../scripts/quality-plan.mjs';
import { createShopDirectoryConsumer } from './support/shop-directory-consumer.mjs';
import {
  buildIntakeDirectContractFiles,
  buildIntakeShopDirectoryContractFiles,
  INTAKE_DIRECT_CONTRACT_PATHS,
  INTAKE_SHOP_DIRECTORY_CONTRACT_PATHS,
  INTAKE_SHOP_DIRECTORY_REASONS,
  INTAKE_SHOP_DIRECTORY_SOURCES,
  INTAKE_RUNTIME_SOURCES,
} from '../../business-docs/08-工具/build_customer_agent_backend_contract.mjs';

const read = file => readFileSync(new URL('../../' + file, import.meta.url));
const digest = data => createHash('sha256').update(data).digest('hex');
const generated = buildIntakeShopDirectoryContractFiles(read);
const previous = buildIntakeDirectContractFiles(read);
const delta = JSON.parse(read(INTAKE_SHOP_DIRECTORY_SOURCES.openapi));
const spec = read(INTAKE_SHOP_DIRECTORY_CONTRACT_PATHS.increment).toString('utf8');
const lineValue = (bytes, pattern) => bytes.toString('utf8').split('\n').filter(line => pattern.test(line));
const schemasFrom = bytes => Object.fromEntries(lineValue(bytes, /^    Intake[A-Za-z0-9]+: /).map(line => {
  const index = line.indexOf(': ');
  return [line.slice(4, index), JSON.parse(line.slice(index + 2))];
}));
const pathsFrom = bytes => Object.fromEntries(lineValue(bytes, /^  "\/v1\/intake\//).map(line => {
  const index = line.indexOf(': ');
  return [JSON.parse(line.slice(2, index)), JSON.parse(line.slice(index + 2))];
}));
const schemas = schemasFrom(generated.openapi);
const paths = pathsFrom(generated.openapi);
const previousSchemas = schemasFrom(previous.openapi);
const previousPaths = pathsFrom(previous.openapi);
const ajv = new Ajv({ strict: true, allErrors: true, allowUnionTypes: true });
ajv.addKeyword('components');
ajv.addFormat('date-time', value => Number.isFinite(Date.parse(value)));
ajv.addSchema({ $id: 'urn:synthetic:shop-directory', components: { schemas } });
const validate = name => ajv.compile({ $ref: `urn:synthetic:shop-directory#/components/schemas/${name}` });
const reasonsOf = bytes => schemasFrom(bytes).IntakeFailure.properties.details.properties.reason.enum;

test('approved bytes preserve draft metadata and frozen predecessor without replacing authorization', () => {
  assert.ok(generated.openapi.equals(read(INTAKE_SHOP_DIRECTORY_CONTRACT_PATHS.openapi)));
  assert.ok(generated.database.equals(read(INTAKE_SHOP_DIRECTORY_CONTRACT_PATHS.database)));
  assert.equal(digest(read(INTAKE_DIRECT_CONTRACT_PATHS.openapi)), '1513fe499773c83f4a2b9f0ca8e3a5f7369638f72dc1d18a291235093cfc034d');
  assert.equal(digest(read(INTAKE_DIRECT_CONTRACT_PATHS.database)), 'c5e4896e8ed1ff587e23a70723bd9d81c056ba65561cd9d94963aa6b5f1ae3ce');
  assert.ok(generated.database.includes(read(INTAKE_DIRECT_CONTRACT_PATHS.database)));
  assert.deepEqual(lineValue(generated.openapi, /^  version: /), ['  version: 1.21.0']);
  const markerLine = lineValue(generated.openapi, /^x-content-intake-shop-directory-development: /);
  assert.equal(markerLine.length, 1);
  assert.deepEqual(JSON.parse(markerLine[0].slice('x-content-intake-shop-directory-development: '.length)), {
    status: 'DRAFT', runtime_activated: false, sqlContract: 'schema.v1.23', exportApproved: false,
    frozenOpenapi: '1.20.0', frozenSchema: 'schema.v1.22', nameGrantsBusinessAction: false,
  });
  assert.deepEqual(reasonsOf(generated.openapi), [...reasonsOf(previous.openapi), ...INTAKE_SHOP_DIRECTORY_REASONS]);
  for (const [name, schema] of Object.entries(previousSchemas)) {
    if (name !== 'IntakeFailure') assert.deepEqual(schemas[name], schema, name);
  }
  for (const [route, item] of Object.entries(previousPaths)) assert.deepEqual(paths[route], item, route);
  assert.deepEqual(Object.keys(paths).filter(route => !previousPaths[route]), ['/v1/intake/shop-directory']);
  const having = "HAVING count(DISTINCT r.role)=1\n    AND (min(r.role) IN ('director','manager','supervisor','lead')\n      OR (min(r.role) IN ('agent','enabler') AND p_action='query'))";
  assert.equal(generated.database.toString('utf8').includes(having), true);
  const storage = read(INTAKE_SHOP_DIRECTORY_SOURCES.storage).toString('utf8');
  assert.equal(/CREATE OR REPLACE FUNCTION content_intake\.authorization_deadline/.test(storage), false);
  assert.equal(storage.includes('CREATE TEMP TABLE') || storage.includes('pg_temp'), false);
  const exported = read('business-docs/08-工具/export_customer_agent_contract_set.mjs').toString('utf8');
  assert.equal(exported.includes('content-intake-runtime-v1'),true);
  assert.equal(exported.includes('content-intake-direct-v1'), true);
  for (const step of ['test:intake-shop-directory-contract', 'check:intake-shop-directory-contract', 'lint:intake-shop-directory-openapi']) {
    assert.equal(releaseSteps.includes(step), true);
  }
  assert.equal(releaseSteps.includes('test:intake-shop-directory-contract:pg'), false);
  assert.match(spec, /^> 状态：FROZEN · NOT EXPORTED · NOT INTAKE/m);
  for (const hash of [digest(generated.openapi), digest(generated.database), digest(storage), digest(read(INTAKE_SHOP_DIRECTORY_SOURCES.openapi)), digest(read(INTAKE_DIRECT_CONTRACT_PATHS.openapi)), digest(read(INTAKE_DIRECT_CONTRACT_PATHS.database))]) {
    assert.equal(spec.includes(hash), true, hash);
  }
});

test('shop directory accepts one current name per id and rejects blank, padded, oversized and extra fields', () => {
  const operation = paths['/v1/intake/shop-directory'].get;
  assert.deepEqual(Object.keys(paths['/v1/intake/shop-directory']), ['get']);
  assert.deepEqual(operation.security, [{ ProductSession: [] }]);
  assert.equal(operation['x-required-intake-action'], 'query');
  assert.equal(operation['x-display-name-grants-business-action'], false);
  assert.equal(operation.responses['200'].headers['Cache-Control'].schema.const, 'no-store');
  assert.match(operation.description, /飞书/);
  const parameters = Object.fromEntries(operation.parameters.map(item => [item.name, item.schema]));
  assert.equal(parameters.limit.default, 50);
  const limit = ajv.compile(parameters.limit);
  const cursor = ajv.compile(parameters.cursor);
  assert.equal(limit(1) && limit(100), true);
  assert.equal(limit(0) || limit(101), false);
  assert.equal(cursor('a') && cursor('a'.repeat(512)), true);
  assert.equal(cursor('') || cursor('a'.repeat(513)), false);
  const display = validate('IntakeShopDisplay');
  const directory = validate('IntakeShopDirectory');
  const row = { shopId: 'shop-a', displayName: '合成店', displayVersion: 1 };
  const sameName = { shopId: 'shop-b', displayName: '合成店', displayVersion: 2 };
  const page = { items: [row, sameName], nextCursor: null, validUntil: '2026-10-08T00:04:00.000Z' };
  assert.equal(display(row), true, JSON.stringify(display.errors));
  assert.equal(directory(page), true, JSON.stringify(directory.errors));
  assert.equal(display({ ...row, displayName: '名'.repeat(256) }), true);
  assert.equal(display({ ...row, displayName: '合 成' }), true);
  for (const displayName of ['', ' ', ' 合成', '合成 ', '\t', '名\n称', '\u00a0合成', '合成\u3000', '合成\u2028店', '\ufeff合成', '名'.repeat(257)]) assert.equal(display({ ...row, displayName }), false);
  assert.equal(display({ ...row, action: 'publish' }), false);
  assert.equal(display({ ...row, shopId: '' }), false);
  assert.equal(directory({ ...page, items: Array.from({ length: 101 }, (_, index) => ({ ...row, shopId: `shop-${index}` })) }), false);
  assert.equal(directory({ ...page, nextCursor: 'a'.repeat(513) }), false);
  assert.equal(directory({ ...page, validUntil: 'not-a-date' }), false);
  assert.equal(directory({ ...page, granted: true }), false);
  const worstPage = { ...page, items: Array.from({ length: 100 }, (_, index) => ({ shopId: String(index).padEnd(128, 'x'), displayName: '😀'.repeat(256), displayVersion: Number.MAX_SAFE_INTEGER })), nextCursor: 'x'.repeat(512) };
  assert.equal(directory(worstPage), true);
  assert.ok(Buffer.byteLength(JSON.stringify(worstPage)) <= operation['x-max-response-bytes']);
});

test('generator rejects a second verb, a dropped route, a changed reason, an extra schema and a replaced deadline', () => {
  const build = source => buildIntakeShopDirectoryContractFiles(file => source[file] ?? read(file));
  assert.throws(() => {
    const changed = structuredClone(delta);
    changed.paths['/v1/intake/shop-directory'].post = changed.paths['/v1/intake/shop-directory'].get;
    build({ [INTAKE_SHOP_DIRECTORY_SOURCES.openapi]: Buffer.from(JSON.stringify(changed)) });
  }, /Unexpected shop-directory method/);
  assert.throws(() => {
    const changed = structuredClone(delta);
    delete changed.paths['/v1/intake/shop-directory'];
    build({ [INTAKE_SHOP_DIRECTORY_SOURCES.openapi]: Buffer.from(JSON.stringify(changed)) });
  }, /Unexpected shop-directory routes/);
  assert.throws(() => {
    const changed = structuredClone(delta);
    changed.failureReasons = changed.failureReasons.slice(0, -1);
    build({ [INTAKE_SHOP_DIRECTORY_SOURCES.openapi]: Buffer.from(JSON.stringify(changed)) });
  }, /Unexpected shop-directory reasons/);
  assert.throws(() => {
    const changed = structuredClone(delta);
    changed.components.schemas.IntakeShopDirectoryForged = { type: 'string' };
    build({ [INTAKE_SHOP_DIRECTORY_SOURCES.openapi]: Buffer.from(JSON.stringify(changed)) });
  }, /Unexpected shop-directory schemas/);
  assert.throws(() => build({
    [INTAKE_SHOP_DIRECTORY_SOURCES.storage]: Buffer.from('CREATE OR REPLACE FUNCTION content_intake.authorization_deadline() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$;'),
  }), /authorization_deadline/);
});


test('trusted synthetic consumer rejects injected authority/key fields before any database call', async () => {
  let calls=0; const consumer=createShopDirectoryConsumer(async()=>{calls+=1;return '';});
  const sessionHash='b'.repeat(64);
  for(const request of [{sessionHash,signingKey:'secret'},{sessionHash,principal:'director'},{sessionHash,tenant:'tenant-b'},{sessionHash:[sessionHash]},{sessionHash,cursor:[]},{sessionHash,limit:101}]) {
    assert.deepEqual(await consumer.read(request),{ok:false,reason:'SHOP_DISPLAY_INVALID',commit:'rolled_back'});
  }
  assert.deepEqual(await consumer.manage({sessionHash,target:'agent',expectedVersion:0,targetFacts:1,validUntil:'bad',reason:'synthetic',operationId:'request'}),{ok:false,reason:'SHOP_DISPLAY_INVALID',commit:'rolled_back'});
  assert.equal(calls,0);
});

test('consumer releases only post-COMMIT values and keeps uncertain or malformed replies unknown', async () => {
  const request={sessionHash:'b'.repeat(64)};
  const before=createShopDirectoryConsumer(async()=>{throw {stdout:'',stderr:'ERROR: SHOP_DIRECTORY_SESSION\nprivate diagnostic'};});
  assert.deepEqual(await before.read(request),{ok:false,reason:'SHOP_DIRECTORY_SESSION',commit:'rolled_back'});
  const after=createShopDirectoryConsumer(async()=>{throw {stdout:'__SHOP_DIRECTORY_COMMITTING__\n',stderr:'private diagnostic'};});
  assert.deepEqual(await after.read(request),{ok:false,reason:'COMMIT_UNKNOWN',commit:'unknown'});
  for(const output of ['', '{"items":[]}', '__SHOP_DIRECTORY_COMMITTING__\nnot-json']) {
    assert.deepEqual(await createShopDirectoryConsumer(async()=>output).read(request),{ok:false,reason:'COMMIT_UNKNOWN',commit:'unknown'});
  }
  assert.deepEqual(await createShopDirectoryConsumer(async()=> '__SHOP_DIRECTORY_COMMITTING__\n{"items":[]}\n').read(request),{ok:true,value:{items:[]}});
});


test('runtime installation binds companion ACL and formal NOLOGIN boundaries without duplicating product functions', () => {
  assert.ok(generated.installation.equals(read(INTAKE_SHOP_DIRECTORY_CONTRACT_PATHS.installation)));
  const install = JSON.parse(generated.installation);
  assert.equal(install.status,'DRAFT');
  assert.equal(install.exportApproved,false);
  assert.equal(install.companionAclRequired,true);
  assert.equal(install.productMode.skipMissingDependencies,false);
  assert.equal(install.productMode.atomicCandidateInstall,true);
  assert.equal(install.capabilityLogin,false);
  assert.equal(install.environmentCredentialsIncluded,false);
  assert.equal(install.openapi.sha256,digest(generated.openapi));
  assert.equal(install.database.sha256,digest(generated.database));
  for (const input of Object.values(install.sources)) assert.equal(input.sha256,digest(read(input.path)));
  assert.deepEqual(install.productMode.order,['product-migrations','roles','organization','session','directory','directoryAcl','acl','environment-login-bindings']);
  assert.ok(install.requiredBundleArtifacts.includes('acl'));
  assert.ok(install.requiredBundleArtifacts.includes('installation'));
  const core=generated.database.toString();
  assert.equal(/intake_runtime_probe|intake_org_candidate/.test(core),false);
  assert.equal(core.includes('INTAKE_RUNTIME_IMPLEMENTATION_REQUIRED'),false);
  const acl=read(INTAKE_RUNTIME_SOURCES.acl).toString();
  assert.ok(acl.includes('INTAKE_RUNTIME_IMPLEMENTATION_REQUIRED'));
  assert.ok(acl.includes('ALTER FUNCTION content_intake.publish_candidate'));
  assert.equal(/CREATE(?: OR REPLACE)? FUNCTION content_intake\.(?:publish_candidate|preview_rollback|execute_rollback)/.test(acl),false);
  for (const [source,from,to] of [
    [INTAKE_RUNTIME_SOURCES.roles,'NOLOGIN','LOGIN'],
    [INTAKE_RUNTIME_SOURCES.session,'intake_runtime','intake_runtime_probe'],
  ]) assert.throws(()=>buildIntakeShopDirectoryContractFiles(file=>file===source?Buffer.from(read(file).toString().replaceAll(from,to)):read(file)),/Runtime/);
});
