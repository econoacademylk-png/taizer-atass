import React, { useState, useEffect } from 'react';
import { useLEZStore } from '../stores/useLEZStore';
import { useTrading } from '../stores/useTradingStore';
import { 
  X, 
  Volume2, 
  VolumeX, 
  RefreshCw, 
  Zap, 
  TrendingUp, 
  TrendingDown, 
  ArrowUpRight, 
  Clock,
  Radio,
  Flame
} from 'lucide-react';

interface LEZSignalsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LEZSignalsModal: React.FC<LEZSignalsModalProps> = ({ isOpen, onClose }) => {
  const { 
    signals, 
    freshSignals, 
    isScanning, 
    currentlyScanning, 
    soundEnabled, 
    scanTimeframe,
    toggleSound, 
    setScanTimeframe,
    triggerScan 
  } = useLEZStore();
  
  const { setActiveSymbol, setIndicators, activeSymbol } = useTrading();
  const [filter, setFilter] = useState<'all' | 'fresh' | 'buy' | 'sell'>('all');
  const [, setNowTick] = useState(Date.now());

  // Update time elapsed tickers every 10 seconds
  useEffect(() => {
    if (!isOpen) return;
    const timer = setInterval(() => setNowTick(Date.now()), 10000);
    return () => clearInterval(timer);
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredSignals = signals.filter((s) => {
    const ageMs = Date.now() - s.time;
    if (filter === 'fresh') return ageMs <= 2 * 60 * 1000;
    if (filter === 'buy') return s.type === 'buy';
    if (filter === 'sell') return s.type === 'sell';
    return true;
  });

  const formatAge = (time: number) => {
    const diffSec = Math.max(0, Math.floor((Date.now() - time) / 1000));
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    return `${diffHours}h ${diffMin % 60}m ago`;
  };

  const handleSelectCoin = (symbol: string) => {
    setActiveSymbol(symbol);
    setIndicators(prev => ({ ...prev, showLEZ: true }));
    onClose();
  };

  const buyCount = signals.filter(s => s.type === 'buy').length;
  const sellCount = signals.filter(s => s.type === 'sell').length;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md select-none animate-in fade-in duration-200">
      <div 
        className="w-full max-w-2xl bg-[#070b10] border border-cyan-500/40 rounded-2xl shadow-[0_0_50px_rgba(6,182,212,0.2)] flex flex-col overflow-hidden max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800/80 bg-slate-900/40 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.3)]">
                <Zap className="w-4 h-4 fill-cyan-400" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-extrabold text-white font-mono tracking-wider flex items-center gap-2">
                  LEZ SIGNALS RADAR
                  <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    LIVE
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400 font-mono">
                  Real-time Liquidity Entry Zone triggers across Binance Market
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Sound Toggle */}
              <button
                onClick={toggleSound}
                className={`p-2 rounded-lg border transition-all cursor-pointer ${
                  soundEnabled 
                    ? 'border-cyan-500/60 bg-cyan-500/10 text-cyan-400' 
                    : 'border-slate-800 bg-slate-900 text-slate-500'
                }`}
                title={soundEnabled ? "Sound Alerts: ON" : "Sound Alerts: MUTED"}
              >
                {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>

              {/* Manual Scan button */}
              <button
                onClick={() => triggerScan()}
                disabled={isScanning}
                className="p-2 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 transition-all cursor-pointer disabled:opacity-50"
                title="Scan Now"
              >
                <RefreshCw className={`w-4 h-4 ${isScanning ? 'animate-spin text-cyan-400' : ''}`} />
              </button>

              {/* Close button */}
              <button
                onClick={onClose}
                className="p-2 rounded-lg border border-slate-800 bg-slate-900 hover:bg-rose-500/20 hover:text-rose-400 text-slate-400 transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Sub-bar: Scanning Status & Timeframe Selector */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/50 text-[11px] font-mono">
            <div className="flex items-center gap-2 text-slate-400">
              <Radio className={`w-3.5 h-3.5 ${isScanning ? 'text-cyan-400 animate-pulse' : 'text-slate-600'}`} />
              <span>
                {isScanning 
                  ? `Scanning: ${currentlyScanning || 'Checking pairs...'}` 
                  : 'Monitoring 25+ Binance USDT Pairs'}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 text-[10px] uppercase">Timeframe:</span>
              {['1m', '5m', '15m'].map((tf) => (
                <button
                  key={tf}
                  onClick={() => setScanTimeframe(tf)}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                    scanTimeframe === tf
                      ? 'bg-cyan-500 text-black shadow-[0_0_8px_rgba(6,182,212,0.4)]'
                      : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 p-3 border-b border-slate-800/80 bg-slate-950/60 font-mono text-[11px] overflow-x-auto">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer whitespace-nowrap ${
              filter === 'all'
                ? 'bg-slate-800 text-white border border-slate-700'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            All Signals ({signals.length})
          </button>

          <button
            onClick={() => setFilter('fresh')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              filter === 'fresh'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.2)]'
                : 'text-amber-400/80 hover:text-amber-300'
            }`}
          >
            <Flame className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
            <span>Fresh &lt; 2m ({freshSignals.length})</span>
          </button>

          <button
            onClick={() => setFilter('buy')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              filter === 'buy'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50'
                : 'text-emerald-400/80 hover:text-emerald-300'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>BUY ({buyCount})</span>
          </button>

          <button
            onClick={() => setFilter('sell')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
              filter === 'sell'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/50'
                : 'text-rose-400/80 hover:text-rose-300'
            }`}
          >
            <TrendingDown className="w-3.5 h-3.5" />
            <span>SELL ({sellCount})</span>
          </button>
        </div>

        {/* Signals List */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2.5 custom-scrollbar">
          {filteredSignals.length > 0 ? (
            filteredSignals.map((signal) => {
              const isBuy = signal.type === 'buy';
              const ageMs = Date.now() - signal.time;
              const isFresh = ageMs <= 2 * 60 * 1000;
              const isCurrent = activeSymbol === signal.symbol;

              return (
                <div
                  key={signal.id}
                  onClick={() => handleSelectCoin(signal.symbol)}
                  className={`group relative rounded-xl border p-3.5 transition-all duration-200 cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isFresh
                      ? isBuy
                        ? 'bg-[#081812]/80 border-emerald-500/60 shadow-[0_0_20px_rgba(16,185,129,0.15)] hover:border-emerald-400'
                        : 'bg-[#1a0c0f]/80 border-rose-500/60 shadow-[0_0_20px_rgba(244,63,94,0.15)] hover:border-rose-400'
                      : 'bg-slate-900/40 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/70'
                  } ${isCurrent ? 'ring-1 ring-cyan-400' : ''}`}
                >
                  {/* Left info */}
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold shrink-0 ${
                      isBuy ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/40' : 'bg-rose-500/15 text-rose-400 border border-rose-500/40'
                    }`}>
                      {isBuy ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-sm text-white tracking-wide">
                          {signal.symbol}
                        </span>
                        
                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded font-mono ${
                          isBuy ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/40' : 'bg-rose-500/25 text-rose-300 border border-rose-500/40'
                        }`}>
                          {isBuy ? 'BUY' : 'SELL'}
                        </span>

                        <span className="text-[9px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
                          Q:{signal.qualityScore}
                        </span>

                        {isFresh && (
                          <span className="flex items-center gap-1 text-[9px] font-black font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/50 animate-pulse">
                            <Flame className="w-3 h-3 fill-amber-400" />
                            &lt; 2M
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400 mt-1">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-500" />
                          {formatAge(signal.time)}
                        </span>
                        <span>•</span>
                        <span>TF: {signal.timeframe}</span>
                        {isCurrent && (
                          <span className="text-cyan-400 font-bold">• (Currently Viewing)</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Middle: Entry, TP, SL */}
                  <div className="grid grid-cols-3 gap-2 font-mono text-[10px] bg-black/40 px-3 py-2 rounded-lg border border-slate-800/60 shrink-0">
                    <div>
                      <span className="text-slate-500 block text-[8px] uppercase">Entry</span>
                      <span className="font-bold text-sky-300">${signal.entryPrice.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[8px] uppercase">Target (TP)</span>
                      <span className="font-bold text-emerald-400">${signal.tpPrice.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[8px] uppercase">Stop (SL)</span>
                      <span className="font-bold text-rose-400">${signal.slPrice.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
                    </div>
                  </div>

                  {/* Right Action Button */}
                  <div className="shrink-0 flex sm:justify-end">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectCoin(signal.symbol);
                      }}
                      className={`w-full sm:w-auto px-3 py-2 rounded-lg font-mono font-bold text-[11px] flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                        isBuy
                          ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500 hover:text-black border border-emerald-500/40'
                          : 'bg-rose-500/20 text-rose-300 hover:bg-rose-500 hover:text-white border border-rose-500/40'
                      }`}
                    >
                      <span>VIEW CHART</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-12 flex flex-col items-center justify-center text-center p-4">
              <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 mb-3">
                <Zap className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-300 font-mono mb-1">
                {filter === 'fresh' ? 'No Fresh Signals (< 2m) Right Now' : 'No Active LEZ Signals Found'}
              </h4>
              <p className="text-xs text-slate-500 font-mono max-w-sm mb-4">
                The scanner runs every 25s across top coins & your favorites. As soon as a fresh liquidity sweep triggers, it will alert you here immediately!
              </p>
              <button
                onClick={() => triggerScan()}
                disabled={isScanning}
                className="px-4 py-2 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 font-mono text-xs font-bold flex items-center gap-2 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
                <span>{isScanning ? 'Scanning Now...' : 'Force Scan Now'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-800/80 bg-slate-950 flex items-center justify-between text-[10px] font-mono text-slate-500">
          <span>Priority: Favorite Coins &bull; Auto-refresh every 25s</span>
          <span className="text-slate-400">LEZ Algorithm: Liquidity Sweeps + Confirmation</span>
        </div>
      </div>
    </div>
  );
};
