import { Router } from 'express';
import multer from 'multer';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import pool from '../db/index.js';
import type { EventWebsite, UpdateEventWebsiteRequest, WebsiteDocument, WebsiteSection, WebsiteSectionType } from '../types.js';

const router = Router();
export const publicWebsitesRouter = Router();
const templateIds = new Set(['garden', 'modern', 'classic']);
const sectionTypes = new Set<WebsiteSectionType>(['hero', 'story', 'details', 'gallery', 'entourage', 'rsvp', 'closing']);
const paletteIds = new Set(['garden', 'modern', 'classic']);
const fontPairIds = new Set(['modern', 'editorial', 'classic']);
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const websiteAssetUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => callback(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)),
});
const reservedSlugs = new Set(['admin', 'api', 'assets', 'dashboard', 'e', 'host', 'login', 'uploads']);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function isWebsiteDocument(value: unknown): value is WebsiteDocument {
  if (!isRecord(value) || value.schema_version !== 1 || typeof value.template_id !== 'string' || !templateIds.has(value.template_id)) return false;
  if (!isRecord(value.theme) || typeof value.theme.palette_id !== 'string' || !paletteIds.has(value.theme.palette_id) || typeof value.theme.font_pair_id !== 'string' || !fontPairIds.has(value.theme.font_pair_id)) return false;
  if (!Array.isArray(value.sections) || value.sections.length === 0 || value.sections.length > 20) return false;

  return value.sections.every((section): section is WebsiteSection => (
    isRecord(section) &&
    typeof section.id === 'string' && section.id.length > 0 && section.id.length <= 100 &&
    typeof section.type === 'string' && sectionTypes.has(section.type as WebsiteSectionType) &&
    typeof section.visible === 'boolean' &&
    isRecord(section.content)
  ));
}

async function hostOwnsEvent(eventId: string, hostCode: unknown): Promise<boolean> {
  if (typeof hostCode !== 'string' || !hostCode) return false;
  const result = await pool.query(
    'SELECT 1 FROM events WHERE id = $1 AND host_code = $2 AND is_active = TRUE',
    [eventId, hostCode],
  );
  return result.rowCount === 1;
}

function normalizeSlug(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const slug = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length < 3 || slug.length > 120 || reservedSlugs.has(slug)) return null;
  return slug;
}

router.get('/:eventId/website', async (req, res) => {
  const { eventId } = req.params;
  const hostCode = req.query.host_code;

  try {
    if (!await hostOwnsEvent(eventId, hostCode)) return res.status(404).json({ error: 'Website not found' });
    const result = await pool.query<EventWebsite>('SELECT * FROM event_websites WHERE event_id = $1', [eventId]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Website not created' });
    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Error loading event website:', error);
    return res.status(500).json({ error: 'Failed to load website' });
  }
});

router.put('/:eventId/website', async (req, res) => {
  const { eventId } = req.params;
  const { host_code: hostCode, document } = req.body as UpdateEventWebsiteRequest;

  if (!isWebsiteDocument(document)) return res.status(400).json({ error: 'Website content is invalid' });

  try {
    if (!await hostOwnsEvent(eventId, hostCode)) return res.status(404).json({ error: 'Event not found' });
    const result = await pool.query<EventWebsite>(
      `INSERT INTO event_websites (event_id, draft_document)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (event_id) DO UPDATE
       SET draft_document = EXCLUDED.draft_document,
           draft_version = event_websites.draft_version + 1
       RETURNING *`,
      [eventId, JSON.stringify(document)],
    );
    return res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error('Error saving event website:', error);
    return res.status(500).json({ error: 'Failed to save website' });
  }
});

router.get('/:eventId/website/assets', async (req, res) => {
  const { eventId } = req.params;
  try {
    if (!await hostOwnsEvent(eventId, req.query.host_code)) return res.status(404).json({ error: 'Event not found' });
    const result = await pool.query('SELECT id, storage_path, original_filename, created_at FROM event_website_assets WHERE event_id = $1 ORDER BY created_at DESC', [eventId]);
    return res.json(result.rows);
  } catch (error) {
    console.error('Error loading invitation assets:', error);
    return res.status(500).json({ error: 'Failed to load invitation assets' });
  }
});

router.post('/:eventId/website/assets', websiteAssetUpload.single('asset'), async (req, res) => {
  const { eventId } = req.params;
  const hostCode = req.body.host_code;
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'A JPEG, PNG, or WebP image is required' });

  try {
    if (!await hostOwnsEvent(eventId, hostCode)) return res.status(404).json({ error: 'Event not found' });
    const extension = extname(file.originalname).toLowerCase() || (file.mimetype === 'image/png' ? '.png' : file.mimetype === 'image/webp' ? '.webp' : '.jpg');
    const assetDirectory = join(UPLOAD_DIR, 'events', eventId, 'website-assets');
    if (!existsSync(assetDirectory)) mkdirSync(assetDirectory, { recursive: true });
    const filename = `${randomUUID()}${extension}`;
    const storagePath = `/events/${eventId}/website-assets/${filename}`;
    writeFileSync(join(UPLOAD_DIR, storagePath), file.buffer);
    const result = await pool.query(
      'INSERT INTO event_website_assets (event_id, storage_path, original_filename) VALUES ($1, $2, $3) RETURNING id, storage_path, original_filename, created_at',
      [eventId, storagePath, file.originalname],
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error uploading invitation asset:', error);
    return res.status(500).json({ error: 'Failed to upload invitation asset' });
  }
});

router.delete('/:eventId/website/assets/:assetId', async (req, res) => {
  const { eventId, assetId } = req.params;
  try {
    if (!await hostOwnsEvent(eventId, req.query.host_code)) return res.status(404).json({ error: 'Event not found' });
    const result = await pool.query<{ storage_path: string }>(
      'DELETE FROM event_website_assets WHERE id = $1 AND event_id = $2 RETURNING storage_path',
      [assetId, eventId],
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Invitation image not found' });
    const imagePath = join(UPLOAD_DIR, result.rows[0].storage_path);
    if (existsSync(imagePath)) unlinkSync(imagePath);
    return res.status(204).end();
  } catch (error) {
    console.error('Error deleting invitation asset:', error);
    return res.status(500).json({ error: 'Failed to delete invitation image' });
  }
});

router.post('/:eventId/website/publish', async (req, res) => {
  const { eventId } = req.params;
  const { host_code: hostCode, slug } = req.body as { host_code?: string; slug?: string };
  const publicSlug = normalizeSlug(slug);

  if (!publicSlug) return res.status(400).json({ error: 'Choose a unique URL using at least three letters or numbers' });

  try {
    if (!await hostOwnsEvent(eventId, hostCode)) return res.status(404).json({ error: 'Event not found' });
    const result = await pool.query<EventWebsite>(
      `UPDATE event_websites
       SET public_slug = $1,
           published_document = draft_document,
           published_version = draft_version,
           published_at = CURRENT_TIMESTAMP
       WHERE event_id = $2
       RETURNING *`,
      [publicSlug, eventId],
    );
    if (result.rowCount === 0) return res.status(409).json({ error: 'Save a website draft before publishing' });
    return res.json(result.rows[0]);
  } catch (error) {
    if ((error as { code?: string }).code === '23505') return res.status(409).json({ error: 'That invitation URL is already in use' });
    console.error('Error publishing event website:', error);
    return res.status(500).json({ error: 'Failed to publish website' });
  }
});

publicWebsitesRouter.get('/:slug', async (req, res) => {
  const publicSlug = normalizeSlug(req.params.slug);
  if (!publicSlug) return res.status(404).json({ error: 'Website not found' });

  try {
    const result = await pool.query<Pick<EventWebsite, 'event_id' | 'public_slug' | 'published_document' | 'published_at'> & { event_name: string }>(
      `SELECT website.event_id, website.public_slug, website.published_document, website.published_at, event.name AS event_name, event.rsvp_plus_limit
       FROM event_websites website
       JOIN events event ON event.id = website.event_id
       WHERE website.public_slug = $1 AND website.published_at IS NOT NULL AND event.is_active = TRUE`,
      [publicSlug],
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Website not found' });
    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Error loading published website:', error);
    return res.status(500).json({ error: 'Failed to load website' });
  }
});

export default router;