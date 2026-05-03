-- ════════════════════════════════════════════════════════════════════════════
-- MITRA Dashboard — Migration v4.1
-- New tables: push_notifications, notification_analytics,
--             audit_logs, compliance_settings, incident_reports
-- Also: alters to users for MFA, purge tracking, last_login_at
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Push Notifications ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS push_notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  target_state    TEXT,
  target_class    TEXT,
  target_subject  TEXT,
  target_ar_topic UUID REFERENCES curriculum_topics(id) ON DELETE SET NULL,
  target_quiz_id  UUID REFERENCES quizzes(id) ON DELETE SET NULL,
  deep_link_type  TEXT CHECK (deep_link_type IN ('ar_topic','quiz') OR deep_link_type IS NULL),
  deep_link_id    TEXT,
  deep_link_title TEXT,
  fcm_topic       TEXT,
  status          TEXT NOT NULL DEFAULT 'sent'
                  CHECK (status IN ('sent','scheduled','cancelled','failed')),
  scheduled_at    TIMESTAMPTZ,
  sent_at         TIMESTAMPTZ,
  sent_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_notif_status      ON push_notifications(status);
CREATE INDEX IF NOT EXISTS idx_push_notif_state       ON push_notifications(target_state);
CREATE INDEX IF NOT EXISTS idx_push_notif_sent_at     ON push_notifications(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_push_notif_scheduled   ON push_notifications(scheduled_at) WHERE status='scheduled';

-- ── 2. Notification Analytics ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_analytics (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES push_notifications(id) ON DELETE CASCADE,
  delivered       BIGINT DEFAULT 0,
  opened          BIGINT DEFAULT 0,
  clicked         BIGINT DEFAULT 0,
  last_updated    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(notification_id)
);

CREATE INDEX IF NOT EXISTS idx_notif_analytics_notif ON notification_analytics(notification_id);

-- ── 3. Audit Logs (CERT-In 180-day retention) ────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  action        TEXT NOT NULL,
  resource_type TEXT,
  resource_id   TEXT,
  ip_address    INET,
  details       JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_user_id   ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action    ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_created   ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_ip        ON audit_logs(ip_address);

-- Retention policy: auto-delete logs older than 180 days
-- This should be run as a cron job: DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '180 days';
COMMENT ON TABLE audit_logs IS 'CERT-In 2022: 180-day retention. Auto-purge records older than 180 days via scheduled cron.';

-- ── 4. Compliance Settings ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS compliance_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO compliance_settings (key, value) VALUES
  ('auto_purge_inactive', 'false'),
  ('dpdp_consent_version', '2.0'),
  ('audit_retention_days', '180')
ON CONFLICT (key) DO NOTHING;

-- ── 5. Incident Reports (CERT-In) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS incident_reports (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type                  TEXT NOT NULL,
  severity              TEXT NOT NULL DEFAULT 'medium'
                        CHECK (severity IN ('critical','high','medium','low')),
  description           TEXT NOT NULL,
  affected_users_count  INTEGER DEFAULT 0,
  detected_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reported_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  status                TEXT NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open','investigating','resolved','closed')),
  resolution_notes      TEXT,
  resolved_at           TIMESTAMPTZ,
  cert_in_reported      BOOLEAN DEFAULT FALSE,
  cert_in_reported_at   TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incident_status   ON incident_reports(status);
CREATE INDEX IF NOT EXISTS idx_incident_severity ON incident_reports(severity);

-- ── 6. Alter users for MFA, purge tracking, last_login_at ──────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS mfa_enforced    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS mfa_secret      TEXT,
  ADD COLUMN IF NOT EXISTS last_login_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS purged_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS purge_reason    TEXT,
  ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login_at);
CREATE INDEX IF NOT EXISTS idx_users_purged     ON users(purged_at) WHERE purged_at IS NOT NULL;

-- ── 7. Published Apps: add ar_bundle_version ─────────────────────────────────
ALTER TABLE state_apps
  ADD COLUMN IF NOT EXISTS ar_bundle_version TEXT DEFAULT 'unity-2023.1.4f1';

-- ── 8. Auto-update updated_at trigger ────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['push_notifications','users','incident_reports']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_' || tbl
    ) THEN
      EXECUTE format('CREATE TRIGGER set_updated_at_%I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()', tbl, tbl);
    END IF;
  END LOOP;
END;
$$;

-- ── 9. Row-Level Security for RBAC on sensitive tables ───────────────────────
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_notifications ENABLE ROW LEVEL SECURITY;

-- Only admins (role checked at app layer; these are belt-and-suspenders)
-- Note: Your app layer auth should also enforce this
CREATE POLICY IF NOT EXISTS audit_logs_admin_only
  ON audit_logs FOR ALL
  USING (current_setting('app.user_role', TRUE) IN ('admin','superadmin'));

CREATE POLICY IF NOT EXISTS push_notifs_staff_read
  ON push_notifications FOR SELECT
  USING (current_setting('app.user_role', TRUE) IN ('admin','superadmin','teacher','district'));

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- CRON JOB SETUP (add to your cron scheduler / pg_cron)
-- ════════════════════════════════════════════════════════════════════════════
-- Every minute: dispatch scheduled notifications
-- curl -X POST http://localhost:3000/api/notifications/dispatch-scheduled \
--   -H "x-server-key: $INTERNAL_SERVER_KEY"
--
-- Daily at 2am: purge old audit logs
-- DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '180 days';
--
-- Monthly: auto-purge inactive accounts (if enabled)
-- curl -X POST http://localhost:3000/api/compliance/run-auto-purge \
--   -H "Authorization: Bearer $CRON_TOKEN"
-- ════════════════════════════════════════════════════════════════════════════

-- ── NEW v4.1: Tenant App Files (for Tenant Database Links tab) ───────────────
CREATE TABLE IF NOT EXISTS tenant_app_files (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_name            TEXT NOT NULL,
  target_state        TEXT NOT NULL,
  platform            TEXT NOT NULL DEFAULT 'android' CHECK (platform IN ('android','ios','both')),
  version_code        INTEGER NOT NULL DEFAULT 100,
  version_name        TEXT NOT NULL,
  build_status        TEXT NOT NULL DEFAULT 'building'
                      CHECK (build_status IN ('building','live','update_pending','deprecated','failed')),
  file_size_mb        NUMERIC(8,2),
  storage_path        TEXT,
  sha256_hash         TEXT,
  skin_name           TEXT,
  primary_language    TEXT,
  active_students     INTEGER NOT NULL DEFAULT 0,
  last_ota_push       TIMESTAMPTZ,
  built_by_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_files_state  ON tenant_app_files(target_state);
CREATE INDEX IF NOT EXISTS idx_tenant_files_status ON tenant_app_files(build_status);

-- ── BUG-FIX #10: Rename last_login → last_login_at (if column exists) ─────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'last_login'
  ) THEN
    ALTER TABLE users RENAME COLUMN last_login TO last_login_at;
  END IF;
END$$;
