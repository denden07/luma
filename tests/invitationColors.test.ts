import assert from 'node:assert/strict';
import { test } from 'node:test';
import { invitationColors } from '../src/utils/invitationColors';

test('named palette colors and existing hex-only colors are supported', () => {
  assert.deepEqual(invitationColors({ colors: [
    { hex: '#abcdef', name: 'Sage' }, 'red', '#123456', '#123', 123,
    { hex: '#ffffff', name: 7 }, { hex: 'blue', name: 'Invalid' },
  ] }), [
    { hex: '#abcdef', name: 'Sage' },
    { hex: '#123456', name: '' },
    { hex: '#ffffff', name: '' },
  ]);
  assert.deepEqual(invitationColors({}), []);
});
