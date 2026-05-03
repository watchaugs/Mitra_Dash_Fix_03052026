/**
 * middleware/auth.js — JWT verification & role/permission guards
 */
const jwt = require('jsonwebtoken');

/**
 * Verify Bearer token and attach req.user
 */
function authenticate(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * Require one of the listed roles
 * @param {...string} roles
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient role', required: roles });
    }
    next();
  };
}

/**
 * Require a specific permission flag (from users table)
 * @param {string} perm  e.g. 'perm_manage_ads'
 */
function requirePerm(perm) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (!req.user[perm] && req.user.role !== 'master_admin') {
      return res.status(403).json({ error: `Permission '${perm}' required` });
    }
    next();
  };
}

/**
 * Master admin only — strictest guard
 */
const masterAdminOnly = requireRole('master_admin');

module.exports = { authenticate, requireRole, requirePerm, masterAdminOnly };
