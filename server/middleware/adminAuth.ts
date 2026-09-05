import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import type { NextFunction, Request, Response } from 'express';
import pool from '../db/index.js';

const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = 'luma_admin_session';
const CSRF_COOKIE = 'luma_admin_csrf_v2';
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

export interface AdminSession {
  adminId: string;
  csrfToken: string;
}

declare global {
  namespace Express {
    interface Request {
      adminSession?: AdminSession;
    }
  }
}

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function getCookie(req: Request, name: string) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return undefined;
  return cookieHeader.split(';').map(value => value.trim()).find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = await scrypt(password, salt, 64) as Buffer;
  return `${salt}:${derivedKey.toString('hex')}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [salt, expected] = storedHash.split(':');
  if (!salt || !expected) return false;
  const derivedKey = await scrypt(password, salt, 64) as Buffer;
  const expectedBuffer = Buffer.from(expected, 'hex');
  return expectedBuffer.length === derivedKey.length && timingSafeEqual(expectedBuffer, derivedKey);
}

export async function createAdminSession(adminId: string) {
  const token = randomBytes(32).toString('base64url');
  const csrfToken = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  await pool.query(
    'INSERT INTO admin_sessions (admin_id, token_hash, csrf_token_hash, expires_at) VALUES ($1, $2, $3, $4)',
    [adminId, hash(token), hash(csrfToken), expiresAt],
  );
  return { token, csrfToken, expiresAt };
}

export function setAdminSessionCookie(res: Response, token: string, expiresAt: Date) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/admin',
    expires: expiresAt,
  });
}

export function setAdminCsrfCookie(res: Response, token: string, expiresAt: Date) {
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    expires: expiresAt,
  });
}

export function clearAdminSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/admin',
  });
  res.clearCookie(CSRF_COOKIE, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  });
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const token = getCookie(req, SESSION_COOKIE);
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  try {
    const result = await pool.query<{ admin_id: string; csrf_token_hash: string }>(
      `SELECT sessions.admin_id, sessions.csrf_token_hash
       FROM admin_sessions sessions
       JOIN admin_accounts accounts ON accounts.id = sessions.admin_id
       WHERE sessions.token_hash = $1 AND sessions.expires_at > NOW() AND accounts.is_active = TRUE`,
      [hash(token)],
    );
    const session = result.rows[0];
    if (!session) return res.status(401).json({ error: 'Authentication required' });
    req.adminSession = { adminId: session.admin_id, csrfToken: session.csrf_token_hash };
    return next();
  } catch (error) {
    return next(error);
  }
}

export function requireCsrf(req: Request, res: Response, next: NextFunction) {
  const csrfToken = req.get('X-CSRF-Token');
  if (!csrfToken || !req.adminSession || !timingSafeEqual(Buffer.from(hash(csrfToken)), Buffer.from(req.adminSession.csrfToken))) {
    return res.status(403).json({ error: 'Invalid request token' });
  }
  return next();
}

export async function revokeAdminSession(req: Request) {
  const token = getCookie(req, SESSION_COOKIE);
  if (token) await pool.query('DELETE FROM admin_sessions WHERE token_hash = $1', [hash(token)]);
}