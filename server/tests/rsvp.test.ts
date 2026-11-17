import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { after, test } from 'node:test';
import type { AddressInfo } from 'node:net';
import app from '../app.js';
import pool from '../db/index.js';

after(async () => { await pool.end(); });

test('guest-specific allowances, companion names and host-reviewed requests', { timeout: 15000 }, async context => {
  try { await pool.query('SELECT rsvp_plus_limit FROM guests LIMIT 0'); await pool.query('SELECT attendee_names FROM rsvp_verification_requests LIMIT 0'); }
  catch { context.skip('Migrated Postgres unavailable'); return; }
  const hostCode = randomUUID();
  const event = await pool.query<{ id: string }>(
    'INSERT INTO events (name, date, host_code, rsvp_plus_limit) VALUES ($1, NOW(), $2, 2) RETURNING id',
    ['RSVP integration test', hostCode],
  );
  const eventId = event.rows[0].id;
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  async function request(path: string, method = 'GET', body?: Record<string, unknown>) {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, data: await response.json() };
  }
  try {
    const group = await request(`/api/events/${eventId}/guest-groups`, 'POST', { host_code: hostCode, name: 'Example family', invited_party_size: 2 });
    assert.equal(group.status, 201);
    assert.equal(group.data.rsvp_plus_limit, 0);
    const groupUpdated = await request(`/api/events/${eventId}/guest-groups/${group.data.id}`, 'PATCH', { host_code: hostCode, name: 'Example family', invited_party_size: 2, rsvp_plus_limit: 2 });
    assert.equal(groupUpdated.data.rsvp_plus_limit, 2);
    const groupLink = await request(`/api/events/${eventId}/rsvp-links`, 'POST', { host_code: hostCode, group_id: group.data.id });
    assert.equal((await request(`/api/rsvp/link/${groupLink.data.token}`)).data.plus_limit, 2);
    const unallowed = await request(`/api/events/${eventId}/guests`, 'POST', { host_code: hostCode, full_name: 'No Allowance' });
    assert.equal(unallowed.status, 201);
    assert.equal((await request('/api/rsvp/lookup', 'POST', { event_id: eventId, name: 'No Allowance' })).data.matches[0].plus_limit, 0);
    const created = await request(`/api/events/${eventId}/guests`, 'POST', { host_code: hostCode, full_name: 'Alex Example', rsvp_plus_limit: 2 });
    assert.equal(created.status, 201);
    const guestId = created.data.id;
    const named = await request(`/api/events/${eventId}/guests`, 'POST', { host_code: hostCode, full_name: 'Jordan Example', rsvp_owner_id: guestId });
    assert.equal(named.status, 201);
    assert.equal((await request(`/api/events/${eventId}/guests`, 'POST', { host_code: hostCode, full_name: 'Unauthorized', rsvp_owner_id: unallowed.data.id })).status, 409);
    const search = await request('/api/rsvp/lookup', 'POST', { event_id: eventId, name: 'Alex Example' });
    assert.equal(search.data.matches[0].plus_limit, 2);
    assert.equal(search.data.matches[0].companions[0].full_name, 'Jordan Example');
    assert.equal((await request('/api/rsvp/lookup', 'POST', { event_id: eventId, name: 'Jordan Example' })).data.matches[0].id, guestId);
    const reply = (names: string[], plusCount: number, namedStatus: string = 'attending') => request(`/api/rsvp/guest/${guestId}`, 'POST', {
      event_id: eventId, status: 'attending', party_count: 1, plus_one_count: plusCount, named_companions: [{ id: named.data.id, status: namedStatus }], attendees: ['Alex Example', ...names],
    });
    assert.equal((await reply(['Jordan Example', 'Alex Example friend #2'], 2)).status, 200);
    const roster = await request(`/api/events/${eventId}/guests?host_code=${hostCode}`);
    assert.equal(roster.data.guests.filter((guest: { full_name: string }) => guest.full_name === 'Jordan Example').length, 1);
    assert.ok(roster.data.guests.some((guest: { full_name: string }) => guest.full_name === 'Alex Example friend #2'));
    const renamed = await request(`/api/events/${eventId}/guests/${named.data.id}`, 'PATCH', { host_code: hostCode, full_name: 'Jordan Updated', rsvp_owner_id: guestId });
    assert.equal(renamed.status, 200);
    const renamedRoster = await request(`/api/events/${eventId}/guests?host_code=${hostCode}`);
    assert.equal(renamedRoster.data.guests.filter((guest: { full_name: string }) => guest.full_name === 'Jordan Updated').length, 1);
    assert.equal(renamedRoster.data.guests.filter((guest: { full_name: string }) => guest.full_name === 'Jordan Example').length, 0);
    const link = await request(`/api/events/${eventId}/rsvp-links`, 'POST', { host_code: hostCode, guest_id: guestId });
    assert.equal(link.status, 200);
    const invitation = await request(`/api/rsvp/link/${link.data.token}`);
    assert.equal(invitation.data.companions[0].full_name, 'Jordan Updated');
    assert.equal(invitation.data.plus_limit, 2);
    assert.equal((await reply(['One', 'Two', 'Three'], 3)).status, 400);
    assert.equal((await reply(['Taylor Example'], 1, 'declined')).status, 200);
    const declined = await request(`/api/events/${eventId}/guests?host_code=${hostCode}`);
    assert.equal(declined.data.guests.find((guest: { id: string }) => guest.id === named.data.id).rsvp_status, 'declined');
    const edited = await request(`/api/events/${eventId}/guests/${guestId}`, 'PATCH', { host_code: hostCode, full_name: 'Alex Example', rsvp_plus_limit: 0 });
    assert.equal(edited.status, 409);
    assert.equal((await request(`/api/events/${eventId}/guests/${guestId}`, 'PATCH', { host_code: hostCode, full_name: 'Alex Example', rsvp_plus_limit: 1 })).data.rsvp_plus_limit, 1);
    assert.equal((await reply(['Jordan'], 1)).status, 400);
    const reservedReply = (status: string, seats: { name: string; status: string }[], proxy: { id?: string; index?: number } | null, namedStatus = 'attending') => request(`/api/rsvp/guest/${guestId}`, 'POST', {
      event_id: eventId, status, party_count: status === 'attending' ? 1 : 0,
      plus_one_count: (namedStatus === 'attending' ? 1 : 0) + seats.filter(seat => seat.status === 'attending').length,
      named_companions: [{ id: named.data.id, status: namedStatus }],
      reserved_seats: seats, proxy,
      attendees: [...(status === 'attending' ? ['Alex Example'] : []), ...(namedStatus === 'attending' ? ['Jordan Updated'] : []), ...seats.filter(seat => seat.status === 'attending').map(seat => seat.name || 'Alex Example friend #1')],
    });
    assert.equal((await reservedReply('declined', [], { id: named.data.id })).status, 200);
    let proxyRoster = await request(`/api/events/${eventId}/guests?host_code=${hostCode}`);
    assert.equal(proxyRoster.data.guests.find((guest: { id: string }) => guest.id === named.data.id).proxy_of, 'Alex Example');
    assert.equal(proxyRoster.data.guests.find((guest: { id: string }) => guest.id === named.data.id).rsvp_status, 'attending');
    assert.equal(proxyRoster.data.guests.find((guest: { id: string }) => guest.id === guestId).rsvp_status, 'declined');
    assert.equal((await request('/api/rsvp/lookup', 'POST', { event_id: eventId, name: 'Alex Example' })).data.matches[0].companions[0].is_proxy, true);
    assert.equal((await reservedReply('declined', [], null)).status, 400);
    assert.equal((await reservedReply('attending', [], null, 'declined')).status, 200);
    assert.equal((await request(`/api/events/${eventId}/guests?host_code=${hostCode}`)).data.guests.find((guest: { id: string }) => guest.id === named.data.id).proxy_of, null);
    assert.equal((await request(`/api/events/${eventId}/guests/${guestId}`, 'PATCH', { host_code: hostCode, full_name: 'Alex Example', rsvp_plus_limit: 2 })).status, 200);
    assert.equal((await reservedReply('declined', [{ name: 'Taylor Proxy', status: 'attending' }], { index: 0 }, 'declined')).status, 200);
    proxyRoster = await request(`/api/events/${eventId}/guests?host_code=${hostCode}`);
    const proxyGuest = proxyRoster.data.guests.find((guest: { full_name: string }) => guest.full_name === 'Taylor Proxy');
    assert.equal(proxyGuest.proxy_of, 'Alex Example');
    assert.equal(proxyGuest.rsvp_status, 'attending');
    const attendingResponse = (await request(`/api/events/${eventId}/rsvp?host_code=${hostCode}`)).data.find((response: { guest_id: string }) => response.guest_id === guestId);
    assert.equal(attendingResponse.party_count, 1);
    assert.equal(attendingResponse.plus_one_count, 1);
    const table = await request(`/api/events/${eventId}/seating/tables`, 'POST', { host_code: hostCode, name: 'Proxy table', capacity: 2 });
    assert.equal(table.status, 201);
    assert.equal((await request(`/api/events/${eventId}/seating/assignments/${proxyGuest.id}`, 'PUT', { host_code: hostCode, table_id: table.data.id })).status, 200);
    assert.equal((await request(`/api/events/${eventId}/seating?host_code=${hostCode}`)).data.tables[0].occupancy, 1);
    const undecidedReply = await reservedReply('attending', [{ name: '', status: 'undecided' }], null, 'declined');
    assert.equal(undecidedReply.status, 200, JSON.stringify(undecidedReply.data));
    const undecidedRoster = await request(`/api/events/${eventId}/guests?host_code=${hostCode}`);
    assert.equal(undecidedRoster.data.guests.find((guest: { id: string }) => guest.id === proxyGuest.id).rsvp_status, 'undecided');
    assert.equal(undecidedRoster.data.guests.find((guest: { id: string }) => guest.id === proxyGuest.id).full_name, 'Alex Example friend #1');
    assert.equal(undecidedRoster.data.guests.find((guest: { id: string }) => guest.id === proxyGuest.id).proxy_of, null);
    assert.equal((await request(`/api/events/${eventId}/seating?host_code=${hostCode}`)).data.tables[0].occupancy, 0);
    assert.equal((await reservedReply('attending', [{ name: 'Taylor Proxy', status: 'declined' }], null, 'undecided')).status, 200);
    assert.equal((await request(`/api/events/${eventId}/guests?host_code=${hostCode}`)).data.guests.find((guest: { id: string }) => guest.id === proxyGuest.id).rsvp_status, 'declined');
    assert.equal((await reservedReply('attending', [{ name: 'Taylor Proxy', status: 'attending' }, { name: 'Extra', status: 'attending' }], null)).status, 400);
    const savedMatch = (await request('/api/rsvp/lookup', 'POST', { event_id: eventId, name: 'Alex Example' })).data.matches[0];
    assert.equal(savedMatch.response_status, 'attending');
    assert.equal(savedMatch.reserved_seats[0].status, 'declined');
    assert.equal((await reservedReply('declined', [{ name: 'Taylor Proxy', status: 'declined' }], null, 'declined')).status, 200);
    assert.equal((await request(`/api/events/${eventId}/guests?host_code=${hostCode}`)).data.guests.find((guest: { id: string }) => guest.id === proxyGuest.id).rsvp_status, 'declined');
    assert.equal((await request(`/api/events/${eventId}/guests/${guestId}`, 'PATCH', { host_code: hostCode, full_name: 'Alex Example', rsvp_plus_limit: 1 })).status, 200);
    assert.equal((await reservedReply('attending', [], null, 'undecided')).status, 200);
    assert.equal((await request(`/api/events/${eventId}/guests?host_code=${hostCode}`)).data.guests.some((guest: { id: string }) => guest.id === proxyGuest.id), false);
    assert.equal((await request('/api/rsvp/lookup', 'POST', { event_id: eventId, name: 'Unknown Example' })).data.needs_response, true);
    assert.equal((await request(`/api/events/${eventId}/rsvp-settings`, 'PATCH', { host_code: hostCode, dietary_notes_enabled: false })).status, 200);
    assert.equal((await request(`/api/rsvp/guest/${guestId}`, 'POST', { event_id: eventId, status: 'declined', party_count: 0, plus_one_count: 0, dietary_notes: 'test' })).status, 400);
    assert.equal((await request('/api/rsvp/lookup', 'POST', { event_id: eventId, name: 'Unknown Example', status: 'attending', party_count: 1, plus_one_count: 1 })).status, 400);
    const pending = await request('/api/rsvp/lookup', 'POST', {
      event_id: eventId, name: 'Unknown Example', status: 'attending', party_count: 1, plus_one_count: 0, attendee_names: [],
    });
    assert.equal(pending.status, 202);
    const queue = await request(`/api/events/${eventId}/rsvp-verification-requests?host_code=${hostCode}`);
    const submission = queue.data.find((item: { submitted_name: string; status: string }) => item.submitted_name === 'Unknown Example' && item.status === 'pending');
    assert.ok(submission);
    assert.equal((await request(`/api/events/${eventId}/rsvp-verification-requests/${submission.id}`, 'PATCH', {
      host_code: hostCode, status: 'approved', create_guest: true,
    })).status, 200);
    const approvedRoster = await request(`/api/events/${eventId}/guests?host_code=${hostCode}`);
    assert.ok(approvedRoster.data.guests.some((guest: { full_name: string }) => guest.full_name === 'Unknown Example'));
  } finally {
    server.close();
    await pool.query('DELETE FROM events WHERE id = $1', [eventId]);
  }
});
