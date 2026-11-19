import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

test('Our Story displays selected photos as a collage in preview and published invitations', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const { createWebsiteDraft } = await server.ssrLoadModule('/src/services/websiteService.ts');
    const { default: InvitationDocument } = await server.ssrLoadModule('/src/screens/websiteBuilder/InvitationDocument.tsx');
    const draft = createWebsiteDraft('A & B', '2030-01-03T02:03:00.000Z', 'garden');
    const story = draft.sections.find((section: { type: string }) => section.type === 'story');
    assert.deepEqual(story.content.photo_paths, []);
    const document = { ...draft, sections: [{ ...story, content: { ...story.content, photo_paths: ['story-one.jpg', 'story-two.jpg'] } }] };
    for (const preview of [true, false]) {
      const html = renderToStaticMarkup(createElement(InvitationDocument, { document, eventName: 'A & B', preview }));
      assert.match(html, /public-story-collage/);
      assert.match(html, /Our Story photo 1/);
      assert.match(html, /Our Story photo 2/);
      assert.ok(html.indexOf('story-one.jpg') < html.indexOf('story-two.jpg'));
    }
    const emptyHtml = renderToStaticMarkup(createElement(InvitationDocument, { document: draft, eventName: 'A & B', preview: true }));
    assert.doesNotMatch(emptyHtml, /public-story-collage/);
  } finally {
    await server.close();
  }
});
