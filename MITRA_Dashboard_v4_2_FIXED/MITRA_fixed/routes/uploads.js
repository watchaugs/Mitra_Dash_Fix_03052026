/**
 * routes/uploads.js — Unified upload handler for all dashboard file types
 *
 * Handles uploads to the correct sub-directory and records metadata in DB.
 *
 * POST /api/uploads/quiz-xlsx     Upload XLSX for bulk quiz import
 * POST /api/uploads/app-icon      Upload app icon (PNG/SVG)
 * POST /api/uploads/app-splash    Upload splash screen image
 * GET  /api/uploads/file/:id      Serve an uploaded file by record ID
 * GET  /api/uploads               List recent uploads (admin)
 * DELETE /api/uploads/:id         Delete a recorded upload + disk file
 */

const router = require('express').Router();
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const { v4: uuidv4 } = require('uuid');
const { query }      = require('../db');
const { authenticate, requirePerm } = require('../middleware/auth');

router.use(authenticate);

// ── Generic factory: multer storage for a given sub-directory ────────────────
function makeStorage(subDir) {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(process.env.UPLOAD_DIR || './uploads', subDir);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${uuidv4()}${ext}`);
    }
  });
}

// ── Upload record helper: save metadata to DB ─────────────────────────────────
async function recordUpload(userId, category, originalName, filePath, fileSize, meta = {}) {
  try {
    const result = await query(`
      INSERT INTO uploads (id, uploaded_by, category, original_name, file_path, file_size_bytes, meta)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
    `, [uuidv4(), userId, category, originalName, filePath, fileSize, JSON.stringify(meta)]);
    return result.rows[0];
  } catch (err) {
    // uploads table may not exist yet — log but don't block
    console.warn('Upload record insert failed (run migration):', err.message);
    return null;
  }
}

// ══ POST /api/uploads/quiz-xlsx ═══════════════════════════════════════════════
const quizXlsxUpload = multer({
  storage: makeStorage('quiz_xlsx'),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.xlsx', '.xls', '.csv'].includes(ext)) return cb(null, true);
    cb(new Error('Only .xlsx, .xls, .csv files accepted for quiz upload'));
  }
});

router.post('/quiz-xlsx', requirePerm('perm_edit_curriculum'),
  (req, res, next) => quizXlsxUpload.single('file')(req, res, err => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  }),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });
    const record = await recordUpload(req.user.id, 'quiz_xlsx',
      req.file.originalname, req.file.path, req.file.size,
      { state: req.body.state || null, description: req.body.description || null }
    );
    res.status(201).json({
      message: 'Quiz XLSX uploaded — processing will begin shortly',
      file: {
        id: record?.id,
        originalName: req.file.originalname,
        size: req.file.size,
        path: req.file.path
      }
    });
  }
);

// ══ POST /api/uploads/app-icon ════════════════════════════════════════════════
const imageUpload = multer({
  storage: makeStorage('app_assets'),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif'].includes(ext)) return cb(null, true);
    cb(new Error('Only image files accepted'));
  }
});

router.post('/app-icon', requirePerm('perm_publish_apps'),
  (req, res, next) => imageUpload.single('icon')(req, res, err => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  }),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });
    const record = await recordUpload(req.user.id, 'app_icon',
      req.file.originalname, req.file.path, req.file.size,
      { app_id: req.body.app_id || null }
    );
    // Optionally update the state_apps table
    if (req.body.app_id) {
      try {
        await query(
          `UPDATE state_apps SET icon_path = $1, updated_at = NOW() WHERE id = $2`,
          [req.file.path, req.body.app_id]
        );
      } catch {}
    }
    res.status(201).json({ message: 'App icon uploaded', record });
  }
);

router.post('/app-splash', requirePerm('perm_publish_apps'),
  (req, res, next) => imageUpload.single('splash')(req, res, err => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  }),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });
    const record = await recordUpload(req.user.id, 'app_splash',
      req.file.originalname, req.file.path, req.file.size,
      { app_id: req.body.app_id || null }
    );
    res.status(201).json({ message: 'Splash screen uploaded', record });
  }
);

// ══ GET /api/uploads ══════════════════════════════════════════════════════════
router.get('/', async (req, res) => {
  try {
    const { category, limit = 50, offset = 0 } = req.query;
    const conditions = [];
    const params = [];
    let p = 1;

    if (category) { conditions.push(`category = $${p++}`); params.push(category); }
    params.push(parseInt(limit), parseInt(offset));

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await query(`
      SELECT u.*, usr.full_name AS uploaded_by_name
      FROM uploads u
      LEFT JOIN users usr ON usr.id = u.uploaded_by
      ${where}
      ORDER BY u.created_at DESC
      LIMIT $${p++} OFFSET $${p++}
    `, params);

    res.json({ data: result.rows, limit: parseInt(limit), offset: parseInt(offset) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list uploads' });
  }
});

// ══ GET /api/uploads/file/:id ═════════════════════════════════════════════════
router.get('/file/:id', async (req, res) => {
  try {
    const result = await query('SELECT * FROM uploads WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'File not found' });
    const record = result.rows[0];
    if (!fs.existsSync(record.file_path)) return res.status(410).json({ error: 'File no longer on disk' });
    res.download(record.file_path, record.original_name);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve file' });
  }
});

// ══ DELETE /api/uploads/:id ═══════════════════════════════════════════════════
router.delete('/:id', requirePerm('perm_upload_unity'), async (req, res) => {
  try {
    const result = await query('SELECT * FROM uploads WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Upload record not found' });
    const record = result.rows[0];
    // Delete physical file
    if (record.file_path && fs.existsSync(record.file_path)) {
      fs.unlinkSync(record.file_path);
    }
    await query('DELETE FROM uploads WHERE id = $1', [req.params.id]);
    res.json({ message: 'Upload deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete upload' });
  }
});

module.exports = router;
