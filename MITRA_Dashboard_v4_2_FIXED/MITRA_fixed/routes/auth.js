/**
 * routes/auth.js — Login, Token Refresh, Logout
 * POST /api/auth/login
 * POST /api/auth/refresh
 * POST /api/auth/logout
 * GET  /api/auth/me
 */
const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const crypto  = require('crypto');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');

// ── Helpers ───────────────────────────────────────────────────────────────────
function signAccess(user) {
  return jwt.sign(
    {
      id   : user.id,
      email: user.email,
      role : user.role,
      name : user.full_name,
      state: user.assigned_state,
      // Permission flags embedded in token for fast middleware checks
      perm_publish_apps    : user.perm_publish_apps,
      perm_upload_unity    : user.perm_upload_unity,
      perm_manage_geo      : user.perm_manage_geo,
      perm_view_analytics  : user.perm_view_analytics,
      perm_create_users    : user.perm_create_users,
      perm_edit_curriculum : user.perm_edit_curriculum,
      perm_approve_content : user.perm_approve_content,
      perm_export_data     : user.perm_export_data,
      perm_manage_ads      : user.perm_manage_ads,
      perm_replay_analytics: user.perm_replay_analytics
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
}

function signRefresh(userId) {
  return jwt.sign(
    { id: userId },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
}

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await query(
      'SELECT * FROM users WHERE email = $1 AND is_active = true', [email.toLowerCase().trim()]
    );
    if (!result.rows.length) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login
    await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    // Generate tokens
    const accessToken  = signAccess(user);
    const refreshToken = signRefresh(user.id);

    // Store hashed refresh token
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await query(`
      INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
      VALUES ($1, $2, $3, NOW() + INTERVAL '7 days')
    `, [uuidv4(), user.id, tokenHash]);

    res.json({
      token        : accessToken,   // FIX: frontend uses data.token
      access_token : accessToken,   // keep both for API clients
      refresh_token: refreshToken,
      expires_in   : 28800,   // 8h in seconds
      user: {
        id   : user.id,
        name : user.full_name,
        email: user.email,
        role : user.role,
        state: user.assigned_state,
        permissions: {
          publish_apps    : user.perm_publish_apps,
          upload_unity    : user.perm_upload_unity,
          manage_geo      : user.perm_manage_geo,
          view_analytics  : user.perm_view_analytics,
          create_users    : user.perm_create_users,
          edit_curriculum : user.perm_edit_curriculum,
          approve_content : user.perm_approve_content,
          export_data     : user.perm_export_data,
          manage_ads      : user.perm_manage_ads,
          replay_analytics: user.perm_replay_analytics
        }
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// ── POST /api/auth/refresh ────────────────────────────────────────────────────
router.post('/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) return res.status(400).json({ error: 'Refresh token required' });

    let decoded;
    try {
      decoded = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    const tokenHash = crypto.createHash('sha256').update(refresh_token).digest('hex');
    const stored = await query(
      'SELECT * FROM refresh_tokens WHERE token_hash=$1 AND expires_at > NOW()',
      [tokenHash]
    );
    if (!stored.rows.length) {
      return res.status(401).json({ error: 'Refresh token not found or expired' });
    }

    const userRes = await query('SELECT * FROM users WHERE id=$1 AND is_active=true', [decoded.id]);
    if (!userRes.rows.length) return res.status(401).json({ error: 'User not found' });

    const accessToken = signAccess(userRes.rows[0]);
    res.json({ access_token: accessToken, expires_in: 28800 });
  } catch (err) {
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
router.post('/logout', authenticate, async (req, res) => {
  try {
    await query('DELETE FROM refresh_tokens WHERE user_id=$1', [req.user.id]);
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Logout failed' });
  }
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get('/me', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, full_name, email, role, assigned_state, assigned_district,
              is_active, last_login_at, created_at,
              perm_publish_apps, perm_upload_unity, perm_manage_geo,
              perm_view_analytics, perm_create_users, perm_edit_curriculum,
              perm_approve_content, perm_export_data, perm_manage_ads,
              perm_replay_analytics
       FROM users WHERE id = $1`, [req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// ── sendCredentialEmail — FIX: emails credentials on user create ─────────────
// Requires nodemailer + SMTP env vars. Logs to console if not configured.
async function sendCredentialEmail({ to, full_name, email, password, role }) {
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  const subject = 'Your MITRA Dashboard credentials';
  const text = [
    `Dear ${full_name},`,
    '',
    'Your MITRA Government School Platform admin account has been created.',
    '',
    `Login URL : ${process.env.API_BASE_URL || 'https://dashboard.mitra.gov.in'}`,
    `Email     : ${email}`,
    `Password  : ${password}`,
    `Role      : ${role}`,
    '',
    'Please change your password after first login.',
    '',
    'MITRA Platform · Ministry of Education'
  ].join('\n');

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.warn('[auth] SMTP not configured — credential email NOT sent to', to);
    console.info('[auth] Credentials for', email, ':', password);
    return;
  }

  try {
    const nodemailer = require('nodemailer');
    const transport  = nodemailer.createTransport({
      host: smtpHost,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: smtpUser, pass: smtpPass }
    });
    await transport.sendMail({
      from   : process.env.SMTP_FROM || smtpUser,
      to,
      subject,
      text
    });
    console.info('[auth] Credential email sent to', to);
  } catch (err) {
    console.error('[auth] Failed to send credential email:', err.message);
  }
}

module.exports = router;
module.exports.sendCredentialEmail = sendCredentialEmail;
