import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { existsSync, mkdirSync } from 'fs';
import eventsRouter from './routes/events.js';
import participantsRouter from './routes/participants.js';
import photosRouter from './routes/photos.js';
import hostsRouter from './routes/hosts.js';

dotenv.config();

const app = express();
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

app.use(cors({
  origin: '*',
  credentials: true,
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

app.use((req, res, next) => {
  const start = Date.now();
  console.log(`[RAW REQUEST] ${req.method} ${req.url}`, {
    headers: req.headers,
    contentLength: req.headers['content-length'],
    contentType: req.headers['content-type'],
  });

  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[REQUEST COMPLETE] ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
  });

  next();
});

if (!existsSync(UPLOAD_DIR)) {
  mkdirSync(UPLOAD_DIR, { recursive: true });
}

app.use('/uploads', express.static(UPLOAD_DIR));

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`, {
    query: req.query,
    contentType: req.headers['content-type'],
    contentLength: req.headers['content-length'],
  });
  next();
});

app.use('/api/hosts', hostsRouter);
app.use('/api/events', eventsRouter);
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