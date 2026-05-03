-- ════════════════════════════════════════════════════════════════════════════
-- MITRA Dashboard · Quiz Manager Extension Schema
-- Run AFTER main schema.sql:
--   psql -U postgres -d mitra_dashboard -f db/schema_quiz.sql
-- ════════════════════════════════════════════════════════════════════════════

-- ─── QUIZ STATUS ENUM ────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE quiz_status AS ENUM ('draft','scheduled','live','paused','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── INDIA STATES & DISTRICTS (Official Census Data) ─────────────────────────
CREATE TABLE IF NOT EXISTS india_states (
  id          SERIAL PRIMARY KEY,
  code        VARCHAR(10) UNIQUE NOT NULL,   -- e.g. 'MH', 'UP'
  name        VARCHAR(100) UNIQUE NOT NULL,  -- e.g. 'Maharashtra'
  region      VARCHAR(50),                   -- North/South/East/West/Central/Northeast/Island
  capital     VARCHAR(100),
  geojson     JSONB,                         -- GeoJSON polygon from Nominatim OSM
  nominatim_id BIGINT,                       -- OSM relation ID
  last_geo_sync TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS india_districts (
  id          SERIAL PRIMARY KEY,
  state_code  VARCHAR(10) REFERENCES india_states(code) ON DELETE CASCADE,
  name        VARCHAR(150) NOT NULL,
  district_code VARCHAR(20),                 -- LGD code
  geojson     JSONB,                         -- GeoJSON polygon from Nominatim OSM
  nominatim_id BIGINT,                       -- OSM relation ID
  last_geo_sync TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (state_code, name)
);

CREATE INDEX IF NOT EXISTS idx_districts_state ON india_districts(state_code);

-- ─── QUIZZES ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quizzes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title           VARCHAR(300) NOT NULL,
  description     TEXT,
  status          quiz_status DEFAULT 'draft',
  -- Curriculum linking
  class_name      VARCHAR(50),               -- e.g. 'Class 9'
  subject         VARCHAR(100),
  topic           VARCHAR(200),
  language        VARCHAR(80),
  -- Curriculum node IDs (optional deep link)
  class_node_id   UUID REFERENCES curriculum_nodes(id) ON DELETE SET NULL,
  subject_node_id UUID REFERENCES curriculum_nodes(id) ON DELETE SET NULL,
  topic_node_id   UUID REFERENCES curriculum_nodes(id) ON DELETE SET NULL,
  -- Targeting / Geofencing
  target_states   TEXT[] DEFAULT '{}',
  target_districts TEXT[] DEFAULT '{}',
  -- Scheduling
  publish_at      TIMESTAMPTZ,               -- null = go live immediately when published
  expires_at      TIMESTAMPTZ,
  -- Counters (denormalized for speed)
  question_count  INT DEFAULT 0,
  total_attempts  BIGINT DEFAULT 0,
  avg_score       NUMERIC(5,2) DEFAULT 0,
  -- Audit
  created_by      UUID REFERENCES users(id),
  reviewed_by     UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── QUIZ QUESTIONS ───────────────────────────────────────────────────────────
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
  correct_display TEXT,                      -- e.g. full text of correct option for display
  explanation     TEXT,                      -- optional explanation shown after answer
  difficulty      VARCHAR(20) DEFAULT 'medium' CHECK (difficulty IN ('easy','medium','hard')),
  marks           NUMERIC(4,1) DEFAULT 1,
  -- Curriculum tags (inherited from quiz, but can be overridden per question)
  class_name      VARCHAR(50),
  subject         VARCHAR(100),
  topic           VARCHAR(200),
  language        VARCHAR(80),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz ON quiz_questions(quiz_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_status       ON quizzes(status);
CREATE INDEX IF NOT EXISTS idx_quizzes_class        ON quizzes(class_name);
CREATE INDEX IF NOT EXISTS idx_quizzes_subject      ON quizzes(subject);
CREATE INDEX IF NOT EXISTS idx_quizzes_language     ON quizzes(language);
CREATE INDEX IF NOT EXISTS idx_quizzes_publish_at   ON quizzes(publish_at);

-- ─── QUIZ ATTEMPTS / ANALYTICS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id              BIGSERIAL PRIMARY KEY,
  quiz_id         UUID REFERENCES quizzes(id) ON DELETE CASCADE,
  device_id       VARCHAR(128),
  student_id      VARCHAR(128),
  state           VARCHAR(100),
  district        VARCHAR(100),
  school_id       VARCHAR(100),
  class_grade     VARCHAR(50),
  score           NUMERIC(6,2) DEFAULT 0,
  max_score       NUMERIC(6,2) DEFAULT 0,
  pct_score       NUMERIC(5,2) DEFAULT 0,
  questions_attempted INT DEFAULT 0,
  correct_answers INT DEFAULT 0,
  time_taken_secs INT DEFAULT 0,
  completed       BOOLEAN DEFAULT FALSE,
  app_language    VARCHAR(80),
  attempted_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz    ON quiz_attempts(quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_state   ON quiz_attempts(state);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_date    ON quiz_attempts(attempted_at DESC);

-- ─── ENHANCE GEOFENCES TABLE ─────────────────────────────────────────────────
ALTER TABLE geofences
  ADD COLUMN IF NOT EXISTS district     VARCHAR(150),
  ADD COLUMN IF NOT EXISTS geojson      JSONB,
  ADD COLUMN IF NOT EXISTS nominatim_id BIGINT,
  ADD COLUMN IF NOT EXISTS last_geo_sync TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS admin_level  SMALLINT DEFAULT 4; -- 4=state, 5=district

-- ─── CURRICULUM QUIZ ASSOCIATIONS ────────────────────────────────────────────
-- Allows multiple quizzes to be linked to a curriculum topic node
CREATE TABLE IF NOT EXISTS curriculum_quiz_links (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  node_id     UUID REFERENCES curriculum_nodes(id) ON DELETE CASCADE,
  quiz_id     UUID REFERENCES quizzes(id) ON DELETE CASCADE,
  linked_by   UUID REFERENCES users(id),
  linked_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(node_id, quiz_id)
);

-- ─── Unity / AR Asset table extensions (v3.1) ─────────────────────────────
-- Add curriculum-tagging columns to existing unity_assets table
DO $$ BEGIN
  ALTER TABLE unity_assets ADD COLUMN IF NOT EXISTS class_name   TEXT;
  ALTER TABLE unity_assets ADD COLUMN IF NOT EXISTS subject      TEXT;
  ALTER TABLE unity_assets ADD COLUMN IF NOT EXISTS topic        TEXT;
  ALTER TABLE unity_assets ADD COLUMN IF NOT EXISTS language     TEXT;
  ALTER TABLE unity_assets ADD COLUMN IF NOT EXISTS title        TEXT;
  ALTER TABLE unity_assets ADD COLUMN IF NOT EXISTS file_format  TEXT;
  ALTER TABLE unity_assets ADD COLUMN IF NOT EXISTS file_size_mb NUMERIC(12,2);
  ALTER TABLE unity_assets ADD COLUMN IF NOT EXISTS target_states JSONB;
  ALTER TABLE unity_assets ADD COLUMN IF NOT EXISTS target_districts JSONB;
  ALTER TABLE unity_assets ADD COLUMN IF NOT EXISTS target_apps  JSONB;
  ALTER TABLE unity_assets ADD COLUMN IF NOT EXISTS target_classes JSONB;
  ALTER TABLE unity_assets ADD COLUMN IF NOT EXISTS target_subjects JSONB;
  ALTER TABLE unity_assets ADD COLUMN IF NOT EXISTS restrict_login BOOLEAN DEFAULT TRUE;
  ALTER TABLE unity_assets ADD COLUMN IF NOT EXISTS offline_available BOOLEAN DEFAULT TRUE;
  ALTER TABLE unity_assets ADD COLUMN IF NOT EXISTS notes        TEXT;
  ALTER TABLE unity_assets ADD COLUMN IF NOT EXISTS reviewed_by  UUID REFERENCES users(id) ON DELETE SET NULL;
  ALTER TABLE unity_assets ADD COLUMN IF NOT EXISTS expires_at   TIMESTAMPTZ;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Rename file_path storage dir references from /uploads/unity/ to /uploads/ar_assets/
-- (data migration — safe to run multiple times)
UPDATE unity_assets
SET file_path = REPLACE(file_path, '/uploads/unity/', '/uploads/ar_assets/')
WHERE file_path LIKE '/uploads/unity/%';

-- Curriculum ↔ AR Asset link table
CREATE TABLE IF NOT EXISTS curriculum_ar_links (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curriculum_node_id TEXT NOT NULL,   -- frontend node ID or DB curriculum node
  asset_id      UUID NOT NULL REFERENCES unity_assets(id) ON DELETE CASCADE,
  linked_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(curriculum_node_id, asset_id)
);

-- ─── Curriculum State Hierarchy persistence (v3.2) ────────────────────────
CREATE TABLE IF NOT EXISTS curriculum_state_hierarchy (
  state_code   VARCHAR(4) PRIMARY KEY,
  structure    JSONB NOT NULL DEFAULT '[]',
  updated_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
