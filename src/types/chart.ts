/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Candle {
  time: number; // UTC timestamp in ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  buyVolume: number; // Volume from buyers (used to calculate delta and footprint)
  sellVolume: number; // Volume from sellers
  trades: number;
  delta: number; // Net delta (buy - sell)
  footprint: {
    [price: number]: {
      buyVol: number;
      sellVol: number;
      delta: number;
    };
  };
}

export type ChartType = 'candlestick' | 'heikin-ashi' | 'line' | 'area' | 'bars' | 'footprint' | 'volume-candle' | 'delta-candle';

export type DrawingType = 'cursor' | 'trendline' | 'horizontal' | 'rectangle' | 'long' | 'short' | 'measure' 
  | 'fib-retracement' | 'fib-extension' | 'price-tag' | 'text-box' | 'path' | 'circle' | 'triangle' | 'arrow' | 'callout' | 'arc';

export interface DrawingPoint {
  time: number;
  price: number;
}

export interface Drawing {
  id: string;
  type: DrawingType;
  points: DrawingPoint[];
  color: string;
  isLocked: boolean;
  lineWidth?: number;
  text?: string;
  textSize?: number;
  fillColor?: string;
  // For long/short risk tools
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  riskRewardRatio?: number;
  targetSize?: number;
}

export interface SMCConfig {
  showFVG: boolean;
  showBOS: boolean;
  showCHOCH: boolean;
  showOB: boolean;
  showMitigation: boolean;
  showLiquiditySweeps: boolean;
  showPremiumDiscount: boolean;
  showHVBuy: boolean;
  showHVSell: boolean;
}

export interface IndicatorConfig {
  showIMB?: boolean;
  showEMA: boolean;
  showLEZ: boolean;
  emaPeriod: number;
  showSMA: boolean;
  smaPeriod: number;
  showVWAP: boolean;
  showMPAS: boolean;
  anchoredTime: number | null; // Timestamp where anchored
  showVolumeProfile: boolean;
  showTPO: boolean;
  showNPOC?: boolean;
  showDeltaCVD: boolean;
  showSpoof?: boolean;
  showOI?: boolean;
  showOIT?: boolean;
  showOIWall?: boolean;
  showLVN?: boolean;
  showFPShape?: boolean;
  showStats?: boolean;
  showDOMLiquidity?: boolean;
  showWickDelta?: boolean;
  showDelta?: boolean;
  showDDelta?: boolean;
  showDeltaV?: boolean;
  showWhales?: boolean;
  showIceberg?: boolean;
  showRSI?: boolean;
  showVPT?: boolean;
  showHeatmap?: boolean;
  showSTK?: boolean;
  showLiveDOMProfile?: boolean;
  showMTF?: boolean;
  showPivot?: boolean;
  showPace?: boolean;
  showAbs?: boolean;
  showVol?: boolean;
  showDVol?: boolean;
  showDOpen?: boolean;
  showSess?: boolean;
  showCRT?: boolean;
  showEW?: boolean;
  showSK?: boolean;
  showTWB?: boolean;
  showSNR?: boolean;
  showWYC?: boolean;
  showVWBA?: boolean;
  showMMS?: boolean;
  showNews?: boolean;
  showRekt?: boolean;
}

export interface DOMLevel {
  price: number;
  amount: number;
  cumulativeAmount: number;
  percentage: number;
  isMyOrder?: boolean;
}

export interface DOMState {
  bids: DOMLevel[];
  asks: DOMLevel[];
  deepOrderBook?: {
    bids: { price: number; amount: number }[];
    asks: { price: number; amount: number }[];
  };
  nearDOMPower: {
    bidPower: number;
    askPower: number;
    bidPercent: number;
    askPercent: number;
  };
  aggressivePower: {
    buyPower: number;
    sellPower: number;
    buyPercent: number;
    sellPercent: number;
  };
  orderFlowSpeed: number; // Trades per second
}

export interface ScannerAlert {
  id: string;
  symbol: string;
  time: number;
  type: 'FVG' | 'BOS' | 'CHOCH' | 'LIQUIDITY_SWEEP' | 'WHALE_TRADE' | 'WHALE_BTC' | 'LIQUIDATION' | 'HIGH_OI';
  price: number;
  side: 'BUY' | 'SELL' | 'NEUTRAL';
  message: string;
  volume?: number;
}

export interface AlertSetting {
  id: string;
  symbol: string;
  type: 'price' | 'fvg' | 'bos';
  condition: 'above' | 'below' | 'triggered';
  value: number;
  soundEnabled: boolean;
  desktopEnabled: boolean;
  isActive: boolean;
}

export interface MarketStatsData {
  fundingRate: number;
  nextFundingTime: number;
  openInterest: number;
  openInterestChange24h: number;
  longShortRatio: number;
  fearAndGreedValue: number;
  fearAndGreedState: string;
  liquidations24h: number;
}

export interface ReplayState {
  isActive: boolean;
  currentPlaybackIndex: number;
  speed: number; // interval ms between bars
  isPaused: boolean;
}

export interface VWBAScannedCoin {
  symbol: string;
  type: 'BULLISH' | 'BEARISH';
  timeframe: string;
  time: number; // Time the scan happened
  obTime: number; // Time the OB candle was formed
  obPriceStart: number;
  obPriceEnd: number;
}

export interface NewsEvent {
  title: string;
  country: string;
  date: string; // ISO datetime
  impact: string; // "High", "Medium", "Low", "Holiday"
  forecast: string;
  previous: string;
}

