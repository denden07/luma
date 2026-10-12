import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { existsSync, mkdirSync } from 'fs';
import eventsRouter from './routes/events.js';
import participantsRouter from './routes/participants.js';
import photosRouter from './routes/photos.js';
import hostsRouter from './routes/hosts.js';
import adminRouter from './routes/admin.js';
import websitesRouter, { publicWebsitesRouter } from './routes/websites.js';
import guestsRouter from './routes/guests.js';
import rsvpRouter, { publicRsvpRouter } from './routes/rsvp.js';

dotenv.config();

const app = express();
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS ?? '').split(',').map(origin => origin.trim()).filter(Boolean));

app.set('trust proxy', 1);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error('Origin not allowed by CORS'));
  },
  credentials: true,
}));
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// Multipart requests are parsed by the upload routes.
app.use((req, res, next) => {
  const contentType = req.headers['content-type'] || '';

  if (contentType.includes('multipart/form-data')) {
    return next();
  }

  express.json({ limit: '50mb' })(req, res, (error) => {
    if (error) return next(error);
    express.urlencoded({ extended: true, limit: '50mb' })(req, res, next);
  });
});

if (!existsSync(UPLOAD_DIR)) {
  mkdirSync(UPLOAD_DIR, { recursive: true });
}

app.use('/uploads', express.static(UPLOAD_DIR));

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`, {
    query: req.query,
    contentType: req.headers['content-type'],
    contentLength: req.headers['content-length'],
  });
  next();
});

app.use('/api/hosts', hostsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/events', eventsRouter);
app.use('/api/events', websitesRouter);
app.use('/api/websites', publicWebsitesRouter);
app.use('/api/events', guestsRouter);
app.use('/api/events', rsvpRouter);
app.use('/api/rsvp', publicRsvpRouter);
app.use('/api/events', participantsRouter);
app.use('/api/events', photosRouter);
app.use('/api/photos', photosRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((error: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Server Error]', {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
  });

  res.status(error.status || 500).json({
    error: error.message || 'Internal server error',
    path: req.path,
  });
});

export default app;