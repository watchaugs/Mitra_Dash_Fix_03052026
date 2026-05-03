-- ════════════════════════════════════════════════════════════════════════════
-- MITRA Dashboard · Full Database Schema
-- Run with:  psql -U postgres -c "CREATE DATABASE mitra_dashboard;"
--            psql -U postgres -d mitra_dashboard -f db/schema.sql
-- ════════════════════════════════════════════════════════════════════════════

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- for fuzzy text search

-- ─── ENUMS ───────────────────────────────────────────────────────────────────
CREATE TYPE user_role AS ENUM (
  'master_admin','admin','district_officer','teacher','content_manager','viewer'
);
CREATE TYPE asset_status AS ENUM (
  'draft','uploading','processing','review','published','archived','rejected'
);
CREATE TYPE ad_status AS ENUM (
  'draft','scheduled','live','paused','expiring_soon','expired','archived'
);
CREATE TYPE media_type AS ENUM ('video','image','gif');
CREATE TYPE app_status AS ENUM ('building','compiled','live','update_pending','retired');

-- ─── USERS ───────────────────────────────────────────────────────────────────
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name       VARCHAR(150) NOT NULL,
  email           VARCHAR(255) UNIQUE NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  role            user_role NOT NULL DEFAULT 'viewer',
  assigned_state  VARCHAR(100) DEFAULT 'All India',
  assigned_district VARCHAR(100),
  is_active       BOOLEAN DEFAULT TRUE,
  -- Permissions (granular flags)
  perm_publish_apps    BOOLEAN DEFAULT FALSE,
  perm_upload_unity    BOOLEAN DEFAULT FALSE,
  perm_manage_geo      BOOLEAN DEFAULT FALSE,
  perm_view_analytics  BOOLEAN DEFAULT FALSE,
  perm_create_users    BOOLEAN DEFAULT FALSE,
  perm_edit_curriculum BOOLEAN DEFAULT FALSE,
  perm_approve_content BOOLEAN DEFAULT FALSE,
  perm_export_data     BOOLEAN DEFAULT FALSE,
  perm_manage_ads      BOOLEAN DEFAULT FALSE,
  perm_replay_analytics BOOLEAN DEFAULT FALSE,
  -- Dashboard/UI permission flags (required by frontend User Management)
  perm_view_dashboard    BOOLEAN DEFAULT FALSE,
  perm_view_curriculum   BOOLEAN DEFAULT FALSE,
  perm_view_controls     BOOLEAN DEFAULT FALSE,
  perm_view_ar_assets    BOOLEAN DEFAULT FALSE,
  perm_view_notif        BOOLEAN DEFAULT FALSE,
  perm_view_users        BOOLEAN DEFAULT FALSE,
  perm_view_legal        BOOLEAN DEFAULT FALSE,
  perm_view_settings     BOOLEAN DEFAULT FALSE,
  perm_delete_users      BOOLEAN DEFAULT FALSE,
  perm_manage_compliance BOOLEAN DEFAULT FALSE,
  perm_view_app_builder  BOOLEAN DEFAULT FALSE,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Refresh token store
CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(255) UNIQUE NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── CURRICULUM ───────────────────────────────────────────────────────────────
CREATE TABLE curriculum_nodes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  parent_id   UUID REFERENCES curriculum_nodes(id) ON DELETE CASCADE,
  node_type   VARCHAR(20) NOT NULL CHECK (node_type IN ('class','subject','topic','language')),
  name        VARCHAR(200) NOT NULL,
  icon        VARCHAR(10) DEFAULT '📘',
  sort_order  INT DEFAULT 0,
  is_active   BOOLEAN DEFAULT TRUE,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── UNITY ASSETS ─────────────────────────────────────────────────────────────
CREATE TABLE unity_assets (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            VARCHAR(255) NOT NULL,
  original_name   VARCHAR(255),
  file_path       VARCHAR(512),
  file_size_bytes BIGINT,
  status          asset_status DEFAULT 'draft',
  uploaded_by     UUID REFERENCES users(id),
  reviewed_by     UUID REFERENCES users(id),
  -- Targeting
  target_apps     TEXT[],      -- e.g. ARRAY['MITRA UP','MITRA Maha']
  target_states   TEXT[],
  target_districts TEXT[],
  target_classes  TEXT[],
  target_subjects TEXT[],
  -- Availability
  publish_at      TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  restrict_login  BOOLEAN DEFAULT TRUE,
  offline_available BOOLEAN DEFAULT TRUE,
  -- Metadata
  version         VARCHAR(20) DEFAULT 'v1.0.0',
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── STATE APPS ───────────────────────────────────────────────────────────────
CREATE TABLE state_apps (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  app_name        VARCHAR(150) NOT NULL,
  target_state    VARCHAR(100) NOT NULL,
  version         VARCHAR(20) DEFAULT 'v1.0.0',
  status          app_status DEFAULT 'building',
  active_users    INT DEFAULT 0,
  theme_color     VARCHAR(20) DEFAULT '#6366f1',
  file_path       VARCHAR(512),
  built_by        UUID REFERENCES users(id),
  published_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── GEOFENCES ────────────────────────────────────────────────────────────────
CREATE TABLE geofences (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            VARCHAR(200) NOT NULL,
  state           VARCHAR(100) NOT NULL,
  radius_km       INT DEFAULT 50,
  is_active       BOOLEAN DEFAULT TRUE,
  language_lock   VARCHAR(50) DEFAULT 'Follow User Setting',
  offline_only    BOOLEAN DEFAULT FALSE,
  ar_modules      TEXT[],
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── ADVERTISEMENTS ───────────────────────────────────────────────────────────
CREATE TABLE ad_campaigns (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            VARCHAR(255) NOT NULL,
  advertiser      VARCHAR(255),
  description     TEXT,
  media_type      media_type NOT NULL,
  file_path       VARCHAR(512),
  file_size_bytes INT,
  status          ad_status DEFAULT 'draft',
  -- Schedule
  publish_at      TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  publish_days    TEXT[] DEFAULT ARRAY['Mon','Tue','Wed','Thu','Fri'],
  -- Targeting
  target_apps     TEXT[],
  target_states   TEXT[],
  target_districts TEXT[],
  target_classes  TEXT[],
  target_subjects TEXT[],
  target_languages TEXT[],
  -- Frequency
  daily_push_limit INT DEFAULT 5 CHECK (daily_push_limit BETWEEN 0 AND 50),
  show_before_topic BOOLEAN DEFAULT FALSE,
  push_start_time TIME DEFAULT '08:00',
  push_end_time   TIME DEFAULT '20:00',
  -- Performance counters (updated by telemetry ingestion)
  total_impressions    BIGINT DEFAULT 0,
  unique_viewers       BIGINT DEFAULT 0,
  total_completions    BIGINT DEFAULT 0,
  total_clicks         BIGINT DEFAULT 0,
  avg_view_seconds     NUMERIC(6,2) DEFAULT 0,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── AD IMPRESSION EVENTS (raw telemetry) ─────────────────────────────────────
CREATE TABLE ad_impressions (
  id              BIGSERIAL PRIMARY KEY,
  campaign_id     UUID REFERENCES ad_campaigns(id) ON DELETE CASCADE,
  device_id       VARCHAR(128),
  student_id      VARCHAR(128),
  state           VARCHAR(100),
  district        VARCHAR(100),
  school_id       VARCHAR(100),
  class_grade     VARCHAR(20),
  age_group       VARCHAR(20),
  subject_context VARCHAR(100),
  app_language    VARCHAR(50),
  app_version     VARCHAR(20),
  media_type      media_type,
  view_seconds    NUMERIC(6,2) DEFAULT 0,
  completed       BOOLEAN DEFAULT FALSE,
  clicked         BOOLEAN DEFAULT FALSE,
  skipped         BOOLEAN DEFAULT FALSE,
  is_repeat       BOOLEAN DEFAULT FALSE,
  repeat_count    INT DEFAULT 1,
  viewed_at       TIMESTAMPTZ DEFAULT NOW(),
  hour_of_day     SMALLINT GENERATED ALWAYS AS (EXTRACT(HOUR FROM viewed_at)::SMALLINT) STORED,
  day_of_week     SMALLINT GENERATED ALWAYS AS (EXTRACT(DOW  FROM viewed_at)::SMALLINT) STORED
);

-- ─── STUDENT APP TELEMETRY ────────────────────────────────────────────────────
CREATE TABLE app_telemetry (
  id              BIGSERIAL PRIMARY KEY,
  device_id       VARCHAR(128),
  student_id      VARCHAR(128),
  state           VARCHAR(100),
  district        VARCHAR(100),
  school_id       VARCHAR(100),
  class_grade     VARCHAR(20),
  subject         VARCHAR(100),
  topic_id        UUID REFERENCES curriculum_nodes(id),
  session_minutes NUMERIC(8,2),
  replay_count    INT DEFAULT 0,
  completed       BOOLEAN DEFAULT FALSE,
  dropped_off     BOOLEAN DEFAULT FALSE,
  offline_session BOOLEAN DEFAULT FALSE,
  app_language    VARCHAR(50),
  device_tier     VARCHAR(20),    -- high/mid/low
  recorded_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ─── INDEXES for performance ──────────────────────────────────────────────────
CREATE INDEX idx_ad_impressions_campaign  ON ad_impressions(campaign_id);
CREATE INDEX idx_ad_impressions_state     ON ad_impressions(state);
CREATE INDEX idx_ad_impressions_viewed_at ON ad_impressions(viewed_at DESC);
CREATE INDEX idx_ad_impressions_hour      ON ad_impressions(hour_of_day);
CREATE INDEX idx_ad_impressions_dow       ON ad_impressions(day_of_week);
CREATE INDEX idx_ad_impressions_class     ON ad_impressions(class_grade);
CREATE INDEX idx_telemetry_state          ON app_telemetry(state);
CREATE INDEX idx_telemetry_recorded       ON app_telemetry(recorded_at DESC);
CREATE INDEX idx_users_email              ON users(email);
CREATE INDEX idx_refresh_tokens_user      ON refresh_tokens(user_id);
