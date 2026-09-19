import { useState, useEffect } from 'react';
import { LEZLiveSignal } from '../types/chart';
import { fetchHistoricalKlines } from '../services/binance';
import { calculateLEZ } from '../utils/lezCalculator';
import { playSignalChime } from '../utils/audioAlert';

const TOP_MONITORED_COINS = [
  "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT", 
  "ADAUSDT", "AVAXUSDT", "SUIUSDT", "NEARUSDT", "LINKUSDT", "PEPEUSDT", 
  "SHIBUSDT", "FETUSDT", "RENDERUSDT", "TAOUSDT", "INJUSDT", "TIAUSDT", 
  "SEIUSDT", "ARBUSDT", "OPUSDT", "WIFUSDT", "ENAUSDT", "LTCUSDT", "BCHUSDT"
];

export function getTimeframeDurationMs(tf: string): number {
  switch (tf) {
    case '1m': return 60 * 1000;
    case '5m': return 5 * 60 * 1000;
    case '15m': return 15 * 60 * 1000;
    case '1h': return 60 * 60 * 1000;
    case '4h': return 4 * 60 * 60 * 1000;
    case '1d': return 24 * 60 * 60 * 1000;
    default: return 5 * 60 * 1000;
  }
}

// Global state for LEZ Scanner
interface LEZStoreState {
  signals: LEZLiveSignal[];
  latestAlert: LEZLiveSignal | null;
  isScanning: boolean;
  currentlyScanning: string | null;
  soundEnabled: boolean;
  scanTimeframe: string;
  lastScanTime: number;
}

let state: LEZStoreState = {
  signals: [],
  latestAlert: null,
  isScanning: false,
  currentlyScanning: null,
  soundEnabled: typeof window !== 'undefined' ? localStorage.getItem('lez_sound_enabled') !== 'false' : true,
  scanTimeframe: '5m',
  lastScanTime: 0,
};

const listeners = new Set<() => void>();
const alertedSignalIds = new Set<string>();

function notify() {
  listeners.forEach((listener) => listener());
}

export function setLEZState(updater: (prev: LEZStoreState) => Partial<LEZStoreState>) {
  const next = updater(state);
  state = { ...state, ...next };
  notify();
}

export async function runLEZScan() {
  if (state.isScanning) return;

  setLEZState(() => ({ isScanning: true }));

  try {
    // 1. Get Favorite Coins from localStorage first
    let favoriteCoins: string[] = [];
    try {
      const stored = localStorage.getItem('favorite_coins');
      if (stored) {
        favoriteCoins = JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Failed to parse favorite coins for LEZ scanner', e);
    }

    // 2. Combine with top coins (deduplicated, with favorites first)
    const coinSet = new Set<string>([...favoriteCoins, ...TOP_MONITORED_COINS]);
    const coinsToScan = Array.from(coinSet);

    const detectedSignals: LEZLiveSignal[] = [];
    const now = Date.now();
    const timeframe = state.scanTimeframe;

    // Scan in sub-batches of 5 coins to prevent network congestion
    const subBatchSize = 5;
    for (let i = 0; i < coinsToScan.length; i += subBatchSize) {
      const batch = coinsToScan.slice(i, i + subBatchSize);

      await Promise.all(
        batch.map(async (symbol) => {
          try {
            setLEZState(() => ({ currentlyScanning: `${symbol} [${timeframe}]` }));
            // 65 candles is ideal for calculateLEZ (requires minimum 50)
            const candles = await fetchHistoricalKlines(symbol, timeframe, 65);
            if (!candles || candles.length < 50) return;

            const lezResult = calculateLEZ(candles);
            if (!lezResult.signals || lezResult.signals.length === 0) return;

            // Inspect the latest signal
            const lastSig = lezResult.signals[lezResult.signals.length - 1];
            const candle = candles[lastSig.index];
            if (!candle || !lastSig.trade) return;

            const signalTime = candle.time;
            const ageMs = now - signalTime;
            const candleDuration = getTimeframeDurationMs(timeframe);

            // Fresh if within 2 minutes for 1m/5m, or within 1 candle period for 15m/1h/4h/1d
            const isFresh = ageMs <= Math.max(2 * 60 * 1000, candleDuration);
            // Recent if within 4 candle periods (e.g. 4 hours for 1h, 16h for 4h, 4 days for 1d)
            const isRecent = ageMs <= Math.max(30 * 60 * 1000, candleDuration * 4);

            if (isRecent) {
              const signalId = `${symbol}-${timeframe}-${lastSig.type}-${signalTime}`;
              const liveSignal: LEZLiveSignal = {
                id: signalId,
                symbol,
                type: lastSig.type,
                qualityScore: lastSig.qualityScore,
                time: signalTime,
                detectedAt: now,
                entryPrice: lastSig.trade.entryPrice,
                slPrice: lastSig.trade.slPrice,
                tpPrice: lastSig.trade.tpPrice,
                timeframe,
                isFresh
              };

              detectedSignals.push(liveSignal);

              // If fresh and not alerted yet, trigger alert!
              if (isFresh && !alertedSignalIds.has(signalId)) {
                alertedSignalIds.add(signalId);
                setLEZState(() => ({ latestAlert: liveSignal }));

                if (state.soundEnabled) {
                  playSignalChime(liveSignal.type);
                }
              }
            }
          } catch (err) {
            // Ignore single coin fetch error and continue
          }
        })
      );
    }

    // Sort signals so freshest are on top
    detectedSignals.sort((a, b) => b.time - a.time);

    setLEZState(() => ({
      signals: detectedSignals,
      lastScanTime: Date.now(),
      currentlyScanning: null,
      isScanning: false,
    }));
  } catch (error) {
    console.error('LEZ scan error:', error);
    setLEZState(() => ({ isScanning: false, currentlyScanning: null }));
  }
}

export function useLEZStore() {
  const [, setTick] = useState(0);

  useEffect(() => {
    const listener = () => setTick((t) => t + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const toggleSound = () => {
    const nextVal = !state.soundEnabled;
    localStorage.setItem('lez_sound_enabled', String(nextVal));
    setLEZState(() => ({ soundEnabled: nextVal }));
  };

  const setScanTimeframe = (tf: string) => {
    setLEZState(() => ({ scanTimeframe: tf }));
    runLEZScan();
  };

  const clearLatestAlert = () => {
    setLEZState(() => ({ latestAlert: null }));
  };

  const freshSignals = state.signals.filter((s) => {
    const dur = getTimeframeDurationMs(s.timeframe);
    return Date.now() - s.time <= Math.max(2 * 60 * 1000, dur);
  });

  return {
    signals: state.signals,
    freshSignals,
    freshCount: freshSignals.length,
    latestAlert: state.latestAlert,
    isScanning: state.isScanning,
    currentlyScanning: state.currentlyScanning,
    soundEnabled: state.soundEnabled,
    scanTimeframe: state.scanTimeframe,
    lastScanTime: state.lastScanTime,
    toggleSound,
    setScanTimeframe,
    clearLatestAlert,
    triggerScan: runLEZScan,
  };
}
