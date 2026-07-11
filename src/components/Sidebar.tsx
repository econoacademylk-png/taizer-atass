/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTrading } from '../stores/useTradingStore';
import { 
  MousePointer, 
  Minus, 
  TrendingUp, 
  Square, 
  TrendingDown, 
  Trash2, 
  Activity, 
  BarChart4, 
  RotateCw, 
  Sparkles,
  HelpCircle,
  HelpCircle as HelpIcon,
  BookOpen,
  Circle,
  Triangle,
  Type,
  Tag,
  PenTool,
  Ruler,
  Maximize2
} from 'lucide-react';
import { DrawingType } from '../types/chart';

export const Sidebar: React.FC = () => {
  const {
    activeDrawingTool,
    setActiveDrawingTool,
    indicators,
    setIndicators,
    clearAllDrawings,
    drawings,
    setDrawings,
    mobileTab
  } = useTrading();

  const handleToolSelect = (tool: DrawingType) => {
    setActiveDrawingTool(tool);
  };

  const drawingTools: { type: DrawingType; icon: React.ReactNode; label: string }[] = [
    { type: 'cursor', icon: <MousePointer className="w-4 h-4" />, label: 'Select Cursor' },
    { type: 'horizontal', icon: <Minus className="w-4 h-4" />, label: 'Horizontal Line' },
    { type: 'trendline', icon: <TrendingUp className="w-4 h-4" />, label: 'Trendline' },
    { type: 'rectangle', icon: <Square className="w-4 h-4" />, label: 'Rectangle' },
    { type: 'circle', icon: <Circle className="w-4 h-4" />, label: 'Circle' },
    { type: 'triangle', icon: <Triangle className="w-4 h-4" />, label: 'Triangle' },
    { type: 'path', icon: <PenTool className="w-4 h-4" />, label: 'Path (Brush)' },
    { type: 'fib-retracement', icon: <Activity className="w-4 h-4" />, label: 'Fib Retracement' },
    { type: 'fib-extension', icon: <Maximize2 className="w-4 h-4" />, label: 'Fib Extension' },
    { type: 'text-box', icon: <Type className="w-4 h-4" />, label: 'Text Box' },
    { type: 'price-tag', icon: <Tag className="w-4 h-4" />, label: 'Price Tag' },
    { type: 'measure', icon: <Ruler className="w-4 h-4" />, label: 'Measure Tool' },
    { type: 'long', icon: <div className="font-bold text-xs">L</div>, label: 'Long Risk Tool' },
    { type: 'short', icon: <div className="font-bold text-xs">S</div>, label: 'Short Risk Tool' },
  ];

  return (
    <div className={`${mobileTab === 'drawings' ? 'flex' : 'hidden'} md:flex w-full md:w-[50px] h-14 md:h-full bg-[#07090b] border-b md:border-b-0 md:border-r border-slate-900 flex-row md:flex-col justify-start md:justify-between items-center py-2 md:py-4 px-2 md:px-0 font-sans select-none gap-4 overflow-x-auto md:overflow-x-hidden overflow-y-hidden md:overflow-y-auto shrink-0 no-scrollbar`}>
      {/* DRAWING UTILITIES */}
      <div className="flex flex-row md:flex-col items-center gap-2 md:gap-2.5 w-max md:w-full shrink-0">
        {drawingTools.map((tool) => {
          const isActive = activeDrawingTool === tool.type;
          return (
            <button
              id={`btn-tool-${tool.type}`}
              key={tool.type}
              onClick={() => handleToolSelect(tool.type)}
              className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all duration-200 cursor-pointer shadow-sm relative group ${
                isActive
                  ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/40 shadow-cyan-500/10'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent'
              }`}
              title={tool.label}
            >
              {tool.icon}
              {/* Floating micro tooltips */}
              <span className="absolute left-12 scale-0 group-hover:scale-100 bg-slate-950 text-[10px] text-slate-300 px-2 py-1 rounded shadow-lg border border-slate-800 z-50 whitespace-nowrap transition-transform duration-150 origin-left">
                {tool.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* CHART INDICATORS MULTI-TOGGLE (ΔP, VP, TPO, AV) */}
      <div className="flex flex-row md:flex-col items-center gap-2 md:gap-2.5 w-max md:w-full border-l md:border-l-0 md:border-t border-r md:border-b border-slate-900 px-4 md:px-0 py-0 md:py-4 shrink-0">
        {/* Delta CVD Button */}
        <button
          id="btn-toggle-cvd"
          onClick={() => setIndicators((prev) => ({ ...prev, showDeltaCVD: !prev.showDeltaCVD }))}
          className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all duration-200 cursor-pointer ${
            indicators.showDeltaCVD
              ? 'bg-amber-500/15 text-amber-400 border border-amber-500/40 shadow-lg'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent'
          } relative group`}
          title="Toggle CVD / Delta Profile (ΔP)"
        >
          <span className="font-bold text-xs font-mono">ΔP</span>
          <span className="absolute left-12 scale-0 group-hover:scale-100 bg-slate-950 text-[10px] text-slate-300 px-2 py-1 rounded shadow-lg border border-slate-800 z-50 whitespace-nowrap transition-transform duration-150 origin-left">
            Cumulative Volume Delta (ΔP)
          </span>
        </button>

        {/* Volume Profile VP Button */}
        <button
          id="btn-toggle-vp"
          onClick={() => setIndicators((prev) => ({ ...prev, showVolumeProfile: !prev.showVolumeProfile }))}
          className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all duration-200 cursor-pointer ${
            indicators.showVolumeProfile
              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/40 shadow-lg'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent'
          } relative group`}
          title="Toggle Volume Profile (VP)"
        >
          <span className="font-bold text-xs font-mono">VP</span>
          <span className="absolute left-12 scale-0 group-hover:scale-100 bg-slate-950 text-[10px] text-slate-300 px-2 py-1 rounded shadow-lg border border-slate-800 z-50 whitespace-nowrap transition-transform duration-150 origin-left">
            Volume Profile (VP)
          </span>
        </button>

        {/* TPO Market Profile Button */}
        <button
          id="btn-toggle-tpo"
          onClick={() => setIndicators((prev) => ({ ...prev, showTPO: !prev.showTPO }))}
          className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all duration-200 cursor-pointer ${
            indicators.showTPO
              ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/40 shadow-lg'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent'
          } relative group`}
          title="Toggle TPO Profile (TPO)"
        >
          <span className="font-bold text-xs font-mono">TPO</span>
          <span className="absolute left-12 scale-0 group-hover:scale-100 bg-slate-950 text-[10px] text-slate-300 px-2 py-1 rounded shadow-lg border border-slate-800 z-50 whitespace-nowrap transition-transform duration-150 origin-left">
            TPO / Market Profile (TPO)
          </span>
        </button>

        {/* N-POC Button */}
        <button
          id="btn-toggle-npoc"
          onClick={() => setIndicators((prev) => ({ ...prev, showNPOC: !prev.showNPOC }))}
          className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all duration-200 cursor-pointer ${
            indicators.showNPOC
              ? 'bg-pink-500/15 text-pink-400 border border-pink-500/40 shadow-lg'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent'
          } relative group`}
          title="Toggle Naked POC (N-POC)"
        >
          <span className="font-bold text-[10px] font-mono leading-tight">N<br/>POC</span>
          <span className="absolute left-12 scale-0 group-hover:scale-100 bg-slate-950 text-[10px] text-slate-300 px-2 py-1 rounded shadow-lg border border-slate-800 z-50 whitespace-nowrap transition-transform duration-150 origin-left">
            Naked Point of Control (N-POC)
          </span>
        </button>

        {/* Anchored VWAP Button */}
        <button
          id="btn-toggle-av"
          onClick={() => {
            if (indicators.showMPAS) {
              setIndicators({ showMPAS: false, anchoredTime: null });
            } else {
              setIndicators({ showMPAS: true, anchoredTime: null });
            }
          }}
          className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all duration-200 cursor-pointer ${
            indicators.showMPAS
              ? 'bg-rose-500/15 text-rose-400 border border-rose-500/40 shadow-lg'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent'
          } relative group`}
          title="Toggle Anchored VWAP (AV)"
        >
          <span className="font-bold text-xs font-mono">AV</span>
          <span className="absolute left-12 scale-0 group-hover:scale-100 bg-slate-950 text-[10px] text-slate-300 px-2 py-1 rounded shadow-lg border border-slate-800 z-50 whitespace-nowrap transition-transform duration-150 origin-left">
            Anchored VWAP (AV)
          </span>
        </button>
      </div>

      {/* LOWER UTILITIES & CLEAN TRASH ACTION */}
      <div className="flex flex-row md:flex-col items-center gap-2 w-max md:w-full shrink-0 pr-4 md:pr-0">
        {/* Undo Drawing Button */}
        <button
          id="btn-undo-drawing"
          onClick={() => {
            if (drawings && drawings.length > 0) {
              setDrawings((prev) => prev.slice(0, -1));
            }
          }}
          className="w-[30px] h-[30px] flex items-center justify-center rounded-lg transition-all duration-200 cursor-pointer border border-orange-500/40 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 hover:text-orange-300 shadow-sm shadow-orange-500/10 relative group"
          title="Undo Last Drawing"
        >
          <RotateCw className="w-3.5 h-3.5" />
          <span className="absolute left-12 scale-0 group-hover:scale-100 bg-slate-950 text-[10px] text-slate-300 px-2 py-1 rounded shadow-lg border border-slate-800 z-50 whitespace-nowrap transition-transform duration-150 origin-left">
            Undo Last Drawing
          </span>
        </button>

        {/* Clear All Drawings Trash Bin */}
        <button
          id="btn-clear-drawings"
          onClick={clearAllDrawings}
          className="w-[30px] h-[30px] flex items-center justify-center rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 border border-transparent transition-all duration-200 cursor-pointer relative group"
          title="Delete All Drawings"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span className="absolute left-12 scale-0 group-hover:scale-100 bg-slate-950 text-[10px] text-slate-300 px-2 py-1 rounded shadow-lg border border-slate-800 z-50 whitespace-nowrap transition-transform duration-150 origin-left">
            Clear Drawings
          </span>
        </button>
      </div>
    </div>
  );
};

