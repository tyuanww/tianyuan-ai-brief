import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Disposable Unix-socket PG15. Synthetic rows only; no inherited database URL.
const root = fileURLToPath(new URL('../../', import.meta.url));
const env = { ...process.env, PGCONNECT_TIMEOUT: '5' };
for (const key of Object.keys(env)) if (key.startsWith('PG') && key !== 'PGCONNECT_TIMEOUT') delete env[key];
const bin = process.env.PG_BIN || execFileSync('pg_config', ['--bindir'], { encoding: 'utf8', env }).trim();
const run = (name, args) => execFileSync(path.join(bin, name), args, {
  cwd: root, encoding: 'utf8', env, maxBuffer: 32 * 1024 * 1024, timeout: 180000, stdio: ['ignore', 'pipe', 'pipe'],
});
assert.match(run('postgres', ['--version']), /PostgreSQL\) 15\./);
const dir = mkdtempSync(path.join(tmpdir(), 'intake-shop-directory-'));
const evidence = path.join(root, 'output/content-intake-shop-directory-contract');
mkdirSync(evidence, { recursive: true });
const args = ['-X', '-h', dir, '-p', '55444', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'];
const sql = query => run('psql', [...args, '-Atc', query]).trim();
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const rejects = (query, pattern) => {
  assert.throws(() => sql(query), error => {
    assert.match(String(error.stderr || error.message), pattern);
    return true;
  });
  checks += 1;
};
const anchor = Date.now();
const instant = milliseconds => new Date(anchor + milliseconds).toISOString();
const AT = `timestamptz '${instant(0)}'`;
const CHECKED = instant(-60000);
const UNTIL = instant(240000);
const START = instant(-86400000);
const GRANT_END = instant(7200000);
const EXPIRES = instant(120000);
const atOffset = milliseconds => `timestamptz '${instant(milliseconds)}'`;
const HASH = 'a'.repeat(64);
const SESSION = 'b'.repeat(64);
const SIGNING_KEY = 'e'.repeat(64); // Explicit synthetic fixture, never a production secret.
const emptyDigest = createHash('sha256').update('').digest('hex');
let started = false;
let checks = 0;
const readCall = (principal, session, when, cursor, limit) => `content_intake.read_shop_directory(${quote(principal)},${quote(session)},${when},${cursor == null ? 'NULL' : quote(cursor)},${limit == null ? 'NULL' : String(limit)},${quote(SIGNING_KEY)})`;
const readDirectory = (principal, cursor = null, limit = 50, session = SESSION, when = AT) => JSON.parse(sql(`SELECT ${readCall(principal, session, when, cursor, limit)}`));
const upsert = (actor, tenant, app, shop, name, expected) => JSON.parse(sql(
  `SELECT content_intake.upsert_shop_display(${quote(actor)},${quote(tenant)},${quote(app)},${quote(shop)},${quote(name)},${expected == null ? 'NULL' : String(expected)})`,
));
const revisionOf = (tenant, app) => {
  const value = sql(`SELECT coalesce((SELECT directory_revision::text FROM content_intake.shop_directory_revisions WHERE tenant_id=${quote(tenant)} AND app_id=${quote(app)}),'')`);
  return value === '' ? null : Number(value);
};

try {
  run('initdb', ['-D', path.join(dir, 'data'), '-A', 'trust', '--no-locale', '--encoding=UTF8']);
  run('pg_ctl', ['-D', path.join(dir, 'data'), '-l', path.join(dir, 'server.log'), '-o', `-k ${dir} -p 55444 -h ''`, '-w', 'start']);
  started = true;
  writeFileSync(path.join(evidence, 'install.log'), run('psql', [...args, '-f', 'business-docs/01-客服Agent项目/30-开发-进行中/schema.v1.23.sql']));
  checks += 1;

  const statements = [];
  const people = [
    ['director', 'tenant-a', 'app-a', 'director-job', 'owner', true],
    ['steward', 'tenant-a', 'app-a', 'steward-job', 'coach', true],
    ['agent', 'tenant-a', 'app-a', 'agent-job', 'agent', true],
    ['manager', 'tenant-a', 'app-a', 'manager-job', 'coach', true],
    ['brand-agent', 'tenant-a', 'app-a', 'agent-job', 'agent', true],
    ['missing-agent', 'tenant-a', 'app-a', 'agent-job', 'agent', true],
    ['disabled-agent', 'tenant-a', 'app-a', 'agent-job', 'agent', false],
    ['expiry-agent', 'tenant-a', 'app-a', 'agent-job', 'agent', true],
    ['director-b', 'tenant-b', 'app-b', 'director-job', 'owner', true],
    ['steward-b', 'tenant-b', 'app-b', 'steward-job', 'coach', true],
    ['outsider', 'tenant-b', 'app-b', 'agent-job', 'agent', true],
  ];
  for (const [id, tenant, app, job, bindingRole, enabled] of people) {
    statements.push(`INSERT INTO backend_identity.subject_bindings(binding_id,provider,tenant,subject,user_id,subject_hash,enabled,role) VALUES (${quote(`binding-${id}`)},'synthetic',${quote(tenant)},${quote(id)},${quote(id)},${quote(HASH)},true,${quote(bindingRole)})`);
    statements.push(`INSERT INTO content_intake.principals VALUES (${quote(id)},${quote(id)},${quote(tenant)},${quote(app)},'confirmed-synthetic',${quote(`person-${id}`)},1,0)`);
    statements.push(`INSERT INTO content_intake.principal_facts VALUES (${quote(id)},1,ARRAY['dept'],${quote(job)},${enabled},timestamptz '${CHECKED}',timestamptz '${UNTIL}',${quote(HASH)})`);
  }
  for (const [tenant, app, job, role] of [['tenant-a', 'app-a', 'director-job', 'director'], ['tenant-a', 'app-a', 'manager-job', 'manager'], ['tenant-a', 'app-a', 'agent-job', 'agent'], ['tenant-b', 'app-b', 'director-job', 'director'], ['tenant-b', 'app-b', 'agent-job', 'agent']]) {
    statements.push(`INSERT INTO content_intake.role_rules VALUES (${quote(tenant)},${quote(app)},'dept',${quote(job)},1,${quote(role)})`);
  }
  const scopes = [
    ['a-product', 'tenant-a', 'app-a', 'brand-a', 'shop-a', 'product', 'v2-preview'],
    ['a-presale', 'tenant-a', 'app-a', 'brand-a', 'shop-a', 'presale', 'v2-preview'],
    ['b-product', 'tenant-a', 'app-a', 'brand-a', 'shop-b', 'product', 'v2-preview'],
    ['c-product', 'tenant-a', 'app-a', 'brand-a', 'shop-c', 'product', 'v2-preview'],
    ['d-product', 'tenant-a', 'app-a', 'brand-a', 'shop-d', 'product', 'v2-preview'],
    ['legacy-product', 'tenant-a', 'app-a', 'brand-a', 'shop-legacy', 'product', 'legacy'],
    ['active-product', 'tenant-a', 'app-a', 'brand-a', 'shop-active', 'product', 'v2-active'],
    ['hidden-product', 'tenant-a', 'app-a', 'brand-a', 'shop-hidden', 'product', 'v2-preview'],
    ['brand-product', 'tenant-a', 'app-a', 'brand-a', null, 'product', 'v2-preview'],
    ['expiry-product', 'tenant-a', 'app-a', 'brand-a', 'shop-expiry', 'product', 'v2-preview'],
    ['tb-product', 'tenant-b', 'app-b', 'brand-b', 'shop-a', 'product', 'v2-preview'],
  ];
  for (const [id, tenant, app, brand, shop, domain, mode] of scopes) {
    statements.push(`INSERT INTO content_intake.scopes VALUES (${quote(id)},${quote(tenant)},${quote(app)},${quote(brand)},${shop == null ? 'NULL' : quote(shop)},${quote(domain)})`);
    statements.push(`INSERT INTO content_intake.sources(source_id,scope_id,current_mapping_version,mode) VALUES (${quote(`src-${id}`)},${quote(id)},1,${quote(mode)})`);
    statements.push(`INSERT INTO content_intake.source_mappings VALUES (${quote(`src-${id}`)},1,'faq-p1.1','intake-p1.1','mapping-1',${quote(HASH)})`);
  }
  const allocations = new Set();
  const grant = (scope, action, recipient, issuer, tenant, app, expires) => {
    const allocation = `alloc-${tenant}-${scope}-${action}`;
    if (!allocations.has(allocation)) {
      allocations.add(allocation);
      statements.push(`INSERT INTO content_intake.grants(grant_id,kind,issuer_id,recipient_id,tenant_id,app_id,scope_id,action,starts_at,expires_at,steward_id,reason) VALUES (${quote(allocation)},'allocation',${quote(issuer)},${quote(issuer)},${quote(tenant)},${quote(app)},${quote(scope)},${quote(action)},timestamptz '${START}',timestamptz '${GRANT_END}',${quote(issuer)},'synthetic allocation')`);
    }
    statements.push(`INSERT INTO content_intake.grants(grant_id,kind,issuer_id,recipient_id,tenant_id,app_id,scope_id,action,starts_at,expires_at,steward_id,parent_grant_id,reason) VALUES (${quote(`grant-${recipient}-${scope}-${action}`)},'business',${quote(issuer)},${quote(recipient)},${quote(tenant)},${quote(app)},${quote(scope)},${quote(action)},timestamptz '${START}',timestamptz '${expires}',${quote(issuer)},${quote(allocation)},'synthetic business')`);
  };
  for (const scope of ['a-product', 'a-presale', 'b-product', 'c-product', 'legacy-product', 'active-product']) grant(scope, 'query', 'agent', 'director', 'tenant-a', 'app-a', GRANT_END);
  grant('a-product', 'query', 'missing-agent', 'director', 'tenant-a', 'app-a', GRANT_END);
  grant('d-product', 'query', 'missing-agent', 'director', 'tenant-a', 'app-a', GRANT_END);
  grant('brand-product', 'query', 'brand-agent', 'director', 'tenant-a', 'app-a', GRANT_END);
  grant('b-product', 'query', 'disabled-agent', 'director', 'tenant-a', 'app-a', GRANT_END);
  grant('b-product', 'publish', 'manager', 'director', 'tenant-a', 'app-a', GRANT_END);
  grant('expiry-product', 'query', 'expiry-agent', 'director', 'tenant-a', 'app-a', EXPIRES);
  grant('b-product', 'query', 'expiry-agent', 'director', 'tenant-a', 'app-a', GRANT_END);
  grant('tb-product', 'query', 'outsider', 'director-b', 'tenant-b', 'app-b', GRANT_END);
  statements.push(`INSERT INTO content_intake.shop_directory_stewards VALUES ('tenant-a','app-a','steward',timestamptz '${START}'),('tenant-b','app-b','steward-b',timestamptz '${START}')`);
  sql(`BEGIN; ${statements.join(';\n')}; COMMIT;`);
  checks += 1;
  const grantCount = sql('SELECT count(*) FROM content_intake.grants');

  rejects(`SELECT content_intake.upsert_shop_display('steward','tenant-a','app-a','shop-a','合成同名店',0)`, /SHOP_DIRECTORY_CONFLICT/);
  for (const name of ['', '   ', ' 合成', '合成 ', '\t', '名\n称', '\u00a0合成', '合成\u3000', '合成\u2028店', '\ufeff合成', '名'.repeat(257)]) {
    rejects(`SELECT content_intake.upsert_shop_display('steward','tenant-a','app-a','shop-a',${quote(name)},NULL)`, /SHOP_DISPLAY_INVALID/);
  }
  assert.equal(revisionOf('tenant-a', 'app-a'), null);
  checks += 1;
  rejects(`SELECT content_intake.upsert_shop_display('agent','tenant-a','app-a','shop-a','合成同名店',NULL)`, /SHOP_DIRECTORY_STEWARD_REQUIRED/);
  rejects(`SELECT content_intake.upsert_shop_display('steward','tenant-b','app-b','shop-a','租户乙店',NULL)`, /SHOP_DIRECTORY_STEWARD_REQUIRED/);
  assert.deepEqual(upsert('steward', 'tenant-a', 'app-a', 'shop-a', '合成同名店', null), { shopId: 'shop-a', displayName: '合成同名店', displayVersion: 1, directoryRevision: 1 });
  checks += 1;
  const names = [['shop-b', '合成同名店'], ['shop-c', '合成丙店'], ['shop-legacy', '合成旧模式店'], ['shop-active', '合成激活店'], ['shop-hidden', '合成无授权店'], ['shop-expiry', '合成临期店']];
  for (const [shop, name] of names) {
    const written = upsert('steward', 'tenant-a', 'app-a', shop, name, revisionOf('tenant-a', 'app-a'));
    assert.equal(written.displayVersion, 1);
    checks += 1;
  }
  assert.deepEqual(upsert('steward-b', 'tenant-b', 'app-b', 'shop-a', '租户乙店', null), { shopId: 'shop-a', displayName: '租户乙店', displayVersion: 1, directoryRevision: 1 });
  checks += 1;
  const spaced = upsert('steward', 'tenant-a', 'app-a', 'shop-space', '合 成', revisionOf('tenant-a', 'app-a'));
  assert.equal(spaced.displayName, '合 成');
  const longName = '名'.repeat(256);
  const longRow = upsert('steward', 'tenant-a', 'app-a', 'shop-long', longName, revisionOf('tenant-a', 'app-a'));
  assert.equal(longRow.displayVersion, 1);
  assert.equal(sql(`SELECT char_length(display_name) FROM content_intake.shop_displays WHERE shop_id='shop-long'`), '256');
  const stale = revisionOf('tenant-a', 'app-a') - 1;
  rejects(`SELECT content_intake.upsert_shop_display('steward','tenant-a','app-a','shop-long',${quote(longName)},${stale})`, /SHOP_DIRECTORY_CONFLICT/);
  assert.equal(sql(`SELECT max(display_version) FROM content_intake.shop_displays WHERE tenant_id='tenant-a' AND shop_id='shop-long'`), '1');
  assert.equal(sql(`SELECT count(*) FROM content_intake.shop_display_current WHERE tenant_id='tenant-a' AND shop_id='shop-a'`), '1');
  assert.equal(sql(`SELECT count(*) FROM content_intake.sources src JOIN content_intake.scopes s ON s.scope_id=src.scope_id WHERE s.tenant_id='tenant-a' AND s.shop_id='shop-a'`), '2');
  assert.equal(sql('SELECT count(*) FROM content_intake.grants'), grantCount);
  assert.equal(sql(`SELECT content_intake.authorization_deadline('steward','query','a-product','src-a-product',${AT}) IS NULL`), 't');
  assert.equal(sql(`SELECT count(*) FROM information_schema.columns WHERE table_schema='content_intake' AND table_name='sources' AND column_name='display_name'`), '0');
  checks += 8;
  rejects(`INSERT INTO content_intake.shop_displays(tenant_id,app_id,shop_id,display_version,display_name,directory_revision,steward_id,recorded_at) VALUES ('tenant-a','app-a','shop-direct',1,'直接写入',1,'steward',${AT})`, /SHOP_DIRECTORY_STEWARD_REQUIRED/);
  rejects(`UPDATE content_intake.shop_displays SET display_name='改历史' WHERE shop_id='shop-a'`, /SHOP_DISPLAY_IMMUTABLE/);
  rejects(`DELETE FROM content_intake.shop_display_current WHERE shop_id='shop-a'`, /SHOP_DISPLAY_IMMUTABLE/);
  rejects(`UPDATE content_intake.shop_directory_stewards SET steward_id='director' WHERE tenant_id='tenant-a'`, /SHOP_DIRECTORY_STEWARD_REQUIRED/);
  rejects(`DELETE FROM content_intake.shop_directory_stewards WHERE tenant_id='tenant-a'`, /SHOP_DIRECTORY_STEWARD_REQUIRED/);

  const visible = [
    { shopId: 'shop-a', displayName: '合成同名店', displayVersion: 1 },
    { shopId: 'shop-b', displayName: '合成同名店', displayVersion: 1 },
    { shopId: 'shop-c', displayName: '合成丙店', displayVersion: 1 },
  ];
  const first = readDirectory('agent', null, null);
  assert.deepEqual(first.items, visible);
  assert.equal(first.nextCursor, null);
  assert.equal(sql(`SELECT (${quote(first.validUntil)})::timestamptz = timestamptz '${UNTIL}'`), 't');
  const doubled = JSON.parse(sql(`SELECT jsonb_build_array(${readCall('agent', SESSION, AT, null, 50)},${readCall('agent', SESSION, AT, null, 50)})`));
  assert.deepEqual(doubled[0], doubled[1]);
  checks += 4;
  const page1 = readDirectory('agent', null, 1);
  const page2 = readDirectory('agent', page1.nextCursor, 1);
  const page3 = readDirectory('agent', page2.nextCursor, 1);
  assert.deepEqual([page1.items[0], page2.items[0], page3.items[0]], visible);
  assert.equal(page3.nextCursor, null);
  assert.equal(page1.validUntil, page2.validUntil);
  assert.equal(page2.validUntil, page3.validUntil);
  checks += 4;
  const parts = page1.nextCursor.split('.');
  assert.equal(page1.nextCursor.includes(SESSION), false);
  assert.equal(page1.nextCursor.startsWith('sd2.'), true);
  const forgedBoth = [...parts]; forgedBoth[6] = '2'; forgedBoth[8] = 'shop-b';
  rejects(`SELECT ${readCall('agent', SESSION, AT, forgedBoth.join('.'), 1)}`, /SHOP_DIRECTORY_CURSOR/);
  const forgedDeadline = [...parts]; forgedDeadline[5] = String(BigInt(forgedDeadline[5]) + 60000000n);
  rejects(`SELECT ${readCall('agent', SESSION, AT, forgedDeadline.join('.'), 1)}`, /SHOP_DIRECTORY_CURSOR/);
  rejects(`SELECT ${readCall('agent', SESSION, AT, page1.nextCursor, 2)}`, /SHOP_DIRECTORY_CURSOR/);
  const forgedPayload = forgedDeadline.slice(0, -1).join('.');
  const clientKnownHashMac = sql(`SELECT encode(hmac(convert_to(jsonb_build_array('agent','tenant-a','app-a',${quote(SESSION)},${quote(forgedPayload)})::text,'UTF8'),decode(${quote(SESSION)},'hex'),'sha256'),'hex')`);
  rejects(`SELECT ${readCall('agent', SESSION, AT, `${forgedPayload}.${clientKnownHashMac}`, 1)}`, /SHOP_DIRECTORY_CURSOR/);
  checks += 2;
  const forgedShop = [...parts];
  forgedShop[8] = 'shop-b';
  rejects(`SELECT ${readCall('agent', SESSION, AT, forgedShop.join('.'), 1)}`, /SHOP_DIRECTORY_CURSOR/);
  const forgedOrdinal = [...parts];
  forgedOrdinal[6] = '2';
  rejects(`SELECT ${readCall('agent', SESSION, AT, forgedOrdinal.join('.'), 1)}`, /SHOP_DIRECTORY_CURSOR/);
  const forgedDigest = [...parts];
  forgedDigest[4] = '0'.repeat(64);
  rejects(`SELECT ${readCall('agent', SESSION, AT, forgedDigest.join('.'), 1)}`, /SHOP_DIRECTORY_CURSOR/);
  rejects(`SELECT ${readCall('agent', 'c'.repeat(64), AT, page1.nextCursor, 1)}`, /SHOP_DIRECTORY_CURSOR/);
  rejects(`SELECT ${readCall('agent', SESSION, AT, '', 1)}`, /SHOP_DIRECTORY_CURSOR/);
  rejects(`SELECT ${readCall('agent', SESSION, AT, null, 0)}`, /SHOP_DIRECTORY_CURSOR/);
  rejects(`SELECT ${readCall('agent', SESSION, AT, null, 101)}`, /SHOP_DIRECTORY_CURSOR/);
  rejects(`SELECT ${readCall('nobody', SESSION, AT, null, 50)}`, /SHOP_DIRECTORY_SESSION/);
  rejects(`SELECT ${readCall('missing-agent', SESSION, AT, null, 50)}`, /SHOP_DISPLAY_MISSING/);
  rejects(`SELECT ${readCall('disabled-agent', SESSION, AT, null, 50)}`, /SHOP_DIRECTORY_EXPIRED/);
  rejects(`SELECT ${readCall('agent', SESSION, atOffset(240000), null, 50)}`, /SHOP_DIRECTORY_EXPIRED/);
  const manager = readDirectory('manager');
  assert.deepEqual(manager.items, []);
  assert.equal(sql(`SELECT content_intake.authorization_deadline('manager','publish','b-product','src-b-product',${AT}) IS NOT NULL`), 't');
  assert.equal(sql(`SELECT content_intake.authorization_deadline('manager','query','b-product','src-b-product',${AT}) IS NULL`), 't');
  const stewardPage = readDirectory('steward');
  assert.deepEqual(stewardPage.items, []);
  assert.equal(sql(`SELECT (${quote(stewardPage.validUntil)})::timestamptz = timestamptz '${UNTIL}'`), 't');
  const deadlineUs = sql(`SELECT (extract(epoch FROM timestamptz '${UNTIL}') * 1000000)::bigint`);
  const emptyCursor = `sd2.1.0.${revisionOf('tenant-a', 'app-a')}.${emptyDigest}.${deadlineUs}.1.50.shop-a.${'0'.repeat(64)}`;
  rejects(`SELECT ${readCall('steward', SESSION, AT, emptyCursor, 50)}`, /SHOP_DIRECTORY_CURSOR/);
  assert.deepEqual(readDirectory('brand-agent').items, []);
  assert.deepEqual(readDirectory('outsider').items, [{ shopId: 'shop-a', displayName: '租户乙店', displayVersion: 1 }]);
  rejects(`SELECT ${readCall('outsider', SESSION, AT, page1.nextCursor, 50)}`, /SHOP_DIRECTORY_CURSOR/);
  checks += 3;
  sql(`INSERT INTO content_intake.grants(grant_id,kind,issuer_id,recipient_id,tenant_id,app_id,scope_id,action,starts_at,expires_at,steward_id,parent_grant_id,reason) VALUES ('grant-brand-agent-a-product-query','business','director','brand-agent','tenant-a','app-a','a-product','query',timestamptz '${START}',timestamptz '${GRANT_END}','director','alloc-tenant-a-a-product-query','synthetic brand narrow')`);
  assert.deepEqual(readDirectory('brand-agent').items, [visible[0]]);
  assert.deepEqual(readDirectory('agent').items, visible);
  checks += 2;
  const expiryPage = readDirectory('expiry-agent', null, 1);
  assert.deepEqual(expiryPage.items, [{ shopId: 'shop-b', displayName: '合成同名店', displayVersion: 1 }]);
  assert.equal(typeof expiryPage.nextCursor, 'string');
  assert.equal(sql(`SELECT (${quote(expiryPage.validUntil)})::timestamptz = timestamptz '${EXPIRES}'`), 't');
  rejects(`SELECT ${readCall('expiry-agent', SESSION, atOffset(120000), expiryPage.nextCursor, 1)}`, /SHOP_DIRECTORY_EXPIRED/);
  assert.deepEqual(readDirectory('expiry-agent', null, 50, SESSION, atOffset(120000)).items, [visible[1]]);
  rejects(`SELECT ${readCall('expiry-agent', SESSION, atOffset(240000), null, 50)}`, /SHOP_DIRECTORY_EXPIRED/);
  checks += 3;

  const renewalPage = readDirectory('expiry-agent', null, 1);
  sql(`INSERT INTO content_intake.grants(grant_id,kind,issuer_id,recipient_id,tenant_id,app_id,scope_id,action,starts_at,expires_at,steward_id,parent_grant_id,reason) VALUES ('renewed-expiry','business','director','expiry-agent','tenant-a','app-a','expiry-product','query',timestamptz '${START}',timestamptz '${GRANT_END}','director','alloc-tenant-a-expiry-product-query','synthetic renewal')`);
  const renewalNext = readDirectory('expiry-agent', renewalPage.nextCursor, 1);
  assert.equal(renewalNext.validUntil, renewalPage.validUntil);
  rejects(`SELECT ${readCall('expiry-agent', SESSION, atOffset(120000), renewalPage.nextCursor, 1)}`, /SHOP_DIRECTORY_EXPIRED/);
  checks += 1;

  const beforeRename = readDirectory('agent', null, 1).nextCursor;
  const renamed = upsert('steward', 'tenant-a', 'app-a', 'shop-c', '合成丙店新名', revisionOf('tenant-a', 'app-a'));
  assert.equal(renamed.displayVersion, 2);
  rejects(`SELECT ${readCall('agent', SESSION, AT, beforeRename, 1)}`, /SHOP_DIRECTORY_CHANGED/);
  const renamedPage = readDirectory('agent');
  assert.deepEqual(renamedPage.items, [visible[0], visible[1], { shopId: 'shop-c', displayName: '合成丙店新名', displayVersion: 2 }]);
  checks += 3;
  const beforeRevoke = readDirectory('agent', null, 1).nextCursor;
  sql(`UPDATE content_intake.grants SET version=2, revoked_at=${AT}, last_change_reason='synthetic revoke', steward_id='director' WHERE grant_id='grant-agent-c-product-query'`);
  rejects(`SELECT ${readCall('agent', SESSION, AT, beforeRevoke, 1)}`, /SHOP_DIRECTORY_CHANGED/);
  assert.deepEqual(readDirectory('agent').items, [visible[0], visible[1]]);
  checks += 2;
  const beforeIdentity = readDirectory('agent', null, 50).nextCursor;
  sql(`UPDATE content_intake.principals SET revocation_generation=revocation_generation+1 WHERE principal_id='agent'`);
  assert.equal(beforeIdentity, null);
  const identityCursor = readDirectory('agent', null, 1).nextCursor;
  sql(`UPDATE content_intake.principals SET revocation_generation=revocation_generation+1 WHERE principal_id='agent'`);
  rejects(`SELECT ${readCall('agent', SESSION, AT, identityCursor, 1)}`, /SHOP_DIRECTORY_CHANGED/);
  assert.deepEqual(readDirectory('agent').items, [visible[0], visible[1]]);
  checks += 3;

  const deadline = sql(`SELECT pg_get_functiondef('content_intake.authorization_deadline(text,text,text,text,timestamptz)'::regprocedure)`);
  assert.match(deadline, /HAVING count\(DISTINCT r\.role\)=1/);
  assert.match(deadline, /director','manager','supervisor','lead'/);
  assert.match(deadline, /min\(r\.role\) IN \('agent','enabler'\) AND p_action='query'/);
  assert.equal(sql(`SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='content_intake' AND p.proname='authorization_deadline'`), '1');
  for (const role of ['public', 'app_runtime', 'app_content_admin', 'app_import_worker', 'app_backend_auth', 'app_backend_review', 'app_backend_worker']) {
    for (const name of ['read_shop_directory', 'upsert_shop_display']) {
      assert.equal(sql(`SELECT has_function_privilege(${quote(role)}, p.oid, 'EXECUTE') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='content_intake' AND p.proname=${quote(name)}`), 'f', name);
      checks += 1;
    }
    for (const table of ['shop_directory_stewards', 'shop_directory_revisions', 'shop_displays', 'shop_display_current']) {
      assert.equal(sql(`SELECT bool_or(has_table_privilege(${quote(role)}, ${quote(`content_intake.${table}`)}, priv)) FROM (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) v(priv)`), 'f', table);
      checks += 1;
    }
  }
  assert.match(sql(`SELECT proconfig::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='content_intake' AND p.proname='read_shop_directory'`), /search_path=pg_catalog/);
  checks += 4;
  // Steward identity and facts are current authorization, never perpetual membership.
  sql(`UPDATE backend_identity.subject_bindings SET enabled=false WHERE user_id='steward'`);
  rejects(`SELECT content_intake.upsert_shop_display('steward','tenant-a','app-a','shop-a','停用更名',${revisionOf('tenant-a', 'app-a')})`, /SHOP_DIRECTORY_STEWARD_REQUIRED/);
  sql(`UPDATE backend_identity.subject_bindings SET enabled=true WHERE user_id='steward'; INSERT INTO content_intake.principal_facts VALUES ('steward',2,ARRAY['dept'],'steward-job',false,timestamptz '${CHECKED}',timestamptz '${UNTIL}',${quote(HASH)}); UPDATE content_intake.principals SET current_facts_version=2, revocation_generation=revocation_generation+1 WHERE principal_id='steward'`);
  rejects(`SELECT content_intake.upsert_shop_display('steward','tenant-a','app-a','shop-a','停用事实更名',${revisionOf('tenant-a', 'app-a')})`, /SHOP_DIRECTORY_STEWARD_REQUIRED/);
  // A lock wait must not reuse the request's old timestamp to return an expired page.
  sql(`INSERT INTO content_intake.principal_facts VALUES ('agent',2,ARRAY['dept'],'agent-job',true,clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 second',${quote(HASH)}); UPDATE content_intake.principals SET current_facts_version=2, revocation_generation=revocation_generation+1 WHERE principal_id='agent'`);
  const blocker = spawn(path.join(bin, 'psql'), [...args, '-Atc', "SET application_name='shop-directory-lock-probe'; BEGIN; SELECT pg_advisory_xact_lock(hashtextextended('tenant-a:app-a',0)); SELECT pg_sleep(2); COMMIT;"], { cwd: root, env, stdio: ['ignore', 'ignore', 'pipe'] });
  const blockerClosed = new Promise((resolve, reject) => { blocker.once('error', reject); blocker.once('close', code => code === 0 ? resolve() : reject(new Error(`lock probe exit ${code}`))); });
  let locked = false;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (sql("SELECT count(*) FROM pg_stat_activity WHERE application_name='shop-directory-lock-probe' AND wait_event='PgSleep'") === '1') { locked = true; break; }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(locked, true);
  rejects(`SELECT ${readCall('agent', SESSION, AT, null, 50)}`, /SHOP_DIRECTORY_EXPIRED/);
  await blockerClosed;
  // Inject only HMAC computation delay in this disposable DB to exercise RETURN's clock gate.
  sql(`INSERT INTO content_intake.principal_facts VALUES ('agent',3,ARRAY['dept'],'agent-job',true,clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 second',${quote(HASH)}); UPDATE content_intake.principals SET current_facts_version=3, revocation_generation=revocation_generation+1 WHERE principal_id='agent'; ALTER FUNCTION public.hmac(bytea,bytea,text) RENAME TO synthetic_hmac_original; CREATE FUNCTION public.hmac(bytea,bytea,text) RETURNS bytea LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(2); RETURN public.synthetic_hmac_original($1,$2,$3); END $$;`);
  rejects(`SELECT ${readCall('agent', SESSION, AT, null, 1)}`, /SHOP_DIRECTORY_EXPIRED/);
  sql('DROP FUNCTION public.hmac(bytea,bytea,text); ALTER FUNCTION public.synthetic_hmac_original(bytea,bytea,text) RENAME TO hmac');
  // GUC is not an ACL: application roles still cannot open a bypass by setting it.
  rejects(`SET ROLE app_runtime; SET content_intake.directory_write='writing'; INSERT INTO content_intake.shop_displays(tenant_id,app_id,shop_id,display_version,display_name,directory_revision,steward_id,recorded_at) VALUES ('tenant-a','app-a','shop-injected',1,'注入',1,'steward',clock_timestamp())`, /permission denied/);

  const result = {
    status: 'PASS', checks, postgres: run('postgres', ['--version']).trim(), port: 55444,
    scope: 'synthetic shop directory only; not approved for real tenant data',
  };
  writeFileSync(path.join(evidence, 'pg-summary.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result));
} catch (error) {
  writeFileSync(path.join(evidence, 'pg-summary.json'), `${JSON.stringify({ status: 'FAIL', checks, error: String(error.stderr || error.message) }, null, 2)}\n`);
  throw error;
} finally {
  if (started) run('pg_ctl', ['-D', path.join(dir, 'data'), '-m', 'fast', '-w', 'stop']);
  rmSync(dir, { recursive: true, force: true });
}
