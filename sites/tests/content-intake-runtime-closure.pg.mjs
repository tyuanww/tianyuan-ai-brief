import assert from 'node:assert/strict';
import { createHash, randomInt } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRuntimeClosure, CLOSURE_PATHS } from '../../business-docs/08-工具/build_customer_agent_runtime_closure.mjs';

// Reference-schema constraint consumer, not a duplicate publish implementation.
// Copy actual release_items through every CHECK, FK and trigger under the exact
// NOLOGIN owner. Product HTTP/publication and rollback must separately consume
// the approved successor; no test-only grant is injected into product fixtures.
const root = fileURLToPath(new URL('../../', import.meta.url));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG')));
env.PGCONNECT_TIMEOUT = '5';
env.PGPASSFILE = '/dev/null'; // Never consult the user's default credential file.
const bin = process.env.PG_BIN || execFileSync('pg_config', ['--bindir'], { encoding: 'utf8', env }).trim();
const run = (name, args) => execFileSync(path.join(bin, name), args, { cwd: root, encoding: 'utf8', env,
  maxBuffer: 16 * 1024 * 1024, timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'] });
assert.match(run('postgres', ['--version']), /PostgreSQL\) 15\./);
const dir = mkdtempSync(path.join(tmpdir(), 'intake-legacy-check-')), port = String(randomInt(49152, 65535));
const evidence = path.join(root, 'output/content-intake-runtime-closure'); mkdirSync(evidence, { recursive: true });
const args = ['-X', '-q', '-h', dir, '-p', port, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'];
const sql = q => run('psql', [...args, '-Atc', q]).trim();
const quote = v => `'${String(v).replaceAll("'", "''")}'`;
const sha = value => createHash('sha256').update(value).digest('hex');
const read = file => readFileSync(path.join(root, file));
const development = 'business-docs/01-客服Agent项目/30-开发-进行中';
const generated = buildRuntimeClosure(read);
assert.ok(read(CLOSURE_PATHS.database).equals(generated.database));
assert.ok(read(CLOSURE_PATHS.manifest).equals(generated.manifest));
const manifest = JSON.parse(generated.manifest), results = [];
const check = (name, fn) => { fn(); results.push({ name, status: 'PASS' }); };
const rejects = (query, pattern) => assert.throws(() => sql(query), error => { assert.match(String(error.stderr), pattern); return true; });
const owner = 'intake_runtime_fn_owner';
const signatures = ['public.content_template_placeholders_are_valid(text,text[])', 'public.content_text_array_is_nonblank_unique(text[])',
  'public.content_questions_align_intent(jsonb,text,text)', 'public.content_questions_are_valid(jsonb)', 'public.content_question_hash(jsonb)',
  'public.content_utc_timestamp_text(timestamptz)', 'public.content_risk_categories_are_valid(text,text[])',
  'public.owner_acceptance_review_shape(text,boolean,text,text,text,text,text,text,text,text)'];
const digest = 'a'.repeat(64), reviewer = 'b'.repeat(64);
let started = false;
try {
  run('initdb', ['-D', path.join(dir, 'data'), '-A', 'trust', '--no-locale', '--encoding=UTF8']);
  run('pg_ctl', ['-D', path.join(dir, 'data'), '-l', path.join(dir, 'server.log'), '-o', `-k ${dir} -p ${port} -h ''`, '-w', 'start']); started = true;
  writeFileSync(path.join(evidence, 'install.log'), run('psql', [...args, '-f', `${development}/schema.v1.24.sql`]));
  // The reference schema intentionally has no product-owned publisher body.
  // Reuse ONLY these already-approved owner capabilities, byte-checked against
  // the frozen ACL. The candidate is the sole source of all new grants.
  const acl = read(`${development}/content-intake-runtime-candidate/purpose-acl.sql`).toString();
  assert.equal(sha(acl), '59a5fda26bd839a2edea3d73a2c009f12dba7e89edab787b80c23364dc583e05');
  const baseline = [
    'GRANT USAGE ON SCHEMA intake_runtime, content_intake, backend_review, public\n  TO intake_usage, intake_business, intake_worker, intake_org_writer, intake_runtime_fn_owner;',
    'GRANT SELECT, INSERT, UPDATE ON\n  public.content_releases, public.release_source_bindings, public.release_items, public.content_current, public.announcements\n  TO intake_runtime_fn_owner;',
    'GRANT EXECUTE ON FUNCTION public.digest(bytea, text) TO intake_usage, intake_runtime_fn_owner;',
    'GRANT EXECUTE ON FUNCTION public.jsonb_jcs(jsonb) TO intake_runtime_fn_owner;',
  ];
  for (const statement of baseline) assert.ok(acl.includes(statement));
  sql(baseline.join('\n'));
  sql('CREATE ROLE closure_login LOGIN NOINHERIT; GRANT intake_business TO closure_login;');
  const meta = () => JSON.parse(sql(`SELECT json_build_object('roles',(SELECT json_agg(row_to_json(r) ORDER BY rolname) FROM pg_roles r),
    'tables',(SELECT json_agg(json_build_array(oid::regclass::text,relacl) ORDER BY oid::regclass::text) FROM pg_class WHERE relnamespace='public'::regnamespace),
    'memberships',(SELECT json_agg(row_to_json(m) ORDER BY roleid,member) FROM pg_auth_members m))`));
  const beforeMeta = meta();
  const functionAcls = () => JSON.parse(sql(`SELECT json_object_agg(p.oid::regprocedure::text,p.proacl ORDER BY p.oid::regprocedure::text)
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema')`));
  const beforeFunctionAcls = functionAcls();
  check('all eight required pure INVOKER helpers are denied before the patch', () => {
    for (const signature of signatures) {
      assert.equal(sql(`SELECT has_function_privilege('${owner}',${quote(signature)},'EXECUTE')`), 'f');
      assert.equal(sql(`SELECT NOT prosecdef AND provolatile='i' FROM pg_proc WHERE oid=${quote(signature)}::regprocedure`), 't');
    }
  });
  const sources = ['aftersale', 'campaign', 'presale', 'product'];
  const bindingHash = sha(sources.map(domain => `${domain}:srcv_closure_${domain}`).join('|'));
  const sourceInsert = sources.map(domain => `INSERT INTO public.authoritative_source_versions
    (tenant_id,source_version_id,source_ref,domain,upstream_version,snapshot_sha256,use_class,owner_role,approval_evd,approved_by,approved_at,review_due_at)
    VALUES ('synthetic_tenant','srcv_closure_${domain}','SRC-CLOSURE','${domain}','${domain}','${digest}','canonical','ROLE-CONTENT-LEAD','EVD-CLOSURE-SOURCE','synthetic',now()-interval '1 hour',now()+interval '1 day');`).join('\n');
  const question = { question_id: 'q_closure_question', question_version: 1, question_text: '合成既有问题', semantic_family_id: 'sf_closure',
    origin_fingerprint: digest, origin_fingerprint_key_version: 'synthetic-v1', source_asset_id: 'sa_closure', source: 'from_log',
    source_query_id: 'synthetic-query', promotion_review_ref: 'EVD-CLOSURE-PROMOTION', promoted_by_role: 'ROLE-CONTENT-LEAD',
    promoted_at: '2026-09-01T00:00:00.000Z', intent_taxonomy_version: 'itax_closure', intent_id: 'intent_closure' };
  question.question_hash = sql(`SELECT public.content_question_hash(${quote(JSON.stringify(question))}::jsonb)`);
  const row = { release_id: 'rel_closure_base', script_id: 'synthetic_legacy', script_version: 1, content_hash: digest,
    title: '合成旧条目', answer_text: '合成单号 {订单号}，日期 {日期}', category: 'presale', source_ref: 'SRC-CLOSURE', source_version_id: 'srcv_closure_presale',
    owner_role: 'ROLE-CONTENT-LEAD', review_due_at: '2099-01-01T00:00:00Z', effective_from: '2026-01-01T00:00:00Z', effective_to: null,
    platform_scope: ['qianniu'], product_scope_type: 'storewide', product_scope_refs: [], intent_taxonomy_version: 'itax_closure', intent_id: 'intent_closure',
    risk_level: 'medium', risk_categories: [], has_conflict: false, review_mode: 'single', primary_reviewer_id: reviewer,
    primary_reviewer_role: 'ROLE-CONTENT-LEAD', primary_review_evd: 'EVD-CLOSURE-REVIEW', secondary_reviewer_id: null,
    secondary_reviewer_role: null, secondary_review_evd: null, placeholder_keys: ['order_id', 'date'], questions_json: [question],
    search_document: "'synthetic':1", search_fallback_text: 'synthetic', owner_acceptance_record_sha256: null };
  sql(`BEGIN; SELECT set_config('app.publishing','on',true); ${sourceInsert}
    INSERT INTO public.intent_taxonomy_versions VALUES ('itax_closure','EVD-CLOSURE-TAXONOMY','synthetic',now(),now());
    INSERT INTO public.intent_taxonomy_entries VALUES ('itax_closure','intent_closure','合成分类','active',now());
    INSERT INTO public.content_releases(release_id,release_seq,status,source_binding_hash,tenant_id) VALUES ('rel_closure_base',1,'published','${bindingHash}','synthetic_tenant');
    INSERT INTO public.release_source_bindings SELECT 'rel_closure_base',domain,source_version_id,now() FROM public.authoritative_source_versions;
    INSERT INTO public.release_items SELECT * FROM jsonb_populate_record(NULL::public.release_items,${quote(JSON.stringify(row))}::jsonb); COMMIT;`);
  const copy = (patch = {}) => `BEGIN; SELECT set_config('app.publishing','on',true); SET LOCAL ROLE ${owner};
    INSERT INTO public.content_releases(release_id,release_seq,status,source_binding_hash,tenant_id) VALUES ('rel_closure_copy',2,'published','${bindingHash}','synthetic_tenant');
    INSERT INTO public.release_source_bindings SELECT 'rel_closure_copy',domain,source_version_id,created_at FROM public.release_source_bindings WHERE release_id='rel_closure_base';
    INSERT INTO public.release_items SELECT (jsonb_populate_record(NULL::public.release_items,to_jsonb(i)||${quote(JSON.stringify({ release_id: 'rel_closure_copy', ...patch }))}::jsonb)).* FROM public.release_items i WHERE release_id='rel_closure_base';
    SET CONSTRAINTS ALL IMMEDIATE;
    SELECT to_jsonb(i)-'release_id' FROM public.release_items i WHERE release_id='rel_closure_copy'; ROLLBACK;`;
  check('actual nonempty legacy copy reproduces the frozen ACL denial', () => rejects(copy(), /42501:.*permission denied for function content_template_placeholders_are_valid/));
  check('candidate applies and rolls back atomically', () => {
    sql(`BEGIN; ${read(CLOSURE_PATHS.delta)} ROLLBACK;`);
    assert.equal(sql(`SELECT has_function_privilege('${owner}',${quote(signatures[0])},'EXECUTE')`), 'f');
  });
  sql(`BEGIN; ${read(CLOSURE_PATHS.delta)} COMMIT;`);
  check('only intended owner receives eight EXECUTE additions', () => {
    for (const signature of signatures) {
      assert.equal(sql(`SELECT has_function_privilege('${owner}',${quote(signature)},'EXECUTE')`), 't');
      for (const role of ['closure_login', 'intake_business', 'intake_usage', 'intake_worker', 'intake_org_writer', 'app_runtime']) {
        assert.equal(sql(`SELECT has_function_privilege('${role}',${quote(signature)},'EXECUTE')`), 'f');
      }
    }
    assert.deepEqual(meta(), beforeMeta);
    const afterFunctionAcls = functionAcls();
    assert.deepEqual(Object.keys(afterFunctionAcls).filter(key => JSON.stringify(afterFunctionAcls[key]) !== JSON.stringify(beforeFunctionAcls[key])).sort(),
      signatures.map(signature => sql(`SELECT ${quote(signature)}::regprocedure::text`)).sort());
  });
  check('actual row copy preserves every legacy field through all CHECKs, FKs and deferred triggers', () => {
    const copied = sql(copy()).split('\n').at(-1);
    assert.equal(copied, sql("SELECT to_jsonb(i)-'release_id' FROM public.release_items i WHERE release_id='rel_closure_base'"));
    assert.equal(sql("SELECT count(*) FROM public.content_releases WHERE release_id='rel_closure_copy'"), '0');
  });
  check('valid high-risk dual-reviewed and SKU-scoped legacy rows keep their existing semantics', () => {
    const copied = JSON.parse(sql(copy({ risk_level: 'high', risk_categories: ['legal_commitment'], review_mode: 'dual',
      secondary_reviewer_id: 'c'.repeat(64), secondary_reviewer_role: 'ROLE-CS-MANAGER', secondary_review_evd: 'EVD-CLOSURE-SECONDARY',
      product_scope_type: 'sku', product_scope_refs: ['synthetic-sku'] })).split('\n').at(-1));
    assert.equal(copied.review_mode, 'dual');
    assert.equal(copied.risk_level, 'high');
    assert.deepEqual(copied.product_scope_refs, ['synthetic-sku']);
  });
  for (const [name, patch, pattern] of [
    ['placeholder mismatch', { placeholder_keys: [] }, /23514/],
    ['duplicate platform scope', { platform_scope: ['qianniu', 'qianniu'] }, /23514/],
    ['invalid question hash', { questions_json: [{ ...question, question_hash: 'f'.repeat(64) }] }, /23514/],
    ['question taxonomy mismatch', { intent_id: 'intent_other' }, /23514/],
    ['risk category mismatch', { risk_categories: ['legal_commitment'] }, /23514/],
    ['missing dual reviewer', { risk_level: 'high', risk_categories: ['legal_commitment'], review_mode: 'dual' }, /23514/],
    ['false owner evidence', { review_mode: 'owner_acceptance', owner_acceptance_record_sha256: digest }, /OWNER_ACCEPTANCE_NOT_ACTIVE/],
  ]) check(`patched copy still rejects ${name}`, () => rejects(copy(patch), pattern));
  check('update still executes the immutable-history trigger', () => rejects(`BEGIN; SET LOCAL ROLE ${owner}; UPDATE public.release_items SET answer_text='合成修改'; ROLLBACK`, /SOURCE_HISTORY_IMMUTABLE/));
  check('LOGIN cannot assume the NOLOGIN owner or read/write legacy storage', () => {
    for (const query of ['SET ROLE intake_runtime_fn_owner', 'SELECT * FROM public.release_items', "INSERT INTO public.content_releases(release_id) VALUES ('bad')"])
      rejects(`SET SESSION AUTHORIZATION closure_login; ${query}`, /42501/);
  });
  const constraints = JSON.parse(sql("SELECT json_agg(json_build_object('name',conname,'definition',pg_get_constraintdef(oid)) ORDER BY conname) FROM pg_constraint WHERE conrelid='public.release_items'::regclass"));
  const triggers = JSON.parse(sql("SELECT json_agg(json_build_object('name',t.tgname,'definition',pg_get_triggerdef(t.oid),'function',t.tgfoid::regprocedure::text,'definer',p.prosecdef,'owner',pg_get_userbyid(p.proowner)) ORDER BY t.tgname) FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE t.tgrelid='public.release_items'::regclass"));
  const dependencies = JSON.parse(sql(`SELECT json_agg(json_build_object('constraint',c.conname,'function',p.oid::regprocedure::text) ORDER BY c.conname,p.oid::regprocedure::text)
    FROM pg_constraint c JOIN pg_depend d ON d.classid='pg_constraint'::regclass AND d.objid=c.oid AND d.refclassid='pg_proc'::regclass
    JOIN pg_proc p ON p.oid=d.refobjid WHERE c.conrelid='public.release_items'::regclass`));
  const expectedRoots = signatures.filter(signature => !['content_questions_are_valid','content_question_hash','content_utc_timestamp_text'].some(name => signature.includes(name)));
  check('catalog inventories every CHECK helper and unchanged trigger boundary', () => {
    assert.deepEqual([...new Set(dependencies.map(row => row.function))].sort(), expectedRoots.map(signature => sql(`SELECT ${quote(signature)}::regprocedure::text`)).sort());
    assert.equal(constraints.length, 24);
    assert.equal(triggers.length, 14);
    const nonInternal = triggers.filter(row => !row.name.startsWith('RI_'));
    assert.deepEqual(nonInternal.map(row => [row.function, row.definer]), [['owner_acceptance_storage_guard()', true], ['trg_release_items_immutable()', false]]);
    assert.equal(nonInternal[0].owner, 'cs_ai_definer');
  });
  const helpers = JSON.parse(sql(`SELECT json_agg(json_build_object('function',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid)) ORDER BY p.oid::regprocedure::text)
    FROM pg_proc p WHERE p.oid = ANY (ARRAY[${signatures.map(signature => `${quote(signature)}::regprocedure::oid`).join(',')}]::oid[])`));
  const companionTriggers = JSON.parse(sql(`SELECT json_agg(json_build_object('table',t.tgrelid::regclass::text,'name',t.tgname,'definition',pg_get_triggerdef(t.oid),'function',t.tgfoid::regprocedure::text,'definer',p.prosecdef,'owner',pg_get_userbyid(p.proowner)) ORDER BY t.tgrelid::regclass::text,t.tgname)
    FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE t.tgrelid IN ('public.content_releases'::regclass,'public.release_source_bindings'::regclass)`));
  check('complete schema1.25 installs on fresh PG15 but does not claim product runtime readiness', () => {
    const fresh = mkdtempSync(path.join(tmpdir(), 'intake-closure-reference-'));
    let freshStarted = false;
    try {
      run('initdb', ['-D', path.join(fresh, 'data'), '-A', 'trust', '--no-locale', '--encoding=UTF8']);
      run('pg_ctl', ['-D', path.join(fresh, 'data'), '-l', path.join(fresh, 'server.log'), '-o', `-k ${fresh} -p ${port} -h ''`, '-w', 'start']); freshStarted = true;
      const freshArgs = ['-X', '-q', '-h', fresh, '-p', port, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'];
      writeFileSync(path.join(evidence, 'fresh-reference-install.log'), run('psql', [...freshArgs, '-f', CLOSURE_PATHS.database]));
      assert.equal(run('psql', [...freshArgs, '-Atc', `SELECT NOT rolcanlogin AND NOT rolsuper AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolbypassrls FROM pg_roles WHERE rolname='${owner}'`]).trim(), 't');
      assert.equal(run('psql', [...freshArgs, '-Atc', `SELECT has_function_privilege('${owner}',${quote(signatures[0])},'EXECUTE')`]).trim(), 't');
      assert.equal(run('psql', [...freshArgs, '-Atc', "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='content_intake' AND p.proname='publish_candidate'"]).trim(), '0');
    } finally {
      if (freshStarted) run('pg_ctl', ['-D', path.join(fresh, 'data'), '-m', 'immediate', '-w', 'stop']);
      assert.equal(existsSync(path.join(fresh, 'data', 'postmaster.pid')), false);
      rmSync(fresh, { recursive: true, force: true });
    }
  });
  const summary = { status: 'PASS', scope: 'reference-schema actual legacy-row copy; not product publish or runtime activation',
    checks: results.length, results, candidate: manifest, constraints, dependencies, triggers, companionTriggers, helpers,
    environment: { node: process.version, postgres: run('postgres', ['--version']).trim(), platform: `${process.platform}/${process.arch}` } };
  writeFileSync(path.join(evidence, 'pg-summary.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify({ status: summary.status, checks: results.length, results }));
} finally {
  if (started) run('pg_ctl', ['-D', path.join(dir, 'data'), '-m', 'immediate', '-w', 'stop']);
  assert.equal(existsSync(path.join(dir, 'data', 'postmaster.pid')), false);
  rmSync(dir, { recursive: true, force: true });
}
