import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import app from '../app.js';
import pool from '../db/index.js';

after(async () => { await pool.end(); });

test('seating remains event-scoped and RSVP roster reconciliation is stable', { timeout: 15000 }, async context => {
  try { await pool.query('SELECT 1'); }
  catch { context.skip('Postgres unavailable; seating integration test requires a reachable database'); return; }
  const hostCode = randomUUID();
  const otherCode = randomUUID();
  const event = await pool.query<{ id: string }>(
    'INSERT INTO events (name, date, host_code, rsvp_plus_limit) VALUES ($1, NOW(), $2, 2) RETURNING id',
    ['Seating integration test', hostCode],
  );
  const other = await pool.query<{ id: string }>(
    'INSERT INTO events (name, date, host_code) VALUES ($1, NOW(), $2) RETURNING id',
    ['Other seating integration test', otherCode],
  );
  const eventId = event.rows[0].id;
  const otherId = other.rows[0].id;
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  async function request(path: string, method = 'GET', body?: Record<string, unknown>) {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, data: response.status === 204 ? null : await response.json() };
  }
  const seating = `/api/events/${eventId}/seating`;
  try {
    const group = await pool.query<{ id: string }>(
      'INSERT INTO guest_groups (event_id, name, invited_party_size) VALUES ($1, $2, 2) RETURNING id',
      [eventId, 'The Smiths'],
    );
    const groupId = group.rows[0].id;
    const invited = await pool.query<{ id: string }>(
      'INSERT INTO guests (event_id, group_id, full_name) VALUES ($1, $2, $3) RETURNING id',
      [eventId, groupId, 'Alex Smith'],
    );
    assert.equal((await request(`${seating}?host_code=bad`)).status, 404);
    const table = await request(`${seating}/tables`, 'POST', { host_code: hostCode, name: 'Family', capacity: 1 });
    assert.equal(table.status, 201);
    const tableId = table.data.id;
    assert.equal(table.data.occupancy, 0);
    const otherTable = await request(`/api/events/${otherId}/seating/tables`, 'POST', { host_code: otherCode, name: 'Other', capacity: 1 });
    assert.equal((await request(`${seating}/assignments/${invited.rows[0].id}`, 'PUT', { host_code: hostCode, table_id: otherTable.data.id })).status, 404);
    assert.equal((await request(`${seating}/assignments/${invited.rows[0].id}`, 'PUT', { host_code: hostCode, table_id: tableId })).status, 200);
    assert.equal((await request(`${seating}/tables/${otherTable.data.id}`, 'PATCH', {
      host_code: hostCode, capacity: 2,
    })).status, 404);

    const reply = (names: string[], status = 'attending', partyCount = 2, plusCount = 1) =>
      request(`/api/events/${eventId}/rsvp/manual`, 'POST', {
        host_code: hostCode, group_id: groupId, status, party_count: partyCount,
        plus_one_count: plusCount, attendees: names,
      });
    assert.equal((await reply(['Alex Smith', 'Taylor Smith', 'Additional guest 1', 'Additional guest 2'], 'attending', 2, 2)).status, 200);
    const first = await request(`${seating}?host_code=${hostCode}`);
    assert.equal(first.status, 200);
    assert.equal(first.data.guests.length, 4);
    const invitedExtra = first.data.guests.find((g: { full_name: string }) => g.full_name === 'Taylor Smith');
    const companion = first.data.guests.find((g: { companion_label: string | null }) => g.companion_label === 'The Smiths friend #1');
    const secondCompanion = first.data.guests.find((g: { companion_label: string | null; is_rsvp_companion: boolean }) => g.companion_label === 'The Smiths friend #2' && g.is_rsvp_companion);
    assert.equal(invitedExtra.group_id, groupId);
    assert.equal(invitedExtra.is_rsvp_companion, false);
    assert.equal(companion.group_id, null);
    assert.equal(companion.is_rsvp_companion, true);
    assert.equal(companion.full_name, 'The Smiths friend #1');
    assert.equal(secondCompanion.full_name, 'The Smiths friend #2');
    assert.notEqual(companion.id, secondCompanion.id);
    assert.equal(companion.rsvp_status, 'attending');
    assert.equal((await request(`${seating}/assignments/${companion.id}`, 'PUT', { host_code: hostCode, table_id: tableId })).status, 200);
    assert.equal((await request(`${seating}/assignments/${secondCompanion.id}`, 'PUT', { host_code: hostCode, table_id: tableId })).status, 200);
    assert.equal((await request(`${seating}?host_code=${hostCode}`)).data.tables[0].occupancy, 3);
    const overCapacity = await request(`${seating}/tables/${tableId}`, 'PATCH', { host_code: hostCode, capacity: 1 });
    assert.equal(overCapacity.status, 200);
    assert.equal(overCapacity.data.occupancy, 3);
    assert.equal((await request(`/api/events/${eventId}/rsvp-links`, 'POST', { host_code: hostCode, guest_id: companion.id })).status, 400);
    assert.equal((await request('/api/rsvp/search', 'POST', { event_id: eventId, name: companion.full_name })).data.matches.length, 0);
    assert.equal((await request(`/api/events/${eventId}/rsvp/manual`, 'POST', { host_code: hostCode, guest_id: companion.id, status: 'declined' })).status, 400);

    assert.equal((await reply(['Alex Smith', 'Taylor Smith', 'Additional guest 1'])).status, 200);
    const second = await request(`${seating}?host_code=${hostCode}`);
    assert.equal(second.data.guests.length, 3);
    assert.equal(second.data.guests.some((g: { id: string }) => g.id === secondCompanion.id), false);
    assert.equal(second.data.guests.find((g: { id: string }) => g.id === companion.id).table_id, tableId);
    assert.equal(second.data.tables[0].occupancy, 2);
    assert.equal((await pool.query('SELECT 1 FROM guests WHERE id = $1', [secondCompanion.id])).rowCount, 0);
    assert.equal((await reply(['Alex Smith', 'Taylor Smith', 'Morgan Friend'])).status, 200);
    const renamed = await request(`${seating}?host_code=${hostCode}`);
    assert.equal(renamed.data.guests.find((g: { id: string }) => g.id === companion.id).full_name, 'Morgan Friend');
    assert.equal(renamed.data.guests.find((g: { id: string }) => g.id === companion.id).companion_label, 'The Smiths friend #1');
    const roster = await request(`/api/events/${eventId}/guests?host_code=${hostCode}`);
    assert.equal(roster.data.guests.find((g: { id: string }) => g.id === companion.id).rsvp_status, 'attending');
    assert.equal(roster.data.guests.find((g: { id: string }) => g.id === companion.id).is_rsvp_companion, true);
    assert.equal((await request(`${seating}/guests`, 'POST', {
      host_code: hostCode, group_id: groupId, full_name: 'Overbook', table_id: tableId,
    })).status, 409);
    const foreignGroup = await pool.query<{ id: string }>(
      'INSERT INTO guest_groups (event_id, name, invited_party_size) VALUES ($1, $2, 1) RETURNING id',
      [otherId, 'Other group'],
    );
    assert.equal((await request(`${seating}/guests`, 'POST', {
      host_code: hostCode, group_id: foreignGroup.rows[0].id, full_name: 'Foreign guest', table_id: tableId,
    })).status, 404);
    assert.equal((await request(`${seating}/guests`, 'POST', {
      host_code: hostCode, full_name: 'New seated guest', table_id: tableId,
    })).status, 201);
    const legacyGuest = await pool.query<{ id: string }>(
      'INSERT INTO guests (event_id, full_name) VALUES ($1, $2) RETURNING id', [eventId, 'Jamie Legacy'],
    );
    const legacyResponse = await pool.query<{ id: string }>(
      `INSERT INTO rsvp_responses (event_id, guest_id, status, party_count, plus_one_count)
       VALUES ($1, $2, 'attending', 3, 2) RETURNING id`, [eventId, legacyGuest.rows[0].id],
    );
    await pool.query('INSERT INTO rsvp_attendees (response_id, full_name, ordinal) VALUES ($1, $2, 0), ($1, $3, 1), ($1, $4, 2)',
      [legacyResponse.rows[0].id, 'Jamie Legacy', 'Additional guest 1', 'Additional guest 2']);
    const backfilled = await request(`${seating}?host_code=${hostCode}`);
    const legacyCompanion = backfilled.data.guests.find((g: { companion_label: string | null }) => g.companion_label === 'Jamie Legacy friend #1');
    const legacyCompanion2 = backfilled.data.guests.find((g: { companion_label: string | null }) => g.companion_label === 'Jamie Legacy friend #2');
    assert.equal(legacyCompanion.is_rsvp_companion, true);
    assert.equal(legacyCompanion.full_name, 'Jamie Legacy friend #1');
    assert.equal(legacyCompanion2.full_name, 'Jamie Legacy friend #2');
    assert.notEqual(legacyCompanion.id, legacyCompanion2.id);
    assert.equal((await request(`${seating}?host_code=${hostCode}`)).data.guests.filter((g: { id: string }) => g.id === legacyCompanion.id).length, 1);
    await pool.query(`UPDATE rsvp_responses SET status = 'declined', party_count = 0, plus_one_count = 0 WHERE id = $1`, [legacyResponse.rows[0].id]);
    const afterLegacyDecline = await request(`${seating}?host_code=${hostCode}`);
    assert.equal(afterLegacyDecline.data.guests.some((g: { id: string }) => g.id === legacyCompanion.id || g.id === legacyCompanion2.id), false);
    assert.equal((await reply([], 'declined', 0, 0)).status, 200);
    const declined = await request(`${seating}?host_code=${hostCode}`);
    assert.equal(declined.data.guests.some((g: { id: string }) => g.id === companion.id), false);
    assert.equal(declined.data.guests.some((g: { id: string }) => g.id === invited.rows[0].id), true);
    assert.equal((await request(`${seating}/tables/${tableId}`, 'DELETE')).status, 404);
    assert.equal((await request(`${seating}/tables/${tableId}?host_code=${hostCode}`, 'DELETE')).status, 204);
    assert.equal((await request(`${seating}?host_code=${hostCode}`)).data.guests.find((g: { id: string }) => g.id === invited.rows[0].id).table_id, null);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await pool.query('DELETE FROM rsvp_responses WHERE event_id = ANY($1::uuid[])', [[eventId, otherId]]);
    await pool.query('DELETE FROM events WHERE id = ANY($1::uuid[])', [[eventId, otherId]]);
  }
});
