import 'dotenv/config';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { dirname, resolve, sep } from 'node:path';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const provider = process.env.STORAGE_PROVIDER ?? 'local';
if (provider !== 'local' && provider !== 'r2') {
  throw new Error(`Unsupported STORAGE_PROVIDER: ${provider}`);
}

const root = resolve(process.env.UPLOAD_DIR ?? './uploads');
function loadR2Config() {
  if (provider !== 'r2') return null;
  const { R2_ACCOUNT_ID: accountId, R2_ACCESS_KEY_ID: accessKeyId, R2_SECRET_ACCESS_KEY: secretAccessKey, R2_BUCKET: bucket } = process.env;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error('R2 storage requires R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET');
  }
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

const r2Config = loadR2Config();
const client = r2Config ? new S3Client({
  region: 'auto',
  endpoint: `https://${r2Config.accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: r2Config.accessKeyId, secretAccessKey: r2Config.secretAccessKey },
}) : null;

export const isR2Storage = provider === 'r2';

function keyFor(path: string): string {
  const key = path.replace(/^\/+/, '');
  if (!key.startsWith('events/') || key.split('/').some(part => !part || part === '.' || part === '..' || part.includes('\\'))) {
    throw new Error('Invalid image storage path');
  }
  return key;
}

function localPath(path: string): string {
  const file = resolve(root, keyFor(path));
  if (!file.startsWith(`${root}${sep}`)) throw new Error('Invalid image storage path');
  return file;
}

export async function saveImage(path: string, data: Buffer, contentType: string): Promise<void> {
  if (client && r2Config) {
    await client.send(new PutObjectCommand({ Bucket: r2Config.bucket, Key: keyFor(path), Body: data, ContentType: contentType }));
  } else {
    const file = localPath(path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, data);
  }
}

export async function deleteImage(path: string): Promise<void> {
  if (client && r2Config) {
    await client.send(new DeleteObjectCommand({ Bucket: r2Config.bucket, Key: keyFor(path) }));
  } else {
    const file = localPath(path);
    if (existsSync(file)) await unlink(file);
  }
}

export async function imageStream(path: string): Promise<{ stream: Readable; contentType?: string; contentLength?: number }> {
  if (client && r2Config) {
    const object = await client.send(new GetObjectCommand({ Bucket: r2Config.bucket, Key: keyFor(path) }));
    if (!(object.Body instanceof Readable)) throw new Error('R2 did not return a readable image');
    return { stream: object.Body, contentType: object.ContentType, contentLength: object.ContentLength };
  }
  const file = localPath(path);
  const info = await stat(file);
  return { stream: createReadStream(file), contentLength: info.size };
}
