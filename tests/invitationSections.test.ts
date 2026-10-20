import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { WebsiteDocument } from '../src/services/websiteService';
import { invitationSectionId, invitationSectionLabel, visibleInvitationSections } from '../src/utils/invitationSections';

const document: WebsiteDocument = {
  schema_version: 1,
  template_id: 'garden',
  theme: { palette_id: 'garden', font_pair_id: 'modern' },
  sections: [
    { id: 'story-custom', type: 'story', visible: true, content: { title: 'How we met' } },
    { id: 'gallery', type: 'gallery', visible: false, content: { title: 'Private photos' } },
    { id: 'hero', type: 'hero', visible: true, content: { couple_names: 'Avery & Jordan' } },
    { id: 'rsvp-section', type: 'rsvp', visible: true, content: { title: 'Join us' } },
    { id: 'closing', type: 'closing', visible: true, content: { message: 'See you there' } },
  ],
};

test('section navigation follows rendered order and omits hidden sections', () => {
  assert.deepEqual(visibleInvitationSections(document).map(section => section.type), ['hero', 'story', 'rsvp', 'closing']);
  assert.deepEqual(visibleInvitationSections({ ...document, sections: document.sections.map(section => section.type === 'hero' ? { ...section, visible: false } : section) }).map(section => section.type), ['story', 'rsvp', 'closing']);
});

test('links use stable targets and published titles with fallbacks', () => {
  const sections = visibleInvitationSections(document);
  assert.deepEqual(sections.map(invitationSectionId), ['invitation-hero', 'invitation-story-custom', 'rsvp', 'invitation-closing']);
  assert.deepEqual(sections.map(invitationSectionLabel), ['Avery & Jordan', 'How we met', 'Join us', 'Closing']);
  assert.equal(invitationSectionLabel({ id: 'details', type: 'details', visible: true, content: { title: '  ' } }), 'Event details');
});
