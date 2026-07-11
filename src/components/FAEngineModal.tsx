import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { fetchFAData, FAData } from '../services/faEngine';

interface FAEngineModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeSymbol: string;
}

export const FAEngineModal: React.FC<FAEngineModalProps> = ({ isOpen, onClose, activeSymbol }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<FAData | null>(null);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      
      const loadData = async () => {
        const result = await fetchFAData(activeSymbol);
        setData(result);
        
        // Add a slight artificial delay for the "processing" effect
        setTimeout(() => {
          setLoading(false);
        }, 1500);
      };

      loadData();
    }
  }, [isOpen, activeSymbol]);

  if (!isOpen) return null;

  const formatCurrency = (val: number | null | undefined) => {
    if (val === null || val === undefined) return 'N/A';
    if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
    if (val >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
    return `$${val.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  };

  const formatNumber = (val: number | null | undefined) => {
    if (val === null || val === undefined) return 'N/A';
    return val.toLocaleString(undefined, { maximumFractionDigits: 0 });
  };

  const getScoreInfo = (d: FAData) => {
    let score = 50; // base score
    if (d.priceChange24h > 0) score += 10;
    else if (d.priceChange24h < 0) score -= 10;
    
    if (d.fundingRate > 0.01) score += 5;
    else if (d.fundingRate < 0) score -= 5;
    
    if (d.change7d > 0) score += 15;
    else score -= 10;

    score = Math.max(0, Math.min(100, Math.round(score)));

    let status = "HOLD ✋";
    let color = "text-amber-500";
    if (score > 75) { status = "STRONG BUY 🚀"; color = "text-emerald-500"; }
    else if (score > 60) { status = "BUY 🛒"; color = "text-emerald-400"; }
    else if (score < 25) { status = "STRONG SELL 💥"; color = "text-rose-500"; }
    else if (score < 40) { status = "SELL 📉"; color = "text-rose-400"; }

    return { score, status, color };
  };

  const scoreInfo = data ? getScoreInfo(data) : { score: 50, status: "HOLD ✋", color: "text-amber-500" };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#0b0e14] border border-[#141a22] rounded-xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-[#141a22]">
          <div className="flex items-center gap-3">
            <div className="flex gap-0.5 items-end h-6 bg-slate-800/50 p-1 rounded">
              <div className="w-1.5 h-3 bg-emerald-400 rounded-sm"></div>
              <div className="w-1.5 h-4 bg-rose-400 rounded-sm"></div>
              <div className="w-1.5 h-2 bg-blue-400 rounded-sm"></div>
            </div>
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                {activeSymbol} — FA Engine
              </h2>
              <p className="text-xs text-slate-500">Ultimate Fundamental & Orderflow Confluence Tool</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-500 hover:text-white transition-colors p-1"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col">
          {loading || !data ? (
            <div className="flex-1 flex items-center justify-center min-h-[300px]">
              <div className="text-blue-400/80 text-lg flex items-center gap-2 font-medium">
                Fetching Real-time Data & Processing Algorithm... ⏳
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              
              {/* Score Box */}
              <div className={`border rounded-xl p-8 bg-[#0b0e14] flex flex-col items-center justify-center border-amber-500/50`}>
                <div className={`text-5xl font-black tracking-tight ${scoreInfo.color}`}>{scoreInfo.score} / 100</div>
                <div className={`text-xl font-bold mt-2 uppercase tracking-widest flex items-center gap-2 ${scoreInfo.color}`}>
                  {scoreInfo.status}
                </div>
                <div className="text-sm text-slate-400 mt-3 font-medium">FA + OFA Algorithm Result</div>
              </div>

              {/* Grid Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                {/* Panel 1 */}
                <div className="bg-[#11161d] rounded-xl p-5 flex flex-col">
                  <div className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                    💰 PRICE & VALUATION
                  </div>
                  <div className="flex flex-col gap-3 flex-1">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">Price:</span>
                      <span className="text-white font-bold">{formatCurrency(data.price)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">Market Cap:</span>
                      <span className="text-white font-bold">{formatCurrency(data.marketCap)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">FDV (Diluted):</span>
                      <span className="text-white font-bold">{formatCurrency(data.fdv)}</span>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-800/50 text-xs text-slate-500 leading-relaxed">
                    Market Cap/FDV Ratio indicates inflation risk.
                  </div>
                </div>

                {/* Panel 2 */}
                <div className="bg-[#11161d] rounded-xl p-5 flex flex-col">
                  <div className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                    🪙 TOKENOMICS
                  </div>
                  <div className="flex flex-col gap-3 flex-1">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">Circulating Supply:</span>
                      <span className="text-white font-bold">{formatNumber(data.circulatingSupply)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">Max Supply:</span>
                      <span className="text-white font-bold">{data.maxSupply ? formatNumber(data.maxSupply) : '∞'}</span>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-800/50 text-xs text-slate-500 leading-relaxed">
                    Higher circulating ratio = Lower dump risk.
                  </div>
                </div>

                {/* Panel 3 */}
                <div className="bg-[#11161d] rounded-xl p-5 flex flex-col">
                  <div className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                    👨‍💻 DEV & COMMUNITY
                  </div>
                  <div className="flex flex-col gap-3 flex-1">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">GitHub Commits (4w):</span>
                      <span className="text-white font-bold">{formatNumber(data.githubCommits)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">Reddit Subs:</span>
                      <span className="text-white font-bold">{formatNumber(data.redditSubs)}</span>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-800/50 text-xs text-slate-500 leading-relaxed">
                    Active devs = Project is alive and building.
                  </div>
                </div>

                {/* Panel 4 */}
                <div className="bg-[#11161d] rounded-xl p-5 flex flex-col">
                  <div className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                    🌊 ORDERFLOW PRESSURE (EST)
                  </div>
                  <div className="flex flex-col gap-3 flex-1">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">24h Vol / Mcap:</span>
                      <span className="text-white font-bold">{data.volumeToMcap.toFixed(2)}%</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">24h Price Change:</span>
                      <span className={`font-bold ${data.priceChange24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {data.priceChange24h > 0 ? '+' : ''}{data.priceChange24h.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-800/50 text-xs text-slate-500 leading-relaxed">
                    High Vol + Up Price = Strong Buy Pressure.
                  </div>
                </div>

                {/* Panel 5 */}
                <div className="bg-[#11161d] rounded-xl p-5 flex flex-col">
                  <div className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                    📈 MACRO TREND
                  </div>
                  <div className="flex flex-col gap-3 flex-1">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">7D Change:</span>
                      <span className={`font-bold ${data.change7d >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {data.change7d > 0 ? '+' : ''}{data.change7d.toFixed(2)}%
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">30D Change:</span>
                      <span className={`font-bold ${data.change30d >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {data.change30d > 0 ? '+' : ''}{data.change30d.toFixed(2)}%
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">From ATH:</span>
                      <span className={`font-bold text-rose-400`}>
                        {data.fromATH.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-800/50 text-xs text-slate-500 leading-relaxed">
                    Macro trends show long-term momentum.
                  </div>
                </div>

                {/* Panel 6 */}
                <div className="bg-[#11161d] rounded-xl p-5 flex flex-col">
                  <div className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                    🌐 SOCIAL SENTIMENT
                  </div>
                  <div className="flex flex-col gap-3 flex-1">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">Twitter Followers:</span>
                      <span className="text-white font-bold">{data.twitterFollowers ? formatNumber(data.twitterFollowers) : 'N/A'}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">Telegram Users:</span>
                      <span className="text-white font-bold">{data.telegramUsers ? formatNumber(data.telegramUsers) : 'N/A'}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">Coingecko Rank:</span>
                      <span className="text-white font-bold">{data.coingeckoRank ? `#${data.coingeckoRank}` : 'N/A'}</span>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-800/50 text-xs text-slate-500 leading-relaxed">
                    Social engagement indicates retail interest.
                  </div>
                </div>

                {/* Panel 7 */}
                <div className="bg-[#11161d] rounded-xl p-5 flex flex-col">
                  <div className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                    🛡️ INSTITUTIONAL & DEFI
                  </div>
                  <div className="flex flex-col gap-3 flex-1">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">Total Value Locked:</span>
                      <span className="text-white font-bold">{formatCurrency(data.tvl)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">Mcap/TVL Ratio:</span>
                      <span className="text-white font-bold">{data.mcapTvlRatio ? data.mcapTvlRatio.toFixed(2) : 'N/A'}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">Liquidity Score:</span>
                      <span className="text-white font-bold">{data.liquidityScore || 'N/A'}</span>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-800/50 text-xs text-slate-500 leading-relaxed">
                    Mcap/TVL {'<'} 1 indicates undervalued DeFi projects.
                  </div>
                </div>

                {/* Panel 8 */}
                <div className="bg-[#11161d] rounded-xl p-5 flex flex-col">
                  <div className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                    📊 PROFILE & RANGES
                  </div>
                  <div className="flex flex-col gap-3 flex-1">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">Genesis Date:</span>
                      <span className="text-white font-bold">{data.genesisDate || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">24h High:</span>
                      <span className="text-emerald-400 font-bold">{formatCurrency(data.high24h)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">24h Low:</span>
                      <span className="text-rose-400 font-bold">{formatCurrency(data.low24h)}</span>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-800/50 text-xs text-slate-500 leading-relaxed">
                    24h ranges help identify short-term volatility.
                  </div>
                </div>

                {/* Panel 9 */}
                <div className="bg-[#11161d] rounded-xl p-5 flex flex-col">
                  <div className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                    ⚡ OPEN INTEREST & FUNDING
                  </div>
                  <div className="flex flex-col gap-3 flex-1">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">Open Interest (OI):</span>
                      <span className="text-white font-bold">{formatCurrency(data.openInterest)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">OI Change (24h):</span>
                      <span className={`font-bold ${data.oiChange24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {data.oiChange24h > 0 ? '+' : ''}{data.oiChange24h.toFixed(2)}%
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">Funding Rate:</span>
                      <span className={`font-bold ${data.fundingRate > 0.01 ? 'text-amber-500' : 'text-emerald-400'}`}>
                        {data.fundingRate.toFixed(4)}%
                      </span>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-800/50 flex justify-between items-center">
                    <span className="text-amber-500 font-bold text-sm">🔥 Smart Money OI Wall:</span>
                    <div className="flex flex-col items-end">
                      <span className="text-white font-bold text-sm">{formatCurrency(data.smartMoneyOiWall)}</span>
                      <span className="bg-rose-900/50 text-rose-400 text-[10px] font-bold px-1 rounded">
                        SELL WALL | {formatCurrency(data.sellWallValue)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Panel 10 */}
                <div className="bg-[#11161d] rounded-xl p-5 flex flex-col">
                  <div className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                    ⚖️ SMART MONEY VS RETAIL
                  </div>
                  <div className="flex flex-col gap-3 flex-1">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">Retail L/S Ratio:</span>
                      <span className="text-orange-500 font-bold">{data.retailLsRatio?.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">Taker Buy/Sell (CVD):</span>
                      <span className="text-orange-500 font-bold">{data.takerBuySellRatio?.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">Orderbook Imbalance:</span>
                      <span className="text-orange-500 font-bold">{data.orderbookImbalance}</span>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-800/50 text-xs text-slate-500 leading-relaxed">
                    If L/S {'>'} 2.5, retail is trapped. Smart money will flush them.
                  </div>
                </div>

              </div>

              {/* Sinhala Analysis Block */}
              <div className="bg-[#11161d] rounded-xl p-5 border border-slate-800/50 mt-2">
                <div className="text-lg font-bold text-white mb-3 flex items-center gap-2">
                  🤖 AI සිංහල විශ්ලේෂණය (Analysis Summary)
                </div>
                <div className="text-slate-300 text-sm mb-4 leading-relaxed">
                  <span className="font-bold text-white">{activeSymbol.replace('USDT', '')} ({activeSymbol})</span> කාසියේ වර්තමාන තත්ත්වය මෙසේය:
                </div>
                
                <div className="flex flex-col gap-4">
                  <div className="flex items-start gap-2">
                    <span className="text-amber-500 mt-0.5">
                      {scoreInfo.score > 60 ? '🚀' : scoreInfo.score < 40 ? '💥' : '✋'}
                    </span>
                    <span className="text-slate-300 text-sm leading-relaxed">
                      <strong className="text-white">අවසාන නිගමනය:</strong> 
                      {scoreInfo.score > 60 
                        ? ' මේ මොහොතේ අලුතින් Trade කිරීම (Buy) වඩාත් සුදුසුය. වෙළඳපොළේ හොඳ ඉහළ යාමක් පෙන්වයි.' 
                        : scoreInfo.score < 40 
                        ? ' මේ මොහොතේ මිලදී ගැනීමෙන් වලකින්න (Sell/Short). වෙළඳපොළේ අවදානමක් පවතී.' 
                        : ' මේ මොහොතේ අලුතින් Trade නොකර බලා සිටීම (Hold) වඩාත් සුදුසුය.'}
                    </span>
                  </div>
                  
                  <div className="flex items-start gap-2">
                    <span className="text-blue-500 mt-0.5">🔹</span>
                    <span className="text-slate-300 text-sm leading-relaxed">
                      <strong className="text-white">Tokenomics:</strong> 
                      {data.maxSupply && data.circulatingSupply / data.maxSupply > 0.9
                        ? ' මෙහි Market Cap එක සහ FDV එක බොහෝ දුරට සමාන බැවින් අලුතින් කාසි වෙළඳපොලට පැමිණ මිල කඩා වැටීමේ (Inflation / Dump) අවදානම ඉතා අඩුය.'
                        : ' මෙහි Market Cap සහ FDV අතර වෙනසක් ඇති බැවින් ඉදිරියේදී කාසි අලුතින් පැමිණීමේ අවදානමක් පවතී.'}
                    </span>
                  </div>
                  
                  <div className="flex items-start gap-2">
                    <span className="text-blue-500 mt-0.5">🔹</span>
                    <span className="text-slate-300 text-sm leading-relaxed">
                      <strong className="text-white">Volume (මුදල් ගලායාම):</strong> 
                      {data.volumeToMcap > 5
                        ? ` මේ මොහොතේ වෙළඳපොළ තුළ ඉතා විශාල උනන්දුවක් සහ Volume එකක් (${data.volumeToMcap.toFixed(2)}%) දක්නට ලැබේ.`
                        : ' මේ මොහොතේ වෙළඳපොළ තුළ ලොකු උනන්දුවක් හෝ Volume එකක් දක්නට නොලැබේ.'}
                    </span>
                  </div>

                  <div className="flex items-start gap-2">
                    <span className="text-blue-500 mt-0.5">🔹</span>
                    <span className="text-slate-300 text-sm leading-relaxed">
                      <strong className="text-white">Retail vs Smart Money:</strong> 
                      {data.retailLsRatio && data.retailLsRatio > 2.5
                        ? ' සාමාන්‍ය වෙළෙන්දන් (Retail Traders) විශාල වශයෙන් Long කර ඇති නිසා, Smart Money විසින් පහළට ගෙන ගොස් ඔවුන්ව Liquidation වීමට ලක් කිරීමේ දැඩි අවදානමක් ඇත.'
                        : data.retailLsRatio && data.retailLsRatio < 0.8
                        ? ' සාමාන්‍ය වෙළෙන්දන් බොහෝ දෙනෙක් Short කර ඇති බැවින්, මිල ඉහළට ගොස් ඔවුන්ව Liquidation (Short Squeeze) වීමේ සම්භාවිතාව වැඩිය.'
                        : ' මේ මොහොතේ සාමාන්‍ය වෙළෙන්දන් සහ Smart Money අතර විශාල අසමතුලිතතාවයක් නොමැත.'}
                    </span>
                  </div>

                  <div className="flex items-start gap-2">
                    <span className="text-blue-500 mt-0.5">🔹</span>
                    <span className="text-slate-300 text-sm leading-relaxed">
                      <strong className="text-white">Funding Rate & OI:</strong> 
                      {data.fundingRate > 0.02 && data.oiChange24h > 2
                        ? ' Funding Rate එක සහ OI එක ඉහළ යාමෙන් පෙනෙන්නේ වෙළඳපොළ තුළ විශාල Long කරුවන් පිරිසක් සිටින බවයි. හදිසි පහත වැටීමක් (Dump) ගැන විමසිලිමත් වන්න.'
                        : data.fundingRate < 0 && data.oiChange24h > 2
                        ? ' Funding Rate එක ඍණ අගයක් ගැනීමෙන් පෙනෙන්නේ බොහෝ දෙනෙක් Short කර ඇති බවයි. මිල ඉහළ යාමේ (Pump) ලක්ෂණ ඇත.'
                        : ' Funding Rate සහ OI සාමාන්‍ය මට්ටමක පවතී.'}
                    </span>
                  </div>
                </div>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
};
