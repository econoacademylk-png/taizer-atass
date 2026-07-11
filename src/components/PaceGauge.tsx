import React from 'react';
import { useTrading } from '../stores/useTradingStore';

export const PaceGauge: React.FC = () => {
  const { domState, indicators } = useTrading();

  if (!indicators.showPace) return null;

  // Approximate true TPS based on the decay formula (1 / 3.33 ≈ 0.3)
  const rawTps = domState.orderFlowSpeed || 0;
  const displayTps = (rawTps * 0.3).toFixed(1);

  // Calculate progress for the gauge (max 50 TPS)
  const maxTps = 50;
  const rawProgress = Number(displayTps) / maxTps;
  const progress = Math.min(Math.max(rawProgress, 0), 1);
  const strokeWidth = 10;

  // Determine color based on speed
  const color = progress > 0.8 ? '#ef4444' : progress > 0.4 ? '#f59e0b' : '#10b981';

  return (
    <div className="absolute bottom-24 left-4 z-[100] bg-[#0b0e14]/80 backdrop-blur-sm border border-[#141a22] rounded shadow-xl flex flex-col items-center justify-center p-4 pointer-events-none select-none">
      <div className="relative w-32 h-[4.5rem] flex items-end justify-center overflow-hidden">
        {/* SVG Gauge */}
        <svg viewBox="0 0 100 50" className="absolute top-0 left-0 w-full h-full overflow-visible">
          {/* Background Arc */}
          <path
            d="M 10 50 A 40 40 0 0 1 90 50"
            fill="none"
            stroke="#2a2e39"
            strokeWidth={strokeWidth}
            strokeLinecap="square"
          />
          {/* Foreground Arc */}
          <path
            d="M 10 50 A 40 40 0 0 1 90 50"
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="square"
            pathLength="100"
            strokeDasharray="100"
            strokeDashoffset={100 - progress * 100}
            className="transition-all duration-300 ease-out"
          />
        </svg>
        {/* Text Content */}
        <div className="flex flex-col items-center z-10 -mb-1">
          <span className="text-white font-black text-2xl font-mono leading-none tracking-tight">{displayTps}</span>
          <span className="text-gray-400 font-bold text-xs mt-1 uppercase tracking-widest">TPS</span>
        </div>
      </div>
    </div>
  );
};
