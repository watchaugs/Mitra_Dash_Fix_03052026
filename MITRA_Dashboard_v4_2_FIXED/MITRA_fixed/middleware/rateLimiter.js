/**
 * middleware/rateLimiter.js — API Rate Limiting (Step 11)
 * MITRA Dashboard · In-memory sliding window rate limiter
 *
 * No external dependency required — uses a simple in-memory Map.
 * For production with multiple nodes, replace with redis-based limiter.
 */

// ── In-memory store ──────────────────────────────────────────────────────────
const requestStore = new Map(); // key → [timestamps]

/**
 * Generic rate limiter factory
 * @param {object} opts
 * @param {number} opts.windowMs   – time window in milliseconds
 * @param {number} opts.max        – max requests per window
 * @param {string} opts.message    – error message when limit hit
 * @param {function} [opts.keyFn] – custom key function (default: IP)
 */
function createRateLimiter({ windowMs = 900000, max = 100, message = 'Too many requests, please try again later.', keyFn }) {
  // Clean up old entries every 5 minutes to prevent memory leaks
  setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [key, timestamps] of requestStore.entries()) {
      const filtered = timestamps.filter(t => t > cutoff);
      if (filtered.length === 0) requestStore.delete(key);
      else requestStore.set(key, filtered);
    }
  }, 300000);

  return function rateLimitMiddleware(req, res, next) {
    const key = keyFn ? keyFn(req) : (req.ip || req.connection?.remoteAddress || 'unknown');
    const now = Date.now();
    const cutoff = now - windowMs;

    const timestamps = (requestStore.get(key) || []).filter(t => t > cutoff);
    timestamps.push(now);
    requestStore.set(key, timestamps);

    const remaining = Math.max(0, max - timestamps.length);
    const resetAt = Math.ceil((timestamps[0] + windowMs) / 1000);

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', resetAt);

    if (timestamps.length > max) {
      res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
      return res.status(429).json({
        error: message,
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
    next();
  };
}

// ── Auth route limiter — strict: 20 attempts per 15 minutes per IP ────────────
const authLimiter = createRateLimiter({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000, // 15 min
  max     : parseInt(process.env.AUTH_RATE_LIMIT_MAX) || 20,
  message : 'Too many login attempts. Please wait 15 minutes before retrying.',
  keyFn   : req => 'auth:' + (req.ip || 'unknown')
});

// ── General API limiter — 500 requests per 15 minutes per IP ─────────────────
const apiLimiter = createRateLimiter({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
  max     : parseInt(process.env.RATE_LIMIT_MAX) || 500,
  message : 'Rate limit exceeded. Please slow down your requests.',
  keyFn   : req => 'api:' + (req.ip || 'unknown')
});

// ── Compliance/purge limiter — very strict: 10 per hour ──────────────────────
const complianceLimiter = createRateLimiter({
  windowMs: 3600000, // 1 hour
  max     : 10,
  message : 'Compliance action rate limit exceeded. Max 10 sensitive actions per hour.',
  keyFn   : req => 'compliance:' + (req.user?.id || req.ip || 'unknown')
});

// ── FCM/Notification send limiter — 200 sends per hour ───────────────────────
const notifSendLimiter = createRateLimiter({
  windowMs: 3600000,
  max     : 200,
  message : 'Notification send limit exceeded. Max 200 pushes per hour.',
  keyFn   : req => 'notif:' + (req.user?.id || req.ip || 'unknown')
});

module.exports = { authLimiter, apiLimiter, complianceLimiter, notifSendLimiter };
