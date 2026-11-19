import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

test('new and existing invitations have one reorderable countdown with a published rendering', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const { createWebsiteDraft, ensureWebsiteSections } = await server.ssrLoadModule('/src/services/websiteService.ts');
    const { default: InvitationDocument } = await server.ssrLoadModule('/src/screens/websiteBuilder/InvitationDocument.tsx');
    const eventDate = '2030-01-03T02:03:00.000Z';
    const startTime = '2030-01-03T04:05:00.000Z';
    const draft = createWebsiteDraft('A & B', eventDate, 'garden', null, startTime);
    assert.deepEqual(draft.sections.slice(0, 3).map((section: { type: string }) => section.type), ['hero', 'countdown', 'story']);
    assert.equal(draft.sections[1].content.target_at, startTime);
    assert.equal(createWebsiteDraft('A & B', eventDate, 'garden').sections[1].content.target_at, eventDate);

    const oldDraft = { ...draft, sections: draft.sections.filter((section: { type: string }) => section.type !== 'countdown') };
    const migrated = ensureWebsiteSections(oldDraft, eventDate, startTime);
    assert.deepEqual(migrated.sections.slice(0, 3).map((section: { type: string }) => section.type), ['hero', 'countdown', 'story']);
    assert.equal(ensureWebsiteSections(migrated, eventDate, startTime), migrated);
    assert.equal(migrated.sections.filter((section: { type: string }) => section.type === 'countdown').length, 1);

    const countdown = migrated.sections[1];
    const reordered = { ...migrated, sections: [migrated.sections[0], migrated.sections[2], countdown] };
    const html = renderToStaticMarkup(createElement(InvitationDocument, { document: reordered, eventName: 'A & B', preview: true }));
    assert.ok(html.indexOf('invitation-story') < html.indexOf('invitation-countdown'));
    assert.match(html, /id="invitation-countdown"/);
    assert.match(html, /Until our day/);
    assert.match(html, /role="timer"/);
    for (const unit of ['Days', 'Hours', 'Minutes', 'Seconds']) assert.match(html, new RegExp(unit));
    assert.doesNotMatch(html, /public-invitation-heading-icon/);
    const renamed = { ...migrated, sections: migrated.sections.map((section: { type: string; content: Record<string, unknown> }) => section.type === 'countdown' ? { ...section, content: { ...section.content, title: 'The celebration' } } : section) };
    assert.match(renderToStaticMarkup(createElement(InvitationDocument, { document: renamed, eventName: 'A & B', preview: true })), /The celebration/);
    const hidden = { ...migrated, sections: migrated.sections.map((section: { type: string }) => section.type === 'countdown' ? { ...section, visible: false } : section) };
    assert.doesNotMatch(renderToStaticMarkup(createElement(InvitationDocument, { document: hidden, eventName: 'A & B', preview: true })), /id="invitation-countdown"/);
  } finally {
    await server.close();
  }
});
