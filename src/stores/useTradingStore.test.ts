import { describe, it, expect } from 'vitest';
import { getDynamicPrecision } from './useTradingStore';

describe('getDynamicPrecision', () => {
  it('returns 2 for zero or negative values', () => {
    expect(getDynamicPrecision(0)).toBe(2);
    expect(getDynamicPrecision(-5)).toBe(2);
  });

  it('calculates dynamic precision correctly for small decimals', () => {
    expect(getDynamicPrecision(0.00045)).toBe(6); // -log10(0.00045) is ~3.3 -> ceil is 4 -> +2 = 6
    expect(getDynamicPrecision(0.01)).toBe(4);    // -log10(0.01) is 2 -> ceil is 2 -> +2 = 4
  });

  it('caps at maximum 9 decimals', () => {
    expect(getDynamicPrecision(0.00000000001)).toBe(9);
  });

  it('caps at minimum 2 decimals for large values', () => {
    expect(getDynamicPrecision(100)).toBe(2);
    expect(getDynamicPrecision(60000)).toBe(2);
  });
});
