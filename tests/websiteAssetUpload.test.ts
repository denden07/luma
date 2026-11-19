import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';

test('invitation photo uploads send the selected story, gallery, or share destination', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  const originalFetch = globalThis.fetch;
  try {
    const { uploadWebsiteAsset } = await server.ssrLoadModule('/src/services/websiteService.ts');
    const file = new File(['image'], 'photo.png', { type: 'image/png' });
    for (const usage of ['story', 'gallery', 'share']) {
      globalThis.fetch = async (input, init) => {
        assert.equal(input, '/api/events/event/website/assets');
        assert.equal(init?.method, 'POST');
        assert.ok(init?.body instanceof FormData);
        assert.equal(init.body.get('host_code'), 'secret');
        assert.equal(init.body.get('asset_usage'), usage);
        assert.equal((init.body.get('asset') as File).name, 'photo.png');
        return new Response(JSON.stringify({ id: usage, asset_usage: usage }), { status: 201 });
      };
      const uploaded = await uploadWebsiteAsset('event', 'secret', file, usage);
      assert.equal(uploaded.asset_usage, usage);
    }
  } finally {
    globalThis.fetch = originalFetch;
    await server.close();
  }
});
