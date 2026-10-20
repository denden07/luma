const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export interface SeatingTable {
  id: string;
  event_id: string;
  name: string;
  capacity: number;
  occupancy: number;
}

export interface SeatingGuest {
  id: string;
  event_id: string;
  group_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  companion_label: string | null;
  rsvp_status: 'attending' | 'declined' | 'undecided' | null;
  table_id: string | null;
}

export interface SeatingPlan {
  tables: SeatingTable[];
  guests: SeatingGuest[];
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, options);
  if (!response.ok) {
    const body: { error?: string } = await response.json().catch(() => ({}));
    throw new Error(body.error || `Seating request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

const json = (body: object, method: string): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const base = (eventId: string) => `/api/events/${encodeURIComponent(eventId)}/seating`;

export const getSeatingPlan = (eventId: string, hostCode: string) =>
  request<SeatingPlan>(`${base(eventId)}?host_code=${encodeURIComponent(hostCode)}`);

export const createSeatingTable = (eventId: string, hostCode: string, name: string, capacity: number) =>
  request<SeatingTable>(`${base(eventId)}/tables`, json({ host_code: hostCode, name, capacity }, 'POST'));

export const updateSeatingTable = (eventId: string, hostCode: string, tableId: string, name: string, capacity: number) =>
  request<SeatingTable>(`${base(eventId)}/tables/${encodeURIComponent(tableId)}`, json({ host_code: hostCode, name, capacity }, 'PATCH'));

export const deleteSeatingTable = (eventId: string, hostCode: string, tableId: string) =>
  request<void>(`${base(eventId)}/tables/${encodeURIComponent(tableId)}?host_code=${encodeURIComponent(hostCode)}`, { method: 'DELETE' });

export const assignSeatingGuest = (eventId: string, hostCode: string, guestId: string, tableId: string | null) =>
  request<SeatingGuest>(`${base(eventId)}/assignments/${encodeURIComponent(guestId)}`, json({ host_code: hostCode, table_id: tableId }, 'PUT'));

export const createSeatingGuest = (eventId: string, hostCode: string, guest: { fullName: string; email: string; phone: string; groupId: string | null; tableId: string }) =>
  request<SeatingGuest>(`${base(eventId)}/guests`, json({
    host_code: hostCode,
    full_name: guest.fullName,
    email: guest.email,
    phone: guest.phone,
    group_id: guest.groupId,
    table_id: guest.tableId,
  }, 'POST'));
