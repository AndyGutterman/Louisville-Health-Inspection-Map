/**
 * tests/utils.test.js
 * Run: node --test tests/utils.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normId, normText, toISODate, sleep } from '../lib/utils.js';

describe('normId', () => {
  it('converts a plain integer string', () => assert.equal(normId('42'), '42'));
  it('strips commas from formatted numbers', () => assert.equal(normId('1,234'), '1234'));
  it('handles actual numbers', () => assert.equal(normId(99), '99'));
  it('trims whitespace', () => assert.equal(normId('  7  '), '7'));
  it('returns null for null', () => assert.equal(normId(null), null));
  it('returns null for undefined', () => assert.equal(normId(undefined), null));
  it('returns null for a non-numeric string', () => assert.equal(normId('ABC'), null));
  it('returns null for empty string', () => assert.equal(normId(''), null));
  it('returns null for float strings (fractional part discarded? no — parseInt passes)', () => {
    // parseInt('3.7') === 3, so we get '3'
    assert.equal(normId('3.7'), '3');
  });
});

describe('normText', () => {
  it('uppercases input', () => assert.equal(normText('hello'), 'HELLO'));
  it('strips punctuation', () => assert.equal(normText("McDonald's"), 'MCDONALD S'));
  it('collapses multiple spaces', () => assert.equal(normText('A  B   C'), 'A B C'));
  it('trims leading/trailing whitespace', () => assert.equal(normText('  FOO  '), 'FOO'));
  it('returns empty string for falsy input', () => assert.equal(normText(''), ''));
  it('returns empty string for null', () => assert.equal(normText(null), ''));
  it('returns empty string for undefined', () => assert.equal(normText(undefined), ''));
  it('handles mixed alphanumeric with symbols', () =>
    assert.equal(normText('123 Main St. #4B'), '123 MAIN ST 4B'));
});

describe('toISODate', () => {
  it('converts epoch ms to YYYY-MM-DD', () => {
    // 2024-03-15T00:00:00.000Z = 1710460800000
    assert.equal(toISODate(1710460800000), '2024-03-15');
  });
  it('returns null for null', () => assert.equal(toISODate(null), null));
  it('returns null for undefined', () => assert.equal(toISODate(undefined), null));
  it('returns null for 0', () => assert.equal(toISODate(0), null));
  it('works for a recent timestamp', () => {
    const now = Date.now();
    const result = toISODate(now);
    assert.match(result, /^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('sleep', () => {
  it('resolves after approximately the given ms', async () => {
    const start = Date.now();
    await sleep(50);
    assert.ok(Date.now() - start >= 45, 'should have waited at least ~50 ms');
  });
  it('resolves immediately for 0ms', async () => {
    await sleep(0); // should not throw
  });
});
