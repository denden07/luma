import express from 'express';
import multer from 'multer';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import pool from '../db/index.js';
import type { CreateEventRequest, Event } from '../types.js';

const router = express.Router();

const allowedFilters = new Set(['original', 'mono', 'warm-film', 'cool-film', 'high-contrast', 'soft-fade']);
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const coverUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => callback(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)),
});

// GET /api/events - Get all events (optionally filter by host_code)
router.get('/', async (req, res) => {
  try {
    const { host_code } = req.query;
    
    let query = 'SELECT * FROM events WHERE is_active = TRUE';
    const params: any[] = [];
    
    if (host_code) {
      query += ' AND host_code = $1';
      params.push(host_code);
    }
    
    query += ' ORDER BY created_at DESC';
    
    const result = await pool.query<Event>(query, params);
    return res.json(result.rows);
  } catch (error) {
    console.error('Error fetching events:', error);
    return res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// GET /api/events/:id - Get a single event
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query<Event>(
      'SELECT * FROM events WHERE id = $1 AND is_active = TRUE',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching event:', error);
    return res.status(500).json({ error: 'Failed to fetch event' });
  }
});

// POST /api/events - Create a new event
router.post('/', async (req, res) => {
  try {
    const {
      name,
      date,
      guest_limit = 30,
      photo_limit = 20,
      start_time,
      end_time,
      enabled_filters = [],
      host_code,
    }: CreateEventRequest = req.body;
    
    if (!name || !date) {
      return res.status(400).json({ error: 'Name and date are required' });
    }
    
    if (!host_code) {
      return res.status(400).json({ error: 'Host code is required' });
    }

    if (guest_limit < 1 || guest_limit > 30 || photo_limit < 1 || photo_limit > 20) {
      return res.status(400).json({ error: 'Events are limited to 30 guests and 20 photos per guest' });
    }

    if (!Array.isArray(enabled_filters) || enabled_filters.length !== 1 ||
      enabled_filters.some(filter => typeof filter !== 'string' || !allowedFilters.has(filter))) {
      return res.status(400).json({ error: 'Select exactly one valid filter' });
    }
    const filters = [...new Set(enabled_filters)];

    if (start_time && end_time && new Date(start_time) >= new Date(end_time)) {
      return res.status(400).json({ error: 'The event end time must be after the start time' });
    }

    const eventCount = await pool.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM events WHERE host_code = $1',
      [host_code]
    );
    if (Number(eventCount.rows[0].count) >= 2) {
      return res.status(409).json({ error: 'This host already has the maximum of two events' });
    }
    
    const result = await pool.query<Event>(
      `INSERT INTO events (name, date, guest_limit, photo_limit, start_time, end_time, enabled_filters, host_code) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
       RETURNING *`,
      [name, date, guest_limit, photo_limit, start_time || null, end_time || null, JSON.stringify(filters), host_code]
    );
    
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating event:', error);
    return res.status(500).json({ error: 'Failed to create event' });
  }
});

// POST /api/events/:id/cover - Upload or replace an event landing-page background.
router.post('/:id/cover', coverUpload.single('cover'), async (req, res) => {
  const { id: eventId } = req.params;
  const hostCode = req.body.host_code;
  const file = req.file;

  if (!file) return res.status(400).json({ error: 'A JPEG, PNG, or WebP cover image is required' });
  if (!hostCode) return res.status(401).json({ error: 'Host code is required' });

  try {
    const eventResult = await pool.query<Pick<Event, 'cover_photo_path'>>(
      'SELECT cover_photo_path FROM events WHERE id = $1 AND host_code = $2 AND is_active = TRUE',
      [eventId, hostCode]
    );
    if (eventResult.rows.length === 0) return res.status(404).json({ error: 'Event not found' });

    const extension = extname(file.originalname).toLowerCase() ||
      (file.mimetype === 'image/png' ? '.png' : file.mimetype === 'image/webp' ? '.webp' : '.jpg');
    const coverDirectory = join(UPLOAD_DIR, 'events', eventId, 'cover');
    if (!existsSync(coverDirectory)) mkdirSync(coverDirectory, { recursive: true });

    const filename = `${randomUUID()}${extension}`;
    const storagePath = `/events/${eventId}/cover/${filename}`;
    writeFileSync(join(UPLOAD_DIR, storagePath), file.buffer);

    const updateResult = await pool.query<Event>(
      'UPDATE events SET cover_photo_path = $1 WHERE id = $2 RETURNING *',
      [storagePath, eventId]
    );

    const previousPath = eventResult.rows[0].cover_photo_path;
    if (previousPath) {
      const previousFile = join(UPLOAD_DIR, previousPath);
      if (existsSync(previousFile)) unlinkSync(previousFile);
    }

    return res.status(201).json(updateResult.rows[0]);
  } catch (error) {
    console.error('Error uploading event cover:', error);
    return res.status(500).json({ error: 'Failed to upload event cover' });
  }
});

// DELETE /api/events/:id/cover - Remove an event landing-page background.
router.delete('/:id/cover', async (req, res) => {
  const { id: eventId } = req.params;
  const hostCode = req.query.host_code;
  if (typeof hostCode !== 'string' || !hostCode) return res.status(401).json({ error: 'Host code is required' });

  try {
    const eventResult = await pool.query<Pick<Event, 'cover_photo_path'>>(
      'SELECT cover_photo_path FROM events WHERE id = $1 AND host_code = $2 AND is_active = TRUE',
      [eventId, hostCode],
    );
    if (eventResult.rows.length === 0) return res.status(404).json({ error: 'Event not found' });

    const previousPath = eventResult.rows[0].cover_photo_path;
    const updateResult = await pool.query<Event>(
      'UPDATE events SET cover_photo_path = NULL WHERE id = $1 RETURNING *',
      [eventId],
    );
    if (previousPath) {
      const previousFile = join(UPLOAD_DIR, previousPath);
      if (existsSync(previousFile)) unlinkSync(previousFile);
    }
    return res.json(updateResult.rows[0]);
  } catch (error) {
    console.error('Error removing event cover:', error);
    return res.status(500).json({ error: 'Failed to remove event cover' });
  }
});

export default router;
