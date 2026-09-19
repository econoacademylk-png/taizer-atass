import React, { useEffect, useState } from 'react';
import { useLEZStore } from '../stores/useLEZStore';
import { useTrading } from '../stores/useTradingStore';
import { X, TrendingUp, TrendingDown, ArrowRight, Zap } from 'lucide-react';

export const LEZAlertToast: React.FC = () => {
  const { latestAlert, clearLatestAlert } = useLEZStore();
  const { setActiveSymbol, setIndicators } = useTrading();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (latestAlert) {
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
        clearLatestAlert();
      }, 10000); // Auto-dismiss after 10s
      return () => clearTimeout(timer);
    } else {
      setVisible(false);
    }
  }, [latestAlert, clearLatestAlert]);

  if (!visible || !latestAlert) return null;

  const isBuy = latestAlert.type === 'buy';

  const handleGoToCoin = () => {
    setActiveSymbol(latestAlert.symbol);
    // Ensure LEZ indicator is enabled so they can immediately see the signal on chart
    setIndicators(prev => ({ ...prev, showLEZ: true }));
    setVisible(false);
    clearLatestAlert();
  };

  return (
    <div className="fixed top-14 right-4 z-[9999] max-w-sm w-full animate-bounce-short select-none">
      <div 
        className={`rounded-xl border p-4 shadow-2xl backdrop-blur-xl transition-all duration-300 ${
          isBuy 
            ? 'bg-[#06140e]/95 border-emerald-500/80 shadow-[0_0_30px_rgba(16,185,129,0.35)]' 
            : 'bg-[#18090b]/95 border-rose-500/80 shadow-[0_0_30px_rgba(244,63,94,0.35)]'
        }`}
      >
        {/* Header line */}
        <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-2 mb-2.5">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isBuy ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isBuy ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
            </span>
            <span className="text-[11px] font-extrabold uppercase tracking-widest text-slate-300 font-mono flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
              NEW LEZ SIGNAL
            </span>
            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono">
              &lt; 2m FRESH
            </span>
          </div>

          <button 
            onClick={() => {
              setVisible(false);
              clearLatestAlert();
            }}
            className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800/50 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <div className="text-base font-black text-white font-mono tracking-wide">
              {latestAlert.symbol}
            </div>
            <div className="text-[10px] text-slate-400 font-mono">
              Timeframe: <span className="text-slate-200 font-bold">{latestAlert.timeframe}</span>
            </div>
          </div>

          <div className={`px-2.5 py-1 rounded-lg font-mono font-black text-xs flex items-center gap-1.5 shadow-md ${
            isBuy 
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50' 
              : 'bg-rose-500/20 text-rose-300 border border-rose-500/50'
          }`}>
            {isBuy ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            <span>{isBuy ? 'BUY' : 'SELL'}</span>
            <span className="text-[9px] opacity-80 border-l border-current pl-1 ml-0.5">
              Q:{latestAlert.qualityScore}
            </span>
          </div>
        </div>

        {/* Trade Details (Entry, TP, SL) */}
        <div className="grid grid-cols-3 gap-1.5 bg-black/40 rounded-lg p-2 border border-slate-800/60 font-mono text-[10px] mb-3">
          <div>
            <span className="text-slate-400 text-[8.5px] block uppercase">Entry</span>
            <span className="font-bold text-sky-300">${latestAlert.entryPrice.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
          </div>
          <div>
            <span className="text-slate-400 text-[8.5px] block uppercase">Target (TP)</span>
            <span className="font-bold text-emerald-400">${latestAlert.tpPrice.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
          </div>
          <div>
            <span className="text-slate-400 text-[8.5px] block uppercase">Stop (SL)</span>
            <span className="font-bold text-rose-400">${latestAlert.slPrice.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
          </div>
        </div>

        {/* 1-Click Action Button */}
        <button
          onClick={handleGoToCoin}
          className={`w-full py-2 px-3 rounded-lg font-mono font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all shadow-lg ${
            isBuy
              ? 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-emerald-500/30'
              : 'bg-rose-500 hover:bg-rose-400 text-white shadow-rose-500/30'
          }`}
        >
          <span>VIEW {latestAlert.symbol} CHART</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
