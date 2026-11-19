const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export type RsvpStatus = 'attending' | 'declined' | 'undecided';
export interface GuestSeating { table_name: string | null; seat_number: number | null }
export interface NamedCompanion extends Partial<GuestSeating> { id: string; full_name: string; status: RsvpStatus | null; is_proxy?: boolean }
export interface CompanionChoice { id: string; status: RsvpStatus }
export interface ReservedSeatChoice { name: string; status: RsvpStatus; is_proxy?: boolean; table_name?: string | null; seat_number?: number | null }
export type RsvpProxy = { id: string } | { index: number };

export interface RsvpResponse {
  id: string;
  event_id: string;
  guest_id: string | null;
  group_id: string | null;
  invitation_name: string;
  status: RsvpStatus;
  party_count: number;
  plus_one_count: number;
  submitted_at: string;
}

export interface RsvpVerificationRequest {
  id: string;
  submitted_name: string;
  guest_id: string | null;
  matched_guest_name: string | null;
  status: 'pending' | 'approved' | 'rejected';
  requested_at: string;
  status_response: RsvpStatus | null;
  party_count: number;
  plus_one_count: number;
  contact_email: string | null;
  contact_phone: string | null;
  dietary_notes: string | null;
  attendee_names: string[] | null;
}

export interface PublicGuestMatch extends GuestSeating { id: string; full_name: string; group_id?: string; members?: NamedCompanion[]; plus_limit: number; companions: NamedCompanion[]; response_status?: RsvpStatus | null; reserved_seats?: ReservedSeatChoice[] }

export async function submitPublicGroupRsvp(eventId: string, group: PublicGuestMatch, members: CompanionChoice[], dietaryNotes?: string): Promise<Pick<RsvpResponse, 'id' | 'submitted_at'>> {
  const response = await fetch(`${API_BASE_URL}/api/rsvp/group/${group.id}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_id: eventId, members, dietary_notes: dietaryNotes }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Could not save group RSVP');
  return payload;
}

export async function searchPublicRsvpGuests(eventId: string, name: string): Promise<PublicGuestMatch[]> {
  const response = await fetch(`${API_BASE_URL}/api/rsvp/search`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, name }) });
  if (!response.ok) throw new Error('Could not search invitations');
  const payload = await response.json();
  return Array.isArray(payload.matches) ? payload.matches : [];
}

export async function submitPublicRsvpLookup(eventId: string, name: string, responseData?: { status: RsvpStatus; partyCount: number; plusOneCount: number; attendeeNames: string[]; contactEmail?: string; contactPhone?: string; dietaryNotes?: string }): Promise<{ matches: PublicGuestMatch[]; message?: string; needs_response?: boolean; unlisted_blocked?: boolean }> {
  const response = await fetch(`${API_BASE_URL}/api/rsvp/lookup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, name, ...(responseData ? { status: responseData.status, party_count: responseData.partyCount, plus_one_count: responseData.plusOneCount, attendee_names: responseData.attendeeNames, contact_email: responseData.contactEmail, contact_phone: responseData.contactPhone, dietary_notes: responseData.dietaryNotes } : {}) }) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Could not send RSVP request');
  return payload;
}

export async function getRsvpResponses(eventId: string, hostCode: string): Promise<RsvpResponse[]> {
  const response = await fetch(`${API_BASE_URL}/api/events/${eventId}/rsvp?host_code=${encodeURIComponent(hostCode)}`);
  if (!response.ok) throw new Error('Failed to load RSVP responses');
  return response.json();
}

export async function updateRsvpUnlistedEnabled(eventId: string, hostCode: string, enabled: boolean): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/events/${eventId}/rsvp-settings`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host_code: hostCode, unlisted_requests_enabled: enabled }) });
  if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error(payload.error || 'Failed to update unlisted RSVP setting'); }
}

export async function getRsvpVerificationRequests(eventId: string, hostCode: string): Promise<RsvpVerificationRequest[]> {
  const response = await fetch(`${API_BASE_URL}/api/events/${eventId}/rsvp-verification-requests?host_code=${encodeURIComponent(hostCode)}`);
  if (!response.ok) throw new Error('Failed to load RSVP verification requests');
  return response.json();
}

export async function reviewRsvpVerificationRequest(eventId: string, hostCode: string, requestId: string, status: 'approved' | 'rejected', guestId?: string, createGuest = false, groupId?: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/events/${eventId}/rsvp-verification-requests/${requestId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host_code: hostCode, status, guest_id: guestId, create_guest: createGuest, group_id: groupId }) });
  if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error(payload.error || 'Failed to review RSVP verification request'); }
}

export async function createRsvpLink(eventId: string, hostCode: string, target: { guestId?: string; groupId?: string }): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/api/events/${eventId}/rsvp-links`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host_code: hostCode, guest_id: target.guestId, group_id: target.groupId }) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Failed to create RSVP link');
  return payload.token;
}

export async function saveManualRsvp(eventId: string, hostCode: string, target: { guestId?: string; groupId?: string }, response: { status: RsvpStatus; partyCount: number; attendees: string[]; contactEmail?: string; contactPhone?: string; dietaryNotes?: string }): Promise<void> {
  const result = await fetch(`${API_BASE_URL}/api/events/${eventId}/rsvp/manual`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host_code: hostCode, guest_id: target.guestId, group_id: target.groupId, status: response.status, party_count: response.partyCount, attendees: response.attendees, contact_email: response.contactEmail, contact_phone: response.contactPhone, dietary_notes: response.dietaryNotes }) });
  if (!result.ok) { const payload = await result.json().catch(() => ({})); throw new Error(payload.error || 'Failed to save RSVP'); }
}

export interface PrivateRsvpInvitation {
  token: string;
  invitation_name: string;
  invited_party_size: number;
  plus_limit: number;
  dietary_enabled: boolean;
  companions: NamedCompanion[];
}

export async function getPrivateRsvpInvitation(token: string): Promise<PrivateRsvpInvitation> {
  const response = await fetch(`${API_BASE_URL}/api/rsvp/link/${token}`);
  if (!response.ok) throw new Error('RSVP link not found');
  return response.json();
}

export async function submitPrivateRsvp(token: string, responseData: { status: RsvpStatus; partyCount: number; plusOneCount: number; attendees: string[]; namedCompanions?: CompanionChoice[]; contactEmail?: string; contactPhone?: string; dietaryNotes?: string }): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/rsvp/link/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: responseData.status, party_count: responseData.partyCount, plus_one_count: responseData.plusOneCount, attendees: responseData.attendees, named_companions: responseData.namedCompanions, contact_email: responseData.contactEmail, contact_phone: responseData.contactPhone, dietary_notes: responseData.dietaryNotes }) });
  if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error(payload.error || 'Could not save RSVP'); }
}

export async function submitPublicGuestRsvp(eventId: string, guest: PublicGuestMatch, responseData: { status: RsvpStatus; namedCompanions: CompanionChoice[]; reservedSeats: ReservedSeatChoice[]; proxy: RsvpProxy | null; dietaryNotes?: string }): Promise<Pick<RsvpResponse, 'id' | 'submitted_at'>> {
  const named = guest.companions.filter((companion, index) => responseData.namedCompanions[index]?.id === companion.id && responseData.namedCompanions[index].status === 'attending').map(companion => companion.full_name);
  const seats = responseData.reservedSeats.map((seat, index) => ({ name: seat.name.trim() || `${guest.full_name.slice(0, 230)} friend #${index + 1}`, status: seat.status }));
  const attendeeNames = [...(responseData.status === 'attending' ? [guest.full_name] : []), ...named, ...seats.filter(seat => seat.status === 'attending').map(seat => seat.name)];
  const plusOneCount = named.length + seats.filter(seat => seat.status === 'attending').length;
  const response = await fetch(`${API_BASE_URL}/api/rsvp/guest/${guest.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: eventId, status: responseData.status, party_count: responseData.status === 'attending' ? 1 : 0, plus_one_count: plusOneCount, named_companions: responseData.namedCompanions, reserved_seats: seats, proxy: responseData.proxy, attendees: attendeeNames, dietary_notes: responseData.dietaryNotes }) });
  if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error(payload.error || 'Could not save RSVP'); }
  return response.json();
}

export async function updateRsvpDietaryEnabled(eventId: string, hostCode: string, enabled: boolean): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/events/${eventId}/rsvp-settings`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host_code: hostCode, dietary_notes_enabled: enabled }) });
  if (!response.ok) throw new Error('Failed to update dietary note setting');
}