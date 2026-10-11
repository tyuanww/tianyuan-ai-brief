import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const product=process.env.CUSTOMER_AGENT_SYNTHETIC_PRODUCT_TESTKIT;
const input=process.env.CUSTOMER_AGENT_SOP_TRUSTED_STAGE_DIR;
const enabled=process.env.CUSTOMER_AGENT_REPAIR_PG15==='1';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const xlsx='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const stage='content_intake.stage_sop_candidate_media(content_intake.identifier,content_intake.version,content_intake.identifier,content_intake.identifier,content_intake.identifier,content_intake.sha256,bigint,text,text,integer,integer,integer)';
const stageSql='SELECT content_intake.stage_sop_candidate_media($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)';
const mediaId=`med_${'b'.repeat(64)}`;
const relations=['content_intake.sop_media_objects','content_intake.sop_candidate_media','content_intake.sop_release_media'];
test('DRAFT SOP upgrade retains real predecessor history and purpose/MIME constraints', {skip:!enabled,timeout:90000},async t=>{
  assert.ok(product&&path.isAbsolute(product));assert.ok(input&&path.isAbsolute(input));
  const bytes=readFileSync(path.join(input,'storage.candidate.sql'));
  const manifest=JSON.parse(readFileSync(path.join(input,'manifest.json'),'utf8'));
  assert.equal(manifest.status,'DRAFT');assert.equal(manifest.productionConsumerReady,false);
  assert.equal(hash(bytes),manifest.artifacts['storage.candidate.sql']);const sql=bytes.toString();
  // An externally supplied candidate must be the exact input of this repository's
  // successor proposal, not merely consistent with its own adjacent manifest.
  const successor=JSON.parse(readFileSync(new URL('../../business-docs/01-客服Agent项目/30-开发-进行中/repair-successor-candidate/manifest.json',import.meta.url)));
  assert.equal(hash(bytes),successor.newSopCandidateSql,'SOP candidate must match current successor input');
  const predecessor=JSON.parse(readFileSync(new URL('../../business-docs/01-客服Agent项目/30-开发-进行中/repair-successor-candidate/predecessor-lock.json',import.meta.url)));
  assert.equal(hash(readFileSync(path.join(product,'packages/database/migrations/manifest.generated.json'))),predecessor.manifestSha256);
  assert.equal(predecessor.migrations.length,39);
  for(const m of predecessor.migrations)assert.equal(hash(readFileSync(path.join(product,'packages/database/migrations',m.file))),m.sha256);
  const {Pg15Harness}=await import(pathToFileURL(path.join(product,'packages/database/dist/testkit/index.js')));
  const {applyDatabaseMigrations}=await import(pathToFileURL(path.join(product,'packages/database/dist/index.js')));
  const {seedIntakeSyntheticHost}=await import(pathToFileURL(path.join(product,'apps/api/tests/support/intake-synthetic-seed.ts')));
  const pg=new Pg15Harness();let c;
  try{
    pg.start();const db=pg.createDatabase('sop_media_upgrade');c=await pg.connect(db.config);await applyDatabaseMigrations(c);
    await seedIntakeSyntheticHost(c,'product','xlsx',true);
    await c.query('BEGIN');
    await c.query(`INSERT INTO content_intake.objects(object_id,source_id,actor_id,tenant_id,app_id,object_key,sha256,bytes,mime,purpose,received_at)
      VALUES('upgrade-input','source-sop','enabler','tenant-a','app-a','intake/upgrade-input',repeat('a',64),100,$1,'input',clock_timestamp())`,[xlsx]);
    const material={canonicalEncodingVersion:'candidate-p1.1',scope:{tenantId:'tenant-a',appId:'app-a',brandId:'brand-a',shopId:'shop-a',domain:'product',sourceId:'source-sop'},
      sourceVersion:1,templateVersion:'faq-p1.1',ruleVersion:'intake-p1.1',mappingVersion:'sop-not-imported',selectedSheets:['来源','FAQ','相似问法'],
      object:{objectId:'upgrade-input',sourceId:'source-sop',sha256:'a'.repeat(64),bytes:100,mime:xlsx},sourceClaim:{fileSha256:'a'.repeat(64)},
      contributors:['enabler'],baseReleaseId:'rel_native_base',risk:{level:'routine',explicitDisableCount:0},entries:[]};
    await c.query(`INSERT INTO content_intake.candidate_versions(candidate_id,version,source_id,scope_id,source_version,object_id,file_sha256,actor_id,base_release_id,canonical_encoding,canonical_material,material,risk,explicit_disable_count,created_at,updated_at,publication_policy)
      VALUES('upgrade-candidate',1,'source-sop','scope-a',1,'upgrade-input',repeat('a',64),'enabler','rel_native_base','candidate-p1.1',public.jsonb_jcs($1::jsonb),$1::jsonb,'routine',0,clock_timestamp(),clock_timestamp(),'direct-v1')`,[JSON.stringify(material)]);
    const oldArgs=['upgrade-candidate',1,'source-sop','enabler',mediaId,'b'.repeat(64),68,'image/png','过敏流程SOP',2,1,1];
    await c.query('SET LOCAL ROLE intake_runtime_fn_owner');await c.query(stageSql,oldArgs);await c.query('RESET ROLE');
    await c.query(`INSERT INTO content_intake.sop_release_media SELECT 'rel_native_base',candidate_id,candidate_version,source_id,media_object_id,sheet_name,row_number,column_number,row_id,ordinal,sha256,mime,bytes FROM content_intake.sop_candidate_media WHERE candidate_id='upgrade-candidate'`);
    await c.query('COMMIT');
    const inspect=async()=>{
      const rows={};for(const rel of relations)rows[rel]=(await c.query(`SELECT (to_jsonb(t)-ARRAY['payload_object_id','payload_purpose'])::text data FROM ${rel} t ORDER BY 1`)).rows;
      const constraints=(await c.query(`SELECT conrelid::regclass::text relation,conname,contype,pg_get_constraintdef(oid) definition FROM pg_constraint
        WHERE conrelid=ANY($1::regclass[]) AND contype IN ('p','f') ORDER BY relation,conname`,[relations])).rows;
      const owners=(await c.query('SELECT oid::regclass::text relation,relowner::regrole::text owner FROM pg_class WHERE oid=ANY($1::regclass[]) ORDER BY relation',[relations])).rows;
      const fn=(await c.query('SELECT proowner::regrole::text owner,proacl,prosecdef,proconfig,prosrc FROM pg_proc WHERE oid=$1::regprocedure',[stage])).rows[0];
      return {rows,constraints,owners,fn};
    };
    const before=await inspect();
    await t.test('failure after both primary keys changed restores old keys, FKs, owners and exact history',async()=>{
      const boundary=sql.indexOf('ALTER TABLE content_intake.objects DROP CONSTRAINT');assert.ok(boundary>0);
      await c.query('BEGIN');await c.query(sql.slice(0,boundary));
      const changed=await inspect();assert.notDeepEqual(changed.constraints,before.constraints);
      for(const rel of relations.slice(1))assert.match(changed.constraints.find(k=>k.relation===rel&&k.contype==='p').definition,/row_id/);
      await assert.rejects(c.query('SELECT 1/0'),e=>e.code==='22012');await c.query('ROLLBACK');
      assert.deepEqual(await inspect(),before);
      assert.equal((await c.query("SELECT to_regclass('content_intake.sop_payload_bindings') value")).rows[0].value,null);
    });
    await t.test('full installation rollback restores predecessor function, relations and all history',async()=>{
      await c.query('BEGIN');await c.query(sql);assert.deepEqual((await inspect()).rows,before.rows);
      await c.query('ROLLBACK');assert.deepEqual(await inspect(),before);
    });
    await t.test('committed upgrade keeps metadata-only history, owner and foreign keys without inventing payloads',async()=>{
      await c.query('BEGIN');await c.query(sql);await c.query('COMMIT');const after=await inspect();
      assert.deepEqual(after.rows,before.rows);assert.deepEqual(after.owners,before.owners);
      assert.deepEqual(after.constraints.filter(k=>k.contype==='f'&&k.conname!=='sop_payload_exact'),before.constraints.filter(k=>k.contype==='f'));
      assert.equal(after.constraints.find(k=>k.relation===relations[1]&&k.contype==='p').definition,'PRIMARY KEY (candidate_id, candidate_version, row_id, media_object_id, ordinal)');
      assert.equal(after.constraints.find(k=>k.relation===relations[2]&&k.contype==='p').definition,'PRIMARY KEY (release_id, row_id, media_object_id, ordinal)');
      assert.equal(after.constraints.find(k=>k.conname==='sop_payload_exact').definition,'FOREIGN KEY (payload_object_id, source_id, sha256, bytes, mime, payload_purpose) REFERENCES content_intake.objects(object_id, source_id, sha256, bytes, mime, purpose)');
      for(const key of ['owner','proacl','prosecdef','proconfig'])assert.deepEqual(after.fn[key],before.fn[key]);
      assert.equal(after.fn.prosrc,before.fn.prosrc.replace('ON CONFLICT (candidate_id, candidate_version, media_object_id, ordinal)','ON CONFLICT (candidate_id, candidate_version, row_id, media_object_id, ordinal)'));
      assert.deepEqual((await c.query('SELECT payload_object_id,payload_purpose FROM content_intake.sop_media_objects')).rows,[{payload_object_id:null,payload_purpose:'sop-media'}]);
      assert.equal((await c.query('SELECT count(*)::int n FROM customer_agent_meta.schema_migrations')).rows[0].n,39);
    });
    await t.test('old stage signature executes idempotently under its owner and admits the new cross-row key',async()=>{
      await c.query('BEGIN');await c.query('SET LOCAL ROLE intake_runtime_fn_owner');
      await c.query(stageSql,oldArgs);await c.query(stageSql,oldArgs);
      const next=[...oldArgs];next[9]=3;await c.query(stageSql,next);await c.query(stageSql,next);
      assert.equal((await c.query("SELECT count(*)::int n FROM content_intake.sop_candidate_media WHERE candidate_id='upgrade-candidate'")).rows[0].n,2);
      await c.query('ROLLBACK');assert.deepEqual((await inspect()).rows,before.rows);
      for(const role of ['intake_business','intake_usage','intake_worker','intake_org_writer']){
        await c.query('BEGIN');await c.query(`SET LOCAL ROLE ${role}`);await assert.rejects(c.query(stageSql,oldArgs),e=>e.code==='42501');await c.query('ROLLBACK');
      }
    });
    await t.test('normal input path accepts correct CSV/XLSX mappings and rejects incompatible MIME before CHECK',async()=>{
      const {CSV_TEMPLATE_VERSION,CSV_POLICY_VERSION,CSV_MAPPING_VERSION,CSV_STRUCTURE_SHA256}=await import(pathToFileURL(path.join(product,'packages/content-intake/dist/workbook.js')));
      await c.query('BEGIN');
      await c.query("INSERT INTO content_intake.sources(source_id,scope_id,current_mapping_version,mode) VALUES('source-csv','scope-a',1,'v2-preview')");
      await c.query("INSERT INTO content_intake.source_mappings VALUES('source-csv',1,$1,$2,$3,$4)",[CSV_TEMPLATE_VERSION,CSV_POLICY_VERSION,CSV_MAPPING_VERSION,CSV_STRUCTURE_SHA256]);
      await c.query('COMMIT');
      for(const [id,source,mime,valid]of [['normal-xlsx','source-sop',xlsx,true],['normal-csv','source-csv','text/csv',true],['invalid-image','source-sop','image/png',false],['wrong-mapping','source-sop','text/csv',false]]){
        await c.query('BEGIN');await c.query('SET LOCAL ROLE intake_runtime_fn_owner');
        const q=c.query(`INSERT INTO content_intake.objects(object_id,source_id,actor_id,tenant_id,app_id,object_key,sha256,bytes,mime,purpose,received_at)
          VALUES($1::text,$2,'enabler','tenant-a','app-a','intake/'||$1::text,repeat('c',64),68,$3,'input',clock_timestamp())`,[id,source,mime]);
        if(valid)await q;else await assert.rejects(q,e=>e.code==='ZA003'&&e.message==='SOURCE_FORMAT_MISMATCH');
        await c.query('ROLLBACK');
      }
    });
    await t.test('owner INSERT validates all 28 purpose/MIME pairs and size boundaries with genuine CHECK errors',async()=>{
      const allowed={input:[xlsx,'text/csv'],report:[xlsx,'application/pdf','application/json'],'review-package':[xlsx,'application/pdf','application/json'],'sop-media':['image/png','image/jpeg','image/gif']};
      const mimes=[xlsx,'text/csv','application/pdf','application/json','image/png','image/jpeg','image/gif'];
      let n=0;
      const probe=async(purpose,mime,size,valid)=>{
        await c.query('BEGIN');
        // Isolate the real table's CHECK constraints: the separate BEFORE format
        // trigger otherwise rejects invalid input MIME first (tested above).
        // This isolated owner fixture disables only that trigger, transactionally;
        // CHECKs/FKs remain enabled and ROLLBACK restores the trigger every time.
        await c.query('ALTER TABLE content_intake.objects DISABLE TRIGGER input_object_format');
        await c.query('SET LOCAL ROLE intake_runtime_fn_owner');
        const params=[`matrix-${++n}`,purpose,mime,size];
        const q=c.query(`INSERT INTO content_intake.objects(object_id,source_id,actor_id,tenant_id,app_id,object_key,sha256,bytes,mime,purpose,received_at)
          VALUES($1::text,'source-sop','enabler','tenant-a','app-a','intake/'||$1::text,repeat('c',64),$4,$3,$2,clock_timestamp())`,params);
        if(valid)await q;else await assert.rejects(q,e=>e.code==='23514',`${purpose}/${mime}/${size} must fail CHECK, not ACL`);
        await c.query('ROLLBACK');
        assert.equal((await c.query("SELECT tgenabled FROM pg_trigger WHERE tgrelid='content_intake.objects'::regclass AND tgname='input_object_format'")).rows[0].tgenabled,'O');
      };
      for(const [purpose,valid]of Object.entries(allowed))for(const mime of mimes)await probe(purpose,mime,68,valid.includes(mime));
      for(const mime of allowed['sop-media']){await probe('sop-media',mime,5242880,true);await probe('sop-media',mime,5242881,false);}
      for(const mime of allowed.input){await probe('input',mime,10485760,true);await probe('input',mime,10485761,false);}
      assert.equal(n,38);
      assert.equal((await c.query("SELECT tgenabled FROM pg_trigger WHERE tgrelid='content_intake.objects'::regclass AND tgname='input_object_format'")).rows[0].tgenabled,'O');
      assert.equal((await c.query("SELECT count(*)::int n FROM content_intake.objects WHERE object_id LIKE 'matrix-%'")).rows[0].n,0);
    });
  }finally{try{await c?.end();}finally{pg.stop();}}
});
