import assert from 'node:assert/strict';
import { test } from 'node:test';
import { seatingCsv } from '../src/utils/seatingExport';
import type { SeatingPlan } from '../src/services/seatingService';

test('exports assigned and unassigned guests with occupancy and origin labels', () => {
  const plan: SeatingPlan = {
    tables: [{ id: 'one', event_id: 'event', name: 'Family, "front"', capacity: 1, occupancy: 2 }],
    guests: [
      { id: 'a', event_id: 'event', group_id: null, full_name: 'Aldrin', email: null, phone: null, companion_label: null, rsvp_status: 'attending', table_id: 'one' },
      { id: 'b', event_id: 'event', group_id: null, full_name: 'Maya', email: null, phone: null, companion_label: "Aldrin's friend #1", rsvp_status: 'attending', table_id: 'one' },
      { id: 'c', event_id: 'event', group_id: null, full_name: '=2+2', email: null, phone: null, companion_label: null, rsvp_status: null, table_id: null },
    ],
  };
  assert.equal(seatingCsv(plan),
    '"Table","Capacity","Occupancy","Capacity status","Guest","Origin","RSVP"\r\n' +
    '"Family, ""front""","1","2","Over capacity by 1","Aldrin","","attending"\r\n' +
    '"Family, ""front""","1","2","Over capacity by 1","Maya","Aldrin\'s friend #1","attending"\r\n' +
    '"Unassigned","","","","\'=2+2","","Awaiting"\r\n');
});

test('includes empty tables in an export', () => {
  assert.equal(seatingCsv({
    tables: [{ id: 'one', event_id: 'event', name: 'Quiet', capacity: 8, occupancy: 0 }],
    guests: [],
  }), '"Table","Capacity","Occupancy","Capacity status","Guest","Origin","RSVP"\r\n"Quiet","8","0","Within capacity","","",""\r\n');
});
