import assert from 'node:assert/strict';
import { test } from 'node:test';
import { invitationTimeline } from '../src/utils/invitationTimeline';

test('timeline retains editable entries in their saved order', () => {
  const entries = [
    { id: 'ceremony', time: '3:00 PM', title: 'Ceremony' },
    { id: 'reception', time: '6:00 PM', title: 'Reception' },
  ];
  assert.deepEqual(invitationTimeline({ timeline: entries }), entries);
  assert.deepEqual(invitationTimeline({ timeline: [...entries].reverse() }), [...entries].reverse());
});

test('older invitations and malformed entries do not break timeline rendering', () => {
  assert.deepEqual(invitationTimeline({}), []);
  assert.deepEqual(invitationTimeline({ timeline: null }), []);
  assert.deepEqual(invitationTimeline({ timeline: [{ id: 'ok', time: '', title: 'Dinner' }, { id: 2, time: '7:00', title: 'Bad' }] }), [
    { id: 'ok', time: '', title: 'Dinner' },
  ]);
});
