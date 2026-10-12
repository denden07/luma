const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export interface GuestGroup {
  id: string;
  event_id: string;
  name: string;
  contact_number: string | null;
  invited_party_size: number;
}

export interface InvitationGuest {
  id: string;
  event_id: string;
  group_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
}

export interface GuestRoster {
  groups: GuestGroup[];
  guests: InvitationGuest[];
}

export async function getGuestRoster(eventId: string, hostCode: string): Promise<GuestRoster> {
  const response = await fetch(`${API_BASE_URL}/api/events/${eventId}/guests?host_code=${encodeURIComponent(hostCode)}`);
  if (!response.ok) throw new Error('Failed to load guests');
  return response.json();
}

export async function createGuestGroup(eventId: string, hostCode: string, name: string, invitedPartySize: number, contactNumber?: string): Promise<GuestGroup> {
  const response = await fetch(`${API_BASE_URL}/api/events/${eventId}/guest-groups`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ host_code: hostCode, name, contact_number: contactNumber, invited_party_size: invitedPartySize }),
  });
  if (!response.ok) throw new Error('Failed to create guest group');
  return response.json();
}

export async function updateGuestGroup(eventId: string, hostCode: string, groupId: string, name: string, invitedPartySize: number, contactNumber?: string): Promise<GuestGroup> {
  const response = await fetch(`${API_BASE_URL}/api/events/${eventId}/guest-groups/${groupId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ host_code: hostCode, name, contact_number: contactNumber, invited_party_size: invitedPartySize }),
  });
  if (!response.ok) throw new Error('Failed to update guest group');
  return response.json();
}

export async function deleteGuestGroup(eventId: string, hostCode: string, groupId: string): Promise<{ deleted_guest_count: number }> {
  const response = await fetch(`${API_BASE_URL}/api/events/${eventId}/guest-groups/${groupId}?host_code=${encodeURIComponent(hostCode)}`, { method: 'DELETE' });
  if (!response.ok) throw new Error('Failed to delete guest group');
  return response.json();
}

export async function createInvitationGuest(eventId: string, hostCode: string, guest: { fullName: string; email?: string; phone?: string; groupId?: string }): Promise<InvitationGuest> {
  const response = await fetch(`${API_BASE_URL}/api/events/${eventId}/guests`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ host_code: hostCode, full_name: guest.fullName, email: guest.email, phone: guest.phone, group_id: guest.groupId || null }),
  });
  if (!response.ok) throw new Error('Failed to create guest');
  return response.json();
}

export async function updateInvitationGuest(eventId: string, hostCode: string, guestId: string, guest: { fullName: string; email?: string; phone?: string; groupId?: string }): Promise<InvitationGuest> {
  const response = await fetch(`${API_BASE_URL}/api/events/${eventId}/guests/${guestId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ host_code: hostCode, full_name: guest.fullName, email: guest.email, phone: guest.phone, group_id: guest.groupId || null }),
  });
  if (!response.ok) throw new Error('Failed to update guest');
  return response.json();
}

export async function deleteInvitationGuest(eventId: string, hostCode: string, guestId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/events/${eventId}/guests/${guestId}?host_code=${encodeURIComponent(hostCode)}`, { method: 'DELETE' });
  if (!response.ok) throw new Error('Failed to delete guest');
}