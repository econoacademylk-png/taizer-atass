import { API_BASE } from '../config/api';
export interface FAData {
  price: number;
  marketCap: number;
  fdv: number;
  circulatingSupply: number;
  maxSupply: number | null;
  githubCommits: number | null;
  redditSubs: number | null;
  volume24h: number;
  volumeToMcap: number;
  priceChange24h: number;
  change7d: number;
  change30d: number;
  fromATH: number;
  twitterFollowers: number | null;
  telegramUsers: number | null;
  coingeckoRank: number | null;
  tvl: number | null;
  mcapTvlRatio: number | null;
  liquidityScore: number | null;
  genesisDate: string | null;
  high24h: number;
  low24h: number;
  openInterest: number;
  oiChange24h: number;
  fundingRate: number;
  smartMoneyOiWall: number | null;
  sellWallValue: number | null;
  retailLsRatio: number | null;
  takerBuySellRatio: number | null;
  orderbookImbalance: string;
}

const BINANCE_FAPI_URL = 'https://fapi.binance.com/fapi/v1';

// A simple mock for things that are hard to get without API keys (or rate-limited)
const generateMockData = (symbol: string, basePrice: number, baseVol: number): Partial<FAData> => {
  const isBTC = symbol.toUpperCase().includes('BTC');
  const isETH = symbol.toUpperCase().includes('ETH');
  
  const mcap = isBTC ? 1238.14 * 1000000000 : isETH ? 400 * 1000000000 : basePrice * 1000000000;
  const circSupply = isBTC ? 19700000 : isETH ? 120000000 : 1000000000;
  
  return {
    marketCap: mcap,
    fdv: mcap * 1.05,
    circulatingSupply: circSupply,
    maxSupply: isBTC ? 21000000 : isETH ? null : circSupply * 1.5,
    githubCommits: Math.floor(Math.random() * 200),
    redditSubs: Math.floor(Math.random() * 500000),
    change7d: (Math.random() * 10) - 5,
    change30d: (Math.random() * 30) - 15,
    fromATH: -1 * (20 + Math.random() * 60),
    twitterFollowers: Math.floor(Math.random() * 1000000),
    telegramUsers: Math.floor(Math.random() * 200000),
    coingeckoRank: isBTC ? 1 : isETH ? 2 : Math.floor(Math.random() * 100) + 3,
    tvl: mcap * (Math.random() * 0.2 + 0.05),
    mcapTvlRatio: Math.random() * 10 + 1,
    liquidityScore: Math.floor(Math.random() * 30) + 70,
    genesisDate: isBTC ? '2009-01-03' : isETH ? '2015-07-30' : '2021-01-01',
    smartMoneyOiWall: basePrice * (1 + (Math.random() * 0.05)),
    sellWallValue: baseVol * 0.15,
    retailLsRatio: 1 + Math.random() * 2,
    takerBuySellRatio: 0.8 + Math.random() * 0.4,
    orderbookImbalance: Math.random() > 0.5 ? 'Bullish' : Math.random() > 0.5 ? 'Bearish' : 'Balanced',
    oiChange24h: (Math.random() * 10) - 5,
  };
};

export async function fetchFAData(symbol: string): Promise<FAData> {
  const normSymbol = symbol.toUpperCase();
  
  // 1. Fetch Binance 24h Ticker
  let price = 0, high24h = 0, low24h = 0, volume24h = 0, priceChange24h = 0;
  try {
    const tickerRes = await fetch(`${BINANCE_FAPI_URL}/ticker/24hr?symbol=${normSymbol}`);
    if (tickerRes.ok) {
      const tickerData = await tickerRes.json();
      price = parseFloat(tickerData.lastPrice);
      high24h = parseFloat(tickerData.highPrice);
      low24h = parseFloat(tickerData.lowPrice);
      volume24h = parseFloat(tickerData.quoteVolume);
      priceChange24h = parseFloat(tickerData.priceChangePercent);
    }
  } catch (err) {
    console.error("Failed to fetch 24h ticker:", err);
  }

  // 2. Fetch Open Interest & Funding Rate
  let openInterest = 0;
  let fundingRate = 0;
  try {
    const [oiRes, frRes] = await Promise.all([
      fetch(API_BASE + `/api/binance/openInterest?symbol=${normSymbol}`),
      fetch(API_BASE + `/api/binance/premiumIndex?symbol=${normSymbol}`)
    ]);
    if (oiRes.ok) {
      const oiData = await oiRes.json();
      openInterest = parseFloat(oiData.openInterest) * price; // roughly in USD
    }
    if (frRes.ok) {
      const frData = await frRes.json();
      fundingRate = parseFloat(frData.lastFundingRate) * 100; // as percentage
    }
  } catch (err) {
    console.error("Failed to fetch OI/FR:", err);
  }

  // Combine real data with smart mocks for missing data
  const mockData = generateMockData(symbol, price || 60000, volume24h || 1000000000);

  return {
    price,
    high24h,
    low24h,
    volume24h,
    priceChange24h,
    openInterest,
    fundingRate,
    volumeToMcap: mockData.marketCap ? (volume24h / mockData.marketCap) * 100 : 0,
    ...mockData,
  } as FAData;
}
