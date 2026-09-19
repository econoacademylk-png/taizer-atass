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

            // Signal is fresh if within 2 minutes (120,000 ms)
            // Or within 1 candle period for 1m / 5m
            const isFresh = ageMs <= 2 * 60 * 1000;
            const isRecent = ageMs <= 15 * 60 * 1000; // within 15 mins to display in hub

            if (isRecent) {
              const signalId = `${symbol}-${lastSig.type}-${signalTime}`;
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

              // If fresh (<= 2 min) and not alerted yet, trigger alert!
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

  const freshSignals = state.signals.filter((s) => Date.now() - s.time <= 2 * 60 * 1000);

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
