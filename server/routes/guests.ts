import { Router } from 'express';
import pool from '../db/index.js';

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
    const [groups, guests] = await Promise.all([
      pool.query('SELECT * FROM guest_groups WHERE event_id = $1 ORDER BY created_at', [eventId]),
      pool.query('SELECT * FROM guests WHERE event_id = $1 ORDER BY full_name', [eventId]),
    ]);
    return res.json({ groups: groups.rows, guests: guests.rows });
  } catch (error) {
    console.error('Error loading invitation guests:', error);
    return res.status(500).json({ error: 'Failed to load invitation guests' });
  }
});

router.post('/:eventId/guest-groups', async (req, res) => {
  const { eventId } = req.params;
  const { host_code: hostCode, name, contact_number: contactNumber, invited_party_size: partySize = 1 } = req.body as { host_code?: string; name?: string; contact_number?: string; invited_party_size?: number };
  if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'Group name is required' });
  if (typeof partySize !== 'number' || !Number.isInteger(partySize) || partySize < 1 || partySize > 20) return res.status(400).json({ error: 'Party size must be between 1 and 20' });
  try {
    if (!await hostOwnsEvent(eventId, hostCode)) return res.status(404).json({ error: 'Event not found' });
    const result = await pool.query('INSERT INTO guest_groups (event_id, name, contact_number, invited_party_size) VALUES ($1, $2, $3, $4) RETURNING *', [eventId, name.trim(), typeof contactNumber === 'string' ? contactNumber.trim() || null : null, partySize]);
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating guest group:', error);
    return res.status(500).json({ error: 'Failed to create guest group' });
  }
});

router.post('/:eventId/guests', async (req, res) => {
  const { eventId } = req.params;
  const { host_code: hostCode, full_name: fullName, email, phone, group_id: groupId } = req.body as { host_code?: string; full_name?: string; email?: string; phone?: string; group_id?: string | null };
  if (typeof fullName !== 'string' || !fullName.trim()) return res.status(400).json({ error: 'Guest name is required' });
  try {
    if (!await hostOwnsEvent(eventId, hostCode)) return res.status(404).json({ error: 'Event not found' });
    if (groupId) {
      const group = await pool.query<{ invited_party_size: number }>('SELECT invited_party_size FROM guest_groups WHERE id = $1 AND event_id = $2 FOR UPDATE', [groupId, eventId]);
      if (group.rowCount === 0) return res.status(400).json({ error: 'Guest group belongs to a different event' });
      const groupGuestCount = await pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM guests WHERE group_id = $1', [groupId]);
      if (Number(groupGuestCount.rows[0].count) >= group.rows[0].invited_party_size) {
        return res.status(409).json({ error: 'This invitation group has reached its guest limit' });
      }
    }
    const result = await pool.query(
      'INSERT INTO guests (event_id, group_id, full_name, email, phone) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [eventId, groupId ?? null, fullName.trim(), typeof email === 'string' ? email.trim() || null : null, typeof phone === 'string' ? phone.trim() || null : null],
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating invitation guest:', error);
    return res.status(500).json({ error: 'Failed to create invitation guest' });
  }
});

router.patch('/:eventId/guests/:guestId', async (req, res) => {
  const { eventId, guestId } = req.params;
  const { host_code: hostCode, full_name: fullName, email, phone, group_id: groupId } = req.body as { host_code?: string; full_name?: string; email?: string; phone?: string; group_id?: string | null };
  if (typeof fullName !== 'string' || !fullName.trim()) return res.status(400).json({ error: 'Guest name is required' });
  try {
    if (!await hostOwnsEvent(eventId, hostCode)) return res.status(404).json({ error: 'Event not found' });
    const existing = await pool.query<{ group_id: string | null }>('SELECT group_id FROM guests WHERE id = $1 AND event_id = $2', [guestId, eventId]);
    if (existing.rowCount === 0) return res.status(404).json({ error: 'Guest not found' });
    if (groupId && groupId !== existing.rows[0].group_id) {
      const group = await pool.query<{ invited_party_size: number }>('SELECT invited_party_size FROM guest_groups WHERE id = $1 AND event_id = $2 FOR UPDATE', [groupId, eventId]);
      if (group.rowCount === 0) return res.status(400).json({ error: 'Guest group belongs to a different event' });
      const groupGuestCount = await pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM guests WHERE group_id = $1', [groupId]);
      if (Number(groupGuestCount.rows[0].count) >= group.rows[0].invited_party_size) return res.status(409).json({ error: 'This invitation group has reached its guest limit' });
    }
    const result = await pool.query(
      'UPDATE guests SET full_name = $1, email = $2, phone = $3, group_id = $4 WHERE id = $5 AND event_id = $6 RETURNING *',
      [fullName.trim(), typeof email === 'string' ? email.trim() || null : null, typeof phone === 'string' ? phone.trim() || null : null, groupId ?? null, guestId, eventId],
    );
    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating invitation guest:', error);
    return res.status(500).json({ error: 'Failed to update invitation guest' });
  }
});

router.delete('/:eventId/guests/:guestId', async (req, res) => {
  const { eventId, guestId } = req.params;
  const hostCode = req.query.host_code;
  try {
    if (!await hostOwnsEvent(eventId, hostCode)) return res.status(404).json({ error: 'Event not found' });
    const result = await pool.query('DELETE FROM guests WHERE id = $1 AND event_id = $2 RETURNING id', [guestId, eventId]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Guest not found' });
    return res.status(204).end();
  } catch (error) {
    console.error('Error deleting invitation guest:', error);
    return res.status(500).json({ error: 'Failed to delete invitation guest' });
  }
});

router.patch('/:eventId/guest-groups/:groupId', async (req, res) => {
  const { eventId, groupId } = req.params;
  const { host_code: hostCode, name, contact_number: contactNumber, invited_party_size: partySize } = req.body as { host_code?: string; name?: string; contact_number?: string; invited_party_size?: number };
  if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'Group name is required' });
  if (typeof partySize !== 'number' || !Number.isInteger(partySize) || partySize < 1 || partySize > 20) return res.status(400).json({ error: 'Party size must be between 1 and 20' });
  try {
    if (!await hostOwnsEvent(eventId, hostCode)) return res.status(404).json({ error: 'Event not found' });
    const guestCount = await pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM guests WHERE group_id = $1', [groupId]);
    if (Number(guestCount.rows[0].count) > partySize) return res.status(409).json({ error: 'Party size cannot be lower than the guests already in this group' });
    const result = await pool.query('UPDATE guest_groups SET name = $1, contact_number = $2, invited_party_size = $3 WHERE id = $4 AND event_id = $5 RETURNING *', [name.trim(), typeof contactNumber === 'string' ? contactNumber.trim() || null : null, partySize, groupId, eventId]);
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