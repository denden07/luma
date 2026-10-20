import type { SeatingPlan } from '../services/seatingService';

function csvCell(value: string | number): string {
  const text = String(value);
  const safe = /^[\s]*[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function seatingCsv(plan: SeatingPlan): string {
  const rows: (string | number)[][] = [['Table', 'Capacity', 'Occupancy', 'Capacity status', 'Guest', 'Origin', 'RSVP']];
  for (const table of plan.tables) {
    const status = table.occupancy > table.capacity ? `Over capacity by ${table.occupancy - table.capacity}` : 'Within capacity';
    for (const guest of plan.guests.filter(person => person.table_id === table.id)) {
      rows.push([table.name, table.capacity, table.occupancy, status, guest.full_name, guest.companion_label ?? '', guest.rsvp_status ?? 'Awaiting']);
    }
    if (!plan.guests.some(person => person.table_id === table.id)) rows.push([table.name, table.capacity, table.occupancy, status, '', '', '']);
  }
  for (const guest of plan.guests.filter(person => !person.table_id)) {
    rows.push(['Unassigned', '', '', '', guest.full_name, guest.companion_label ?? '', guest.rsvp_status ?? 'Awaiting']);
  }
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
