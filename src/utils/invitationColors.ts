export interface InvitationColor {
  hex: string;
  name: string;
}

export const invitationColors = (content: Record<string, unknown> | undefined): InvitationColor[] =>
  Array.isArray(content?.colors)
    ? content.colors.flatMap((entry): InvitationColor[] => {
      if (typeof entry === 'string') return /^#[0-9a-fA-F]{6}$/.test(entry) ? [{ hex: entry, name: '' }] : [];
      if (typeof entry !== 'object' || entry === null || !('hex' in entry) || typeof entry.hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(entry.hex)) return [];
      return [{ hex: entry.hex, name: 'name' in entry && typeof entry.name === 'string' ? entry.name : '' }];
    })
    : [];
