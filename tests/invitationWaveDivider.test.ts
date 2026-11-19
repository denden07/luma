import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { invitationWaveDivider } from '../src/utils/invitationSections';
import type { WebsiteSection } from '../src/services/websiteService';

test('wave settings default on and can be disabled independently for each section', () => {
  const section: WebsiteSection = { id: 'story', type: 'story', visible: true, content: { title: 'Our Story' } };
  assert.equal(invitationWaveDivider(section), true);
  assert.equal(invitationWaveDivider({ ...section, content: { ...section.content, wave_divider: false } }), false);
  assert.equal(invitationWaveDivider({ ...section, content: { ...section.content, wave_divider: true } }), true);
});

test('published and preview invitations carry wave settings when sections move', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const { createWebsiteDraft } = await server.ssrLoadModule('/src/services/websiteService.ts');
    const { default: InvitationDocument } = await server.ssrLoadModule('/src/screens/websiteBuilder/InvitationDocument.tsx');
    const draft = createWebsiteDraft('A & B', '2030-01-03T02:03:00.000Z', 'garden');
    const section = (type: string) => draft.sections.find((item: WebsiteSection) => item.type === type) as WebsiteSection;
    const story = { ...section('story'), content: { ...section('story').content, wave_divider: false } };
    const timeline = { ...section('timeline'), content: { ...section('timeline').content, timeline: [{ id: 'one', time: '3 PM', title: 'Ceremony' }] } };
    const sections = [section('hero'), story, section('countdown'), timeline, section('rsvp'), section('closing')];
    for (const preview of [true, false]) {
      const html = renderToStaticMarkup(createElement(InvitationDocument, { document: { ...draft, sections }, eventName: 'A & B', preview }));
      assert.match(html, /class="public-invitation-section public-invitation-story" id="invitation-story"/);
      assert.match(html, /class="public-invitation-section public-invitation-countdown has-wave-divider" id="invitation-countdown"/);
      assert.match(html, /class="public-invitation-section public-invitation-timeline-section has-wave-divider" id="invitation-timeline"/);
      assert.match(html, /class="public-invitation-rsvp is-visible has-wave-divider" id="rsvp"/);
      assert.match(html, /class="public-invitation-section public-invitation-closing has-wave-divider" id="invitation-closing"/);
      assert.ok(html.indexOf('id="invitation-story"') < html.indexOf('id="invitation-countdown"'));
    }
  } finally {
    await server.close();
  }
});
