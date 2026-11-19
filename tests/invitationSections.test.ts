import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { WebsiteDocument } from '../src/services/websiteService';
import { invitationSectionId, invitationSectionLabel, visibleInvitationSections, withLegacyInvitationSections } from '../src/utils/invitationSections';

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

test('optional invitation sections only appear in navigation when they contain guest-facing content', () => {
  const optional: WebsiteDocument = {
    ...document,
    sections: [
      { id: 'timeline', type: 'timeline', visible: true, content: { title: 'The day', timeline: [] } },
      { id: 'attire', type: 'attire', visible: true, content: { colors: [] } },
      { id: 'gifts', type: 'gifts', visible: true, content: { instructions: '' } },
    ],
  };
  assert.deepEqual(visibleInvitationSections(optional), []);
  const filled = { ...optional, sections: [
    { ...optional.sections[0], content: { title: 'The day', timeline: [{ id: 'one', time: '3 PM', title: 'Vows' }] } },
    { ...optional.sections[1], content: { colors: ['#aabbcc'] } },
    { ...optional.sections[2], content: { instructions: 'Your presence is enough.' } },
  ] };
  assert.deepEqual(visibleInvitationSections(filled).map(invitationSectionLabel), ['The day', 'Attire', 'Gifts']);
  assert.deepEqual(visibleInvitationSections(filled).map(invitationSectionId), ['invitation-timeline', 'invitation-attire', 'invitation-gifts']);
  const detailsOnly = { ...optional, sections: [
    { ...optional.sections[0], content: { timeline: [{ id: 'one', time: '', title: '', details: 'Arrive early' }] } },
    ...optional.sections.slice(1),
  ] };
  assert.deepEqual(visibleInvitationSections(detailsOnly).map(section => section.type), ['timeline']);
});

test('previously published detail content renders as separate sections without changing the saved document', () => {
  const legacy: WebsiteDocument = {
    ...document,
    sections: [{ id: 'details', type: 'details', visible: true, content: {
      title: 'Details',
      timeline: [{ id: 'a', time: '3 PM', title: 'Vows' }],
      attire_motif: 'Formal',
      attire_colors: 'Sage',
    } }],
  };
  assert.deepEqual(visibleInvitationSections(withLegacyInvitationSections(legacy)).map(section => section.type), ['details', 'timeline', 'attire']);
  assert.equal(legacy.sections.length, 1);
});

test('countdown navigation follows its position and excludes an unset target', () => {
  const countdown = { id: 'countdown', type: 'countdown' as const, visible: true, content: { title: 'Our big day', target_at: '2030-01-01T12:00:00.000Z' } };
  const sections = [document.sections[2], document.sections[0], countdown];
  assert.deepEqual(visibleInvitationSections({ ...document, sections }).map(section => section.type), ['hero', 'story', 'countdown']);
  assert.deepEqual(visibleInvitationSections({ ...document, sections: [document.sections[2], countdown, document.sections[0]] }).map(section => section.type), ['hero', 'countdown', 'story']);
  assert.deepEqual(visibleInvitationSections({ ...document, sections: [{ ...countdown, content: { ...countdown.content, target_at: '' } }] }), []);
  assert.equal(invitationSectionId(countdown), 'invitation-countdown');
  assert.equal(invitationSectionLabel(countdown), 'Our big day');
});
