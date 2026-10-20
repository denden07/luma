import { Router } from 'express';
import type { PoolClient } from 'pg';
import pool from '../db/index.js';

const router = Router();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validId = (value: unknown): value is string => typeof value === 'string' && uuid.test(value);
const optionalContact = (value: unknown, limit: number) => value === undefined || value === null || (typeof value === 'string' && value.trim().length <= limit);

type Response = {
  id: string; event_id: string; guest_id: string | null; group_id: string | null;
  status: string; party_count: number; plus_one_count: number; display_name: string | null;
};

// Reconcile within the RSVP transaction (also used to backfill pre-seating responses).
export async function reconcileResponse(client: PoolClient, responseId: string): Promise<void> {
  const result = await client.query<Response>(
    `SELECT r.id, r.event_id, r.guest_id, r.group_id, r.status, r.party_count, r.plus_one_count,
       COALESCE(g.full_name, gg.name) AS display_name
     FROM rsvp_responses r
     LEFT JOIN guests g ON g.id = r.guest_id
     LEFT JOIN guest_groups gg ON gg.id = r.group_id
     WHERE r.id = $1 FOR UPDATE OF r`,
    [responseId],
  );
  const response = result.rows[0];
  if (!response) return;
  const old = await client.query<{ id: string; rsvp_ordinal: number; full_name: string; companion_label: string | null; is_rsvp_companion: boolean; group_id: string | null }>(
    'SELECT id, rsvp_ordinal, full_name, companion_label, is_rsvp_companion, group_id FROM guests WHERE rsvp_response_id = $1 ORDER BY rsvp_ordinal FOR UPDATE',
    [responseId],
  );
  if (response.status !== 'attending') {
    await client.query('DELETE FROM guests WHERE rsvp_response_id = $1', [responseId]);
    return;
  }
  const attendees = await client.query<{ full_name: string }>(
    'SELECT full_name FROM rsvp_attendees WHERE response_id = $1 ORDER BY ordinal NULLS LAST, created_at, id',
    [responseId],
  );
  const roster = await client.query<{ id: string; full_name: string }>(
    `SELECT id, full_name FROM guests WHERE event_id = $1 AND rsvp_response_id IS NULL
       AND (id = $2 OR ($3::uuid IS NOT NULL AND group_id = $3))
     ORDER BY created_at, id`,
    [response.event_id, response.guest_id, response.group_id],
  );
  const used = new Set<string>();
  const kept = new Set<number>();
  const owner = response.display_name?.trim() || 'Guest';
  let availableGroupSlots = 0;
  if (response.group_id) {
    const group = await client.query<{ invited_party_size: number }>('SELECT invited_party_size FROM guest_groups WHERE id = $1 FOR UPDATE', [response.group_id]);
    if (group.rows[0]) {
      const count = await client.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM guests WHERE group_id = $1 AND rsvp_response_id IS DISTINCT FROM $2',
        [response.group_id, responseId],
      );
      availableGroupSlots = Math.max(0, group.rows[0].invited_party_size - Number(count.rows[0].count));
    }
  }
  for (let index = 0; index < response.party_count; index++) {
    const name = attendees.rows[index]?.full_name?.trim() || '';
    const generic = !name || /^(additional guest|plus[\s-]*one|guest|companion|friend)(?:\s*#?\d+)?$/i.test(name);
    const isCompanion = index >= response.party_count - response.plus_one_count;
    const match = isCompanion ? undefined : roster.rows.find(guest => !used.has(guest.id) && (
      (!response.group_id && guest.id === response.guest_id && (index === 0 || guest.full_name.trim().toLowerCase() === name.toLowerCase())) ||
      (!generic && guest.full_name.trim().toLowerCase() === name.toLowerCase())
    ));
    if (match) { used.add(match.id); continue; }
    // For an individual invitation the first attendee is the invited guest, even for legacy placeholder names.
    if (!isCompanion && index === 0 && response.guest_id) {
      const invited = roster.rows.find(guest => guest.id === response.guest_id && !used.has(guest.id));
      if (invited) { used.add(invited.id); continue; }
    }
    const ordinal = isCompanion
      ? index - (response.party_count - response.plus_one_count) + 1
      : index + (response.guest_id ? 0 : 1);
    const label = `${owner} friend #${Math.max(1, ordinal)}`.slice(0, 255);
    const fullName = generic ? label : name.slice(0, 255);
    const autoGroupId = !isCompanion && response.group_id && availableGroupSlots-- > 0 ? response.group_id : null;
    kept.add(index);
    const previous = old.rows.find(guest => guest.rsvp_ordinal === index);
    if (previous) {
      if (previous.full_name !== fullName || previous.companion_label !== label || previous.is_rsvp_companion !== isCompanion || previous.group_id !== autoGroupId)
        await client.query('UPDATE guests SET full_name = $1, companion_label = $2, is_rsvp_companion = $3, group_id = $4 WHERE id = $5', [fullName, label, isCompanion, autoGroupId, previous.id]);
    } else {
      await client.query(
        `INSERT INTO guests (event_id, group_id, full_name, companion_label, is_rsvp_companion, rsvp_response_id, rsvp_ordinal)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [response.event_id, autoGroupId, fullName, label, isCompanion, responseId, index],
      );
    }
  }
  for (const guest of old.rows) {
    if (!kept.has(guest.rsvp_ordinal)) await client.query('DELETE FROM guests WHERE id = $1', [guest.id]);
  }
}

async function authorized(eventId: string, code: unknown): Promise<boolean> {
  if (!validId(eventId) || typeof code !== 'string' || !code) return false;
  const result = await pool.query('SELECT 1 FROM events WHERE id = $1 AND host_code = $2 AND is_active = TRUE', [eventId, code]);
  return result.rowCount === 1;
}

const guestQuery = `SELECT g.id, g.event_id, g.group_id, g.full_name, g.email, g.phone,
  g.companion_label, g.is_rsvp_companion, COALESCE(own.status, grp.status, companion.status) AS rsvp_status, g.table_id
  FROM guests g
  LEFT JOIN rsvp_responses own ON own.guest_id = g.id
  LEFT JOIN rsvp_responses grp ON grp.group_id = g.group_id
  LEFT JOIN rsvp_responses companion ON companion.id = g.rsvp_response_id`;

router.get('/:eventId/seating', async (req, res) => {
  const { eventId } = req.params;
  try {
    if (!await authorized(eventId, req.query.host_code)) return res.status(404).json({ error: 'Event not found' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT id FROM guest_groups WHERE event_id = $1 ORDER BY id FOR UPDATE', [eventId]);
      const responses = await client.query<{ id: string }>('SELECT id FROM rsvp_responses WHERE event_id = $1 ORDER BY id', [eventId]);
      for (const response of responses.rows) await reconcileResponse(client, response.id);
      const tables = await client.query(
        `SELECT t.id, t.event_id, t.name, t.capacity, COUNT(g.id)::integer AS occupancy
         FROM seating_tables t LEFT JOIN guests g ON g.table_id = t.id
         WHERE t.event_id = $1 GROUP BY t.id ORDER BY t.created_at, t.id`, [eventId],
      );
      const guests = await client.query(`${guestQuery} WHERE g.event_id = $1 ORDER BY g.full_name, g.id`, [eventId]);
      await client.query('COMMIT');
      return res.json({ tables: tables.rows, guests: guests.rows });
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  } catch (error) { console.error('Error loading seating:', error); return res.status(500).json({ error: 'Failed to load seating' }); }
});

router.post('/:eventId/seating/tables', async (req, res) => {
  const { eventId } = req.params;
  const { host_code: code, name, capacity } = req.body ?? {};
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 255 || !Number.isInteger(capacity) || capacity < 1 || capacity > 2147483647)
    return res.status(400).json({ error: 'A name and positive integer capacity are required' });
  try {
    if (!await authorized(eventId, code)) return res.status(404).json({ error: 'Event not found' });
    const result = await pool.query(
      'INSERT INTO seating_tables (event_id, name, capacity) VALUES ($1, $2, $3) RETURNING id, event_id, name, capacity, 0 AS occupancy',
      [eventId, name.trim(), capacity],
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) { console.error('Error creating table:', error); return res.status(500).json({ error: 'Failed to create table' }); }
});

router.patch('/:eventId/seating/tables/:tableId', async (req, res) => {
  const { eventId, tableId } = req.params;
  const { host_code: code, name, capacity } = req.body ?? {};
  if (!validId(tableId) || (name === undefined && capacity === undefined) ||
      (name !== undefined && (typeof name !== 'string' || !name.trim() || name.trim().length > 255)) ||
      (capacity !== undefined && (!Number.isInteger(capacity) || capacity < 1 || capacity > 2147483647)))
    return res.status(400).json({ error: 'Invalid table update' });
  try {
    if (!await authorized(eventId, code)) return res.status(404).json({ error: 'Event not found' });
    const result = await pool.query(
      `UPDATE seating_tables SET name = COALESCE($1, name), capacity = COALESCE($2, capacity)
       WHERE id = $3 AND event_id = $4 RETURNING id, event_id, name, capacity,
       (SELECT COUNT(*)::integer FROM guests WHERE table_id = $3) AS occupancy`,
      [name?.trim() ?? null, capacity ?? null, tableId, eventId],
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Table not found' });
    return res.json(result.rows[0]);
  } catch (error) { console.error('Error updating table:', error); return res.status(500).json({ error: 'Failed to update table' }); }
});

router.delete('/:eventId/seating/tables/:tableId', async (req, res) => {
  const { eventId, tableId } = req.params;
  try {
    if (!await authorized(eventId, req.query.host_code)) return res.status(404).json({ error: 'Event not found' });
    if (!validId(tableId)) return res.status(400).json({ error: 'Invalid table ID' });
    const result = await pool.query('DELETE FROM seating_tables WHERE id = $1 AND event_id = $2 RETURNING id', [tableId, eventId]);
    if (!result.rowCount) return res.status(404).json({ error: 'Table not found' });
    return res.status(204).end();
  } catch (error) { console.error('Error deleting table:', error); return res.status(500).json({ error: 'Failed to delete table' }); }
});

router.put('/:eventId/seating/assignments/:guestId', async (req, res) => {
  const { eventId, guestId } = req.params;
  const { host_code: code, table_id: tableId } = req.body ?? {};
  if (!validId(guestId) || !(tableId === null || validId(tableId)))
    return res.status(400).json({ error: 'A valid table_id or null is required' });
  try {
    if (!await authorized(eventId, code)) return res.status(404).json({ error: 'Event not found' });
    if (tableId && !(await pool.query('SELECT 1 FROM seating_tables WHERE id = $1 AND event_id = $2', [tableId, eventId])).rowCount)
      return res.status(404).json({ error: 'Table not found' });
    const updated = await pool.query(
      `UPDATE guests SET table_id = $1 WHERE id = $2 AND event_id = $3
       RETURNING id`, [tableId, guestId, eventId],
    );
    if (!updated.rowCount) return res.status(404).json({ error: 'Guest not found' });
    const guest = await pool.query(`${guestQuery} WHERE g.id = $1 AND g.event_id = $2`, [guestId, eventId]);
    return res.json(guest.rows[0]);
  } catch (error) { console.error('Error assigning guest:', error); return res.status(500).json({ error: 'Failed to assign guest' }); }
});

router.post('/:eventId/seating/guests', async (req, res) => {
  const { eventId } = req.params;
  const { host_code: code, full_name: name, email, phone, group_id: groupId = null, table_id: tableId } = req.body ?? {};
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 255 ||
      !optionalContact(email, 255) || !optionalContact(phone, 40) ||
      !(groupId === null || validId(groupId)) || !validId(tableId))
    return res.status(400).json({ error: 'Valid guest name, group_id and table_id are required' });
  let client: PoolClient | undefined;
  try {
    if (!await authorized(eventId, code)) return res.status(404).json({ error: 'Event not found' });
    client = await pool.connect();
    await client.query('BEGIN');
    if (groupId) {
      const group = await client.query<{ invited_party_size: number }>(
        'SELECT invited_party_size FROM guest_groups WHERE id = $1 AND event_id = $2 FOR UPDATE', [groupId, eventId],
      );
      if (!group.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Group not found' }); }
      const count = await client.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM guests WHERE group_id = $1', [groupId]);
      if (Number(count.rows[0].count) >= group.rows[0].invited_party_size) {
        await client.query('ROLLBACK'); return res.status(409).json({ error: 'This invitation group has reached its guest limit' });
      }
    }
    const table = await client.query('SELECT 1 FROM seating_tables WHERE id = $1 AND event_id = $2 FOR UPDATE', [tableId, eventId]);
    if (!table.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Table not found' }); }
    const created = await client.query(
      `INSERT INTO guests (event_id, group_id, full_name, email, phone, table_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [eventId, groupId, name.trim(), email?.trim() || null, phone?.trim() || null, tableId],
    );
    const guest = await client.query(`${guestQuery} WHERE g.id = $1`, [created.rows[0].id]);
    await client.query('COMMIT');
    return res.status(201).json(guest.rows[0]);
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => undefined);
    console.error('Error creating seated guest:', error);
    return res.status(500).json({ error: 'Failed to create seated guest' });
  } finally { client?.release(); }
});

export default router;
