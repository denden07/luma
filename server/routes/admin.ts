import { createHash, randomInt } from 'crypto';
import { Router } from 'express';
import pool from '../db/index.js';
import {
  clearAdminSessionCookie,
  createAdminSession,
  hashPassword,
  requireAdmin,
  requireCsrf,
  revokeAdminSession,
  setAdminCsrfCookie,
  setAdminSessionCookie,
  verifyPassword,
} from '../middleware/adminAuth.js';

const router = Router();
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;
const LOGIN_WINDOW_MINUTES = 15;
const HOST_CODE_CHARACTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function validEmail(email: unknown): email is string {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 255;
}

function validPassword(password: unknown): password is string {
  return typeof password === 'string' && password.length >= 12 && password.length <= 128;
}

function generateHostCode() {
  return Array.from({ length: 6 }, () => HOST_CODE_CHARACTERS[randomInt(HOST_CODE_CHARACTERS.length)]).join('');
}

function requestIpHash(ip: string) {
  return createHash('sha256').update(ip).digest('hex');
}

router.post('/bootstrap', async (req, res, next) => {
  try {
    const bootstrapSecret = process.env.ADMIN_BOOTSTRAP_SECRET;
    const { email, password, secret } = req.body;
    if (!bootstrapSecret || secret !== bootstrapSecret || !validEmail(email) || !validPassword(password)) {
      return res.status(403).json({ error: 'Bootstrap unavailable' });
    }
    const existing = await pool.query('SELECT id FROM admin_accounts LIMIT 1');
    if (existing.rowCount) return res.status(409).json({ error: 'Bootstrap unavailable' });
    const passwordHash = await hashPassword(password);
    await pool.query('INSERT INTO admin_accounts (email, password_hash) VALUES ($1, $2)', [email.toLowerCase(), passwordHash]);
    return res.status(201).json({ status: 'Admin account created' });
  } catch (error) {
    return next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const ipHash = requestIpHash(req.ip);
    const recentAttempts = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM admin_login_attempts
       WHERE ip_hash = $1 AND attempted_at > NOW() - INTERVAL '${LOGIN_WINDOW_MINUTES} minutes'`,
      [ipHash],
    );
    if (Number(recentAttempts.rows[0].count) >= MAX_FAILED_LOGINS) {
      return res.status(429).json({ error: 'Too many attempts. Try again later.' });
    }
    if (!validEmail(email) || !validPassword(password)) return res.status(401).json({ error: 'Invalid email or password' });
    const result = await pool.query<{ id: string; password_hash: string; locked_until: Date | null }>(
      'SELECT id, password_hash, locked_until FROM admin_accounts WHERE email = $1 AND is_active = TRUE',
      [email.toLowerCase()],
    );
    const admin = result.rows[0];
    const isLocked = admin?.locked_until && admin.locked_until.getTime() > Date.now();
    const isValid = Boolean(admin) && !isLocked && await verifyPassword(password, admin.password_hash);
    if (!isValid) {
      await pool.query('INSERT INTO admin_login_attempts (ip_hash) VALUES ($1)', [ipHash]);
      if (admin && !isLocked) {
        await pool.query(
          `UPDATE admin_accounts
           SET failed_login_attempts = failed_login_attempts + 1,
               locked_until = CASE WHEN failed_login_attempts + 1 >= $2 THEN NOW() + INTERVAL '${LOCKOUT_MINUTES} minutes' ELSE NULL END
           WHERE id = $1`,
          [admin.id, MAX_FAILED_LOGINS],
        );
      }
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    await pool.query('UPDATE admin_accounts SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1', [admin.id]);
    const session = await createAdminSession(admin.id);
    setAdminSessionCookie(res, session.token, session.expiresAt);
    setAdminCsrfCookie(res, session.csrfToken, session.expiresAt);
    return res.json({ authenticated: true });
  } catch (error) {
    return next(error);
  }
});

router.get('/session', requireAdmin, (req, res) => {
  return res.json({ authenticated: true, adminId: req.adminSession!.adminId });
});

router.post('/logout', requireAdmin, requireCsrf, async (req, res, next) => {
  try {
    await revokeAdminSession(req);
    clearAdminSessionCookie(res);
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

router.get('/events/month', requireAdmin, async (req, res, next) => {
  try {
    const year = Number.parseInt(String(req.query.year), 10);
    const month = Number.parseInt(String(req.query.month), 10);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return res.status(400).json({ error: 'A valid year and month are required' });
    }
    const result = await pool.query(
      `SELECT events.*,
        (SELECT COUNT(*)::integer FROM participants WHERE participants.event_id = events.id) AS participant_count,
        (SELECT COUNT(*)::integer FROM photos WHERE photos.event_id = events.id) AS photo_count
       FROM events
       WHERE EXTRACT(YEAR FROM events.date) = $1
         AND EXTRACT(MONTH FROM events.date) = $2
       ORDER BY date ASC, created_at ASC`,
      [year, month],
    );
    return res.json(result.rows);
  } catch (error) {
    return next(error);
  }
});

router.get('/events/page', requireAdmin, async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? '1'), 10) || 1);
    const requestedPageSize = Number.parseInt(String(req.query.page_size ?? '10'), 10);
    const pageSize = [10, 20, 50].includes(requestedPageSize) ? requestedPageSize : 10;
    const allowedSorts = { date: 'events.date', name: 'events.name', host: 'events.host_code', status: 'events.is_active', price: 'events.price_php', payment: 'events.payment_status' } as const;
    const sort = String(req.query.sort ?? 'date') as keyof typeof allowedSorts;
    const sortColumn = allowedSorts[sort] ?? allowedSorts.date;
    const conditions: string[] = [];
    const values: unknown[] = [];
    const hostCode = typeof req.query.host_code === 'string' ? req.query.host_code : '';
    const status = typeof req.query.status === 'string' ? req.query.status : 'all';
    const payment = typeof req.query.payment === 'string' ? req.query.payment : 'all';
    const startDate = typeof req.query.start_date === 'string' ? req.query.start_date : '';
    const endDate = typeof req.query.end_date === 'string' ? req.query.end_date : '';
    if (hostCode) { values.push(hostCode); conditions.push(`events.host_code = $${values.length}`); }
    if (status === 'active' || status === 'inactive') { values.push(status === 'active'); conditions.push(`events.is_active = $${values.length}`); }
    if (['unpaid', 'partial', 'paid'].includes(payment)) { values.push(payment); conditions.push(`events.payment_status = $${values.length}`); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(startDate)) { values.push(startDate); conditions.push(`events.date >= $${values.length}::date`); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(endDate)) { values.push(endDate); conditions.push(`events.date < $${values.length}::date + INTERVAL '1 day'`); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const totalResult = await pool.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM events ${where}`, values);
    values.push(pageSize, (page - 1) * pageSize);
    const result = await pool.query(
      `SELECT events.*,
        (SELECT COUNT(*)::integer FROM participants WHERE participants.event_id = events.id) AS participant_count,
        (SELECT COUNT(*)::integer FROM photos WHERE photos.event_id = events.id) AS photo_count
       FROM events ${where}
       ORDER BY ${sortColumn} ASC, events.created_at ASC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    return res.json({ events: result.rows, page, pageSize, total: Number(totalResult.rows[0].count) });
  } catch (error) {
    return next(error);
  }
});

router.get('/hosts/page', requireAdmin, async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? '1'), 10) || 1);
    const requestedPageSize = Number.parseInt(String(req.query.page_size ?? '10'), 10);
    const pageSize = [10, 20, 50].includes(requestedPageSize) ? requestedPageSize : 10;
    const search = typeof req.query.search === 'string' ? req.query.search.trim().toUpperCase() : '';
    const startDate = typeof req.query.start_date === 'string' ? req.query.start_date : '';
    const endDate = typeof req.query.end_date === 'string' ? req.query.end_date : '';
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (search) { values.push(`%${search}%`); conditions.push(`hosts.code ILIKE $${values.length}`); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(startDate)) { values.push(startDate); conditions.push(`hosts.created_at >= $${values.length}::date`); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(endDate)) { values.push(endDate); conditions.push(`hosts.created_at < $${values.length}::date + INTERVAL '1 day'`); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const totalResult = await pool.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM hosts ${where}`, values);
    values.push(pageSize, (page - 1) * pageSize);
    const result = await pool.query(
      `SELECT hosts.id, hosts.code, hosts.is_active, hosts.created_at, COUNT(events.id)::integer AS event_count
       FROM hosts
       LEFT JOIN events ON events.host_code = hosts.code
       ${where}
       GROUP BY hosts.id, hosts.code, hosts.is_active, hosts.created_at
       ORDER BY hosts.created_at DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    return res.json({ hosts: result.rows, page, pageSize, total: Number(totalResult.rows[0].count) });
  } catch (error) {
    return next(error);
  }
});

router.patch('/hosts/:id', requireAdmin, requireCsrf, async (req, res, next) => {
  try {
    const { is_active: isActive } = req.body;
    if (typeof isActive !== 'boolean') return res.status(400).json({ error: 'Invalid host availability' });
    const result = await pool.query(
      'UPDATE hosts SET is_active = $1 WHERE id = $2 RETURNING id, code, is_active, created_at',
      [isActive, req.params.id],
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Host not found' });
    return res.json(result.rows[0]);
  } catch (error) {
    return next(error);
  }
});

router.post('/host-codes', requireAdmin, requireCsrf, async (_req, res, next) => {
  try {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = generateHostCode();
      try {
        const result = await pool.query('INSERT INTO hosts (code) VALUES ($1) RETURNING id, code, created_at', [code]);
        return res.status(201).json(result.rows[0]);
      } catch (error: unknown) {
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') continue;
        throw error;
      }
    }
    return res.status(503).json({ error: 'Could not generate a host code' });
  } catch (error) {
    return next(error);
  }
});

router.patch('/events/:id', requireAdmin, requireCsrf, async (req, res, next) => {
  try {
    const { is_active: isActive, price_php: pricePhp, payment_status: paymentStatus } = req.body;
    if (isActive !== undefined && typeof isActive !== 'boolean') return res.status(400).json({ error: 'Invalid event availability' });
    if (pricePhp !== undefined && (!Number.isInteger(pricePhp) || pricePhp < 0)) return res.status(400).json({ error: 'Price must be a non-negative whole PHP amount' });
    if (paymentStatus !== undefined && !['unpaid', 'partial', 'paid'].includes(paymentStatus)) return res.status(400).json({ error: 'Invalid payment status' });
    if (isActive === undefined && pricePhp === undefined && paymentStatus === undefined) return res.status(400).json({ error: 'No event changes provided' });

    const result = await pool.query(
      `UPDATE events
       SET is_active = COALESCE($1, is_active),
           price_php = COALESCE($2, price_php),
           payment_status = COALESCE($3, payment_status)
       WHERE id = $4
       RETURNING *`,
      [isActive ?? null, pricePhp ?? null, paymentStatus ?? null, req.params.id],
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Event not found' });
    return res.json(result.rows[0]);
  } catch (error) {
    return next(error);
  }
});

export default router;