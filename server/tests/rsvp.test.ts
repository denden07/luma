import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { after, test } from 'node:test';
import type { AddressInfo } from 'node:net';
import app from '../app.js';
import pool from '../db/index.js';

after(async () => { await pool.end(); });

test('guest-specific allowances, companion names and host-reviewed requests', { timeout: 15000 }, async context => {
  try { await pool.query('SELECT is_group_responder FROM guests LIMIT 0'); await pool.query('SELECT attendee_names FROM rsvp_verification_requests LIMIT 0'); await pool.query('SELECT rsvp_unlisted_requests_enabled FROM events LIMIT 0'); }
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
    const group = await request(`/api/events/${eventId}/guest-groups`, 'POST', { host_code: hostCode, name: 'Example family', invited_party_size: 4 });
    assert.equal(group.status, 201);
    assert.equal(group.data.rsvp_plus_limit, 0);
    const groupUpdated = await request(`/api/events/${eventId}/guest-groups/${group.data.id}`, 'PATCH', { host_code: hostCode, name: 'Example family', invited_party_size: 4, rsvp_plus_limit: 2 });
    assert.equal(groupUpdated.data.rsvp_plus_limit, 2);
    const groupLink = await request(`/api/events/${eventId}/rsvp-links`, 'POST', { host_code: hostCode, group_id: group.data.id });
    assert.equal((await request(`/api/rsvp/link/${groupLink.data.token}`)).data.plus_limit, 2);
    const responder = await request(`/api/events/${eventId}/guests`, 'POST', { host_code: hostCode, full_name: 'Group Responder', group_id: group.data.id, is_group_responder: true });
    const member = await request(`/api/events/${eventId}/guests`, 'POST', { host_code: hostCode, full_name: 'Group Member', group_id: group.data.id });
    assert.equal(responder.status, 201);
    assert.equal(member.status, 201);
    assert.equal((await request(`/api/events/${eventId}/guests`, 'POST', { host_code: hostCode, full_name: 'Invalid group allowance', group_id: group.data.id, rsvp_plus_limit: 1 })).status, 400);
    assert.equal((await request(`/api/events/${eventId}/guests/${member.data.id}`, 'PATCH', { host_code: hostCode, full_name: 'Group Member', group_id: group.data.id, rsvp_plus_limit: 1 })).status, 400);
    assert.equal((await request('/api/rsvp/lookup', 'POST', { event_id: eventId, name: 'Group Member' })).data.needs_response, true);
    for (const searchName of ['Group Responder', 'Example family']) {
      const found = await request('/api/rsvp/lookup', 'POST', { event_id: eventId, name: searchName });
      assert.equal(found.data.matches[0].group_id, group.data.id);
      assert.deepEqual(found.data.matches[0].members.map((guest: { full_name: string }) => guest.full_name), ['Group Responder', 'Group Member']);
    }
    assert.equal((await request(`/api/rsvp/guest/${member.data.id}`, 'POST', { event_id: eventId, status: 'attending', party_count: 1, plus_one_count: 0, attendees: ['Group Member'] })).status, 400);
    const groupReply = (first: string, second: string) => request(`/api/rsvp/group/${group.data.id}`, 'POST', {
      event_id: eventId, members: [{ id: responder.data.id, status: first }, { id: member.data.id, status: second }],
    });
    assert.equal((await groupReply('attending', 'declined')).status, 200);
    let groupRoster = await request(`/api/events/${eventId}/guests?host_code=${hostCode}`);
    assert.equal(groupRoster.data.guests.find((guest: { id: string }) => guest.id === responder.data.id).rsvp_status, 'attending');
    assert.equal(groupRoster.data.guests.find((guest: { id: string }) => guest.id === member.data.id).rsvp_status, 'declined');
    assert.equal((await request(`/api/rsvp/group/${group.data.id}`, 'POST', { event_id: eventId, members: [{ id: responder.data.id, status: 'attending' }] })).status, 400);
    assert.equal((await groupReply('undecided', 'declined')).status, 200);
    groupRoster = await request(`/api/events/${eventId}/guests?host_code=${hostCode}`);
    assert.equal(groupRoster.data.guests.find((guest: { id: string }) => guest.id === responder.data.id).rsvp_status, 'undecided');
    assert.equal((await groupReply('declined', 'declined')).status, 200);
    groupRoster = await request(`/api/events/${eventId}/guests?host_code=${hostCode}`);
    assert.equal(groupRoster.data.guests.find((guest: { id: string }) => guest.id === responder.data.id).rsvp_status, 'declined');
    assert.equal((await groupReply('attending', 'attending')).status, 200);
    assert.equal((await request(`/api/events/${eventId}/guests`, 'POST', { host_code: hostCode, full_name: 'Second Responder', group_id: group.data.id, is_group_responder: true })).status, 201);
    assert.equal((await request(`/api/events/${eventId}/guests`, 'POST', { host_code: hostCode, full_name: 'Third', group_id: group.data.id, is_group_responder: true })).status, 409);
    const family = await request(`/api/events/${eventId}/guest-groups`, 'POST', { host_code: hostCode, name: 'Dela Cruz family', invited_party_size: 10 });
    const familyMembers: { id: string }[] = [];
    for (let index = 0; index < 10; index++) {
      const added = await request(`/api/events/${eventId}/guests`, 'POST', {
        host_code: hostCode, full_name: `Family Guest ${index + 1}`, group_id: family.data.id, is_group_responder: index === 0 || index === 1,
      });
      assert.equal(added.status, 201);
      familyMembers.push(added.data);
    }
    const familySearch = await request('/api/rsvp/lookup', 'POST', { event_id: eventId, name: 'Dela Cruz family' });
    assert.equal(familySearch.data.matches[0].members.length, 10);
    assert.equal((await request('/api/rsvp/lookup', 'POST', { event_id: eventId, name: 'Family Guest 3' })).data.needs_response, true);
    const familyReply = await request(`/api/rsvp/group/${family.data.id}`, 'POST', {
      event_id: eventId, members: familyMembers.map((guest: { id: string }, index: number) => ({ id: guest.id, status: index < 8 ? 'attending' : 'declined' })),
    });
    assert.equal(familyReply.status, 200);
    assert.equal(familyReply.data.party_count, 8);
    assert.equal((await request(`/api/events/${eventId}/guests?host_code=${hostCode}`)).data.guests.find((guest: { id: string }) => guest.id === familyMembers[9].id).rsvp_status, 'declined');
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
    const table = await request(`/api/events/${eventId}/seating/tables`, 'POST', { host_code: hostCode, name: 'Proxy table', capacity: 2, numbered_seats: true });
    assert.equal(table.status, 201);
    assert.equal((await request(`/api/events/${eventId}/seating/assignments/${proxyGuest.id}`, 'PUT', { host_code: hostCode, table_id: table.data.id, seat_number: 1 })).status, 200);
    assert.equal((await request(`/api/events/${eventId}/seating?host_code=${hostCode}`)).data.tables[0].occupancy, 1);
    const guestTable = await request(`/api/events/${eventId}/seating/tables`, 'POST', { host_code: hostCode, name: 'Guest seating', capacity: 3, numbered_seats: true });
    assert.equal(guestTable.status, 201);
    for (const [id, seatNumber] of [[guestId, 1], [named.data.id, 2], [member.data.id, 3]] as [string, number][]) {
      assert.equal((await request(`/api/events/${eventId}/seating/assignments/${id}`, 'PUT', {
        host_code: hostCode, table_id: guestTable.data.id, seat_number: seatNumber,
      })).status, 200);
    }
    const seatedMatch = (await request('/api/rsvp/lookup', 'POST', { event_id: eventId, name: 'Alex Example' })).data.matches[0];
    assert.equal(seatedMatch.table_name, 'Guest seating');
    assert.equal(seatedMatch.seat_number, 1);
    assert.equal(seatedMatch.companions[0].table_name, 'Guest seating');
    assert.equal(seatedMatch.companions[0].seat_number, 2);
    assert.equal(seatedMatch.reserved_seats[0].table_name, 'Proxy table');
    assert.equal(seatedMatch.reserved_seats[0].seat_number, 1);
    assert.equal((await request('/api/rsvp/search', 'POST', { event_id: eventId, name: 'Alex Example' })).data.matches[0].table_name, 'Guest seating');
    const groupSeating = (await request('/api/rsvp/lookup', 'POST', { event_id: eventId, name: 'Example family' })).data.matches[0];
    assert.equal(groupSeating.members.find((guest: { id: string }) => guest.id === member.data.id).seat_number, 3);
    assert.equal(groupSeating.members.find((guest: { id: string }) => guest.id === member.data.id).table_name, 'Guest seating');
    const undecidedReply = await reservedReply('attending', [{ name: '', status: 'undecided' }], null, 'declined');
    assert.equal(undecidedReply.status, 200, JSON.stringify(undecidedReply.data));
    const undecidedRoster = await request(`/api/events/${eventId}/guests?host_code=${hostCode}`);
    assert.equal(undecidedRoster.data.guests.find((guest: { id: string }) => guest.id === proxyGuest.id).rsvp_status, 'undecided');
    assert.equal(undecidedRoster.data.guests.find((guest: { id: string }) => guest.id === proxyGuest.id).full_name, 'Alex Example friend #1');
    assert.equal(undecidedRoster.data.guests.find((guest: { id: string }) => guest.id === proxyGuest.id).proxy_of, null);
    assert.equal((await request(`/api/events/${eventId}/seating?host_code=${hostCode}`)).data.tables[0].occupancy, 0);
    assert.equal((await request('/api/rsvp/lookup', 'POST', { event_id: eventId, name: 'Alex Example' })).data.matches[0].reserved_seats[0].table_name, null);
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
    const disabled = await request(`/api/events/${eventId}/rsvp-settings`, 'PATCH', { host_code: hostCode, unlisted_requests_enabled: false });
    assert.equal(disabled.status, 200);
    assert.equal(disabled.data.rsvp_unlisted_requests_enabled, false);
    assert.equal(disabled.data.rsvp_dietary_notes_enabled, false);
    assert.equal((await request('/api/rsvp/lookup', 'POST', { event_id: eventId, name: 'Another Unknown' })).data.unlisted_blocked, true);
    assert.equal((await request('/api/rsvp/lookup', 'POST', { event_id: eventId, name: 'Another Unknown', status: 'attending', party_count: 1 })).status, 403);
    assert.equal((await request(`/api/events/${eventId}/rsvp-verification-requests?host_code=${hostCode}`)).data.some((item: { submitted_name: string }) => item.submitted_name === 'Another Unknown'), false);
    assert.ok((await request('/api/rsvp/lookup', 'POST', { event_id: eventId, name: 'Alex Example' })).data.matches.length > 0);
    assert.equal((await request(`/api/events/${eventId}/rsvp-settings`, 'PATCH', { host_code: 'wrong', unlisted_requests_enabled: true })).status, 404);
    assert.equal((await request(`/api/events/${eventId}/rsvp-settings`, 'PATCH', { host_code: hostCode, unlisted_requests_enabled: 'yes' })).status, 400);
    assert.equal((await request(`/api/events/${eventId}/rsvp-settings`, 'PATCH', { host_code: hostCode, unlisted_requests_enabled: true })).status, 200);
    assert.equal((await request('/api/rsvp/lookup', 'POST', { event_id: eventId, name: 'Another Unknown' })).data.needs_response, true);
  } finally {
    server.close();
    await pool.query('DELETE FROM events WHERE id = $1', [eventId]);
  }
});
