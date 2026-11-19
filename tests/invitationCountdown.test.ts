import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countdownInputValue, countdownRemaining, countdownTarget } from '../src/utils/invitationCountdown';

test('countdown gives nonnegative days, hours, minutes, and seconds', () => {
  const start = Date.parse('2030-01-01T00:00:00.000Z');
  const target = '2030-01-03T02:03:04.000Z';
  assert.deepEqual(countdownRemaining(target, start), { days: 2, hours: 2, minutes: 3, seconds: 4 });
  assert.deepEqual(countdownRemaining(target, Date.parse(target) - 1), { days: 0, hours: 0, minutes: 0, seconds: 1 });
  assert.deepEqual(countdownRemaining(target, Date.parse(target) + 1000), { days: 0, hours: 0, minutes: 0, seconds: 0 });
  assert.equal(countdownRemaining('', start), null);
  assert.equal(countdownRemaining('invalid', start), null);
});

test('editor date and time preserves the same instant across local input conversion', () => {
  const target = '2030-01-03T02:03:00.000Z';
  assert.equal(countdownTarget(countdownInputValue(target)), target);
  assert.equal(countdownTarget(''), '');
  assert.equal(countdownInputValue(''), '');
});
