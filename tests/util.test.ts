import { describe, it, expect } from 'vitest';
import { parseList } from '../src/util.js';

describe('parseList', () => {
  it('returns empty array for undefined', () => {
    expect(parseList(undefined)).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(parseList('')).toEqual([]);
  });

  it('splits comma-separated values', () => {
    expect(parseList('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('trims whitespace around each value', () => {
    expect(parseList(' a , b ,c ')).toEqual(['a', 'b', 'c']);
  });

  it('drops empty entries', () => {
    expect(parseList('a,,b,')).toEqual(['a', 'b']);
  });
});
