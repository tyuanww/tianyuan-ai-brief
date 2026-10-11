import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { CANDIDATE_DIR, FUNCTIONS, sha256 } from '../../business-docs/08-工具/build_customer_agent_readiness_successor.mjs';
const read = name => readFileSync(new URL(`../../${name}`, import.meta.url));
const enabled = process.env.CUSTOMER_AGENT_READINESS_PG15 === '1';
test('readiness successor on exact synthetic forty-migration predecessor', { skip: !enabled, timeout: 90000 }, async t => {
  const product = process.env.CUSTOMER_AGENT_SYNTHETIC_PRODUCT_TESTKIT;
  assert.ok(product && path.isAbsolute(product), 'Explicit synthetic product testkit path required; never a database URL');
  const lock = JSON.parse(read(`${CANDIDATE_DIR}/predecessor-lock.json`));
  assert.equal(sha256(readFileSync(path.join(product, 'packages/database/migrations/manifest.generated.json'))), lock.manifestSha256);
  for (const m of lock.migrations) assert.equal(sha256(readFileSync(path.join(product, 'packages/database/migrations', m.file))), m.sha256);
  const { Pg15Harness } = await import(pathToFileURL(path.join(product, 'packages/database/dist/testkit/index.js')));
  const { applyDatabaseMigrations } = await import(pathToFileURL(path.join(product, 'packages/database/dist/index.js')));
  const { RUNTIME_SCHEMA_PROBE_SQL, RUNTIME_POLICY_FLAGS_SQL, interpretRuntimeSchemaRow } = await import(pathToFileURL(path.join(product, 'apps/api/dist/repository/runtime-boundary-probe.js')));
  const h = new Pg15Harness(); let owner, runtime;
  const sql = read(`${CANDIDATE_DIR}/upgrade.candidate.sql`).toString();
  try {
    h.start(); const db = h.createDatabase('readiness_successor'); owner = await h.connect(db.config);
    await applyDatabaseMigrations(owner);
    await owner.query('CREATE ROLE synthetic_readiness LOGIN; GRANT app_runtime TO synthetic_readiness');
    runtime = await h.connect({ ...db.config, user: 'synthetic_readiness' });
    const snapshot = async () => (await owner.query(`SELECT oid::regprocedure::text signature,prosrc,proowner,prosecdef,proconfig,proacl::text FROM pg_proc WHERE oid=ANY($1::regprocedure[]) ORDER BY 1`, [FUNCTIONS])).rows;
    const original = await snapshot();
    const marker = async () => (await owner.query("SELECT obj_description('public'::regnamespace,'pg_namespace') comment")).rows[0].comment;
    const oldMarker = await marker();
    const row = async () => (await runtime.query(RUNTIME_SCHEMA_PROBE_SQL)).rows[0];
    await t.test('unmodified predecessor is rejected by existing strict probe', async () => {
      const before = await row(); assert.equal(before.runtime_effective_acl_safe, false);
      assert.equal(interpretRuntimeSchemaRow(before).schema, 'not_ready');
    });
    for (const mutation of ["DELETE FROM customer_agent_meta.schema_migrations WHERE position=40",
      "UPDATE customer_agent_meta.schema_migrations SET migration_sha256=repeat('0',64) WHERE position=40"]) {
      await t.test(`predecessor mismatch rolls back: ${mutation.split(' ')[0]}`, async () => {
        await owner.query('BEGIN'); await owner.query(mutation);
        await assert.rejects(owner.query(sql), /READINESS_PREDECESSOR_RECEIPTS_MISMATCH/);
        await owner.query('ROLLBACK'); assert.deepEqual(await snapshot(), original); assert.equal(await marker(), oldMarker);
      });
    }
    await t.test('unsafe role rejected before ACL mutation', async () => {
      await owner.query('BEGIN'); await owner.query('ALTER ROLE intake_worker LOGIN');
      await assert.rejects(owner.query(sql), /READINESS_ROLE_BOUNDARY_MISMATCH/);
      await owner.query('ROLLBACK'); assert.deepEqual(await snapshot(), original);
    });
    await t.test('failure after whole delta rolls back ACL and marker', async () => {
      await owner.query('BEGIN'); await owner.query(sql);
      await assert.rejects(owner.query('SELECT 1/0'), { code:'22012' });
      await owner.query('ROLLBACK'); assert.deepEqual(await snapshot(), original); assert.equal(await marker(), oldMarker);
    });
    await t.test('upgrade preserves function bodies, security envelopes and strict future provenance gate', async () => {
      await owner.query('BEGIN'); await owner.query(sql); await owner.query('COMMIT');
      const after = await snapshot();
      assert.deepEqual(after.map(({proacl,...rest})=>rest), original.map(({proacl,...rest})=>rest));
      assert.match(await marker(), /^CS-AI-C11 schema\.v1\.29;/);
      const actual = await row();
      for (const field of ['repository_boundary_present','runtime_identity_safe','runtime_effective_acl_safe','runtime_search_boundary_safe']) assert.equal(actual[field],true,field);
      // Old product provenance must reject the future version until formal intake.
      assert.equal(interpretRuntimeSchemaRow(actual).schema, 'not_ready');
      const flags = await runtime.query(RUNTIME_POLICY_FLAGS_SQL, ['CS-AI-C11 schema.v1.29;','CS-AI-C11 schema.v1.17;','schema.v1.29']);
      assert.equal(flags.rowCount,1); assert.ok(Object.values(flags.rows[0]).every(value=>value===false));
      assert.equal((await owner.query('SELECT count(*)::int n FROM customer_agent_meta.schema_migrations')).rows[0].n,40);
      assert.equal((await owner.query(`SELECT count(*)::int n FROM pg_proc p,LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=ANY($1::regprocedure[]) AND a.grantee=0`,[FUNCTIONS])).rows[0].n,0);
    });
    await t.test('only existing predicate consumers retain execution, without grant option',async()=>{
      for(const role of ['intake_business','intake_worker','intake_runtime_fn_owner','intake_usage','intake_org_writer','app_runtime']) {
        const yes = ['intake_business','intake_worker','intake_runtime_fn_owner'].includes(role);
        const result = await owner.query("SELECT has_function_privilege($1,'content_intake.input_format_matches(text,text,text,text,text)','EXECUTE') allowed",[role]);
        assert.equal(result.rows[0].allowed,yes,role);
      }
      assert.equal((await owner.query(`SELECT count(*)::int n FROM pg_proc p,LATERAL aclexplode(p.proacl) a JOIN pg_roles r ON r.oid=a.grantee WHERE p.oid='content_intake.input_format_matches(text,text,text,text,text)'::regprocedure AND r.rolname LIKE 'intake_%' AND a.is_grantable`)).rows[0].n,0);
      await assert.rejects(runtime.query("SELECT content_intake.input_format_matches('','','','','')"),{code:'42501'});
    });
    await t.test('newer receipt rejects downgrade/reapplication',async()=>{
      await owner.query('BEGIN'); await owner.query('UPDATE customer_agent_meta.schema_migrations SET position=41 WHERE position=40');
      await assert.rejects(owner.query(sql),/READINESS_PREDECESSOR_RECEIPTS_MISMATCH/); await owner.query('ROLLBACK');
    });
    for (const drift of [
      ['GRANT EXECUTE ON FUNCTION content_intake.input_format_matches(text,text,text,text,text) TO PUBLIC','REVOKE ALL ON FUNCTION content_intake.input_format_matches(text,text,text,text,text) FROM PUBLIC'],
      ['GRANT EXECUTE ON FUNCTION content_intake.input_format_matches(text,text,text,text,text) TO synthetic_readiness','REVOKE ALL ON FUNCTION content_intake.input_format_matches(text,text,text,text,text) FROM synthetic_readiness'],
      ['GRANT SELECT ON public.content_current TO synthetic_readiness','REVOKE SELECT ON public.content_current FROM synthetic_readiness'],
    ]) await t.test(`strict probe rejects drift: ${drift[0]}`,async()=>{
      await owner.query(drift[0]); assert.equal((await row()).runtime_effective_acl_safe,false);
      assert.equal((await runtime.query(RUNTIME_POLICY_FLAGS_SQL,['CS-AI-C11 schema.v1.29;','CS-AI-C11 schema.v1.17;','schema.v1.29'])).rowCount,0);
      await owner.query(drift[1]); assert.equal((await row()).runtime_effective_acl_safe,true);
    });
  } finally { try { await runtime?.end(); await owner?.end(); } finally { h.stop(); } }
  assert.equal(existsSync(h.root),false);
});
