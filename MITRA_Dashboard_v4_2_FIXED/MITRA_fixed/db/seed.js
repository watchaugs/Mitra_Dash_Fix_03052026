/**
 * db/seed.js — Seed database with default master admin + sample data
 * Usage: npm run seed
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { query, pool } = require('./index');

async function seed() {
  console.log('🌱 Seeding database...\n');

  // ── Master Admin ────────────────────────────────────────────────────────────
  const adminPwd = await bcrypt.hash('Mitra@Admin2026!', 12);
  await query(`
    INSERT INTO users (id, full_name, email, password_hash, role,
      perm_publish_apps, perm_upload_unity, perm_manage_geo, perm_view_analytics,
      perm_create_users, perm_edit_curriculum, perm_approve_content,
      perm_export_data, perm_manage_ads, perm_replay_analytics)
    VALUES ($1,'Rajeev Sharma','admin@mitra.gov.in',$2,'master_admin',
      true,true,true,true,true,true,true,true,true,true)
    ON CONFLICT (email) DO NOTHING
  `, [uuidv4(), adminPwd]);
  console.log('✅ Master admin created: admin@mitra.gov.in / Mitra@Admin2026!');

  // ── Sample District Officer ──────────────────────────────────────────────────
  const doPwd = await bcrypt.hash('District@2026!', 12);
  await query(`
    INSERT INTO users (id, full_name, email, password_hash, role,
      assigned_state, perm_view_analytics, perm_export_data, perm_replay_analytics)
    VALUES ($1,'Meera Kapoor','meera@mitra.gov.in',$2,'district_officer',
      'Maharashtra',true,true,true)
    ON CONFLICT (email) DO NOTHING
  `, [uuidv4(), doPwd]);
  console.log('✅ District officer: meera@mitra.gov.in / District@2026!');

  // ── Sample Curriculum Nodes ──────────────────────────────────────────────────
  const cl10 = uuidv4(), cl9 = uuidv4(), sciId = uuidv4(), mathId = uuidv4();
  await query(`
    INSERT INTO curriculum_nodes (id, node_type, name, icon, sort_order) VALUES
      ($1,'class','Class 10','🏫',10),
      ($2,'class','Class 9','🏫',9)
    ON CONFLICT DO NOTHING
  `, [cl10, cl9]);
  await query(`
    INSERT INTO curriculum_nodes (id, parent_id, node_type, name, icon) VALUES
      ($1,$3,'subject','Science','📘'),
      ($2,$3,'subject','Mathematics','📐')
    ON CONFLICT DO NOTHING
  `, [sciId, mathId, cl10]);
  await query(`
    INSERT INTO curriculum_nodes (id, parent_id, node_type, name, icon) VALUES
      ($1,$2,'topic','Microscopy AR','🔬'),
      ($3,$2,'topic','Solar System','🪐')
    ON CONFLICT DO NOTHING
  `, [uuidv4(), sciId, uuidv4()]);
  console.log('✅ Sample curriculum nodes seeded');

  // ── Sample Geofences ─────────────────────────────────────────────────────────
  await query(`
    INSERT INTO geofences (id, name, state, radius_km, is_active, ar_modules) VALUES
      ($1,'Maharashtra Primary Cluster','Maharashtra',50,true,ARRAY['Science Bundle','Maths Bundle']),
      ($2,'Uttar Pradesh Primary Cluster','Uttar Pradesh',80,true,ARRAY['All Modules (Default)']),
      ($3,'Gujarat Primary Cluster','Gujarat',60,true,ARRAY['Science Bundle','History Bundle'])
    ON CONFLICT DO NOTHING
  `, [uuidv4(), uuidv4(), uuidv4()]);
  console.log('✅ Sample geofences seeded');

  // ── Sample State Apps ─────────────────────────────────────────────────────────
  await query(`
    INSERT INTO state_apps (id, app_name, target_state, version, status, active_users) VALUES
      ($1,'MITRA UP','Uttar Pradesh','v2.1.4','live',22300),
      ($2,'MITRA Maha','Maharashtra','v2.1.4','live',20650),
      ($3,'MITRA Raj','Rajasthan','v2.1.2','update_pending',9400)
    ON CONFLICT DO NOTHING
  `, [uuidv4(), uuidv4(), uuidv4()]);
  console.log('✅ Sample state apps seeded');

  // ── Sample Ad Campaign ────────────────────────────────────────────────────────
  const adminRow = await query(`SELECT id FROM users WHERE email='admin@mitra.gov.in' LIMIT 1`);
  const adminId  = adminRow.rows[0]?.id;
  const campId   = uuidv4();
  await query(`
    INSERT INTO ad_campaigns (
      id, name, advertiser, description, media_type, status,
      publish_at, expires_at, target_states, target_classes, target_subjects,
      daily_push_limit, total_impressions, unique_viewers, total_completions, total_clicks,
      avg_view_seconds, created_by
    ) VALUES (
      $1,'Science Kit Launch','NCERT','Promote Science Lab Kit 2026','video','live',
      NOW(), NOW() + INTERVAL '30 days',
      ARRAY['Maharashtra'],ARRAY['Class 9','Class 10'],ARRAY['Science'],
      5,124500,54200,89640,6370,21.4,$2
    ) ON CONFLICT DO NOTHING
  `, [campId, adminId]);
  console.log('✅ Sample ad campaign seeded');

  // ── Sample Impression rows (small batch for demo) ────────────────────────────
  const states    = ['Maharashtra','Gujarat','Uttar Pradesh','Rajasthan','Tamil Nadu'];
  const districts = ['Mumbai','Ahmedabad','Lucknow','Jaipur','Chennai'];
  const classes   = ['Class 8','Class 9','Class 10'];
  const ages      = ['12-13 yrs','13-14 yrs','14-15 yrs','15-16 yrs'];
  const langs     = ['Hindi','English','Marathi','Gujarati','Tamil'];
  const subjects  = ['Science','Mathematics','History','Biology'];

  const impRows = [];
  for (let i = 0; i < 500; i++) {
    const si  = Math.floor(Math.random() * 5);
    const hr  = Math.floor(Math.random() * 18) + 6;
    const dt  = new Date(Date.now() - Math.random() * 7 * 86400000);
    dt.setHours(hr);
    impRows.push([
      uuidv4(), campId,
      `device_${Math.floor(Math.random()*1000)}`,
      `student_${Math.floor(Math.random()*2000)}`,
      states[si], districts[si],
      classes[Math.floor(Math.random()*3)],
      ages[Math.floor(Math.random()*4)],
      subjects[Math.floor(Math.random()*4)],
      langs[Math.floor(Math.random()*5)],
      'video',
      +(Math.random() * 28 + 5).toFixed(1),
      Math.random() > 0.3,
      Math.random() > 0.9,
      Math.random() > 0.8,
      Math.random() > 0.7,
      Math.floor(Math.random() * 3) + 1,
      dt.toISOString()
    ]);
  }

  for (const row of impRows) {
    // Safety check: If the array has 18 items (meaning it includes a fake UUID for the ID), 
    // slice off the first item so we only send the 17 real data points.
    const cleanRow = row.length === 18 ? row.slice(1) : row;

    await query(`
      INSERT INTO ad_impressions (
        campaign_id, device_id, student_id, state, district,
        class_grade, age_group, subject_context, app_language,
        media_type, view_seconds, completed, clicked, skipped, is_repeat,
        repeat_count, viewed_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
    `, cleanRow);
  }
  console.log('✅ 500 sample ad impression rows seeded');

  console.log('\n🎉 Database seed complete!\n');
  await pool.end();
}

seed().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
