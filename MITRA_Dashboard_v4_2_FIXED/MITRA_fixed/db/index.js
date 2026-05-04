/**
 * Database connection pool — PostgreSQL via node-postgres
 */
const { Pool } = require('pg');

// BUG-FIX #7: Accept DATABASE_URL (e.g. Heroku/Railway/Render) with fallback to individual env vars
const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false }
    }
  : {
      host     : process.env.DB_HOST     || 'localhost',
      port     : parseInt(process.env.DB_PORT) || 5432,
      database : process.env.DB_NAME     || 'mitra_dashboard',
      user     : process.env.DB_USER     || 'mitra_admin',
      password : process.env.DB_PASSWORD || '',
      ssl      : process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
    };

const pool = new Pool({
  ...poolConfig,
  max                    : 20,
  idleTimeoutMillis      : 30000,
  connectionTimeoutMillis: 5000
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL client error:', err);
});

/**
 * Execute a parameterised query
 * @param {string} text   SQL string with $1, $2 … placeholders
 * @param {Array}  params Parameter values
 */
async function query(text, params = []) {
  const start  = Date.now();
  const result = await pool.query(text, params);
  const dur    = Date.now() - start;
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[DB] ${dur}ms — ${text.slice(0, 80)}`);
  }
  return result;
}

/** Test connectivity at startup */
async function testConnection() {
  try {
    const res = await pool.query('SELECT NOW()');
    console.log('✅ PostgreSQL connected:', res.rows[0].now);

// --- BULLETPROOF SCORE FIX ---
    try {
      console.log("⏳ Attempting to add the score_pct column...");
      await pool.query(`
        ALTER TABLE quiz_attempts 
        ADD COLUMN IF NOT EXISTS score_pct INTEGER;
      `);
      console.log("💯💯💯 SCORE BOX ADDED SUCCESSFULLY! 💯💯💯");
    } catch (err) {
      console.log("🚨 DATABASE FIX FAILED:", err.message);
    }
    // --------------------------------
    
  } catch (err) {
    console.error('❌ PostgreSQL connection failed:', err.message);
    console.error('   Check your .env DB_* settings and that PostgreSQL is running.');
    process.exit(1);
  }
}

module.exports = { query, pool, testConnection };
