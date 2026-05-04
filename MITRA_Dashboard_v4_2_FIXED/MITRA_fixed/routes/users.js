/**
 * routes/users.js — User Access Management
 *
 * GET    /api/users          List users
 * POST   /api/users          Create user
 * GET    /api/users/:id      Get user
 * PUT    /api/users/:id      Update user / permissions
 * DELETE /api/users/:id      Deactivate user
 * POST   /api/users/:id/reset-password
 */
const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { query }  = require('../db');
const { authenticate, requirePerm, masterAdminOnly } = require('../middleware/auth');
const { sendCredentialEmail } = require('./auth');

router.use(authenticate);

// GET /api/users
router.get('/', requirePerm('perm_create_users'), async (req, res) => {
  try {
    const { role, state, search, page = 1, limit = 50 } = req.query;
    const conds  = [];
    const params = [];

    if (role)   { params.push(role);          conds.push(`role = $${params.length}`); }
    if (state)  { params.push(state);         conds.push(`assigned_state = $${params.length}`); }
    if (search) { params.push(`%${search}%`); conds.push(`(full_name ILIKE $${params.length} OR email ILIKE $${params.length})`); }

    const where  = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);
    params.push(parseInt(limit), offset);

    const result = await query(`
      SELECT id, full_name, email, role, assigned_state, assigned_district,
             is_active, last_login_at, created_at,
             perm_publish_apps, perm_upload_unity, perm_manage_geo,
             perm_view_analytics, perm_create_users, perm_edit_curriculum,
             perm_approve_content, perm_export_data, perm_manage_ads, perm_replay_analytics
      FROM users ${where}
      ORDER BY created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    const count = await query(`SELECT COUNT(*) FROM users ${where}`, params.slice(0, params.length - 2));
    res.json({ users: result.rows, total: parseInt(count.rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list users' });
  }
});

// POST /api/users
router.post('/', requirePerm('perm_create_users'), async (req, res) => {
  try {
    const {
      full_name, email, password, role = 'viewer',
      assigned_state = 'All India', assigned_district,
      perm_publish_apps = false, perm_upload_unity = false,
      perm_manage_geo = false, perm_view_analytics = false,
      perm_create_users = false, perm_edit_curriculum = false,
      perm_approve_content = false, perm_export_data = false,
      perm_manage_ads = false, perm_replay_analytics = false
    } = req.body;

    if (!full_name || !email || !password) {
      return res.status(400).json({ error: 'full_name, email, and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    // Master admin role can only be assigned by a master admin
    if (role === 'master_admin' && req.user.role !== 'master_admin') {
      return res.status(403).json({ error: 'Only master admins can create master admin accounts' });
    }

    const hash   = await bcrypt.hash(password, 12);
    const id     = uuidv4();
    const result = await query(`
      INSERT INTO users (
        id, full_name, email, password_hash, role,
        assigned_state, assigned_district,
        perm_publish_apps, perm_upload_unity, perm_manage_geo,
        perm_view_analytics, perm_create_users, perm_edit_curriculum,
        perm_approve_content, perm_export_data, perm_manage_ads, perm_replay_analytics
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      RETURNING id, full_name, email, role, assigned_state, is_active, created_at
    `, [
      id, full_name, email.toLowerCase().trim(), hash, role,
      assigned_state, assigned_district || null,
      perm_publish_apps, perm_upload_unity, perm_manage_geo,
      perm_view_analytics, perm_create_users, perm_edit_curriculum,
      perm_approve_content, perm_export_data, perm_manage_ads, perm_replay_analytics
    ]);

    // FIX: Send credential email (non-blocking — does not affect response)
    sendCredentialEmail({
      to       : email.toLowerCase().trim(),
      full_name, email, password, role
    }).catch(e => console.error('[users] credential email error:', e.message));

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already in use' });
    res.status(500).json({ error: 'Failed to create user' });
  }
});


// ── Bulk Update (role, is_active) ────────────────────────────────────────────
router.post('/bulk-update', requirePerm('perm_create_users'), async (req, res) => {
  try {
    const { ids, role, is_active } = req.body;
    if (!ids?.length) return res.status(400).json({ error: 'No user IDs provided' });
    
    const updates = []; 
    const params = []; 
    let pi = 1;
    
    if (role !== undefined) { 
      updates.push(`role = $${pi++}`);      
      params.push(role); 
    }
    if (is_active !== undefined) { 
      updates.push(`is_active = $${pi++}`); 
      params.push(is_active); 
    }
    
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
    
    params.push(ids);
    
    // ✅ THE FIX: Added ::text[] to tell PostgreSQL exactly what type of array this is
    await query(`UPDATE users SET ${updates.join(', ')}, updated_at=NOW() WHERE id = ANY($${pi}::text[])`, params);
    
    res.json({ success: true, updated: ids.length });
  } catch (e) { 
    // ✅ PRO-TIP: Print the actual error to your Render logs so it's easier to fix next time!
    console.error("Bulk update error:", e); 
    res.status(500).json({ error: 'Bulk update failed' }); 
  }
});

// ── Bulk Delete — CRITICAL FIX: must be registered BEFORE /:id route ─────────
router.delete('/bulk-delete', requirePerm('perm_create_users'), async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids?.length) return res.status(400).json({ error: 'No user IDs provided' });
    const result = await query(`DELETE FROM users WHERE id = ANY($1) RETURNING id`, [ids]);
    res.json({ success: true, deleted: result.rowCount });
  } catch (e) { res.status(500).json({ error: 'Bulk delete failed' }); }
});

// GET /api/users/:id
router.get('/:id', requirePerm('perm_create_users'), async (req, res) => {
  try {
    const result = await query(
      `SELECT id,full_name,email,role,assigned_state,assigned_district,is_active,last_login_at,
              perm_publish_apps,perm_upload_unity,perm_manage_geo,perm_view_analytics,
              perm_create_users,perm_edit_curriculum,perm_approve_content,perm_export_data,
              perm_manage_ads,perm_replay_analytics
       FROM users WHERE id=$1`, [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// PUT /api/users/:id
router.put('/:id', requirePerm('perm_create_users'), async (req, res) => {
  try {
    const allowed = [
      'full_name','role','assigned_state','assigned_district','is_active',
      'perm_publish_apps','perm_upload_unity','perm_manage_geo',
      'perm_view_analytics','perm_create_users','perm_edit_curriculum',
      'perm_approve_content','perm_export_data','perm_manage_ads','perm_replay_analytics'
    ];
    const fields = [];
    const vals   = [];
    allowed.forEach(f => {
      if (req.body[f] !== undefined) { vals.push(req.body[f]); fields.push(`${f}=$${vals.length}`); }
    });
    if (!fields.length) return res.status(400).json({ error: 'No valid fields' });
    vals.push(new Date(), req.params.id);
    const result = await query(
      `UPDATE users SET ${fields.join(',')}, updated_at=$${vals.length-1} WHERE id=$${vals.length} RETURNING id,full_name,email,role,is_active`,
      vals
    );
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// DELETE /api/users/:id  — BUG-FIX #9: DPDP Right to Erasure hard delete
router.delete('/:id', requirePerm('perm_create_users'), async (req, res) => {
  try {
    const { id } = req.params;
    // Hard delete from users table per DPDP §12
    const result = await query(
      `DELETE FROM users WHERE id = $1 RETURNING id, email`, [id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json({
      success: true,
      message: `User ${result.rows[0].email} permanently deleted (DPDP Right to Erasure §12)`,
      deleted_id: result.rows[0].id
    });
  } catch (err) {
    console.error('[users/delete]', err);
    res.status(500).json({ error: 'Delete failed' });
  }
});

// POST /api/users/:id/reset-password
router.post('/:id/reset-password', requirePerm('perm_create_users'), async (req, res) => {
  try {
    const { new_password } = req.body;
    if (!new_password || new_password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    const hash = await bcrypt.hash(new_password, 12);
    await query('UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2', [hash, req.params.id]);
    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Password reset failed' });
  }
});

module.exports = router;
