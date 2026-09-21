/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
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
    mobileTab,
    stampText,
    setStampText
  } = useTrading();

  const handleToolSelect = (tool: DrawingType) => {
    setActiveDrawingTool(tool);
    setStampText(null);
  };

  const [isStampMenuOpen, setIsStampMenuOpen] = useState(false);
  const stampMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (stampMenuRef.current && !stampMenuRef.current.contains(event.target as Node)) {
        setIsStampMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const TEXT_STAMPS = [
    "Asia High",
    "Asia Low",
    "London",
    "NY",
    "Liquidity",
    "Sweep",
    "CHOCH",
    "BOS",
    "FVG",
    "Entry",
    "SL",
    "TP"
  ];

  const drawingTools: { type: DrawingType; icon: React.ReactNode; label: string }[] = [
    { type: 'cursor', icon: <MousePointer className="w-4 h-4" />, label: 'Select Cursor' },
    { type: 'horizontal', icon: <Minus className="w-4 h-4" />, label: 'Horizontal Line' },
    { type: 'trendline', icon: <TrendingUp className="w-4 h-4" />, label: 'Trendline' },
    { type: 'rectangle', icon: <Square className="w-4 h-4" />, label: 'Rectangle' },
    { type: 'circle', icon: <Circle className="w-4 h-4" />, label: 'Circle' },
    { type: 'triangle', icon: <Triangle className="w-4 h-4" />, label: 'Triangle' },
    { type: 'path', icon: <PenTool className="w-4 h-4" />, label: 'Path (Brush)' },
    { type: 'text-box', icon: <Type className="w-4 h-4" />, label: 'Text Box' },
    { type: 'price-tag', icon: <Tag className="w-4 h-4" />, label: 'Price Tag' },
    { type: 'measure', icon: <Ruler className="w-4 h-4" />, label: 'Measure Tool' },
    { type: 'long', icon: <div className="font-bold text-xs">L</div>, label: 'Long Risk Tool' },
    { type: 'short', icon: <div className="font-bold text-xs">S</div>, label: 'Short Risk Tool' },
  ];

  return (
    <div className={`${mobileTab === 'drawings' ? 'flex' : 'hidden'} md:flex w-full md:w-[50px] h-14 md:h-full bg-[#07090b] border-b md:border-b-0 md:border-r border-slate-900 flex-row md:flex-col justify-start md:justify-between items-center py-2 md:py-4 px-2 md:px-0 font-sans select-none gap-4 overflow-x-auto md:overflow-x-hidden overflow-y-hidden md:overflow-y-auto shrink-0 no-scrollbar`}>
      {/* DRAWING UTILITIES */}
      <div className="flex flex-row md:flex-col items-center gap-2 md:gap-2.5 w-max md:w-full shrink-0 relative">
        {/* TEXT STAMPS DROPDOWN */}
        <div className="relative" ref={stampMenuRef}>
          <button
            onClick={() => setIsStampMenuOpen(!isStampMenuOpen)}
            className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all duration-200 cursor-pointer shadow-sm relative group ${
              isStampMenuOpen || stampText
                ? 'bg-purple-500/15 text-purple-400 border border-purple-500/40 shadow-purple-500/10'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent'
            }`}
            title="Text Stamps"
          >
            <BookOpen className="w-4 h-4" />
            <span className="absolute left-12 scale-0 group-hover:scale-100 bg-slate-950 text-[10px] text-slate-300 px-2 py-1 rounded shadow-lg border border-slate-800 z-50 whitespace-nowrap transition-transform duration-150 origin-left">
              Text Stamps
            </span>
          </button>
          
          {isStampMenuOpen && (
            <div className="fixed top-[90px] md:top-[70px] left-2 md:left-[55px] w-56 max-h-[70vh] overflow-y-auto bg-slate-950 border border-slate-800 rounded-lg shadow-2xl z-[100] py-1 no-scrollbar flex flex-col divide-y divide-slate-800/50">
              {TEXT_STAMPS.map((stamp, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setStampText(stamp);
                    setActiveDrawingTool('text-box');
                    setIsStampMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-800 transition-colors ${stampText === stamp ? 'text-purple-400 font-bold' : 'text-slate-300'}`}
                >
                  {stamp}
                </button>
              ))}
            </div>
          )}
        </div>

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

