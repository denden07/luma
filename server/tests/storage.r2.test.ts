import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { once } from 'node:events';
import { test, mock } from 'node:test';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import JSZip from 'jszip';

test('R2 storage writes, streams and removes the same object key', async () => {
  process.env.STORAGE_PROVIDER = 'r2';
  process.env.R2_ACCOUNT_ID = 'test-account';
  process.env.R2_ACCESS_KEY_ID = 'test-key';
  process.env.R2_SECRET_ACCESS_KEY = 'test-secret';
  process.env.R2_BUCKET = 'test-bucket';
  const commands: unknown[] = [];
  const send = mock.method(S3Client.prototype, 'send', async (command: unknown) => {
    commands.push(command);
    if (command instanceof GetObjectCommand) {
      return { Body: Readable.from([Buffer.from('photo')]), ContentType: 'image/jpeg', ContentLength: 5 };
    }
    return {};
  });
  try {
    const { saveImage, imageStream, deleteImage, isR2Storage } = await import('../storage.js');
    const path = '/events/example/photos/one.jpg';
    assert.equal(isR2Storage, true);
    await saveImage(path, Buffer.from('photo'), 'image/jpeg');
    const image = await imageStream(path);
    assert.equal(image.contentType, 'image/jpeg');
    assert.equal(image.contentLength, 5);
    const chunks: Buffer[] = [];
    for await (const chunk of image.stream) chunks.push(chunk as Buffer);
    assert.equal(Buffer.concat(chunks).toString(), 'photo');
    await deleteImage(path);
    assert.equal(commands.length, 3);
    assert.ok(commands[0] instanceof PutObjectCommand);
    assert.deepEqual(commands[0].input, {
      Bucket: 'test-bucket', Key: 'events/example/photos/one.jpg', Body: Buffer.from('photo'), ContentType: 'image/jpeg',
    });
    assert.ok(commands[1] instanceof GetObjectCommand);
    assert.equal(commands[1].input.Key, 'events/example/photos/one.jpg');
    assert.ok(commands[2] instanceof DeleteObjectCommand);
    assert.equal(commands[2].input.Key, 'events/example/photos/one.jpg');
    await assert.rejects(imageStream('/events/../wrong.jpg'), /Invalid image storage path/);

    const { default: app } = await import('../app.js');
    const { default: pool } = await import('../db/index.js');
    const query = mock.method(pool, 'query', async () => ({
      rows: [{ id: 'one', storage_path: path, participant_name: 'Guest' }],
      rowCount: 1, command: 'SELECT', oid: 0, fields: [],
    }));
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Test server did not start');
      const base = `http://127.0.0.1:${address.port}`;
      const imageResponse = await fetch(`${base}/uploads/events/example/photos/one.jpg`);
      assert.equal(imageResponse.status, 200);
      assert.equal(imageResponse.headers.get('content-type'), 'image/jpeg');
      assert.equal(await imageResponse.text(), 'photo');
      const zipResponse = await fetch(`${base}/api/events/example/photos/download`);
      assert.equal(zipResponse.status, 200);
      const zip = await JSZip.loadAsync(await zipResponse.arrayBuffer());
      assert.equal(await zip.file('guest-one.jpg')?.async('string'), 'photo');
    } finally {
      query.mock.restore();
      if (server.listening) {
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      }
    }
  } finally {
    send.mock.restore();
  }
});
