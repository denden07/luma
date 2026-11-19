import type { WebsiteDocument, WebsiteSection, WebsiteSectionType } from '../services/websiteService';
import { invitationTimeline } from './invitationTimeline';
import { invitationColors } from './invitationColors';
import { countdownRemaining } from './invitationCountdown';

const sectionNames: Record<WebsiteSectionType, string> = {
  hero: 'Welcome',
  countdown: 'Countdown',
  story: 'Our story',
  details: 'Event details',
  timeline: 'Timeline',
  attire: 'Attire',
  gifts: 'Gifts',
  gallery: 'Photo gallery',
  entourage: 'Our entourage',
  rsvp: 'RSVP',
  closing: 'Closing',
};

export const invitationSectionId = (section: WebsiteSection): string =>
  section.type === 'rsvp' ? 'rsvp' : `invitation-${section.id}`;

export const invitationWaveDivider = (section: WebsiteSection): boolean =>
  section.content.wave_divider !== false;

export const invitationSectionLabel = (section: WebsiteSection): string => {
  const title = section.content[section.type === 'hero' ? 'couple_names' : 'title'];
  return typeof title === 'string' && title.trim() ? title.trim() : sectionNames[section.type];
};

export const withLegacyInvitationSections = (document: WebsiteDocument): WebsiteDocument => {
  const details = document.sections.find(section => section.type === 'details');
  if (!details) return document;
  const additions: WebsiteSection[] = [];
  if (!document.sections.some(section => section.type === 'timeline') && invitationTimeline(details.content).length) {
    additions.push({ id: 'timeline', type: 'timeline', visible: details.visible, content: { title: 'Timeline', timeline: details.content.timeline } });
  }
  if (!document.sections.some(section => section.type === 'attire') &&
    (typeof details.content.attire_motif === 'string' || typeof details.content.attire_colors === 'string')) {
    additions.push({ id: 'attire', type: 'attire', visible: details.visible, content: {
      title: 'Attire', motif: details.content.attire_motif ?? '', color_note: details.content.attire_colors ?? '', colors: [],
    } });
  }
  if (!additions.length) return document;
  const index = document.sections.indexOf(details);
  return { ...document, sections: [
    ...document.sections.slice(0, index + 1), ...additions, ...document.sections.slice(index + 1),
  ] };
};

export const visibleInvitationSections = (document: WebsiteDocument): WebsiteSection[] => {
  const hero = document.sections.find(section => section.type === 'hero');
  return [
    ...(hero?.visible ? [hero] : []),
    ...document.sections.filter(section => section.visible && section.type !== 'hero' && (
      section.type === 'countdown' ? typeof section.content.target_at === 'string' && countdownRemaining(section.content.target_at, 0) !== null :
      section.type === 'timeline' ? invitationTimeline(section.content).some(entry => entry.time.trim() || entry.title.trim() || entry.details?.trim()) :
      section.type === 'attire' ? Boolean(
        (typeof section.content.motif === 'string' && section.content.motif.trim()) ||
        (typeof section.content.color_note === 'string' && section.content.color_note.trim()) ||
        invitationColors(section.content).length
      ) :
      section.type === 'gifts' ? Boolean(typeof section.content.instructions === 'string' && section.content.instructions.trim()) :
      true
    )),
  ];
};
