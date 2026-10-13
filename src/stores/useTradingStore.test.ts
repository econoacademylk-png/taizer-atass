import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { getDynamicPrecision, TradingProvider, useTrading } from './useTradingStore';

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

describe('Coin Tabs System in useTradingStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(TradingProvider, null, children);

  it('initializes with activeSymbol in openTabs', () => {
    const { result } = renderHook(() => useTrading(), { wrapper });
    expect(result.current.openTabs).toContain(result.current.activeSymbol);
    expect(result.current.openTabs.length).toBeGreaterThanOrEqual(1);
  });

  it('adds a new tab when setActiveSymbol is called with a new coin', () => {
    const { result } = renderHook(() => useTrading(), { wrapper });

    act(() => {
      result.current.setActiveSymbol('SOLUSDT');
    });

    expect(result.current.activeSymbol).toBe('SOLUSDT');
    expect(result.current.openTabs).toContain('SOLUSDT');

    act(() => {
      result.current.setActiveSymbol('MINAUSDT');
    });

    expect(result.current.activeSymbol).toBe('MINAUSDT');
    expect(result.current.openTabs).toContain('MINAUSDT');
    expect(result.current.openTabs).toContain('SOLUSDT');
  });

  it('switches to existing tab without duplicating when setActiveSymbol is called again', () => {
    const { result } = renderHook(() => useTrading(), { wrapper });

    act(() => {
      result.current.setActiveSymbol('ETHUSDT');
    });
    act(() => {
      result.current.setActiveSymbol('ETHUSDT');
    });

    const count = result.current.openTabs.filter(s => s === 'ETHUSDT').length;
    expect(count).toBe(1);
  });

  it('closes a tab and switches active symbol if the active tab was closed', () => {
    const { result } = renderHook(() => useTrading(), { wrapper });

    act(() => {
      result.current.setActiveSymbol('BTCUSDT');
      result.current.setActiveSymbol('ETHUSDT');
      result.current.setActiveSymbol('SOLUSDT');
    });

    expect(result.current.activeSymbol).toBe('SOLUSDT');
    expect(result.current.openTabs).toEqual(['BTCUSDT', 'ETHUSDT', 'SOLUSDT']);

    act(() => {
      result.current.closeTab('SOLUSDT');
    });

    expect(result.current.openTabs).toEqual(['BTCUSDT', 'ETHUSDT']);
    expect(result.current.activeSymbol).toBe('ETHUSDT');
  });

  it('does not remove the last remaining tab', () => {
    const { result } = renderHook(() => useTrading(), { wrapper });

    // Ensure only 1 tab
    act(() => {
      result.current.reorderTabs(['BTCUSDT']);
      result.current.setActiveSymbol('BTCUSDT');
    });

    expect(result.current.openTabs.length).toBe(1);

    act(() => {
      result.current.closeTab('BTCUSDT');
    });

    expect(result.current.openTabs.length).toBe(1);
    expect(result.current.openTabs[0]).toBe('BTCUSDT');
  });

  it('allows reordering tabs', () => {
    const { result } = renderHook(() => useTrading(), { wrapper });

    act(() => {
      result.current.setActiveSymbol('BTCUSDT');
      result.current.setActiveSymbol('ETHUSDT');
      result.current.setActiveSymbol('SOLUSDT');
    });

    act(() => {
      result.current.reorderTabs(['SOLUSDT', 'BTCUSDT', 'ETHUSDT']);
    });

    expect(result.current.openTabs).toEqual(['SOLUSDT', 'BTCUSDT', 'ETHUSDT']);
  });
});
