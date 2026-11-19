import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rsvpAttendingGuests, rsvpNameWithSeating, rsvpSeatingLabel } from '../src/utils/rsvpReceiptPdf';
import type { RsvpReceipt } from '../src/utils/rsvpReceiptPdf';

test('receipt seating labels include assigned table and optional seat number', () => {
  assert.equal(rsvpSeatingLabel({ tableName: 'Family', seatNumber: 4 }), 'Table: Family - Seat 4');
  assert.equal(rsvpSeatingLabel({ tableName: 'Family', seatNumber: null }), 'Table: Family');
  assert.equal(rsvpSeatingLabel({ tableName: null, seatNumber: null }), 'Not assigned to a table');
  assert.equal(rsvpNameWithSeating('Alex', { tableName: 'Family', seatNumber: 4 }), 'Alex (Table: Family - Seat 4)');
  assert.equal(rsvpNameWithSeating('Alex'), 'Alex');
});

test('receipt lists only attending people, with seating matched by guest order', () => {
  const receipt: RsvpReceipt = {
    kind: 'listed', guestName: 'Alex', status: 'declined', submittedAt: '2026-11-19T00:00:00Z',
    companions: [{ name: 'Jordan', status: 'attending' }, { name: 'Taylor', status: 'declined' }, { name: 'Morgan', status: 'attending' }],
    seating: { invitation: { tableName: 'Host', seatNumber: 1 }, companions: [
      { tableName: 'Family', seatNumber: 2 }, { tableName: null, seatNumber: null }, { tableName: 'Family', seatNumber: 3 },
    ] },
  };
  assert.deepEqual(rsvpAttendingGuests(receipt), [
    { name: 'Jordan', seating: { tableName: 'Family', seatNumber: 2 } },
    { name: 'Morgan', seating: { tableName: 'Family', seatNumber: 3 } },
  ]);
  assert.deepEqual(rsvpAttendingGuests({ ...receipt, status: 'attending' }).map(guest => guest.name), ['Alex', 'Jordan', 'Morgan']);
  assert.deepEqual(rsvpAttendingGuests({ ...receipt, isGroup: true }).map(guest => guest.name), ['Jordan', 'Morgan']);
  assert.deepEqual(rsvpAttendingGuests({ ...receipt, kind: 'pending' }), []);
  assert.deepEqual(rsvpAttendingGuests({ ...receipt, companions: [] }), []);
});
