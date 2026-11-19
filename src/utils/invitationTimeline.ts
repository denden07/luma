export interface TimelineEntry {
  id: string;
  time: string;
  title: string;
}

export const invitationTimeline = (content: Record<string, unknown> | undefined): TimelineEntry[] =>
  Array.isArray(content?.timeline)
    ? content.timeline.filter((entry): entry is TimelineEntry =>
      typeof entry === 'object' && entry !== null &&
      typeof entry.id === 'string' && typeof entry.time === 'string' && typeof entry.title === 'string')
    : [];
