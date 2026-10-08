-- Shop display directory. Names are not columns on sources and are not read from
-- Feishu contact fields. A registered steward row is the only writer. Absence of
-- that row fails closed. Writing a name does not insert a grant and does not
-- replace content_intake.authorization_deadline.
-- No application role receives EXECUTE or table privileges.

CREATE TABLE content_intake.shop_directory_stewards (
  tenant_id content_intake.identifier NOT NULL,
  app_id content_intake.identifier NOT NULL,
  steward_id content_intake.identifier NOT NULL,
  registered_at TIMESTAMPTZ NOT NULL CHECK (isfinite(registered_at)),
  PRIMARY KEY (tenant_id, app_id),
  FOREIGN KEY (steward_id, tenant_id, app_id)
    REFERENCES content_intake.principals(principal_id, tenant_id, app_id)
);
CREATE FUNCTION content_intake.shop_directory_steward_guard() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHOP_DIRECTORY_STEWARD_REQUIRED';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER shop_directory_steward_immutable
  BEFORE UPDATE OR DELETE ON content_intake.shop_directory_stewards
  FOR EACH ROW EXECUTE FUNCTION content_intake.shop_directory_steward_guard();

CREATE TABLE content_intake.shop_directory_revisions (
  tenant_id content_intake.identifier NOT NULL,
  app_id content_intake.identifier NOT NULL,
  directory_revision content_intake.version NOT NULL,
  PRIMARY KEY (tenant_id, app_id)
);
CREATE TABLE content_intake.shop_displays (
  tenant_id content_intake.identifier NOT NULL,
  app_id content_intake.identifier NOT NULL,
  shop_id content_intake.identifier NOT NULL,
  display_version content_intake.version NOT NULL,
  display_name TEXT NOT NULL,
  directory_revision content_intake.version NOT NULL,
  steward_id content_intake.identifier NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL CHECK (isfinite(recorded_at)),
  PRIMARY KEY (tenant_id, app_id, shop_id, display_version),
  CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 256),
  CHECK (display_name = btrim(display_name)),
  FOREIGN KEY (steward_id, tenant_id, app_id)
    REFERENCES content_intake.principals(principal_id, tenant_id, app_id)
);
CREATE TABLE content_intake.shop_display_current (
  tenant_id content_intake.identifier NOT NULL,
  app_id content_intake.identifier NOT NULL,
  shop_id content_intake.identifier NOT NULL,
  display_version content_intake.version NOT NULL,
  directory_revision content_intake.version NOT NULL,
  PRIMARY KEY (tenant_id, app_id, shop_id),
  FOREIGN KEY (tenant_id, app_id, shop_id, display_version)
    REFERENCES content_intake.shop_displays(tenant_id, app_id, shop_id, display_version)
);

CREATE FUNCTION content_intake.shop_display_guard() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHOP_DISPLAY_IMMUTABLE';
  END IF;
  IF pg_catalog.current_setting('content_intake.directory_write', true) IS DISTINCT FROM 'writing' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHOP_DIRECTORY_STEWARD_REQUIRED';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER shop_display_write
  BEFORE INSERT OR UPDATE OR DELETE ON content_intake.shop_displays
  FOR EACH ROW EXECUTE FUNCTION content_intake.shop_display_guard();

CREATE FUNCTION content_intake.shop_display_current_guard() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHOP_DISPLAY_IMMUTABLE';
  END IF;
  IF pg_catalog.current_setting('content_intake.directory_write', true) IS DISTINCT FROM 'writing' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHOP_DIRECTORY_STEWARD_REQUIRED';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.tenant_id, NEW.app_id, NEW.shop_id) IS DISTINCT FROM (OLD.tenant_id, OLD.app_id, OLD.shop_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHOP_DISPLAY_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER shop_display_current_write
  BEFORE INSERT OR UPDATE OR DELETE ON content_intake.shop_display_current
  FOR EACH ROW EXECUTE FUNCTION content_intake.shop_display_current_guard();

CREATE FUNCTION content_intake.shop_directory_revision_guard() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHOP_DISPLAY_IMMUTABLE';
  END IF;
  IF pg_catalog.current_setting('content_intake.directory_write', true) IS DISTINCT FROM 'writing' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHOP_DIRECTORY_STEWARD_REQUIRED';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.directory_revision IS DISTINCT FROM OLD.directory_revision + 1
      OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.app_id IS DISTINCT FROM OLD.app_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHOP_DIRECTORY_CONFLICT';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER shop_directory_revision_write
  BEFORE INSERT OR UPDATE OR DELETE ON content_intake.shop_directory_revisions
  FOR EACH ROW EXECUTE FUNCTION content_intake.shop_directory_revision_guard();

CREATE FUNCTION content_intake.upsert_shop_display(
  p_actor TEXT, p_tenant TEXT, p_app TEXT, p_shop TEXT, p_display_name TEXT, p_expected_revision BIGINT
) RETURNS JSONB
LANGUAGE plpgsql VOLATILE SET search_path = pg_catalog AS $$
DECLARE
  v_steward content_intake.identifier;
  v_revision content_intake.version;
  v_next_revision content_intake.version;
  v_version content_intake.version;
  v_identifier CONSTANT TEXT := '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$';
BEGIN
  IF p_actor !~ v_identifier OR p_tenant !~ v_identifier OR p_app !~ v_identifier OR p_shop !~ v_identifier
     OR p_display_name IS NULL OR p_display_name IS DISTINCT FROM btrim(p_display_name)
     OR char_length(p_display_name) < 1 OR char_length(p_display_name) > 256 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHOP_DISPLAY_INVALID';
  END IF;
  SELECT s.steward_id INTO v_steward
  FROM content_intake.shop_directory_stewards s
  JOIN content_intake.principals p
    ON p.principal_id = p_actor AND p.tenant_id = s.tenant_id AND p.app_id = s.app_id
  WHERE s.tenant_id = p_tenant AND s.app_id = p_app AND s.steward_id = p_actor;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHOP_DIRECTORY_STEWARD_REQUIRED';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_tenant || ':' || p_app, 0));
  SELECT r.directory_revision INTO v_revision
  FROM content_intake.shop_directory_revisions r
  WHERE r.tenant_id = p_tenant AND r.app_id = p_app
  FOR UPDATE;
  IF NOT FOUND THEN
    IF p_expected_revision IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHOP_DIRECTORY_CONFLICT';
    END IF;
    v_next_revision := 1;
  ELSIF p_expected_revision IS DISTINCT FROM v_revision THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHOP_DIRECTORY_CONFLICT';
  ELSE
    v_next_revision := v_revision + 1;
  END IF;
  SELECT coalesce(max(d.display_version), 0) + 1 INTO v_version
  FROM content_intake.shop_displays d
  WHERE d.tenant_id = p_tenant AND d.app_id = p_app AND d.shop_id = p_shop;
  PERFORM pg_catalog.set_config('content_intake.directory_write', 'writing', true);
  INSERT INTO content_intake.shop_displays(
    tenant_id, app_id, shop_id, display_version, display_name, directory_revision, steward_id, recorded_at
  ) VALUES (
    p_tenant, p_app, p_shop, v_version, p_display_name, v_next_revision, p_actor, pg_catalog.clock_timestamp()
  );
  INSERT INTO content_intake.shop_display_current(tenant_id, app_id, shop_id, display_version, directory_revision)
  VALUES (p_tenant, p_app, p_shop, v_version, v_next_revision)
  ON CONFLICT (tenant_id, app_id, shop_id) DO UPDATE
    SET display_version = EXCLUDED.display_version,
        directory_revision = EXCLUDED.directory_revision;
  IF v_revision IS NULL THEN
    INSERT INTO content_intake.shop_directory_revisions(tenant_id, app_id, directory_revision)
    VALUES (p_tenant, p_app, v_next_revision);
  ELSE
    UPDATE content_intake.shop_directory_revisions
       SET directory_revision = v_next_revision
     WHERE tenant_id = p_tenant AND app_id = p_app;
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'shopId', p_shop,
    'displayName', p_display_name,
    'displayVersion', v_version,
    'directoryRevision', v_next_revision
  );
END;
$$;

CREATE FUNCTION content_intake.read_shop_directory(
  p_principal TEXT, p_session_hash TEXT, p_at TIMESTAMPTZ, p_cursor TEXT, p_limit INTEGER
) RETURNS JSONB
LANGUAGE plpgsql VOLATILE SET search_path = pg_catalog AS $$
DECLARE
  v_tenant content_intake.identifier;
  v_app content_intake.identifier;
  v_facts content_intake.version;
  v_revocation content_intake.generation;
  v_fact_until TIMESTAMPTZ;
  v_revision BIGINT := 0;
  v_digest TEXT;
  v_deadline TIMESTAMPTZ;
  v_count BIGINT;
  v_visible JSONB;
  v_limit INTEGER;
  v_cursor_ord BIGINT := 0;
  v_match TEXT[];
  v_cursor_session TEXT;
  v_cursor_facts BIGINT;
  v_cursor_revocation BIGINT;
  v_cursor_revision BIGINT;
  v_cursor_digest TEXT;
  v_cursor_deadline_us BIGINT;
  v_cursor_shop TEXT;
  v_boundary content_intake.identifier;
  v_items JSONB;
  v_len INTEGER;
  v_last TEXT;
  v_after_count BIGINT;
  v_deadline_us BIGINT;
  v_next TEXT;
BEGIN
  IF p_principal IS NULL OR p_session_hash IS NULL OR p_at IS NULL OR NOT isfinite(p_at)
     OR p_session_hash !~ '^[0-9a-f]{64}$'
     OR (p_cursor IS NOT NULL AND (octet_length(p_cursor) = 0 OR octet_length(p_cursor) > 512))
     OR (p_limit IS NOT NULL AND (p_limit < 1 OR p_limit > 100)) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHOP_DIRECTORY_CURSOR';
  END IF;
  v_limit := coalesce(p_limit, 50);
  SELECT p.tenant_id, p.app_id, p.current_facts_version, p.revocation_generation, f.valid_until
    INTO v_tenant, v_app, v_facts, v_revocation, v_fact_until
  FROM content_intake.principals p
  JOIN content_intake.principal_facts f
    ON f.principal_id = p.principal_id AND f.facts_version = p.current_facts_version
  WHERE p.principal_id = p_principal
    AND f.enabled AND f.checked_at <= p_at AND p_at < f.valid_until;
  IF NOT FOUND THEN
    IF NOT EXISTS (SELECT 1 FROM content_intake.principals WHERE principal_id = p_principal) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHOP_DIRECTORY_SESSION';
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHOP_DIRECTORY_EXPIRED';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(v_tenant || ':' || v_app, 0));
  SELECT r.directory_revision INTO v_revision
  FROM content_intake.shop_directory_revisions r
  WHERE r.tenant_id = v_tenant AND r.app_id = v_app;
  IF NOT FOUND THEN
    v_revision := 0;
  END IF;
  -- One jsonb value, not a temporary table: a pooled session must be able to call
  -- this function again without reusing a dropped relation's cached plan.
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'shopId', q.shop_id,
           'displayName', q.display_name,
           'displayVersion', q.display_version,
           'shopDeadline', q.shop_deadline
         ) ORDER BY q.shop_id COLLATE "C"), '[]'::jsonb)
    INTO v_visible
  FROM (
    SELECT s.shop_id, d.display_name, c.display_version,
           min(content_intake.authorization_deadline(p_principal, 'query', s.scope_id, src.source_id, p_at)) AS shop_deadline
    FROM content_intake.scopes s
    JOIN content_intake.sources src ON src.scope_id = s.scope_id AND src.mode = 'v2-preview'
    LEFT JOIN content_intake.shop_display_current c
      ON c.tenant_id = s.tenant_id AND c.app_id = s.app_id AND c.shop_id = s.shop_id
    LEFT JOIN content_intake.shop_displays d
      ON d.tenant_id = c.tenant_id AND d.app_id = c.app_id AND d.shop_id = c.shop_id
     AND d.display_version = c.display_version
    WHERE s.tenant_id = v_tenant AND s.app_id = v_app AND s.shop_id IS NOT NULL
      AND content_intake.authorization_deadline(p_principal, 'query', s.scope_id, src.source_id, p_at) IS NOT NULL
    GROUP BY s.shop_id, d.display_name, c.display_version
  ) q;
  IF (SELECT count(DISTINCT item->>'shopId') FROM jsonb_array_elements(v_visible) item)
     IS DISTINCT FROM jsonb_array_length(v_visible) THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'SHOP_DIRECTORY_DUPLICATE';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_visible) item
    WHERE item->>'displayName' IS NULL OR item->>'displayVersion' IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHOP_DISPLAY_MISSING';
  END IF;
  SELECT pg_catalog.encode(public.digest(pg_catalog.convert_to(
           coalesce(string_agg(item->>'shopId' || ':' || (item->>'displayVersion'), ','
                    ORDER BY item->>'shopId' COLLATE "C"), ''),
           'UTF8'), 'sha256'), 'hex'),
         min((item->>'shopDeadline')::timestamptz),
         count(*)
    INTO v_digest, v_deadline, v_count
  FROM jsonb_array_elements(v_visible) item;
  IF v_count = 0 THEN
    v_deadline := v_fact_until;
  ELSE
    v_deadline := least(v_fact_until, v_deadline);
  END IF;
  v_deadline_us := (extract(epoch FROM v_deadline) * 1000000)::bigint;
  IF p_cursor IS NOT NULL THEN
    v_match := regexp_match(p_cursor, '^sd1\.([0-9a-f]{64})\.([0-9]+)\.([0-9]+)\.([0-9]+)\.([0-9a-f]{64})\.([0-9]+)\.([0-9]+)\.([A-Za-z0-9][A-Za-z0-9._:-]{0,127})$');
    IF v_match IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHOP_DIRECTORY_CURSOR';
    END IF;
    BEGIN
      v_cursor_session := v_match[1];
      v_cursor_facts := v_match[2]::bigint;
      v_cursor_revocation := v_match[3]::bigint;
      v_cursor_revision := v_match[4]::bigint;
      v_cursor_digest := v_match[5];
      v_cursor_deadline_us := v_match[6]::bigint;
      v_cursor_ord := v_match[7]::bigint;
      v_cursor_shop := v_match[8];
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHOP_DIRECTORY_CURSOR';
    END;
    IF v_cursor_session IS DISTINCT FROM p_session_hash THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHOP_DIRECTORY_SESSION';
    END IF;
    IF v_cursor_facts IS DISTINCT FROM v_facts OR v_cursor_revocation IS DISTINCT FROM v_revocation THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHOP_DIRECTORY_CHANGED';
    END IF;
    IF v_cursor_revision IS DISTINCT FROM v_revision THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHOP_DIRECTORY_CHANGED';
    END IF;
    IF (extract(epoch FROM p_at) * 1000000)::bigint >= v_cursor_deadline_us THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHOP_DIRECTORY_EXPIRED';
    END IF;
    IF v_cursor_digest IS DISTINCT FROM v_digest THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHOP_DIRECTORY_CHANGED';
    END IF;
    BEGIN
      v_boundary := v_visible -> ((v_cursor_ord - 1)::integer) ->> 'shopId';
    EXCEPTION WHEN numeric_value_out_of_range THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHOP_DIRECTORY_CURSOR';
    END;
    IF v_boundary IS NULL OR v_boundary IS DISTINCT FROM v_cursor_shop OR v_cursor_ord < 1 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHOP_DIRECTORY_CURSOR';
    END IF;
  END IF;
  v_after_count := v_count - coalesce(v_cursor_ord, 0);
  SELECT coalesce(jsonb_agg(page.item ORDER BY page.ord), '[]'::jsonb)
    INTO v_items
  FROM (
    SELECT t.ord, t.element - 'shopDeadline' AS item
    FROM jsonb_array_elements(v_visible) WITH ORDINALITY AS t(element, ord)
    WHERE t.ord > coalesce(v_cursor_ord, 0)
    ORDER BY t.ord
    LIMIT v_limit
  ) page;
  v_len := jsonb_array_length(v_items);
  v_next := NULL;
  IF v_after_count > v_limit THEN
    v_last := v_items -> (v_len - 1) ->> 'shopId';
    v_next := 'sd1.' || p_session_hash || '.' || v_facts::text || '.' || v_revocation::text || '.'
      || v_revision::text || '.' || v_digest || '.' || v_deadline_us::text || '.'
      || (coalesce(v_cursor_ord, 0) + v_len)::text || '.' || v_last;
    IF octet_length(v_next) > 512 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHOP_DIRECTORY_CURSOR';
    END IF;
  END IF;
  RETURN jsonb_build_object(
    'items', v_items,
    'nextCursor', v_next,
    'validUntil', to_jsonb(date_trunc('milliseconds', v_deadline))
  );
END;
$$;

REVOKE ALL ON FUNCTION content_intake.shop_directory_steward_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION content_intake.shop_display_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION content_intake.shop_display_current_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION content_intake.shop_directory_revision_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION content_intake.upsert_shop_display(TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION content_intake.read_shop_directory(TEXT, TEXT, TIMESTAMPTZ, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON TABLE content_intake.shop_directory_stewards FROM PUBLIC;
REVOKE ALL ON TABLE content_intake.shop_directory_revisions FROM PUBLIC;
REVOKE ALL ON TABLE content_intake.shop_displays FROM PUBLIC;
REVOKE ALL ON TABLE content_intake.shop_display_current FROM PUBLIC;
