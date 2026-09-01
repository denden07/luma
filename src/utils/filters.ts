export const FILTERS = [
  { id: 'original', label: 'Original (No Filter)', previewFilter: 'none' },
  { id: 'mono', label: 'Mono', previewFilter: 'grayscale(1) contrast(1.1)' },
  { id: 'warm-film', label: 'Warm Film', previewFilter: 'sepia(.32) saturate(1.12) contrast(.96)' },
  { id: 'cool-film', label: 'Cool Film', previewFilter: 'saturate(.9) hue-rotate(12deg) brightness(1.04)' },
  { id: 'high-contrast', label: 'High Contrast', previewFilter: 'contrast(1.3) saturate(1.08)' },
  { id: 'soft-fade', label: 'Soft Fade', previewFilter: 'contrast(.82) brightness(1.08) saturate(.82)' },
] as const;

export type FilterId = typeof FILTERS[number]['id'];

export function isFilterId(value: string): value is FilterId {
  return FILTERS.some(filter => filter.id === value);
}

export function getFilter(filterId: FilterId | undefined) {
  return FILTERS.find(filter => filter.id === filterId);
}