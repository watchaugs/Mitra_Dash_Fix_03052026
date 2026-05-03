-- ════════════════════════════════════════════════════════════════════════════
-- MITRA Dashboard · v4.0 Schema Migration
-- Run AFTER schema.sql and schema_quiz.sql:
--   psql -U postgres -d mitra_dashboard -f db/schema_v4.sql
--
-- This migration:
--   1. Creates uploads tracking table
--   2. Adds icon_path / splash_path to state_apps
--   3. Ensures curriculum_ar_links and curriculum_quiz_links exist
--   4. Ensures curriculum_state_hierarchy exists
--   5. Removes advertisement + geofence route dependencies (tables kept for data)
--   6. Adds helpful views for curriculum summary reports
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Enable extensions ────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ─── Uploads tracking table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS uploads (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  uploaded_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  category        VARCHAR(50) NOT NULL,     -- 'ar_asset', 'quiz_xlsx', 'app_icon', 'app_splash'
  original_name   VARCHAR(255),
  file_path       VARCHAR(512),
  file_size_bytes BIGINT,
  meta            JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_uploads_category ON uploads(category);
CREATE INDEX IF NOT EXISTS idx_uploads_user     ON uploads(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_uploads_created  ON uploads(created_at DESC);

-- ─── Add icon/splash paths to state_apps ─────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE state_apps ADD COLUMN IF NOT EXISTS icon_path   VARCHAR(512);
  ALTER TABLE state_apps ADD COLUMN IF NOT EXISTS splash_path VARCHAR(512);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ─── Ensure curriculum_state_hierarchy table ──────────────────────────────────
CREATE TABLE IF NOT EXISTS curriculum_state_hierarchy (
  state_code   VARCHAR(4) PRIMARY KEY,
  structure    JSONB NOT NULL DEFAULT '[]',
  updated_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Ensure curriculum AR/Quiz link tables ────────────────────────────────────
CREATE TABLE IF NOT EXISTS curriculum_ar_links (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  curriculum_node_id    TEXT NOT NULL,
  asset_id              UUID NOT NULL REFERENCES unity_assets(id) ON DELETE CASCADE,
  linked_by             UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (curriculum_node_id, asset_id)
);

CREATE TABLE IF NOT EXISTS curriculum_quiz_links (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  node_id     UUID REFERENCES curriculum_nodes(id) ON DELETE CASCADE,
  quiz_id     UUID REFERENCES quizzes(id) ON DELETE CASCADE,
  linked_by   UUID REFERENCES users(id),
  linked_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (node_id, quiz_id)
);

CREATE INDEX IF NOT EXISTS idx_car_links_node  ON curriculum_ar_links(curriculum_node_id);
CREATE INDEX IF NOT EXISTS idx_car_links_asset ON curriculum_ar_links(asset_id);
CREATE INDEX IF NOT EXISTS idx_cqz_links_node  ON curriculum_quiz_links(node_id);
CREATE INDEX IF NOT EXISTS idx_cqz_links_quiz  ON curriculum_quiz_links(quiz_id);

-- ─── India States table (if not present) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS india_states (
  id           SERIAL PRIMARY KEY,
  code         VARCHAR(10) UNIQUE NOT NULL,
  name         VARCHAR(100) UNIQUE NOT NULL,
  region       VARCHAR(50),
  capital      VARCHAR(100),
  geojson      JSONB,
  nominatim_id BIGINT,
  last_geo_sync TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS india_districts (
  id            SERIAL PRIMARY KEY,
  state_code    VARCHAR(10) REFERENCES india_states(code) ON DELETE CASCADE,
  name          VARCHAR(150) NOT NULL,
  district_code VARCHAR(20),
  geojson       JSONB,
  nominatim_id  BIGINT,
  last_geo_sync TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (state_code, name)
);

CREATE INDEX IF NOT EXISTS idx_districts_state ON india_districts(state_code);

-- ─── unity_assets column additions ───────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE unity_assets ADD COLUMN IF NOT EXISTS class_name          TEXT;
  ALTER TABLE unity_assets ADD COLUMN IF NOT EXISTS subject             TEXT;
  ALTER TABLE unity_assets ADD COLUMN IF NOT EXISTS topic               TEXT;
  ALTER TABLE unity_assets ADD COLUMN IF NOT EXISTS language            TEXT;
  ALTER TABLE unity_assets ADD COLUMN IF NOT EXISTS title               TEXT;
  ALTER TABLE unity_assets ADD COLUMN IF NOT EXISTS file_format         TEXT;
  ALTER TABLE unity_assets ADD COLUMN IF NOT EXISTS file_size_mb        NUMERIC(12,2);
  ALTER TABLE unity_assets ADD COLUMN IF NOT EXISTS target_apps         JSONB;
  ALTER TABLE unity_assets ADD COLUMN IF NOT EXISTS target_classes      JSONB;
  ALTER TABLE unity_assets ADD COLUMN IF NOT EXISTS target_subjects     JSONB;
  ALTER TABLE unity_assets ADD COLUMN IF NOT EXISTS restrict_login      BOOLEAN DEFAULT TRUE;
  ALTER TABLE unity_assets ADD COLUMN IF NOT EXISTS offline_available   BOOLEAN DEFAULT TRUE;
  ALTER TABLE unity_assets ADD COLUMN IF NOT EXISTS notes               TEXT;
  ALTER TABLE unity_assets ADD COLUMN IF NOT EXISTS expires_at          TIMESTAMPTZ;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Rename old upload paths if needed
UPDATE unity_assets
  SET file_path = REPLACE(file_path, '/uploads/unity/', '/uploads/ar_assets/')
  WHERE file_path LIKE '/uploads/unity/%';

-- ─── View: curriculum_summary ─────────────────────────────────────────────────
CREATE OR REPLACE VIEW vw_curriculum_summary AS
SELECT
  s.name                   AS state_name,
  csh.state_code,
  jsonb_array_length(csh.structure) AS class_count,
  csh.updated_at
FROM curriculum_state_hierarchy csh
LEFT JOIN india_states s ON s.code = csh.state_code
ORDER BY state_name;

-- ─── View: ar_assets_by_class ────────────────────────────────────────────────
CREATE OR REPLACE VIEW vw_ar_assets_by_class AS
SELECT
  class_name,
  subject,
  COUNT(*)        AS asset_count,
  COUNT(DISTINCT topic) AS topic_count,
  array_agg(DISTINCT language) FILTER (WHERE language IS NOT NULL) AS languages,
  MAX(created_at) AS latest_upload
FROM unity_assets
WHERE status NOT IN ('archived','rejected')
GROUP BY class_name, subject
ORDER BY class_name, subject;

-- ─── View: quiz_topic_coverage ───────────────────────────────────────────────
CREATE OR REPLACE VIEW vw_quiz_coverage AS
SELECT
  q.class_name,
  q.subject,
  COUNT(*)                   AS quiz_count,
  SUM(q.question_count)      AS total_questions,
  COUNT(*) FILTER (WHERE q.status='live') AS live_quizzes,
  COUNT(*) FILTER (WHERE q.status='draft') AS draft_quizzes
FROM quizzes q
GROUP BY q.class_name, q.subject
ORDER BY q.class_name, q.subject;

-- ─── Helpful index additions ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_unity_class_name ON unity_assets(class_name);
CREATE INDEX IF NOT EXISTS idx_unity_subject    ON unity_assets(subject);
CREATE INDEX IF NOT EXISTS idx_unity_topic      ON unity_assets(topic);
CREATE INDEX IF NOT EXISTS idx_unity_status     ON unity_assets(status);
CREATE INDEX IF NOT EXISTS idx_unity_language   ON unity_assets(language);

-- ─── Quizzes ENUM guard ───────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE quiz_status AS ENUM ('draft','scheduled','live','paused','archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Ensure quizzes table exists (in case schema_quiz.sql wasn't run)
CREATE TABLE IF NOT EXISTS quizzes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title           VARCHAR(300) NOT NULL,
  description     TEXT,
  status          quiz_status DEFAULT 'draft',
  class_name      VARCHAR(50),
  subject         VARCHAR(100),
  topic           VARCHAR(200),
  language        VARCHAR(80),
  class_node_id   UUID REFERENCES curriculum_nodes(id) ON DELETE SET NULL,
  subject_node_id UUID REFERENCES curriculum_nodes(id) ON DELETE SET NULL,
  topic_node_id   UUID REFERENCES curriculum_nodes(id) ON DELETE SET NULL,
  target_states   TEXT[] DEFAULT '{}',
  target_districts TEXT[] DEFAULT '{}',
  publish_at      TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  question_count  INT DEFAULT 0,
  total_attempts  BIGINT DEFAULT 0,
  avg_score       NUMERIC(5,2) DEFAULT 0,
  created_by      UUID REFERENCES users(id),
  reviewed_by     UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quiz_questions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quiz_id         UUID REFERENCES quizzes(id) ON DELETE CASCADE,
  sort_order      INT DEFAULT 0,
  question_text   TEXT NOT NULL,
  option_a        TEXT NOT NULL,
  option_b        TEXT NOT NULL,
  option_c        TEXT NOT NULL,
  option_d        TEXT NOT NULL,
  correct_answer  CHAR(1) NOT NULL CHECK (correct_answer IN ('A','B','C','D')),
  correct_display TEXT,
  explanation     TEXT,
  difficulty      VARCHAR(20) DEFAULT 'medium',
  marks           NUMERIC(4,1) DEFAULT 1,
  class_name      VARCHAR(50),
  subject         VARCHAR(100),
  topic           VARCHAR(200),
  language        VARCHAR(80),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quizzes_class    ON quizzes(class_name);
CREATE INDEX IF NOT EXISTS idx_quizzes_subject  ON quizzes(subject);
CREATE INDEX IF NOT EXISTS idx_quizzes_status   ON quizzes(status);
CREATE INDEX IF NOT EXISTS idx_quizzes_language ON quizzes(language);

-- ════════════════════════════════════════════════════════════════════════════
-- Migration complete. Run seed_india_locations.js to populate states/districts.
-- ════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════
-- APP MANAGER / APP BUILDER TABLES (v4.1 addition)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS app_code_files (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id        UUID REFERENCES state_apps(id) ON DELETE SET NULL,
  filename      TEXT NOT NULL,
  file_path     TEXT NOT NULL,
  language      TEXT NOT NULL,
  size_bytes    BIGINT DEFAULT 0,
  uploaded_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_code_versions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id           UUID REFERENCES app_code_files(id) ON DELETE CASCADE,
  commit_hash       TEXT NOT NULL,
  message           TEXT DEFAULT 'Auto-commit',
  content_snapshot  TEXT NOT NULL,
  committed_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_uiux_assets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id          UUID REFERENCES state_apps(id) ON DELETE SET NULL,
  filename        TEXT NOT NULL,
  file_path       TEXT NOT NULL,
  asset_type      TEXT NOT NULL,
  size_bytes      BIGINT DEFAULT 0,
  description     TEXT DEFAULT '',
  status          TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  optimized       BOOLEAN DEFAULT FALSE,
  review_comment  TEXT,
  reviewed_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at     TIMESTAMPTZ,
  uploaded_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_asset_comments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id      UUID REFERENCES app_uiux_assets(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  comment_text  TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_db_instances (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  host        TEXT DEFAULT 'localhost',
  port        INTEGER DEFAULT 5432,
  db_name     TEXT DEFAULT 'mitra_app',
  username    TEXT DEFAULT 'postgres',
  is_isolated BOOLEAN DEFAULT FALSE,
  linked_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_builds (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id            UUID REFERENCES state_apps(id) ON DELETE SET NULL,
  app_name          TEXT NOT NULL,
  target_state      TEXT NOT NULL,
  theme_color       TEXT DEFAULT '#6366f1',
  export_formats    JSONB DEFAULT '["apk","aab"]',
  status            TEXT DEFAULT 'queued' CHECK (status IN ('queued','building','success','failed','cancelled','published')),
  run_optimization  BOOLEAN DEFAULT FALSE,
  published_regions JSONB,
  published_at      TIMESTAMPTZ,
  triggered_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_build_logs (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  build_id  UUID REFERENCES app_builds(id) ON DELETE CASCADE,
  log_line  TEXT NOT NULL,
  logged_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_layouts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id        UUID REFERENCES state_apps(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  screen_name   TEXT DEFAULT 'Main Screen',
  layout_json   JSONB DEFAULT '[]',
  element_count INTEGER DEFAULT 0,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_builder_settings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key             TEXT UNIQUE NOT NULL,
  encrypted_value TEXT,
  masked_value    TEXT,
  updated_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_builder_rbac (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role              TEXT UNIQUE NOT NULL,
  can_build         BOOLEAN DEFAULT FALSE,
  can_publish       BOOLEAN DEFAULT FALSE,
  can_upload_code   BOOLEAN DEFAULT FALSE,
  can_upload_assets BOOLEAN DEFAULT FALSE,
  can_manage_db     BOOLEAN DEFAULT FALSE,
  updated_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Default RBAC roles
INSERT INTO app_builder_rbac (id, role, can_build, can_publish, can_upload_code, can_upload_assets, can_manage_db)
VALUES
  (gen_random_uuid(), 'superadmin', TRUE, TRUE, TRUE, TRUE, TRUE),
  (gen_random_uuid(), 'admin',      TRUE, TRUE, TRUE, TRUE, FALSE),
  (gen_random_uuid(), 'developer',  TRUE, FALSE, TRUE, TRUE, FALSE),
  (gen_random_uuid(), 'designer',   FALSE, FALSE, FALSE, TRUE, FALSE),
  (gen_random_uuid(), 'viewer',     FALSE, FALSE, FALSE, FALSE, FALSE)
ON CONFLICT (role) DO NOTHING;
