-- SOP media boundary candidate v1.
-- DRAFT ONLY: additive design for review; not a migration and not runtime-active.
-- The existing content_intake.objects table remains the original XLSX/report store.
-- No application role receives grants from this candidate.
BEGIN;

CREATE TABLE content_intake.sop_media_objects (
  media_object_id content_intake.identifier PRIMARY KEY,
  source_id content_intake.identifier NOT NULL REFERENCES content_intake.sources,
  actor_id content_intake.identifier NOT NULL REFERENCES content_intake.principals,
  tenant_id content_intake.identifier NOT NULL,
  app_id content_intake.identifier NOT NULL,
  object_key TEXT NOT NULL UNIQUE
    CHECK (object_key ~ '^intake/sop-media/[A-Za-z0-9._/-]{1,200}$' AND object_key NOT LIKE '%..%'),
  sha256 content_intake.sha256 NOT NULL,
  bytes BIGINT NOT NULL CHECK (bytes BETWEEN 1 AND 5242880),
  mime TEXT NOT NULL CHECK (mime IN ('image/png','image/jpeg','image/gif')),
  state TEXT NOT NULL CHECK (state IN ('staged','adopted','released','discarded')),
  received_at TIMESTAMPTZ NOT NULL CHECK (isfinite(received_at)),
  adopted_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  UNIQUE (source_id,sha256,bytes,mime),
  UNIQUE (media_object_id,source_id,sha256,bytes,mime),
  FOREIGN KEY (actor_id,tenant_id,app_id)
    REFERENCES content_intake.principals(principal_id,tenant_id,app_id),
  CHECK ((state='staged') = (adopted_at IS NULL AND released_at IS NULL)),
  CHECK ((state='adopted') = (adopted_at IS NOT NULL AND released_at IS NULL)),
  CHECK ((state='released') = (adopted_at IS NOT NULL AND released_at IS NOT NULL)),
  CHECK (state<>'discarded' OR (adopted_at IS NULL AND released_at IS NULL))
);

CREATE TABLE content_intake.sop_candidate_media (
  candidate_id content_intake.identifier NOT NULL,
  candidate_version content_intake.version NOT NULL,
  source_id content_intake.identifier NOT NULL,
  media_object_id content_intake.identifier NOT NULL
    REFERENCES content_intake.sop_media_objects(media_object_id),
  sheet_name TEXT NOT NULL CHECK (length(sheet_name) BETWEEN 1 AND 128),
  row_number INTEGER NOT NULL CHECK (row_number BETWEEN 1 AND 5000),
  column_number INTEGER NOT NULL CHECK (column_number BETWEEN 1 AND 32),
  row_id TEXT NOT NULL CHECK (length(row_id) BETWEEN 1 AND 256),
  ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 1 AND 100),
  sha256 content_intake.sha256 NOT NULL,
  mime TEXT NOT NULL CHECK (mime IN ('image/png','image/jpeg','image/gif')),
  bytes BIGINT NOT NULL CHECK (bytes BETWEEN 1 AND 5242880),
  PRIMARY KEY (candidate_id,candidate_version,media_object_id,ordinal),
  UNIQUE (candidate_id,candidate_version,sheet_name,row_number,column_number,ordinal),
  UNIQUE (candidate_id,candidate_version,source_id,media_object_id,sheet_name,row_number,column_number,row_id,ordinal,sha256,mime),
  FOREIGN KEY (candidate_id,candidate_version,source_id)
    REFERENCES content_intake.candidate_versions(candidate_id,version,source_id),
  FOREIGN KEY (media_object_id,source_id,sha256,bytes,mime)
    REFERENCES content_intake.sop_media_objects(media_object_id,source_id,sha256,bytes,mime),
  CHECK (row_id = 'sop:' || sheet_name || ':' || row_number::text)
);

CREATE TABLE content_intake.sop_release_media (
  release_id TEXT NOT NULL REFERENCES public.content_releases,
  candidate_id content_intake.identifier NOT NULL,
  candidate_version content_intake.version NOT NULL,
  source_id content_intake.identifier NOT NULL,
  media_object_id content_intake.identifier NOT NULL
    REFERENCES content_intake.sop_media_objects(media_object_id),
  sheet_name TEXT NOT NULL CHECK (length(sheet_name) BETWEEN 1 AND 128),
  row_number INTEGER NOT NULL CHECK (row_number BETWEEN 1 AND 5000),
  column_number INTEGER NOT NULL CHECK (column_number BETWEEN 1 AND 32),
  row_id TEXT NOT NULL CHECK (length(row_id) BETWEEN 1 AND 256),
  ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 1 AND 100),
  sha256 content_intake.sha256 NOT NULL,
  mime TEXT NOT NULL CHECK (mime IN ('image/png','image/jpeg','image/gif')),
  PRIMARY KEY (release_id,media_object_id,ordinal),
  FOREIGN KEY (candidate_id,candidate_version,source_id,media_object_id,sheet_name,row_number,column_number,row_id,ordinal,sha256,mime)
    REFERENCES content_intake.sop_candidate_media(candidate_id,candidate_version,source_id,media_object_id,sheet_name,row_number,column_number,row_id,ordinal,sha256,mime),
  CHECK (row_id = 'sop:' || sheet_name || ':' || row_number::text)
);

-- The publish transaction must verify media_object.state='adopted' and the
-- candidate/source/digest pair before inserting sop_release_media. The rollback
-- transaction copies the complete release media set and never mutates history.
-- A referenced adopted/released row is retained; garbage collection is a later
-- approved policy and cannot delete a row with a candidate, release or lease FK.
REVOKE ALL ON TABLE content_intake.sop_media_objects,
  content_intake.sop_candidate_media,
  content_intake.sop_release_media FROM PUBLIC;
COMMIT;
