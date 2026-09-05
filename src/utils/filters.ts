export const FILTERS = [
  { id: 'original', label: 'Original (No Filter)', previewFilter: 'none', hasFlare: false },
  { id: 'warm-film', label: 'Kodak Gold 200', previewFilter: 'sepia(.3) saturate(1.2) contrast(.96) brightness(1.05)', hasFlare: true },
  { id: 'soft-fade', label: 'Kodak Portra 400', previewFilter: 'sepia(.1) saturate(.86) contrast(.88) brightness(1.08)', hasFlare: false },
  { id: 'cool-film', label: 'Fujifilm Superia', previewFilter: 'saturate(1.1) hue-rotate(-8deg) contrast(1.05) brightness(1.02)', hasFlare: false },
  { id: 'high-contrast', label: 'CineStill 800T', previewFilter: 'saturate(.96) hue-rotate(5deg) contrast(1.18) brightness(1.03)', hasFlare: true },
] as const;

export type FilterId = typeof FILTERS[number]['id'];
function drawDateStamp(context: CanvasRenderingContext2D, width: number, height: number): void {
  const date = new Date();
  const stamp = `${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}.${String(date.getFullYear()).slice(-2)}`;
  const fontSize = Math.max(22, Math.round(Math.min(width, height) * 0.04));
  const padding = Math.max(18, Math.round(fontSize * 0.65));
  context.font = `700 ${fontSize}px monospace`;
  context.textAlign = 'right';
  context.textBaseline = 'bottom';
  context.lineWidth = Math.max(3, Math.round(fontSize * 0.13));
  context.strokeStyle = 'rgba(65, 35, 22, 0.86)';
  context.strokeText(stamp, width - padding, height - padding);
  context.fillStyle = '#b85f32';
  context.fillText(stamp, width - padding, height - padding);
}

function drawLensFlare(context: CanvasRenderingContext2D, width: number, height: number, filterId: FilterId | 'mono'): void {
  if (filterId !== 'warm-film' && filterId !== 'high-contrast') return;
  const radius = Math.max(width, height) * 0.46;
  const flare = context.createRadialGradient(width * 0.92, height * 0.1, 0, width * 0.92, height * 0.1, radius);
  flare.addColorStop(0, filterId === 'warm-film' ? 'rgba(255, 214, 125, 0.45)' : 'rgba(255, 111, 75, 0.34)');
  flare.addColorStop(0.22, filterId === 'warm-film' ? 'rgba(244, 135, 71, 0.18)' : 'rgba(236, 49, 35, 0.14)');
  flare.addColorStop(0.65, 'rgba(255, 112, 64, 0.03)');
  flare.addColorStop(1, 'rgba(255, 112, 64, 0)');
  context.save();
  context.globalCompositeOperation = 'screen';
  context.fillStyle = flare;
  context.fillRect(0, 0, width, height);
  context.restore();
}

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

function applyPixelFilter(context: CanvasRenderingContext2D, width: number, height: number, filterId: FilterId | 'mono'): void {
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
        [red, green, blue] = applySaturation(red, green, blue, 1.08);
        [red, green, blue] = applyHueRotation(red, green, blue, -8);
        red = clampColor(red * 1.03);
        green = clampColor(green * 1.03);
        blue = clampColor(blue * 1.03);
      } else if (filterId === 'high-contrast') {
        red = clampColor(applyContrast(red, 1.18) * 1.04);
        green = applyContrast(green, 1.18);
        blue = clampColor(applyContrast(blue, 1.18) * 1.05);
        [red, green, blue] = applySaturation(red, green, blue, 0.96);
      } else if (filterId === 'soft-fade') {
        red = clampColor(applyContrast(red, 0.82) * 1.12);
        green = clampColor(applyContrast(green, 0.82) * 1.12);
        blue = clampColor(applyContrast(blue, 0.82) * 1.12);
        [red, green, blue] = applySaturation(red, green, blue, 0.78);
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
  drawLensFlare(context, canvas.width, canvas.height, filterId);
  drawDateStamp(context, canvas.width, canvas.height);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to encode the filtered photo'));
    }, 'image/jpeg', 0.92);
  });
}