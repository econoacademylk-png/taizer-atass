/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const MTF_TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d'] as const;
export type MTFTimeframe = typeof MTF_TIMEFRAMES[number];

/**
 * Returns the duration of a candle interval in milliseconds.
 * All standard exchange candles (Binance, TradingView) are aligned to UTC midnight.
 */
export function getTimeframeIntervalMs(tf: string): number {
  const norm = tf.toLowerCase().trim();
  switch (norm) {
    case '1s':
      return 1000;
    case '1m':
      return 60 * 1000;
    case '3m':
      return 3 * 60 * 1000;
    case '5m':
      return 5 * 60 * 1000;
    case '15m':
      return 15 * 60 * 1000;
    case '30m':
      return 30 * 60 * 1000;
    case '1h':
      return 60 * 60 * 1000;
    case '2h':
      return 2 * 60 * 60 * 1000;
    case '4h':
      return 4 * 60 * 60 * 1000;
    case '6h':
      return 6 * 60 * 60 * 1000;
    case '8h':
      return 8 * 60 * 60 * 1000;
    case '12h':
      return 12 * 60 * 60 * 1000;
    case '1d':
      return 24 * 60 * 60 * 1000;
    case '1w':
      return 7 * 24 * 60 * 60 * 1000;
    default:
      return 60 * 1000;
  }
}

export interface CandleCountdownInfo {
  timeframe: string;
  remainingMs: number;
  totalSeconds: number;
  progress: number; // 0 to 1 (0 = candle just opened, 1 = candle about to close)
  formatted: string; // e.g. "00:45", "03:12", "01:23:45"
}

/**
 * Calculates remaining time until candle close and progress percentage
 * based on UTC exchange clock synchronization.
 */
export function getCandleTimeRemaining(tf: string, now: number = Date.now()): CandleCountdownInfo {
  const intervalMs = getTimeframeIntervalMs(tf);
  const elapsedMs = now % intervalMs;
  const remainingMs = Math.max(0, intervalMs - elapsedMs);
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const progress = Math.min(1, Math.max(0, elapsedMs / intervalMs));

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  let formatted = '';
  if (hours > 0) {
    formatted = `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  } else {
    formatted = `${minutes.toString().padStart(2, '0')}:${seconds
      .toString()
      .padStart(2, '0')}`;
  }

  return {
    timeframe: tf,
    remainingMs,
    totalSeconds,
    progress,
    formatted,
  };
}
