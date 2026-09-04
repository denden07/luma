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

function clampColor(value: number): number {
  return Math.max(0, Math.min(255, value));
}

function applyContrast(value: number, amount: number): number {
  return clampColor((value - 128) * amount + 128);
}

function applySaturation(red: number, green: number, blue: number, amount: number): [number, number, number] {
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  return [
    clampColor(luminance + (red - luminance) * amount),
    clampColor(luminance + (green - luminance) * amount),
    clampColor(luminance + (blue - luminance) * amount),
  ];
}

function applyHueRotation(red: number, green: number, blue: number, degrees: number): [number, number, number] {
  const radians = degrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return [
    clampColor((0.213 + cosine * 0.787 - sine * 0.213) * red + (0.715 - cosine * 0.715 - sine * 0.715) * green + (0.072 - cosine * 0.072 + sine * 0.928) * blue),
    clampColor((0.213 - cosine * 0.213 + sine * 0.143) * red + (0.715 + cosine * 0.285 + sine * 0.14) * green + (0.072 - cosine * 0.072 - sine * 0.283) * blue),
    clampColor((0.213 - cosine * 0.213 - sine * 0.787) * red + (0.715 - cosine * 0.715 + sine * 0.715) * green + (0.072 + cosine * 0.928 + sine * 0.072) * blue),
  ];
}

function applyPixelFilter(context: CanvasRenderingContext2D, width: number, height: number, filterId: FilterId): void {
  const stripHeight = 128;
  for (let top = 0; top < height; top += stripHeight) {
    const currentStripHeight = Math.min(stripHeight, height - top);
    const imageData = context.getImageData(0, top, width, currentStripHeight);
    const pixels = imageData.data;
    for (let index = 0; index < pixels.length; index += 4) {
      let red = pixels[index];
      let green = pixels[index + 1];
      let blue = pixels[index + 2];

      if (filterId === 'mono') {
        const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
        red = applyContrast(luminance, 1.1);
        green = red;
        blue = red;
      } else if (filterId === 'warm-film') {
        const sepiaRed = clampColor(red * 0.393 + green * 0.769 + blue * 0.189);
        const sepiaGreen = clampColor(red * 0.349 + green * 0.686 + blue * 0.168);
        const sepiaBlue = clampColor(red * 0.272 + green * 0.534 + blue * 0.131);
        red = red * 0.68 + sepiaRed * 0.32;
        green = green * 0.68 + sepiaGreen * 0.32;
        blue = blue * 0.68 + sepiaBlue * 0.32;
        [red, green, blue] = applySaturation(red, green, blue, 1.12);
        red = applyContrast(red, 0.96);
        green = applyContrast(green, 0.96);
        blue = applyContrast(blue, 0.96);
      } else if (filterId === 'cool-film') {
        [red, green, blue] = applySaturation(red, green, blue, 0.9);
        [red, green, blue] = applyHueRotation(red, green, blue, 12);
        red = clampColor(red * 1.04);
        green = clampColor(green * 1.04);
        blue = clampColor(blue * 1.04);
      } else if (filterId === 'high-contrast') {
        red = applyContrast(red, 1.3);
        green = applyContrast(green, 1.3);
        blue = applyContrast(blue, 1.3);
        [red, green, blue] = applySaturation(red, green, blue, 1.08);
      } else if (filterId === 'soft-fade') {
        red = clampColor(applyContrast(red, 0.82) * 1.08);
        green = clampColor(applyContrast(green, 0.82) * 1.08);
        blue = clampColor(applyContrast(blue, 0.82) * 1.08);
        [red, green, blue] = applySaturation(red, green, blue, 0.82);
      }

      pixels[index] = red;
      pixels[index + 1] = green;
      pixels[index + 2] = blue;
    }
    context.putImageData(imageData, 0, top);
  }
}

export async function createFilteredPhotoBlob(originalBlob: Blob, filterId: FilterId): Promise<Blob> {
  const sourceUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read the original photo for filtering'));
    reader.readAsDataURL(originalBlob);
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error('Failed to load the original photo for filtering'));
    element.src = sourceUrl;
  });
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Failed to prepare the photo filter');

  context.drawImage(image, 0, 0);
  applyPixelFilter(context, canvas.width, canvas.height, filterId);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to encode the filtered photo'));
    }, 'image/jpeg', 0.92);
  });
}