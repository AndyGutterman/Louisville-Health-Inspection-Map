/**
 * tests/utils.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normId, normText, toISODate, sleep } from '../lib/utils.js';

describe('normId', () => {
  it('converts plain integer string',        () => assert.equal(normId('42'),    '42'));
  it('strips commas',                        () => assert.equal(normId('1,234'), '1234'));
  it('handles actual numbers',               () => assert.equal(normId(99),      '99'));
  it('trims whitespace',                     () => assert.equal(normId('  7  '), '7'));
  it('returns null for null',                () => assert.equal(normId(null),    null));
  it('returns null for undefined',           () => assert.equal(normId(undefined), null));
  it('returns null for non-numeric string',  () => assert.equal(normId('ABC'),  null));
  it('returns null for empty string',        () => assert.equal(normId(''),     null));
  it('truncates floats via parseInt',        () => assert.equal(normId('3.7'),  '3'));

  // Real-world: ArcGIS EstablishmentIDs sometimes arrive as "127,897" formatted
  it('handles comma-formatted IDs like ArcGIS returns', () => {
    assert.equal(normId('127,897'), '127897');
  });
});

describe('normText', () => {
  it('uppercases input',                     () => assert.equal(normText('hello'),        'HELLO'));
  it('strips punctuation',                   () => assert.equal(normText("McDonald's"),   'MCDONALD S'));
  it('collapses multiple spaces',            () => assert.equal(normText('A  B   C'),     'A B C'));
  it('trims edges',                          () => assert.equal(normText('  FOO  '),      'FOO'));
  it('returns empty for empty string',       () => assert.equal(normText(''),             ''));
  it('returns empty for null',               () => assert.equal(normText(null),           ''));
  it('returns empty for undefined',          () => assert.equal(normText(undefined),      ''));
  it('handles mixed alphanumeric + symbols', () => assert.equal(normText('123 Main St. #4B'), '123 MAIN ST 4B'));
});

describe('toISODate', () => {
  it('converts epoch ms to YYYY-MM-DD', () => assert.equal(toISODate(1710460800000), '2024-03-15'));
  it('returns null for null',           () => assert.equal(toISODate(null),      null));
  it('returns null for undefined',      () => assert.equal(toISODate(undefined), null));
  it('returns null for 0',              () => assert.equal(toISODate(0),         null));
  it('returns a valid date string for current time', () => {
    assert.match(toISODate(Date.now()), /^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('sleep', () => {
  it('resolves after ~given ms', async () => {
    const t = Date.now();
    await sleep(50);
    assert.ok(Date.now() - t >= 45);
  });
  it('resolves for 0ms', async () => { await sleep(0); });
});