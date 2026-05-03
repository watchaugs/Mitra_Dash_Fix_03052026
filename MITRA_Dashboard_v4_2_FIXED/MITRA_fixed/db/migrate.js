/**
 * db/migrate.js — Run all schema migrations in order
 * Usage: node db/migrate.js
 */
require('dotenv').config();
const { Pool } = require('pg');
const fs   = require('fs');
const path = require('path');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     || 'mitra_dashboard',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || '',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

const SQL_FILES = [
  'schema.sql',
  'schema_quiz.sql',
  'schema_v4.sql',
  // FIX: v4.1 migration was never included — tenant_app_files + notification_log tables
  path.join('migrations', 'v4.1_notifications_compliance.sql')
];

async function runMigrations() {
  const client = await pool.connect();
  console.log('🔌 Connected:', process.env.DB_NAME || 'mitra_dashboard');
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY, filename VARCHAR(200) UNIQUE NOT NULL, applied_at TIMESTAMPTZ DEFAULT NOW()
    )`);

    for (const file of SQL_FILES) {
      const fp = path.join(__dirname, file);
      if (!fs.existsSync(fp)) { console.log(`⚠️  Skipping ${file} (not found)`); continue; }
      const migKey = path.basename(file);
      const check = await client.query('SELECT id FROM _migrations WHERE filename=$1', [migKey]);
      if (check.rows.length) { console.log(`✅ Already applied: ${file}`); continue; }
      console.log(`⏳ Running: ${file}`);
      await client.query(fs.readFileSync(fp, 'utf8'));
      await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [migKey]);
      console.log(`✅ Applied: ${file}`);
    }

    const seedCheck = await client.query('SELECT COUNT(*) FROM india_states');
    if (parseInt(seedCheck.rows[0].count) === 0) {
      console.log('🌍 Seeding India locations...');
      try { require('./seed_india_locations'); } catch(e) { console.warn('⚠️  Seed manually: node db/seed_india_locations.js'); }
    } else {
      console.log(`✅ India states: ${seedCheck.rows[0].count} records exist`);
    }
    console.log('\n🎉 All migrations complete!\n');
  } catch (err) {
    console.error('❌ Migration error:', err.message); process.exit(1);
  } finally { client.release(); await pool.end(); }
}
runMigrations();
