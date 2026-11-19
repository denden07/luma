import { Router } from 'express';
import { randomUUID } from 'crypto';
import pool from '../db/index.js';
import { reconcileResponse } from './seating.js';

const hostRouter = Router();
export const publicRsvpRouter = Router();

type RsvpStatus = 'attending' | 'declined' | 'undecided';
type RsvpTarget = { event_id: string; guest_id: string | null; group_id: string | null; invited_party_size: number; plus_limit: number; dietary_enabled: boolean; display_name: string };
type ReservedSeat = { name: string; status: RsvpStatus };

const isStatus = (value: unknown): value is RsvpStatus => value === 'attending' || value === 'declined' || value === 'undecided';
const publicMatchQuery = `SELECT guest.id, guest.full_name, COALESCE(guest.rsvp_plus_limit, 0) AS plus_limit,
  response.status AS response_status, guest_table.name AS table_name, guest.seat_number,
  COALESCE((SELECT json_agg(json_build_object('id', companion.id, 'full_name', companion.full_name,
    'status', companion.rsvp_companion_status, 'is_proxy', companion.rsvp_proxy_for_id = guest.id,
    'table_name', companion_table.name, 'seat_number', companion.seat_number) ORDER BY companion.created_at, companion.id)
    FROM guests companion LEFT JOIN seating_tables companion_table ON companion_table.id = companion.table_id
    WHERE companion.rsvp_owner_id = guest.id), '[]'::json) AS companions
  , COALESCE((SELECT json_agg(json_build_object('name', seat.full_name, 'status', seat.status,
    'is_proxy', seat.is_proxy, 'table_name', seat_table.name, 'seat_number', seated_guest.seat_number)
    ORDER BY seat.slot_index)
    FROM rsvp_reserved_seats seat
    LEFT JOIN guests seated_guest ON seated_guest.rsvp_response_id = response.id AND seated_guest.rsvp_ordinal = 20 + seat.slot_index
    LEFT JOIN seating_tables seat_table ON seat_table.id = seated_guest.table_id
    WHERE seat.response_id = response.id), '[]'::json) AS reserved_seats
  FROM guests guest
  LEFT JOIN seating_tables guest_table ON guest_table.id = guest.table_id
  LEFT JOIN rsvp_responses response ON response.guest_id = guest.id
  WHERE guest.event_id = $1 AND guest.group_id IS NULL AND guest.rsvp_response_id IS NULL AND guest.rsvp_owner_id IS NULL
  AND (guest.full_name ILIKE $2 OR EXISTS (SELECT 1 FROM guests companion WHERE companion.rsvp_owner_id = guest.id AND companion.full_name ILIKE $2))
  ORDER BY guest.full_name LIMIT 10`;
const publicGroupMatchQuery = `SELECT group_record.id, group_record.name AS full_name, group_record.id AS group_id,
  0 AS plus_limit, response.status AS response_status, NULL::text AS table_name, NULL::integer AS seat_number,
  '[]'::json AS companions, '[]'::json AS reserved_seats,
  COALESCE((SELECT json_agg(json_build_object('id', member.id, 'full_name', member.full_name,
    'status', COALESCE(member.rsvp_companion_status, CASE WHEN response.id IS NOT NULL THEN response.status END),
    'table_name', member_table.name, 'seat_number', member.seat_number)
    ORDER BY member.created_at, member.id)
    FROM guests member LEFT JOIN seating_tables member_table ON member_table.id = member.table_id
    WHERE member.group_id = group_record.id AND member.rsvp_response_id IS NULL), '[]'::json) AS members
  FROM guest_groups group_record
  LEFT JOIN rsvp_responses response ON response.group_id = group_record.id
  WHERE group_record.event_id = $1 AND
    (group_record.name ILIKE $2 OR EXISTS (SELECT 1 FROM guests responder
      WHERE responder.group_id = group_record.id AND responder.is_group_responder = TRUE AND responder.full_name ILIKE $2))
    AND EXISTS (SELECT 1 FROM guests responder WHERE responder.group_id = group_record.id AND responder.is_group_responder = TRUE)
  ORDER BY group_record.name LIMIT 10`;

async function findPublicMatches(eventId: string, name: string) {
  const search = `%${name.trim().replace(/[\\%_]/g, '\\$&')}%`;
  const [individuals, groups] = await Promise.all([
    pool.query(publicMatchQuery, [eventId, search]),
    pool.query(publicGroupMatchQuery, [eventId, search]),
  ]);
  return [...individuals.rows, ...groups.rows].slice(0, 10);
}

async function hostOwnsEvent(eventId: string, hostCode: unknown): Promise<boolean> {
  if (typeof hostCode !== 'string' || !hostCode) return false;
  const result = await pool.query('SELECT 1 FROM events WHERE id = $1 AND host_code = $2 AND is_active = TRUE', [eventId, hostCode]);
  return result.rowCount === 1;
}

async function responseTargetByToken(token: string): Promise<RsvpTarget | null> {
  const result = await pool.query<RsvpTarget>(
    `SELECT link.event_id, link.guest_id, link.group_id,
      COALESCE(group_record.invited_party_size, 1) AS invited_party_size, COALESCE(guest.rsvp_plus_limit, group_record.rsvp_plus_limit, 0) AS plus_limit, event.rsvp_dietary_notes_enabled AS dietary_enabled,
      COALESCE(group_record.name, guest.full_name) AS display_name
     FROM rsvp_links link
     LEFT JOIN guests guest ON guest.id = link.guest_id AND guest.rsvp_response_id IS NULL
     LEFT JOIN guest_groups group_record ON group_record.id = link.group_id
     JOIN events event ON event.id = link.event_id AND event.is_active = TRUE
     WHERE link.token = $1 AND (link.guest_id IS NULL OR (guest.id IS NOT NULL AND guest.rsvp_owner_id IS NULL))`,
    [token],
  );
  return result.rows[0] ?? null;
}

async function responseTargetByHost(eventId: string, guestId?: string, groupId?: string): Promise<RsvpTarget | null> {
  if ((guestId && groupId) || (!guestId && !groupId)) return null;
  const result = guestId
    ? await pool.query<RsvpTarget>(`SELECT guest.event_id, guest.id AS guest_id, NULL::uuid AS group_id, 1 AS invited_party_size, COALESCE(guest.rsvp_plus_limit, 0) AS plus_limit, event.rsvp_dietary_notes_enabled AS dietary_enabled, guest.full_name AS display_name FROM guests guest JOIN events event ON event.id = guest.event_id WHERE guest.id = $1 AND guest.event_id = $2 AND guest.rsvp_response_id IS NULL AND guest.rsvp_owner_id IS NULL`, [guestId, eventId])
    : await pool.query<RsvpTarget>(`SELECT group_record.event_id, NULL::uuid AS guest_id, group_record.id AS group_id, group_record.invited_party_size, group_record.rsvp_plus_limit AS plus_limit, event.rsvp_dietary_notes_enabled AS dietary_enabled, group_record.name AS display_name FROM guest_groups group_record JOIN events event ON event.id = group_record.event_id WHERE group_record.id = $1 AND group_record.event_id = $2`, [groupId, eventId]);
  return result.rows[0] ?? null;
}

async function saveResponse(target: RsvpTarget, payload: Record<string, unknown>, transactionClient?: import('pg').PoolClient) {
  const status = payload.status;
  const partyCount = Number(payload.party_count ?? 0);
  const plusOneCount = Number(payload.plus_one_count ?? 0);
  const reserved = payload.reserved_seats;
  const hasReservedSeats = reserved !== undefined;
  if (hasReservedSeats && (!target.guest_id || !Array.isArray(reserved))) throw new Error('Reserved seats require an individual invitation');
  const seats: ReservedSeat[] = Array.isArray(reserved) ? reserved.map((seat: unknown) => {
    if (!seat || typeof seat !== 'object' || !('name' in seat) || !('status' in seat) ||
      typeof seat.name !== 'string' || seat.name.trim().length > 255 || !isStatus(seat.status))
      throw new Error('Enter a valid name and attendance for every reserved seat');
    return { name: seat.name.trim(), status: seat.status };
  }) : [];
  const attendeeNames = Array.isArray(payload.attendees) ? payload.attendees.filter((name): name is string => typeof name === 'string' && Boolean(name.trim())).map(name => name.trim()) : [];
  if (attendeeNames.some(name => name.length > 255)) throw new Error('Attendee names must be 255 characters or fewer');
  if (!isStatus(status)) throw new Error('Choose an RSVP status');
  if (!Number.isInteger(partyCount) || partyCount < 0 || partyCount > target.invited_party_size) throw new Error(`Party count cannot exceed ${target.invited_party_size}`);
  if (!Number.isInteger(plusOneCount) || plusOneCount < 0 || plusOneCount > target.plus_limit) throw new Error(`Additional guests cannot exceed ${target.plus_limit}`);
  if (!target.dietary_enabled && typeof payload.dietary_notes === 'string' && payload.dietary_notes.trim()) throw new Error('Dietary notes are disabled for this event');
  if (hasReservedSeats
    ? (partyCount !== (status === 'attending' ? 1 : 0) || partyCount + plusOneCount > 20 || attendeeNames.length !== partyCount + plusOneCount)
    : (status === 'attending' ? partyCount < 1 || partyCount + plusOneCount > 20 || attendeeNames.length !== partyCount + plusOneCount : partyCount !== 0 || plusOneCount !== 0))
    throw new Error('Provide names for up to 20 attending guests');

  const client = transactionClient ?? await pool.connect();
  const ownsTransaction = !transactionClient;
  try {
    if (ownsTransaction) await client.query('BEGIN');
    // Serialize first submissions for the same invitation, including simultaneous link submissions.
    await client.query(
      target.guest_id ? 'SELECT id FROM guests WHERE id = $1 FOR UPDATE' : 'SELECT id FROM guest_groups WHERE id = $1 FOR UPDATE',
      [target.guest_id ?? target.group_id],
    );
    const companions = target.guest_id
      ? await client.query<{ id: string; full_name: string }>('SELECT id, full_name FROM guests WHERE rsvp_owner_id = $1 ORDER BY created_at, id FOR UPDATE', [target.guest_id])
      : { rows: [] as { id: string; full_name: string }[] };
    if (hasReservedSeats && (companions.rows.length > target.plus_limit || seats.length !== target.plus_limit - companions.rows.length))
      throw new Error('The reserved seats have changed. Search for your invitation again.');
    const selections = payload.named_companions;
    if (selections !== undefined && (!Array.isArray(selections) || selections.length !== companions.rows.length)) throw new Error('Select an RSVP for every named companion');
    const selected = Array.isArray(selections) ? selections as { id?: unknown; status?: unknown }[] : companions.rows.map(companion => ({
      id: companion.id,
      status: status === 'attending' && attendeeNames.slice(1).some(name => name.toLowerCase() === companion.full_name.toLowerCase()) ? 'attending' : 'undecided',
    }));
    if (selected.some((item, index) => !item || item.id !== companions.rows[index].id || !isStatus(item.status))) throw new Error('Select an RSVP for every named companion');
    const attendingNamed = selected.filter(item => item.status === 'attending');
    if (hasReservedSeats && (attendingNamed.length + seats.filter(seat => seat.status === 'attending').length !== plusOneCount ||
      partyCount > 0 && attendeeNames[0] !== target.display_name))
      throw new Error('Additional guest count does not match the reserved seats');
    if (attendingNamed.some((item, index) => attendeeNames[partyCount + index] !== companions.rows.find(guest => guest.id === item.id)?.full_name)) throw new Error('Named companions must be included in the RSVP');
    if (attendingNamed.length > plusOneCount) throw new Error('Additional guest count is too small');
    if (hasReservedSeats && seats.filter(seat => seat.status === 'attending').some((seat, index) =>
      attendeeNames[partyCount + attendingNamed.length + index] !== (seat.name || `${target.display_name.slice(0, 230)} friend #${seats.indexOf(seat) + 1}`)))
      throw new Error('Reserved guest names must match the RSVP');
    const proxy = payload.proxy;
    const proxyId = proxy && typeof proxy === 'object' && 'id' in proxy ? proxy.id : null;
    const proxyIndex = proxy && typeof proxy === 'object' && 'index' in proxy ? proxy.index : null;
    const proxyValid = (proxyId === null && Number.isInteger(proxyIndex) && typeof proxyIndex === 'number' && seats[proxyIndex]?.status === 'attending') ||
      (proxyIndex === null && typeof proxyId === 'string' && attendingNamed.some(item => item.id === proxyId));
    if (hasReservedSeats && (status === 'declined' && plusOneCount > 0 ? !proxyValid : proxy !== undefined && proxy !== null))
      throw new Error('Choose an attending additional guest as the proxy when the invited guest declines');
    if (!hasReservedSeats && proxy !== undefined) throw new Error('Proxy selection requires reserved seats');
    for (const companion of companions.rows) {
      const companionStatus = hasReservedSeats || status === 'attending' ? selected.find(item => item.id === companion.id)?.status : status;
      await client.query('UPDATE guests SET rsvp_companion_status = $1, rsvp_proxy_for_id = $2 WHERE id = $3', [companionStatus, hasReservedSeats && proxyId === companion.id ? target.guest_id : null, companion.id]);
    }
    const existing = await client.query<{ id: string }>(
      'SELECT id FROM rsvp_responses WHERE (guest_id = $1 AND $1::uuid IS NOT NULL) OR (group_id = $2 AND $2::uuid IS NOT NULL) FOR UPDATE',
      [target.guest_id, target.group_id],
    );
    const responseResult = existing.rows[0]
      ? await client.query(
          `UPDATE rsvp_responses SET status = $1, party_count = $2, plus_one_count = $3, contact_email = $4, contact_phone = $5, dietary_notes = $6, submitted_at = CURRENT_TIMESTAMP
          WHERE id = $7 RETURNING *`,
        [status, partyCount + plusOneCount, plusOneCount, typeof payload.contact_email === 'string' ? payload.contact_email.trim() || null : null, typeof payload.contact_phone === 'string' ? payload.contact_phone.trim() || null : null, typeof payload.dietary_notes === 'string' ? payload.dietary_notes.trim() || null : null, existing.rows[0].id],
      )
      : await client.query(
        `INSERT INTO rsvp_responses (event_id, guest_id, group_id, status, party_count, plus_one_count, contact_email, contact_phone, dietary_notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [target.event_id, target.guest_id, target.group_id, status, partyCount + plusOneCount, plusOneCount, typeof payload.contact_email === 'string' ? payload.contact_email.trim() || null : null, typeof payload.contact_phone === 'string' ? payload.contact_phone.trim() || null : null, typeof payload.dietary_notes === 'string' ? payload.dietary_notes.trim() || null : null],
      );
    const responseId = responseResult.rows[0].id;
    await client.query('DELETE FROM rsvp_attendees WHERE response_id = $1', [responseId]);
    await client.query('DELETE FROM rsvp_reserved_seats WHERE response_id = $1', [responseId]);
    if (hasReservedSeats) for (const [index, seat] of seats.entries())
      await client.query('INSERT INTO rsvp_reserved_seats (response_id, slot_index, full_name, status, is_proxy) VALUES ($1, $2, $3, $4, $5)',
        [responseId, index, seat.name || `${target.display_name.slice(0, 230)} friend #${index + 1}`, seat.status, proxyIndex === index]);
    const attendingCompanions = hasReservedSeats || status === 'attending' ? attendingNamed : [];
    const attendingSeats = seats.map((seat, index) => ({ ...seat, index })).filter(seat => seat.status === 'attending');
    for (const [index, fullName] of attendeeNames.entries())
      await client.query('INSERT INTO rsvp_attendees (response_id, full_name, ordinal, guest_id, reserved_slot_index) VALUES ($1, $2, $3, $4, $5)', [responseId, fullName, index, target.group_id && Array.isArray(payload.group_member_ids) ? payload.group_member_ids[index] : target.guest_id && index >= partyCount && index < partyCount + attendingCompanions.length ? attendingCompanions[index - partyCount].id : null, index >= partyCount + attendingCompanions.length ? attendingSeats[index - partyCount - attendingCompanions.length]?.index ?? null : null]);
    if (target.group_id && !Array.isArray(payload.group_member_ids))
      await client.query('UPDATE guests SET rsvp_companion_status = NULL WHERE group_id = $1 AND rsvp_response_id IS NULL', [target.group_id]);
    await reconcileResponse(client, responseId);
    if (ownsTransaction) await client.query('COMMIT');
    return responseResult.rows[0];
  } catch (error) {
    if (ownsTransaction) await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally { if (ownsTransaction) client.release(); }
}

hostRouter.get('/:eventId/rsvp', async (req, res) => {
  const { eventId } = req.params;
  try {
    if (!await hostOwnsEvent(eventId, req.query.host_code)) return res.status(404).json({ error: 'Event not found' });
    const result = await pool.query(
      `SELECT response.*, COALESCE(group_record.name, guest.full_name) AS invitation_name
       FROM rsvp_responses response
       LEFT JOIN guests guest ON guest.id = response.guest_id
       LEFT JOIN guest_groups group_record ON group_record.id = response.group_id
       WHERE response.event_id = $1 ORDER BY response.submitted_at DESC`,
      [eventId],
    );
    return res.json(result.rows);
  } catch (error) { console.error('Error loading RSVP responses:', error); return res.status(500).json({ error: 'Failed to load RSVP responses' }); }
});

hostRouter.patch('/:eventId/rsvp-settings', async (req, res) => {
  const { eventId } = req.params;
  const { host_code: hostCode, dietary_notes_enabled: dietaryEnabled, unlisted_requests_enabled: unlistedEnabled } = req.body as { host_code?: string; dietary_notes_enabled?: boolean; unlisted_requests_enabled?: boolean };
  if ((dietaryEnabled === undefined && unlistedEnabled === undefined) ||
      (dietaryEnabled !== undefined && typeof dietaryEnabled !== 'boolean') ||
      (unlistedEnabled !== undefined && typeof unlistedEnabled !== 'boolean'))
    return res.status(400).json({ error: 'Choose valid RSVP settings' });
  try {
    if (!await hostOwnsEvent(eventId, hostCode)) return res.status(404).json({ error: 'Event not found' });
    const result = await pool.query(
      `UPDATE events SET rsvp_dietary_notes_enabled = COALESCE($1, rsvp_dietary_notes_enabled),
       rsvp_unlisted_requests_enabled = COALESCE($2, rsvp_unlisted_requests_enabled)
       WHERE id = $3 RETURNING rsvp_dietary_notes_enabled, rsvp_unlisted_requests_enabled`,
      [dietaryEnabled ?? null, unlistedEnabled ?? null, eventId],
    );
    return res.json(result.rows[0]);
  } catch (error) { console.error('Error updating RSVP settings:', error); return res.status(500).json({ error: 'Failed to update RSVP settings' }); }
});

hostRouter.post('/:eventId/rsvp/manual', async (req, res) => {
  const { eventId } = req.params;
  const { host_code: hostCode, guest_id: guestId, group_id: groupId, ...payload } = req.body as { host_code?: string; guest_id?: string; group_id?: string } & Record<string, unknown>;
  try {
    if (!await hostOwnsEvent(eventId, hostCode)) return res.status(404).json({ error: 'Event not found' });
    const target = await responseTargetByHost(eventId, guestId, groupId);
    if (!target) return res.status(400).json({ error: 'Choose one guest or group' });
    return res.json(await saveResponse(target, payload));
  } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : 'Could not save RSVP' }); }
});

hostRouter.get('/:eventId/rsvp-verification-requests', async (req, res) => {
  const { eventId } = req.params;
  try {
    if (!await hostOwnsEvent(eventId, req.query.host_code)) return res.status(404).json({ error: 'Event not found' });
    const result = await pool.query(
      `SELECT request.*, guest.full_name AS matched_guest_name
       FROM rsvp_verification_requests request
       LEFT JOIN guests guest ON guest.id = request.guest_id
       WHERE request.event_id = $1 ORDER BY request.requested_at DESC`,
      [eventId],
    );
    return res.json(result.rows);
  } catch (error) { console.error('Error loading RSVP verification requests:', error); return res.status(500).json({ error: 'Failed to load RSVP verification requests' }); }
});

hostRouter.patch('/:eventId/rsvp-verification-requests/:requestId', async (req, res) => {
  const { eventId, requestId } = req.params;
  const { host_code: hostCode, status, guest_id: guestId, create_guest: createGuest, group_id: groupId } = req.body as { host_code?: string; status?: 'approved' | 'rejected'; guest_id?: string; create_guest?: boolean; group_id?: string };
  if (status !== 'approved' && status !== 'rejected') return res.status(400).json({ error: 'Choose approved or rejected' });
  if (status === 'approved' && !guestId && !createGuest) return res.status(400).json({ error: 'Choose a guest or add this person as a new guest' });
  const client = await pool.connect();
  try {
    if (!await hostOwnsEvent(eventId, hostCode)) return res.status(404).json({ error: 'Event not found' });
    await client.query('BEGIN');
    const request = await client.query<{ submitted_name: string; contact_email: string | null; contact_phone: string | null; status_response: RsvpStatus | null; party_count: number; plus_one_count: number; attendee_names: string[] | null; dietary_notes: string | null }>('SELECT * FROM rsvp_verification_requests WHERE id = $1 AND event_id = $2 AND status = \'pending\' FOR UPDATE', [requestId, eventId]);
    if (request.rowCount === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Pending verification request not found' }); }
    let approvedGuestId = guestId ?? null;
    if (createGuest && status === 'approved') {
      if (groupId) {
        const group = await client.query<{ invited_party_size: number }>('SELECT invited_party_size FROM guest_groups WHERE id = $1 AND event_id = $2 FOR UPDATE', [groupId, eventId]);
        if (group.rowCount === 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Guest group belongs to a different event' }); }
        const groupGuestCount = await client.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM guests WHERE group_id = $1', [groupId]);
        if (Number(groupGuestCount.rows[0].count) >= group.rows[0].invited_party_size) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'This invitation group has reached its guest limit' }); }
      }
      const guestResult = await client.query('INSERT INTO guests (event_id, group_id, full_name, email, phone) VALUES ($1, $2, $3, $4, $5) RETURNING id', [eventId, groupId ?? null, request.rows[0].submitted_name, request.rows[0].contact_email, request.rows[0].contact_phone]);
      approvedGuestId = guestResult.rows[0].id;
    }
    if (approvedGuestId) {
      const guest = await client.query('SELECT 1 FROM guests WHERE id = $1 AND event_id = $2 AND rsvp_response_id IS NULL AND rsvp_owner_id IS NULL', [approvedGuestId, eventId]);
      if (guest.rowCount === 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Guest belongs to a different event' }); }
    }
    const result = await client.query(
      `UPDATE rsvp_verification_requests SET status = $1, guest_id = $2, reviewed_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND event_id = $4 AND status = 'pending' RETURNING *`,
      [status, approvedGuestId, requestId, eventId],
    );
    if (status === 'approved' && approvedGuestId && request.rows[0].status_response) {
      const settings = await client.query<{ plus_limit: number; dietary_enabled: boolean }>('SELECT COALESCE(guest.rsvp_plus_limit, 0) AS plus_limit, event.rsvp_dietary_notes_enabled AS dietary_enabled FROM guests guest JOIN events event ON event.id = guest.event_id WHERE guest.id = $1', [approvedGuestId]);
      if (request.rows[0].plus_one_count > settings.rows[0].plus_limit) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'This older request includes additional guests. Set an allowance for the matched guest before approving, or reject and ask them to resubmit without extras.' }); }
      const target: RsvpTarget = { event_id: eventId, guest_id: approvedGuestId, group_id: null, invited_party_size: 1, plus_limit: settings.rows[0].plus_limit, dietary_enabled: settings.rows[0].dietary_enabled, display_name: request.rows[0].submitted_name };
      await saveResponse(target, { status: request.rows[0].status_response, party_count: request.rows[0].party_count, plus_one_count: request.rows[0].plus_one_count, attendees: request.rows[0].status_response === 'attending' ? [request.rows[0].submitted_name, ...(request.rows[0].attendee_names ?? Array.from({ length: request.rows[0].plus_one_count }, (_, index) => `${request.rows[0].submitted_name.slice(0, 230)} friend #${index + 1}`))] : [], contact_email: request.rows[0].contact_email, contact_phone: request.rows[0].contact_phone, dietary_notes: settings.rows[0].dietary_enabled ? request.rows[0].dietary_notes : null }, client);
    }
    await client.query('COMMIT');
    return res.json(result.rows[0]);
  } catch (error) { await client.query('ROLLBACK').catch(() => undefined); console.error('Error reviewing RSVP verification request:', error); return res.status(500).json({ error: 'Failed to review RSVP verification request' }); }
  finally { client.release(); }
});

hostRouter.post('/:eventId/rsvp-links', async (req, res) => {
  const { eventId } = req.params;
  const { host_code: hostCode, guest_id: guestId, group_id: groupId } = req.body as { host_code?: string; guest_id?: string; group_id?: string };
  if ((guestId && groupId) || (!guestId && !groupId)) return res.status(400).json({ error: 'Choose one guest or group for the RSVP link' });
  try {
    if (!await hostOwnsEvent(eventId, hostCode)) return res.status(404).json({ error: 'Event not found' });
    const target = guestId
      ? await pool.query('SELECT 1 FROM guests WHERE id = $1 AND event_id = $2 AND rsvp_response_id IS NULL AND rsvp_owner_id IS NULL', [guestId, eventId])
      : await pool.query('SELECT 1 FROM guest_groups WHERE id = $1 AND event_id = $2', [groupId, eventId]);
    if (target.rowCount === 0) return res.status(400).json({ error: 'Invitation target belongs to a different event' });
    const result = guestId
      ? await pool.query('INSERT INTO rsvp_links (event_id, guest_id) VALUES ($1, $2) ON CONFLICT (guest_id) WHERE guest_id IS NOT NULL DO UPDATE SET token = $3 RETURNING token', [eventId, guestId, randomUUID()])
      : await pool.query('INSERT INTO rsvp_links (event_id, group_id) VALUES ($1, $2) ON CONFLICT (group_id) WHERE group_id IS NOT NULL DO UPDATE SET token = $3 RETURNING token', [eventId, groupId, randomUUID()]);
    return res.json({ token: result.rows[0].token });
  } catch (error) { console.error('Error creating RSVP link:', error); return res.status(500).json({ error: 'Failed to create RSVP link' }); }
});

publicRsvpRouter.post('/search', async (req, res) => {
  const { event_id: eventId, name } = req.body as { event_id?: string; name?: string };
  if (!eventId || typeof name !== 'string' || name.trim().length < 2) return res.json({ matches: [] });
  try {
    const event = await pool.query('SELECT 1 FROM events WHERE id = $1 AND is_active = TRUE', [eventId]);
    if (event.rowCount === 0) return res.status(404).json({ error: 'Invitation not found' });
    return res.json({ matches: await findPublicMatches(eventId, name) });
  } catch (error) { console.error('Error searching RSVP guests:', error); return res.status(500).json({ error: 'Could not search invitations' }); }
});

publicRsvpRouter.post('/lookup', async (req, res) => {
  const { event_id: eventId, name, status, party_count: partyCount = 0, contact_email: contactEmail, contact_phone: contactPhone, dietary_notes: dietaryNotes, plus_one_count: plusOneCount = 0, attendee_names: attendeeNames } = req.body as { event_id?: string; name?: string; status?: unknown; party_count?: unknown; contact_email?: string; contact_phone?: string; dietary_notes?: string; plus_one_count?: unknown; attendee_names?: unknown };
  if (!eventId || typeof name !== 'string' || !name.trim() || name.trim().length > 255) return res.status(400).json({ error: 'Enter a name of 255 characters or fewer' });
  try {
    const event = await pool.query<{ rsvp_unlisted_requests_enabled: boolean; rsvp_dietary_notes_enabled: boolean }>(
      'SELECT rsvp_unlisted_requests_enabled, rsvp_dietary_notes_enabled FROM events WHERE id = $1 AND is_active = TRUE', [eventId]);
    if (event.rowCount === 0) return res.status(404).json({ error: 'Invitation not found' });
    const matches = await findPublicMatches(eventId, name);
    if (matches.length > 0) return res.json({ matches });
    if (!event.rows[0].rsvp_unlisted_requests_enabled) {
      if (isStatus(status)) return res.status(403).json({ error: 'Your name is not on the guest list. Unlisted RSVP requests are not allowed for this event.' });
      return res.json({ matches: [], unlisted_blocked: true });
    }
    if (!isStatus(status)) return res.json({ matches: [], needs_response: true });
    const normalizedPartyCount = Number(partyCount);
    const normalizedPlusOneCount = Number(plusOneCount);
    if (!Number.isInteger(normalizedPartyCount) || normalizedPartyCount < 0 || normalizedPartyCount > 20 || !Number.isInteger(normalizedPlusOneCount) || normalizedPlusOneCount < 0 || normalizedPlusOneCount > 20) return res.status(400).json({ error: 'Enter a valid party count' });
    if (normalizedPlusOneCount !== 0 || (status === 'attending' ? normalizedPartyCount !== 1 : normalizedPartyCount !== 0)) return res.status(400).json({ error: 'Unlisted guests cannot include additional guests' });
    if (!event.rows[0].rsvp_dietary_notes_enabled && typeof dietaryNotes === 'string' && dietaryNotes.trim()) return res.status(400).json({ error: 'Dietary notes are disabled for this event' });
    if (attendeeNames !== undefined && (!Array.isArray(attendeeNames) || attendeeNames.length !== normalizedPlusOneCount || attendeeNames.some(value => typeof value !== 'string' || value.trim().length > 255))) return res.status(400).json({ error: 'Enter a valid name for each additional guest' });
    const names = Array.isArray(attendeeNames) ? attendeeNames.map((value: string, index: number) => value.trim() || `${name.trim().slice(0, 230)} friend #${index + 1}`) : Array.from({ length: normalizedPlusOneCount }, (_, index) => `${name.trim().slice(0, 230)} friend #${index + 1}`);
    await pool.query(
      `INSERT INTO rsvp_verification_requests (event_id, submitted_name, status_response, party_count, contact_email, contact_phone, dietary_notes, plus_one_count, attendee_names)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [eventId, name.trim(), status, normalizedPartyCount, typeof contactEmail === 'string' ? contactEmail.trim() || null : null, typeof contactPhone === 'string' ? contactPhone.trim() || null : null, typeof dietaryNotes === 'string' ? dietaryNotes.trim() || null : null, normalizedPlusOneCount, names],
    );
    return res.status(202).json({ matches: [], message: 'Your RSVP has been sent to the host for review.' });
  } catch (error) { console.error('Error receiving RSVP lookup:', error); return res.status(500).json({ error: 'Could not send RSVP request' }); }
});

publicRsvpRouter.post('/guest/:guestId', async (req, res) => {
  const { guestId } = req.params;
  const { event_id: eventId, ...payload } = req.body as { event_id?: string } & Record<string, unknown>;
  if (!eventId) return res.status(400).json({ error: 'Invitation not found' });
  const target = await responseTargetByHost(eventId, guestId);
  if (!target) return res.status(404).json({ error: 'Guest invitation not found' });
  const membership = await pool.query('SELECT group_id FROM guests WHERE id = $1 AND event_id = $2', [guestId, eventId]);
  if (membership.rows[0]?.group_id) return res.status(400).json({ error: 'Respond through the group invitation' });
  try { return res.json(await saveResponse(target, payload)); }
  catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : 'Could not save RSVP' }); }
});

publicRsvpRouter.post('/group/:groupId', async (req, res) => {
  const { groupId } = req.params;
  const { event_id: eventId, members, dietary_notes: dietaryNotes } = req.body as { event_id?: string; members?: unknown; dietary_notes?: unknown };
  if (!eventId || !Array.isArray(members)) return res.status(400).json({ error: 'Select an RSVP for every group member' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const group = await client.query<{ event_id: string; invited_party_size: number; rsvp_dietary_notes_enabled: boolean }>(
      `SELECT group_record.event_id, group_record.invited_party_size, events.rsvp_dietary_notes_enabled
       FROM guest_groups group_record JOIN events ON events.id = group_record.event_id AND events.is_active = TRUE
       WHERE group_record.id = $1 AND group_record.event_id = $2 FOR UPDATE OF group_record`, [groupId, eventId]);
    if (!group.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Group invitation not found' }); }
    if (!group.rows[0].rsvp_dietary_notes_enabled && typeof dietaryNotes === 'string' && dietaryNotes.trim()) {
      await client.query('ROLLBACK'); return res.status(400).json({ error: 'Dietary notes are disabled for this event' });
    }
    const roster = await client.query<{ id: string; full_name: string; is_group_responder: boolean }>(
      'SELECT id, full_name, is_group_responder FROM guests WHERE group_id = $1 AND rsvp_response_id IS NULL ORDER BY created_at, id FOR UPDATE', [groupId]);
    if (!roster.rows.some(member => member.is_group_responder)) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Group invitation not found' }); }
    if (members.length !== roster.rows.length || members.some((member, index) =>
      !member || typeof member !== 'object' || member.id !== roster.rows[index].id || !isStatus(member.status))) {
      await client.query('ROLLBACK'); return res.status(400).json({ error: 'Select an RSVP for every group member' });
    }
    const choices = members as { id: string; status: RsvpStatus }[];
    const attending = roster.rows.filter((_, index) => choices[index].status === 'attending');
    const status = attending.length ? 'attending' : choices.some(member => member.status === 'undecided') ? 'undecided' : 'declined';
    const target: RsvpTarget = { event_id: eventId, guest_id: null, group_id: groupId,
      invited_party_size: group.rows[0].invited_party_size, plus_limit: 0,
      dietary_enabled: group.rows[0].rsvp_dietary_notes_enabled, display_name: '' };
    const saved = await saveResponse(target, { status, party_count: attending.length, plus_one_count: 0,
      attendees: attending.map(member => member.full_name), group_member_ids: attending.map(member => member.id), dietary_notes: dietaryNotes }, client);
    for (const [index, member] of roster.rows.entries())
      await client.query('UPDATE guests SET rsvp_companion_status = $1 WHERE id = $2', [choices[index].status, member.id]);
    await client.query('COMMIT');
    return res.json(saved);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error saving group RSVP:', error);
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Could not save group RSVP' });
  } finally { client.release(); }
});

publicRsvpRouter.get('/link/:token', async (req, res) => {
  const target = await responseTargetByToken(req.params.token);
  if (!target) return res.status(404).json({ error: 'RSVP link not found' });
  const companions = target.guest_id ? await pool.query('SELECT id, full_name, rsvp_companion_status AS status FROM guests WHERE rsvp_owner_id = $1 ORDER BY created_at, id', [target.guest_id]) : { rows: [] };
  return res.json({ token: req.params.token, invitation_name: target.display_name, invited_party_size: target.invited_party_size, plus_limit: target.plus_limit, dietary_enabled: target.dietary_enabled, companions: companions.rows });
});

publicRsvpRouter.post('/link/:token', async (req, res) => {
  const target = await responseTargetByToken(req.params.token);
  if (!target) return res.status(404).json({ error: 'RSVP link not found' });
  try { return res.json(await saveResponse(target, req.body as Record<string, unknown>)); }
  catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : 'Could not save RSVP' }); }
});

export default hostRouter;