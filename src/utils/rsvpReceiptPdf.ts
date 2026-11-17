import type { RsvpStatus } from '../services/rsvpService';

export type RsvpReceipt = {
  kind: 'listed' | 'pending';
  guestName: string;
  status: RsvpStatus;
  companions: { name: string; status: RsvpStatus }[];
  proxyName?: string;
  submittedAt: string;
  reference?: string;
};

export const rsvpStatusLabel = (value: RsvpStatus) =>
  value === 'attending' ? 'Attending' : value === 'declined' ? 'Not attending' : 'Still deciding';

let pdfModule: typeof import('jspdf') | null = null;

export async function prepareRsvpReceiptPdf(): Promise<void> {
  pdfModule = await import('jspdf');
}

export function downloadRsvpReceiptPdf(receipt: RsvpReceipt, eventName: string): void {
  if (!pdfModule) throw new Error('The PDF is still loading. Please try again in a moment.');
  const pdf = new pdfModule.jsPDF({ unit: 'pt', format: 'a4', compress: true });
  const width = pdf.internal.pageSize.getWidth();
  const height = pdf.internal.pageSize.getHeight();
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width * 2);
  canvas.height = Math.ceil(height * 2);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Your browser could not create the PDF. Please try another browser.');
  context.setTransform(2, 0, 0, 2, 0, 0);

  const wrap = (text: string, maxWidth: number): string[] => {
    const lines: string[] = [];
    let line = '';
    for (const word of text.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (context.measureText(candidate).width <= maxWidth) { line = candidate; continue; }
      if (line) { lines.push(line); line = ''; }
      for (const character of Array.from(word)) {
        if (context.measureText(line + character).width > maxWidth && line) { lines.push(line); line = ''; }
        line += character;
      }
    }
    if (line) lines.push(line);
    return lines;
  };

  let pageNumber = 1;
  const startPage = () => {
    context.fillStyle = '#fffdf7';
    context.fillRect(0, 0, width, height);
    context.fillStyle = '#263a32';
    context.fillRect(0, 0, width, 10);
    context.font = 'bold 12px Arial, sans-serif';
    context.fillText('madeTogether  /  RSVP RECEIPT', 44, 49);
    context.font = '12px Arial, sans-serif';
    context.fillText(`Page ${pageNumber}`, width - 95, 49);
    if (pageNumber > 1) {
      context.font = 'bold 20px Arial, sans-serif';
      context.fillText('Receipt continued', 44, 95);
      return 128;
    }
    context.font = 'bold 25px Arial, sans-serif';
    const heading = receipt.kind === 'listed' ? 'You are on the guest list' : 'Request sent for host review';
    const headingLines = wrap(heading, width - 88);
    headingLines.forEach((text, index) => context.fillText(text, 44, 97 + index * 30));
    const eventY = 108 + headingLines.length * 30;
    context.font = '18px Arial, sans-serif';
    const eventLines = wrap(eventName, width - 88);
    eventLines.forEach((text, index) => context.fillText(text, 44, eventY + index * 23));
    return eventY + eventLines.length * 23 + 26;
  };
  let y = startPage();
  const nextPage = () => {
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, width, height);
    pdf.addPage();
    pageNumber++;
    y = startPage();
  };
  const rows = [
    { label: receipt.kind === 'listed' ? 'Invitation' : 'Requested name', value: receipt.guestName },
    { label: receipt.kind === 'listed' ? 'Your RSVP' : 'Requested response', value: rsvpStatusLabel(receipt.status) },
    ...receipt.companions.map(companion => ({ label: 'Additional guest', value: `${companion.name} - ${rsvpStatusLabel(companion.status)}` })),
    ...(receipt.proxyName ? [{ label: 'Proxy of', value: `${receipt.guestName}: ${receipt.proxyName}` }] : []),
    { label: 'Submitted', value: new Date(receipt.submittedAt).toLocaleString() },
    ...(receipt.reference ? [{ label: 'Reference', value: receipt.reference }] : []),
  ];
  for (const row of rows) {
    context.font = '15px Arial, sans-serif';
    const lines = wrap(row.value, width - 229);
    const rowHeight = Math.max(43, lines.length * 21 + 18);
    if (y + rowHeight > height - 90) nextPage();
    context.fillStyle = '#495b4c';
    context.font = 'bold 13px Arial, sans-serif';
    context.fillText(row.label, 44, y + 20);
    context.fillStyle = '#263a32';
    context.font = '15px Arial, sans-serif';
    lines.forEach((text, index) => context.fillText(text, 185, y + 20 + index * 21));
    context.fillStyle = '#d9dfd4';
    context.fillRect(44, y + rowHeight - 1, width - 88, 1);
    y += rowHeight;
  }
  const note = receipt.kind === 'listed'
    ? 'Your RSVP is recorded. Keep this PDF for your records.'
    : 'This is proof of your request, not confirmation that you are on the guest list. The host will review it.';
  context.font = '13px Arial, sans-serif';
  const noteLines = wrap(note, width - 88);
  if (y + noteLines.length * 19 + 30 > height - 40) nextPage();
  context.fillStyle = '#495b4c';
  noteLines.forEach((text, index) => context.fillText(text, 44, y + 30 + index * 19));

  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, width, height);
  const fileName = receipt.guestName.normalize('NFKD').replace(/[^a-zA-Z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'guest';
  const url = URL.createObjectURL(pdf.output('blob'));
  const link = document.createElement('a');
  link.href = url;
  link.download = `RSVP-${fileName}.pdf`;
  document.body.append(link);
  link.click();
  window.setTimeout(() => { link.remove(); URL.revokeObjectURL(url); }, 60_000);
}
