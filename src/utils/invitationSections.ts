import type { WebsiteDocument, WebsiteSection, WebsiteSectionType } from '../services/websiteService';

const sectionNames: Record<WebsiteSectionType, string> = {
  hero: 'Welcome',
  story: 'Our story',
  details: 'Event details',
  gallery: 'Photo gallery',
  entourage: 'Our entourage',
  rsvp: 'RSVP',
  closing: 'Closing',
};

export const invitationSectionId = (section: WebsiteSection): string =>
  section.type === 'rsvp' ? 'rsvp' : `invitation-${section.id}`;

export const invitationSectionLabel = (section: WebsiteSection): string => {
  const title = section.content[section.type === 'hero' ? 'couple_names' : 'title'];
  return typeof title === 'string' && title.trim() ? title.trim() : sectionNames[section.type];
};

export const visibleInvitationSections = (document: WebsiteDocument): WebsiteSection[] => {
  const hero = document.sections.find(section => section.type === 'hero');
  return [
    ...(hero?.visible ? [hero] : []),
    ...document.sections.filter(section => section.visible && section.type !== 'hero'),
  ];
};
