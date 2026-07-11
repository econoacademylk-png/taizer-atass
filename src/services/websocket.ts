/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

interface WsCallbacks {
  onTrade?: (trade: {
    price: number;
    amount: number;
    isBuyerMaker: boolean;
    time: number;
  }) => void;
  onDepth?: (depth: {
    bids: [string, string][];
    asks: [string, string][];
  }) => void;
  onBookTicker?: (bookTicker: {
    bestBidPrice: number;
    bestBidQty: number;
    bestAskPrice: number;
    bestAskQty: number;
  }) => void;
  onLiquidation?: (liq: {
    symbol: string;
    side: 'BUY' | 'SELL';
    price: number;
    amount: number;
    time: number;
  }) => void;
  onTicker?: (ticker: {
    price: number;
    high: number;
    low: number;
    volume: number;
  }) => void;
  onKline?: (kline: {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    buyVolume: number;
    sellVolume: number;
    trades: number;
    delta: number;
    isFinal: boolean;
  }) => void;
}

export class BinanceWebSocketManager {
  private ws: WebSocket | null = null;
  private currentSymbol: string = '';
  private currentTimeframe: string = '1m';
  private callbacks: WsCallbacks = {};
  private reconnectTimeout: any = null;
  private isConnecting: boolean = false;
  private pingInterval: any = null;
  private reconnectAttempts: number = 0;

  constructor(callbacks: WsCallbacks) {
    this.callbacks = callbacks;
  }

  public connect(symbol: string, timeframe: string = '1m') {
    const cleanSymbol = symbol.toLowerCase();
    const cleanTf = timeframe.toLowerCase();
    if (this.currentSymbol === cleanSymbol && this.currentTimeframe === cleanTf && this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    this.disconnect();
    this.currentSymbol = cleanSymbol;
    this.currentTimeframe = cleanTf;
    this.isConnecting = true;

    // We stream multiple channels using Binance Futures combined streams:
    // wss://fstream.binance.com/stream?streams=btcusdt@aggTrade/btcusdt@depth20@100ms/btcusdt@bookTicker/btcusdt@kline_1m/!forceOrder@arr
    const wsTf = cleanTf === '1s' ? '1m' : cleanTf;
    const url = `wss://fstream.binance.com/stream?streams=${cleanSymbol}@aggTrade/${cleanSymbol}@depth20@100ms/${cleanSymbol}@bookTicker/${cleanSymbol}@kline_${wsTf}/!forceOrder@arr`;

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        // console.log(`WebSocket connected to streams for ${symbol}`);
        this.isConnecting = false;
        this.reconnectAttempts = 0; // reset backoff on success
        this.startHeartbeat();
      };

      this.ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (!parsed || !parsed.stream) return;

          const streamName = parsed.stream;
          const data = parsed.data;

          if (streamName.includes('@aggTrade')) {
            if (this.callbacks.onTrade) {
              this.callbacks.onTrade({
                price: parseFloat(data.p),
                amount: parseFloat(data.q),
                isBuyerMaker: data.m, // true means seller-initiated, false means buyer-initiated
                time: data.T,
              });
            }
          } else if (streamName.includes('@kline')) {
            if (this.callbacks.onKline && data.k) {
              const k = data.k;
              const buyVolume = parseFloat(k.V);
              const volume = parseFloat(k.v);
              const sellVolume = volume - buyVolume;
              this.callbacks.onKline({
                time: k.t,
                open: parseFloat(k.o),
                high: parseFloat(k.h),
                low: parseFloat(k.l),
                close: parseFloat(k.c),
                volume,
                buyVolume,
                sellVolume,
                trades: parseInt(k.n),
                delta: buyVolume - sellVolume,
                isFinal: k.x
              });
            }
          } else if (streamName.includes('@depth')) {
            if (this.callbacks.onDepth) {
              this.callbacks.onDepth({
                bids: data.b,
                asks: data.a,
              });
            }
          } else if (streamName.includes('@bookTicker')) {
            if (this.callbacks.onBookTicker) {
              this.callbacks.onBookTicker({
                bestBidPrice: parseFloat(data.b),
                bestBidQty: parseFloat(data.B),
                bestAskPrice: parseFloat(data.a),
                bestAskQty: parseFloat(data.A),
              });
            }
          } else if (streamName.includes('!forceOrder') || data.e === 'forceOrder') {
            if (this.callbacks.onLiquidation) {
              const liqData = data.o || data;
              this.callbacks.onLiquidation({
                symbol: liqData.s,
                side: liqData.S, // BUY or SELL
                price: parseFloat(liqData.p),
                amount: parseFloat(liqData.q),
                time: liqData.T || Date.now(),
              });
            }
          }
        } catch (e) {
          // Silent parse catch
        }
      };

      this.ws.onerror = (err) => {
        console.warn('WebSocket error:', err);
      };

      this.ws.onclose = () => {
        this.isConnecting = false;
        this.stopHeartbeat();
        this.scheduleReconnect();
      };
    } catch (e) {
      console.warn('WebSocket connection attempt failed:', e);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  public disconnect() {
    this.stopHeartbeat();
    this.reconnectAttempts = 0;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimeout) return;
    const delay = Math.min(60000, 4000 * Math.pow(2, this.reconnectAttempts));
    this.reconnectAttempts++;
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      if (this.currentSymbol) {
        // console.log(`Attempting reconnection for ${this.currentSymbol}...`);
        this.connect(this.currentSymbol, this.currentTimeframe);
      }
    }, delay);
  }

  private startHeartbeat() {
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ method: 'PING', id: 1 }));
      }
    }, 30000);
  }

  private stopHeartbeat() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
}
