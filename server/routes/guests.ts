import { Router } from 'express';
import pool from '../db/index.js';
import { reconcileResponse } from './seating.js';

const router = Router();

async function hostOwnsEvent(eventId: string, hostCode: unknown): Promise<boolean> {
  if (typeof hostCode !== 'string' || !hostCode) return false;
  const result = await pool.query('SELECT 1 FROM events WHERE id = $1 AND host_code = $2 AND is_active = TRUE', [eventId, hostCode]);
  return result.rowCount === 1;
}

router.get('/:eventId/guests', async (req, res) => {
  const { eventId } = req.params;
  try {
    if (!await hostOwnsEvent(eventId, req.query.host_code)) return res.status(404).json({ error: 'Event not found' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const groups = await client.query('SELECT * FROM guest_groups WHERE event_id = $1 ORDER BY created_at FOR UPDATE', [eventId]);
      const responses = await client.query<{ id: string }>('SELECT id FROM rsvp_responses WHERE event_id = $1 ORDER BY id', [eventId]);
      for (const response of responses.rows) await reconcileResponse(client, response.id);
      const guests = await client.query(`SELECT g.*, COALESCE(own.status, grp.status, g.rsvp_companion_status, companion.status) AS rsvp_status,
        proxy_owner.full_name AS proxy_of
        FROM guests g
        LEFT JOIN rsvp_responses own ON own.guest_id = g.id
        LEFT JOIN rsvp_responses grp ON grp.group_id = g.group_id
        LEFT JOIN rsvp_responses companion ON companion.id = g.rsvp_response_id
        LEFT JOIN guests proxy_owner ON proxy_owner.id = g.rsvp_proxy_for_id
        WHERE g.event_id = $1 ORDER BY g.full_name`, [eventId]);
      await client.query('COMMIT');
      return res.json({ groups: groups.rows, guests: guests.rows });
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  } catch (error) {
    console.error('Error loading invitation guests:', error);
    return res.status(500).json({ error: 'Failed to load invitation guests' });
  }
});

router.post('/:eventId/guest-groups', async (req, res) => {
  const { eventId } = req.params;
  const { host_code: hostCode, name, contact_number: contactNumber, invited_party_size: partySize = 1, rsvp_plus_limit: plusLimit = 0 } = req.body as { host_code?: string; name?: string; contact_number?: string; invited_party_size?: number; rsvp_plus_limit?: number };
  if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'Group name is required' });
  if (typeof partySize !== 'number' || !Number.isInteger(partySize) || partySize < 1 || partySize > 20) return res.status(400).json({ error: 'Party size must be between 1 and 20' });
  if (!Number.isInteger(plusLimit) || plusLimit < 0 || plusLimit > 19) return res.status(400).json({ error: 'Additional guests must be between 0 and 19' });
  try {
    if (!await hostOwnsEvent(eventId, hostCode)) return res.status(404).json({ error: 'Event not found' });
    const result = await pool.query('INSERT INTO guest_groups (event_id, name, contact_number, invited_party_size, rsvp_plus_limit) VALUES ($1, $2, $3, $4, $5) RETURNING *', [eventId, name.trim(), typeof contactNumber === 'string' ? contactNumber.trim() || null : null, partySize, plusLimit]);
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating guest group:', error);
    return res.status(500).json({ error: 'Failed to create guest group' });
  }
});

router.post('/:eventId/guests', async (req, res) => {
  const { eventId } = req.params;
  const { host_code: hostCode, full_name: fullName, email, phone, group_id: groupId, rsvp_plus_limit: plusLimit, rsvp_owner_id: ownerId } = req.body as { host_code?: string; full_name?: string; email?: string; phone?: string; group_id?: string | null; rsvp_plus_limit?: number | null; rsvp_owner_id?: string | null };
  if (typeof fullName !== 'string' || !fullName.trim()) return res.status(400).json({ error: 'Guest name is required' });
  if (plusLimit != null && (!Number.isInteger(plusLimit) || plusLimit < 0 || plusLimit > 19)) return res.status(400).json({ error: 'Additional guests must be between 0 and 19' });
  if (ownerId && groupId) return res.status(400).json({ error: 'A named additional guest cannot also belong to a group' });
  const client = await pool.connect();
  try {
    if (!await hostOwnsEvent(eventId, hostCode)) return res.status(404).json({ error: 'Event not found' });
    await client.query('BEGIN');
    if (ownerId) {
      const owner = await client.query<{ rsvp_plus_limit: number | null }>('SELECT rsvp_plus_limit FROM guests WHERE id = $1 AND event_id = $2 AND rsvp_response_id IS NULL AND rsvp_owner_id IS NULL FOR UPDATE', [ownerId, eventId]);
      if (!owner.rows[0]) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Choose an invited guest for this companion' }); }
      const count = await client.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM guests WHERE rsvp_owner_id = $1', [ownerId]);
      if (Number(count.rows[0].count) >= (owner.rows[0].rsvp_plus_limit ?? 0)) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Give this guest an additional-guest allowance before adding a named companion' }); }
    }
    if (groupId) {
      const group = await client.query<{ invited_party_size: number }>('SELECT invited_party_size FROM guest_groups WHERE id = $1 AND event_id = $2 FOR UPDATE', [groupId, eventId]);
      if (group.rowCount === 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Guest group belongs to a different event' }); }
      const groupGuestCount = await client.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM guests WHERE group_id = $1', [groupId]);
      if (Number(groupGuestCount.rows[0].count) >= group.rows[0].invited_party_size) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'This invitation group has reached its guest limit' });
      }
    }
    const result = await client.query(
      'INSERT INTO guests (event_id, group_id, full_name, email, phone, rsvp_plus_limit, rsvp_owner_id, is_rsvp_companion) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [eventId, groupId ?? null, fullName.trim(), typeof email === 'string' ? email.trim() || null : null, typeof phone === 'string' ? phone.trim() || null : null, plusLimit ?? null, ownerId ?? null, Boolean(ownerId)],
    );
    await client.query('COMMIT');
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('Error creating invitation guest:', error);
    return res.status(500).json({ error: 'Failed to create invitation guest' });
  } finally { client.release(); }
});

router.patch('/:eventId/guests/:guestId', async (req, res) => {
  const { eventId, guestId } = req.params;
  const { host_code: hostCode, full_name: fullName, email, phone, group_id: groupId, rsvp_plus_limit: plusLimit, rsvp_owner_id: ownerId } = req.body as { host_code?: string; full_name?: string; email?: string; phone?: string; group_id?: string | null; rsvp_plus_limit?: number | null; rsvp_owner_id?: string | null };
  if (typeof fullName !== 'string' || !fullName.trim()) return res.status(400).json({ error: 'Guest name is required' });
  if (plusLimit != null && (!Number.isInteger(plusLimit) || plusLimit < 0 || plusLimit > 19)) return res.status(400).json({ error: 'Additional guests must be between 0 and 19' });
  if (ownerId && groupId) return res.status(400).json({ error: 'A named additional guest cannot also belong to a group' });
  const client = await pool.connect();
  try {
    if (!await hostOwnsEvent(eventId, hostCode)) return res.status(404).json({ error: 'Event not found' });
    await client.query('BEGIN');
    const existing = await client.query<{ group_id: string | null; rsvp_owner_id: string | null }>('SELECT group_id, rsvp_owner_id FROM guests WHERE id = $1 AND event_id = $2 FOR UPDATE', [guestId, eventId]);
    if (existing.rowCount === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Guest not found' }); }
    if (ownerId && ownerId !== existing.rows[0].rsvp_owner_id) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Create a new named guest to change the invitation owner' }); }
    if (ownerId === guestId) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'A guest cannot be their own companion' }); }
    if (existing.rows[0].rsvp_owner_id && !ownerId) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'A named companion must remain linked to their invited guest' }); }
    if (!existing.rows[0].rsvp_owner_id) {
      const count = await client.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM guests WHERE rsvp_owner_id = $1', [guestId]);
      if (Number(count.rows[0].count) > (plusLimit ?? 0)) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'The allowance cannot be smaller than the number of named companions' }); }
    }
    if (groupId && groupId !== existing.rows[0].group_id) {
      const group = await client.query<{ invited_party_size: number }>('SELECT invited_party_size FROM guest_groups WHERE id = $1 AND event_id = $2 FOR UPDATE', [groupId, eventId]);
      if (group.rowCount === 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Guest group belongs to a different event' }); }
      const groupGuestCount = await client.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM guests WHERE group_id = $1', [groupId]);
      if (Number(groupGuestCount.rows[0].count) >= group.rows[0].invited_party_size) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'This invitation group has reached its guest limit' }); }
    }
    const result = await client.query(
      'UPDATE guests SET full_name = $1, email = $2, phone = $3, group_id = $4, rsvp_plus_limit = $5 WHERE id = $6 AND event_id = $7 RETURNING *',
      [fullName.trim(), typeof email === 'string' ? email.trim() || null : null, typeof phone === 'string' ? phone.trim() || null : null, groupId ?? null, plusLimit ?? null, guestId, eventId],
    );
    if (existing.rows[0].rsvp_owner_id) await client.query('UPDATE rsvp_attendees SET full_name = $1 WHERE guest_id = $2', [fullName.trim(), guestId]);
    await client.query('COMMIT');
    return res.json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('Error updating invitation guest:', error);
    return res.status(500).json({ error: 'Failed to update invitation guest' });
  } finally { client.release(); }
});

router.delete('/:eventId/guests/:guestId', async (req, res) => {
  const { eventId, guestId } = req.params;
  const hostCode = req.query.host_code;
  const client = await pool.connect();
  try {
    if (!await hostOwnsEvent(eventId, hostCode)) return res.status(404).json({ error: 'Event not found' });
    await client.query('BEGIN');
    const existing = await client.query('SELECT id FROM guests WHERE id = $1 AND event_id = $2 FOR UPDATE', [guestId, eventId]);
    if (existing.rowCount === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Guest not found' }); }
    await client.query('DELETE FROM rsvp_responses WHERE guest_id = $1', [guestId]);
    await client.query('DELETE FROM guests WHERE id = $1', [guestId]);
    await client.query('COMMIT');
    return res.status(204).end();
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('Error deleting invitation guest:', error);
    return res.status(500).json({ error: 'Failed to delete invitation guest' });
  } finally { client.release(); }
});

router.patch('/:eventId/guest-groups/:groupId', async (req, res) => {
  const { eventId, groupId } = req.params;
  const { host_code: hostCode, name, contact_number: contactNumber, invited_party_size: partySize, rsvp_plus_limit: plusLimit = 0 } = req.body as { host_code?: string; name?: string; contact_number?: string; invited_party_size?: number; rsvp_plus_limit?: number };
  if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'Group name is required' });
  if (typeof partySize !== 'number' || !Number.isInteger(partySize) || partySize < 1 || partySize > 20) return res.status(400).json({ error: 'Party size must be between 1 and 20' });
  if (!Number.isInteger(plusLimit) || plusLimit < 0 || plusLimit > 19) return res.status(400).json({ error: 'Additional guests must be between 0 and 19' });
  try {
    if (!await hostOwnsEvent(eventId, hostCode)) return res.status(404).json({ error: 'Event not found' });
    const guestCount = await pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM guests WHERE group_id = $1', [groupId]);
    if (Number(guestCount.rows[0].count) > partySize) return res.status(409).json({ error: 'Party size cannot be lower than the guests already in this group' });
    const result = await pool.query('UPDATE guest_groups SET name = $1, contact_number = $2, invited_party_size = $3, rsvp_plus_limit = $4 WHERE id = $5 AND event_id = $6 RETURNING *', [name.trim(), typeof contactNumber === 'string' ? contactNumber.trim() || null : null, partySize, plusLimit, groupId, eventId]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Guest group not found' });
    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating guest group:', error);
    return res.status(500).json({ error: 'Failed to update guest group' });
  }
});

router.delete('/:eventId/guest-groups/:groupId', async (req, res) => {
  const { eventId, groupId } = req.params;
  const hostCode = req.query.host_code;
  const client = await pool.connect();
  try {
    if (!await hostOwnsEvent(eventId, hostCode)) return res.status(404).json({ error: 'Event not found' });
    await client.query('BEGIN');
    const group = await client.query('SELECT id FROM guest_groups WHERE id = $1 AND event_id = $2 FOR UPDATE', [groupId, eventId]);
    if (group.rowCount === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Guest group not found' }); }
    const removedGuests = await client.query('DELETE FROM guests WHERE group_id = $1 RETURNING id', [groupId]);
    await client.query('DELETE FROM guest_groups WHERE id = $1', [groupId]);
    await client.query('COMMIT');
    return res.json({ deleted_guest_count: removedGuests.rowCount ?? 0 });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('Error deleting guest group:', error);
    return res.status(500).json({ error: 'Failed to delete guest group' });
  } finally {
    client.release();
  }
});

export default router;