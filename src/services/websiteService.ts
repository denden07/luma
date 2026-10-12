const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export function slugifyInvitationName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export type WebsiteTemplateId = 'garden' | 'modern' | 'classic';
export type WebsiteSectionType = 'hero' | 'story' | 'details' | 'gallery' | 'entourage' | 'rsvp' | 'closing';

export interface WebsiteSection {
  id: string;
  type: WebsiteSectionType;
  visible: boolean;
  content: Record<string, unknown>;
}

export interface WebsiteDocument {
  schema_version: 1;
  template_id: WebsiteTemplateId;
  theme: {
    palette_id: string;
    font_pair_id: string;
  };
  sections: WebsiteSection[];
}

export interface EventWebsite {
  event_id: string;
  draft_document: WebsiteDocument;
  published_document: WebsiteDocument | null;
  public_slug: string | null;
  draft_version: number;
  published_version: number | null;
  published_at: string | null;
}

export function createWebsiteDraft(eventName: string, eventDate: string, templateId: WebsiteTemplateId, coverPhotoPath?: string | null): WebsiteDocument {
  return {
    schema_version: 1,
    template_id: templateId,
    theme: {
      palette_id: templateId,
      font_pair_id: templateId === 'classic' ? 'editorial' : 'modern',
    },
    sections: [
      {
        id: 'hero',
        type: 'hero',
        visible: true,
        content: {
          couple_names: eventName,
          date: new Date(eventDate).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }),
          message: 'Together with their families, invite you to celebrate.',
          cover_position: 'center',
          ...(coverPhotoPath ? { cover_photo_path: coverPhotoPath } : {}),
        },
      },
      { id: 'story', type: 'story', visible: true, content: { title: 'Our Story', body: 'A little more about the people and moments that brought us here.' } },
      { id: 'details', type: 'details', visible: true, content: { title: 'Event Details', venue: '', venue_time: '', venue_directions_url: '', ceremony_place: '', ceremony_time: '', ceremony_directions_url: '' } },
      { id: 'gallery', type: 'gallery', visible: true, content: { title: 'Photo Gallery', photo_paths: [], layout: 'grid' } },
      { id: 'entourage', type: 'entourage', visible: true, content: { title: 'Our Entourage', groups: [
        { id: 'sponsors', title: 'Sponsors', members: [] },
        { id: 'bridesmaids', title: 'Bridesmaids', members: [] },
        { id: 'groomsmen', title: 'Groomsmen', members: [] },
        { id: 'flower-girls', title: 'Flower Girls', members: [] },
      ] } },
      { id: 'rsvp', type: 'rsvp', visible: true, content: { title: 'RSVP', button_label: 'Respond' } },
      { id: 'closing', type: 'closing', visible: true, content: { message: 'We cannot wait to celebrate with you.' } },
    ],
  };
}

export async function getEventWebsite(eventId: string, hostCode: string): Promise<EventWebsite | null> {
  const response = await fetch(`${API_BASE_URL}/api/events/${eventId}/website?host_code=${encodeURIComponent(hostCode)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Failed to load invitation website');
  return response.json();
}

export async function saveEventWebsite(eventId: string, hostCode: string, document: WebsiteDocument): Promise<EventWebsite> {
  const response = await fetch(`${API_BASE_URL}/api/events/${eventId}/website`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ host_code: hostCode, document }),
  });
  if (!response.ok) throw new Error('Failed to save invitation website');
  return response.json();
}

export async function publishEventWebsite(eventId: string, hostCode: string, slug: string): Promise<EventWebsite> {
  const response = await fetch(`${API_BASE_URL}/api/events/${eventId}/website/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ host_code: hostCode, slug }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Failed to publish invitation website');
  return payload;
}

export interface PublishedWebsite {
  event_id: string;
  event_name: string;
  public_slug: string;
  published_document: WebsiteDocument;
  published_at: string;
  rsvp_plus_limit: number;
}

export async function getPublishedWebsite(slug: string): Promise<PublishedWebsite | null> {
  const response = await fetch(`${API_BASE_URL}/api/websites/${encodeURIComponent(slug)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Failed to load invitation website');
  return response.json();
}

export function ensureWebsiteSections(document: WebsiteDocument): WebsiteDocument {
  const requiredSections: WebsiteSection[] = [
    { id: 'gallery', type: 'gallery', visible: true, content: { title: 'Photo Gallery', photo_paths: [], layout: 'grid' } },
    { id: 'entourage', type: 'entourage', visible: true, content: { title: 'Our Entourage', category: 'Wedding Party', members: '' } },
    { id: 'rsvp', type: 'rsvp', visible: true, content: { title: 'RSVP', button_label: 'Respond' } },
  ];
  const missing = requiredSections.filter(required => !document.sections.some(section => section.type === required.type));
  return missing.length === 0 ? document : { ...document, sections: [...document.sections, ...missing] };
}

export interface WebsiteAsset {
  id: string;
  storage_path: string;
  original_filename: string;
  created_at: string;
}

export async function getWebsiteAssets(eventId: string, hostCode: string): Promise<WebsiteAsset[]> {
  const response = await fetch(`${API_BASE_URL}/api/events/${eventId}/website/assets?host_code=${encodeURIComponent(hostCode)}`);
  if (!response.ok) throw new Error('Failed to load invitation images');
  return response.json();
}

export async function uploadWebsiteAsset(eventId: string, hostCode: string, file: File): Promise<WebsiteAsset> {
  const formData = new FormData();
  formData.append('host_code', hostCode);
  formData.append('asset', file);
  const response = await fetch(`${API_BASE_URL}/api/events/${eventId}/website/assets`, { method: 'POST', body: formData });
  if (!response.ok) throw new Error('Failed to upload invitation image');
  return response.json();
}

export async function deleteWebsiteAsset(eventId: string, hostCode: string, assetId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/events/${eventId}/website/assets/${assetId}?host_code=${encodeURIComponent(hostCode)}`, { method: 'DELETE' });
  if (!response.ok) throw new Error('Failed to delete invitation image');
}