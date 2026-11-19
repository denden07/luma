import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { test } from 'node:test';

test('local storage saves, reads and deletes images without changing the public path', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'luma-storage-test-'));
  process.env.STORAGE_PROVIDER = 'local';
  process.env.UPLOAD_DIR = directory;
  const { saveImage, imageStream, deleteImage } = await import('../storage.js');
  const path = '/events/example/photos/one.jpg';
  try {
    await saveImage(path, Buffer.from('photo'), 'image/jpeg');
    assert.equal((await readFile(join(directory, 'events', 'example', 'photos', 'one.jpg'))).toString(), 'photo');
    const { stream, contentLength } = await imageStream(path);
    assert.equal(contentLength, 5);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    assert.equal(Buffer.concat(chunks).toString(), 'photo');
    const { default: app } = await import('../app.js');
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Test server did not start');
      const response = await fetch(`http://127.0.0.1:${address.port}/uploads/events/example/photos/one.jpg`);
      assert.equal(response.status, 200);
      assert.equal(await response.text(), 'photo');
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
    await deleteImage(path);
    await assert.rejects(imageStream(path), { code: 'ENOENT' });
    await assert.rejects(saveImage('/events/../outside.jpg', Buffer.from('bad'), 'image/jpeg'), /Invalid image storage path/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
