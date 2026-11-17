import type { WebsiteDocument } from './types.js';

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character] ?? character);

const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

export function invitationHtml(template: string, document: WebsiteDocument, eventName: string, eventId: string, url: string): string {
  const hero = document.sections.find(section => section.type === 'hero')?.content;
  const title = text(hero?.share_title) || text(hero?.couple_names) || eventName;
  const description = text(hero?.share_description) || text(hero?.message) || `Join us to celebrate ${eventName}.`;
  const imagePath = text(hero?.share_image_path) || text(hero?.cover_photo_path);
  const image = imagePath.startsWith(`/events/${eventId}/`) && /^\/events\/[a-f0-9-]+\/(?:cover|website-assets)\/[a-zA-Z0-9._-]+$/.test(imagePath)
    ? new URL(`/uploads${imagePath}`, url).href
    : new URL('/invitation-share-default.jpg', url).href;
  const tags = [
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    '<meta property="og:type" content="website" />',
    `<meta property="og:image" content="${escapeHtml(image)}" />`,
    `<meta property="og:url" content="${escapeHtml(url)}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
  ].join('\n    ');
  return template
    .replace(/<meta\s+name="description"[^>]*>/i, '')
    .replace(/<meta\s+property="og:(?:title|description|image|type)"[^>]*>/gi, '')
    .replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(title)} | madeTogether</title>`)
    .replace('</head>', `    ${tags}\n  </head>`);
}
