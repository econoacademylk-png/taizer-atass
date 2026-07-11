import { useEffect, useRef } from 'react';
import { useTrading } from '../stores/useTradingStore';
import { fetchHistoricalKlines } from '../services/binance';
import { VWBAScannedCoin } from '../types/chart';

const SCAN_INTERVAL_MS = 600000; // 10 minutes
const EXPIRATION_MS = 12 * 60 * 60 * 1000; // 12 hours

// We can fallback to TOP_COINS if exchangeInfo fails
const FALLBACK_COINS = [
  "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT", "AVAXUSDT", 
  "LINKUSDT", "DOTUSDT", "LTCUSDT", "BCHUSDT", "NEARUSDT", "UNIUSDT", "ATOMUSDT",
  "INJUSDT", "RNDRUSDT", "TIAUSDT", "SEIUSDT", "SUIUSDT", "APTUSDT", "OPUSDT", "ARBUSDT",
  "FILUSDT", "VETUSDT", "RUNEUSDT", "ICPUSDT", "IMXUSDT", "AAVEUSDT", "LDOUSDT", "MKRUSDT",
  "SNXUSDT", "GALAUSDT", "SANDUSDT", "MANAUSDT", "AXSUSDT", "EGLDUSDT", "CRVUSDT", "STXUSDT"
];

function getCandleLimitForTimeframe(tf: string): number {
  switch (tf) {
    case '5m': return 150;
    case '15m': return 100;
    case '1h': return 50;
    case '4h': return 10;
    case '1d': return 3; // Exactly 3 candles to find a pattern on the live edge
    default: return 50;
  }
}

export function useSMCScanner() {
  const { setVwbaScannedCoins, setCurrentlyScanningCoin, setNextScanTime, indicators, activeTimeframe } = useTrading();
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const allCoinsRef = useRef<string[]>([]);
  const batchIndexRef = useRef<number>(0);

  useEffect(() => {
    // Only run the scanner if VWBA is active, to save resources
    if (!indicators.showVWBA) {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
      return;
    }

    const allowedTimeframes = ['5m', '15m', '1h', '4h', '1d'];

    const initAndScan = async () => {
      // 1. Fetch all coins if we haven't already
      if (allCoinsRef.current.length === 0) {
        try {
          setCurrentlyScanningCoin("Fetching Market Info...");
          const res = await fetch('https://fapi.binance.com/fapi/v1/exchangeInfo');
          const data = await res.json();
          const usdtPairs = data.symbols
            .filter((s: any) => s.quoteAsset === 'USDT' && s.status === 'TRADING')
            .map((s: any) => s.symbol);
          
          allCoinsRef.current = usdtPairs.length > 0 ? usdtPairs : FALLBACK_COINS;
        } catch (e) {
          console.error("Failed to fetch exchange info", e);
          allCoinsRef.current = FALLBACK_COINS;
        }
      }
      
      const scanNextBatch = async () => {
        const now = Date.now();
        const limit = getCandleLimitForTimeframe(activeTimeframe);
        
        // Take next 40 coins
        let startIndex = batchIndexRef.current;
        let endIndex = startIndex + 40;
        
        if (startIndex >= allCoinsRef.current.length) {
          startIndex = 0;
          endIndex = 40;
        }
        
        const batch = allCoinsRef.current.slice(startIndex, endIndex);
        batchIndexRef.current = endIndex >= allCoinsRef.current.length ? 0 : endIndex;
        
        const results: VWBAScannedCoin[] = [];
        
        // We process the 40 coins in sub-batches of 4 to avoid rate limits
        const subBatchSize = 4;
        
        for (let i = 0; i < batch.length; i += subBatchSize) {
          const subBatch = batch.slice(i, i + subBatchSize);
          
          const promises = subBatch.flatMap((symbol) => {
            return allowedTimeframes.map(async (tf) => {
              try {
                setCurrentlyScanningCoin(`${symbol} [${tf}]`); // Update UI
                const limit = getCandleLimitForTimeframe(tf);
                const candles = await fetchHistoricalKlines(symbol, tf, limit);
                if (candles.length < 3) return null;
                
                let activeOB: VWBAScannedCoin | null = null;
                
                for (let c = 0; c < candles.length - 2; c++) {
                  const prev = candles[c];
                  const next1 = candles[c + 1];
                  const next2 = candles[c + 2];
                  
                  if (prev.close < prev.open && next1.close > next1.open && next2.close > next2.open && (next2.close - prev.low) / prev.low > 0.012) {
                    let isMitigated = false;
                    for (let m = c + 3; m < candles.length; m++) {
                      if (candles[m].low <= prev.low) {
                        isMitigated = true;
                        break;
                      }
                    }
                    if (!isMitigated) {
                      activeOB = { symbol, type: 'BULLISH', timeframe: tf, time: now, obTime: prev.time, obPriceStart: prev.low, obPriceEnd: prev.open };
                    }
                  }
                  
                  if (prev.close > prev.open && next1.close < next1.open && next2.close < next2.open && (prev.high - next2.close) / next2.close > 0.012) {
                    let isMitigated = false;
                    for (let m = c + 3; m < candles.length; m++) {
                      if (candles[m].high >= prev.high) {
                        isMitigated = true;
                        break;
                      }
                    }
                    if (!isMitigated) {
                      activeOB = { symbol, type: 'BEARISH', timeframe: tf, time: now, obTime: prev.time, obPriceStart: prev.high, obPriceEnd: prev.open };
                    }
                  }
                }
                
                return activeOB;
              } catch (err) {
                console.error(`SMC Scanner failed for ${symbol} on ${tf}:`, err);
                return null;
              }
            });
          });
          
          const subBatchResults = await Promise.all(promises);
          subBatchResults.forEach(res => {
            if (res) results.push(res);
          });
          
          await new Promise(r => setTimeout(r, 100)); // Rate limit buffer
        }
        
        setCurrentlyScanningCoin(null); // Clear UI
        
        // Update VWBA Coins - keep accumulated, filter expired
        setVwbaScannedCoins(prev => {
          // Add new results, filter out old ones (older than 12 hours)
          // Also handle duplicates (if a coin was found again, update its time)
          const merged = [...prev];
          
          results.forEach(newCoin => {
            const existingIndex = merged.findIndex(c => c.symbol === newCoin.symbol && c.timeframe === newCoin.timeframe);
            if (existingIndex >= 0) {
              merged[existingIndex] = newCoin;
            } else {
              merged.push(newCoin);
            }
          });
          
          return merged
            .filter(coin => (now - coin.obTime) < EXPIRATION_MS)
            .sort((a, b) => a.symbol.localeCompare(b.symbol) || b.obTime - a.obTime); // Group by symbol, then newest OBs first
        });
        
        setNextScanTime(Date.now() + SCAN_INTERVAL_MS);
      };
      
      scanNextBatch();
      scanIntervalRef.current = setInterval(scanNextBatch, SCAN_INTERVAL_MS);
    };

    initAndScan();
    
    return () => {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
    };
  }, [indicators.showVWBA, setVwbaScannedCoins, setCurrentlyScanningCoin, setNextScanTime]);
}
