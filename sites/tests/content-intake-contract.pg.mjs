import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Disposable Unix-socket-only PG15. Never inherit a user's database connection.
const argsIn=process.argv.slice(2);
assert.ok(argsIn.length===0 || (argsIn.length===1 && ['--usage','--direct'].includes(argsIn[0])),'only --usage or --direct is supported');
const direct=argsIn[0]==='--direct';
const usage=direct || argsIn[0]==='--usage';
const root=fileURLToPath(new URL('../../',import.meta.url));
const env={...process.env,PGCONNECT_TIMEOUT:'5'};
for(const key of Object.keys(env)) if(key.startsWith('PG') && key!=='PGCONNECT_TIMEOUT') delete env[key];
const bin=process.env.PG_BIN || execFileSync('pg_config',['--bindir'],{encoding:'utf8',env}).trim();
const run=(name,args)=>execFileSync(path.join(bin,name),args,{cwd:root,encoding:'utf8',env,maxBuffer:8*1024*1024,timeout:60000,stdio:['ignore','pipe','pipe']});
assert.match(run('postgres',['--version']),/PostgreSQL\) 15\./);
const dir=mkdtempSync(path.join(tmpdir(),'intake-contract-'));
const evidence=path.join(root,direct?'output/content-intake-direct-contract':usage?'output/content-intake-usage-contract':'output/content-intake-contract');mkdirSync(evidence,{recursive:true});
const args=['-X','-h',dir,'-p','55443','-d','postgres','-v','ON_ERROR_STOP=1'];
const sql=q=>run('psql',[...args,'-Atc',q]).trim();
const quote=v=>`'${String(v).replaceAll("'","''")}'`;
let started=false,checks=0;
const missingGuards=[];
const denies=(name,query,pattern)=>{try{rejects(`BEGIN; ${query}; ROLLBACK`,pattern);}catch(error){missingGuards.push(name+': '+error.message);}};
const rejects=(query,pattern)=>{assert.throws(()=>sql(query),error=>{assert.match(String(error.stderr),pattern);return true;});checks++;};
const hash='a'.repeat(64);
const material=(source='source-a',object='object-a')=>({canonicalEncodingVersion:'candidate-p1.1',scope:{tenantId:'tenant',appId:'app',brandId:'brand',shopId:source==='source-a'?'shop-a':'shop-b',domain:'product',sourceId:source},object:{objectId:object,sha256:hash},sourceClaim:{fileSha256:hash},contributors:['manager'],baseReleaseId:null,risk:{level:'routine',explicitDisableCount:0}});
const insertCandidate=(id,source='source-a',scope='scope-a',object='object-a')=>{
 const body=JSON.stringify(material(source,object));
 return `INSERT INTO content_intake.candidate_versions(candidate_id,version,source_id,scope_id,source_version,object_id,file_sha256,actor_id,canonical_encoding,canonical_material,material,risk,explicit_disable_count,created_at,updated_at) VALUES(${quote(id)},1,${quote(source)},${quote(scope)},1,${quote(object)},${quote(hash)},'manager','candidate-p1.1',${quote(body)},${quote(body)},'routine',0,clock_timestamp(),clock_timestamp())`;
};
try {
 run('initdb',['-D',path.join(dir,'data'),'-A','trust','--no-locale','--encoding=UTF8']);
 run('pg_ctl',['-D',path.join(dir,'data'),'-l',path.join(dir,'server.log'),'-o',`-k ${dir} -p 55443 -h ''`,'-w','start']);started=true;
 writeFileSync(path.join(evidence,'install.log'),run('psql',[...args,'-f',`business-docs/01-客服Agent项目/30-开发-进行中/schema.v1.${usage?'21':'20'}.sql`]));checks++;
 const before=sql('SELECT count(*) FROM public.content_current');
 sql(`BEGIN;
 INSERT INTO backend_identity.subject_bindings(binding_id,provider,tenant,subject,user_id,subject_hash,enabled,role) VALUES
 ('binding-manager','synthetic','tenant','manager','manager','${hash}',true,'coach'),
 ('binding-director','synthetic','tenant','director','director','${hash}',true,'owner'),
 ('binding-agent','synthetic','tenant','agent','agent','${hash}',true,'agent');
 INSERT INTO content_intake.principals VALUES ('manager','manager','tenant','app','confirmed-synthetic','person-manager',1,0),('director','director','tenant','app','confirmed-synthetic','person-director',1,0),('agent','agent','tenant','app','confirmed-synthetic','person-agent',1,0);
 INSERT INTO content_intake.principal_facts VALUES ('director',1,ARRAY['dept'],'director-job',true,clock_timestamp(),clock_timestamp()+interval '4 minutes','${hash}'),('manager',1,ARRAY['dept'],'manager-job',true,clock_timestamp(),clock_timestamp()+interval '4 minutes','${hash}'),('agent',1,ARRAY['dept'],'agent-job',true,clock_timestamp(),clock_timestamp()+interval '4 minutes','${hash}');
 INSERT INTO content_intake.role_rules VALUES ('tenant','app','dept','director-job',1,'director'),('tenant','app','dept','manager-job',1,'manager'),('tenant','app','dept','agent-job',1,'agent');
 INSERT INTO content_intake.scopes VALUES ('scope-a','tenant','app','brand','shop-a','product'),('scope-b','tenant','app','brand','shop-b','product');
 INSERT INTO content_intake.sources(source_id,scope_id,current_mapping_version,mode) VALUES ('source-a','scope-a',1,'v2-preview'),('source-b','scope-b',1,'v2-preview');
 INSERT INTO content_intake.source_mappings VALUES ('source-a',1,'faq-p1.1','intake-p1.1','mapping-1','${hash}'),('source-b',1,'faq-p1.1','intake-p1.1','mapping-1','${hash}');
 INSERT INTO content_intake.grants(grant_id,kind,issuer_id,recipient_id,tenant_id,app_id,scope_id,action,starts_at,expires_at,steward_id,reason) VALUES ('allocation','allocation','director','director','tenant','app','scope-a','publish',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '2 hours','director','synthetic root');
 INSERT INTO content_intake.grants(grant_id,kind,issuer_id,recipient_id,tenant_id,app_id,scope_id,action,starts_at,expires_at,steward_id,parent_grant_id,reason) VALUES
 ('manager-publish','business','director','manager','tenant','app','scope-a','publish',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour','manager','allocation','synthetic fixture'),
 ('agent-publish','business','director','agent','tenant','app','scope-a','publish',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour','manager','allocation','synthetic invalid ceiling fixture');
 INSERT INTO content_intake.objects VALUES ('object-a','source-a','manager','tenant','app','intake/a.xlsx','${hash}',1000,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','input',clock_timestamp());
 COMMIT;`);
 assert.equal(sql("SELECT content_intake.authorization_deadline('manager','publish','scope-a','source-a',clock_timestamp()) IS NOT NULL"),'t');checks++;
 for(const [actor,scope,source] of [['agent','scope-a','source-a'],['manager','scope-b','source-b'],['manager','scope-a','source-b']]) {
  assert.equal(sql(`SELECT content_intake.authorization_deadline('${actor}','publish','${scope}','${source}',clock_timestamp()) IS NULL`),'t');checks++;
 }
 assert.equal(sql("SELECT content_intake.authorization_deadline('manager','publish','scope-a','source-a',clock_timestamp()+interval '6 minutes') IS NULL"),'t');checks++;
 // Multiple conflicting exact department/job mappings must not choose the strongest role.
 sql("INSERT INTO content_intake.role_rules VALUES ('tenant','app','other-dept','manager-job',1,'agent')");
 rejects("UPDATE content_intake.principal_facts SET department_ids=ARRAY['dept','other-dept'] WHERE principal_id='manager'",/INTAKE_HISTORY_IMMUTABLE/);
 sql(insertCandidate('candidate-a'));checks++;
 rejects(insertCandidate('wrong-scope','source-a','scope-b'),/SOURCE_SCOPE_MISMATCH/);
 rejects(insertCandidate('wrong-source','source-b','scope-b'),/foreign key/);
 rejects(insertCandidate('candidate-a'),/duplicate key/);
 rejects("UPDATE content_intake.candidate_versions SET canonical_material='{}',material='{}' WHERE candidate_id='candidate-a'",/MATERIAL_CHANGED/);
 rejects("UPDATE content_intake.candidate_versions SET state='published' WHERE candidate_id='candidate-a'",/CANDIDATE_STATE_TRANSITION|check constraint/);
 const digest=sql("SELECT digest FROM content_intake.candidate_versions WHERE candidate_id='candidate-a'");
 sql(`INSERT INTO content_intake.source_confirmations VALUES ('candidate-a',1,'${digest}','source-a',1,0,'integer','1','controlled-synthetic-export','manager',clock_timestamp(),'${hash}')`);checks++;
 rejects(`INSERT INTO content_intake.source_confirmations VALUES ('candidate-a',1,'${hash}','source-a',2,0,'integer','2','controlled-synthetic-export','manager',clock_timestamp(),'${hash}')`,/foreign key/);
 rejects(`INSERT INTO content_intake.source_confirmations VALUES ('candidate-a',1,'${digest}','source-b',2,0,'integer','2','controlled-synthetic-export','manager',clock_timestamp(),'${hash}')`,/foreign key/);
 sql("UPDATE content_intake.candidate_versions SET source_evidence_version=1,updated_at=clock_timestamp() WHERE candidate_id='candidate-a'");
 assert.equal(sql("SELECT digest FROM content_intake.candidate_versions WHERE candidate_id='candidate-a'"),digest);checks++;
 rejects("UPDATE content_intake.candidate_versions SET source_evidence_version=0 WHERE candidate_id='candidate-a'",/VERSION_REGRESSION/);
 rejects("DELETE FROM content_intake.source_confirmations",/INTAKE_HISTORY_IMMUTABLE/);
 sql(`INSERT INTO content_intake.vocabulary VALUES ('product-1','scope-a','product','${hash}',true);
 INSERT INTO content_intake.vocabulary_displays VALUES ('product-1',1,'合成品');
 INSERT INTO content_intake.candidate_vocabulary VALUES ('candidate-a',1,'product-1',1);`);
 rejects("UPDATE content_intake.vocabulary SET active=false WHERE vocabulary_id='product-1'",/VOCABULARY_IN_USE/);
 rejects("UPDATE content_intake.vocabulary SET meaning_digest=repeat('b',64) WHERE vocabulary_id='product-1'",/MEANING_CHANGED/);
 sql("INSERT INTO content_intake.vocabulary_displays VALUES ('product-1',2,'合成品修正展示名')");checks++;
 // Regression probes run in rolled-back transactions so a missing guard cannot pollute later checks.
 denies('identity generation cannot regress',"UPDATE content_intake.principals SET revocation_generation=2 WHERE principal_id='manager'; UPDATE content_intake.principals SET revocation_generation=1 WHERE principal_id='manager'",/VERSION_REGRESSION/);
 denies('identity binding is immutable',"UPDATE content_intake.principals SET identity_scope='other' WHERE principal_id='manager'",/IDENTITY_IMMUTABLE/);
 denies('parse object must belong to source',"INSERT INTO content_intake.parse_jobs(job_id,source_version,contributor_ids,generation,source_id,object_id,actor_id,state,started_at) VALUES ('job',1,ARRAY['manager'],1,'source-b','object-a','manager','reading',clock_timestamp())",/foreign key|OBJECT_BINDING/);
 denies('risk count is material',"UPDATE content_intake.candidate_versions SET state='invalidated' WHERE candidate_id='candidate-a'; "+insertCandidate('risk-count').replace(",'routine',0,clock_timestamp()",",'routine',2,clock_timestamp()"),/check constraint/);
 denies('terms cannot cross shops',"INSERT INTO content_intake.vocabulary VALUES ('product-other','scope-b','product',repeat('a',64),true); INSERT INTO content_intake.vocabulary_displays VALUES ('product-other',1,'其他店'); INSERT INTO content_intake.candidate_vocabulary VALUES ('candidate-a',1,'product-other',1)",/VOCABULARY_SCOPE/);
 const reviewSetup=`INSERT INTO content_intake.objects VALUES ('package-a','source-a','manager','tenant','app','intake/review.pdf','${hash}',1000,'application/pdf','review-package',clock_timestamp());
 INSERT INTO content_intake.review_bindings(review_request_id,candidate_id,candidate_version,candidate_digest,evidence_version,tenant_id,app_id,definition_id,node_id,create_uuid,instance_code,package_object_id,package_sha256,attachment_file_code)
 VALUES ('review-a','candidate-a',1,'${digest}',1,'tenant','app','definition','node','11111111-1111-1111-1111-111111111111','instance','package-a','${hash}','attachment');`;
 const approval=(version,state,packageHash=hash)=>`INSERT INTO content_intake.approval_facts VALUES ('review-a',${version},${version-1},'${state}',clock_timestamp(),clock_timestamp()+interval '4 minutes','${hash}','${packageHash}','human-task','manager',1,clock_timestamp()-interval '1 second')`;
 const attempt=`INSERT INTO content_intake.write_attempts(actor_id,operation_id,action,candidate_id,candidate_version,candidate_digest,payload_digest,source_evidence_version,approval_evidence_version,state,created_at)
 VALUES ('manager','operation-a','publish','candidate-a',1,'${digest}','${hash}',1,1,'pending',clock_timestamp());`;
 const ticket=`INSERT INTO content_intake.commit_tickets(ticket_hash,actor_id,action,operation_id,candidate_generation,actor_facts_version,actor_generation,reviewer_facts_version,reviewer_generation,approval_facts_version,approval_generation,issued_at,expires_at)
 VALUES ('${hash}','manager','publish','operation-a',0,1,0,1,0,1,0,clock_timestamp(),clock_timestamp()+interval '50 seconds');`;
 denies('review package digest is bound',reviewSetup.replace(`'package-a','${hash}','attachment'`,`'package-a','${'b'.repeat(64)}','attachment'`),/REVIEW_PACKAGE_BINDING/);
 denies('review cannot bind input as package',reviewSetup.replace(`'package-a','${hash}','attachment'`,`'object-a','${hash}','attachment'`),/REVIEW_PACKAGE_BINDING/);
 denies('verified package hash must match',reviewSetup+approval(1,'approved','b'.repeat(64)),/APPROVAL_PACKAGE_MISMATCH/);
 denies('approval pointer cannot restore older approval',reviewSetup+approval(1,'approved')+';'+approval(2,'revoked')+"; INSERT INTO content_intake.approval_current VALUES ('review-a',2); UPDATE content_intake.approval_current SET facts_version=1",/APPROVAL_VERSION_REGRESSION/);
 denies('same revoked instance cannot become approved',reviewSetup+approval(1,'revoked')+';'+approval(2,'approved')+"; INSERT INTO content_intake.approval_current VALUES ('review-a',1); UPDATE content_intake.approval_current SET facts_version=2",/APPROVAL_VERSION_REGRESSION/);
 denies('durable attempt key cannot be retargeted',reviewSetup+attempt+"UPDATE content_intake.write_attempts SET operation_id='changed'",/OPERATION_IMMUTABLE/);
 denies('unknown write cannot become a fresh attempt',reviewSetup+attempt+"UPDATE content_intake.write_attempts SET state='unknown'; UPDATE content_intake.write_attempts SET state='pending'",/OPERATION_STATE_TRANSITION/);
 denies('ticket expiry cannot be extended',reviewSetup+attempt+ticket+"UPDATE content_intake.commit_tickets SET expires_at=expires_at+interval '1 second'",/TICKET_IMMUTABLE_OR_CONSUMED/);
 denies('consumed ticket cannot be reset',reviewSetup+attempt+ticket+"UPDATE content_intake.commit_tickets SET consumed_at=clock_timestamp(); UPDATE content_intake.commit_tickets SET consumed_at=NULL",/TICKET_IMMUTABLE_OR_CONSUMED/);
 sql('BEGIN; '+reviewSetup+attempt+ticket+"UPDATE content_intake.commit_tickets SET consumed_at=clock_timestamp(); ROLLBACK");checks++;
 // Existing four-domain release acceptance is not under test here. Parent release rows
 // are temporary FK targets; every probe rolls back before their deferred completeness gate.
 const releases=`INSERT INTO public.content_releases(release_id,release_seq,status,source_binding_hash,tenant_id) VALUES ('release-a',1,'published','${hash}','tenant'),('release-b',2,'published','${hash}','tenant');
 INSERT INTO public.announcements(announcement_id,release_id,title) VALUES ('announcement-a','release-a','合成A'),('announcement-b','release-b','合成B');`;
 if(direct) {
  // Migrate populated predecessor, not an empty schema: old candidate bytes and
  // constraints must survive while new direct rows omit reviewer evidence.
  const oldCandidate=sql("SELECT to_jsonb(c)::text FROM content_intake.candidate_versions c WHERE candidate_id='candidate-a'");
  writeFileSync(path.join(evidence,'migration.log'),run('psql',[...args,'-f','business-docs/01-客服Agent项目/30-开发-进行中/content-intake-direct-candidate/storage.delta.sql']));checks++;
  assert.equal(sql("SELECT (to_jsonb(c)-'publication_policy')::text FROM content_intake.candidate_versions c WHERE candidate_id='candidate-a'"),oldCandidate);checks++;
  assert.equal(sql("SELECT publication_policy FROM content_intake.candidate_versions WHERE candidate_id='candidate-a'"),'approval-v1');checks++;
  denies('legacy policy cannot be rewritten',"UPDATE content_intake.candidate_versions SET publication_policy='direct-v1' WHERE candidate_id='candidate-a'",/MATERIAL_CHANGED/);
  denies('legacy still requires approval',"UPDATE content_intake.candidate_versions SET state='ready' WHERE candidate_id='candidate-a'",/check constraint/);
  const directCandidate=insertCandidate('direct-a').replace('created_at,updated_at)', 'created_at,updated_at,publication_policy)').replace('clock_timestamp(),clock_timestamp())',"clock_timestamp(),clock_timestamp(),'direct-v1')")+';';
  const confirmation=`INSERT INTO content_intake.source_confirmations SELECT candidate_id,version,digest,'source-a',1,0,'integer','2','controlled-synthetic-export','manager',clock_timestamp(),'${hash}' FROM content_intake.candidate_versions WHERE candidate_id='direct-a';
   UPDATE content_intake.candidate_versions SET source_evidence_version=1,state='ready' WHERE candidate_id='direct-a';`;
  const directAttempt=`INSERT INTO content_intake.write_attempts(actor_id,operation_id,action,candidate_id,candidate_version,candidate_digest,payload_digest,source_evidence_version,state,created_at,publication_policy)
   SELECT 'manager','direct-op','publish',candidate_id,version,digest,'${hash}',1,'pending',clock_timestamp(),'direct-v1' FROM content_intake.candidate_versions WHERE candidate_id='direct-a';`;
  const directTicket=`INSERT INTO content_intake.commit_tickets(ticket_hash,actor_id,action,operation_id,candidate_generation,actor_facts_version,actor_generation,issued_at,expires_at,publication_policy)
   VALUES ('${hash}','manager','publish','direct-op',0,1,0,clock_timestamp(),clock_timestamp()+interval '50 seconds','direct-v1');`;
  const directSetup=directCandidate+confirmation+directAttempt+directTicket;
  sql('BEGIN; '+directSetup+' ROLLBACK');checks++;
  denies('direct cannot ready without source',directCandidate+"UPDATE content_intake.candidate_versions SET state='ready' WHERE candidate_id='direct-a'",/check constraint/);
  denies('direct cannot claim approval',directCandidate+"UPDATE content_intake.candidate_versions SET approval_evidence_version=1 WHERE candidate_id='direct-a'",/check constraint/);
  denies('attempt cannot cross publication policy',directCandidate+confirmation+directAttempt.replace("'direct-v1'","'approval-v1'"),/check constraint|foreign key/);
  denies('direct ticket cannot contain fake reviewer',directCandidate+confirmation+directAttempt+directTicket.replace('expires_at,publication_policy)', 'expires_at,publication_policy,reviewer_facts_version)').replace("'direct-v1');","'direct-v1',1);"),/check constraint/);
  denies('direct ticket remains bounded',directSetup.replace("interval '50 seconds'","interval '61 seconds'"),/check constraint/);
  denies('direct ticket cannot rewrite policy',directSetup+"UPDATE content_intake.commit_tickets SET publication_policy='approval-v1'",/TICKET_IMMUTABLE_OR_CONSUMED/);
  denies('direct attempt cannot rewrite policy',directSetup+"UPDATE content_intake.write_attempts SET publication_policy='approval-v1' WHERE operation_id='direct-op'",/OPERATION_IMMUTABLE/);
  const publication=`INSERT INTO content_intake.publications(candidate_id,candidate_version,actor_id,action,operation_id,release_id,announcement_id,publication_policy,confirmed_at)
   VALUES ('direct-a',1,'manager','publish','direct-op','release-a','announcement-a','direct-v1',clock_timestamp());`;
  const lineage=`INSERT INTO content_intake.release_catalogs(release_id,format_version) VALUES ('release-a','intake-v2.1');
   INSERT INTO content_intake.release_lineage(release_id,source_id,business_entry_id,script_version,candidate_id,candidate_version,content_valid_until,publication_policy)
   VALUES ('release-a','source-a','entry-a',1,'direct-a',1,clock_timestamp()+interval '1 day','direct-v1');`;
  sql('BEGIN; '+releases+directSetup+publication+lineage+' ROLLBACK');checks++;
  denies('direct publication requires confirmation time',releases+directSetup+publication.replace("'direct-v1',clock_timestamp()","'direct-v1',NULL"),/check constraint/);
  denies('confirmation cannot be infinite',releases+directSetup+publication.replace("'direct-v1',clock_timestamp()","'direct-v1','infinity'"),/check constraint/);
  denies('publication confirmation is immutable',releases+directSetup+publication+"UPDATE content_intake.publications SET confirmed_at=confirmed_at+interval '1 second'",/INTAKE_HISTORY_IMMUTABLE/);
  denies('lineage cannot cross policy',releases+directSetup+lineage.replace("'direct-v1'","'approval-v1'"),/check constraint|foreign key/);
  const directRollback=`${releases} INSERT INTO content_intake.rollback_plans VALUES ('direct-plan','release-b','release-a','${hash}','manager',clock_timestamp());
   INSERT INTO content_intake.write_attempts(actor_id,operation_id,action,rollback_plan_id,impact_digest,payload_digest,base_release_id,state,created_at,publication_policy)
   VALUES ('manager','direct-rollback','rollback','direct-plan','${hash}','${hash}','release-b','pending',clock_timestamp(),'direct-v1');
   INSERT INTO content_intake.publications(rollback_plan_id,actor_id,action,operation_id,release_id,announcement_id,publication_policy,confirmed_at)
   VALUES ('direct-plan','manager','rollback','direct-rollback','release-a','announcement-a','direct-v1',clock_timestamp());`;
  sql('BEGIN; '+directRollback+' ROLLBACK');checks++;
  denies('direct rollback requires confirmation',directRollback.replace("'direct-v1',clock_timestamp()","'direct-v1',NULL"),/check constraint/);
 }
 const rollback=`${releases}
 INSERT INTO content_intake.rollback_plans VALUES ('plan','release-b','release-a','${hash}','manager',clock_timestamp());
 INSERT INTO content_intake.rollback_scopes VALUES ('plan','source-a'),('plan','source-b');
 INSERT INTO content_intake.objects VALUES ('rollback-package',NULL,'manager','tenant','app','intake/rollback.pdf','${hash}',1000,'application/pdf','review-package',clock_timestamp());
 INSERT INTO content_intake.review_bindings(review_request_id,rollback_plan_id,impact_digest,evidence_version,tenant_id,app_id,definition_id,node_id,create_uuid,package_object_id,package_sha256)
 VALUES ('rollback-review','plan','${hash}',1,'tenant','app','definition','node','22222222-2222-2222-2222-222222222222','rollback-package','${hash}');
 INSERT INTO content_intake.write_attempts(actor_id,operation_id,action,rollback_plan_id,impact_digest,payload_digest,base_release_id,approval_evidence_version,state,created_at)
 VALUES ('manager','operation-a','rollback','plan','${hash}','${hash}','release-b',1,'pending',clock_timestamp());`;
 sql('BEGIN; '+reviewSetup+attempt+rollback+"UPDATE content_intake.write_attempts SET state='unknown' WHERE action='rollback'; ROLLBACK");checks++;
 denies('rollback announcement must belong to release',rollback+"INSERT INTO content_intake.publications VALUES (NULL,NULL,'plan','manager','rollback','operation-a','release-a','announcement-b')",/foreign key/);
 denies('one unresolved rollback per plan',rollback+"INSERT INTO content_intake.write_attempts SELECT actor_id,'different-op',action,candidate_id,candidate_version,candidate_digest,rollback_plan_id,impact_digest,payload_digest,base_release_id,source_evidence_version,approval_evidence_version,import_batch_id,state,created_at FROM content_intake.write_attempts",/duplicate key/);
 const lease=`${releases} INSERT INTO content_intake.release_catalogs(release_id,format_version) VALUES ('release-a','intake-v2.1'),('release-b','intake-v2.1');
 INSERT INTO public.snapshot_offline_leases(lease_token_hash,client_id,user_id,release_id,source_binding_hash,issued_at,expires_at) VALUES ('${hash}','synthetic-client','manager','release-a','${hash}',clock_timestamp(),clock_timestamp()+interval '4 minutes');`;
 const entitlement=(principal,user,release)=>`INSERT INTO content_intake.entitlements VALUES ('${hash}','${principal}','${user}','${hash}','${release}','shop-a',1,0,0,clock_timestamp(),clock_timestamp()+interval '3 minutes')`;
 denies('lease cannot be lent to a different principal',lease+entitlement('agent','manager','release-a'),/foreign key/);
 denies('lease cannot cover a different release',lease+entitlement('manager','manager','release-b'),/ENTITLEMENT_LEASE_MISMATCH|foreign key/);
 sql('BEGIN; '+lease+entitlement('manager','manager','release-a')+'; ROLLBACK');checks++;
 if(usage) {
  const sessionHash='b'.repeat(64);
  const session=`INSERT INTO backend_identity.login_requests(login_id,state_hash,client_challenge,status,issued_at,expires_at,binding_id,consumed_at)
   VALUES ('login','${sessionHash}',repeat('A',43),'ready',clock_timestamp()-interval '2 minutes',clock_timestamp()+interval '1 minute','binding-manager',NULL);
   INSERT INTO backend_identity.sessions VALUES ('${sessionHash}','login','binding-manager',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '10 minutes',NULL);
   UPDATE backend_identity.login_requests SET status='consumed',consumed_at=clock_timestamp() WHERE login_id='login';`;
  const context=`INSERT INTO content_intake.entitlement_contexts VALUES ('${hash}','${sessionHash}',ARRAY['product-a','product-b'],ARRAY[]::text[])`;
  const setup=lease+entitlement('manager','manager','release-a')+';'+session;
  // Deferred check proves both records are one atomic unit, without firing the
  // unrelated synthetic parent release completeness trigger before rollback.
  const required='SET CONSTRAINTS content_intake.entitlement_context_required IMMEDIATE';
  denies('new entitlement cannot commit without context',lease+entitlement('manager','manager','release-a')+';'+required,/ENTITLEMENT_CONTEXT_REQUIRED/);
  sql('BEGIN; '+setup+context+';'+required+'; ROLLBACK');checks++;
  denies('context cannot attach unknown session',setup+context.replace(sessionHash,'c'.repeat(64)),/ENTITLEMENT_SESSION_MISMATCH/);
  denies('context cannot attach another user session',setup.replaceAll("'binding-manager'","'binding-agent'")+context,/ENTITLEMENT_SESSION_MISMATCH/);
  denies('context cannot outlive session',setup.replace("clock_timestamp()+interval '10 minutes'","clock_timestamp()+interval '1 minute'")+context,/ENTITLEMENT_SESSION_MISMATCH/);
  denies('context rejects revoked session',setup+"UPDATE backend_identity.sessions SET revoked_at=clock_timestamp();"+context,/ENTITLEMENT_SESSION_MISMATCH/);
  for(const ids of ["ARRAY['product-b','product-a']","ARRAY['product-a','product-a']","ARRAY[NULL]::text[]","ARRAY['*']","ARRAY(SELECT 'p'||n FROM generate_series(1,101) n)"]) {
   denies('invalid canonical selection '+ids,setup+context.replace("ARRAY['product-a','product-b']",ids),/check constraint/);
  }
  denies('bound selection cannot be changed',setup+context+"; UPDATE content_intake.entitlement_contexts SET product_ids=ARRAY[]::text[]",/INTAKE_HISTORY_IMMUTABLE/);
  denies('bound context cannot be removed',setup+context+"; DELETE FROM content_intake.entitlement_contexts",/INTAKE_HISTORY_IMMUTABLE/);
  const readable=`SELECT EXISTS (SELECT 1 FROM content_intake.entitlement_contexts c JOIN content_intake.entitlements e USING(entitlement_hash)
   JOIN backend_identity.sessions s ON s.token_hash=c.session_token_hash
   JOIN backend_identity.subject_bindings b ON b.binding_id=s.binding_id AND b.user_id=e.user_id
   WHERE c.entitlement_hash='${hash}' AND s.token_hash='${sessionHash}' AND b.enabled AND s.revoked_at IS NULL
    AND s.issued_at<=clock_timestamp() AND clock_timestamp()<least(s.expires_at,e.valid_until))`;
  assert.equal(sql('BEGIN; '+setup+context+';'+readable+'; ROLLBACK').split('\n').at(-2),'t');checks++;
  assert.equal(sql('BEGIN; '+setup+context+';'+readable.replace(`s.token_hash='${sessionHash}'`,`s.token_hash='${'c'.repeat(64)}'`)+'; ROLLBACK').split('\n').at(-2),'f');checks++;
  assert.equal(sql('BEGIN; '+setup+context+'; DELETE FROM backend_identity.sessions;'+readable+'; ROLLBACK').split('\n').at(-2),'f');checks++;
  assert.equal(sql('BEGIN; '+setup+context+'; UPDATE backend_identity.sessions SET revoked_at=clock_timestamp();'+readable+'; ROLLBACK').split('\n').at(-2),'f');checks++;
  for(const role of ['app_runtime','app_content_admin','app_import_worker','app_backend_auth','app_backend_review','app_backend_worker'])
   rejects(`SET ROLE ${role}; SELECT * FROM content_intake.entitlement_contexts`,/permission denied/);
 }
 // Revision target/result and single-source projections added after the second review.
 assert.equal(sql("SELECT principal_id FROM content_intake.contributors WHERE candidate_id='candidate-a'"),'manager');checks++;
 denies('contributors cannot diverge from immutable material',"UPDATE content_intake.contributors SET principal_id='agent' WHERE candidate_id='candidate-a'",/cannot update view/);
 denies('source claim cannot name another file',insertCandidate('wrong-claim').replaceAll(`"sourceClaim":{"fileSha256":"${hash}"}`,`"sourceClaim":{"fileSha256":"${'b'.repeat(64)}"}`),/check constraint/);
 denies('unknown contributor is rejected',insertCandidate('unknown-contributor').replaceAll('"contributors":["manager"]','"contributors":["manager","unknown"]'),/CONTRIBUTOR_BINDING/);
 denies('ready must have both evidence versions',"UPDATE content_intake.candidate_versions SET state='ready' WHERE candidate_id='candidate-a'",/check constraint/);
 const job=`INSERT INTO content_intake.parse_jobs(job_id,source_version,contributor_ids,generation,source_id,object_id,actor_id,state,started_at,expected_prior_id,expected_prior_version,expected_prior_digest) VALUES ('revision-job',1,ARRAY['manager'],1,'source-a','object-a','manager','reading',clock_timestamp(),'candidate-a',1,'${digest}'); UPDATE content_intake.parse_jobs SET state='parsing' WHERE job_id='revision-job';`;
 denies('revision cannot return another same-source candidate',insertCandidate('parallel')+';'+job+"UPDATE content_intake.parse_jobs SET state='validated',result_candidate_id='parallel',result_candidate_version=1,finished_at=clock_timestamp()",/PARSE_REVISION_BINDING/);
 denies('validated parse cannot lose its result',job+"UPDATE content_intake.parse_jobs SET state='validated',finished_at=clock_timestamp()",/check constraint/);
 denies('parse history cannot be deleted',job+"DELETE FROM content_intake.parse_jobs",/PARSE_BINDING_IMMUTABLE/);
 sql('BEGIN; '+job+"UPDATE content_intake.candidate_versions SET state='invalidated' WHERE candidate_id='candidate-a'; "+insertCandidate('candidate-a').replace("VALUES('candidate-a',1,","VALUES('candidate-a',2,")+"; UPDATE content_intake.parse_jobs SET state='validated',result_candidate_id='candidate-a',result_candidate_version=2,finished_at=clock_timestamp(); ROLLBACK");checks++;
 denies('publish and rollback cannot reuse the same release',reviewSetup+attempt+rollback+"INSERT INTO content_intake.publications VALUES ('candidate-a',1,NULL,'manager','publish','operation-a','release-a','announcement-a'); INSERT INTO content_intake.publications VALUES (NULL,NULL,'plan','manager','rollback','operation-a','release-a','announcement-a')",/duplicate key/);
 const policyBefore=Number(sql("SELECT version FROM content_intake.policy_versions WHERE tenant_id='tenant' AND app_id='app'"));
 sql("UPDATE content_intake.role_rules SET policy_version=policy_version+1 WHERE job_id='manager-job' AND department_id='dept'");
 assert.equal(Number(sql("SELECT version FROM content_intake.policy_versions WHERE tenant_id='tenant' AND app_id='app'")),policyBefore+1);checks++;
 // A reason belongs to each grant version; changing the latest version cannot erase creation history.
 denies('grant change requires its own reason',"UPDATE content_intake.grants SET version=2,steward_id='director' WHERE grant_id='manager-publish'",/check constraint/);
 denies('grant change rejects blank reason',"UPDATE content_intake.grants SET version=2,last_change_reason='   ' WHERE grant_id='manager-publish'",/check constraint/);
 denies('creation reason cannot be rewritten',"UPDATE content_intake.grants SET version=2,reason='rewritten',last_change_reason='takeover' WHERE grant_id='manager-publish'",/GRANT_VERSION_OR_IDENTITY_CHANGED/);
 denies('creation version cannot gain a change reason',"UPDATE content_intake.grants SET last_change_reason='takeover' WHERE grant_id='manager-publish'",/GRANT_VERSION_OR_IDENTITY_CHANGED/);
 sql(`BEGIN;
 UPDATE content_intake.grants SET version=2,steward_id='director',last_change_reason='synthetic takeover' WHERE grant_id='manager-publish';
 UPDATE content_intake.grants SET version=3,revoked_at=clock_timestamp(),last_change_reason='synthetic revocation' WHERE grant_id='manager-publish';
 DO $$ BEGIN
  IF (SELECT jsonb_agg(jsonb_build_array(version,record->>'reason',record->>'last_change_reason') ORDER BY version) FROM content_intake.grant_history WHERE grant_id='manager-publish') IS DISTINCT FROM
   '[[1,"synthetic fixture",null],[2,"synthetic fixture","synthetic takeover"],[3,"synthetic fixture","synthetic revocation"]]'::jsonb THEN
   RAISE EXCEPTION 'grant reason history did not retain each version';
  END IF;
 END $$; ROLLBACK`);checks++;
 denies('grant reason history cannot be edited',"UPDATE content_intake.grant_history SET record=jsonb_set(record,'{reason}','\"rewritten\"') WHERE grant_id='manager-publish'",/INTAKE_HISTORY_IMMUTABLE/);
 assert.deepEqual(missingGuards,[], 'storage regression guards');
 for(const role of ['app_runtime','app_content_admin','app_import_worker','app_backend_auth','app_backend_review','app_backend_worker']) {
  assert.equal(sql(`SELECT has_schema_privilege('${role}','content_intake','USAGE')`),'f');
  rejects(`SET ROLE ${role}; SELECT * FROM content_intake.candidate_versions`,/permission denied/);
 }
 // Query plans at baseline and ten times the inventory; no enable_seqscan override.
 const plans=[];
 let inventory=1;
 for(const count of [399,3600]) {
  const prefix=`inventory-${count}-`;
  const body=JSON.stringify(material());
  sql(`INSERT INTO content_intake.candidate_versions(candidate_id,version,source_id,scope_id,source_version,object_id,file_sha256,actor_id,canonical_encoding,canonical_material,material,risk,explicit_disable_count,created_at,updated_at,state)
 SELECT '${prefix}'||n,1,'source-a','scope-a',1,'object-a','${hash}','manager','candidate-p1.1',${quote(body)},${quote(body)},'routine',0,clock_timestamp(),clock_timestamp(),'awaiting-evidence' FROM generate_series(1,${count}) n;
 UPDATE content_intake.candidate_versions SET state='invalidated' WHERE candidate_id LIKE '${prefix}%';
 ANALYZE content_intake.candidate_versions;`);
  const plan=JSON.parse(sql("EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT candidate_id,version FROM content_intake.candidate_versions WHERE scope_id='scope-a' AND state='awaiting-evidence' ORDER BY updated_at DESC,candidate_id,version LIMIT 50"));
  assert.match(JSON.stringify(plan),/Index (?:Only )?Scan/);
  assert.doesNotMatch(JSON.stringify(plan),/Seq Scan/);checks++;
  inventory+=count;plans.push({inventory,plan});
 }
 writeFileSync(path.join(evidence,'query-plans.json'),JSON.stringify(plans,null,2)+'\n');
 assert.equal(sql('SELECT count(*) FROM public.content_current'),before);checks++;
 const result={status:'PASS',checks,postgres:run('postgres',['--version']).trim(),scope:'storage and authorization predicate only; publish/concurrency/runtime NOT TESTED'};
 writeFileSync(path.join(evidence,'pg-summary.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));console.log(`Evidence: ${evidence}`);
} finally {
 if(started)run('pg_ctl',['-D',path.join(dir,'data'),'-m','fast','-w','stop']);
 rmSync(dir,{recursive:true,force:true});
}
