import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { CANDIDATE_DIR, FUNCTIONS, USAGE_FUNCTIONS, OLD_DELETE, sha256 } from '../../business-docs/08-工具/build_customer_agent_repair_successor_candidate.mjs';
const root = new URL('../../',import.meta.url);
const read=name=>readFileSync(new URL(name,root));
// Explicit test-only input: never a runtime cross-repository dependency or a real database URL.
const product=process.env.CUSTOMER_AGENT_SYNTHETIC_PRODUCT_TESTKIT;
const enabled=process.env.CUSTOMER_AGENT_REPAIR_PG15==='1';
test('combined repair installs atomically over the exact synthetic 39-migration closure', {skip:!enabled,timeout:90000},async t=>{
  assert.ok(product&&path.isAbsolute(product),'Set absolute CUSTOMER_AGENT_SYNTHETIC_PRODUCT_TESTKIT to existing synthetic product testkit root');
  const lock=JSON.parse(read(`${CANDIDATE_DIR}/predecessor-lock.json`));
  assert.equal(sha256(readFileSync(path.join(product,'packages/database/migrations/manifest.generated.json'))),lock.manifestSha256);
  for(const migration of lock.migrations)assert.equal(sha256(readFileSync(path.join(product,'packages/database/migrations',migration.file))),migration.sha256);
  const {Pg15Harness}=await import(pathToFileURL(path.join(product,'packages/database/dist/testkit/index.js')));
  const {applyDatabaseMigrations}=await import(pathToFileURL(path.join(product,'packages/database/dist/index.js')));
  const pg=new Pg15Harness();let client;
  const sql=read(`${CANDIDATE_DIR}/upgrade.candidate.sql`).toString();
  try{
    pg.start();const db=pg.createDatabase('repair_successor');client=await pg.connect(db.config);await applyDatabaseMigrations(client);
    const inspect=async()=> (await client.query("SELECT proowner::regrole::text AS owner,proacl,prosecdef,proconfig,encode(digest(prosrc,'sha256'),'hex') AS hash FROM pg_proc WHERE oid='public.publish_content_release(text,text,text,text,text)'::regprocedure")).rows[0];
    const before=await inspect();
    const applicationWrites=async()=> (await client.query("SELECT relation,has_table_privilege('intake_business',relation,'INSERT') ins,has_table_privilege('intake_business',relation,'UPDATE') upd,has_table_privilege('intake_business',relation,'DELETE') del FROM unnest(ARRAY['content_intake.parse_jobs','content_intake.candidate_versions','content_intake.candidate_vocabulary']) relation ORDER BY relation")).rows;
    const beforeWrites=await applicationWrites();
    await t.test('exact predecessor installs and preserves publisher security envelope',async()=>{
      await client.query('BEGIN');await client.query(sql);const after=await inspect();assert.notEqual(after.hash,before.hash);
      for(const field of ['owner','proacl','prosecdef','proconfig'])assert.deepEqual(after[field],before[field]);
      for(const signature of FUNCTIONS){
        const row=(await client.query('SELECT proowner::regrole::text owner,prosecdef,proconfig FROM pg_proc WHERE oid=$1::regprocedure',[signature])).rows[0];
        assert.equal(row.owner,'intake_runtime_fn_owner');assert.equal(row.prosecdef,true);assert.deepEqual(row.proconfig,['search_path=pg_catalog']);
        for(const role of ['intake_business','intake_usage','intake_worker','intake_org_writer'])assert.equal((await client.query("SELECT has_function_privilege($1,$2,'EXECUTE') allowed",[role,signature])).rows[0].allowed,role==='intake_business');
        assert.equal((await client.query("SELECT EXISTS (SELECT 1 FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=$1::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE') allowed",[signature])).rows[0].allowed,false);
      }
      for(const signature of USAGE_FUNCTIONS){
        const row=(await client.query('SELECT proowner::regrole::text owner,prosecdef,proconfig FROM pg_proc WHERE oid=$1::regprocedure',[signature])).rows[0];
        assert.deepEqual(row,{owner:'intake_runtime_fn_owner',prosecdef:true,proconfig:['search_path=pg_catalog']});
        for(const role of ['intake_business','intake_usage','intake_worker','intake_org_writer'])assert.equal((await client.query("SELECT has_function_privilege($1,$2,'EXECUTE') allowed",[role,signature])).rows[0].allowed,role==='intake_usage');
        assert.equal((await client.query("SELECT EXISTS (SELECT 1 FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=$1::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE') allowed",[signature])).rows[0].allowed,false);
      }
      assert.equal((await client.query("SELECT has_function_privilege('intake_business',$1,'EXECUTE') allowed",[OLD_DELETE])).rows[0].allowed,false);
      for(const signature of ['content_intake.register_sop_candidate_rows(text,text,bigint,jsonb)','content_intake.stage_sop_candidate_assets(text,text,bigint,jsonb,jsonb)',
        'content_intake.stage_sop_candidate_media(content_intake.identifier,content_intake.version,content_intake.identifier,content_intake.identifier,content_intake.identifier,content_intake.sha256,bigint,text,text,integer,integer,integer)']){
        assert.equal((await client.query("SELECT has_function_privilege('intake_business',$1,'EXECUTE') allowed",[signature])).rows[0].allowed,false,signature);
        assert.equal((await client.query("SELECT has_function_privilege('intake_runtime_fn_owner',$1,'EXECUTE') allowed",[signature])).rows[0].allowed,true,signature);
      }
      assert.equal((await client.query("SELECT has_table_privilege('intake_business','content_intake.sop_asset_registrations','SELECT,INSERT,UPDATE,DELETE') allowed")).rows[0].allowed,false);
      assert.equal((await client.query("SELECT has_table_privilege('intake_business','content_intake.sop_row_deletion_events','SELECT,INSERT,UPDATE,DELETE') allowed")).rows[0].allowed,false);
      const history=(await client.query("SELECT c.relowner::regrole::text owner,t.tgfoid::regprocedure::text fn FROM pg_class c JOIN pg_trigger t ON t.tgrelid=c.oid WHERE c.oid='content_intake.sop_row_deletion_events'::regclass AND t.tgname='sop_deletion_history'")).rows[0];
      assert.deepEqual(history,{owner:'intake_runtime_fn_owner',fn:'content_intake.immutable_history()'});

      for(const col of ['state','finished_at','result_candidate_id','result_candidate_version'])assert.equal((await client.query("SELECT has_column_privilege('intake_runtime_fn_owner','content_intake.parse_jobs',$1,'UPDATE') allowed",[col])).rows[0].allowed,true,col);
      assert.deepEqual(await applicationWrites(),beforeWrites,'No additional application table writes; pre-existing job admission INSERT remains');

      assert.equal((await client.query("SELECT has_table_privilege('intake_business','content_intake.sop_candidate_rows','SELECT,INSERT,UPDATE,DELETE') allowed")).rows[0].allowed,false);
      for(const [relation, privileges] of Object.entries({
        'content_intake.candidate_versions':['SELECT','INSERT','UPDATE'], 'content_intake.candidate_vocabulary':['SELECT','INSERT'],
        'content_intake.objects':['SELECT'], 'content_intake.source_mappings':['SELECT'], 'content_intake.scopes':['SELECT'],
        'content_intake.sources':['SELECT'], 'content_intake.write_attempts':['SELECT'], 'content_intake.release_lineage':['SELECT'],
        'public.content_current':['SELECT'], 'content_intake.sop_candidate_rows':['SELECT','INSERT'],
        'content_intake.sop_candidate_media':['SELECT','INSERT','DELETE'], 'content_intake.sop_media_objects':['SELECT','UPDATE'],
        'content_intake.sop_release_media':['SELECT'],
      }))for(const privilege of privileges)assert.equal((await client.query('SELECT has_table_privilege($1,$2,$3) allowed',['intake_runtime_fn_owner',relation,privilege])).rows[0].allowed,true,`${relation}:${privilege}`);
      for(const signature of ['backend_review.lock_content()','content_intake.authorization_deadline(text,text,text,text,timestamp with time zone)','public.jsonb_jcs(jsonb)','public.digest(text,text)'])assert.equal((await client.query("SELECT has_function_privilege('intake_runtime_fn_owner',$1,'EXECUTE') allowed",[signature])).rows[0].allowed,true,signature);
      await client.query('ROLLBACK');assert.deepEqual(await inspect(),before);
      assert.equal((await client.query("SELECT to_regclass('content_intake.sop_candidate_rows') relation")).rows[0].relation,null);
    });
    await t.test('receipt drift rejects without replacing publisher or leaving new tables',async()=>{
      await client.query('BEGIN');await client.query("UPDATE customer_agent_meta.schema_migrations SET migration_sha256=repeat('0',64) WHERE position=39");
      await assert.rejects(client.query(sql),e=>e.message==='REPAIR_PREDECESSOR_RECEIPTS_MISMATCH');await client.query('ROLLBACK');assert.deepEqual(await inspect(),before);
    });
    await t.test('failure after publisher replacement rolls the complete composite back',async()=>{
      await client.query('BEGIN');await client.query('CREATE TABLE content_intake.sop_candidate_rows (synthetic_collision integer)');await client.query('COMMIT');
      await client.query('BEGIN');await assert.rejects(client.query(sql),e=>e.code==='42P07');await client.query('ROLLBACK');assert.deepEqual(await inspect(),before);
      await client.query('DROP TABLE content_intake.sop_candidate_rows');
    });
    await t.test('committed composite exposes only scoped entry points and rollback-safe repeat rejection',async()=>{
      await client.query('BEGIN');await client.query(sql);await client.query('COMMIT');
      const installed=await inspect();
      await client.query('BEGIN');await client.query('SET LOCAL ROLE intake_business');
      await assert.rejects(client.query("SELECT content_intake.freeze_sop_parsed_candidate('synthetic-missing','synthetic-job','{}'::jsonb,'[]'::jsonb,'{}'::jsonb)"),e=>e.code==='ZA003');await client.query('ROLLBACK');
      await client.query('BEGIN');await client.query('SET LOCAL ROLE intake_business');
      await assert.rejects(client.query("SELECT content_intake.revise_unused_sop_row('synthetic-missing','synthetic-candidate',1,repeat('0',64),'sop:过敏流程SOP:1')"),e=>e.code==='ZA003');await client.query('ROLLBACK');
      await client.query('BEGIN');await assert.rejects(client.query(sql),e=>e.message==='PUBLICATION_COMPATIBILITY_PREDECESSOR_MISMATCH');await client.query('ROLLBACK');assert.deepEqual(await inspect(),installed);
      assert.equal((await client.query('SELECT count(*)::int n FROM customer_agent_meta.schema_migrations')).rows[0].n,39,'Probe does not issue a formal migration receipt');
    });
  }finally{try{await client?.end();}finally{pg.stop();}}
  assert.equal(existsSync(pg.root),false,'Owned temporary cluster removed');
});
