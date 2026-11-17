export function slugifyInvitationName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function invitationSlug(eventId: string, title: string): string {
  return `${eventId}-${slugifyInvitationName(title)}`;
}

export function invitationSlugTitle(eventId: string, slug: string): string {
  return slug.startsWith(`${eventId}-`) ? slug.slice(eventId.length + 1) : slug;
}
