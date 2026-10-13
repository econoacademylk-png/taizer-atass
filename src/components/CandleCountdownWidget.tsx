/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useTrading } from '../stores/useTradingStore';
import { MTF_TIMEFRAMES, getCandleTimeRemaining } from '../utils/candleCountdown';
import { Clock, ChevronDown, ChevronUp, Layers, CheckCircle2 } from 'lucide-react';

interface CandleCountdownWidgetProps {
  isOpen?: boolean;
  onToggle?: () => void;
}

export const CandleCountdownWidget: React.FC<CandleCountdownWidgetProps> = () => {
  const { activeTimeframe, setActiveTimeframe } = useTrading();
  const [isMinimized, setIsMinimized] = useState<boolean>(() => {
    return localStorage.getItem('candle_timer_minimized') === 'true';
  });
  const [currentTime, setCurrentTime] = useState<number>(Date.now());

  // High-precision 1-second interval to keep timers ticking in sync
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const toggleMinimize = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIsMinimized((prev) => {
      const next = !prev;
      localStorage.setItem('candle_timer_minimized', String(next));
      return next;
    });
  };

  const activeInfo = getCandleTimeRemaining(activeTimeframe, currentTime);

  return (
    <div
      id="candle-countdown-widget"
      className="absolute top-4 right-[95px] z-30 select-none font-sans"
    >
      {isMinimized ? (
        // Compact Pill Mode
        <button
          onClick={toggleMinimize}
          className="bg-[#06080b]/92 hover:bg-[#0c1017] border border-[#1e293b]/90 hover:border-emerald-500/50 text-slate-200 px-3 py-1.5 rounded-lg shadow-[0_4px_20px_rgba(0,0,0,0.8)] backdrop-blur-md flex items-center gap-2 text-xs transition-all active:scale-95 cursor-pointer group"
          title="Click to expand Multi-Timeframe Candle Timers (1m, 5m, 15m, 1h, 4h, 1d)"
        >
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <Clock className="w-3.5 h-3.5 text-emerald-400 group-hover:rotate-45 transition-transform" />
          <span className="font-mono font-bold text-emerald-400 text-[11px]">
            {activeTimeframe.toUpperCase()}
          </span>
          <span className="font-mono text-white font-semibold text-[11px]">
            {activeInfo.formatted}
          </span>
          <span className="text-[10px] text-slate-500 font-medium ml-1">MTF</span>
          <ChevronDown className="w-3 h-3 text-slate-400 group-hover:text-white" />
        </button>
      ) : (
        // Full Multi-Timeframe Dashboard
        <div className="bg-[#06080b]/95 border border-[#1e293b] rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.9)] backdrop-blur-md p-3 w-[220px] transition-all flex flex-col gap-2 font-mono">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[11px] font-bold tracking-wider text-slate-200 uppercase font-sans">
                Candle Timers
              </span>
            </div>
            <button
              onClick={toggleMinimize}
              className="p-1 hover:bg-slate-800/80 rounded text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="Minimize to pill"
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Timeframe rows: 1m, 5m, 15m, 1h, 4h, 1d */}
          <div className="flex flex-col gap-1.5">
            {MTF_TIMEFRAMES.map((tf) => {
              const info = getCandleTimeRemaining(tf, currentTime);
              const isActive = activeTimeframe.toLowerCase() === tf.toLowerCase();
              const progressPct = Math.round(info.progress * 100);

              return (
                <div
                  key={tf}
                  onClick={() => setActiveTimeframe(tf)}
                  className={`group relative flex flex-col px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer ${
                    isActive
                      ? 'bg-emerald-950/30 border-emerald-500/50 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
                      : 'bg-slate-950/50 border-slate-800/60 hover:bg-slate-900/60 hover:border-slate-700'
                  }`}
                  title={`Switch chart to ${tf.toUpperCase()} timeframe`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`font-bold text-[11px] px-1.5 py-0.5 rounded ${
                          isActive
                            ? 'bg-emerald-500 text-black font-extrabold'
                            : 'bg-slate-800 text-slate-300 group-hover:text-white'
                        }`}
                      >
                        {tf.toUpperCase()}
                      </span>
                      {isActive && (
                        <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-wider font-sans">
                          Active
                        </span>
                      )}
                    </div>
                    <span
                      className={`font-mono text-[11px] font-bold ${
                        isActive ? 'text-emerald-300' : 'text-slate-200 group-hover:text-emerald-400'
                      }`}
                    >
                      {info.formatted}
                    </span>
                  </div>

                  {/* Candle Progress Bar */}
                  <div className="w-full bg-slate-900 h-1 rounded-full overflow-hidden mt-1.5 border border-slate-800/50">
                    <div
                      className={`h-full transition-all duration-300 rounded-full ${
                        isActive
                          ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                          : 'bg-slate-600 group-hover:bg-slate-400'
                      }`}
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer Status */}
          <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-[9px] text-slate-500 font-sans">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Synced UTC
            </span>
            <span className="text-slate-400 font-mono">1s Refresh</span>
          </div>
        </div>
      )}
    </div>
  );
};
