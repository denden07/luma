export interface TimelineEntry {
  id: string;
  time: string;
  title: string;
  details?: string;
}

export const invitationTimeline = (content: Record<string, unknown> | undefined): TimelineEntry[] =>
  Array.isArray(content?.timeline)
    ? content.timeline.filter((entry): entry is TimelineEntry =>
      typeof entry === 'object' && entry !== null &&
      typeof entry.id === 'string' && typeof entry.time === 'string' && typeof entry.title === 'string' &&
      (!('details' in entry) || typeof entry.details === 'string'))
    : [];
