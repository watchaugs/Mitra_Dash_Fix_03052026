/**
 * MITRA Dashboard — Main API Server v4.0
 * Government School AR Platform · Master Control Backend
 */

require('dotenv').config();
const express     = require('express');
const cors        = require('cors');
const helmet      = require('helmet');
const morgan      = require('morgan');
const compression = require('compression');
const rateLimit   = require('express-rate-limit');
const { authLimiter, apiLimiter, complianceLimiter, notifSendLimiter } = require('./middleware/rateLimiter');
const path        = require('path');

const { testConnection } = require('./db');

// ── Route Imports ────────────────────────────────────────────────────────────
const authRoutes            = require('./routes/auth');
const analyticsRoutes       = require('./routes/analytics');
const unityRoutes           = require('./routes/unity');
const curriculumRoutes      = require('./routes/curriculum');
const appBuilderRoutes      = require('./routes/appBuilder');
const dashboardRoutes       = require('./routes/dashboard');
const quizRoutes            = require('./routes/quiz');
const locationsRoutes       = require('./routes/locations');
const arAssetsRoutes        = require('./routes/ar_assets');
const uploadsRoutes         = require('./routes/uploads');
const notificationsRoutes   = require('./routes/notifications');
const complianceRoutes      = require('./routes/compliance');
const usersRoutes           = require('./routes/users');           // BUG-FIX #1
const advertisementsRoutes  = require('./routes/advertisements'); // BUG-FIX #1
const tenantRoutes          = require('./routes/tenant');          // NEW: Tenant DB Links
const geofenceRoutes        = require('./routes/geofence');        // FIX: was never registered

const app = express();
app.set('trust proxy', 1); 

const PORT = process.env.PORT || 3000;
// ── Security & Performance ───────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
      scriptSrcAttr:  ["'unsafe-inline'"],  // <-- FIX 1: Allows inline button clicks
      styleSrc:       ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      fontSrc:        ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      imgSrc:         ["'self'", "data:", "blob:", "https:"],
      connectSrc:     ["'self'", "https://fcm.googleapis.com", "https://cdn.jsdelivr.net", process.env.ALLOWED_ORIGINS || ""].filter(Boolean),
      frameSrc:       ["'self'", "blob:"],  // <-- FIX 2: Allows the blob preview windows
      objectSrc:      ["'none'"],
    }
  },
  crossOriginEmbedderPolicy: false  // Allow embedding of AR assets
}));
app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',');
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

// ── Rate Limiting ─────────────────────────────────────────────────────────────
app.use('/api/', rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' }
}));
// authLimiter applied once here — auth route mount below also applies it once (correct)
app.use('/api', apiLimiter);

// ── Body Parsers ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Static Files ──────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',        authLimiter, authRoutes);  // FIX: single limiter application
app.use('/api/dashboard',   dashboardRoutes);
app.use('/api/analytics',   analyticsRoutes);
app.use('/api/unity',       unityRoutes);          // legacy AR upload endpoint
app.use('/api/ar',          arAssetsRoutes);        // new AR asset management
app.use('/api/curriculum',  curriculumRoutes);
app.use('/api/app-builder', appBuilderRoutes);
app.use('/api/quiz',        quizRoutes);
app.use('/api/locations',   locationsRoutes);
app.use('/api/uploads',       uploadsRoutes);           // general uploads
app.use('/api/notifications/send',      notifSendLimiter);
app.use('/api/notifications/schedule',  notifSendLimiter);
app.use('/api/notifications', notificationsRoutes);   // push notification engine
app.use('/api/compliance/purge-user',   complianceLimiter);
app.use('/api/compliance/run-auto-purge', complianceLimiter);
app.use('/api/compliance',    complianceRoutes);       // DPDP/CERT-In compliance
app.use('/api/users',        usersRoutes);            // BUG-FIX #1: was missing
app.use('/api/ads',          advertisementsRoutes);   // BUG-FIX #1: was missing
app.use('/api/tenant',       tenantRoutes);           // NEW: Tenant Database Links
app.use('/api/geofence',     geofenceRoutes);          // FIX: geofence was never registered

// ── Health Check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status  : 'ok',
    service : 'MITRA Dashboard API',
    version : '4.1.0',  // BUG-FIX #2
    time    : new Date().toISOString()
  });
});

// ── SPA Fallback ──────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Global Error Handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'CORS: Origin not permitted' });
  }
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
  });
});

// ── Boot ──────────────────────────────────────────────────────────────────────
async function boot() {
  await testConnection();
  // FIX: Run migrations on startup so tenant_app_files and v4.1 tables always exist
  try {
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
    const client = await pool.connect();
    await client.query(`CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY, filename VARCHAR(200) UNIQUE NOT NULL, applied_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    const migrations = [
      'schema.sql', 'schema_quiz.sql', 'schema_v4.sql',
      path.join('migrations', 'v4.1_notifications_compliance.sql')
    ];
    for (const file of migrations) {
      const fp = path.join(__dirname, 'db', file);
      if (!fs.existsSync(fp)) continue;
      const key = path.basename(file);
      const seen = await client.query('SELECT id FROM _migrations WHERE filename=$1', [key]);
      if (seen.rows.length) continue;
      console.log(`⏳ Applying migration: ${key}`);
      await client.query(fs.readFileSync(fp, 'utf8'));
      await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [key]);
      console.log(`✅ Migration applied: ${key}`);
    }
    client.release();
    await pool.end();
  } catch (migrErr) {
    console.warn('[boot] Migration warning (non-fatal):', migrErr.message);
  }

  app.listen(PORT, () => {
    console.log(`\n🚀 MITRA API v4.0 running on http://localhost:${PORT}`);
    console.log(`📊 Dashboard   → http://localhost:${PORT}`);
    console.log(`🔌 API Base    → http://localhost:${PORT}/api`);
    console.log(`🎮 AR Assets   → http://localhost:${PORT}/api/ar`);
    console.log(`📚 Curriculum  → http://localhost:${PORT}/api/curriculum`);
    console.log(`❤️  Health      → http://localhost:${PORT}/api/health\n`);
  });
}

boot().catch(err => {
  console.error('Fatal boot error:', err);
  process.exit(1);
});

module.exports = app;
