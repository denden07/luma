import assert from 'node:assert/strict';
import { test } from 'node:test';
import { invitationHtml } from '../server/invitationHtml';
import { invitationSlug, invitationSlugTitle } from '../src/utils/invitationSlug';
import type { WebsiteDocument } from '../server/types';

const eventId = 'c737d8b8-8cb5-4636-8c69-a28ef4d5dab4';
const template = '<html><head><meta name="description" content="generic" /><meta property="og:title" content="generic" /><meta property="og:description" content="generic" /><meta property="og:image" content="/og-image.png" /><meta property="og:type" content="website" /><title>generic</title></head><body><div id="root"></div><script src="/assets/app.js"></script></body></html>';

test('invitation URL prefixes the event identity and keeps title editable', () => {
  const slug = invitationSlug(eventId, 'Alex & Sam');
  assert.equal(slug, `${eventId}-alex-and-sam`);
  assert.equal(invitationSlugTitle(eventId, slug), 'alex-and-sam');
  assert.notEqual(slug, invitationSlug('a737d8b8-8cb5-4636-8c69-a28ef4d5dab4', 'Alex & Sam'));
  assert.equal(invitationSlugTitle(eventId, 'legacy-url'), 'legacy-url');
});

test('published share card uses custom fields, escapes HTML, and keeps the app shell', () => {
  const document = draft();
  document.sections[0].content = {
    ...document.sections[0].content,
    share_title: 'Alex "and" <Sam>',
    share_description: 'Come & celebrate',
    share_image_path: `/events/${eventId}/website-assets/card.jpg`,
  };
  const url = `https://example.com/${invitationSlug(eventId, 'Alex & Sam')}`;
  const html = invitationHtml(template, document, 'Alex & Sam', eventId, url);
  assert.match(html, /og:title" content="Alex &quot;and&quot; &lt;Sam&gt;"/);
  assert.match(html, /og:description" content="Come &amp; celebrate"/);
  assert.match(html, new RegExp(`og:image" content="https://example.com/uploads/events/${eventId}/website-assets/card.jpg"`));
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(html, /id="root"/);
  assert.match(html, /src="\/assets\/app.js"/);
  assert.doesNotMatch(html, /content="generic"/);
});

test('missing custom share fields use the published hero and a safe default image', () => {
  const document = draft();
  document.sections[0].content.share_image_path = 'https://other.example/image.jpg';
  const html = invitationHtml(template, document, 'Alex & Sam', eventId, 'https://example.com/invite');
  assert.match(html, /og:title" content="Alex &amp; Sam"/);
  assert.match(html, /og:image" content="https:\/\/example.com\/invitation-share-default.jpg"/);
});

function draft(): WebsiteDocument {
  return {
    schema_version: 1,
    template_id: 'garden',
    theme: { palette_id: 'garden', font_pair_id: 'editorial' },
    sections: [{ id: 'hero', type: 'hero', visible: true, content: {
      couple_names: 'Alex & Sam',
      message: 'Together with their families, invite you to celebrate.',
    } }],
  };
}
