import express from 'express';
import multer from 'multer';
import busboy from 'busboy';
import * as archiver from 'archiver';
import { mkdirSync, existsSync, renameSync, unlinkSync, createWriteStream, writeFileSync } from 'fs';
import { basename, extname, join } from 'path';
import pool from '../db/index.js';
import type { Photo } from '../types.js';

const router = express.Router();

interface EventUploadPolicy {
  photo_limit: number;
  start_time: Date | null;
  end_time: Date | null;
}

async function getPhotoUploadError(eventId: string, participantId: string, photoId: string): Promise<string | null> {
  const eventResult = await pool.query<EventUploadPolicy>(
    'SELECT photo_limit, start_time, end_time FROM events WHERE id = $1',
    [eventId]
  );
  const event = eventResult.rows[0];
  if (!event) return 'Event not found';

  const now = Date.now();
  if ((event.start_time && now < new Date(event.start_time).getTime()) ||
      (event.end_time && now > new Date(event.end_time).getTime())) {
    return 'Photo uploads are not available outside the event schedule';
  }

  const participantResult = await pool.query(
    'SELECT 1 FROM participants WHERE id = $1 AND event_id = $2',
    [participantId, eventId]
  );
  if (participantResult.rows.length === 0) return 'Participant does not belong to this event';

  const existingPhoto = await pool.query<{ event_id: string; participant_id: string }>(
    'SELECT event_id, participant_id FROM photos WHERE id = $1',
    [photoId]
  );
  if (existingPhoto.rows.length > 0) {
    const existing = existingPhoto.rows[0];
    return existing.event_id === eventId && existing.participant_id === participantId
      ? null
      : 'Photo ID is already associated with another event or participant';
  }

  const photoCount = await pool.query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM photos WHERE event_id = $1 AND participant_id = $2',
    [eventId, participantId]
  );
  return Number(photoCount.rows[0].count) >= event.photo_limit
    ? 'This guest has reached the photo limit for the event'
    : null;
}

// Configure multer for file uploads
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

// Ensure upload directory exists
if (!existsSync(UPLOAD_DIR)) {
  mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    try {
      console.log('[Multer Storage] destination called for eventId:', req.params.eventId);
      const eventId = req.params.eventId;
      const uploadPath = join(UPLOAD_DIR, 'events', eventId, 'photos');
      
      console.log('[Multer Storage] Creating directory:', uploadPath);
      
      // Create directory if it doesn't exist
      if (!existsSync(uploadPath)) {
        mkdirSync(uploadPath, { recursive: true });
        console.log('[Multer Storage] Directory created:', uploadPath);
      } else {
        console.log('[Multer Storage] Directory already exists:', uploadPath);
      }
      
      cb(null, uploadPath);
    } catch (error) {
      console.error('[Multer Storage] ❌ Error in destination:', error);
      cb(error as Error, '');
    }
  },
  filename: function (req, file, cb) {
    try {
      console.log('[Multer Storage] filename called, file:', {
        fieldname: file.fieldname,
        originalname: file.originalname,
        encoding: file.encoding,
        mimetype: file.mimetype
      });
      
      // Generate temporary filename - will be renamed after we get the body
      const tempName = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const ext = file.mimetype === 'image/webp' ? 'webp' : 'jpg';
      const filename = `${tempName}.${ext}`;
      
      console.log('[Multer Storage] Generated filename:', filename);
      cb(null, filename);
    } catch (error) {
      console.error('[Multer Storage] ❌ Error in filename:', error);
      cb(error as Error, '');
    }
  }
});

const upload = multer({ 
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 1,
    fields: 10,
    parts: 100
  },
  fileFilter: (req, file, cb) => {
    console.log('[Multer Filter] Checking file:', {
      fieldname: file.fieldname,
      originalname: file.originalname,
      mimetype: file.mimetype
    });
    
    if (file.mimetype.startsWith('image/')) {
      console.log('[Multer Filter] ✅ File accepted');
      cb(null, true);
    } else {
      console.log('[Multer Filter] ❌ File rejected - not an image');
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Multer error handling middleware
function handleMulterError(err: any, req: express.Request, res: express.Response, next: express.NextFunction) {
  console.error('[Multer Error Handler] ❌❌❌ Multer error:', {
    error: err.message,
    code: err.code,
    field: err.field,
    stack: err.stack
  });
  
  if (err instanceof multer.MulterError) {
    console.error('[Multer Error Handler] MulterError type:', err.code);
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large (max 10MB)' });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ error: 'Unexpected file field' });
    }
    return res.status(400).json({ error: err.message });
  }
  
  if (err) {
    return res.status(500).json({ error: err.message || 'Upload failed' });
  }
  
  next();
}

// GET /api/events/:eventId/photos - Get all photos for an event
router.get('/:eventId/photos', async (req, res) => {
  try {
    const { eventId } = req.params;
    const result = await pool.query<Photo>(
      `SELECT p.*, pt.name as participant_name 
       FROM photos p 
       JOIN participants pt ON p.participant_id = pt.id 
       WHERE p.event_id = $1 
       ORDER BY p.created_at DESC`,
      [eventId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching photos:', error);
    res.status(500).json({ error: 'Failed to fetch photos' });
  }
});

// GET /api/events/:eventId/photos/download - Download all event photos as one ZIP file
router.get('/:eventId/photos/download', async (req, res) => {
  const { eventId } = req.params;

  try {
    const result = await pool.query<Photo & { participant_name?: string }>(
      `SELECT p.*, pt.name AS participant_name
       FROM photos p
       JOIN participants pt ON p.participant_id = pt.id
       WHERE p.event_id = $1
       ORDER BY p.created_at ASC`,
      [eventId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No photos are available for this event' });
    }

    res.attachment('madetogether-event-photos.zip');
    res.type('application/zip');

    const archive = new archiver.ZipArchive({ zlib: { level: 9 } });
    archive.on('warning', (error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') {
        console.error('ZIP archive warning:', error);
      }
    });
    archive.on('error', (error: Error) => {
      console.error('ZIP archive failed:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Could not prepare the photo download' });
      } else {
        res.destroy(error);
      }
    });

    archive.pipe(res);
    for (const photo of result.rows) {
      const relativePath = photo.storage_path.replace(/^[/\\]+/, '');
      const filePath = join(UPLOAD_DIR, relativePath);
      if (!existsSync(filePath)) continue;

      const participantName = (photo.participant_name || 'guest').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      const extension = extname(basename(filePath)) || '.jpg';
      archive.file(filePath, { name: `${participantName}-${photo.id}${extension}` });
    }

    await archive.finalize();
  } catch (error) {
    console.error('Error creating photo ZIP:', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Could not prepare the photo download' });
    }
  }
});

// Test route to verify route is working
router.post('/:eventId/photos-test', (req, res) => {
  console.log('[Photo Test Route] Hit! EventId:', req.params.eventId);
  console.log('[Photo Test Route] Headers:', req.headers);
  res.json({ 
    message: 'Test route works!', 
    eventId: req.params.eventId,
    headers: req.headers,
    body: req.body
  });
});

// POST /api/events/:eventId/photos-json - iOS fallback for multipart uploads
router.post('/:eventId/photos-json', async (req, res) => {
  const { eventId } = req.params;
  const { id: photoId, participant_id: participantId, image_data: imageData } = req.body as {
    id?: string;
    participant_id?: string;
    image_data?: string;
  };

  const dataUrlMatch = imageData?.match(/^data:image\/(jpeg|webp);base64,(.+)$/);
  if (!photoId || !participantId || !dataUrlMatch) {
    return res.status(400).json({ error: 'Photo ID, participant ID, and an image are required' });
  }

  const uploadPath = join(UPLOAD_DIR, 'events', eventId, 'photos');
  const extension = dataUrlMatch[1] === 'webp' ? 'webp' : 'jpg';
  const filename = `${photoId}.${extension}`;
  const filePath = join(uploadPath, filename);

  try {
    const uploadError = await getPhotoUploadError(eventId, participantId, photoId);
    if (uploadError) {
      return res.status(uploadError === 'Event not found' ? 404 : 409).json({ error: uploadError });
    }

    if (!existsSync(uploadPath)) {
      mkdirSync(uploadPath, { recursive: true });
    }

    const imageBuffer = Buffer.from(dataUrlMatch[2], 'base64');
    if (imageBuffer.length === 0) {
      return res.status(400).json({ error: 'Photo image is empty' });
    }

    const replacedExistingFile = existsSync(filePath);
    writeFileSync(filePath, imageBuffer);

    const storagePath = `/events/${eventId}/photos/${filename}`;
    const result = await pool.query<Photo>(
      `INSERT INTO photos (id, event_id, participant_id, storage_path)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET storage_path = EXCLUDED.storage_path
       RETURNING *`,
      [photoId, eventId, participantId, storagePath]
    );

    console.log('[Photo Upload JSON] Photo saved successfully:', photoId);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('[Photo Upload JSON] Error saving photo:', error);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
    res.status(500).json({ error: 'Failed to upload photo' });
  }
});

// POST /api/events/:eventId/photos - Upload a photo using Busboy (iOS Safari compatible)
router.post('/:eventId/photos', async (req, res) => {
  console.log('[Photo Route] ===== POST HANDLER CALLED =====');
  console.log('[Photo Route] User-Agent:', req.headers['user-agent']);
  console.log('[Photo Route] Content-Type:', req.headers['content-type']);
  console.log('[Photo Route] Content-Length:', req.headers['content-length']);

  if (/iPad|iPhone|iPod/.test(req.headers['user-agent'] || '')) {
    console.warn('[Photo Route] Rejected stale iOS multipart client; the current client uses /photos-json');
    return res.status(409).json({
      error: 'Outdated iOS client. Reload the app and retry.',
      expected_endpoint: `/api/events/${req.params.eventId}/photos-json`,
    });
  }
  
  const { eventId } = req.params;
  const uploadPath = join(UPLOAD_DIR, 'events', eventId, 'photos');
  
  // Ensure directory exists
  if (!existsSync(uploadPath)) {
    mkdirSync(uploadPath, { recursive: true });
    console.log('[Photo Route] Created directory:', uploadPath);
  }
  
  try {
    console.log('[Photo Route] Request paused?', req.isPaused());
    console.log('[Photo Route] Request readable?', req.readable);
    
    const bb = busboy({ headers: req.headers });
    
    let photoId: string | undefined;
    let participantId: string | undefined;
    let uploadedFilePath: string | undefined;
    let fileSize = 0;
    let fileMimetype: string | undefined;
    let busboyEventsFired = false;
    
    // Debug: Track if busboy emits ANY events
    const originalOn = bb.on.bind(bb);
    bb.on = function(event: string, handler: any) {
      console.log('[Busboy] Registered listener for event:', event);
      return originalOn(event, (...args: any[]) => {
        if (!busboyEventsFired) {
          busboyEventsFired = true;
          console.log('[Busboy] 🎉 FIRST EVENT FIRED:', event);
        }
        return handler(...args);
      });
    };
    
    // Handle form fields (id, participant_id)
    bb.on('field', (name, value) => {
      console.log('[Busboy] Field received:', name, '=', value);
      if (name === 'id') photoId = value;
      if (name === 'participant_id') participantId = value;
    });
    
    // Handle file upload
    bb.on('file', (name, file, info) => {
      const { filename, encoding, mimeType } = info;
      console.log('[Busboy] File received:', { name, filename, encoding, mimeType });
      
      if (!mimeType.startsWith('image/')) {
        console.error('[Busboy] ❌ Not an image file:', mimeType);
        file.resume(); // Drain file stream
        return;
      }
      
      fileMimetype = mimeType;
      const tempName = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const ext = mimeType === 'image/webp' ? 'webp' : 'jpg';
      const tempFilename = `${tempName}.${ext}`;
      uploadedFilePath = join(uploadPath, tempFilename);
      
      console.log('[Busboy] Writing file to:', uploadedFilePath);
      const writeStream = createWriteStream(uploadedFilePath);
      
      file.on('data', (data) => {
        fileSize += data.length;
      });
      
      file.pipe(writeStream);
    });
    
    // Handle errors
    bb.on('error', (error) => {
      console.error('[Busboy] ❌ Error:', error);
      if (uploadedFilePath && existsSync(uploadedFilePath)) {
        unlinkSync(uploadedFilePath);
      }
      if (!res.headersSent) {
        res.status(500).json({ error: 'File upload failed', details: error.message });
      }
    });
    
    // Handle completion
    bb.on('close', async () => {
      console.log('[Busboy] ✅ Upload complete');
      console.log('[Busboy] Parsed data:', { eventId, photoId, participantId, fileSize, uploadedFilePath });
      
      try {
        // Validate required fields
        if (!photoId || !participantId) {
          console.error('[Photo Upload] ❌ Missing required fields:', { photoId, participantId });
          if (uploadedFilePath && existsSync(uploadedFilePath)) {
            unlinkSync(uploadedFilePath);
          }
          return res.status(400).json({ error: 'Photo ID and participant ID are required' });
        }
        
        if (!uploadedFilePath || !existsSync(uploadedFilePath)) {
          console.error('[Photo Upload] ❌ No file uploaded');
          return res.status(400).json({ error: 'No photo file uploaded' });
        }

        const uploadError = await getPhotoUploadError(eventId, participantId, photoId);
        if (uploadError) {
          unlinkSync(uploadedFilePath);
          return res.status(uploadError === 'Event not found' ? 404 : 409).json({ error: uploadError });
        }
        
        // Rename file from temp name to photoId
        const ext = fileMimetype === 'image/webp' ? 'webp' : 'jpg';
        const newFilename = `${photoId}.${ext}`;
        const newFilePath = join(uploadPath, newFilename);
        
        // Check if target file already exists
        if (existsSync(newFilePath) && uploadedFilePath !== newFilePath) {
          console.warn('[Photo Upload] Target file already exists, replacing:', newFilePath);
          unlinkSync(newFilePath);
        }
        
        // Rename temp file to final name
        if (uploadedFilePath !== newFilePath) {
          renameSync(uploadedFilePath, newFilePath);
          console.log('[Photo Upload] Renamed file to:', newFilename);
        }
        
        const storagePath = `/events/${eventId}/photos/${newFilename}`;
        
        // Check if photo already exists in database
        const existingPhoto = await pool.query<Photo>(
          'SELECT id FROM photos WHERE id = $1',
          [photoId]
        );
        
        if (existingPhoto.rows.length > 0) {
          console.warn('[Photo Upload] ⚠️ Photo ID already exists, updating:', photoId);
        } else {
          console.log('[Photo Upload] New photo, inserting:', photoId);
        }
        
        // Insert or update photo in database
        const result = await pool.query<Photo>(
          `INSERT INTO photos (id, event_id, participant_id, storage_path) 
           VALUES ($1, $2, $3, $4) 
           ON CONFLICT (id) DO UPDATE 
           SET storage_path = EXCLUDED.storage_path
           RETURNING *`,
          [photoId, eventId, participantId, storagePath]
        );
        
        console.log('[Photo Upload] ✅ Photo saved successfully:', photoId);
        res.status(201).json(result.rows[0]);
        
      } catch (error) {
        console.error('[Photo Upload] ❌ Error saving to database:', error);
        
        // Clean up uploaded file on error
        if (uploadedFilePath && existsSync(uploadedFilePath)) {
          try {
            unlinkSync(uploadedFilePath);
          } catch (cleanupError) {
            console.error('[Photo Upload] Failed to clean up file:', cleanupError);
          }
        }
        
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to upload photo' });
        }
      }
    });
    
    // Pipe request to busboy
    console.log('[Photo Route] Piping request to busboy...');
    
    // Busboy must be the first consumer of the multipart request stream.
    req.pipe(bb);
    
    // Timeout to detect if busboy never emits events
    setTimeout(() => {
      if (!busboyEventsFired) {
        console.error('[Photo Route] ❌❌❌ BUSBOY TIMEOUT - NO EVENTS AFTER 10 SECONDS');
        console.error('[Photo Route] Request readable:', req.readable);
        console.error('[Photo Route] Request isPaused:', req.isPaused());
        
        if (!res.headersSent) {
          res.status(500).json({ 
            error: 'Upload parser timeout',
            debug: 'Busboy did not emit any events - iOS Safari stream issue'
          });
        }
      }
    }, 10000);
    
  } catch (error) {
    console.error('[Photo Route] ❌ Error initializing busboy:', error);
    res.status(500).json({ error: 'Failed to process upload' });
  }
});

// GET /api/photos/:id - Get a single photo
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query<Photo>(
      'SELECT * FROM photos WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Photo not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching photo:', error);
    res.status(500).json({ error: 'Failed to fetch photo' });
  }
});

// DELETE /api/photos/:id - Delete a photo
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM photos WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Photo not found' });
    }
    
    res.json({ message: 'Photo deleted successfully' });
  } catch (error) {
    console.error('Error deleting photo:', error);
    res.status(500).json({ error: 'Failed to delete photo' });
  }
});

// Error handling for any unhandled errors in photo routes
router.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Photo Routes] ❌❌❌ Unhandled error:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });
  
  if (!res.headersSent) {
    res.status(500).json({ 
      error: err.message || 'Internal server error in photo routes',
      path: req.path
    });
  }
});

export default router;
