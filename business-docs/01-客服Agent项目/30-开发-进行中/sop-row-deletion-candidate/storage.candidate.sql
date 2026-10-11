-- GENERATED DRAFT. Caller must own the installation transaction. No official migration number.
DO $precondition$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc WHERE oid=to_regprocedure('content_intake.delete_unused_sop_row(content_intake.identifier,content_intake.version,text)')
    AND encode(public.digest(prosrc,'sha256'),'hex')='0404eca142184b7d7a5c981db424f103abca30c85ad48a4c580a50fb110e2950') THEN
    RAISE EXCEPTION 'SOP_ROW_DELETION_PREDECESSOR_MISMATCH';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc WHERE oid=to_regprocedure('content_intake.stage_sop_candidate_media(content_intake.identifier,content_intake.version,content_intake.identifier,content_intake.identifier,content_intake.identifier,content_intake.sha256,bigint,text,text,integer,integer,integer)')
    AND encode(public.digest(prosrc,'sha256'),'hex')='8dd25e3e17ffe8d18f4568eccfc48c052cfb7e65e14009d6a0e411d00d99bb79') THEN
    RAISE EXCEPTION 'SOP_STAGE_PREDECESSOR_MISMATCH';
  END IF;
END;
$precondition$;

-- DRAFT successor only: exact row identity and private charged payloads.
DO $media_precondition$
DECLARE k record; actual text;
BEGIN
  FOR k IN SELECT * FROM (VALUES
    ('content_intake.objects','objects_purpose_check','CHECK ((purpose = ANY (ARRAY[''input''::text, ''report''::text, ''review-package''::text])))'),
    ('content_intake.object_reservations','object_reservations_purpose_check','CHECK ((purpose = ANY (ARRAY[''input''::text, ''report''::text, ''review-package''::text])))'),
    ('content_intake.objects','objects_mime_check','CHECK ((mime = ANY (ARRAY[''application/vnd.openxmlformats-officedocument.spreadsheetml.sheet''::text, ''text/csv''::text, ''application/pdf''::text, ''application/json''::text])))'),
    ('content_intake.objects','objects_input_format_check','CHECK ((((purpose = ''input''::text) AND (bytes <= 10485760) AND (mime = ANY (ARRAY[''application/vnd.openxmlformats-officedocument.spreadsheetml.sheet''::text, ''text/csv''::text]))) OR ((purpose <> ''input''::text) AND (mime <> ''text/csv''::text))))'),
    ('content_intake.sop_candidate_media','sop_candidate_media_pkey','PRIMARY KEY (candidate_id, candidate_version, media_object_id, ordinal)'),
    ('content_intake.sop_release_media','sop_release_media_pkey','PRIMARY KEY (release_id, media_object_id, ordinal)')
  ) AS expected(tbl,name,definition) LOOP
    SELECT pg_get_constraintdef(oid) INTO actual FROM pg_constraint WHERE conrelid=to_regclass(k.tbl) AND conname=k.name;
    IF actual IS DISTINCT FROM k.definition THEN RAISE EXCEPTION 'SOP_MEDIA_PREDECESSOR_MISMATCH: %',k.name; END IF;
  END LOOP;
END $media_precondition$;
ALTER TABLE content_intake.sop_candidate_media DROP CONSTRAINT sop_candidate_media_pkey;
ALTER TABLE content_intake.sop_candidate_media ADD PRIMARY KEY(candidate_id,candidate_version,row_id,media_object_id,ordinal);
ALTER TABLE content_intake.sop_release_media DROP CONSTRAINT sop_release_media_pkey;
ALTER TABLE content_intake.sop_release_media ADD PRIMARY KEY(release_id,row_id,media_object_id,ordinal);
ALTER TABLE content_intake.objects DROP CONSTRAINT objects_purpose_check, DROP CONSTRAINT objects_mime_check, DROP CONSTRAINT objects_input_format_check;
ALTER TABLE content_intake.objects ADD CONSTRAINT objects_purpose_check CHECK(purpose IN ('input','report','review-package','sop-media')),
  ADD CONSTRAINT objects_mime_check CHECK(mime IN ('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/csv','application/pdf','application/json','image/png','image/jpeg','image/gif')),
  ADD CONSTRAINT objects_input_format_check CHECK(
    (purpose='input' AND bytes<=10485760 AND mime IN ('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/csv'))
    OR (purpose IN ('report','review-package') AND mime IN ('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/pdf','application/json'))
    OR (purpose='sop-media' AND bytes<=5242880 AND mime IN ('image/png','image/jpeg','image/gif'))),
  ADD CONSTRAINT objects_sop_payload_identity UNIQUE(object_id,source_id,sha256,bytes,mime,purpose);
ALTER TABLE content_intake.object_reservations DROP CONSTRAINT object_reservations_purpose_check;
ALTER TABLE content_intake.object_reservations ADD CONSTRAINT object_reservations_purpose_check CHECK(purpose IN ('input','report','review-package','sop-media'));
ALTER TABLE content_intake.sop_media_objects ADD COLUMN payload_object_id content_intake.identifier,
  ADD COLUMN payload_purpose text NOT NULL DEFAULT 'sop-media' CHECK(payload_purpose='sop-media'),
  ADD CONSTRAINT sop_payload_exact FOREIGN KEY(payload_object_id,source_id,sha256,bytes,mime,payload_purpose)
    REFERENCES content_intake.objects(object_id,source_id,sha256,bytes,mime,purpose);
-- Existing missing payloads stay unknown; only new trusted freeze can create full rows.
CREATE TABLE content_intake.sop_payload_bindings (
  job_id content_intake.identifier NOT NULL REFERENCES content_intake.parse_jobs,
  media_object_id content_intake.identifier NOT NULL CHECK(media_object_id ~ '^med_[0-9a-f]{64}$'),
  object_id text NOT NULL REFERENCES content_intake.object_reservations,
  source_id content_intake.identifier NOT NULL REFERENCES content_intake.sources,
  actor_id content_intake.identifier NOT NULL REFERENCES content_intake.principals,
  sha256 content_intake.sha256 NOT NULL,
  bytes bigint NOT NULL CHECK(bytes BETWEEN 1 AND 5242880),
  mime text NOT NULL CHECK(mime IN ('image/png','image/jpeg','image/gif')),
  PRIMARY KEY(job_id,media_object_id)
);
ALTER TABLE content_intake.sop_payload_bindings OWNER TO intake_runtime_fn_owner;
REVOKE ALL ON content_intake.sop_payload_bindings FROM PUBLIC;
GRANT SELECT,INSERT ON content_intake.objects TO intake_runtime_fn_owner;
GRANT SELECT,INSERT,UPDATE ON content_intake.object_reservations TO intake_runtime_fn_owner;
GRANT SELECT ON content_intake.entitlement_scopes TO intake_runtime_fn_owner;

-- One internal state machine; four public capabilities fix their action, avoiding
-- a caller-controlled generic mutation API. File exclusivity belongs to the store.
CREATE FUNCTION content_intake.sop_payload_transition(p_actor text,p_job text,p_media text,p_object text,p_action text,p_expected jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE j content_intake.parse_jobs; s content_intake.sources; a content_intake.principals;
  b content_intake.sop_payload_bindings; r content_intake.object_reservations; v_object text; v_used bigint;
BEGIN
  PERFORM backend_review.lock_content();
  SELECT * INTO j FROM content_intake.parse_jobs WHERE job_id=p_job;
  IF NOT FOUND OR j.actor_id IS DISTINCT FROM p_actor THEN RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='SCOPE_DENIED'; END IF;
  SELECT * INTO STRICT s FROM content_intake.sources WHERE source_id=j.source_id;
  SELECT * INTO STRICT a FROM content_intake.principals WHERE principal_id=p_actor;
  IF p_action IN ('reserve','complete') AND (j.state NOT IN ('reading','parsing','validated')
    OR s.mode<>'v2-preview' OR s.current_mapping_version<>j.source_version
    OR content_intake.authorization_deadline(p_actor,'import',s.scope_id,s.source_id,clock_timestamp()) IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='SCOPE_DENIED'; END IF;
  SELECT * INTO b FROM content_intake.sop_payload_bindings WHERE job_id=p_job AND media_object_id=p_media;
  IF p_action='reserve' THEN
    IF p_media IS NULL OR p_media !~ '^med_[0-9a-f]{64}$' OR jsonb_typeof(p_expected) IS DISTINCT FROM 'object'
      OR p_expected-ARRAY['sha256','bytes','mime']<>'{}'::jsonb OR NOT p_expected ?& ARRAY['sha256','bytes','mime']
      OR coalesce(p_expected->>'sha256','') !~ '^[0-9a-f]{64}$' OR jsonb_typeof(p_expected->'bytes') IS DISTINCT FROM 'number'
      OR coalesce(p_expected->>'bytes','') !~ '^[1-9][0-9]{0,6}$' OR (p_expected->>'bytes')::bigint>5242880
      OR coalesce(p_expected->>'mime','') NOT IN ('image/png','image/jpeg','image/gif') THEN
      RAISE EXCEPTION USING ERRCODE='ZA001',MESSAGE='FILE_INVALID'; END IF;
    IF b.job_id IS NOT NULL THEN
      IF b.actor_id<>p_actor OR b.source_id<>j.source_id OR b.sha256<>p_expected->>'sha256'
        OR b.bytes<>(p_expected->>'bytes')::bigint OR b.mime<>p_expected->>'mime' THEN
        RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='MATERIAL_CHANGED'; END IF;
    ELSE
      SELECT o.payload_object_id INTO v_object FROM content_intake.sop_media_objects o JOIN content_intake.objects payload ON payload.object_id=o.payload_object_id
        JOIN content_intake.object_reservations reservation ON reservation.object_id=payload.object_id AND reservation.state='adopted'
        WHERE o.media_object_id=p_media AND o.source_id=j.source_id AND o.sha256=p_expected->>'sha256'
          AND o.bytes=(p_expected->>'bytes')::bigint AND o.mime=p_expected->>'mime' AND payload.purpose='sop-media';
      IF v_object IS NULL THEN
        SELECT (SELECT coalesce(sum(bytes),0) FROM content_intake.objects WHERE tenant_id=a.tenant_id)+
          (SELECT coalesce(sum(reserved_bytes),0) FROM content_intake.object_reservations WHERE tenant_id=a.tenant_id AND state IN ('reserved','persisted','releasing')) INTO v_used;
        IF v_used+(p_expected->>'bytes')::bigint>1073741824 THEN RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='QUOTA_EXCEEDED'; END IF;
        v_object:='obj_'||encode(public.gen_random_bytes(32),'hex');
        INSERT INTO content_intake.object_reservations(object_id,tenant_id,app_id,actor_id,source_id,purpose,reserved_bytes,state)
          VALUES(v_object,a.tenant_id,a.app_id,p_actor,j.source_id,'sop-media',(p_expected->>'bytes')::bigint,'reserved');
      END IF;
      INSERT INTO content_intake.sop_payload_bindings VALUES(p_job,p_media,v_object,j.source_id,p_actor,p_expected->>'sha256',(p_expected->>'bytes')::bigint,p_expected->>'mime') RETURNING * INTO b;
    END IF;
  ELSIF b.job_id IS NULL OR b.actor_id<>p_actor OR b.source_id<>j.source_id OR b.object_id IS DISTINCT FROM p_object THEN
    RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='SCOPE_DENIED';
  END IF;
  SELECT * INTO STRICT r FROM content_intake.object_reservations WHERE object_id=b.object_id FOR UPDATE;
  IF r.purpose<>'sop-media' OR r.source_id<>j.source_id OR r.tenant_id<>a.tenant_id OR r.app_id<>a.app_id THEN
    RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='MATERIAL_CHANGED'; END IF;
  IF p_action='complete' THEN
    IF r.state NOT IN ('reserved','persisted','adopted') THEN RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='MATERIAL_CHANGED'; END IF;
    UPDATE content_intake.object_reservations SET state='persisted',actual_bytes=b.bytes,sha256=b.sha256,updated_at=clock_timestamp()
      WHERE object_id=r.object_id AND state='reserved' RETURNING * INTO r;
    IF NOT FOUND THEN SELECT * INTO STRICT r FROM content_intake.object_reservations WHERE object_id=b.object_id; END IF;
  ELSIF p_action IN ('begin-release','complete-release') THEN
    -- Clean only this original reservation. Reused adopted payloads are never freed.
    IF r.actor_id=p_actor AND NOT EXISTS(SELECT 1 FROM content_intake.objects WHERE object_id=r.object_id)
      AND NOT EXISTS(SELECT 1 FROM content_intake.sop_media_objects WHERE payload_object_id=r.object_id) THEN
      IF p_action='begin-release' AND r.state IN ('reserved','persisted','releasing') THEN
        UPDATE content_intake.object_reservations SET state='releasing',updated_at=clock_timestamp() WHERE object_id=r.object_id RETURNING * INTO r;
      ELSIF p_action='complete-release' AND r.state='releasing' THEN
        UPDATE content_intake.object_reservations SET state='released',updated_at=clock_timestamp() WHERE object_id=r.object_id RETURNING * INTO r;
      END IF;
    END IF;
  ELSIF p_action<>'reserve' THEN RAISE EXCEPTION USING ERRCODE='ZA001',MESSAGE='FILE_INVALID'; END IF;
  RETURN jsonb_build_object('objectId',b.object_id,'mediaObjectId',b.media_object_id,'sourceId',b.source_id,'sha256',b.sha256,'bytes',b.bytes,'mime',b.mime,'state',r.state);
END $$;
ALTER FUNCTION content_intake.sop_payload_transition(text,text,text,text,text,jsonb) OWNER TO intake_runtime_fn_owner;
REVOKE ALL ON FUNCTION content_intake.sop_payload_transition(text,text,text,text,text,jsonb) FROM PUBLIC;
CREATE FUNCTION content_intake.reserve_sop_media_payload(p_actor text,p_job text,p_media text,p_sha text,p_bytes bigint,p_mime text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT content_intake.sop_payload_transition(p_actor,p_job,p_media,NULL,'reserve',jsonb_build_object('sha256',p_sha,'bytes',p_bytes,'mime',p_mime));
$$;
CREATE FUNCTION content_intake.complete_sop_media_payload(p_actor text,p_job text,p_media text,p_object text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT content_intake.sop_payload_transition(p_actor,p_job,p_media,p_object,'complete',NULL);
$$;
CREATE FUNCTION content_intake.begin_sop_media_release(p_actor text,p_job text,p_media text,p_object text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT content_intake.sop_payload_transition(p_actor,p_job,p_media,p_object,'begin-release',NULL);
$$;
CREATE FUNCTION content_intake.complete_sop_media_release(p_actor text,p_job text,p_media text,p_object text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT content_intake.sop_payload_transition(p_actor,p_job,p_media,p_object,'complete-release',NULL);
$$;
ALTER FUNCTION content_intake.reserve_sop_media_payload(text,text,text,text,bigint,text) OWNER TO intake_runtime_fn_owner;
ALTER FUNCTION content_intake.complete_sop_media_payload(text,text,text,text) OWNER TO intake_runtime_fn_owner;
ALTER FUNCTION content_intake.begin_sop_media_release(text,text,text,text) OWNER TO intake_runtime_fn_owner;
ALTER FUNCTION content_intake.complete_sop_media_release(text,text,text,text) OWNER TO intake_runtime_fn_owner;
REVOKE ALL ON FUNCTION content_intake.reserve_sop_media_payload(text,text,text,text,bigint,text),content_intake.complete_sop_media_payload(text,text,text,text),
  content_intake.begin_sop_media_release(text,text,text,text),content_intake.complete_sop_media_release(text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION content_intake.reserve_sop_media_payload(text,text,text,text,bigint,text),content_intake.complete_sop_media_payload(text,text,text,text),
  content_intake.begin_sop_media_release(text,text,text,text),content_intake.complete_sop_media_release(text,text,text,text) TO intake_business;

-- Adopt charged files only inside the trusted freeze transaction. Stable media
-- identity wins concurrent jobs; the unused competing payload stays reclaimable.
CREATE FUNCTION content_intake.adopt_sop_payloads(p_actor text,p_job text,p_media jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE j content_intake.parse_jobs; a content_intake.principals; item jsonb; b content_intake.sop_payload_bindings; r content_intake.object_reservations;
  canonical_id text; normalized jsonb:='[]'::jsonb;
BEGIN
  SELECT * INTO STRICT j FROM content_intake.parse_jobs WHERE job_id=p_job AND actor_id=p_actor;
  SELECT * INTO STRICT a FROM content_intake.principals WHERE principal_id=p_actor;
  FOR item IN SELECT x FROM jsonb_array_elements(p_media->'items') x LOOP
    SELECT m.payload_object_id INTO canonical_id FROM content_intake.objects o JOIN content_intake.sop_media_objects m ON m.payload_object_id=o.object_id
      WHERE m.media_object_id=item->>'mediaObjectId' AND o.source_id=j.source_id AND o.purpose='sop-media'
      AND o.sha256=item->>'sha256' AND o.bytes=(item->>'bytes')::bigint AND o.mime=item->>'mime' AND o.tenant_id=a.tenant_id AND o.app_id=a.app_id;
    IF canonical_id IS NOT NULL AND canonical_id=item->>'payloadObjectId' THEN
      normalized:=normalized||jsonb_build_array(item); CONTINUE;
    END IF;
    SELECT * INTO b FROM content_intake.sop_payload_bindings WHERE job_id=p_job AND media_object_id=item->>'mediaObjectId' AND object_id=item->>'payloadObjectId';
    IF NOT FOUND OR b.actor_id<>p_actor OR b.source_id<>j.source_id OR b.sha256 IS DISTINCT FROM item->>'sha256' OR b.bytes IS DISTINCT FROM (item->>'bytes')::bigint OR b.mime IS DISTINCT FROM item->>'mime' THEN
      RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='MATERIAL_CHANGED'; END IF;
    IF canonical_id IS NOT NULL THEN
      normalized:=normalized||jsonb_build_array(item||jsonb_build_object('payloadObjectId',canonical_id)); CONTINUE;
    END IF;
    SELECT * INTO STRICT r FROM content_intake.object_reservations WHERE object_id=b.object_id FOR UPDATE;
    IF r.state NOT IN ('persisted','adopted') OR r.purpose<>'sop-media' OR r.actor_id<>p_actor OR r.source_id<>j.source_id
      OR r.tenant_id<>a.tenant_id OR r.app_id<>a.app_id OR r.sha256 IS DISTINCT FROM b.sha256 OR r.actual_bytes IS DISTINCT FROM b.bytes THEN
      RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='MATERIAL_CHANGED'; END IF;
    IF r.state='adopted' AND NOT EXISTS(SELECT 1 FROM content_intake.objects WHERE object_id=b.object_id AND source_id=b.source_id AND sha256=b.sha256 AND bytes=b.bytes AND mime=b.mime AND purpose='sop-media') THEN
      RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='MATERIAL_CHANGED'; END IF;
    INSERT INTO content_intake.objects(object_id,source_id,actor_id,tenant_id,app_id,object_key,sha256,bytes,mime,purpose,received_at)
      VALUES(b.object_id,j.source_id,p_actor,a.tenant_id,a.app_id,'intake/'||b.object_id,b.sha256,b.bytes,b.mime,'sop-media',clock_timestamp()) ON CONFLICT(object_id) DO NOTHING;
    UPDATE content_intake.object_reservations SET state='adopted',updated_at=clock_timestamp() WHERE object_id=b.object_id;
    normalized:=normalized||jsonb_build_array(item);
  END LOOP;
  RETURN p_media||jsonb_build_object('items',normalized);
END $$;
ALTER FUNCTION content_intake.adopt_sop_payloads(text,text,jsonb) OWNER TO intake_runtime_fn_owner;
REVOKE ALL ON FUNCTION content_intake.adopt_sop_payloads(text,text,jsonb) FROM PUBLIC;

-- DRAFT source. Explicit row bindings, immutable revision, no production activation.
CREATE TABLE content_intake.sop_candidate_rows (
  candidate_id content_intake.identifier NOT NULL,
  candidate_version content_intake.version NOT NULL,
  source_id content_intake.identifier NOT NULL,
  row_id text NOT NULL CHECK (row_id ~ '^sop:[^:]{1,128}:[1-9][0-9]{0,3}$'),
  business_entry_id text NOT NULL,
  CHECK (split_part(row_id,':',2) IN ('过敏流程SOP','少错破SOP','品质售后SOP','税收相关规则','品牌对接资源汇总','长痘痘SOP') AND split_part(row_id,':',3)::int<=5000),
  PRIMARY KEY(candidate_id,candidate_version,row_id),
  UNIQUE(candidate_id,candidate_version,business_entry_id),
  FOREIGN KEY(candidate_id,candidate_version,source_id)
    REFERENCES content_intake.candidate_versions(candidate_id,version,source_id)
);
ALTER TABLE content_intake.sop_candidate_rows OWNER TO intake_runtime_fn_owner;
REVOKE ALL ON content_intake.sop_candidate_rows FROM PUBLIC;
GRANT SELECT,INSERT ON content_intake.candidate_vocabulary TO intake_runtime_fn_owner;
-- candidate_format_guard reads the original input object on each revision.
GRANT SELECT ON content_intake.objects TO intake_runtime_fn_owner;

-- Trusted parser passes exact workbook row -> generated entry mappings at freeze.
-- Older candidates without such provenance must be reimported, never inferred.
CREATE FUNCTION content_intake.register_sop_candidate_rows(p_actor text,p_id text,p_version bigint,p_rows jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c content_intake.candidate_versions; v_count integer;
BEGIN
  PERFORM backend_review.lock_content();
  SELECT * INTO c FROM content_intake.candidate_versions WHERE candidate_id=p_id AND version=p_version FOR UPDATE;
  IF NOT FOUND OR content_intake.authorization_deadline(p_actor,'import',c.scope_id,c.source_id,clock_timestamp()) IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='SCOPE_DENIED'; END IF;
  IF c.state NOT IN ('awaiting-evidence','ready') OR c.publication_policy<>'direct-v1'
    OR NOT EXISTS (SELECT 1 FROM content_intake.source_mappings m JOIN content_intake.scopes s ON s.scope_id=c.scope_id
      WHERE m.source_id=c.source_id AND m.version=c.source_version AND
      (s.domain='sop' OR m.template_version='sop-v1' OR m.rule_version='sop-not-imported' OR m.mapping_version='sop-not-imported')) THEN
    RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='MATERIAL_CHANGED'; END IF;
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 5000 THEN
    RAISE EXCEPTION USING ERRCODE='ZA001',MESSAGE='FILE_INVALID'; END IF;
  v_count:=jsonb_array_length(p_rows);
  IF v_count<>jsonb_array_length(c.material->'entries') OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_rows) r WHERE
      r-ARRAY['rowId','businessEntryId','title','answerText']<>'{}'::jsonb OR
      NOT r ?& ARRAY['rowId','businessEntryId','title','answerText'] OR
      jsonb_typeof(r->'rowId')<>'string' OR (r->>'rowId') !~ '^sop:[^:]{1,128}:[1-9][0-9]{0,3}$' OR
      split_part(r->>'rowId',':',2) IS DISTINCT FROM r->>'title' OR
      NOT EXISTS (SELECT 1 FROM jsonb_array_elements(c.material->'entries') e
        WHERE e->'businessEntryId'=r->'businessEntryId' AND e->'title'=r->'title' AND e->'answerText'=r->'answerText')
    ) OR (SELECT count(DISTINCT r->>'rowId')<>v_count OR count(DISTINCT r->>'businessEntryId')<>v_count FROM jsonb_array_elements(p_rows) r) THEN
    RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='MATERIAL_CHANGED'; END IF;
  IF EXISTS (SELECT 1 FROM content_intake.sop_candidate_rows WHERE candidate_id=p_id AND candidate_version=p_version) THEN
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_rows) r WHERE NOT EXISTS (
      SELECT 1 FROM content_intake.sop_candidate_rows b WHERE b.candidate_id=p_id AND b.candidate_version=p_version
        AND b.row_id=r->>'rowId' AND b.business_entry_id=r->>'businessEntryId')) THEN
      RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='MATERIAL_CHANGED'; END IF;
    RETURN;
  END IF;
  INSERT INTO content_intake.sop_candidate_rows
    SELECT p_id,p_version,c.source_id,r->>'rowId',r->>'businessEntryId' FROM jsonb_array_elements(p_rows) r;
END $$;
ALTER FUNCTION content_intake.register_sop_candidate_rows(text,text,bigint,jsonb) OWNER TO intake_runtime_fn_owner;
REVOKE ALL ON FUNCTION content_intake.register_sop_candidate_rows(text,text,bigint,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION content_intake.register_sop_candidate_rows(text,text,bigint,jsonb) FROM intake_business;

CREATE TABLE content_intake.sop_asset_registrations (
  candidate_id content_intake.identifier NOT NULL,
  candidate_version content_intake.version NOT NULL,
  -- NULL marks a manual derived revision, not a replayable parser registration.
  payload_digest content_intake.sha256,
  content_version jsonb NOT NULL CHECK (jsonb_typeof(content_version)='object'),
  PRIMARY KEY(candidate_id,candidate_version),
  FOREIGN KEY(candidate_id,candidate_version) REFERENCES content_intake.candidate_versions(candidate_id,version)
);
ALTER TABLE content_intake.sop_asset_registrations OWNER TO intake_runtime_fn_owner;
REVOKE ALL ON content_intake.sop_asset_registrations FROM PUBLIC;

-- Deletion facts never disappear when the current media projection is reused.
CREATE TABLE content_intake.sop_row_deletion_events (
  candidate_id content_intake.identifier NOT NULL,
  candidate_version content_intake.version NOT NULL,
  source_id content_intake.identifier NOT NULL,
  row_id text NOT NULL,
  actor_id content_intake.identifier NOT NULL REFERENCES content_intake.principals,
  content_version jsonb NOT NULL,
  deleted_at timestamptz NOT NULL CHECK (isfinite(deleted_at)),
  media jsonb NOT NULL CHECK (jsonb_typeof(media)='array'),
  PRIMARY KEY(candidate_id,candidate_version,row_id),
  FOREIGN KEY(candidate_id,candidate_version,source_id) REFERENCES content_intake.candidate_versions(candidate_id,version,source_id)
);
ALTER TABLE content_intake.sop_row_deletion_events OWNER TO intake_runtime_fn_owner;
REVOKE ALL ON content_intake.sop_row_deletion_events FROM PUBLIC;
CREATE INDEX sop_deletion_source_row ON content_intake.sop_row_deletion_events(source_id,row_id);
CREATE TRIGGER sop_deletion_history BEFORE UPDATE OR DELETE ON content_intake.sop_row_deletion_events
  FOR EACH ROW EXECUTE FUNCTION content_intake.immutable_history();

-- One trusted parser call owns complete row/media registration. Metadata is supplied
-- only by the server parser after validating bytes; this is not a renderer API.
CREATE FUNCTION content_intake.stage_sop_candidate_assets(p_actor text,p_id text,p_version bigint,p_rows jsonb,p_media jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c content_intake.candidate_versions; r jsonb; v_items jsonb; v_existing jsonb; v_payload text; v_registered text;
BEGIN
  PERFORM backend_review.lock_content();
  SELECT * INTO c FROM content_intake.candidate_versions WHERE candidate_id=p_id AND version=p_version FOR UPDATE;
  IF NOT FOUND OR content_intake.authorization_deadline(p_actor,'import',c.scope_id,c.source_id,clock_timestamp()) IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='SCOPE_DENIED'; END IF;
  IF c.state NOT IN ('awaiting-evidence','ready') OR c.publication_policy<>'direct-v1' OR EXISTS
    (SELECT 1 FROM content_intake.write_attempts WHERE candidate_id=p_id AND candidate_version=p_version AND action='publish' AND state IN ('pending','unknown')) THEN
    RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='MATERIAL_CHANGED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM content_intake.sources WHERE source_id=c.source_id AND current_mapping_version=c.source_version AND mode='v2-preview') THEN
    RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='SOURCE_MISMATCH'; END IF;
  IF jsonb_typeof(p_media) IS DISTINCT FROM 'object' OR p_media-ARRAY['sourceId','sourceVersion','fileSha256','materialDigest','contentVersion','freshRowIds','items']<>'{}'::jsonb
    OR NOT p_media ?& ARRAY['sourceId','sourceVersion','fileSha256','materialDigest','contentVersion','freshRowIds','items']
    OR p_media->'sourceId' IS DISTINCT FROM to_jsonb(c.source_id::text)
    OR p_media->'sourceVersion' IS DISTINCT FROM to_jsonb(c.source_version::bigint)
    OR p_media->'fileSha256' IS DISTINCT FROM to_jsonb(c.file_sha256::text)
    OR p_media->'materialDigest' IS DISTINCT FROM to_jsonb(c.digest::text)
    OR jsonb_typeof(p_media->'freshRowIds') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_media->'items') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='MATERIAL_CHANGED'; END IF;
  IF jsonb_typeof(p_media->'contentVersion') IS DISTINCT FROM 'object'
    OR (p_media->'contentVersion')-ARRAY['kind','value']<>'{}'::jsonb OR NOT (p_media->'contentVersion') ?& ARRAY['kind','value']
    OR jsonb_typeof(p_media#>'{contentVersion,kind}') IS DISTINCT FROM 'string'
    OR p_media#>>'{contentVersion,kind}' NOT IN ('declared','sha256')
    OR jsonb_typeof(p_media#>'{contentVersion,value}') IS DISTINCT FROM 'string'
    OR length(p_media#>>'{contentVersion,value}') NOT BETWEEN 1 AND 32767 OR btrim(p_media#>>'{contentVersion,value}')=''
    OR (p_media#>>'{contentVersion,kind}'='sha256' AND p_media#>>'{contentVersion,value}'<>c.file_sha256) THEN
    RAISE EXCEPTION USING ERRCODE='ZA001',MESSAGE='FILE_INVALID'; END IF;
  v_items:=p_media->'items';
  IF jsonb_array_length(v_items)>500 OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_items) x WHERE
    jsonb_typeof(x) IS DISTINCT FROM 'object' OR x-ARRAY['mediaObjectId','payloadObjectId','sha256','bytes','mime','sheetName','rowNumber','columnNumber','ordinal']<>'{}'::jsonb
    OR NOT x ?& ARRAY['mediaObjectId','payloadObjectId','sha256','bytes','mime','sheetName','rowNumber','columnNumber','ordinal']
    OR jsonb_typeof(x->'mediaObjectId') IS DISTINCT FROM 'string' OR (x->>'mediaObjectId') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    OR jsonb_typeof(x->'payloadObjectId') IS DISTINCT FROM 'string' OR (x->>'payloadObjectId') !~ '^obj_[0-9a-f]{64}$'
    OR jsonb_typeof(x->'sha256') IS DISTINCT FROM 'string' OR (x->>'sha256') !~ '^[a-f0-9]{64}$'
    OR jsonb_typeof(x->'mime') IS DISTINCT FROM 'string' OR (x->>'mime') NOT IN ('image/png','image/jpeg','image/gif')
    OR jsonb_typeof(x->'sheetName') IS DISTINCT FROM 'string'
    OR jsonb_typeof(x->'bytes') IS DISTINCT FROM 'number' OR (x->>'bytes') !~ '^[1-9][0-9]{0,6}$'
    OR jsonb_typeof(x->'rowNumber') IS DISTINCT FROM 'number' OR (x->>'rowNumber') !~ '^[1-9][0-9]{0,3}$'
    OR jsonb_typeof(x->'columnNumber') IS DISTINCT FROM 'number' OR (x->>'columnNumber') !~ '^[1-9][0-9]?$'
    OR jsonb_typeof(x->'ordinal') IS DISTINCT FROM 'number' OR (x->>'ordinal') !~ '^[1-9][0-9]{0,2}$') THEN
    RAISE EXCEPTION USING ERRCODE='ZA001',MESSAGE='FILE_INVALID'; END IF;
  -- The row helper validates every material entry and never infers missing rows.
  PERFORM content_intake.register_sop_candidate_rows(p_actor,p_id,p_version,p_rows);
  IF EXISTS (SELECT 1 FROM content_intake.sop_row_deletion_events d JOIN content_intake.sop_candidate_rows b
      ON b.source_id=d.source_id AND b.row_id=d.row_id WHERE b.candidate_id=p_id AND b.candidate_version=p_version
      AND d.content_version=p_media->'contentVersion') THEN
    RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='MATERIAL_CHANGED'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_items) x WHERE (x->>'bytes')::bigint>5242880
    OR (x->>'columnNumber')::int>32 OR (x->>'ordinal')::int>100 OR NOT EXISTS
    (SELECT 1 FROM content_intake.sop_candidate_rows b WHERE b.candidate_id=p_id AND b.candidate_version=p_version
      AND b.row_id='sop:'||(x->>'sheetName')||':'||(x->>'rowNumber')))
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_items) x GROUP BY x->>'sheetName',x->>'rowNumber',x->>'mediaObjectId',x->>'ordinal' HAVING count(*)>1)
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_items) x GROUP BY x->>'sheetName',x->>'rowNumber',x->>'columnNumber',x->>'ordinal' HAVING count(*)>1) THEN
    RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='MATERIAL_CHANGED'; END IF;
  v_payload:=encode(public.digest(public.jsonb_jcs(jsonb_build_object('rows',
    (SELECT jsonb_agg(x ORDER BY x->>'rowId') FROM jsonb_array_elements(p_rows) x),
    'media',p_media||jsonb_build_object('freshRowIds',(SELECT coalesce(jsonb_agg(x ORDER BY x),'[]'::jsonb) FROM jsonb_array_elements(p_media->'freshRowIds') x),'items',(SELECT coalesce(jsonb_agg(x ORDER BY x->>'sheetName',(x->>'rowNumber')::int,(x->>'columnNumber')::int,(x->>'ordinal')::int,x->>'mediaObjectId'),'[]'::jsonb) FROM jsonb_array_elements(v_items) x)))),'sha256'),'hex');
  SELECT payload_digest INTO v_registered FROM content_intake.sop_asset_registrations WHERE candidate_id=p_id AND candidate_version=p_version;
  IF FOUND THEN
    IF v_registered IS DISTINCT FROM v_payload THEN RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='MATERIAL_CHANGED'; END IF;
    RETURN;
  END IF;
  -- A published entry's workbook row identity is immutable. Historical candidates
  -- lacking reliable row provenance must be reimported through an approved repair.
  IF EXISTS (SELECT 1 FROM content_intake.release_lineage l JOIN content_intake.candidate_versions prior
      ON prior.candidate_id=l.candidate_id AND prior.version=l.candidate_version
    JOIN content_intake.sop_candidate_rows current ON current.candidate_id=p_id AND current.candidate_version=p_version AND current.business_entry_id=l.business_entry_id
    WHERE l.release_id=c.base_release_id AND l.source_id=c.source_id AND NOT EXISTS
      (SELECT 1 FROM content_intake.sop_candidate_rows b WHERE b.candidate_id=l.candidate_id AND b.candidate_version=l.candidate_version
        AND b.business_entry_id=l.business_entry_id AND b.source_id=c.source_id AND b.row_id=current.row_id)) THEN
    RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='MATERIAL_CHANGED'; END IF;
  -- Parser labels fresh rows explicitly: equal text does not imply inherited
  -- media because a fresh workbook may replace/remove images without text edits.
  IF jsonb_array_length(p_media->'freshRowIds')>(SELECT count(*) FROM content_intake.sop_candidate_rows WHERE candidate_id=p_id AND candidate_version=p_version)
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_media->'freshRowIds') x WHERE jsonb_typeof(x)<>'string'
      OR NOT EXISTS (SELECT 1 FROM content_intake.sop_candidate_rows b WHERE b.candidate_id=p_id AND b.candidate_version=p_version AND to_jsonb(b.row_id)=x))
    OR (SELECT count(*)<>count(DISTINCT x) FROM jsonb_array_elements(p_media->'freshRowIds') x)
    OR EXISTS (
      -- Expand each immutable version once. Correlated expansion per lineage row
      -- multiplies whole-workbook scans and can exhaust the transaction deadline.
      WITH base_lineage AS MATERIALIZED (
        SELECT candidate_id,candidate_version,source_id,business_entry_id
        FROM content_intake.release_lineage WHERE release_id=c.base_release_id AND source_id=c.source_id
      ), prior_versions AS MATERIALIZED (
        SELECT prior.candidate_id,prior.version,prior.material
        FROM (SELECT DISTINCT candidate_id,candidate_version FROM base_lineage) versions
        JOIN content_intake.candidate_versions prior ON prior.candidate_id=versions.candidate_id AND prior.version=versions.candidate_version
      ), prior_entries AS MATERIALIZED (
        SELECT prior.candidate_id,prior.version,old.value AS entry FROM prior_versions prior
        CROSS JOIN LATERAL jsonb_array_elements(prior.material->'entries') old
      ), current_entries AS MATERIALIZED (
        SELECT value AS entry FROM jsonb_array_elements(c.material->'entries')
      ), inherited_rows AS MATERIALIZED (
        SELECT b.row_id,b.business_entry_id FROM base_lineage l
        JOIN content_intake.sop_candidate_rows b ON b.candidate_id=l.candidate_id AND b.candidate_version=l.candidate_version
          AND b.source_id=l.source_id AND b.business_entry_id=l.business_entry_id
        JOIN prior_entries old ON old.candidate_id=l.candidate_id AND old.version=l.candidate_version
          AND old.entry->>'businessEntryId'=b.business_entry_id
        JOIN current_entries current_entry ON current_entry.entry=old.entry
      )
      SELECT 1 FROM content_intake.sop_candidate_rows current WHERE current.candidate_id=p_id AND current.candidate_version=p_version
        AND NOT (p_media->'freshRowIds') ? current.row_id
        AND NOT EXISTS(SELECT 1 FROM inherited_rows prior WHERE prior.row_id=current.row_id AND prior.business_entry_id=current.business_entry_id)
    ) THEN
    RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='MATERIAL_CHANGED'; END IF;
  -- Only explicitly inherited entries retain the exact prior media set.
  IF EXISTS (SELECT 1 FROM content_intake.release_lineage l JOIN content_intake.candidate_versions prior
      ON prior.candidate_id=l.candidate_id AND prior.version=l.candidate_version
    JOIN content_intake.sop_candidate_rows b ON b.candidate_id=l.candidate_id AND b.candidate_version=l.candidate_version AND b.business_entry_id=l.business_entry_id
    JOIN LATERAL jsonb_array_elements(prior.material->'entries') old ON old->>'businessEntryId'=l.business_entry_id
    WHERE l.release_id=c.base_release_id AND l.source_id=c.source_id AND NOT (p_media->'freshRowIds') ? b.row_id
    AND (SELECT coalesce(jsonb_agg(jsonb_build_object('mediaObjectId',m.media_object_id,'payloadObjectId',(SELECT payload_object_id FROM content_intake.sop_media_objects WHERE media_object_id=m.media_object_id),'sha256',m.sha256,'bytes',m.bytes,'mime',m.mime,
      'sheetName',m.sheet_name,'rowNumber',m.row_number,'columnNumber',m.column_number,'ordinal',m.ordinal) ORDER BY m.sheet_name,m.row_number,m.column_number,m.ordinal,m.media_object_id),'[]'::jsonb)
      FROM content_intake.sop_candidate_media m WHERE m.candidate_id=l.candidate_id AND m.candidate_version=l.candidate_version AND m.row_id=b.row_id)
    IS DISTINCT FROM (SELECT coalesce(jsonb_agg(x ORDER BY x->>'sheetName',(x->>'rowNumber')::int,(x->>'columnNumber')::int,(x->>'ordinal')::int,x->>'mediaObjectId'),'[]'::jsonb) FROM jsonb_array_elements(v_items) x
      WHERE 'sop:'||(x->>'sheetName')||':'||(x->>'rowNumber')=b.row_id)) THEN
    RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='MATERIAL_CHANGED'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('mediaObjectId',m.media_object_id,'payloadObjectId',(SELECT payload_object_id FROM content_intake.sop_media_objects WHERE media_object_id=m.media_object_id),'sha256',m.sha256,'bytes',m.bytes,'mime',m.mime,
    'sheetName',m.sheet_name,'rowNumber',m.row_number,'columnNumber',m.column_number,'ordinal',m.ordinal) ORDER BY m.sheet_name,m.row_number,m.column_number,m.ordinal,m.media_object_id),'[]'::jsonb)
    INTO v_existing FROM content_intake.sop_candidate_media m WHERE candidate_id=p_id AND candidate_version=p_version;
  IF v_existing<>'[]'::jsonb AND v_existing IS DISTINCT FROM (SELECT coalesce(jsonb_agg(x ORDER BY x->>'sheetName',(x->>'rowNumber')::int,(x->>'columnNumber')::int,(x->>'ordinal')::int,x->>'mediaObjectId'),'[]'::jsonb) FROM jsonb_array_elements(v_items) x) THEN
    RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='MATERIAL_CHANGED'; END IF;
  FOR r IN SELECT x FROM jsonb_array_elements(v_items) x LOOP
    IF EXISTS (SELECT 1 FROM content_intake.sop_media_objects o WHERE o.media_object_id=r->>'mediaObjectId' AND
      (o.source_id<>c.source_id OR o.sha256<>r->>'sha256' OR o.bytes<>(r->>'bytes')::bigint OR o.mime<>r->>'mime' OR o.payload_object_id IS DISTINCT FROM r->>'payloadObjectId'))
      OR EXISTS (SELECT 1 FROM content_intake.sop_media_objects o WHERE o.source_id=c.source_id AND o.sha256=r->>'sha256' AND o.bytes=(r->>'bytes')::bigint AND o.mime=r->>'mime' AND o.media_object_id<>r->>'mediaObjectId') THEN
      RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='MATERIAL_CHANGED'; END IF;
    IF EXISTS (SELECT 1 FROM content_intake.sop_row_deletion_events d CROSS JOIN LATERAL jsonb_array_elements(d.media) m
      WHERE d.source_id=c.source_id AND d.content_version=p_media->'contentVersion' AND m->>'mediaObjectId'=r->>'mediaObjectId' AND m->>'state'='discarded') THEN
      RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='MATERIAL_CHANGED'; END IF;
    IF EXISTS (SELECT 1 FROM content_intake.sop_media_objects WHERE media_object_id=r->>'mediaObjectId' AND state='discarded') THEN
      -- A different operation/job is not a different content version. All deletion
      -- history participates, including an older version seen before the last one.
      IF NOT (p_media->'freshRowIds') ? ('sop:'||(r->>'sheetName')||':'||(r->>'rowNumber'))
        OR EXISTS (SELECT 1 FROM content_intake.sop_candidate_media WHERE media_object_id=r->>'mediaObjectId')
        OR EXISTS (SELECT 1 FROM content_intake.sop_release_media WHERE media_object_id=r->>'mediaObjectId')
        OR EXISTS (SELECT 1 FROM content_intake.sop_row_deletion_events d CROSS JOIN LATERAL jsonb_array_elements(d.media) m
          WHERE d.source_id=c.source_id AND d.content_version=p_media->'contentVersion' AND m->>'mediaObjectId'=r->>'mediaObjectId')
        OR NOT EXISTS (SELECT 1 FROM content_intake.sop_row_deletion_events d CROSS JOIN LATERAL jsonb_array_elements(d.media) m
          JOIN content_intake.sop_media_objects o ON o.media_object_id=m->>'mediaObjectId'
          WHERE d.source_id=c.source_id AND o.media_object_id=r->>'mediaObjectId' AND o.adopted_at IS NULL
            AND m->>'state'='discarded' AND m->>'sha256'=o.sha256 AND (m->>'bytes')::bigint=o.bytes AND m->>'mime'=o.mime
            AND (m->>'discardedAt')::timestamptz=o.discarded_at AND d.content_version IS DISTINCT FROM p_media->'contentVersion') THEN
        RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='MATERIAL_CHANGED'; END IF;
      UPDATE content_intake.sop_media_objects SET state='staged',discarded_at=NULL WHERE media_object_id=r->>'mediaObjectId' AND state='discarded' AND adopted_at IS NULL;
    END IF;
    INSERT INTO content_intake.sop_media_objects(media_object_id,source_id,actor_id,sha256,bytes,mime,state,created_at,payload_object_id)
      VALUES(r->>'mediaObjectId',c.source_id,p_actor,r->>'sha256',(r->>'bytes')::bigint,r->>'mime','staged',clock_timestamp(),r->>'payloadObjectId') ON CONFLICT(media_object_id) DO NOTHING;
    INSERT INTO content_intake.sop_candidate_media VALUES(p_id,p_version,c.source_id,r->>'mediaObjectId',r->>'sheetName',(r->>'rowNumber')::int,(r->>'columnNumber')::int,
      'sop:'||(r->>'sheetName')||':'||(r->>'rowNumber'),(r->>'ordinal')::int,r->>'sha256',r->>'mime',(r->>'bytes')::bigint) ON CONFLICT(candidate_id,candidate_version,row_id,media_object_id,ordinal) DO NOTHING;
  END LOOP;
  INSERT INTO content_intake.sop_asset_registrations VALUES(p_id,p_version,v_payload,p_media->'contentVersion');
  IF content_intake.authorization_deadline(p_actor,'import',c.scope_id,c.source_id,clock_timestamp()) IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='SCOPE_DENIED'; END IF;
END $$;
ALTER FUNCTION content_intake.stage_sop_candidate_assets(text,text,bigint,jsonb,jsonb) OWNER TO intake_runtime_fn_owner;
REVOKE ALL ON FUNCTION content_intake.stage_sop_candidate_assets(text,text,bigint,jsonb,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION content_intake.stage_sop_candidate_assets(text,text,bigint,jsonb,jsonb) FROM intake_business;

-- Read provenance only through the authenticated source/job, never global tables.
CREATE FUNCTION content_intake.read_sop_inherited_assets(p_actor text,p_job text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE j content_intake.parse_jobs; s content_intake.sources; v_rows jsonb; v_media jsonb; v_frozen jsonb:='[]'::jsonb; v_cleanup jsonb:='[]'::jsonb;
BEGIN
  SELECT * INTO j FROM content_intake.parse_jobs WHERE job_id=p_job;
  IF NOT FOUND OR j.actor_id<>p_actor THEN RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='SCOPE_DENIED'; END IF;
  SELECT * INTO STRICT s FROM content_intake.sources WHERE source_id=j.source_id;
  IF content_intake.authorization_deadline(p_actor,'import',s.scope_id,s.source_id,clock_timestamp()) IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='SCOPE_DENIED'; END IF;
  IF j.state NOT IN ('reading','parsing','validated') OR s.mode<>'v2-preview' OR s.current_mapping_version<>j.source_version THEN
    RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='SOURCE_MISMATCH'; END IF;
  IF EXISTS (SELECT 1 FROM content_intake.release_lineage l WHERE l.release_id=j.base_release_id AND l.source_id=j.source_id
    AND NOT EXISTS (SELECT 1 FROM content_intake.sop_candidate_rows b WHERE b.candidate_id=l.candidate_id AND b.candidate_version=l.candidate_version AND b.source_id=l.source_id AND b.business_entry_id=l.business_entry_id)) THEN
    RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='MATERIAL_CHANGED'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('rowId',b.row_id,'businessEntryId',b.business_entry_id,'title',e->>'title','answerText',e->>'answerText') ORDER BY b.row_id),'[]'::jsonb)
    INTO v_rows FROM content_intake.release_lineage l JOIN content_intake.sop_candidate_rows b ON b.candidate_id=l.candidate_id AND b.candidate_version=l.candidate_version AND b.source_id=l.source_id AND b.business_entry_id=l.business_entry_id
    JOIN content_intake.candidate_versions c ON c.candidate_id=l.candidate_id AND c.version=l.candidate_version
    CROSS JOIN LATERAL jsonb_array_elements(c.material->'entries') e
    WHERE l.release_id=j.base_release_id AND l.source_id=j.source_id AND e->>'businessEntryId'=l.business_entry_id;
  SELECT coalesce(jsonb_agg(jsonb_build_object('mediaObjectId',m.media_object_id,'payloadObjectId',(SELECT payload_object_id FROM content_intake.sop_media_objects WHERE media_object_id=m.media_object_id),'sha256',m.sha256,'bytes',m.bytes,'mime',m.mime,'sheetName',m.sheet_name,'rowNumber',m.row_number,'columnNumber',m.column_number,'ordinal',m.ordinal) ORDER BY m.sheet_name,m.row_number,m.column_number,m.ordinal,m.media_object_id),'[]'::jsonb)
    INTO v_media FROM content_intake.release_lineage l JOIN content_intake.sop_candidate_rows b ON b.candidate_id=l.candidate_id AND b.candidate_version=l.candidate_version AND b.source_id=l.source_id AND b.business_entry_id=l.business_entry_id
    JOIN content_intake.sop_candidate_media m ON m.candidate_id=b.candidate_id AND m.candidate_version=b.candidate_version AND m.row_id=b.row_id AND m.source_id=b.source_id
    WHERE l.release_id=j.base_release_id AND l.source_id=j.source_id;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_media) item WHERE item->>'payloadObjectId' IS NULL) THEN RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='MATERIAL_CHANGED'; END IF;
  -- Recovery exposes only this job's durable result, not arbitrary candidate IDs.
  -- The original freeze still validates material, state and registration digest.
  IF j.state='validated' THEN
    IF NOT EXISTS(SELECT 1 FROM content_intake.candidate_versions c
      WHERE c.candidate_id=j.result_candidate_id AND c.version=j.result_candidate_version
        AND c.source_id=j.source_id AND c.actor_id=p_actor AND c.object_id=j.object_id) THEN
      RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='MATERIAL_CHANGED'; END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object('mediaObjectId',m.media_object_id,'payloadObjectId',o.payload_object_id,
      'sha256',m.sha256,'bytes',m.bytes,'mime',m.mime,'sheetName',m.sheet_name,'rowNumber',m.row_number,
      'columnNumber',m.column_number,'ordinal',m.ordinal) ORDER BY m.sheet_name,m.row_number,m.column_number,m.ordinal,m.media_object_id),'[]'::jsonb)
      INTO v_frozen FROM content_intake.sop_candidate_media m
      JOIN content_intake.sop_candidate_rows b ON b.candidate_id=m.candidate_id AND b.candidate_version=m.candidate_version
        AND b.source_id=m.source_id AND b.row_id=m.row_id
      JOIN content_intake.sop_media_objects o ON o.media_object_id=m.media_object_id AND o.source_id=m.source_id
      WHERE m.candidate_id=j.result_candidate_id AND m.candidate_version=j.result_candidate_version AND m.source_id=j.source_id;
    IF jsonb_array_length(v_frozen)<>(SELECT count(*) FROM content_intake.sop_candidate_media m
        WHERE m.candidate_id=j.result_candidate_id AND m.candidate_version=j.result_candidate_version AND m.source_id=j.source_id)
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_frozen) item WHERE item->>'payloadObjectId' IS NULL) THEN
      RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='MATERIAL_CHANGED'; END IF;
  END IF;
  -- A confirmed validated job also recovers its unadopted competing payloads.
  -- This is metadata only; the existing release capability rechecks ownership
  -- and references under the file/content locks before deleting any bytes.
  IF j.state='validated' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('objectId',b.object_id,'mediaObjectId',b.media_object_id,
      'sourceId',b.source_id,'sha256',b.sha256,'bytes',b.bytes,'mime',b.mime,'state',r.state)
      ORDER BY b.media_object_id),'[]'::jsonb) INTO v_cleanup
      FROM content_intake.sop_payload_bindings b JOIN content_intake.object_reservations r USING(object_id)
      WHERE b.job_id=p_job AND b.actor_id=p_actor AND b.source_id=j.source_id AND r.actor_id=p_actor
        AND r.source_id=j.source_id AND r.purpose='sop-media' AND r.state IN ('reserved','persisted','releasing');
  END IF;
  RETURN jsonb_build_object('rows',v_rows,'media',v_media,'frozenMedia',v_frozen,'pendingPayloads',v_cleanup);
END $$;
ALTER FUNCTION content_intake.read_sop_inherited_assets(text,text) OWNER TO intake_runtime_fn_owner;
REVOKE ALL ON FUNCTION content_intake.read_sop_inherited_assets(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION content_intake.read_sop_inherited_assets(text,text) TO intake_business;

-- Complete freeze capability: inputs are produced by the trusted parser, never
-- accepted as arbitrary HTTP material. SQL owns persistence and current authority.
GRANT SELECT ON content_intake.parse_jobs,content_intake.release_catalogs,content_intake.vocabulary,content_intake.vocabulary_displays TO intake_runtime_fn_owner;
GRANT UPDATE(state,finished_at,result_candidate_id,result_candidate_version) ON content_intake.parse_jobs TO intake_runtime_fn_owner;
CREATE FUNCTION content_intake.freeze_sop_parsed_candidate(p_actor text,p_job text,p_material jsonb,p_rows jsonb,p_media jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE j content_intake.parse_jobs; s content_intake.sources; old content_intake.candidate_versions;
  o content_intake.objects; v_id text; v_version bigint; v_until timestamptz; v_encoded text; entry_data jsonb;
BEGIN
  PERFORM backend_review.lock_content();
  SELECT * INTO j FROM content_intake.parse_jobs WHERE job_id=p_job FOR UPDATE;
  IF NOT FOUND OR j.actor_id<>p_actor THEN RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='SCOPE_DENIED'; END IF;
  SELECT * INTO STRICT s FROM content_intake.sources WHERE source_id=j.source_id;
  v_until:=content_intake.authorization_deadline(p_actor,'import',s.scope_id,s.source_id,clock_timestamp());
  IF v_until IS NULL THEN RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='SCOPE_DENIED'; END IF;
  IF j.state NOT IN ('reading','parsing','validated') OR s.mode<>'v2-preview' OR s.current_mapping_version<>j.source_version THEN
    RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='SOURCE_MISMATCH'; END IF;
  IF jsonb_typeof(p_material) IS DISTINCT FROM 'object'
    OR p_material-ARRAY['canonicalEncodingVersion','scope','sourceVersion','sourceClaim','templateVersion','ruleVersion','mappingVersion','selectedSheets','object','entries','differences','contributors','risk','baseReleaseId','media']<>'{}'::jsonb
    OR NOT p_material ?& ARRAY['canonicalEncodingVersion','scope','sourceVersion','sourceClaim','templateVersion','ruleVersion','mappingVersion','selectedSheets','object','entries','differences','contributors','risk','baseReleaseId','media']
    OR jsonb_typeof(p_material->'entries') IS DISTINCT FROM 'array' OR jsonb_typeof(p_material->'differences') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_material->'contributors') IS DISTINCT FROM 'array' OR p_material->'media' IS DISTINCT FROM '[]'::jsonb
    OR jsonb_typeof(p_material->'object') IS DISTINCT FROM 'object' OR (p_material->'object')-ARRAY['objectId','sha256','bytes','mime','sourceId']<>'{}'::jsonb
    OR jsonb_typeof(p_material->'sourceClaim') IS DISTINCT FROM 'object' OR (p_material->'sourceClaim')-ARRAY['versionKind','versionValue','acquisition','fileSha256']<>'{}'::jsonb
    OR jsonb_typeof(p_material->'risk') IS DISTINCT FROM 'object' OR (p_material->'risk')-ARRAY['policyVersion','level','reasons','explicitDisableCount','sameSourceDisabledLast24Hours','evaluatedAt']<>'{}'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE='ZA001',MESSAGE='FILE_INVALID'; END IF;
  IF jsonb_array_length(p_material->'entries') NOT BETWEEN 1 AND 5000 OR jsonb_array_length(p_material->'differences')>5000
    OR (SELECT jsonb_agg(x ORDER BY x) FROM jsonb_array_elements_text(p_material->'contributors') x) IS DISTINCT FROM
       (SELECT jsonb_agg(x ORDER BY x) FROM unnest(j.contributor_ids) x) THEN
    RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='MATERIAL_CHANGED'; END IF;
  FOR entry_data IN SELECT x FROM jsonb_array_elements(p_material->'entries') x LOOP
    IF jsonb_typeof(entry_data) IS DISTINCT FROM 'object' OR entry_data-ARRAY['businessEntryId','scriptVersion','operation','title','answerText','questions','productRefs','scenarioRefs','effectiveFrom','effectiveTo','applicabilityNote','familySourceId','familyBusinessEntryId','brandNonOverridable','category','internalNote','riskNote','attachmentNote']<>'{}'::jsonb
      OR NOT entry_data ?& ARRAY['businessEntryId','scriptVersion','operation','title','answerText','questions','productRefs','scenarioRefs','effectiveFrom','effectiveTo','applicabilityNote','familySourceId','familyBusinessEntryId','brandNonOverridable','category','internalNote','riskNote','attachmentNote']
      OR jsonb_typeof(entry_data->'questions') IS DISTINCT FROM 'array' OR jsonb_typeof(entry_data->'productRefs') IS DISTINCT FROM 'array' OR jsonb_typeof(entry_data->'scenarioRefs') IS DISTINCT FROM 'array'
      OR entry_data->>'operation' NOT IN ('upsert','disable') OR entry_data->'attachmentNote' IS DISTINCT FROM '""'::jsonb THEN
      RAISE EXCEPTION USING ERRCODE='ZA001',MESSAGE='FILE_INVALID'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(entry_data->'questions') q WHERE jsonb_typeof(q) IS DISTINCT FROM 'object'
      OR q-ARRAY['id','version','text','active']<>'{}'::jsonb OR NOT q ?& ARRAY['id','version','text','active'])
      OR EXISTS (SELECT 1 FROM jsonb_array_elements((entry_data->'productRefs')||(entry_data->'scenarioRefs')) q WHERE jsonb_typeof(q) IS DISTINCT FROM 'object'
      OR q-ARRAY['id','displayVersion']<>'{}'::jsonb OR NOT q ?& ARRAY['id','displayVersion']) THEN
      RAISE EXCEPTION USING ERRCODE='ZA001',MESSAGE='FILE_INVALID'; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_material->'differences') d WHERE jsonb_typeof(d) IS DISTINCT FROM 'object'
    OR d-ARRAY['businessEntryId','change','previousVersion','nextVersion','beforeDigest','afterDigest']<>'{}'::jsonb
    OR NOT d ?& ARRAY['businessEntryId','change','previousVersion','nextVersion','beforeDigest','afterDigest']) THEN
    RAISE EXCEPTION USING ERRCODE='ZA001',MESSAGE='FILE_INVALID'; END IF;
  SELECT * INTO o FROM content_intake.objects WHERE object_id=j.object_id AND source_id=j.source_id AND actor_id=p_actor AND purpose='input';
  IF NOT FOUND OR p_material->'object' IS DISTINCT FROM jsonb_build_object('objectId',o.object_id,'sha256',o.sha256,'bytes',o.bytes,'mime',o.mime,'sourceId',o.source_id)
    OR p_material->'baseReleaseId' IS DISTINCT FROM coalesce(to_jsonb(j.base_release_id),'null'::jsonb) THEN
    RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='MATERIAL_CHANGED'; END IF;
  v_encoded:=public.jsonb_jcs(p_material);
  p_media:=content_intake.adopt_sop_payloads(p_actor,p_job,p_media);
  IF j.state='validated' THEN
    SELECT * INTO old FROM content_intake.candidate_versions WHERE candidate_id=j.result_candidate_id AND version=j.result_candidate_version;
    IF NOT FOUND OR old.material IS DISTINCT FROM p_material THEN RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='MATERIAL_CHANGED'; END IF;
    PERFORM content_intake.stage_sop_candidate_assets(p_actor,old.candidate_id,old.version,p_rows,p_media);
    RETURN jsonb_build_object('candidateId',old.candidate_id,'version',old.version,'digest',old.digest,'validUntil',v_until);
  END IF;
  IF j.state='reading' THEN UPDATE content_intake.parse_jobs SET state='parsing' WHERE job_id=p_job; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('cs_ai_content_publish'));
  IF j.base_release_id IS DISTINCT FROM (SELECT current_release_id FROM public.content_current WHERE id=1) THEN
    RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='BASE_CHANGED'; END IF;
  IF j.base_release_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM content_intake.release_catalogs WHERE release_id=j.base_release_id) THEN
    RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='MODE_CONFLICT'; END IF;
  IF j.expected_prior_id IS NOT NULL THEN
    SELECT * INTO old FROM content_intake.candidate_versions WHERE candidate_id=j.expected_prior_id AND version=j.expected_prior_version FOR UPDATE;
    IF NOT FOUND OR old.source_id<>j.source_id OR old.digest<>j.expected_prior_digest OR old.state NOT IN ('awaiting-evidence','ready') THEN
      RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='MATERIAL_CHANGED'; END IF;
    IF EXISTS (SELECT 1 FROM content_intake.write_attempts WHERE candidate_id=old.candidate_id AND candidate_version=old.version AND action='publish' AND state IN ('pending','unknown')) THEN
      RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='COMMIT_UNKNOWN'; END IF;
    v_id:=old.candidate_id; v_version:=old.version+1;
    UPDATE content_intake.candidate_versions SET state='invalidated',revocation_generation=revocation_generation+1,updated_at=clock_timestamp()
      WHERE candidate_id=old.candidate_id AND version=old.version;
  ELSE v_id:='candidate_'||pg_catalog.gen_random_uuid()::text; v_version:=1;
  END IF;
  -- A parser cannot silently omit a published source entry from a full catalog.
  IF EXISTS (SELECT 1 FROM content_intake.release_lineage l WHERE l.release_id=j.base_release_id AND l.source_id=j.source_id
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_material->'entries') e WHERE e->>'businessEntryId'=l.business_entry_id)) THEN
    RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='MATERIAL_CHANGED'; END IF;
  INSERT INTO content_intake.candidate_versions(candidate_id,version,source_id,scope_id,source_version,object_id,file_sha256,actor_id,base_release_id,
    canonical_encoding,canonical_material,material,risk,explicit_disable_count,created_at,updated_at,publication_policy)
    VALUES(v_id,v_version,j.source_id,s.scope_id,j.source_version,o.object_id,o.sha256,p_actor,j.base_release_id,'candidate-p1.1',v_encoded,p_material,
      p_material#>>'{risk,level}',(p_material#>>'{risk,explicitDisableCount}')::int,clock_timestamp(),clock_timestamp(),'direct-v1');
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_material->'entries') e CROSS JOIN LATERAL jsonb_array_elements((e->'productRefs')||(e->'scenarioRefs')) ref
    WHERE NOT EXISTS (SELECT 1 FROM content_intake.vocabulary v JOIN content_intake.vocabulary_displays d USING(vocabulary_id)
      JOIN content_intake.scopes scope ON scope.scope_id=v.scope_id JOIN content_intake.scopes current ON current.scope_id=s.scope_id
      WHERE v.vocabulary_id=ref->>'id' AND d.display_version=(ref->>'displayVersion')::bigint AND v.active
      AND scope.tenant_id=current.tenant_id AND scope.app_id=current.app_id AND scope.brand_id=current.brand_id AND scope.domain=current.domain
      AND (scope.shop_id IS NULL OR scope.shop_id IS NOT DISTINCT FROM current.shop_id))) THEN
    RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='SOURCE_MISMATCH'; END IF;
  INSERT INTO content_intake.candidate_vocabulary SELECT DISTINCT v_id,v_version,ref->>'id',(ref->>'displayVersion')::bigint
    FROM jsonb_array_elements(p_material->'entries') e CROSS JOIN LATERAL jsonb_array_elements((e->'productRefs')||(e->'scenarioRefs')) ref;
  PERFORM content_intake.stage_sop_candidate_assets(p_actor,v_id,v_version,p_rows,p_media);
  UPDATE content_intake.parse_jobs SET state='validated',finished_at=clock_timestamp(),result_candidate_id=v_id,result_candidate_version=v_version WHERE job_id=p_job;
  v_until:=content_intake.authorization_deadline(p_actor,'import',s.scope_id,s.source_id,clock_timestamp());
  IF v_until IS NULL THEN RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='SCOPE_DENIED'; END IF;
  RETURN jsonb_build_object('candidateId',v_id,'version',v_version,'digest',encode(public.digest(v_encoded,'sha256'),'hex'),'validUntil',v_until);
END $$;
ALTER FUNCTION content_intake.freeze_sop_parsed_candidate(text,text,jsonb,jsonb,jsonb) OWNER TO intake_runtime_fn_owner;
REVOKE ALL ON FUNCTION content_intake.freeze_sop_parsed_candidate(text,text,jsonb,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION content_intake.freeze_sop_parsed_candidate(text,text,jsonb,jsonb,jsonb) TO intake_business;

-- New command; the old media-only delete remains inaccessible to application roles.
CREATE FUNCTION content_intake.revise_unused_sop_row(p_actor text,p_id text,p_version bigint,p_digest text,p_row text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c content_intake.candidate_versions; v_entry text; v_material jsonb; v_encoded text;
  v_until timestamptz; v_removed content_intake.identifier[]; v_new bigint; v_contributors jsonb; v_content_version jsonb; v_deleted_at timestamptz;
BEGIN
  PERFORM backend_review.lock_content();
  SELECT * INTO c FROM content_intake.candidate_versions WHERE candidate_id=p_id AND version=p_version FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='SCOPE_DENIED'; END IF;
  v_until:=content_intake.authorization_deadline(p_actor,'candidate-cancel',c.scope_id,c.source_id,clock_timestamp());
  IF v_until IS NULL THEN RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='SCOPE_DENIED'; END IF;
  IF c.state='published' THEN RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='ALREADY_PUBLISHED'; END IF;
  IF c.state='publishing' OR EXISTS (SELECT 1 FROM content_intake.write_attempts WHERE candidate_id=p_id
    AND candidate_version=p_version AND action='publish' AND state IN ('pending','unknown')) THEN
    RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='COMMIT_UNKNOWN'; END IF;
  IF c.state NOT IN ('awaiting-evidence','ready') OR c.digest IS DISTINCT FROM p_digest OR c.publication_policy<>'direct-v1' THEN
    RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='MATERIAL_CHANGED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM content_intake.sources s WHERE s.source_id=c.source_id
      AND s.current_mapping_version=c.source_version AND s.mode='v2-preview') THEN
    RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='SOURCE_MISMATCH'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('cs_ai_content_publish'));
  IF c.base_release_id IS DISTINCT FROM (SELECT current_release_id FROM public.content_current WHERE id=1) THEN
    RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='BASE_CHANGED'; END IF;
  SELECT business_entry_id INTO v_entry FROM content_intake.sop_candidate_rows
    WHERE candidate_id=p_id AND candidate_version=p_version AND row_id=p_row;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='SCOPE_DENIED'; END IF;
  SELECT content_version INTO v_content_version FROM content_intake.sop_asset_registrations WHERE candidate_id=p_id AND candidate_version=p_version;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='MATERIAL_CHANGED'; END IF;
  -- Protect text-only as well as media-backed published rows, including history.
  IF EXISTS (SELECT 1 FROM content_intake.release_lineage WHERE source_id=c.source_id AND business_entry_id=v_entry)
    OR EXISTS (SELECT 1 FROM content_intake.sop_release_media WHERE source_id=c.source_id AND row_id=p_row)
    OR EXISTS (SELECT 1 FROM content_intake.sop_candidate_media cm JOIN content_intake.sop_media_objects o USING(media_object_id)
      WHERE cm.candidate_id=p_id AND cm.candidate_version=p_version AND cm.row_id=p_row
        AND (o.adopted_at IS NOT NULL OR o.state IN ('adopted','released'))) THEN
    RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='ALREADY_PUBLISHED'; END IF;
  -- Removing the last unused row cancels the upload. Its immutable history stays;
  -- no empty, publishable full-catalog revision is created.
  IF jsonb_array_length(c.material->'entries')=1 THEN
    UPDATE content_intake.candidate_versions SET state='cancelled',revocation_generation=revocation_generation+1,updated_at=clock_timestamp()
      WHERE candidate_id=p_id AND version=p_version;
    v_new:=c.version; v_encoded:=c.canonical_material;
  ELSE
  v_material:=jsonb_set(c.material,'{entries}',(SELECT jsonb_agg(e ORDER BY ord)
    FROM jsonb_array_elements(c.material->'entries') WITH ORDINALITY AS x(e,ord) WHERE e->>'businessEntryId'<>v_entry));
  v_material:=jsonb_set(v_material,'{differences}',coalesce((SELECT jsonb_agg(e ORDER BY ord)
    FROM jsonb_array_elements(c.material->'differences') WITH ORDINALITY AS x(e,ord) WHERE e->>'businessEntryId'<>v_entry),'[]'::jsonb));
  -- Retain conservative risk classification; never reuse the previous quality gate.
  v_material:=jsonb_set(v_material,'{risk,explicitDisableCount}',to_jsonb((SELECT count(*)::int FROM jsonb_array_elements(v_material->'differences') e WHERE e->>'change'='disable')));
  SELECT jsonb_agg(x ORDER BY x COLLATE "C") INTO v_contributors FROM
    (SELECT DISTINCT jsonb_array_elements_text(c.material->'contributors') AS x UNION SELECT p_actor) q;
  v_material:=jsonb_set(v_material,'{contributors}',v_contributors);
  v_encoded:=public.jsonb_jcs(v_material); v_new:=c.version+1;
  UPDATE content_intake.candidate_versions SET state='invalidated',revocation_generation=revocation_generation+1,updated_at=clock_timestamp()
    WHERE candidate_id=p_id AND version=p_version;
  INSERT INTO content_intake.candidate_versions(candidate_id,version,source_id,scope_id,source_version,object_id,file_sha256,actor_id,
    base_release_id,canonical_encoding,canonical_material,material,risk,explicit_disable_count,created_at,updated_at,publication_policy)
    VALUES(p_id,v_new,c.source_id,c.scope_id,c.source_version,c.object_id,c.file_sha256,p_actor,c.base_release_id,c.canonical_encoding,
      v_encoded,v_material,c.risk,(v_material#>>'{risk,explicitDisableCount}')::integer,clock_timestamp(),clock_timestamp(),c.publication_policy);
  INSERT INTO content_intake.sop_asset_registrations VALUES(p_id,v_new,NULL,v_content_version);
  INSERT INTO content_intake.candidate_vocabulary SELECT p_id,v_new,vocabulary_id,display_version
    FROM content_intake.candidate_vocabulary WHERE candidate_id=p_id AND candidate_version=p_version;
  INSERT INTO content_intake.sop_candidate_rows SELECT p_id,v_new,source_id,row_id,business_entry_id
    FROM content_intake.sop_candidate_rows WHERE candidate_id=p_id AND candidate_version=p_version AND row_id<>p_row;
  INSERT INTO content_intake.sop_candidate_media SELECT p_id,v_new,source_id,media_object_id,sheet_name,row_number,column_number,row_id,ordinal,sha256,mime,bytes
    FROM content_intake.sop_candidate_media WHERE candidate_id=p_id AND candidate_version=p_version AND row_id<>p_row;
  END IF;
  SELECT coalesce(array_agg(media_object_id),ARRAY[]::content_intake.identifier[]) INTO v_removed
    FROM content_intake.sop_candidate_media WHERE candidate_id=p_id AND candidate_version=p_version AND row_id=p_row;
  DELETE FROM content_intake.sop_candidate_media WHERE candidate_id=p_id AND candidate_version=p_version AND row_id=p_row;
  v_deleted_at:=clock_timestamp();
  UPDATE content_intake.sop_media_objects o SET state='discarded',discarded_at=v_deleted_at
    WHERE o.media_object_id=ANY(v_removed) AND o.state='staged' AND o.adopted_at IS NULL
    AND NOT EXISTS(SELECT 1 FROM content_intake.sop_candidate_media m WHERE m.media_object_id=o.media_object_id)
    AND NOT EXISTS(SELECT 1 FROM content_intake.sop_release_media m WHERE m.media_object_id=o.media_object_id);
  INSERT INTO content_intake.sop_row_deletion_events(candidate_id,candidate_version,source_id,row_id,actor_id,content_version,deleted_at,media)
    VALUES(p_id,p_version,c.source_id,p_row,p_actor,v_content_version,v_deleted_at,
      (SELECT coalesce(jsonb_agg(jsonb_build_object('mediaObjectId',o.media_object_id,'sha256',o.sha256,'bytes',o.bytes,'mime',o.mime,
        'state',o.state,'discardedAt',o.discarded_at,'adoptedAt',o.adopted_at) ORDER BY o.media_object_id),'[]'::jsonb)
        FROM content_intake.sop_media_objects o WHERE o.media_object_id=ANY(v_removed)));
  RETURN jsonb_build_object('key',jsonb_build_object('candidateId',p_id,'version',v_new,'digest',encode(public.digest(v_encoded,'sha256'),'hex')),
    'validUntil',v_until,'rowIds',CASE WHEN v_new=c.version THEN '[]'::jsonb ELSE
      (SELECT jsonb_agg(row_id ORDER BY row_id COLLATE "C") FROM content_intake.sop_candidate_rows WHERE candidate_id=p_id AND candidate_version=v_new) END);
END $$;
ALTER FUNCTION content_intake.revise_unused_sop_row(text,text,bigint,text,text) OWNER TO intake_runtime_fn_owner;
REVOKE ALL ON FUNCTION content_intake.revise_unused_sop_row(text,text,bigint,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION content_intake.revise_unused_sop_row(text,text,bigint,text,text) TO intake_business;
REVOKE ALL ON FUNCTION content_intake.delete_unused_sop_row(content_intake.identifier,content_intake.version,text) FROM intake_business;


-- Every supported writer inserts lineage. This statement trigger is the sole
-- image publication owner; rollback/inherit use exact historical candidate rows.
CREATE FUNCTION content_intake.project_sop_release_media() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  -- Classify against the captured source version, never a newer source mapping.
  IF EXISTS(SELECT 1 FROM sop_new_lineage l JOIN content_intake.candidate_versions c ON c.candidate_id=l.candidate_id AND c.version=l.candidate_version
    JOIN content_intake.source_mappings m ON m.source_id=c.source_id AND m.version=c.source_version
    JOIN content_intake.scopes s ON s.scope_id=c.scope_id
    WHERE (s.domain='sop' OR m.template_version='sop-v1' OR m.rule_version='sop-not-imported' OR m.mapping_version='sop-not-imported')
      AND (NOT EXISTS(SELECT 1 FROM content_intake.sop_asset_registrations a WHERE a.candidate_id=c.candidate_id AND a.candidate_version=c.version)
      OR NOT EXISTS(SELECT 1 FROM content_intake.sop_candidate_rows r WHERE r.candidate_id=l.candidate_id AND r.candidate_version=l.candidate_version AND r.source_id=l.source_id AND r.business_entry_id=l.business_entry_id))) THEN
    RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='MATERIAL_CHANGED'; END IF;
  IF EXISTS(SELECT 1 FROM sop_new_lineage l JOIN content_intake.candidate_versions c ON c.candidate_id=l.candidate_id AND c.version=l.candidate_version
    JOIN content_intake.source_mappings m ON m.source_id=c.source_id AND m.version=c.source_version JOIN content_intake.scopes s ON s.scope_id=c.scope_id
    WHERE NOT (s.domain='sop' OR m.template_version='sop-v1' OR m.rule_version='sop-not-imported' OR m.mapping_version='sop-not-imported')
    AND EXISTS(SELECT 1 FROM content_intake.sop_candidate_media image WHERE image.candidate_id=c.candidate_id AND image.candidate_version=c.version)) THEN
    RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='MATERIAL_CHANGED'; END IF;
  -- Expand each candidate once, then verify all inserted identities in a set.
  IF EXISTS(WITH selected AS (SELECT DISTINCT candidate_id,candidate_version FROM sop_new_lineage), entries AS MATERIALIZED (
    SELECT c.candidate_id,c.version,e FROM selected x JOIN content_intake.candidate_versions c ON c.candidate_id=x.candidate_id AND c.version=x.candidate_version
    CROSS JOIN LATERAL jsonb_array_elements(c.material->'entries') e)
    SELECT 1 FROM sop_new_lineage l JOIN content_intake.sop_candidate_rows r ON r.candidate_id=l.candidate_id AND r.candidate_version=l.candidate_version AND r.source_id=l.source_id AND r.business_entry_id=l.business_entry_id
    WHERE NOT EXISTS(SELECT 1 FROM entries WHERE candidate_id=l.candidate_id AND version=l.candidate_version AND e->>'businessEntryId'=l.business_entry_id AND (e->>'scriptVersion')::bigint=l.script_version)) THEN
    RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='MATERIAL_CHANGED'; END IF;
  IF EXISTS(SELECT 1 FROM sop_new_lineage l JOIN content_intake.sop_candidate_rows r ON r.candidate_id=l.candidate_id AND r.candidate_version=l.candidate_version AND r.source_id=l.source_id AND r.business_entry_id=l.business_entry_id
    JOIN content_intake.sop_candidate_media m ON m.candidate_id=r.candidate_id AND m.candidate_version=r.candidate_version AND m.source_id=r.source_id AND m.row_id=r.row_id
    JOIN content_intake.sop_media_objects o ON o.media_object_id=m.media_object_id
    LEFT JOIN content_intake.objects p ON p.object_id=o.payload_object_id
    LEFT JOIN content_intake.object_reservations reservation ON reservation.object_id=p.object_id
    WHERE o.state='discarded' OR p.object_id IS NULL OR p.purpose<>'sop-media' OR reservation.state IS DISTINCT FROM 'adopted'
      OR p.source_id<>m.source_id OR p.sha256<>m.sha256 OR p.bytes<>m.bytes OR p.mime<>m.mime) THEN
    RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='MATERIAL_CHANGED'; END IF;
  INSERT INTO content_intake.sop_release_media(release_id,candidate_id,candidate_version,source_id,media_object_id,sheet_name,row_number,column_number,row_id,ordinal,sha256,mime,bytes)
    SELECT l.release_id,m.candidate_id,m.candidate_version,m.source_id,m.media_object_id,m.sheet_name,m.row_number,m.column_number,m.row_id,m.ordinal,m.sha256,m.mime,m.bytes
    FROM sop_new_lineage l JOIN content_intake.sop_candidate_rows r ON r.candidate_id=l.candidate_id AND r.candidate_version=l.candidate_version AND r.source_id=l.source_id AND r.business_entry_id=l.business_entry_id
    JOIN content_intake.sop_candidate_media m ON m.candidate_id=r.candidate_id AND m.candidate_version=r.candidate_version AND m.source_id=r.source_id AND m.row_id=r.row_id;
  UPDATE content_intake.sop_media_objects o SET state='adopted',adopted_at=clock_timestamp()
    WHERE o.state='staged' AND EXISTS(SELECT 1 FROM content_intake.sop_release_media m JOIN sop_new_lineage l
      ON l.release_id=m.release_id AND l.candidate_id=m.candidate_id AND l.candidate_version=m.candidate_version AND l.source_id=m.source_id
      WHERE m.media_object_id=o.media_object_id);
  RETURN NULL;
END $$;
ALTER FUNCTION content_intake.project_sop_release_media() OWNER TO intake_runtime_fn_owner;
REVOKE ALL ON FUNCTION content_intake.project_sop_release_media() FROM PUBLIC;
CREATE TRIGGER project_sop_release_media AFTER INSERT ON content_intake.release_lineage
  REFERENCING NEW TABLE AS sop_new_lineage FOR EACH STATEMENT EXECUTE FUNCTION content_intake.project_sop_release_media();
CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON content_intake.sop_release_media
  FOR EACH ROW EXECUTE FUNCTION content_intake.immutable_history();

-- Only internal metadata leaves this function; payload IDs never leave the API.
-- The caller still owns full scopes/binding/deadline checks and row applicability.
CREATE FUNCTION content_intake.read_sop_release_assets(p_actor text,p_entitlement_hash text,p_session_token_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE lease content_intake.entitlements; result jsonb;
BEGIN
  SELECT e.* INTO lease FROM content_intake.entitlements e JOIN content_intake.entitlement_contexts ctx USING(entitlement_hash)
    JOIN content_intake.principals p ON p.principal_id=e.principal_id AND p.revocation_generation=e.principal_generation
    JOIN public.snapshot_offline_leases offline USING(lease_token_hash)
    JOIN backend_identity.sessions session ON session.token_hash=ctx.session_token_hash
    JOIN backend_identity.subject_bindings binding ON binding.binding_id=session.binding_id AND binding.user_id=e.user_id
    WHERE e.entitlement_hash=p_entitlement_hash AND e.principal_id=p_actor AND ctx.session_token_hash=p_session_token_hash
      AND e.issued_at<=clock_timestamp() AND e.valid_until>clock_timestamp() AND offline.expires_at>clock_timestamp()
      AND session.revoked_at IS NULL AND session.expires_at>clock_timestamp() AND binding.enabled
      AND NOT EXISTS(SELECT 1 FROM content_intake.release_revocations revoked WHERE revoked.release_id=e.release_id);
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='SCOPE_DENIED'; END IF;
  IF EXISTS(SELECT 1 FROM content_intake.sop_release_media m JOIN content_intake.entitlement_scopes es ON es.source_id=m.source_id AND es.entitlement_hash=lease.entitlement_hash
    JOIN content_intake.sources s ON s.source_id=m.source_id JOIN content_intake.sop_media_objects o ON o.media_object_id=m.media_object_id
    WHERE m.release_id=lease.release_id AND content_intake.authorization_deadline(p_actor,'query',s.scope_id,s.source_id,clock_timestamp()) IS NOT NULL
      AND (o.payload_object_id IS NULL OR o.state NOT IN ('adopted','released'))) THEN
    RAISE EXCEPTION USING ERRCODE='ZA003',MESSAGE='MATERIAL_CHANGED'; END IF;
  WITH chosen AS (SELECT DISTINCT m.candidate_id,m.candidate_version FROM content_intake.sop_release_media m
    JOIN content_intake.entitlement_scopes es ON es.source_id=m.source_id AND es.entitlement_hash=lease.entitlement_hash WHERE m.release_id=lease.release_id),
  entries AS MATERIALIZED(SELECT c.candidate_id,c.version,e FROM chosen x JOIN content_intake.candidate_versions c ON c.candidate_id=x.candidate_id AND c.version=x.candidate_version CROSS JOIN LATERAL jsonb_array_elements(c.material->'entries') e)
  SELECT coalesce(jsonb_agg(jsonb_build_object('objectId',m.media_object_id,'payloadObjectId',o.payload_object_id,'sha256',m.sha256,'bytes',m.bytes,'mime',m.mime,
    'sourceId',m.source_id,'rowId',m.row_id,'businessEntryId',r.business_entry_id,'productRefIds',(SELECT coalesce(jsonb_agg(x->>'id'),'[]') FROM jsonb_array_elements(e->'productRefs') x),
    'scenarioRefIds',(SELECT coalesce(jsonb_agg(x->>'id'),'[]') FROM jsonb_array_elements(e->'scenarioRefs') x),'familySourceId',e->>'familySourceId',
    'operation',e->>'operation','effectiveFrom',e->'effectiveFrom','effectiveTo',e->'effectiveTo') ORDER BY m.source_id,m.row_id,m.ordinal,m.media_object_id),'[]') INTO result
  FROM content_intake.sop_release_media m JOIN content_intake.sop_media_objects o ON o.media_object_id=m.media_object_id
    JOIN content_intake.sop_candidate_rows r ON r.candidate_id=m.candidate_id AND r.candidate_version=m.candidate_version AND r.source_id=m.source_id AND r.row_id=m.row_id
    JOIN entries ON entries.candidate_id=m.candidate_id AND entries.version=m.candidate_version AND e->>'businessEntryId'=r.business_entry_id
    JOIN content_intake.entitlement_scopes es ON es.entitlement_hash=lease.entitlement_hash AND es.source_id=m.source_id
    JOIN content_intake.sources s ON s.source_id=m.source_id
  WHERE m.release_id=lease.release_id AND e->>'operation'='upsert' AND (e->>'effectiveFrom')::timestamptz<=lease.issued_at
    AND (e->>'effectiveTo' IS NULL OR (e->>'effectiveTo')::timestamptz>lease.issued_at)
    AND content_intake.authorization_deadline(p_actor,'query',s.scope_id,s.source_id,clock_timestamp()) IS NOT NULL;
  RETURN jsonb_build_object('items',result);
END $$;
ALTER FUNCTION content_intake.read_sop_release_assets(text,text,text) OWNER TO intake_runtime_fn_owner;
REVOKE ALL ON FUNCTION content_intake.read_sop_release_assets(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION content_intake.read_sop_release_assets(text,text,text) TO intake_usage;

-- Preserve the old stage signature and ACL while matching the successor row key.
CREATE OR REPLACE FUNCTION content_intake.stage_sop_candidate_media(
  p_candidate_id content_intake.identifier,
  p_version content_intake.version,
  p_source_id content_intake.identifier,
  p_actor_id content_intake.identifier,
  p_media_object_id content_intake.identifier,
  p_sha256 content_intake.sha256,
  p_bytes bigint,
  p_mime text,
  p_sheet text,
  p_row integer,
  p_column integer,
  p_ordinal integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = content_intake, public, pg_temp
AS $$
DECLARE
  v_state text;
  v_row_id text := 'sop:' || p_sheet || ':' || p_row::text;
BEGIN
  SELECT state INTO v_state
  FROM content_intake.candidate_versions
  WHERE candidate_id = p_candidate_id AND version = p_version AND source_id = p_source_id;
  IF NOT FOUND OR v_state IN ('published','publishing') THEN
    RAISE EXCEPTION 'SOP_ROW_IN_USE';
  END IF;
  INSERT INTO content_intake.sop_media_objects (media_object_id, source_id, actor_id, sha256, bytes, mime, state, created_at)
  VALUES (p_media_object_id, p_source_id, p_actor_id, p_sha256, p_bytes, p_mime, 'staged', clock_timestamp())
  ON CONFLICT (media_object_id) DO NOTHING;
  INSERT INTO content_intake.sop_candidate_media (
    candidate_id, candidate_version, source_id, media_object_id, sheet_name, row_number, column_number, row_id, ordinal, sha256, mime, bytes
  ) VALUES (
    p_candidate_id, p_version, p_source_id, p_media_object_id, p_sheet, p_row, p_column, v_row_id, p_ordinal, p_sha256, p_mime, p_bytes
  ) ON CONFLICT (candidate_id, candidate_version, row_id, media_object_id, ordinal) DO NOTHING;
END;
$$;
