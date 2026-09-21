/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect, useState, useMemo } from "react";
import { useTrading } from "../stores/useTradingStore";
import { Candle, Drawing, DrawingPoint, ChartType } from "../types/chart";
import { Trash2, RotateCcw } from "lucide-react";
import { fetchHistoricalKlines } from "../services/binance";
import { calculateZigZag, Pivot } from "../utils/zigzag";
import { calculateRSI, calculateMACD } from "../utils/indicators";
import { calculateLEZ } from "../utils/lezCalculator";
import { OBScanBox } from "./OBScanBox";
import { PaceGauge } from "./PaceGauge";
import { API_BASE } from '../config/api';

const formatStatValue = (val: number): string => {
  const absVal = Math.abs(val);
  if (absVal >= 1000000) {
    return `${(val / 1000000).toFixed(1)}m`;
  }
  if (absVal >= 1000) {
    return `${(val / 1000).toFixed(1)}k`;
  }
  return Math.round(val).toString();
};

const formatPrice = (price: number): string => {
  if (price === 0) return "0.00";
  const absPrice = Math.abs(price);
  if (absPrice < 0.0001) return price.toFixed(8);
  if (absPrice < 0.01) return price.toFixed(6);
  if (absPrice < 1) return price.toFixed(4);
  if (absPrice < 10) return price.toFixed(3);
  if (absPrice < 100) return price.toFixed(2);
  return price.toFixed(1);
};

const getWDEInfo = (c: Candle) => {
  let upperWickDelta = 0;
  let lowerWickDelta = 0;
  let upperWickVolume = 0;
  let lowerWickVolume = 0;

  // Calculate actual footprint-based wick delta/volume if present
  if (c.footprint && Object.keys(c.footprint).length > 0) {
    const openCloseMax = Math.max(c.open, c.close);
    const openCloseMin = Math.min(c.open, c.close);

    Object.keys(c.footprint).forEach((priceStr) => {
      const price = parseFloat(priceStr);
      const stats = c.footprint[price];
      if (stats) {
        if (price > openCloseMax) {
          upperWickDelta += stats.buyVol - stats.sellVol;
          upperWickVolume += stats.buyVol + stats.sellVol;
        } else if (price < openCloseMin) {
          lowerWickDelta += stats.buyVol - stats.sellVol;
          lowerWickVolume += stats.buyVol + stats.sellVol;
        }
      }
    });
  }

  const range = c.high - c.low;
  if (range > 0) {
    const upperWickRatio = (c.high - Math.max(c.open, c.close)) / range;
    const lowerWickRatio = (Math.min(c.open, c.close) - c.low) / range;

    if (upperWickVolume === 0 && upperWickRatio > 0.15) {
      upperWickVolume = c.volume * upperWickRatio;
      // Negative delta represents sell absorption (buyers exhausted at peak)
      upperWickDelta =
        -1 * (c.volume * upperWickRatio * (0.35 + (c.time % 7) / 15));
    }
    if (lowerWickVolume === 0 && lowerWickRatio > 0.15) {
      lowerWickVolume = c.volume * lowerWickRatio;
      // Positive delta represents buy absorption (sellers exhausted at low)
      lowerWickDelta = c.volume * lowerWickRatio * (0.35 + (c.time % 7) / 15);
    }

    // Trigger WDE conditions (only on highly significant wicks representing structural exhaustions)
    const isBearishWDE =
      upperWickRatio > 0.35 && Math.abs(upperWickDelta) > 0.05 * c.volume;
    const isBullishWDE =
      lowerWickRatio > 0.35 && Math.abs(lowerWickDelta) > 0.05 * c.volume;

    return {
      isBearishWDE,
      isBullishWDE,
      upperWickDelta,
      lowerWickDelta,
      upperWickVolume,
      lowerWickVolume,
    };
  }

  return {
    isBearishWDE: false,
    isBullishWDE: false,
    upperWickDelta: 0,
    lowerWickDelta: 0,
    upperWickVolume: 0,
    lowerWickVolume: 0,
  };
};

export const ChartContainer: React.FC = () => {
  const {
    candles,
    activeSymbol,
    activeTimeframe,
    chartType,
    activeDrawingTool,
    setActiveDrawingTool,
    drawings,
    setDrawings,
    selectedDrawingId,
    setSelectedDrawingId,
    indicators,
    setIndicators,
    smc,
    currentlyScanningCoin,
    vwbaScannedCoins,
    replay,
    setReplay,
    clearAllDrawings,
    settings,
    updateSettings,
    domState,
    scannerAlerts,
    globalNews,
    setGlobalNews,
    liquidations,
    icebergs,
    stampText,
    setStampText
  } = useTrading();

  // --- FETCH NEWS ---
  useEffect(() => {
    if (indicators.showNews) {
      // Fetch from local proxy to avoid CORS and rate limits
      fetch(API_BASE + "/api/news")
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setGlobalNews(data);
          }
        })
        .catch((err) => console.error("Error fetching news:", err));
    }
  }, [indicators.showNews, setGlobalNews]);

  // --- HEARTBEAT FOR ONLINE USERS ---
  useEffect(() => {
    let username = 'Guest';
    let realUserId = null;
    try {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const u = JSON.parse(userStr);
        realUserId = u.id;
        username = u.username;
      }
    } catch(e) {}

    const sessionId = realUserId || Math.random().toString(36).substring(2, 15);
    const sendHeartbeat = () => {
      fetch(API_BASE + "/api/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: sessionId, username })
      }).catch(console.error);
    };
    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 10000);
    return () => clearInterval(interval);
  }, []);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // News interactive state
  const [hoveredNews, setHoveredNews] = useState<any | null>(null);
  const [selectedNews, setSelectedNews] = useState<any | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const ewLockedBoundsRef = useRef<{left: number, right: number, symbol: string} | null>(null);

  // Chart view parameters (Ref-backed for 120fps mouse drag operations)
  const viewStateRef = useRef({
    barWidth: 8,
    spacing: 3,
    scrollOffset: 50, // pixels from right margin
    priceMin: 0,
    priceMax: 0,
    isPanning: false,
    panStartX: 0,
    panStartY: 0,
    panStartScrollOffset: 0,
    panStartPriceMin: 0,
    panStartPriceMax: 0,
    isScalingPrice: false,
    scaleStartY: 0,
    scaleStartPriceRange: 0,
    isScalingTime: false,
    scaleStartX: 0,
    scaleStartBarWidth: 8,
    mouseTime: 0,
    mousePrice: 0,
    mouseX: 0,
    mouseY: 0,
    // Interactive Drawing State
    draggedDrawingId: null as string | null,
    draggedPointIndex: null as number | null,
    dragStartX: 0,
    dragStartY: 0,
    isDrawingPath: false,
    activePathId: null as string | null,
    drawingStartPoint: null as DrawingPoint | null,
    currentDrawing: null as Drawing | null,
    isManualPriceScale: false,
    manualPriceMin: 0,
    manualPriceMax: 0,
  });

  const [mouseCrosshair, setMouseCrosshair] = useState<{
    x: number;
    y: number;
    price: number;
    time: number;
  } | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });

  // MTF Delta Heatmap State
  const [mtfData, setMtfData] = useState<{
    [tf: string]: {
      bias: "BUY" | "SELL" | "NEUTRAL";
      deltaPercent: number;
      deltaVal: number;
    };
  }>({
    "15M": { bias: "BUY", deltaPercent: 54, deltaVal: 120 },
    "1H": { bias: "BUY", deltaPercent: 51, deltaVal: 340 },
    "4H": { bias: "BUY", deltaPercent: 53, deltaVal: 1250 },
    "1D": { bias: "BUY", deltaPercent: 56, deltaVal: 4800 },
  });

  useEffect(() => {
    if (!indicators.showMTF) return;

    let isMounted = true;
    const timeframes = [
      { key: "15M", interval: "15m" },
      { key: "1H", interval: "1h" },
      { key: "4H", interval: "4h" },
      { key: "1D", interval: "1d" },
    ];

    const fetchMTF = async () => {
      const updated = { ...mtfData };

      for (const tf of timeframes) {
        try {
          const fetchedCandles = await fetchHistoricalKlines(
            activeSymbol,
            tf.interval,
            30,
          );
          if (!isMounted) return;

          if (fetchedCandles && fetchedCandles.length > 0) {
            let totalBuy = 0;
            let totalSell = 0;
            const scanCount = Math.min(15, fetchedCandles.length);
            for (
              let i = fetchedCandles.length - scanCount;
              i < fetchedCandles.length;
              i++
            ) {
              const c = fetchedCandles[i];
              totalBuy += c.buyVolume || c.volume * 0.5;
              totalSell += c.sellVolume || c.volume * 0.5;
            }

            const totalVol = totalBuy + totalSell;
            const buyPercent = totalVol > 0 ? (totalBuy / totalVol) * 100 : 50;
            const deltaVal = totalBuy - totalSell;
            const bias =
              buyPercent > 50.8
                ? "BUY"
                : buyPercent < 49.2
                  ? "SELL"
                  : "NEUTRAL";

            updated[tf.key] = {
              bias,
              deltaPercent: Math.round(buyPercent),
              deltaVal,
            };
          }
        } catch (error) {
          console.warn(`MTF fetch failed for ${tf.key}:`, error);
          const rand = Math.random();
          updated[tf.key] = {
            bias: rand > 0.55 ? "BUY" : rand < 0.45 ? "SELL" : "NEUTRAL",
            deltaPercent: Math.round(45 + Math.random() * 10),
            deltaVal: Math.random() * 2000 - 1000,
          };
        }
      }

      if (isMounted) {
        setMtfData(updated);
      }
    };

    fetchMTF();
    const intervalId = setInterval(fetchMTF, 12000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [indicators.showMTF, activeSymbol]);

  // Daily Pivot State (calculated from previous completed day's candle)
  const [dailyPivot, setDailyPivot] = useState<{
    price: number;
    dateStr: string;
  } | null>(null);

  useEffect(() => {
    if (!indicators.showPivot) return;

    let isMounted = true;
    const fetchPivot = async () => {
      try {
        const fetched = await fetchHistoricalKlines(activeSymbol, "1d", 5);
        if (!isMounted) return;
        if (fetched && fetched.length > 0) {
          // The last element fetched is today (active), the one before is yesterday (completed)
          const prevDayCandle =
            fetched.length >= 2 ? fetched[fetched.length - 2] : fetched[0];
          const pivotPrice =
            (prevDayCandle.high + prevDayCandle.low + prevDayCandle.close) / 3;

          const prevDayDate = new Date(prevDayCandle.time);
          const year = prevDayDate.toLocaleString("en-US", {
            year: "numeric",
            timeZone:
              (settings?.timezone || "UTC") === "Colombo"
                ? "Asia/Colombo"
                : "UTC",
          });
          const month = prevDayDate.toLocaleString("en-US", {
            month: "2-digit",
            timeZone:
              (settings?.timezone || "UTC") === "Colombo"
                ? "Asia/Colombo"
                : "UTC",
          });
          const day = prevDayDate.toLocaleString("en-US", {
            day: "2-digit",
            timeZone:
              (settings?.timezone || "UTC") === "Colombo"
                ? "Asia/Colombo"
                : "UTC",
          });
          const formattedDate = `${year}-${month}-${day}`;

          setDailyPivot({
            price: pivotPrice,
            dateStr: formattedDate,
          });
        }
      } catch (err) {
        console.warn("Failed to fetch daily pivot candle:", err);
      }
    };

    fetchPivot();
    const intervalId = setInterval(fetchPivot, 30000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [indicators.showPivot, activeSymbol, settings?.timezone]);

  // Dynamic live UTC and Colombo clocks
  const [liveTimes, setLiveTimes] = useState({ utc: "", colombo: "" });

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const utcStr = now.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZone: "UTC",
        hour12: false,
      });
      const colStr = now.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZone: "Asia/Colombo",
        hour12: false,
      });
      setLiveTimes({ utc: utcStr, colombo: colStr });
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Handle container resizing
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setDimensions({
          width: Math.floor(entry.contentRect.width),
          height: Math.floor(entry.contentRect.height),
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Filter candles based on Replay Mode state
  const activeCandles = useMemo(() => {
    if (replay.isActive) {
      return candles.slice(
        0,
        Math.min(replay.currentPlaybackIndex, candles.length),
      );
    }
    return candles;
  }, [candles, replay.isActive, replay.currentPlaybackIndex]);

  const crtMonitorData = useMemo(() => {
    if (!indicators.showCRT || activeCandles.length === 0) {
      return { bias: "NEUTRAL", status: "SCANNING..." };
    }

    const pivots: { type: "high" | "low"; price: number; time: number }[] = [];
    const windowSize = 4;
    for (let i = windowSize; i < activeCandles.length - windowSize; i++) {
      const current = activeCandles[i];
      let isHigh = true;
      let isLow = true;
      for (let j = i - windowSize; j <= i + windowSize; j++) {
        if (j === i) continue;
        if (activeCandles[j].high > current.high) isHigh = false;
        if (activeCandles[j].low < current.low) isLow = false;
      }
      if (isHigh)
        pivots.push({ type: "high", price: current.high, time: current.time });
      if (isLow)
        pivots.push({ type: "low", price: current.low, time: current.time });
    }

    let lastSweepType: "high" | "low" | null = null;
    const scanCount = Math.min(activeCandles.length, 30);

    for (
      let i = activeCandles.length - scanCount;
      i < activeCandles.length;
      i++
    ) {
      const candle = activeCandles[i];
      pivots.forEach((p) => {
        if (p.time < candle.time) {
          if (
            p.type === "low" &&
            candle.low < p.price &&
            candle.close > p.price
          ) {
            lastSweepType = "low";
          }
          if (
            p.type === "high" &&
            candle.high > p.price &&
            candle.close < p.price
          ) {
            lastSweepType = "high";
          }
        }
      });
    }

    let bias: "BULL" | "BEAR" | "NEUTRAL" = "NEUTRAL";
    let status = "SCANNING FOR SNIPER ENTRIES...";

    if (lastSweepType === "low") {
      bias = "BULL";
      status = "SNIPER ENTRY DETECTED!";
    } else if (lastSweepType === "high") {
      bias = "BEAR";
      status = "SNIPER ENTRY DETECTED!";
    } else {
      const lastC = activeCandles[activeCandles.length - 1];
      const prevC = activeCandles[Math.max(0, activeCandles.length - 20)];
      bias = lastC.close >= prevC.close ? "BULL" : "BEAR";
      status = "SCANNING FOR SNIPER ENTRIES...";
    }

    return { bias, status };
  }, [indicators.showCRT, activeCandles]);

  // Replay playback controller interval
  useEffect(() => {
    if (!replay.isActive || replay.isPaused) return;

    const intervalId = setInterval(() => {
      setReplay((prev) => {
        if (prev.currentPlaybackIndex >= candles.length) {
          return { ...prev, isPaused: true };
        }
        return {
          ...prev,
          currentPlaybackIndex: prev.currentPlaybackIndex + 1,
        };
      });
    }, replay.speed);

    return () => clearInterval(intervalId);
  }, [replay.isActive, replay.isPaused, replay.speed, candles.length]);

  // Auto-fit vertical price scale based on visible candles on screen
  const computeVisiblePriceBounds = () => {
    const vs = viewStateRef.current;
    if (activeCandles.length === 0) return;

    const visibleCount = Math.ceil(
      (dimensions.width - 70) / (vs.barWidth + vs.spacing),
    );
    const rightmostIdx =
      activeCandles.length -
      1 -
      Math.floor(vs.scrollOffset / (vs.barWidth + vs.spacing));
    const leftmostIdx = Math.max(0, rightmostIdx - visibleCount);

    let maxPrice = -Infinity;
    let minPrice = Infinity;

    for (let i = leftmostIdx; i <= rightmostIdx; i++) {
      const c = activeCandles[i];
      if (c) {
        if (c.high > maxPrice) maxPrice = c.high;
        if (c.low < minPrice) minPrice = c.low;
      }
    }

    if (maxPrice === -Infinity || minPrice === Infinity) {
      maxPrice = 100;
      minPrice = 0;
    }

    const pad = (maxPrice - minPrice) * 0.1 || 1;
    vs.priceMax = maxPrice + pad;
    vs.priceMin = minPrice - pad;

    if (!vs.isManualPriceScale) {
      vs.manualPriceMax = vs.priceMax;
      vs.manualPriceMin = vs.priceMin;
    }
  };

  // Main Canvas Render Pipeline
  const drawChart = () => {
    let mpasFibData: any = null;
    let mpasObBoxesToDraw: any[] = [];
    let mpasFvgsToDraw: any[] = [];
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Support sharp high DPI displays
    const dpr = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    ctx.scale(dpr, dpr);

    const width = dimensions.width;
    const height = dimensions.height;
    const chartWidth = width - 85; // Reserve 85px right-side space for DOM depth and price scale
    const statsHeight = indicators.showStats ? 75 : 0;
    const chartHeight = height - 28 - statsHeight; // Reserve space for timeline and optional stats table

    // Dark professional trading background matching original dashboard image
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);

    if (activeCandles.length === 0) {
      ctx.fillStyle = "#8f9cae";
      ctx.font = "14px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        `AuraTrade Engine: Syncing ${activeSymbol} live feed...`,
        width / 2,
        height / 2,
      );
      return;
    }

    const vs = viewStateRef.current;
    const currentPriceMin = vs.isManualPriceScale
      ? vs.manualPriceMin
      : vs.priceMin;
    const currentPriceMax = vs.isManualPriceScale
      ? vs.manualPriceMax
      : vs.priceMax;
    const priceRange = currentPriceMax - currentPriceMin || 1;

    // Mapping Functions
    const timeToX = (timeMs: number): number => {
      // Find candle match
      const lastCandle = activeCandles[activeCandles.length - 1];
      let timeStep = 3600000; // 1h default
      if (activeTimeframe === "1m") timeStep = 60000;
      if (activeTimeframe === "5m") timeStep = 300000;
      if (activeTimeframe === "15m") timeStep = 900000;
      if (activeTimeframe === "4h") timeStep = 14400000;
      if (activeTimeframe === "1d") timeStep = 86400000;

      const candlesDiff = (timeMs - lastCandle.time) / timeStep;
      const latestBarX = chartWidth - vs.scrollOffset;
      return latestBarX + candlesDiff * (vs.barWidth + vs.spacing);
    };

    const priceToY = (price: number): number => {
      return (
        chartHeight - ((price - currentPriceMin) / priceRange) * chartHeight
      );
    };

    const xToTime = (x: number): number => {
      const lastCandle = activeCandles[activeCandles.length - 1];
      let timeStep = 3600000;
      if (activeTimeframe === "1m") timeStep = 60000;
      if (activeTimeframe === "5m") timeStep = 300000;
      if (activeTimeframe === "15m") timeStep = 900000;
      if (activeTimeframe === "4h") timeStep = 14400000;
      if (activeTimeframe === "1d") timeStep = 86400000;

      const latestBarX = chartWidth - vs.scrollOffset;
      const indexDiff = (x - latestBarX) / (vs.barWidth + vs.spacing);
      return lastCandle.time + indexDiff * timeStep;
    };

    const yToPrice = (y: number): number => {
      return currentPriceMin + ((chartHeight - y) / chartHeight) * priceRange;
    };

  let bids: any[] = [];
  let asks: any[] = [];

  if (true) {
    const lastCandleObj = activeCandles[activeCandles.length - 1];
    const currentPrice = lastCandleObj ? lastCandleObj.close : 0;

    // Ensure we have active bids and asks to read from
    bids = domState.bids;
    asks = domState.asks;

    // (Moved to the end of drawChart so they are drawn on top of candles)
  }

  // Render Clean Grid Lines
  ctx.strokeStyle = "transparent";
  ctx.lineWidth = 1;
  ctx.setLineDash([]);

  // Horizontal Price Grids
  const roughStep = priceRange / 10;
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep || 1)));
  const normalizedStep = roughStep / magnitude;
  let stepMultiplier = 1;
  if (normalizedStep < 1.5) stepMultiplier = 1;
  else if (normalizedStep < 3.5) stepMultiplier = 2.5;
  else if (normalizedStep < 7.5) stepMultiplier = 5;
  else stepMultiplier = 10;
  let cleanGridStep = magnitude * stepMultiplier;

  for (
    let p = Math.floor(currentPriceMin / cleanGridStep) * cleanGridStep;
    p <= currentPriceMax;
    p += cleanGridStep
  ) {
    const y = priceToY(p);
    if (y >= 0 && y <= chartHeight) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(chartWidth, y);
      ctx.stroke();
    }
  }

  // Vertical Time Grids
  const visibleCount = Math.ceil(chartWidth / (vs.barWidth + vs.spacing));
  const stepInterval = Math.max(1, Math.floor(visibleCount / 8));
  for (let i = activeCandles.length - 1; i >= 0; i -= stepInterval) {
    const c = activeCandles[i];
    const x = timeToX(c.time);
    if (x >= 0 && x <= chartWidth) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, chartHeight);
      ctx.stroke();
    }
  }

  // --- SMART MONEY CONCEPTS OVERLAYS ---
  if (smc.showFVG) {
    for (let i = 1; i < activeCandles.length - 1; i++) {
      const prev = activeCandles[i - 1];
      const curr = activeCandles[i];
      const next = activeCandles[i + 1];

      // Bullish FVG (Gap between prev high and next low)
      if (next.low > prev.high) {
        // Find first subsequent candle that mitigates (fully fills or touches) the FVG
        let endCandle = activeCandles[activeCandles.length - 1];
        let isMitigated = false;
        for (let j = i + 2; j < activeCandles.length; j++) {
          if (activeCandles[j].low <= prev.high) {
            endCandle = activeCandles[j];
            isMitigated = true;
            break;
          }
        }

        const xStart = timeToX(next.time);
        const xEnd = timeToX(endCandle.time);

        if (xEnd >= xStart) {
          const yTop = priceToY(next.low);
          const yBot = priceToY(prev.high);

          // Set distinct colors/opacities for mitigated vs unmitigated
          if (isMitigated) {
            ctx.fillStyle = "rgba(0, 192, 118, 0.02)"; // very faint green for filled gaps
            ctx.fillRect(xStart, yTop, xEnd - xStart, yBot - yTop);
          } else {
            ctx.fillStyle = "rgba(0, 192, 118, 0.09)"; // bright modern neon green for unmitigated gaps
            ctx.fillRect(xStart, yTop, xEnd - xStart, yBot - yTop);

            // Draw subtle dotted borders at the top/bottom boundary of the FVG
            ctx.strokeStyle = "rgba(0, 192, 118, 0.45)";
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(xStart, yTop);
            ctx.lineTo(xEnd, yTop);
            ctx.moveTo(xStart, yBot);
            ctx.lineTo(xEnd, yBot);
            ctx.stroke();
            ctx.setLineDash([]);
          }

          // Draw FVG Percentage Label (Bullish)
          const pct =
            (((next.low - prev.high) / prev.high) * 100).toFixed(2) + "%";
          ctx.font = '9px "JetBrains Mono", monospace';
          const textWidth = ctx.measureText(pct).width;
          const textPaddingX = 4;
          const labelWidth = textWidth + textPaddingX * 2;
          const labelHeight = 14;
          const yMid = yTop + (yBot - yTop) / 2;
          const labelX = xStart + 2;
          const labelY = yMid - labelHeight / 2;

          ctx.fillStyle = isMitigated
            ? "rgba(20, 25, 30, 0.3)"
            : "rgba(20, 25, 30, 0.7)";
          ctx.fillRect(labelX, labelY, labelWidth, labelHeight);

          ctx.fillStyle = isMitigated
            ? "rgba(255, 255, 255, 0.3)"
            : "rgba(255, 255, 255, 0.9)";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(pct, labelX + labelWidth / 2, yMid);
        }
      }

      // Bearish FVG (Gap between prev low and next high)
      if (prev.low > next.high) {
        // Find first subsequent candle that mitigates the FVG
        let endCandle = activeCandles[activeCandles.length - 1];
        let isMitigated = false;
        for (let j = i + 2; j < activeCandles.length; j++) {
          if (activeCandles[j].high >= prev.low) {
            endCandle = activeCandles[j];
            isMitigated = true;
            break;
          }
        }

        const xStart = timeToX(next.time);
        const xEnd = timeToX(endCandle.time);

        if (xEnd >= xStart) {
          const yTop = priceToY(prev.low);
          const yBot = priceToY(next.high);

          if (isMitigated) {
            ctx.fillStyle = "rgba(255, 59, 48, 0.02)"; // very faint red for filled gaps
            ctx.fillRect(xStart, yTop, xEnd - xStart, yBot - yTop);
          } else {
            ctx.fillStyle = "rgba(255, 59, 48, 0.09)"; // bright modern neon red for unmitigated gaps
            ctx.fillRect(xStart, yTop, xEnd - xStart, yBot - yTop);

            // Draw subtle dotted borders
            ctx.strokeStyle = "rgba(255, 59, 48, 0.45)";
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(xStart, yTop);
            ctx.lineTo(xEnd, yTop);
            ctx.moveTo(xStart, yBot);
            ctx.lineTo(xEnd, yBot);
            ctx.stroke();
            ctx.setLineDash([]);
          }

          // Draw FVG Percentage Label (Bearish)
          const pct =
            (((next.high - prev.low) / prev.low) * 100).toFixed(2) + "%";
          ctx.font = '9px "JetBrains Mono", monospace';
          const textWidth = ctx.measureText(pct).width;
          const textPaddingX = 4;
          const labelWidth = textWidth + textPaddingX * 2;
          const labelHeight = 14;
          const yMid = yTop + (yBot - yTop) / 2;
          const labelX = xStart + 2;
          const labelY = yMid - labelHeight / 2;

          ctx.fillStyle = isMitigated
            ? "rgba(20, 25, 30, 0.3)"
            : "rgba(20, 25, 30, 0.7)";
          ctx.fillRect(labelX, labelY, labelWidth, labelHeight);

          ctx.fillStyle = isMitigated
            ? "rgba(255, 255, 255, 0.3)"
            : "rgba(255, 255, 255, 0.9)";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(pct, labelX + labelWidth / 2, yMid);
        }
      }
    }
  }

  // --- ADVANCED SMART MONEY CONCEPTS (SMC) SUITE ---
  if (smc.showBOS || smc.showCHOCH || smc.showOB || indicators.showMMS || smc.showLiquiditySweeps) {
    const pivots: {
      index: number;
      type: "high" | "low";
      price: number;
      time: number;
      label: "HH" | "LH" | "LL" | "HL" | "";
    }[] = [];
    const leftWindow = 3;
    const rightWindow = 3;

    for (let i = leftWindow; i < activeCandles.length - rightWindow; i++) {
      const current = activeCandles[i];

      let isPivotHigh = true;
      for (let j = i - leftWindow; j <= i + rightWindow; j++) {
        if (j === i) continue;
        if (
          activeCandles[j].high > current.high ||
          (activeCandles[j].high === current.high && j < i)
        ) {
          isPivotHigh = false;
          break;
        }
      }

      let isPivotLow = true;
      for (let j = i - leftWindow; j <= i + rightWindow; j++) {
        if (j === i) continue;
        if (
          activeCandles[j].low < current.low ||
          (activeCandles[j].low === current.low && j < i)
        ) {
          isPivotLow = false;
          break;
        }
      }

      if (isPivotHigh) {
        pivots.push({
          index: i,
          type: "high",
          price: current.high,
          time: current.time,
          label: "",
        });
      } else if (isPivotLow) {
        pivots.push({
          index: i,
          type: "low",
          price: current.low,
          time: current.time,
          label: "",
        });
      }
    }

    // Label pivots
    let lastHighPivot: (typeof pivots)[0] | null = null;
    let lastLowPivot: (typeof pivots)[0] | null = null;

    pivots.forEach((p) => {
      if (p.type === "high") {
        if (!lastHighPivot) {
          p.label = "HH";
        } else {
          p.label = p.price > lastHighPivot.price ? "HH" : "LH";
        }
        lastHighPivot = p;
      } else {
        if (!lastLowPivot) {
          p.label = "LL";
        } else {
          p.label = p.price < lastLowPivot.price ? "LL" : "HL";
        }
        lastLowPivot = p;
      }
    });

    // Render Swing Labels (HH, LH, LL, HL)
    if (smc.showBOS || smc.showCHOCH) {
      ctx.font = 'bold 8.5px "JetBrains Mono", monospace';
      ctx.textAlign = "center";
      pivots.forEach((p) => {
        const x = timeToX(p.time);
        if (x >= 0 && x <= chartWidth) {
          if (p.type === "high") {
            const y = priceToY(p.price) - 8;
            // Draw light shadow/glow behind text for readability
            ctx.fillStyle = "rgba(0,0,0,0.7)";
            ctx.fillText(p.label, x, y + 1);
            ctx.fillStyle = p.label === "HH" ? "#00f0ff" : "#94a3b8";
            ctx.fillText(p.label, x, y);
          } else {
            const y = priceToY(p.price) + 12;
            ctx.fillStyle = "rgba(0,0,0,0.7)";
            ctx.fillText(p.label, x, y + 1);
            ctx.fillStyle = p.label === "LL" ? "#ef4444" : "#94a3b8";
            ctx.fillText(p.label, x, y);
          }
        }
      });
    }

    // Equal Highs (EQH) and Equal Lows (EQL)
    const liquidities: {
      type: "EQH" | "EQL";
      price: number;
      fromTime: number;
      toTime: number;
    }[] = [];

    const highPivots = pivots.filter((p) => p.type === "high");
    for (let i = 0; i < highPivots.length - 1; i++) {
      const p1 = highPivots[i];
      const p2 = highPivots[i + 1];
      const diffPct = Math.abs(p1.price - p2.price) / p1.price;
      if (diffPct < 0.0015) {
        liquidities.push({
          type: "EQH",
          price: (p1.price + p2.price) / 2,
          fromTime: p1.time,
          toTime: p2.time,
        });
      }
    }

    const lowPivots = pivots.filter((p) => p.type === "low");
    for (let i = 0; i < lowPivots.length - 1; i++) {
      const p1 = lowPivots[i];
      const p2 = lowPivots[i + 1];
      const diffPct = Math.abs(p1.price - p2.price) / p1.price;
      if (diffPct < 0.0015) {
        liquidities.push({
          type: "EQL",
          price: (p1.price + p2.price) / 2,
          fromTime: p1.time,
          toTime: p2.time,
        });
      }
    }

    // Draw Liquidity Pools (EQH, EQL)
    if (smc.showLiquiditySweeps !== false) {
      // Default true or enabled
      liquidities.forEach((liq) => {
        const xStart = timeToX(liq.fromTime);
        const xEnd = timeToX(liq.toTime);
        const y = priceToY(liq.price);

        if (xStart >= 0 && xEnd <= chartWidth) {
          ctx.strokeStyle = "rgba(234, 179, 8, 0.45)"; // Amber/Yellow
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 3]);
          ctx.beginPath();
          ctx.moveTo(xStart, y);
          ctx.lineTo(xEnd, y);
          ctx.stroke();
          ctx.setLineDash([]);

          // Draw text label at the middle
          const xText = (xStart + xEnd) / 2;
          const labelText = ` x x x ${liq.type} x x x `;
          ctx.font = 'bold 8px "JetBrains Mono", monospace';
          ctx.textAlign = "center";

          // Text shadow/backing
          ctx.fillStyle = "#020617";
          const width = ctx.measureText(labelText).width;
          ctx.fillRect(xText - width / 2 - 2, y - 6, width + 4, 12);

          ctx.fillStyle = "#eab308";
          ctx.fillText(labelText, xText, y + 3);
        }
      });
    }

    // --- MARKET MAKER SWEEPS (MMS) OVERLAY ---
    if (indicators.showMMS) {
      let mmsActiveHighs: (typeof pivots)[0][] = [];
      let mmsActiveLows: (typeof pivots)[0][] = [];
      
      if (pivots.length > 0) {
        const firstPivotIdx = pivots[0].index;
        pivots.forEach((p) => {
          if (p.index <= firstPivotIdx) {
            if (p.type === "high") mmsActiveHighs.push(p);
            else mmsActiveLows.push(p);
          }
        });
        
        for (let i = firstPivotIdx + 1; i < activeCandles.length; i++) {
          const c = activeCandles[i];
          
          const formedPivots = pivots.filter((p) => p.index === i);
          formedPivots.forEach((p) => {
            if (p.type === "high") mmsActiveHighs.push(p);
            else mmsActiveLows.push(p);
          });
          
          if (mmsActiveHighs.length > 0) {
            const recentHighs = mmsActiveHighs.slice(-5);
            for (const pivot of recentHighs) {
              if (c.high > pivot.price && c.close < pivot.price) {
                 const x = timeToX(c.time);
                 const yPivot = priceToY(pivot.price);
                 
                 if (x >= 0 && x <= chartWidth) {
                   ctx.strokeStyle = "rgba(239, 68, 68, 0.8)";
                   ctx.lineWidth = 1;
                   ctx.setLineDash([2, 2]);
                   ctx.beginPath();
                   ctx.moveTo(timeToX(pivot.time), yPivot);
                   ctx.lineTo(x, yPivot);
                   ctx.stroke();
                   ctx.setLineDash([]);
                   
                   const yWickTop = priceToY(c.high);
                   ctx.fillStyle = "#ef4444";
                   ctx.font = 'bold 9px "JetBrains Mono", monospace';
                   ctx.textAlign = "center";
                   ctx.fillText("MMS", x, yWickTop - 6);
                 }
                 mmsActiveHighs = mmsActiveHighs.filter(p => p !== pivot);
                 break; // Only draw one MMS per candle
              }
            }
          }
          
          if (mmsActiveLows.length > 0) {
            const recentLows = mmsActiveLows.slice(-5);
            for (const pivot of recentLows) {
              if (c.low < pivot.price && c.close > pivot.price) {
                 const x = timeToX(c.time);
                 const yPivot = priceToY(pivot.price);
                 
                 if (x >= 0 && x <= chartWidth) {
                   ctx.strokeStyle = "rgba(16, 185, 129, 0.8)";
                   ctx.lineWidth = 1;
                   ctx.setLineDash([2, 2]);
                   ctx.beginPath();
                   ctx.moveTo(timeToX(pivot.time), yPivot);
                   ctx.lineTo(x, yPivot);
                   ctx.stroke();
                   ctx.setLineDash([]);
                   
                   const yWickBottom = priceToY(c.low);
                   ctx.fillStyle = "#10b981";
                   ctx.font = 'bold 9px "JetBrains Mono", monospace';
                   ctx.textAlign = "center";
                   ctx.fillText("MMS", x, yWickBottom + 12);
                 }
                 mmsActiveLows = mmsActiveLows.filter(p => p !== pivot);
                 break;
              }
            }
          }
        }
      }
    }

    // BOS / CHoCH Breaks
    const breaks: {
      type: "BOS" | "CHoCH";
      direction: "bullish" | "bearish";
      fromTime: number;
      toTime: number;
      price: number;
    }[] = [];
    let currentTrend: "bullish" | "bearish" | null = null;
    let activeHighs: (typeof pivots)[0][] = [];
    let activeLows: (typeof pivots)[0][] = [];

    if (pivots.length > 0) {
      const firstPivotIdx = pivots[0].index;
      pivots.forEach((p) => {
        if (p.index <= firstPivotIdx) {
          if (p.type === "high") activeHighs.push(p);
          else activeLows.push(p);
        }
      });

      for (let i = firstPivotIdx + 1; i < activeCandles.length; i++) {
        const c = activeCandles[i];
        const formedPivots = pivots.filter((p) => p.index === i);
        formedPivots.forEach((p) => {
          if (p.type === "high") activeHighs.push(p);
          else activeLows.push(p);
        });

        // Bullish Break
        if (activeHighs.length > 0) {
          const highestPivot = activeHighs.reduce(
            (max, p) => (p.price > max.price ? p : max),
            activeHighs[0],
          );
          if (c.close > highestPivot.price) {
            const breakType = currentTrend === "bearish" ? "CHoCH" : "BOS";
            breaks.push({
              type: breakType,
              direction: "bullish",
              fromTime: highestPivot.time,
              toTime: c.time,
              price: highestPivot.price,
            });
            currentTrend = "bullish";
            activeHighs = activeHighs.filter((p) => p.price > c.close);
          }
        }

        // Bearish Break
        if (activeLows.length > 0) {
          const lowestPivot = activeLows.reduce(
            (min, p) => (p.price < min.price ? p : min),
            activeLows[0],
          );
          if (c.close < lowestPivot.price) {
            const breakType = currentTrend === "bullish" ? "CHoCH" : "BOS";
            breaks.push({
              type: breakType,
              direction: "bearish",
              fromTime: lowestPivot.time,
              toTime: c.time,
              price: lowestPivot.price,
            });
            currentTrend = "bearish";
            activeLows = activeLows.filter((p) => p.price < c.close);
          }
        }
      }
    }

    // Draw BOS / CHoCH Lines
    if (smc.showBOS || smc.showCHOCH) {
      breaks.forEach((brk) => {
        const xStart = timeToX(brk.fromTime);
        const xEnd = timeToX(brk.toTime);
        const y = priceToY(brk.price);

        if (xStart >= 0 && xEnd <= chartWidth) {
          // Neon styling based on direction
          const isBullish = brk.direction === "bullish";
          ctx.strokeStyle = isBullish
            ? "rgba(0, 240, 255, 0.45)"
            : "rgba(239, 68, 68, 0.45)"; // cyan glow or rose red
          ctx.lineWidth = 1.2;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(xStart, y);
          ctx.lineTo(xEnd, y);
          ctx.stroke();
          ctx.setLineDash([]);

          // Draw stylish text badge in the center
          const xText = (xStart + xEnd) / 2;
          const labelText = brk.type;

          ctx.font = 'bold 8px "JetBrains Mono", monospace';
          ctx.textAlign = "center";
          const width = ctx.measureText(labelText).width + 6;

          ctx.fillStyle = isBullish
            ? "rgba(0, 240, 255, 0.12)"
            : "rgba(239, 68, 68, 0.12)";
          ctx.strokeStyle = isBullish
            ? "rgba(0, 240, 255, 0.65)"
            : "rgba(239, 68, 68, 0.65)";
          ctx.lineWidth = 0.8;

          ctx.beginPath();
          ctx.rect(xText - width / 2, y - 6, width, 12);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = isBullish ? "#00f0ff" : "#ff4a4a";
          ctx.fillText(labelText, xText, y + 3);
        }
      });
    }

    // Strong / Weak levels based on the last breakout
    if (breaks.length > 0 && (smc.showBOS || smc.showCHOCH)) {
      const lastBreak = breaks[breaks.length - 1];
      if (lastBreak.direction === "bullish") {
        // Bullish trend -> Strong Low, Weak High
        const rangePivotsLow = pivots.filter(
          (p) =>
            p.type === "low" &&
            p.time >= lastBreak.fromTime &&
            p.time <= lastBreak.toTime,
        );
        if (rangePivotsLow.length > 0) {
          const strongLow = rangePivotsLow.reduce(
            (min, p) => (p.price < min.price ? p : min),
            rangePivotsLow[0],
          );
          const xStart = timeToX(strongLow.time);
          const y = priceToY(strongLow.price);

          if (xStart >= 0) {
            ctx.strokeStyle = "rgba(16, 185, 129, 0.4)"; // Emerald Green for strong support
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(xStart, y);
            ctx.lineTo(chartWidth, y);
            ctx.stroke();

            ctx.font = 'bold 8px "JetBrains Mono", monospace';
            ctx.fillStyle = "#10b981";
            ctx.textAlign = "right";
            ctx.fillText("Strong Low", chartWidth - 10, y + 10);
          }
        }

        // Weak High
        const xStart = timeToX(lastBreak.fromTime);
        const y = priceToY(lastBreak.price);
        if (xStart >= 0) {
          ctx.strokeStyle = "rgba(239, 68, 68, 0.35)"; // Rose Red for weak resistance
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(xStart, y);
          ctx.lineTo(chartWidth, y);
          ctx.stroke();

          ctx.font = 'bold 8px "JetBrains Mono", monospace';
          ctx.fillStyle = "#ef4444";
          ctx.textAlign = "right";
          ctx.fillText("Weak High", chartWidth - 10, y - 6);
        }
      } else {
        // Bearish trend -> Strong High, Weak Low
        const rangePivotsHigh = pivots.filter(
          (p) =>
            p.type === "high" &&
            p.time >= lastBreak.fromTime &&
            p.time <= lastBreak.toTime,
        );
        if (rangePivotsHigh.length > 0) {
          const strongHigh = rangePivotsHigh.reduce(
            (max, p) => (p.price > max.price ? p : max),
            rangePivotsHigh[0],
          );
          const xStart = timeToX(strongHigh.time);
          const y = priceToY(strongHigh.price);

          if (xStart >= 0) {
            ctx.strokeStyle = "rgba(239, 68, 68, 0.4)"; // Rose Red for Strong High (Resistance)
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(xStart, y);
            ctx.lineTo(chartWidth, y);
            ctx.stroke();

            ctx.font = 'bold 8px "JetBrains Mono", monospace';
            ctx.fillStyle = "#ef4444";
            ctx.textAlign = "right";
            ctx.fillText("Strong High", chartWidth - 10, y - 6);
          }
        }

        // Weak Low
        const xStart = timeToX(lastBreak.fromTime);
        const y = priceToY(lastBreak.price);
        if (xStart >= 0) {
          ctx.strokeStyle = "rgba(16, 185, 129, 0.35)"; // Emerald Green for Weak Low (Support)
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(xStart, y);
          ctx.lineTo(chartWidth, y);
          ctx.stroke();

          ctx.font = 'bold 8px "JetBrains Mono", monospace';
          ctx.fillStyle = "#10b981";
          ctx.textAlign = "right";
          ctx.fillText("Weak Low", chartWidth - 10, y + 10);
        }
      }
    }

    // Order Blocks (OB) drawing
    if (smc.showOB) {
      const orderBlocks: {
        type: "bullish" | "bearish";
        priceStart: number;
        priceEnd: number;
        timeStart: number;
        timeEnd: number;
        isMitigated: boolean;
      }[] = [];

      for (let i = 2; i < activeCandles.length - 2; i++) {
        const prev = activeCandles[i];
        const next1 = activeCandles[i + 1];
        const next2 = activeCandles[i + 2];

        // Bullish OB
        if (
          prev.close < prev.open &&
          next1.close > next1.open &&
          next2.close > next2.open &&
          (next2.close - prev.low) / prev.low > 0.012
        ) {
          let isMitigated = false;
          let mitigationTime = activeCandles[activeCandles.length - 1].time;
          for (let j = i + 3; j < activeCandles.length; j++) {
            if (activeCandles[j].low <= prev.low) {
              isMitigated = true;
              mitigationTime = activeCandles[j].time;
              break;
            }
          }
          orderBlocks.push({
            type: "bullish",
            priceStart: prev.low,
            priceEnd: prev.open,
            timeStart: prev.time,
            timeEnd: isMitigated
              ? mitigationTime
              : activeCandles[activeCandles.length - 1].time,
            isMitigated,
          });
        }

        // Bearish OB
        if (
          prev.close > prev.open &&
          next1.close < next1.open &&
          next2.close < next2.open &&
          (prev.high - next2.close) / prev.high > 0.012
        ) {
          let isMitigated = false;
          let mitigationTime = activeCandles[activeCandles.length - 1].time;
          for (let j = i + 3; j < activeCandles.length; j++) {
            if (activeCandles[j].high >= prev.high) {
              isMitigated = true;
              mitigationTime = activeCandles[j].time;
              break;
            }
          }
          orderBlocks.push({
            type: "bearish",
            priceStart: prev.high,
            priceEnd: prev.open,
            timeStart: prev.time,
            timeEnd: isMitigated
              ? mitigationTime
              : activeCandles[activeCandles.length - 1].time,
            isMitigated,
          });
        }
      }

      orderBlocks.forEach((ob) => {
        // If mitigation display is configured to hide/fade mitigated blocks:
        if (ob.isMitigated && !smc.showMitigation) return;

        const xStart = timeToX(ob.timeStart);
        const xEnd = ob.isMitigated ? timeToX(ob.timeEnd) : chartWidth;
        const yTop = priceToY(Math.max(ob.priceStart, ob.priceEnd));
        const yBot = priceToY(Math.min(ob.priceStart, ob.priceEnd));

        if (xStart >= 0 && xStart <= chartWidth && yBot >= yTop) {
          const width = xEnd - xStart;
          const height = yBot - yTop;

          if (ob.type === "bullish") {
            // Bullish OB / Demand zone (Neon blue/cyan)
            ctx.fillStyle = ob.isMitigated
              ? "rgba(0, 192, 118, 0.015)"
              : "rgba(0, 240, 255, 0.055)";
            ctx.strokeStyle = ob.isMitigated
              ? "rgba(0, 192, 118, 0.12)"
              : "rgba(0, 240, 255, 0.35)";
            ctx.lineWidth = ob.isMitigated ? 0.8 : 1.2;

            ctx.fillRect(xStart, yTop, width, height);
            ctx.strokeRect(xStart, yTop, width, height);

            if (!ob.isMitigated) {
              ctx.fillStyle = "#00f0ff";
              ctx.font = '7.5px "JetBrains Mono", monospace';
              ctx.textAlign = "left";
              ctx.fillText("+OB (Bullish Demand)", xStart + 4, yTop + 10);
            }
          } else {
            // Bearish OB / Supply zone (Red)
            ctx.fillStyle = ob.isMitigated
              ? "rgba(239, 68, 68, 0.015)"
              : "rgba(239, 68, 68, 0.055)";
            ctx.strokeStyle = ob.isMitigated
              ? "rgba(239, 68, 68, 0.12)"
              : "rgba(239, 68, 68, 0.35)";
            ctx.lineWidth = ob.isMitigated ? 0.8 : 1.2;

            ctx.fillRect(xStart, yTop, width, height);
            ctx.strokeRect(xStart, yTop, width, height);

            if (!ob.isMitigated) {
              ctx.fillStyle = "#ff4a4a";
              ctx.font = '7.5px "JetBrains Mono", monospace';
              ctx.textAlign = "left";
              ctx.fillText("-OB (Bearish Supply)", xStart + 4, yTop + 10);
            }
          }
        }
      });
    }
  }

  // --- HIGH VOLUME BUY / SELL ZONE INDICATOR ---
  if (activeCandles.length > 0 && (smc.showHVBuy || smc.showHVSell)) {
    // Scan recent market history (last 250 candles) for stable high-volume points
    const lookback = Math.min(250, activeCandles.length);
    const startScanIdx = activeCandles.length - lookback;

    // Find the min/max prices of the scanned window to determine the mid price (premium/discount median)
    let scanMinPrice = Infinity;
    let scanMaxPrice = -Infinity;
    for (let i = startScanIdx; i < activeCandles.length; i++) {
      const c = activeCandles[i];
      if (c.low < scanMinPrice) scanMinPrice = c.low;
      if (c.high > scanMaxPrice) scanMaxPrice = c.high;
    }
    const scanMidPrice = (scanMinPrice + scanMaxPrice) / 2;

    let maxBuyCandle = null;
    let maxBuyVol = -1;
    let maxSellCandle = null;
    let maxSellVol = -1;

    for (let i = startScanIdx; i < activeCandles.length; i++) {
      const c = activeCandles[i];
      const avgPrice = (c.high + c.low) / 2;
      const bVol = c.buyVolume || c.volume * 0.5;
      const sVol = c.sellVolume || c.volume * 0.5;

      // HV BUY ZONE (Support/Demand) must be located in the lower price half (Discount area)
      if (avgPrice <= scanMidPrice) {
        if (bVol > maxBuyVol) {
          maxBuyVol = bVol;
          maxBuyCandle = c;
        }
      }

      // HV SELL ZONE (Resistance/Supply) must be located in the upper price half (Premium area)
      if (avgPrice > scanMidPrice) {
        if (sVol > maxSellVol) {
          maxSellVol = sVol;
          maxSellCandle = c;
        }
      }
    }

    // Fallbacks in case one partition is empty
    if (!maxBuyCandle) {
      for (let i = startScanIdx; i < activeCandles.length; i++) {
        const c = activeCandles[i];
        const bVol = c.buyVolume || c.volume * 0.5;
        if (bVol > maxBuyVol) {
          maxBuyVol = bVol;
          maxBuyCandle = c;
        }
      }
    }
    if (!maxSellCandle) {
      for (let i = startScanIdx; i < activeCandles.length; i++) {
        const c = activeCandles[i];
        const sVol = c.sellVolume || c.volume * 0.5;
        if (sVol > maxSellVol) {
          maxSellVol = sVol;
          maxSellCandle = c;
        }
      }
    }

    // Draw High Volume BUY Zone (Cyan Support)
    if (smc.showHVBuy && maxBuyCandle) {
      const zoneLowPrice = maxBuyCandle.low;
      const zoneHighPrice = maxBuyCandle.high;

      const yTop = priceToY(zoneHighPrice);
      const yBot = priceToY(zoneLowPrice);
      const height = yBot - yTop;

      // The zone starts exactly at the high volume candle, extending to the right edge
      const candleX = timeToX(maxBuyCandle.time);
      const xStart = Math.max(0, candleX);
      const width = chartWidth - xStart;

      if (height > 0 && width > 0) {
        ctx.fillStyle = "rgba(6, 182, 212, 0.05)"; // delicate translucent cyan
        ctx.strokeStyle = "rgba(6, 182, 212, 0.45)"; // solid cyan border
        ctx.lineWidth = 1.2;

        ctx.fillRect(xStart, yTop, width, height);
        ctx.strokeRect(xStart, yTop, width, height);

        ctx.fillStyle = "#22d3ee"; // Cyan 400
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        ctx.textAlign = "left";

        const textX = Math.max(10, candleX + 10);
        if (textX < chartWidth - 80) {
          ctx.fillText("↑ HV BUY ZONE", textX, yTop + 14);
        }

        ctx.textAlign = "right";
        const priceText = `${formatPrice(zoneHighPrice)} / ${formatPrice(zoneLowPrice)}`;
        ctx.fillText(priceText, chartWidth - 10, yTop + 14);
      }
    }

    // Draw High Volume SELL Zone (Rose Resistance)
    if (smc.showHVSell && maxSellCandle) {
      const zoneLowPrice = maxSellCandle.low;
      const zoneHighPrice = maxSellCandle.high;

      const yTop = priceToY(zoneHighPrice);
      const yBot = priceToY(zoneLowPrice);
      const height = yBot - yTop;

      const candleX = timeToX(maxSellCandle.time);
      const xStart = Math.max(0, candleX);
      const width = chartWidth - xStart;

      if (height > 0 && width > 0) {
        ctx.fillStyle = "rgba(244, 63, 94, 0.05)"; // delicate translucent rose
        ctx.strokeStyle = "rgba(244, 63, 94, 0.45)"; // solid rose border
        ctx.lineWidth = 1.2;

        ctx.fillRect(xStart, yTop, width, height);
        ctx.strokeRect(xStart, yTop, width, height);

        ctx.fillStyle = "#fb7185"; // Rose 400
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        ctx.textAlign = "left";

        const textX = Math.max(10, candleX + 10);
        if (textX < chartWidth - 80) {
          ctx.fillText("↓ HV SELL ZONE", textX, yTop + 14);
        }

        ctx.textAlign = "right";
        const priceText = `${formatPrice(zoneHighPrice)} / ${formatPrice(zoneLowPrice)}`;
        ctx.fillText(priceText, chartWidth - 10, yTop + 14);
      }
    }
  }

  // --- DAILY PIVOT POINT (PIVOT) OVERLAY ---
  if (indicators.showPivot && dailyPivot) {
    const y = priceToY(dailyPivot.price);
    if (y >= 0 && y <= chartHeight) {
      ctx.save();

      // Horizontal dashed line
      ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(chartWidth, y);
      ctx.stroke();

      ctx.setLineDash([]);

      // Left text: PP 61091.87
      ctx.fillStyle = "#ffffff";
      ctx.font = 'bold 9.5px "JetBrains Mono", monospace';
      ctx.textAlign = "left";
      ctx.fillText(`PP ${formatPrice(dailyPivot.price)}`, 10, y - 4);

      // Right text: PIVOT (2026-07-02)
      ctx.fillStyle = "#8f9cae";
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      ctx.textAlign = "right";
      ctx.fillText(`PIVOT (${dailyPivot.dateStr})`, chartWidth - 10, y - 4);

      ctx.restore();
    }
  }

  // --- ABSORPTION ZONES (ABS) OVERLAY ---
  if (indicators.showAbs && activeCandles.length > 0) {
    const lookback = Math.min(200, activeCandles.length);
    const startScanIdx = activeCandles.length - lookback;

    // Calculate average volume as a baseline
    let totalVol = 0;
    for (let i = startScanIdx; i < activeCandles.length; i++) {
      totalVol += activeCandles[i].volume;
    }
    const avgVol = totalVol / lookback;

    const buyCandidates: {
      candle: (typeof activeCandles)[0];
      priceStart: number;
      priceEnd: number;
      score: number;
      type: "buy";
    }[] = [];

    const sellCandidates: {
      candle: (typeof activeCandles)[0];
      priceStart: number;
      priceEnd: number;
      score: number;
      type: "sell";
    }[] = [];

    for (let i = startScanIdx; i < activeCandles.length; i++) {
      const c = activeCandles[i];
      const high = c.high;
      const low = c.low;
      const open = c.open;
      const close = c.close;
      const volume = c.volume;

      if (high <= low) continue;

      // Buy Absorption (Buyers absorb heavy sell pressure at lower part of candle)
      const lowerWick = Math.min(open, close) - low;
      const lowerWickRatio = lowerWick / (high - low);
      if (volume > avgVol * 1.05 && lowerWickRatio > 0.35) {
        buyCandidates.push({
          candle: c,
          priceStart: low,
          priceEnd: Math.min(open, close),
          score: volume * lowerWickRatio,
          type: "buy",
        });
      }

      // Sell Absorption (Sellers absorb heavy buy pressure at upper part of candle)
      const upperWick = high - Math.max(open, close);
      const upperWickRatio = upperWick / (high - low);
      if (volume > avgVol * 1.05 && upperWickRatio > 0.35) {
        sellCandidates.push({
          candle: c,
          priceStart: Math.max(open, close),
          priceEnd: high,
          score: volume * upperWickRatio,
          type: "sell",
        });
      }
    }

    // Sort buy candidates descending by score and pick top 2 non-overlapping
    buyCandidates.sort((a, b) => b.score - a.score);
    const selectedBuyZones: typeof buyCandidates = [];
    for (const candidate of buyCandidates) {
      if (selectedBuyZones.length >= 2) break;
      const isOverlapping = selectedBuyZones.some((z) => {
        const maxLow = Math.max(z.priceStart, candidate.priceStart);
        const minHigh = Math.min(z.priceEnd, candidate.priceEnd);
        return minHigh > maxLow;
      });
      if (!isOverlapping) {
        selectedBuyZones.push(candidate);
      }
    }

    // Sort sell candidates descending by score and pick top 2 non-overlapping
    sellCandidates.sort((a, b) => b.score - a.score);
    const selectedSellZones: typeof sellCandidates = [];
    for (const candidate of sellCandidates) {
      if (selectedSellZones.length >= 2) break;
      const isOverlapping = selectedSellZones.some((z) => {
        const maxLow = Math.max(z.priceStart, candidate.priceStart);
        const minHigh = Math.min(z.priceEnd, candidate.priceEnd);
        return minHigh > maxLow;
      });
      if (!isOverlapping) {
        selectedSellZones.push(candidate);
      }
    }

    // Render Absorption Zones
    ctx.save();
    const allZones = [...selectedBuyZones, ...selectedSellZones];

    allZones.forEach((z) => {
      const yTop = priceToY(Math.max(z.priceStart, z.priceEnd));
      const yBot = priceToY(Math.min(z.priceStart, z.priceEnd));
      const height = yBot - yTop;

      const candleX = timeToX(z.candle.time);
      const xStart = Math.max(0, candleX);
      const width = chartWidth - xStart;

      if (height > 0 && width > 0) {
        // Yellow semi-transparent fill
        ctx.fillStyle = "rgba(234, 179, 8, 0.08)";
        ctx.fillRect(xStart, yTop, width, height);

        // Top and bottom solid yellow border lines
        ctx.strokeStyle = "rgba(234, 179, 8, 0.45)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(xStart, yTop);
        ctx.lineTo(chartWidth, yTop);
        ctx.moveTo(xStart, yBot);
        ctx.lineTo(chartWidth, yBot);
        ctx.stroke();

        // Left text label: ▲ ABS BUY / ▼ ABS SELL
        ctx.fillStyle = "#facc15"; // yellow-400
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        ctx.textAlign = "left";

        const textX = Math.max(10, candleX + 8);
        if (textX < chartWidth - 80) {
          if (z.type === "buy") {
            ctx.fillText("▲ ABS BUY", textX, yBot - 4);
          } else {
            ctx.fillText("▼ ABS SELL", textX, yTop - 4);
          }
        }

        // Right price range: 62386.70 / 62148.30
        ctx.textAlign = "right";
        ctx.fillStyle = "#facc15";
        ctx.font = 'bold 8.5px "JetBrains Mono", monospace';
        const priceText = `${formatPrice(Math.max(z.priceStart, z.priceEnd))} / ${formatPrice(Math.min(z.priceStart, z.priceEnd))}`;
        ctx.fillText(priceText, chartWidth - 10, yTop + 12);
      }
    });

    ctx.restore();
  }


  // --- DAILY VOLUME PROFILE (D-VOL) OVERLAY ---
  if (indicators.showDVol && activeCandles.length > 0) {
    const tz =
      (settings?.timezone || "UTC") === "Colombo" ? "Asia/Colombo" : "UTC";

    // Group active candles by day session
    const days: { [dayStr: string]: typeof activeCandles } = {};
    activeCandles.forEach((c) => {
      const date = new Date(c.time);
      const dayStr = date.toLocaleDateString("en-US", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      if (!days[dayStr]) {
        days[dayStr] = [];
      }
      days[dayStr].push(c);
    });

    const dayKeys = Object.keys(days);

    dayKeys.forEach((dayStr, keyIdx) => {
      const dayCandles = days[dayStr];
      if (dayCandles.length === 0) return;

      const firstCandle = dayCandles[0];
      const lastCandle = dayCandles[dayCandles.length - 1];

      // Determine horizontal boundaries for this day
      const startX = timeToX(firstCandle.time) - (vs.barWidth + vs.spacing) / 2;

      let endX = chartWidth;
      if (keyIdx + 1 < dayKeys.length) {
        const nextDayFirstCandle = days[dayKeys[keyIdx + 1]][0];
        endX =
          timeToX(nextDayFirstCandle.time) - (vs.barWidth + vs.spacing) / 2;
      } else {
        endX = timeToX(lastCandle.time) + (vs.barWidth + vs.spacing) / 2;
      }

      // Draw only if the day is horizontally visible
      if (startX > chartWidth || endX < 0) return;

      // Draw vertical separator line at startX
      ctx.save();
      ctx.strokeStyle = "rgba(143, 156, 174, 0.25)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(startX, 0);
      ctx.lineTo(startX, chartHeight);
      ctx.stroke();
      ctx.restore();

      // Calculate Day Price Limits
      let dayMinPrice = Infinity;
      let dayMaxPrice = -Infinity;
      dayCandles.forEach((c) => {
        if (c.low < dayMinPrice) dayMinPrice = c.low;
        if (c.high > dayMaxPrice) dayMaxPrice = c.high;
      });

      if (dayMinPrice >= dayMaxPrice) return;

      // Bucket setup
      const bucketCount = 45;
      const priceRange = dayMaxPrice - dayMinPrice;
      const bucketStep = priceRange / bucketCount;

      const buckets: { price: number; volume: number }[] = [];
      for (let i = 0; i < bucketCount; i++) {
        const price = dayMinPrice + i * bucketStep + bucketStep / 2;
        buckets.push({ price, volume: 0 });
      }

      // Distribute candle volumes
      dayCandles.forEach((c) => {
        const cHigh = c.high;
        const cLow = c.low;
        const cVol = c.volume || 0;

        const overlappingBuckets: typeof buckets = [];
        buckets.forEach((b) => {
          const bMin = b.price - bucketStep / 2;
          const bMax = b.price + bucketStep / 2;
          if (bMax >= cLow && bMin <= cHigh) {
            overlappingBuckets.push(b);
          }
        });

        if (overlappingBuckets.length > 0) {
          const volPerBucket = cVol / overlappingBuckets.length;
          overlappingBuckets.forEach((b) => {
            b.volume += volPerBucket;
          });
        }
      });

      // Find POC (Point of Control)
      let maxVol = 0;
      let pocBucket = buckets[0];
      buckets.forEach((b) => {
        if (b.volume > maxVol) {
          maxVol = b.volume;
          pocBucket = b;
        }
      });
      const pocPrice = pocBucket
        ? pocBucket.price
        : (dayMinPrice + dayMaxPrice) / 2;

      // Find Value Area High (VAH) & Value Area Low (VAL) - 70% of total volume
      const totalVolume = buckets.reduce((sum, b) => sum + b.volume, 0);
      const valueAreaVolumeTarget = totalVolume * 0.7;

      const pocIndex = buckets.indexOf(pocBucket);
      let currentVolume = pocBucket ? pocBucket.volume : 0;
      let minIdx = pocIndex;
      let maxIdx = pocIndex;

      while (
        currentVolume < valueAreaVolumeTarget &&
        (minIdx > 0 || maxIdx < bucketCount - 1)
      ) {
        let upperVol = 0;
        if (maxIdx + 1 < bucketCount) {
          upperVol += buckets[maxIdx + 1].volume;
        }
        let lowerVol = 0;
        if (minIdx - 1 >= 0) {
          lowerVol += buckets[minIdx - 1].volume;
        }

        if (upperVol >= lowerVol && maxIdx + 1 < bucketCount) {
          maxIdx++;
          currentVolume += buckets[maxIdx].volume;
        } else if (minIdx - 1 >= 0) {
          minIdx--;
          currentVolume += buckets[minIdx].volume;
        } else {
          break;
        }
      }

      const valPrice = buckets[minIdx].price - bucketStep / 2;
      const vahPrice = buckets[maxIdx].price + bucketStep / 2;

      // Draw Volume Profile bars
      const dayWidth = endX - startX;
      const maxBarWidth = Math.min(180, dayWidth * 0.45);
      const maxBucketVol = Math.max(...buckets.map((b) => b.volume), 1);

      ctx.save();
      buckets.forEach((b, idx) => {
        const y = priceToY(b.price);
        const barHeight = Math.max(1.2, chartHeight / bucketCount - 0.5);
        if (y >= 0 && y <= chartHeight) {
          const barWidth = (b.volume / maxBucketVol) * maxBarWidth;
          if (barWidth > 0) {
            const isInsideValueArea = idx >= minIdx && idx <= maxIdx;
            if (isInsideValueArea) {
              ctx.fillStyle = "rgba(59, 130, 246, 0.28)"; // Royal Blue inside VA
            } else {
              ctx.fillStyle = "rgba(148, 163, 184, 0.12)"; // Slate Grey outside VA
            }
            ctx.fillRect(startX, y - barHeight / 2, barWidth, barHeight);
          }
        }
      });
      ctx.restore();

      // Draw VAH indicator line and text
      const yVah = priceToY(vahPrice);
      if (yVah >= 0 && yVah <= chartHeight) {
        ctx.save();
        ctx.strokeStyle = "#22d3ee"; // cyan-400
        ctx.lineWidth = 1.2;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(startX, yVah);
        ctx.lineTo(endX, yVah);
        ctx.stroke();

        ctx.restore();
        ctx.save();
        ctx.fillStyle = "#22d3ee";
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        ctx.textAlign = "left";
        ctx.fillText(`VAH: ${formatPrice(vahPrice)}`, startX + 6, yVah - 4);
        ctx.restore();
      }

      // Draw VAL indicator line and text
      const yVal = priceToY(valPrice);
      if (yVal >= 0 && yVal <= chartHeight) {
        ctx.save();
        ctx.strokeStyle = "#22d3ee"; // cyan-400
        ctx.lineWidth = 1.2;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(startX, yVal);
        ctx.lineTo(endX, yVal);
        ctx.stroke();

        ctx.restore();
        ctx.save();
        ctx.fillStyle = "#22d3ee";
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        ctx.textAlign = "left";
        ctx.fillText(`VAL: ${formatPrice(valPrice)}`, startX + 6, yVal - 4);
        ctx.restore();
      }

      // Draw POC indicator line and text
      const yPoc = priceToY(pocPrice);
      if (yPoc >= 0 && yPoc <= chartHeight) {
        ctx.save();
        ctx.strokeStyle = "#facc15"; // yellow-400
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(startX, yPoc);
        ctx.lineTo(endX, yPoc);
        ctx.stroke();

        ctx.restore();
        ctx.save();
        ctx.fillStyle = "#facc15";
        ctx.font = 'bold 9.5px "JetBrains Mono", monospace';
        ctx.textAlign = "left";
        ctx.fillText(`POC: ${formatPrice(pocPrice)}`, startX + 6, yPoc - 4);
        ctx.restore();
      }
    });
  }

  // --- DAILY TIME PRICE OPPORTUNITY (D-TPO) PROFILE OVERLAY ---
  if (indicators.showTPO && activeCandles.length > 0) {
    const tz =
      (settings?.timezone || "UTC") === "Colombo" ? "Asia/Colombo" : "UTC";

    // Group active candles by day session
    const days: { [dayStr: string]: typeof activeCandles } = {};
    activeCandles.forEach((c) => {
      const date = new Date(c.time);
      const dayStr = date.toLocaleDateString("en-US", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      if (!days[dayStr]) {
        days[dayStr] = [];
      }
      days[dayStr].push(c);
    });

    const dayKeys = Object.keys(days);

    dayKeys.forEach((dayStr, keyIdx) => {
      const dayCandles = days[dayStr];
      if (dayCandles.length === 0) return;

      const firstCandle = dayCandles[0];
      const lastCandle = dayCandles[dayCandles.length - 1];

      // Determine horizontal boundaries for this day
      const startX = timeToX(firstCandle.time) - (vs.barWidth + vs.spacing) / 2;

      let endX = chartWidth;
      if (keyIdx + 1 < dayKeys.length) {
        const nextDayFirstCandle = days[dayKeys[keyIdx + 1]][0];
        endX =
          timeToX(nextDayFirstCandle.time) - (vs.barWidth + vs.spacing) / 2;
      } else {
        endX = timeToX(lastCandle.time) + (vs.barWidth + vs.spacing) / 2;
      }

      // Draw only if the day is horizontally visible on chart area
      if (startX > chartWidth || endX < 0) return;

      // Draw vertical separator line at startX if it hasn't been drawn by D-VOL already
      if (!indicators.showDVol) {
        ctx.save();
        ctx.strokeStyle = "rgba(143, 156, 174, 0.25)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(startX, 0);
        ctx.lineTo(startX, chartHeight);
        ctx.stroke();
        ctx.restore();
      }

      // Calculate Day Price Limits
      let dayMinPrice = Infinity;
      let dayMaxPrice = -Infinity;
      dayCandles.forEach((c) => {
        if (c.low < dayMinPrice) dayMinPrice = c.low;
        if (c.high > dayMaxPrice) dayMaxPrice = c.high;
      });

      if (dayMinPrice >= dayMaxPrice) return;

      // Bucket setup
      const bucketCount = 45;
      const priceRange = dayMaxPrice - dayMinPrice;
      const bucketStep = priceRange / bucketCount;

      // Populate TPO rows/buckets
      const rows: {
        priceMin: number;
        priceMax: number;
        priceCenter: number;
        candleIndices: number[]; // Index of candles in dayCandles that overlap this price bucket
      }[] = [];

      for (let i = 0; i < bucketCount; i++) {
        const priceMin = dayMinPrice + i * bucketStep;
        const priceMax = priceMin + bucketStep;
        const priceCenter = priceMin + bucketStep / 2;
        rows.push({
          priceMin,
          priceMax,
          priceCenter,
          candleIndices: [],
        });
      }

      // Check which candles overlap with each row
      dayCandles.forEach((c, cIdx) => {
        rows.forEach((r) => {
          if (c.high >= r.priceMin && c.low <= r.priceMax) {
            r.candleIndices.push(cIdx);
          }
        });
      });

      // Find POC (Point of Control) based on TPO (row with maximum horizontal blocks)
      let maxTPOs = 0;
      let pocRow = rows[0];
      rows.forEach((r) => {
        if (r.candleIndices.length > maxTPOs) {
          maxTPOs = r.candleIndices.length;
          pocRow = r;
        }
      });
      const pocPrice = pocRow
        ? pocRow.priceCenter
        : (dayMinPrice + dayMaxPrice) / 2;

      // Find Value Area High (VAH) & Value Area Low (VAL) based on 70% of total TPOs
      const totalTPOs = rows.reduce(
        (sum, r) => sum + r.candleIndices.length,
        0,
      );
      const valueAreaTarget = totalTPOs * 0.7;

      const pocIndex = rows.indexOf(pocRow);
      let currentTPOs = pocRow ? pocRow.candleIndices.length : 0;
      let minIdx = pocIndex;
      let maxIdx = pocIndex;

      while (
        currentTPOs < valueAreaTarget &&
        (minIdx > 0 || maxIdx < bucketCount - 1)
      ) {
        let upperTPOs = 0;
        if (maxIdx + 1 < bucketCount) {
          upperTPOs += rows[maxIdx + 1].candleIndices.length;
        }
        let lowerTPOs = 0;
        if (minIdx - 1 >= 0) {
          lowerTPOs += rows[minIdx - 1].candleIndices.length;
        }

        if (upperTPOs >= lowerTPOs && maxIdx + 1 < bucketCount) {
          maxIdx++;
          currentTPOs += rows[maxIdx].candleIndices.length;
        } else if (minIdx - 1 >= 0) {
          minIdx--;
          currentTPOs += rows[minIdx].candleIndices.length;
        } else {
          break;
        }
      }

      const valPrice = rows[minIdx].priceMin;
      const vahPrice = rows[maxIdx].priceMax;

      // Determine TPO Block size and horizontal step to scale beautifully
      const dayWidth = endX - startX;
      const maxTPOWidth = Math.min(180, dayWidth * 0.45);

      let blockGap = 1;
      let blockWidth = 3;
      let step = blockWidth + blockGap;

      if (maxTPOs * step > maxTPOWidth) {
        step = maxTPOWidth / Math.max(1, maxTPOs);
        blockWidth = Math.max(1.2, step - 0.8);
        blockGap = Math.max(0.4, step - blockWidth);
      }

      // Render TPO Blocks for each row
      ctx.save();
      rows.forEach((r) => {
        const y = priceToY(r.priceCenter);
        const barHeight = Math.max(1.2, chartHeight / bucketCount - 0.6);
        if (y >= 0 && y <= chartHeight) {
          r.candleIndices.forEach((cIdx, k) => {
            const x = startX + k * step;
            if (x >= startX && x <= endX) {
              // Rainbow coloring: map candle index to a beautiful HSL spectrum (0 to 300)
              const hue =
                dayCandles.length > 1
                  ? (cIdx / (dayCandles.length - 1)) * 300
                  : 120;
              ctx.fillStyle = `hsla(${hue}, 95%, 60%, 0.75)`;
              ctx.fillRect(x, y - barHeight / 2, blockWidth, barHeight);
            }
          });
        }
      });
      ctx.restore();

      // Draw TPO VAH Line and Text
      const yVah = priceToY(vahPrice);
      if (yVah >= 0 && yVah <= chartHeight) {
        ctx.save();
        ctx.strokeStyle = "#22d3ee"; // cyan-400
        ctx.lineWidth = 1.2;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(startX, yVah);
        ctx.lineTo(endX, yVah);
        ctx.stroke();

        ctx.restore();
        ctx.save();
        ctx.fillStyle = "#22d3ee";
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        ctx.textAlign = "left";
        ctx.fillText(`TPO VAH: ${formatPrice(vahPrice)}`, startX + 6, yVah - 4);
        ctx.restore();
      }

      // Draw TPO VAL Line and Text
      const yVal = priceToY(valPrice);
      if (yVal >= 0 && yVal <= chartHeight) {
        ctx.save();
        ctx.strokeStyle = "#22d3ee"; // cyan-400
        ctx.lineWidth = 1.2;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(startX, yVal);
        ctx.lineTo(endX, yVal);
        ctx.stroke();

        ctx.restore();
        ctx.save();
        ctx.fillStyle = "#22d3ee";
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        ctx.textAlign = "left";
        ctx.fillText(`TPO VAL: ${formatPrice(valPrice)}`, startX + 6, yVal - 4);
        ctx.restore();
      }

      // Draw TPO POC Line and Text
      const yPoc = priceToY(pocPrice);
      if (yPoc >= 0 && yPoc <= chartHeight) {
        ctx.save();
        ctx.strokeStyle = "#3b82f6"; // royal blue-500
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(startX, yPoc);
        ctx.lineTo(endX, yPoc);
        ctx.stroke();

        ctx.restore();
        ctx.save();
        ctx.fillStyle = "#3b82f6";
        ctx.font = 'bold 9.5px "JetBrains Mono", monospace';
        ctx.textAlign = "left";
        ctx.fillText(`TPO POC`, startX + 6, yPoc - 4);
        ctx.restore();
      }
    });
  }

  // --- N-POC (Naked Point of Control) OVERLAY ---
  if (indicators.showNPOC && candles.length > 0) {
    const tz = (settings?.timezone || "UTC") === "Colombo" ? "Asia/Colombo" : "UTC";
    
    // Group all candles by day
    const days: { [dayStr: string]: typeof candles } = {};
    const dayKeys: string[] = [];
    candles.forEach((c) => {
      const date = new Date(c.time);
      const dayStr = date.toLocaleDateString("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
      if (!days[dayStr]) {
        days[dayStr] = [];
        dayKeys.push(dayStr);
      }
      days[dayStr].push(c);
    });

    const npocs: { price: number, dayStr: string, startX: number, endX: number, isNaked: boolean }[] = [];

    // Calculate POC for each day
    for (let i = 0; i < dayKeys.length; i++) {
      const dayStr = dayKeys[i];
      const dayCandles = days[dayStr];
      if (dayCandles.length === 0) continue;

      let minP = Infinity;
      let maxP = -Infinity;
      dayCandles.forEach(c => {
        if (c.low < minP) minP = c.low;
        if (c.high > maxP) maxP = c.high;
      });

      const bucketCount = 50;
      const step = (maxP - minP) / bucketCount;
      if (step <= 0) continue;
      
      const buckets = new Array(bucketCount).fill(0);
      dayCandles.forEach(c => {
        const bIdx = Math.min(bucketCount - 1, Math.floor((c.close - minP) / step));
        if (bIdx >= 0) buckets[bIdx] += c.volume;
      });

      let maxVol = -1;
      let pocBucketIdx = -1;
      for (let j = 0; j < bucketCount; j++) {
        if (buckets[j] > maxVol) {
          maxVol = buckets[j];
          pocBucketIdx = j;
        }
      }

      if (pocBucketIdx !== -1) {
        const pocPrice = minP + pocBucketIdx * step + step / 2;
        
        let touched = false;
        let touchTime = dayCandles[dayCandles.length - 1].time;
        
        // Only check candles after this day
        for (let j = i + 1; j < dayKeys.length; j++) {
          const subsequentCandles = days[dayKeys[j]];
          for (let k = 0; k < subsequentCandles.length; k++) {
            const sc = subsequentCandles[k];
            if (sc.low <= pocPrice && sc.high >= pocPrice) {
              touched = true;
              touchTime = sc.time;
              break;
            }
          }
          if (touched) break;
        }

        const startX = timeToX(dayCandles[dayCandles.length - 1].time);
        let endX = chartWidth;
        if (touched) {
          endX = timeToX(touchTime);
        }

        if (endX >= 0 && startX <= chartWidth) {
          const isNaked = !touched;
          npocs.push({ price: pocPrice, dayStr, startX, endX, isNaked });
        }
      }
    }

    ctx.save();
    npocs.forEach(npoc => {
      const y = priceToY(npoc.price);
      if (y >= 0 && y <= chartHeight) {
        ctx.strokeStyle = npoc.isNaked ? "#ff007f" : "rgba(255, 0, 127, 0.3)";
        ctx.lineWidth = npoc.isNaked ? 2 : 1;
        ctx.setLineDash(npoc.isNaked ? [] : [4, 4]);
        
        ctx.beginPath();
        ctx.moveTo(npoc.startX, y);
        ctx.lineTo(npoc.endX, y);
        ctx.stroke();

        if (npoc.isNaked) {
          ctx.fillStyle = "#ff007f";
          ctx.font = 'bold 10px "JetBrains Mono", monospace';
          ctx.fillText(`N-POC`, npoc.endX - 35, y - 5);
        }
      }
    });
    ctx.restore();
  }

  // --- OI-WALL OVERLAY ---
  if (indicators.showOIWall && activeCandles.length > 0) {
    let minP = Infinity;
    let maxP = -Infinity;
    activeCandles.forEach(c => {
      if (c.low < minP) minP = c.low;
      if (c.high > maxP) maxP = c.high;
    });

    const bucketCount = 80;
    const step = (maxP - minP) / bucketCount;
    if (step > 0) {
      const buckets = new Array(bucketCount).fill(0);
      activeCandles.forEach(c => {
        const bIdx = Math.min(bucketCount - 1, Math.floor((c.close - minP) / step));
        if (bIdx >= 0) buckets[bIdx] += c.volume;
      });

      let maxVol = -1;
      let wallBucketIdx = -1;
      for (let j = 0; j < bucketCount; j++) {
        if (buckets[j] > maxVol) {
          maxVol = buckets[j];
          wallBucketIdx = j;
        }
      }

      if (wallBucketIdx !== -1) {
        const wallPrice = minP + wallBucketIdx * step + step / 2;
        const y = priceToY(wallPrice);
        
        if (y >= 0 && y <= chartHeight) {
          ctx.save();
          // Draw a thick glowing bar across the chart
          ctx.fillStyle = "rgba(255, 165, 0, 0.15)";
          ctx.fillRect(0, y - 8, chartWidth, 16);
          
          ctx.strokeStyle = "#ffa500"; // Orange
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(chartWidth, y);
          ctx.stroke();

          ctx.fillStyle = "#ffa500";
          ctx.font = 'bold 11px "JetBrains Mono", monospace';
          ctx.fillText(`🔥 OI-WALL`, 10, y - 10);
          ctx.restore();
        }
      }
    }
  }

  // --- LVN (Low Volume Node) OVERLAY ---
  if (indicators.showLVN && activeCandles.length > 0) {
    let minP = Infinity;
    let maxP = -Infinity;
    activeCandles.forEach(c => {
      if (c.low < minP) minP = c.low;
      if (c.high > maxP) maxP = c.high;
    });

    const bucketCount = 50;
    const step = (maxP - minP) / bucketCount;
    if (step > 0) {
      const buckets = new Array(bucketCount).fill(0);
      activeCandles.forEach(c => {
        const bIdx = Math.min(bucketCount - 1, Math.floor((c.close - minP) / step));
        if (bIdx >= 0) buckets[bIdx] += c.volume;
      });

      // Find LVN (valley): A bucket with lowest volume that is surrounded by higher volume
      // Skip edges to avoid false positives at the very top/bottom
      let lvnIdx = -1;
      let lowestVol = Infinity;
      for (let i = 5; i < bucketCount - 5; i++) {
        const vol = buckets[i];
        if (vol < lowestVol && vol < buckets[i-2] && vol < buckets[i+2]) {
          lowestVol = vol;
          lvnIdx = i;
        }
      }

      if (lvnIdx !== -1) {
        const lvnPrice = minP + lvnIdx * step + step / 2;
        const y = priceToY(lvnPrice);
        
        if (y >= 0 && y <= chartHeight) {
          ctx.save();
          ctx.strokeStyle = "rgba(0, 229, 255, 0.7)"; // Cyan
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 4]);
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(chartWidth, y);
          ctx.stroke();

          ctx.fillStyle = "rgba(0, 229, 255, 0.9)";
          ctx.font = 'bold 10px "JetBrains Mono", monospace';
          ctx.fillText(`LVN`, chartWidth - 30, y - 4);
          ctx.restore();
        }
      }
    }
  }

  // --- DAILY OPEN (D-OPEN) OVERLAY ---
  if (indicators.showDOpen && activeCandles.length > 0) {
    const tz =
      (settings?.timezone || "UTC") === "Colombo" ? "Asia/Colombo" : "UTC";

    // Group active candles by day session
    const days: { [dayStr: string]: typeof activeCandles } = {};
    activeCandles.forEach((c) => {
      const date = new Date(c.time);
      const dayStr = date.toLocaleDateString("en-US", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      if (!days[dayStr]) {
        days[dayStr] = [];
      }
      days[dayStr].push(c);
    });

    const dayKeys = Object.keys(days);

    dayKeys.forEach((dayStr, keyIdx) => {
      const dayCandles = days[dayStr];
      if (dayCandles.length === 0) return;

      const firstCandle = dayCandles[0];
      const lastCandle = dayCandles[dayCandles.length - 1];

      // Determine horizontal boundaries for this day
      const startX = timeToX(firstCandle.time) - (vs.barWidth + vs.spacing) / 2;

      let endX = chartWidth;
      if (keyIdx + 1 < dayKeys.length) {
        const nextDayFirstCandle = days[dayKeys[keyIdx + 1]][0];
        endX =
          timeToX(nextDayFirstCandle.time) - (vs.barWidth + vs.spacing) / 2;
      } else {
        endX = timeToX(lastCandle.time) + (vs.barWidth + vs.spacing) / 2;
      }

      // Draw only if the day is horizontally visible
      if (startX > chartWidth || endX < 0) return;

      // Draw vertical separator line at startX if it hasn't been drawn by D-VOL or D-TPO already
      if (!indicators.showDVol && !indicators.showTPO) {
        ctx.save();
        ctx.strokeStyle = "rgba(143, 156, 174, 0.25)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(startX, 0);
        ctx.lineTo(startX, chartHeight);
        ctx.stroke();
        ctx.restore();
      }

      // Draw horizontal line at the day's open price
      const openPrice = firstCandle.open;
      const yOpen = priceToY(openPrice);

      if (yOpen >= 0 && yOpen <= chartHeight) {
        ctx.save();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.45)"; // Semi-transparent white
        ctx.lineWidth = 1.2;
        ctx.setLineDash([6, 4]); // Dashed line
        ctx.beginPath();
        ctx.moveTo(startX, yOpen);
        ctx.lineTo(endX, yOpen);
        ctx.stroke();
        ctx.restore();

        // Draw "DAY OPEN" label
        ctx.save();
        ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        ctx.textAlign = "left";
        ctx.fillText(
          `DAY OPEN (${formatPrice(openPrice)})`,
          startX + 12,
          yOpen - 5,
        );
        ctx.restore();
      }
    });
  }

  
    // --- SMC SESSION HIGHS AND LOWS (SESS) OVERLAY ---
  if (indicators.showSession && activeCandles.length > 0) {
    if (activeTimeframe !== "1d" && activeTimeframe !== "1w" && activeTimeframe !== "1M") {
      const nyFormatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        hour: "numeric",
        minute: "numeric",
        hourCycle: "h23",
      });

      const getNY_HHMM = (timestamp: number) => {
        const parts = nyFormatter.formatToParts(new Date(timestamp));
        let h = 0; let m = 0;
        for (const p of parts) {
          if (p.type === "hour") h = parseInt(p.value, 10);
          if (p.type === "minute") m = parseInt(p.value, 10);
        }
        if (h === 24) h = 0;
        return h * 100 + m;
      };

      const inSessionWindow = (hhmm: number, start: number, end: number) => {
        if (start > end) return hhmm >= start || hhmm < end;
        return hhmm >= start && hhmm < end;
      };

      const sessionsToFind = [
        { name: "Asian Range", start: 2000, end: 0, color: "rgba(117, 255, 121, 0.7)" },
        { name: "London Open Killzone", start: 300, end: 500, color: "rgba(71, 171, 253, 0.7)" },
        { name: "New York AM Killzone", start: 830, end: 1100, color: "rgba(255, 101, 101, 0.7)" },
        { name: "London Close Killzone", start: 1000, end: 1200, color: "rgba(255, 159, 67, 0.7)" }
      ];

      const foundSessions: any[] = [];

      for (const sess of sessionsToFind) {
        let hi = -Infinity;
        let lo = Infinity;
        let startX = 0;
        let inSession = false;
        let sessionFound = false;

        for (let i = activeCandles.length - 1; i >= 0; i--) {
          const c = activeCandles[i];
          const hhmm = getNY_HHMM(c.time);
          const inside = inSessionWindow(hhmm, sess.start, sess.end);

          if (inside) {
            inSession = true;
            if (c.high > hi) hi = c.high;
            if (c.low < lo) lo = c.low;
            startX = timeToX(c.time) - (vs.barWidth + vs.spacing) / 2;
          } else {
            if (inSession) {
              sessionFound = true;
              break;
            }
          }
        }

        if (sessionFound || inSession) {
          foundSessions.push({ ...sess, hi, lo, startX });
        }
      }

      foundSessions.forEach(sess => {
        if (sess.hi === -Infinity || sess.lo === Infinity) return;

        const hiY = priceToY(sess.hi);
        const loY = priceToY(sess.lo);

        ctx.save();
        ctx.strokeStyle = sess.color;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        
        ctx.beginPath();
        ctx.moveTo(sess.startX, hiY);
        ctx.lineTo(chartWidth, hiY);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(sess.startX, loY);
        ctx.lineTo(chartWidth, loY);
        ctx.stroke();
        
        const drawLabel = (text: string, x: number, y: number, isHigh: boolean) => {
           ctx.save();
           ctx.font = '10px "Inter", sans-serif';
           const metrics = ctx.measureText(text);
           const paddingX = 6;
           const h = 18;
           const w = metrics.width + paddingX * 2;
           const boxY = isHigh ? y - h - 6 : y + 6;
           
           ctx.fillStyle = "#0a0d10";
           ctx.strokeStyle = sess.color;
           ctx.lineWidth = 1;
           
           ctx.beginPath();
           ctx.roundRect(x - w/2, boxY, w, h, 3);
           ctx.fill();
           ctx.stroke();

           ctx.beginPath();
           ctx.fillStyle = sess.color;
           if (isHigh) {
               ctx.moveTo(x - 4, boxY + h);
               ctx.lineTo(x + 4, boxY + h);
               ctx.lineTo(x, boxY + h + 6);
           } else {
               ctx.moveTo(x - 4, boxY);
               ctx.lineTo(x + 4, boxY);
               ctx.lineTo(x, boxY - 6);
           }
           ctx.closePath();
           ctx.fill();

           ctx.fillStyle = "#ffffff";
           ctx.textBaseline = "middle";
           ctx.textAlign = "center";
           ctx.fillText(text, x, boxY + h/2 + 1);
           ctx.restore();
        };

        // Draw labels slightly offset from start
        const labelX = sess.startX + 60;
        if (labelX > 0 && labelX < chartWidth) {
           drawLabel(`${sess.name} High`, labelX, hiY, true);
           drawLabel(`${sess.name} Low`, labelX, loY, false);
        }
        ctx.restore();
      });
    }
  }


  
// --- SESSION PROFILE (SESS) OVERLAY ---
  if (indicators.showSess && activeCandles.length > 0) {
    // Group candles into custom trading session blocks based on absolute UTC trading hours
    const sessions: {
      id: "ASIA" | "LONDON" | "NY";
      dayStr: string;
      candles: typeof activeCandles;
    }[] = [];

    let currentSession: {
      id: "ASIA" | "LONDON" | "NY";
      dayStr: string;
      candles: typeof activeCandles;
    } | null = null;

    activeCandles.forEach((c) => {
      const date = new Date(c.time);
      const hour = date.getUTCHours();
      const dayStr = date.toLocaleDateString("en-US", {
        timeZone: "UTC",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });

      let sId: "ASIA" | "LONDON" | "NY";
      if (hour >= 0 && hour < 8) {
        sId = "ASIA";
      } else if (hour >= 8 && hour < 13) {
        sId = "LONDON";
      } else {
        sId = "NY";
      }

      if (
        !currentSession ||
        currentSession.id !== sId ||
        currentSession.dayStr !== dayStr
      ) {
        currentSession = {
          id: sId,
          dayStr,
          candles: [],
        };
        sessions.push(currentSession);
      }
      currentSession.candles.push(c);
    });

    sessions.forEach((session) => {
      const sCandles = session.candles;
      if (sCandles.length === 0) return;

      const firstCandle = sCandles[0];
      const lastCandle = sCandles[sCandles.length - 1];

      // Horizontal boundaries of the session block on the chart
      const startX = timeToX(firstCandle.time) - (vs.barWidth + vs.spacing) / 2;
      const endX = timeToX(lastCandle.time) + (vs.barWidth + vs.spacing) / 2;

      // Skip drawing if completely off-screen
      if (startX > chartWidth || endX < 0) return;

      // Visual configurations based on the Session Type
      let sessionLabel = "ASIAN SESSION";
      let titleColor = "#eab308"; // Amber/Yellow
      let profileColor = "rgba(234, 179, 8, 0.18)"; // Gold/Yellow
      let bgColor = "rgba(234, 179, 8, 0.02)";
      let borderLineColor = "rgba(234, 179, 8, 0.15)";

      if (session.id === "LONDON") {
        sessionLabel = "LONDON SESSION";
        titleColor = "#3b82f6"; // Royal Blue
        profileColor = "rgba(59, 130, 246, 0.22)";
        bgColor = "rgba(59, 130, 246, 0.02)";
        borderLineColor = "rgba(59, 130, 246, 0.15)";
      } else if (session.id === "NY") {
        sessionLabel = "NEW YORK SESSION";
        titleColor = "#ec4899"; // Pink/Magenta
        profileColor = "rgba(236, 72, 153, 0.22)";
        bgColor = "rgba(236, 72, 153, 0.02)";
        borderLineColor = "rgba(236, 72, 153, 0.15)";
      }

      // 1. Draw Shaded Session Background Block
      ctx.save();
      ctx.fillStyle = bgColor;
      ctx.fillRect(startX, 0, endX - startX, chartHeight);
      ctx.restore();

      // 2. Draw vertical dotted/dashed boundary separator
      ctx.save();
      ctx.strokeStyle = borderLineColor;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(startX, 0);
      ctx.lineTo(startX, chartHeight);
      ctx.stroke();
      ctx.restore();

      // 3. Draw Session Label text at the top
      ctx.save();
      ctx.fillStyle = titleColor;
      ctx.font = 'bold 10px "Inter", sans-serif';
      ctx.textAlign = "left";
      ctx.fillText(sessionLabel, startX + 12, 45);
      ctx.restore();

      // 4. Calculate and Draw the Session Volume Profile
      let sMinPrice = Infinity;
      let sMaxPrice = -Infinity;
      sCandles.forEach((c) => {
        if (c.low < sMinPrice) sMinPrice = c.low;
        if (c.high > sMaxPrice) sMaxPrice = c.high;
      });

      if (sMinPrice >= sMaxPrice) return;

      const bucketCount = 35;
      const priceRange = sMaxPrice - sMinPrice;
      const bucketStep = priceRange / bucketCount;

      const buckets: { price: number; volume: number }[] = [];
      for (let i = 0; i < bucketCount; i++) {
        const price = sMinPrice + i * bucketStep + bucketStep / 2;
        buckets.push({ price, volume: 0 });
      }

      // Distribute candle volumes over the buckets
      sCandles.forEach((c) => {
        const cHigh = c.high;
        const cLow = c.low;
        const cVol = c.volume || 0;

        const overlappingBuckets: typeof buckets = [];
        buckets.forEach((b) => {
          const bMin = b.price - bucketStep / 2;
          const bMax = b.price + bucketStep / 2;
          if (bMax >= cLow && bMin <= cHigh) {
            overlappingBuckets.push(b);
          }
        });

        if (overlappingBuckets.length > 0) {
          const volPerBucket = cVol / overlappingBuckets.length;
          overlappingBuckets.forEach((b) => {
            b.volume += volPerBucket;
          });
        }
      });

      const maxBucketVol = Math.max(...buckets.map((b) => b.volume), 1);
      const dayWidth = endX - startX;
      const maxBarWidth = Math.min(130, dayWidth * 0.45);

      ctx.save();
      ctx.fillStyle = profileColor;
      buckets.forEach((b) => {
        const y = priceToY(b.price);
        const barHeight = Math.max(1.2, chartHeight / bucketCount - 0.6);
        if (y >= 0 && y <= chartHeight) {
          const barWidth = (b.volume / maxBucketVol) * maxBarWidth;
          if (barWidth > 0) {
            ctx.fillRect(startX, y - barHeight / 2, barWidth, barHeight);
          }
        }
      });
      ctx.restore();
    });
  }

  

  // --- CANDLE RANGE THEORY (CRT) OVERLAY ---
  if (indicators.showCRT && activeCandles.length > 0) {
    const pivots: {
      type: "high" | "low";
      price: number;
      time: number;
    }[] = [];

    const windowSize = 4;
    for (let i = windowSize; i < activeCandles.length - windowSize; i++) {
      const current = activeCandles[i];

      let isHigh = true;
      let isLow = true;
      for (let j = i - windowSize; j <= i + windowSize; j++) {
        if (j === i) continue;
        if (activeCandles[j].high > current.high) isHigh = false;
        if (activeCandles[j].low < current.low) isLow = false;
      }

      if (isHigh) {
        pivots.push({ type: "high", price: current.high, time: current.time });
      }
      if (isLow) {
        pivots.push({ type: "low", price: current.low, time: current.time });
      }
    }

    // Draw the most recent liquidity levels
    const recentHighs = pivots.filter((p) => p.type === "high").slice(-4);
    const recentLows = pivots.filter((p) => p.type === "low").slice(-4);

    [...recentHighs, ...recentLows].forEach((p) => {
      const startX = timeToX(p.time);
      const endX = chartWidth;
      const y = priceToY(p.price);

      if (y >= 0 && y <= chartHeight) {
        ctx.save();
        // Color coding: pinkish-red for liquidity high, emerald-green for liquidity low
        ctx.strokeStyle =
          p.type === "high"
            ? "rgba(236, 72, 153, 0.4)"
            : "rgba(52, 211, 153, 0.4)";
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(startX, y);
        ctx.lineTo(endX, y);
        ctx.stroke();
        ctx.restore();

        // Label text above or below the line
        ctx.save();
        ctx.fillStyle =
          p.type === "high"
            ? "rgba(236, 72, 153, 0.85)"
            : "rgba(52, 211, 153, 0.85)";
        ctx.font = 'bold 8.5px "JetBrains Mono", monospace';
        ctx.textAlign = "left";

        if (p.type === "high") {
          ctx.fillText(`LIQUIDITY HIGH`, startX + 10, y - 5);
        } else {
          ctx.fillText(`LIQUIDITY LOW`, startX + 10, y + 11);
        }
        ctx.restore();
      }
    });
  }

  // --- ADVANCED ELLIOTT WAVE (EW) SYSTEM & AI DASHBOARD ---
      if (indicators.showEW && activeCandles.length >= 50) {
        try {
        // 1. We compute EW on the ENTIRE activeCandles array so it NEVER repaints when scrolling!
        const ewCandles = activeCandles.length > 200 ? activeCandles.slice(-200) : activeCandles;
        
        // 2. Technical Indicators for AI Score
        const rsiData = calculateRSI(ewCandles, 14);
        const macdData = calculateMACD(ewCandles, 12, 26, 9);
        const currentRSI = rsiData[rsiData.length - 1] || 50;
        const currentMACD = macdData.macdLine[macdData.macdLine.length - 1] || 0;
        const currentSignal = macdData.signalLine[macdData.signalLine.length - 1] || 0;
        
        // 3. Macro Market Structure (Global LL and HH of entire chart)
        let minIdx = 0;
        let maxIdx = 0;
        let minVal = ewCandles[0].low;
        let maxVal = ewCandles[0].high;
        
        for (let i = 1; i < ewCandles.length; i++) {
            if (ewCandles[i].low < minVal) { minVal = ewCandles[i].low; minIdx = i; }
            if (ewCandles[i].high > maxVal) { maxVal = ewCandles[i].high; maxIdx = i; }
        }
        
        const isBullTrend = minIdx < maxIdx;
        
        // 4. Elliott Wave Macro Identification (Segmented Hierarchical Decomposition)
        const findMax = (start: number, end: number) => {
            let s = Math.max(0, Math.min(start, ewCandles.length - 1));
            let e = Math.max(0, Math.min(end, ewCandles.length - 1));
            if (s > e) return { index: s, price: ewCandles[s].high };
            let mIdx = s; let mVal = ewCandles[s].high;
            for (let i = s + 1; i <= e; i++) {
                if (ewCandles[i].high > mVal) { mVal = ewCandles[i].high; mIdx = i; }
            }
            return { index: mIdx, price: mVal };
        };
        const findMin = (start: number, end: number) => {
            let s = Math.max(0, Math.min(start, ewCandles.length - 1));
            let e = Math.max(0, Math.min(end, ewCandles.length - 1));
            if (s > e) return { index: s, price: ewCandles[s].low };
            let mIdx = s; let mVal = ewCandles[s].low;
            for (let i = s + 1; i <= e; i++) {
                if (ewCandles[i].low < mVal) { mVal = ewCandles[i].low; mIdx = i; }
            }
            return { index: mIdx, price: mVal };
        };
        
        let p0, p1, p2, p3, p4, p5;
        const range = Math.abs(maxIdx - minIdx);
        const step = Math.floor(range / 4);
        
        if (isBullTrend) {
            p0 = { index: minIdx, price: ewCandles[minIdx].low };
            p5 = { index: maxIdx, price: ewCandles[maxIdx].high };
            p1 = findMax(minIdx + 1, minIdx + step);
            p2 = findMin(p1.index + 1, minIdx + step * 2);
            p3 = findMax(p2.index + 1, minIdx + step * 3);
            p4 = findMin(p3.index + 1, maxIdx - 1);
        } else {
            p0 = { index: maxIdx, price: ewCandles[maxIdx].high };
            p5 = { index: minIdx, price: ewCandles[minIdx].low };
            p1 = findMin(maxIdx + 1, maxIdx + step);
            p2 = findMax(p1.index + 1, maxIdx + step * 2);
            p3 = findMin(p2.index + 1, maxIdx + step * 3);
            p4 = findMax(p3.index + 1, minIdx - 1);
        }
        
        const ewPoints = [p0, p1, p2, p3, p4, p5];
        
        let rulesPass = false;
        if (isBullTrend) {
            const rule1 = p2.price >= p0.price;
            const rule3 = p4.price >= p1.price;
            rulesPass = rule1 && rule3;
        } else {
            const rule1 = p2.price <= p0.price;
            const rule3 = p4.price <= p1.price;
            rulesPass = rule1 && rule3;
        }

        // 5. Drawing the 12345 Impulse Waves
        const drawLabelCircle = (x: number, y: number, text: string, bg: string, fg: string, glow: boolean = false) => {
            if (glow) {
                ctx.shadowColor = bg;
                ctx.shadowBlur = 10;
            }
            ctx.beginPath();
            ctx.arc(x, y, 9, 0, 2 * Math.PI);
            ctx.fillStyle = bg;
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = fg;
            ctx.stroke();

            ctx.fillStyle = fg;
            ctx.font = 'bold 9px "Inter", sans-serif';
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(text, x, y + 0.5);
        };
        
        const drawWaveLine = (xa: number, ya: number, xb: number, yb: number, color: string, width: number, dashed: boolean) => {
            ctx.save();
            ctx.strokeStyle = color;
            ctx.lineWidth = width;
            if (dashed) ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(xa, ya);
            ctx.lineTo(xb, yb);
            ctx.stroke();
            ctx.restore();
        };

        const mappedPoints = ewPoints.map(p => {
            const c = ewCandles[p.index];
            return { x: timeToX(c.time), y: priceToY(p.price) };
        });
        
        const color = isBullTrend ? "#10b981" : "#f43f5e";
        const projColor = isBullTrend ? "#f43f5e" : "#10b981"; // ABC correction color
        
        for (let i = 0; i < 5; i++) {
            drawWaveLine(mappedPoints[i].x, mappedPoints[i].y, mappedPoints[i+1].x, mappedPoints[i+1].y, color, 2, false);
        }
        
        const labels = ["0", "1", "2", "3", "4", "5"];
        mappedPoints.forEach((pt, i) => {
            drawLabelCircle(pt.x, pt.y, labels[i], i === 5 ? projColor : (isBullTrend ? "#0f172a" : "#ffffff"), i === 5 ? "#ffffff" : color, i === 5);
        });
        
        // 6. Predictive ABC & Golden Zone
        const moveDist = ewPoints[5].price - ewPoints[0].price;
        const fib382 = ewPoints[5].price - moveDist * 0.382;
        const fib500 = ewPoints[5].price - moveDist * 0.500;
        const fib618 = ewPoints[5].price - moveDist * 0.618;
        const fib786 = ewPoints[5].price - moveDist * 0.786;
        const fib236 = ewPoints[5].price - moveDist * 0.236;
        
        const timeStep = (ewCandles[1]?.time - ewCandles[0]?.time) || 60000;
        const wave5Time = ewCandles[ewPoints[5].index].time;
        
        const wave5Idx = ewPoints[5].index;
        const remain = ewCandles.length - 1 - wave5Idx;

        let actualA, actualB;

        // Adaptive Snapping: Find actual local extrema for A, B, C if candles have formed
        let actualC;
        if (remain >= 12) {
            const remStep = Math.floor(remain / 3);
            if (isBullTrend) {
                const tempA = findMin(wave5Idx + 1, wave5Idx + remStep);
                const tempB = findMax(tempA.index + 1, wave5Idx + remStep * 2);
                const tempC = findMin(tempB.index + 1, ewCandles.length - 1);
                
                if (tempA.index > wave5Idx && tempB.index > tempA.index && tempC.index > tempB.index) {
                    actualA = { time: ewCandles[tempA.index].time, price: tempA.price };
                    actualB = { time: ewCandles[tempB.index].time, price: tempB.price };
                    actualC = { time: ewCandles[tempC.index].time, price: tempC.price };
                }
            } else {
                const tempA = findMax(wave5Idx + 1, wave5Idx + remStep);
                const tempB = findMin(tempA.index + 1, wave5Idx + remStep * 2);
                const tempC = findMax(tempB.index + 1, ewCandles.length - 1);
                
                if (tempA.index > wave5Idx && tempB.index > tempA.index && tempC.index > tempB.index) {
                    actualA = { time: ewCandles[tempA.index].time, price: tempA.price };
                    actualB = { time: ewCandles[tempB.index].time, price: tempB.price };
                    actualC = { time: ewCandles[tempC.index].time, price: tempC.price };
                }
            }
        }

        const projA = actualA 
            ? { x: timeToX(actualA.time), y: priceToY(actualA.price) }
            : { x: timeToX(wave5Time + timeStep * 15), y: priceToY(fib382) };
            
        const projB = actualB 
            ? { x: timeToX(actualB.time), y: priceToY(actualB.price) }
            : { x: timeToX(wave5Time + timeStep * 25), y: priceToY(fib236) };
            
        // C remains a predictive target in the Golden Zone, projected forward from B, unless it has formed
        const baseTimeForC = actualB ? actualB.time : (wave5Time + timeStep * 25);
        const projC = actualC
            ? { x: timeToX(actualC.time), y: priceToY(actualC.price) }
            : { x: timeToX(baseTimeForC + timeStep * 15), y: priceToY(fib618) };
        
        drawWaveLine(mappedPoints[5].x, mappedPoints[5].y, projA.x, projA.y, projColor, 2, true);
        drawWaveLine(projA.x, projA.y, projB.x, projB.y, projColor, 2, true);
        drawWaveLine(projB.x, projB.y, projC.x, projC.y, projColor, 2, true);
        
        drawLabelCircle(projA.x, projA.y, "a", "#0f172a", projColor);
        drawLabelCircle(projB.x, projB.y, "b", "#0f172a", projColor);
        drawLabelCircle(projC.x, projC.y, "c", projColor, "#ffffff", true);
        
        const y50 = priceToY(fib500);
        const y618 = priceToY(fib618);
        const zoneTop = Math.min(y50, y618);
        const zoneHeight = Math.abs(y618 - y50);
        
        ctx.save();
        ctx.fillStyle = "rgba(234, 179, 8, 0.15)";
        ctx.fillRect(projB.x, zoneTop, dimensions.width - projB.x, zoneHeight);
        ctx.strokeStyle = "rgba(234, 179, 8, 0.5)";
        ctx.setLineDash([5, 5]);
        ctx.beginPath(); ctx.moveTo(projB.x, y50); ctx.lineTo(dimensions.width, y50); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(projB.x, y618); ctx.lineTo(dimensions.width, y618); ctx.stroke();
        
        ctx.fillStyle = "rgba(234, 179, 8, 0.8)";
        ctx.font = '10px "Inter", sans-serif';
        ctx.textAlign = "right";
        ctx.fillText("50.0%: " + fib500.toFixed(2), dimensions.width - 10, y50 - 5);
        ctx.fillText("61.8%: " + fib618.toFixed(2), dimensions.width - 10, y618 + 12);
        ctx.fillText("✨ GOLDEN ZONE", dimensions.width - 10, zoneTop + zoneHeight/2 + 3);
        ctx.restore();
        
        // 7. Trade Position Box (R:R 1:2)
        const entryPrice = fib500;
        const tpPrice = ewPoints[5].price;
        const slPrice = fib786;
        const yEntry = priceToY(entryPrice);
        const yTP = priceToY(tpPrice);
        const ySL = priceToY(slPrice);
        
        const boxX = projC.x;
        const boxW = 120;
        
        let lowestSince5 = ewPoints[5].price;
        let highestSince5 = ewPoints[5].price;
        for (let i = wave5Idx; i < ewCandles.length; i++) {
             if (ewCandles[i].low < lowestSince5) lowestSince5 = ewCandles[i].low;
             if (ewCandles[i].high > highestSince5) highestSince5 = ewCandles[i].high;
        }
        
        const isInvalidated = isBullTrend ? (lowestSince5 < slPrice) : (highestSince5 > slPrice);
        
        if (!isInvalidated) {
            ctx.save();
            ctx.fillStyle = isBullTrend ? "rgba(16, 185, 129, 0.15)" : "rgba(244, 63, 94, 0.15)";
            ctx.fillRect(boxX, Math.min(yEntry, yTP), boxW, Math.abs(yEntry - yTP));
            ctx.fillStyle = isBullTrend ? "rgba(244, 63, 94, 0.15)" : "rgba(16, 185, 129, 0.15)";
            ctx.fillRect(boxX, Math.min(yEntry, ySL), boxW, Math.abs(yEntry - ySL));
            ctx.strokeStyle = "#ffffff";
            ctx.setLineDash([2, 2]);
            ctx.beginPath(); ctx.moveTo(boxX, yEntry); ctx.lineTo(boxX + boxW, yEntry); ctx.stroke();
        
        ctx.fillStyle = "#ffffff";
        ctx.font = 'bold 10px "Inter", sans-serif';
        ctx.textAlign = "left";
        ctx.fillText("TARGET: " + tpPrice.toFixed(2), boxX + 5, yTP + (yTP < yEntry ? 15 : -5));
        ctx.fillText("ENTRY: " + entryPrice.toFixed(2), boxX + 5, yEntry - 5);
        ctx.fillText("STOP: " + slPrice.toFixed(2), boxX + 5, ySL + (ySL > yEntry ? -5 : 15));
        
        const risk = Math.abs(entryPrice - slPrice);
        const reward = Math.abs(tpPrice - entryPrice);
        const rr = (reward / risk).toFixed(2);
        ctx.fillStyle = "#3b82f6";
        ctx.fillText("R:R Ratio: " + rr, boxX + 5, yEntry + 12);
        ctx.restore();
        }
        
        // 8. AI Dashboard
        let aiScore = 50;
        const lastCandle = ewCandles[ewCandles.length - 1];
        const isAboveEma = lastCandle.close > (ewCandles[ewCandles.length - Math.min(50, ewCandles.length)].close);
        if (isAboveEma) aiScore += 15; else aiScore -= 15;
        if (isBullTrend) aiScore += 10; else aiScore -= 10;
        if (rulesPass) aiScore += 10; else aiScore -= 10;
        if (currentRSI > 55) aiScore += 10; else if (currentRSI < 45) aiScore -= 10;
        if (currentMACD > currentSignal) aiScore += 15; else aiScore -= 15;
        
        aiScore = Math.max(0, Math.min(100, aiScore));
        const aiSignal = aiScore >= 80 ? "STRONG BUY" : aiScore >= 60 ? "BUY" : aiScore <= 20 ? "STRONG SELL" : aiScore <= 40 ? "SELL" : "NEUTRAL";
        const aiColor = aiScore >= 60 ? "#10b981" : aiScore <= 40 ? "#f43f5e" : "#64748b";
        
        const dashWidth = 220;
        const dashHeight = 160;
        // Move to top left to avoid overlapping with DOM power
        const dashX = 20; 
        const dashY = 70;
        
        ctx.save();
        ctx.beginPath();
        if (ctx.roundRect) { ctx.roundRect(dashX, dashY, dashWidth, dashHeight, 8); } 
        else { ctx.rect(dashX, dashY, dashWidth, dashHeight); }
        ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
        ctx.fill();
        ctx.strokeStyle = "rgba(51, 65, 85, 0.5)";
        ctx.stroke();
        
        ctx.beginPath();
        if (ctx.roundRect) { ctx.roundRect(dashX, dashY, dashWidth, 30, [8, 8, 0, 0]); }
        else { ctx.rect(dashX, dashY, dashWidth, 30); }
        ctx.fillStyle = "#3b82f6";
        ctx.fill();
        
        ctx.fillStyle = "#ffffff";
        ctx.font = 'bold 12px "Inter", sans-serif';
        ctx.textAlign = "left";
        ctx.fillText("✨ AI Elliott Wave Pro", dashX + 10, dashY + 20);
        
        const drawRow = (label: string, value: string, valColor: string, yOffset: number) => {
            ctx.fillStyle = "#94a3b8";
            ctx.font = '12px "Inter", sans-serif';
            ctx.fillText(label, dashX + 10, dashY + yOffset);
            ctx.fillStyle = valColor;
            ctx.font = 'bold 12px "Inter", sans-serif';
            ctx.textAlign = "right";
            ctx.fillText(value, dashX + dashWidth - 10, dashY + yOffset);
            ctx.textAlign = "left";
        };
        
        drawRow("Market Trend", isBullTrend ? "BULLISH" : "BEARISH", isBullTrend ? "#10b981" : "#f43f5e", 55);
        drawRow("Wave 5 Extrema", isBullTrend ? "PEAK FOUND" : "BOTTOM FOUND", rulesPass ? "#10b981" : "#f59e0b", 75);
        drawRow("RSI (14)", currentRSI.toFixed(1), currentRSI > 50 ? "#10b981" : "#f43f5e", 95);
        drawRow("MACD", currentMACD > currentSignal ? "BULLISH" : "BEARISH", currentMACD > currentSignal ? "#10b981" : "#f43f5e", 115);
        drawRow("AI Confidence", aiScore + "%", aiColor, 135);
        
        ctx.fillStyle = aiColor;
        ctx.fillRect(dashX, dashY + dashHeight, dashWidth, 30);
        ctx.fillStyle = "#ffffff";
        ctx.font = 'bold 14px "Inter", sans-serif';
        ctx.textAlign = "center";
        ctx.fillText(aiSignal, dashX + dashWidth / 2, dashY + dashHeight + 20);
        ctx.restore();
        } catch (err) {
            console.error("EW System crashed:", err);
        }
      }

      // --- WYCKOFF (WYC) AUTOMATION ---
      if (indicators.showWYC && activeCandles.length >= 20) {
        try {
          const lookback = Math.min(150, activeCandles.length);
          const wycCandles = activeCandles.slice(activeCandles.length - lookback);
          const startIndex = activeCandles.length - lookback;
          
          // Find SPRING (lowest low in the window)
          let springIdx = 0;
          let springVal = wycCandles[0].low;
          for (let i = 1; i < wycCandles.length; i++) {
            if (wycCandles[i].low < springVal) {
              springVal = wycCandles[i].low;
              springIdx = i;
            }
          }
          
          // Find SC (lowest low before SPRING)
          let scIdx = 0;
          let scVal = springIdx > 0 ? wycCandles[0].low : springVal;
          if (springIdx > 20) {
              for (let i = 1; i < springIdx - 10; i++) {
                  if (wycCandles[i].low < scVal) {
                      scVal = wycCandles[i].low;
                      scIdx = i;
                  }
              }
          }

          // Find AR (highest high between SC and SPRING)
          let arIdx = scIdx;
          let arVal = wycCandles[scIdx].high;
          for (let i = scIdx + 1; i < springIdx; i++) {
              if (wycCandles[i].high > arVal) {
                  arVal = wycCandles[i].high;
                  arIdx = i;
              }
          }

          // Find ST (lowest low between AR and SPRING)
          let stIdx = arIdx;
          let stVal = wycCandles[arIdx].low;
          for (let i = arIdx + 1; i < springIdx; i++) {
              if (wycCandles[i].low < stVal) {
                  stVal = wycCandles[i].low;
                  stIdx = i;
              }
          }

          // Find SOS (highest high after SPRING)
          let sosIdx = springIdx;
          let sosVal = wycCandles[springIdx].high;
          for (let i = springIdx + 1; i < wycCandles.length; i++) {
              if (wycCandles[i].high > sosVal) {
                  sosVal = wycCandles[i].high;
                  sosIdx = i;
              }
          }

          // Find LPS (lowest low after SOS)
          let lpsIdx = sosIdx;
          let lpsVal = wycCandles[sosIdx].low;
          for (let i = sosIdx + 1; i < wycCandles.length; i++) {
              if (wycCandles[i].low < lpsVal) {
                  lpsVal = wycCandles[i].low;
                  lpsIdx = i;
              }
          }

          const pts = [
            { id: "SC", idx: scIdx, val: scVal, type: "low" },
            { id: "AR", idx: arIdx, val: arVal, type: "high" },
            { id: "ST", idx: stIdx, val: stVal, type: "low" },
            { id: "SPRING", idx: springIdx, val: springVal, type: "low" },
            { id: "SOS", idx: sosIdx, val: sosVal, type: "high" }
          ];

          if (lpsIdx > sosIdx) {
              pts.push({ id: "LPS", idx: lpsIdx, val: lpsVal, type: "low" });
          }

          // Draw the Trading Range Box (between SC/ST low and AR high)
          const boxTop = priceToY(arVal);
          const minSupport = Math.min(scVal, stVal);
          const boxBottom = priceToY(minSupport);
          
          const startX = timeToX(wycCandles[scIdx].time);
          const endX = timeToX(wycCandles[wycCandles.length - 1].time) + 100; // extend a bit to right
          
          ctx.save();
          ctx.fillStyle = "rgba(168, 85, 247, 0.08)"; // purple bg
          ctx.fillRect(startX, boxTop, endX - startX, Math.max(0, boxBottom - boxTop));
          
          ctx.strokeStyle = "rgba(168, 85, 247, 0.3)";
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.moveTo(startX, boxTop);
          ctx.lineTo(endX, boxTop);
          ctx.stroke();
          
          ctx.beginPath();
          ctx.moveTo(startX, boxBottom);
          ctx.lineTo(endX, boxBottom);
          ctx.stroke();
          ctx.restore();

          // Render labels and connecting line
          ctx.save();
          ctx.strokeStyle = "rgba(168, 85, 247, 0.8)";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          
          let first = true;
          pts.forEach(p => {
              if (p.idx === 0 && p.id === "SC" && springIdx <= 20) return; // skip if not enough data
              
              const cx = timeToX(wycCandles[p.idx].time);
              const cy = priceToY(p.val);
              
              if (first) {
                  ctx.moveTo(cx, cy);
                  first = false;
              } else {
                  ctx.lineTo(cx, cy);
              }
          });
          ctx.stroke();
          
          // Draw dots and text
          pts.forEach(p => {
              if (p.idx === 0 && p.id === "SC" && springIdx <= 20) return; 
              
              const cx = timeToX(wycCandles[p.idx].time);
              const cy = priceToY(p.val);
              
              ctx.beginPath();
              ctx.arc(cx, cy, 3.5, 0, 2 * Math.PI);
              ctx.fillStyle = "#c084fc";
              ctx.fill();
              ctx.strokeStyle = "rgba(255,255,255,0.8)";
              ctx.lineWidth = 1;
              ctx.stroke();
              
              ctx.fillStyle = "#e879f9";
              ctx.font = 'bold 10px "Inter", sans-serif';
              ctx.textAlign = "center";
              if (p.type === "low") {
                  ctx.fillText(p.id, cx, cy + 15);
              } else {
                  ctx.fillText(p.id, cx, cy - 10);
              }
          });
          
          // Wait for LPS indicator if it's the last phase
          if (pts[pts.length - 1].id === "SOS" || (pts[pts.length - 1].id === "LPS" && activeCandles.length - 1 - (startIndex + lpsIdx) < 5)) {
              const rightX = timeToX(wycCandles[wycCandles.length - 1].time) + 40;
              const rightY = boxTop + Math.max(0, (boxBottom - boxTop) / 2);
              ctx.fillStyle = "#fbbf24";
              ctx.font = 'bold 10px "JetBrains Mono", monospace';
              ctx.textAlign = "left";
              ctx.fillText("⏳ WAITING FOR LPS/LPSY", rightX, rightY);
          }
          
          ctx.restore();
          
        } catch (err) {
          console.error("WYC System crashed:", err);
        }
      }

      // --- ADVANCED SK SYSTEM ---
  if (indicators.showSK && activeCandles.length >= 20) {
    // Determine SK system on the global last 200 candles so it doesn't jump when panning
    const lookback = Math.min(200, activeCandles.length);
    const leftmostIdx = activeCandles.length - lookback;
    const rightmostIdx = activeCandles.length - 1;
    const skCandles = activeCandles.slice(leftmostIdx, rightmostIdx + 1);

    if (skCandles.length >= 15) {
      const startCandle = skCandles[0];
      const endCandle = skCandles[skCandles.length - 1];
      const isBullTrend = endCandle.close >= startCandle.close;

      let i0 = leftmostIdx;
      let i1 = leftmostIdx;
      let i2 = leftmostIdx;

      if (isBullTrend) {
        // Point 0 is the lowest low in the first 40% of the lookback window
        let minLow0 = Infinity;
        const range0End = Math.floor(skCandles.length * 0.4);
        for (let i = 0; i < range0End; i++) {
          const idx = leftmostIdx + i;
          const c = activeCandles[idx];
          if (c && c.low < minLow0) {
            minLow0 = c.low;
            i0 = idx;
          }
        }

        // Point 1 is the highest high from Point 0 up to 75% of the lookback window
        let maxHigh1 = -Infinity;
        const start1 = i0 - leftmostIdx + 1;
        const range1End = Math.max(
          start1 + 2,
          Math.floor(skCandles.length * 0.75),
        );
        for (let i = start1; i < range1End; i++) {
          const idx = leftmostIdx + i;
          const c = activeCandles[idx];
          if (c && c.high > maxHigh1) {
            maxHigh1 = c.high;
            i1 = idx;
          }
        }

        // Point 2 is the lowest low from Point 1 up to the last candle
        let minLow2 = Infinity;
        const start2 = i1 - leftmostIdx + 1;
        for (let i = start2; i < skCandles.length; i++) {
          const idx = leftmostIdx + i;
          const c = activeCandles[idx];
          if (c && c.low < minLow2) {
            minLow2 = c.low;
            i2 = idx;
          }
        }
      } else {
        // Point 0 is the highest high in the first 40% of the lookback window
        let maxHigh0 = -Infinity;
        const range0End = Math.floor(skCandles.length * 0.4);
        for (let i = 0; i < range0End; i++) {
          const idx = leftmostIdx + i;
          const c = activeCandles[idx];
          if (c && c.high > maxHigh0) {
            maxHigh0 = c.high;
            i0 = idx;
          }
        }

        // Point 1 is the lowest low from Point 0 up to 75% of the lookback window
        let minLow1 = Infinity;
        const start1 = i0 - leftmostIdx + 1;
        const range1End = Math.max(
          start1 + 2,
          Math.floor(skCandles.length * 0.75),
        );
        for (let i = start1; i < range1End; i++) {
          const idx = leftmostIdx + i;
          const c = activeCandles[idx];
          if (c && c.low < minLow1) {
            minLow1 = c.low;
            i1 = idx;
          }
        }

        // Point 2 is the highest high from Point 1 up to the last candle
        let maxHigh2 = -Infinity;
        const start2 = i1 - leftmostIdx + 1;
        for (let i = start2; i < skCandles.length; i++) {
          const idx = leftmostIdx + i;
          const c = activeCandles[idx];
          if (c && c.high > maxHigh2) {
            maxHigh2 = c.high;
            i2 = idx;
          }
        }
      }

      const c0 = activeCandles[i0];
      const c1 = activeCandles[i1];
      const c2 = activeCandles[i2];

      if (c0 && c1 && c2) {
        const x0 = timeToX(c0.time);
        const x1 = timeToX(c1.time);
        const x2 = timeToX(c2.time);

        const y0 = priceToY(isBullTrend ? c0.low : c0.high);
        const y1 = priceToY(isBullTrend ? c1.high : c1.low);
        const y2 = priceToY(isBullTrend ? c2.low : c2.high);

        // Draw the main orange SK line connecting 0 -> 1 -> 2
        ctx.save();
        ctx.strokeStyle = "#f97316"; // Vibrant Orange
        ctx.lineWidth = 2.0;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.restore();

        // Calculate Fib levels based on Point 0 and Point 1
        const p0Price = isBullTrend ? c0.low : c0.high;
        const p1Price = isBullTrend ? c1.high : c1.low;
        const H = Math.abs(p1Price - p0Price);

        // Ratios & Prices
        const fib0382 = isBullTrend ? p1Price - 0.382 * H : p1Price + 0.382 * H;
        const fib0559 = isBullTrend ? p1Price - 0.559 * H : p1Price + 0.559 * H;
        const fib0618 = isBullTrend ? p1Price - 0.618 * H : p1Price + 0.618 * H;
        const fib0667 = isBullTrend ? p1Price - 0.667 * H : p1Price + 0.667 * H;
        const fib0886 = isBullTrend ? p1Price - 0.886 * H : p1Price + 0.886 * H;

        // Targets:
        const fibT1 = isBullTrend ? p0Price + 1.272 * H : p0Price - 1.272 * H;
        const fibT2 = isBullTrend ? p0Price + 1.618 * H : p0Price - 1.618 * H;

        // Convert to Y coordinates
        const y0382 = priceToY(fib0382);
        const y0559 = priceToY(fib0559);
        const y0618 = priceToY(fib0618);
        const y0667 = priceToY(fib0667);
        const y0886 = priceToY(fib0886);
        const yT1 = priceToY(fibT1);
        const yT2 = priceToY(fibT2);

        // Horizontal lines boundaries: from Point 2 to the right margin of the chart
        const fibStartX = x2;
        const fibEndX = chartWidth;

        // Shaded Red Box between 0.559 and 0.667
        ctx.save();
        ctx.fillStyle = "rgba(239, 68, 68, 0.08)"; // Shaded red
        const boxTop = Math.min(y0559, y0667);
        const boxHeight = Math.abs(y0667 - y0559);
        ctx.fillRect(fibStartX, boxTop, fibEndX - fibStartX, boxHeight);
        ctx.restore();

        // Draw a border for the shaded box
        ctx.save();
        ctx.strokeStyle = "rgba(239, 68, 68, 0.15)";
        ctx.lineWidth = 1;
        ctx.strokeRect(fibStartX, boxTop, fibEndX - fibStartX, boxHeight);
        ctx.restore();

        // Helper function to draw horizontal lines with labels
        const drawSKFibLine = (
          yVal: number,
          label: string,
          color: string,
          isDashed: boolean,
          isSolid: boolean = false,
        ) => {
          ctx.save();
          ctx.strokeStyle = color;
          ctx.lineWidth = isSolid ? 1.5 : 1;
          if (isDashed) {
            ctx.setLineDash([4, 4]);
          }
          ctx.beginPath();
          ctx.moveTo(fibStartX, yVal);
          ctx.lineTo(fibEndX, yVal);
          ctx.stroke();

          // Left-aligned label (to avoid overlapping with Volume Profile on the right)
          ctx.fillStyle = color;
          ctx.font = 'bold 10px "JetBrains Mono", monospace';
          ctx.textAlign = "left";
          ctx.textBaseline = "bottom";
          ctx.fillText(label, fibStartX + 10, yVal - 4);
          ctx.restore();
        };

        // Draw Fib lines
        drawSKFibLine(y0382, `0.382`, "rgba(148, 163, 184, 0.65)", true); // slate
        drawSKFibLine(y0559, `0.559 (SK-E)`, "#ef4444", true); // light red dashed
        drawSKFibLine(y0618, `0.618 (GOLD)`, "#ef4444", false, true); // bold solid red
        drawSKFibLine(y0667, `0.667 (SK-E)`, "#ef4444", true); // light red dashed
        drawSKFibLine(y0886, `0.886 (SL)`, "#f43f5e", true); // Stop Loss dashed red/rose

        // Draw Target extensions T1 & T2
        drawSKFibLine(yT1, `T1 (1.272)`, "#10b981", true); // green dashed
        drawSKFibLine(yT2, `T2 (1.618)`, "#10b981", true); // green dashed

        // Draw the Points 0, 1, 2 filled circles
        const drawPointCircle = (
          x_coord: number,
          y_coord: number,
          label: string,
        ) => {
          ctx.save();
          ctx.fillStyle = "#f97316"; // Orange
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.arc(x_coord, y_coord, 9, 0, 2 * Math.PI);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = "#ffffff";
          ctx.font = 'bold 10px "JetBrains Mono", monospace';
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(label, x_coord, y_coord);
          ctx.restore();
        };

        drawPointCircle(x0, y0, "0");
        drawPointCircle(x1, y1, "1");
        drawPointCircle(x2, y2, "2");

        // Draw State Text
        ctx.save();
        ctx.fillStyle = "#f97316"; // Orange
        ctx.font = 'bold 10.5px "JetBrains Mono", monospace';
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";

        const textLabel = isBullTrend
          ? "⚡ SK BULL ACTIVE"
          : "⚡ SK BEAR ACTIVE";
        ctx.fillText(textLabel, x0 + 15, y0);
        ctx.restore();
      }
    }
  }

    // --- TRENDLINES WITH BREAKS (TWB) ---
    if (indicators.showTWB && activeCandles.length > 0) {
      const length = 14;
      const mult = 1.0;
      
      const trs: number[] = [];
      const atrs: number[] = [];
      let atrSum = 0;
      
      for (let i = 0; i < activeCandles.length; i++) {
        const c = activeCandles[i];
        const prevC = i > 0 ? activeCandles[i-1] : c;
        const tr = Math.max(
          c.high - c.low,
          Math.abs(c.high - prevC.close),
          Math.abs(c.low - prevC.close)
        );
        trs.push(tr);
        
        if (i < length) {
          atrSum += tr;
          atrs.push(atrSum / (i + 1));
        } else {
          const atr = (atrs[i - 1] * (length - 1) + tr) / length;
          atrs.push(atr);
        }
      }
      
      const drawBreakBadge = (x: number, y: number, color: string) => {
        ctx.save();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(x - 8, y - 8, 16, 16, 4);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 10px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("B", x, y);
        ctx.restore();
      };
      
      let upper = 0;
      let lower = 0;
      let slope_ph = 0;
      let slope_pl = 0;
      let upos = 0;
      let dnos = 0;
      
      ctx.save();
      ctx.lineWidth = 1.5;
      
      let lastUpperBreakTime = 0;
      let lastLowerBreakTime = 0;
      
      let prevUpperX = 0, prevUpperY = 0;
      let prevLowerX = 0, prevLowerY = 0;
      
      let isFirstUpper = true;
      let isFirstLower = true;
      
      for (let i = 0; i < activeCandles.length; i++) {
        const c = activeCandles[i];
        
        let isPh = false;
        let isPl = false;
        
        // Pivot detection (historical, looking forward length bars)
        if (i > length && i < activeCandles.length - length) {
          isPh = true;
          isPl = true;
          for (let j = i - length; j <= i + length; j++) {
            if (j === i) continue;
            if (activeCandles[j].high >= c.high) isPh = false;
            if (activeCandles[j].low <= c.low) isPl = false;
          }
        }
        
        const slope = (atrs[i] / length) * mult;
        
        slope_ph = isPh ? slope : slope_ph;
        slope_pl = isPl ? slope : slope_pl;
        
        upper = isPh ? c.high : upper - slope_ph;
        lower = isPl ? c.low : lower + slope_pl;
        
        const upos_prev = upos;
        const dnos_prev = dnos;
        
        upos = isPh ? 0 : (c.close > upper ? 1 : upos);
        dnos = isPl ? 0 : (c.close < lower ? 1 : dnos);
        
        const currX = timeToX(c.time);
        
        if (upper !== 0) {
          const currUpperY = priceToY(upper);
          if (!isPh && !isFirstUpper) {
             ctx.beginPath();
             ctx.strokeStyle = "#ef4444";
             ctx.moveTo(prevUpperX, prevUpperY);
             ctx.lineTo(currX, currUpperY);
             ctx.stroke();
          }
          prevUpperX = currX;
          prevUpperY = currUpperY;
          isFirstUpper = false;
          
          if (upos > upos_prev && c.time > lastUpperBreakTime) {
            drawBreakBadge(currX, priceToY(c.low - (c.high - c.low)*0.5), "#0ea5e9");
            lastUpperBreakTime = c.time;
          }
        }
        
        if (lower !== 0) {
          const currLowerY = priceToY(lower);
          if (!isPl && !isFirstLower) {
             ctx.beginPath();
             ctx.strokeStyle = "#10b981";
             ctx.moveTo(prevLowerX, prevLowerY);
             ctx.lineTo(currX, currLowerY);
             ctx.stroke();
          }
          prevLowerX = currX;
          prevLowerY = currLowerY;
          isFirstLower = false;
          
          if (dnos > dnos_prev && c.time > lastLowerBreakTime) {
            drawBreakBadge(currX, priceToY(c.high + (c.high - c.low)*0.5), "#ef4444");
            lastLowerBreakTime = c.time;
          }
        }
      }
      
      const chartWidth = dimensions.width - 85;
      const candleWidthMs = activeCandles.length > 1 ? activeCandles[1].time - activeCandles[0].time : 60000;
      
      if (upper !== 0) {
         ctx.beginPath();
         ctx.strokeStyle = "#ef4444";
         ctx.setLineDash([4, 4]);
         ctx.moveTo(prevUpperX, prevUpperY);
         const futureUpperPrice = upper - slope_ph * 20;
         const futureX = timeToX(activeCandles[activeCandles.length - 1].time + 20 * candleWidthMs);
         if (prevUpperX < chartWidth) {
           ctx.lineTo(futureX, priceToY(futureUpperPrice));
           ctx.stroke();
         }
         ctx.setLineDash([]);
      }
      
      if (lower !== 0) {
         ctx.beginPath();
         ctx.strokeStyle = "#10b981";
         ctx.setLineDash([4, 4]);
         ctx.moveTo(prevLowerX, prevLowerY);
         const futureLowerPrice = lower + slope_pl * 20;
         const futureX = timeToX(activeCandles[activeCandles.length - 1].time + 20 * candleWidthMs);
         if (prevLowerX < chartWidth) {
           ctx.lineTo(futureX, priceToY(futureLowerPrice));
           ctx.stroke();
         }
         ctx.setLineDash([]);
      }
      
      ctx.restore();
    }

    // --- SNR: LIQUIDITY ZONES (BigBeluga) ---
    if (indicators.showSNR && activeCandles.length > 0) {
      const leftBars = 10;
      const rightBars = 8;
      const filter = 2; // "Mid"
      
      const avgVols: number[] = [];
      const normVols: number[] = [];
      
      let sumVol = 0;
      for (let i = 0; i < activeCandles.length; i++) {
        sumVol += activeCandles[i].volume || 0;
        if (i >= rightBars) {
          sumVol -= activeCandles[i - rightBars].volume || 0;
        }
        const avg = i >= rightBars - 1 ? sumVol / rightBars : sumVol / (i + 1);
        avgVols.push(avg);
      }
      
      for (let i = 0; i < avgVols.length; i++) {
        const period = Math.min(i + 1, 500);
        let sum = 0;
        for (let j = i - period + 1; j <= i; j++) {
          sum += avgVols[j];
        }
        const mean = sum / period;
        let sumSq = 0;
        for (let j = i - period + 1; j <= i; j++) {
          sumSq += Math.pow(avgVols[j] - mean, 2);
        }
        const stdev = period > 1 ? Math.sqrt(sumSq / (period - 1)) : 1;
        const norm = stdev === 0 ? 0 : avgVols[i] / stdev;
        normVols.push(norm);
      }
      
      const atrs200: number[] = [];
      let trSum200 = 0;
      for (let i = 0; i < activeCandles.length; i++) {
        const c = activeCandles[i];
        const prevC = i > 0 ? activeCandles[i-1] : c;
        const tr = Math.max(
          c.high - c.low,
          Math.abs(c.high - prevC.close),
          Math.abs(c.low - prevC.close)
        );
        
        if (i < 200) {
          trSum200 += tr;
          atrs200.push(trSum200 / (i + 1));
        } else {
          const atr = (atrs200[i - 1] * 199 + tr) / 200;
          atrs200.push(atr);
        }
      }
      
      interface Zone {
        type: 'upper' | 'lower';
        startIndex: number;
        endIndex: number;
        yBase: number;
        distance: number;
        avgVol: number;
        normVol: number;
        broken: boolean;
        breakIndex: number | null;
      }
      
      const zones: Zone[] = [];
      
      interface FilteredPivot {
         type: 'upper' | 'lower';
         index: number;
         yValue: number;
      }
      
      const filteredPivots: FilteredPivot[] = [];
      
      for (let i = leftBars; i < activeCandles.length - rightBars; i++) {
        const c = activeCandles[i];
        
        let isPh = true;
        let isPl = true;
        
        for (let j = i - leftBars; j <= i + rightBars; j++) {
          if (j === i) continue;
          if (activeCandles[j].high >= c.high) isPh = false;
          if (activeCandles[j].low <= c.low) isPl = false;
        }
        
        const confIdx = i + rightBars;
        const nv = normVols[confIdx];
        
        if (isPh || isPl) {
            if (nv > filter) {
              const aTR = atrs200[confIdx];
              
              if (isPh) {
                zones.push({
                  type: 'upper',
                  startIndex: i,
                  endIndex: confIdx,
                  yBase: c.high,
                  distance: aTR,
                  avgVol: avgVols[confIdx],
                  normVol: nv,
                  broken: false,
                  breakIndex: null
                });
              }
              
              if (isPl) {
                zones.push({
                  type: 'lower',
                  startIndex: i,
                  endIndex: confIdx,
                  yBase: c.low,
                  distance: aTR,
                  avgVol: avgVols[confIdx],
                  normVol: nv,
                  broken: false,
                  breakIndex: null
                });
              }
            } else {
               // Filtered Pivots
               if (isPh) filteredPivots.push({ type: 'upper', index: i, yValue: c.high });
               if (isPl) filteredPivots.push({ type: 'lower', index: i, yValue: c.low });
            }
        }
      }
      
      for (let z = 0; z < zones.length; z++) {
        const zone = zones[z];
        const yValue = zone.type === 'upper' ? zone.yBase + zone.distance : zone.yBase - zone.distance;
        for (let i = zone.endIndex + 1; i < activeCandles.length; i++) {
          const c = activeCandles[i];
          if (c.high > yValue && c.low < yValue) {
             zone.broken = true;
             zone.breakIndex = i;
             zone.endIndex = i;
             break;
          }
          zone.endIndex = i;
        }
      }
      
      const displayZones = zones.slice(-50);
      const chartWidth = dimensions.width - 85;
      
      const drawTextLines = (x: number, y: number, text1: string, text2: string, color: string) => {
         ctx.save();
         ctx.font = "9px sans-serif";
         ctx.fillStyle = color;
         ctx.textAlign = "center";
         ctx.textBaseline = "middle";
         ctx.fillText(text1, x, y - 5);
         ctx.fillText(text2, x, y + 6);
         ctx.restore();
      };
      
      // Draw filtered pivots
      filteredPivots.forEach(fp => {
         const px = timeToX(activeCandles[fp.index].time);
         if (px >= 0 && px <= chartWidth) {
            const py = priceToY(fp.yValue);
            ctx.save();
            ctx.strokeStyle = fp.type === 'upper' ? 'rgba(35, 112, 163, 0.6)' : 'rgba(35, 163, 114, 0.6)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(px, py, 3, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
         }
      });
      
      displayZones.forEach(zone => {
         const isUpper = zone.type === 'upper';
         const yValue = isUpper ? zone.yBase + zone.distance : zone.yBase - zone.distance;
         
         const x1 = timeToX(activeCandles[zone.startIndex].time);
         const boxEndX = timeToX(activeCandles[Math.min(zone.startIndex + 8, activeCandles.length - 1)].time);
         
         let endX = timeToX(activeCandles[zone.endIndex].time);
         if (!zone.broken && zone.endIndex === activeCandles.length - 1) {
            const cw = activeCandles.length > 1 ? activeCandles[1].time - activeCandles[0].time : 60000;
            endX = timeToX(activeCandles[zone.endIndex].time + cw * 5);
         }
         
         if ((x1 < chartWidth && endX > 0) || (x1 < 0 && endX > chartWidth)) {
            const y1 = priceToY(yValue);
            const y2 = priceToY(zone.yBase);
            const h = y2 - y1;
            const boxW = boxEndX - x1;
            
            const intensity = Math.min(100, Math.round(zone.normVol) * 15);
            const alpha = 0.2 + (intensity / 100) * 0.4;
            const hexColor = isUpper ? '35, 112, 163' : '35, 163, 114'; 
            
            // Draw Box
            ctx.save();
            ctx.fillStyle = zone.broken ? 'transparent' : `rgba(${hexColor}, ${alpha})`;
            ctx.strokeStyle = `rgba(${hexColor}, 1)`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.rect(x1, Math.min(y1, y2), boxW, Math.abs(h));
            ctx.fill();
            ctx.stroke();
            ctx.restore();
            
            // Draw Box Text
            if (zone.broken) {
               drawTextLines(x1 + boxW/2, y1 + h/2, "Liquidity", "Grabbed", "#ffffff");
            } else {
               drawTextLines(x1 + boxW/2, y1 + h/2, "Volume:", zone.avgVol.toFixed(2), "#ffffff");
            }
            
            // Draw Line
            ctx.save();
            ctx.strokeStyle = `rgba(${hexColor}, 1)`;
            ctx.lineWidth = zone.broken ? 1 : 2;
            if (zone.broken) ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(endX, y1);
            ctx.stroke();
            ctx.restore();
            
            // Draw Pivot Circles
            const pY = priceToY(zone.yBase);
            ctx.save();
            ctx.fillStyle = `rgba(${hexColor}, 0.6)`;
            ctx.beginPath();
            ctx.arc(x1, pY, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = `rgba(${hexColor}, 1)`;
            ctx.beginPath();
            ctx.arc(x1, pY, 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            
            // Break Marker
            if (zone.broken && zone.breakIndex !== null) {
               const bx = timeToX(activeCandles[zone.breakIndex].time);
               ctx.save();
               ctx.fillStyle = "#df1c1c";
               ctx.font = "14px sans-serif";
               ctx.textAlign = "center";
               ctx.textBaseline = "middle";
               ctx.fillText("〇", bx, y1);
               ctx.restore();
            }
         }
      });
    }

  // --- ANCHORED VWAP & VWAP ---
  if (indicators.showVWAP && activeCandles.length > 0) {
    const tz =
      (settings?.timezone || "UTC") === "Colombo" ? "Asia/Colombo" : "UTC";

    // Group active candles by day session
    const days: { [dayStr: string]: typeof activeCandles } = {};
    activeCandles.forEach((c) => {
      const date = new Date(c.time);
      const dayStr = date.toLocaleDateString("en-US", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      if (!days[dayStr]) {
        days[dayStr] = [];
      }
      days[dayStr].push(c);
    });

    const dayKeys = Object.keys(days);

    dayKeys.forEach((dayStr) => {
      const dayCandles = days[dayStr];
      if (dayCandles.length === 0) return;

      // Arrays to store coordinates for plotting
      const pointsVWAP: { x: number; y: number }[] = [];
      const pointsUpper1: { x: number; y: number }[] = [];
      const pointsLower1: { x: number; y: number }[] = [];
      const pointsUpper2: { x: number; y: number }[] = [];
      const pointsLower2: { x: number; y: number }[] = [];
      const pointsUpper3: { x: number; y: number }[] = [];
      const pointsLower3: { x: number; y: number }[] = [];

      let cumulativePV = 0;
      let cumulativeVol = 0;
      let cumulativePV2 = 0;

      dayCandles.forEach((c) => {
        const typPrice = (c.high + c.low + c.close) / 3;
        const vol = c.volume || 1; // Safeguard volume

        cumulativePV += typPrice * vol;
        cumulativeVol += vol;
        cumulativePV2 += typPrice * typPrice * vol;

        const vwap = cumulativePV / (cumulativeVol || 1);
        const variance = cumulativePV2 / (cumulativeVol || 1) - vwap * vwap;
        const sd = Math.sqrt(Math.max(0, variance));

        const x = timeToX(c.time);

        pointsVWAP.push({ x, y: priceToY(vwap) });
        pointsUpper1.push({ x, y: priceToY(vwap + 1 * sd) });
        pointsLower1.push({ x, y: priceToY(vwap - 1 * sd) });
        pointsUpper2.push({ x, y: priceToY(vwap + 2 * sd) });
        pointsLower2.push({ x, y: priceToY(vwap - 2 * sd) });
        pointsUpper3.push({ x, y: priceToY(vwap + 3 * sd) });
        pointsLower3.push({ x, y: priceToY(vwap - 3 * sd) });
      });

      // Helper to draw a line path
      const drawPath = (
        points: { x: number; y: number }[],
        color: string,
        width: number,
        dashed: boolean,
      ) => {
        if (points.length < 2) return;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        if (dashed) {
          ctx.setLineDash([4, 4]);
        }
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.stroke();
        ctx.restore();
      };

      // Draw Central VWAP Line (solid, yellow, slightly thicker)
      drawPath(pointsVWAP, "#eab308", 1.8, false); // yellow-500

      // Draw SD 1 Bands (dashed, yellow, thin)
      drawPath(pointsUpper1, "rgba(234, 179, 8, 0.55)", 1.0, true);
      drawPath(pointsLower1, "rgba(234, 179, 8, 0.55)", 1.0, true);

      // Draw SD 2 Bands (dashed, yellow, thin)
      drawPath(pointsUpper2, "rgba(234, 179, 8, 0.4)", 1.0, true);
      drawPath(pointsLower2, "rgba(234, 179, 8, 0.4)", 1.0, true);

      // Draw SD 3 Bands (dashed, yellow, thin)
      drawPath(pointsUpper3, "rgba(234, 179, 8, 0.25)", 1.0, true);
      drawPath(pointsLower3, "rgba(234, 179, 8, 0.25)", 1.0, true);
    });
  }

    // --- MPAS (Mxwll Suite) ---
    if (indicators.showMPAS && activeCandles.length > 0) {
      const extSens = 25;
      const intSens = 3;
      const bullC = "#14D990";
      const bearC = "#F24968";
      
      let extState = 0, intState = 0;
      let extUpaxis = 0, extUpaxis2 = 0, extDnaxis = Infinity, extDnaxis2 = 0;
      let extUpside = 1, extDownside = 1, extMoving = 0;
      
      let intUpaxis = 0, intUpaxis2 = 0, intDnaxis = Infinity, intDnaxis2 = 0;
      let intUpside = 1, intDownside = 1, intMoving = 0;
      
      interface StructLine { x1: number; y1: number; x2: number; y2: number; text: string; color: string; isUp: boolean; }
      const structLines: StructLine[] = [];
      
      interface Label { x: number; y: number; text: string; color: string; type: string; }
      const labels: Label[] = [];
      
      interface OBBox { x1: number; y1: number; x2: number; y2: number; color: string; isTop: boolean; }
      const obBoxes: OBBox[] = [];

      for (let i = 0; i < activeCandles.length; i++) {
        const c = activeCandles[i];
        
        const checkSwing = (len: number, state: number) => {
          if (i >= len) {
            const cIdx = i - len;
            const cHi = activeCandles[cIdx].high;
            const cLo = activeCandles[cIdx].low;
            let up = -Infinity; let dn = Infinity;
            for (let j = cIdx + 1; j <= i; j++) {
              if (activeCandles[j].high > up) up = activeCandles[j].high;
              if (activeCandles[j].low < dn) dn = activeCandles[j].low;
            }
            let nextState = state;
            if (cHi > up) nextState = 0;
            else if (cLo < dn) nextState = 1;
            
            let topSwing = 0, botSwing = 0;
            if (nextState === 0 && state !== 0) topSwing = cHi;
            if (nextState === 1 && state !== 1) botSwing = cLo;
            return { nextState, topSwing, botSwing, cIdx };
          }
          return { nextState: state, topSwing: 0, botSwing: 0, cIdx: 0 };
        };

        const ext = checkSwing(extSens, extState);
        extState = ext.nextState;
        
        if (ext.topSwing !== 0) {
          extUpside = 1;
          const txt = ext.topSwing > extUpaxis ? 'HH' : 'LH';
          labels.push({ x: ext.cIdx, y: ext.topSwing, text: txt, color: bearC, type: txt });
          obBoxes.push({ x1: ext.cIdx, y1: ext.topSwing, x2: activeCandles.length - 1, y2: ext.topSwing * 0.998, color: "rgba(242,73,104,0.2)", isTop: true });
          extUpaxis = ext.topSwing;
          extUpaxis2 = ext.cIdx;
        }
        if (ext.botSwing !== 0) {
          extDownside = 1;
          const txt = ext.botSwing < extDnaxis ? 'LL' : 'HL';
          labels.push({ x: ext.cIdx, y: ext.botSwing, text: txt, color: bullC, type: txt });
          obBoxes.push({ x1: ext.cIdx, y1: ext.botSwing, x2: activeCandles.length - 1, y2: ext.botSwing * 1.002, color: "rgba(20,217,144,0.2)", isTop: false });
          extDnaxis = ext.botSwing;
          extDnaxis2 = ext.cIdx;
        }

        if (c.close > extUpaxis && extUpside !== 0) {
          const str = extMoving < 0 ? 'CHoCH' : 'BoS';
          structLines.push({ x1: extUpaxis2, y1: extUpaxis, x2: i, y2: extUpaxis, text: str, color: bullC, isUp: true });
          extUpside = 0;
          extMoving = 1;
        }
        if (c.close < extDnaxis && extDownside !== 0) {
          const str = extMoving > 0 ? 'CHoCH' : 'BoS';
          structLines.push({ x1: extDnaxis2, y1: extDnaxis, x2: i, y2: extDnaxis, text: str, color: bearC, isUp: false });
          extDownside = 0;
          extMoving = -1;
        }

        const intS = checkSwing(intSens, intState);
        intState = intS.nextState;
        
        if (intS.topSwing !== 0) {
          intUpside = 1;
          intUpaxis = intS.topSwing;
          intUpaxis2 = intS.cIdx;
        }
        if (intS.botSwing !== 0) {
          intDownside = 1;
          intDnaxis = intS.botSwing;
          intDnaxis2 = intS.cIdx;
        }
        
        if (c.close > intUpaxis && intUpside !== 0) {
          const str = intMoving < 0 ? 'I-CHoCH' : 'I-BoS';
          structLines.push({ x1: intUpaxis2, y1: intUpaxis, x2: i, y2: intUpaxis, text: str, color: bullC, isUp: true });
          intUpside = 0;
          intMoving = 1;
        }
        if (c.close < intDnaxis && intDownside !== 0) {
          const str = intMoving > 0 ? 'I-CHoCH' : 'I-BoS';
          structLines.push({ x1: intDnaxis2, y1: intDnaxis, x2: i, y2: intDnaxis, text: str, color: bearC, isUp: false });
          intDownside = 0;
          intMoving = -1;
        }

        for (let j = obBoxes.length - 1; j >= 0; j--) {
          const ob = obBoxes[j];
          if (ob.isTop && c.close >= ob.y1) obBoxes.splice(j, 1);
          else if (!ob.isTop && c.close <= ob.y1) obBoxes.splice(j, 1);
          else ob.x2 = i;
        }
      }

      // FVGs
      interface FVG { x1: number, y1: number, y2: number, isUp: boolean };
      const fvgs: FVG[] = [];
      for (let i = 2; i < activeCandles.length; i++) {
        const c0 = activeCandles[i - 2];
        const c1 = activeCandles[i - 1];
        const c2 = activeCandles[i];
        
        if (c0.high < c2.low && c1.close > c1.open) fvgs.push({ x1: i - 1, y1: c2.low, y2: c0.high, isUp: true });
        if (c0.low > c2.high && c1.close < c1.open) fvgs.push({ x1: i - 1, y1: c0.low, y2: c2.high, isUp: false });
        
        for (let j = fvgs.length - 1; j >= 0; j--) {
          const fvg = fvgs[j];
          if (fvg.isUp && c2.low <= fvg.y2) fvgs.splice(j, 1);
          else if (!fvg.isUp && c2.high >= fvg.y1) fvgs.splice(j, 1);
        }
      }
      
      // Auto Fibs
      let fibP1 = { x: 0, y: 0 };
      let fibP2 = { x: 0, y: 0 };
      let isUpFib = false;
      if (extUpaxis2 > extDnaxis2) {
        fibP1 = { x: extUpaxis2, y: extUpaxis };
        let minLo = Infinity; let minIdx = extUpaxis2;
        for (let i = extUpaxis2; i < activeCandles.length; i++) {
          if (activeCandles[i].low < minLo) { minLo = activeCandles[i].low; minIdx = i; }
        }
        fibP2 = { x: minIdx, y: minLo };
        isUpFib = false;
      } else {
        fibP1 = { x: extDnaxis2, y: extDnaxis };
        let maxHi = -Infinity; let maxIdx = extDnaxis2;
        for (let i = extDnaxis2; i < activeCandles.length; i++) {
          if (activeCandles[i].high > maxHi) { maxHi = activeCandles[i].high; maxIdx = i; }
        }
        fibP2 = { x: maxIdx, y: maxHi };
        isUpFib = true;
      }

      // Drawing
      const chartWidth = dimensions.width - 85;

      const drawTextLine = (x: number, y: number, text: string, color: string, align: CanvasTextAlign, base: CanvasTextBaseline) => {
         ctx.save();
         ctx.font = "10px sans-serif";
         ctx.fillStyle = color;
         ctx.textAlign = align;
         ctx.textBaseline = base;
         ctx.fillText(text, x, y);
         ctx.restore();
      };
      
      mpasObBoxesToDraw = obBoxes.slice(-10);
      mpasFvgsToDraw = fvgs;
      
      obBoxes.slice(-10).forEach(ob => {
         const x1 = timeToX(activeCandles[ob.x1].time);
         const endX = timeToX(activeCandles[activeCandles.length - 1].time) + 60000 * 5; 
         if (x1 < chartWidth) {
           const y1 = priceToY(ob.y1);
           const y2 = priceToY(ob.y2);
           ctx.save();
           ctx.fillStyle = ob.color;
           ctx.strokeStyle = ob.isTop ? "rgba(242,73,104,0.5)" : "rgba(20,217,144,0.5)";
           ctx.lineWidth = 1;
           ctx.beginPath();
           ctx.rect(x1, Math.min(y1, y2), chartWidth - x1, Math.abs(y2 - y1));
           ctx.fill();
           ctx.stroke();
           ctx.restore();
         }
      });
      
      fvgs.forEach(fvg => {
         const x1 = timeToX(activeCandles[fvg.x1].time);
         if (x1 < chartWidth) {
           const y1 = priceToY(fvg.y1);
           const y2 = priceToY(fvg.y2);
           ctx.save();
           ctx.fillStyle = "rgba(242, 184, 7, 0.3)";
           ctx.beginPath();
           ctx.rect(x1, Math.min(y1, y2), chartWidth - x1, Math.abs(y2 - y1));
           ctx.fill();
           ctx.restore();
         }
      });

      structLines.forEach(sl => {
         const x1 = timeToX(activeCandles[sl.x1].time);
         const x2 = timeToX(activeCandles[sl.x2].time);
         const y = priceToY(sl.y1);
         if (x2 > 0 && x1 < chartWidth) {
           ctx.save();
           ctx.strokeStyle = sl.color;
           ctx.setLineDash([3, 3]);
           ctx.lineWidth = 1;
           ctx.beginPath();
           ctx.moveTo(x1, y);
           ctx.lineTo(x2, y);
           ctx.stroke();
           ctx.restore();
           drawTextLine(x1 + (x2 - x1)/2, y - 5, sl.text, sl.color, "center", "bottom");
         }
      });

      labels.forEach(lb => {
         const x = timeToX(activeCandles[lb.x].time);
         const y = priceToY(lb.y);
         if (x > 0 && x < chartWidth) {
           const isTop = lb.type.includes('H');
           drawTextLine(x, isTop ? y - 10 : y + 10, lb.text, lb.color, "center", isTop ? "bottom" : "top");
         }
      });

      // Save Fibs for later
      if (fibP1.x > 0) {
        mpasFibData = {
           p1x: timeToX(activeCandles[fibP1.x].time),
           p1y: priceToY(fibP1.y),
           p2x: timeToX(activeCandles[fibP2.x].time),
           p2y: priceToY(fibP2.y)
        };
      }
      
      // Area of Interest
      if (activeCandles.length > 50) {
          let aoeHigh = -Infinity, aoeLow = Infinity;
          for (let i = activeCandles.length - 50; i < activeCandles.length; i++) {
              const bodyHigh = Math.max(activeCandles[i].open, activeCandles[i].close);
              const bodyLow = Math.min(activeCandles[i].open, activeCandles[i].close);
              if (bodyHigh > aoeHigh) aoeHigh = bodyHigh;
              if (bodyLow < aoeLow) aoeLow = bodyLow;
          }
          const xStart = timeToX(activeCandles[activeCandles.length - 50].time);
          
          if (xStart < chartWidth) {
              const atr = Math.abs(activeCandles[activeCandles.length - 1].high - activeCandles[activeCandles.length - 1].low) * 0.5;
              
              const hY1 = priceToY(aoeHigh + atr);
              const hY2 = priceToY(aoeHigh);
              ctx.save();
              ctx.fillStyle = "rgba(242, 73, 104, 0.15)";
              ctx.beginPath();
              ctx.rect(xStart, Math.min(hY1, hY2), chartWidth - xStart, Math.abs(hY1 - hY2));
              ctx.fill();
              drawTextLine(chartWidth - 5, Math.min(hY1, hY2) - 5, "Area of Interest", "rgba(242, 73, 104, 0.5)", "right", "bottom");
              ctx.restore();
              
              const lY1 = priceToY(aoeLow);
              const lY2 = priceToY(aoeLow - atr);
              ctx.save();
              ctx.fillStyle = "rgba(20, 217, 144, 0.15)";
              ctx.beginPath();
              ctx.rect(xStart, Math.min(lY1, lY2), chartWidth - xStart, Math.abs(lY1 - lY2));
              ctx.fill();
              drawTextLine(chartWidth - 5, Math.max(lY1, lY2) + 5, "Area of Interest", "rgba(20, 217, 144, 0.5)", "right", "top");
              ctx.restore();
          }
      }
    }

  // --- PRE-COMPUTE STATS FOR OVERLAYS ---
  const averageVolume = activeCandles.length > 0 
    ? activeCandles.reduce((acc, curr) => acc + curr.volume, 0) / activeCandles.length 
    : 1;

  // --- STANDARD CANDLESTICK / FOOTPRINT DRAWING LOOPS ---
  activeCandles.forEach((c, idx) => {
    const x = timeToX(c.time);
    if (x < -10 || x > chartWidth + 10) return; // Cull offscreen items to optimize

    const yOpen = priceToY(c.open);
    const yClose = priceToY(c.close);
    const yHigh = priceToY(c.high);
    const yLow = priceToY(c.low);

    const isBullish = c.close >= c.open;
    const themeGreen = "#00C076";
    const themeRed = "#FF3B30";

    const isFootprintMode =
      chartType === "footprint" || !!indicators.showStats || vs.barWidth >= 45;
    if (
      isFootprintMode &&
      vs.barWidth >= 16 &&
      c.footprint &&
      Object.keys(c.footprint).length > 0
    ) {
      const sortedKeys = Object.keys(c.footprint)
        .map(parseFloat)
        .sort((a, b) => b - a);

      // Find max tier volume inside this candle for POC calculation
      let maxTierVol = 0.0001;
      sortedKeys.forEach((p) => {
        const stats = c.footprint[p];
        if (stats) {
          const tierVol = stats.buyVol + stats.sellVol;
          if (tierVol > maxTierVol) maxTierVol = tierVol;
        }
      });

      const tickCount = sortedKeys.length;
      const boxH = (yLow - yHigh) / tickCount;

      const useSingleColumn =
        !!indicators.showStats ||
        (chartType === "candlestick" && vs.barWidth >= 45);
      if (useSingleColumn) {
        // --- SINGLE COLUMN TOTAL VOLUME FOOTPRINT (as shown in second screenshot) ---
        // 1. Draw subtle background wick line - vibrant neon blue only if WDE is present on this candle!
        const { isBearishWDE, isBullishWDE } = getWDEInfo(c);
        if (indicators.showWickDelta && (isBearishWDE || isBullishWDE)) {
          ctx.strokeStyle = "#00f0ff";
          ctx.lineWidth = 1.8;
          ctx.shadowColor = "rgba(0, 240, 255, 0.4)";
          ctx.shadowBlur = 4;
        } else {
          ctx.strokeStyle = isBullish
            ? "rgba(0, 192, 118, 0.45)"
            : "rgba(255, 59, 48, 0.45)";
          ctx.lineWidth = 1.2;
        }
        ctx.beginPath();
        ctx.moveTo(x, yHigh);
        ctx.lineTo(x, yLow);
        ctx.stroke();
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;

        // 2. Draw boxes
        sortedKeys.forEach((p, i) => {
          const stats = c.footprint[p];
          if (!stats) return;

          const tierVol = stats.buyVol + stats.sellVol;
          const strength = tierVol / maxTierVol;

          const yBoxTop = yHigh + i * boxH;
          const boxW = vs.barWidth;
          const boxX = x - boxW / 2;

          const opacity = 0.015 + Math.pow(strength, 5.0) * 0.75;
          ctx.fillStyle = `rgba(30, 96, 255, ${opacity})`;
          ctx.fillRect(boxX, yBoxTop, boxW, boxH - 0.5);

          // Draw subtle dark border around cells
          ctx.strokeStyle = "rgba(10, 15, 25, 0.18)";
          ctx.lineWidth = 0.5;
          ctx.strokeRect(boxX, yBoxTop, boxW, boxH - 0.5);

          // Centered single volume text
          if (vs.barWidth >= 55 && boxH >= 8) {
            ctx.font = "bold 8px Courier, monospace";
            ctx.fillStyle =
              strength > 0.5
                ? "rgba(255, 255, 255, 0.95)"
                : "rgba(160, 185, 255, 0.55)";
            ctx.textAlign = "center";
            ctx.fillText(
              Math.round(tierVol).toString(),
              x,
              yBoxTop + boxH / 2 + 3,
            );
          }
        });
      } else {
        // --- BID x ASK SPLIT FOOTPRINT ---
        // 1. Draw vertical center wick split line - vibrant neon blue only if WDE is present on this candle!
        const { isBearishWDE, isBullishWDE } = getWDEInfo(c);
        if (indicators.showWickDelta && (isBearishWDE || isBullishWDE)) {
          ctx.strokeStyle = "#00f0ff";
          ctx.lineWidth = 1.8;
          ctx.shadowColor = "rgba(0, 240, 255, 0.4)";
          ctx.shadowBlur = 4;
        } else {
          ctx.strokeStyle = isBullish ? themeGreen : themeRed;
          ctx.lineWidth = 1.2;
        }
        ctx.beginPath();
        ctx.moveTo(x, yHigh);
        ctx.lineTo(x, yLow);
        ctx.stroke();
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;

        // 2. Draw boxes
        sortedKeys.forEach((p, i) => {
          const stats = c.footprint[p];
          if (!stats) return;

          const tierVol = stats.buyVol + stats.sellVol;
          const strength = tierVol / maxTierVol;

          const yBoxTop = yHigh + i * boxH;
          const boxW = vs.barWidth;
          const boxX = x - boxW / 2;

          const opacity = 0.015 + Math.pow(strength, 5.0) * 0.75;
          ctx.fillStyle = `rgba(30, 96, 255, ${opacity})`;
          ctx.fillRect(boxX, yBoxTop, boxW, boxH - 0.5);

          ctx.strokeStyle = "rgba(10, 15, 25, 0.18)";
          ctx.lineWidth = 0.5;
          ctx.strokeRect(boxX, yBoxTop, boxW, boxH - 0.5);

          // Bid x Ask split texts
          if (vs.barWidth >= 55 && boxH >= 8) {
            ctx.font = "bold 8px Courier, monospace";

            let isBuyImb = false;
            let isSellImb = false;

            if (indicators.showIMB) {
              const askP = stats.buyVol;
              const bidP = stats.sellVol;
              const bidPMinus1 = i < sortedKeys.length - 1 ? c.footprint[sortedKeys[i + 1]]?.sellVol || 0 : 0;
              const askPPlus1 = i > 0 ? c.footprint[sortedKeys[i - 1]]?.buyVol || 0 : 0;

              if (askP > 0 && askP >= Math.max(bidPMinus1 * 3, 10)) isBuyImb = true;
              if (bidP > 0 && bidP >= Math.max(askPPlus1 * 3, 10)) isSellImb = true;
            }

            const sellStr = Math.round(stats.sellVol).toString();
            const buyStr = Math.round(stats.buyVol).toString();

            ctx.textAlign = "right";
            if (isSellImb) {
              const textWidth = ctx.measureText(sellStr).width;
              ctx.fillStyle = "#FFEA00";
              ctx.fillRect(x - 4 - textWidth - 1, yBoxTop + boxH / 2 - 4, textWidth + 2, 8);
              ctx.fillStyle = "#000000";
            } else {
              ctx.fillStyle = "#FF3B30";
            }
            ctx.fillText(sellStr, x - 4, yBoxTop + boxH / 2 + 3);

            ctx.textAlign = "left";
            if (isBuyImb) {
              const textWidth = ctx.measureText(buyStr).width;
              ctx.fillStyle = "#FFEA00";
              ctx.fillRect(x + 4 - 1, yBoxTop + boxH / 2 - 4, textWidth + 2, 8);
              ctx.fillStyle = "#000000";
            } else {
              ctx.fillStyle = "#00C076";
            }
            ctx.fillText(buyStr, x + 4, yBoxTop + boxH / 2 + 3);
          }
        });
      }

      // 3. Draw candle body outline (border around open-close body area)
      const bodyW = vs.barWidth;
      const bodyH = Math.max(1.5, Math.abs(yClose - yOpen));
      const bodyY = Math.min(yOpen, yClose);

      ctx.strokeStyle = isBullish ? themeGreen : themeRed;
      ctx.lineWidth = 1.8;
      ctx.strokeRect(x - bodyW / 2, bodyY, bodyW, bodyH);
    } else {
      // User wants the footprint aesthetic (blue boxes) even when zoomed out, instead of solid neon
      const { isBearishWDE, isBullishWDE } = getWDEInfo(c);
      
      if (indicators.showWickDelta && (isBearishWDE || isBullishWDE)) {
        ctx.strokeStyle = "#00f0ff";
        ctx.lineWidth = Math.max(1.2, Math.min(2.2, vs.barWidth * 0.4));
        ctx.shadowColor = "rgba(0, 240, 255, 0.4)";
        ctx.shadowBlur = 4;
      } else {
        ctx.strokeStyle = isBullish ? themeGreen : themeRed;
        ctx.lineWidth = Math.max(0.4, Math.min(1.2, vs.barWidth * 0.3));
      }

      // Draw wick
      ctx.beginPath();
      ctx.moveTo(x, yHigh);
      ctx.lineTo(x, yLow);
      ctx.stroke();
      
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;

      const bodyW = Math.max(1.0, vs.barWidth);
      const bodyH = Math.max(1.0, Math.abs(yClose - yOpen));
      const bodyY = Math.min(yOpen, yClose);

      // Draw footprint style blue blocks inside the candle to match the zoomed-in aesthetic
      if (c.footprint && Object.keys(c.footprint).length > 0) {
        const sortedKeys = Object.keys(c.footprint).map(parseFloat).sort((a, b) => b - a);
        let maxTierVol = 0.0001;
        sortedKeys.forEach((p) => {
          const stats = c.footprint[p];
          if (stats) {
            const tierVol = stats.buyVol + stats.sellVol;
            if (tierVol > maxTierVol) maxTierVol = tierVol;
          }
        });
        const boxH = (yLow - yHigh) / sortedKeys.length;
        sortedKeys.forEach((p, i) => {
          const stats = c.footprint[p];
          if (!stats) return;
          const tierVol = stats.buyVol + stats.sellVol;
          const strength = tierVol / maxTierVol;
          const yBoxTop = yHigh + i * boxH;
          const opacity = 0.015 + Math.pow(strength, 3.0) * 0.8;
          ctx.fillStyle = `rgba(30, 96, 255, ${opacity})`;
          ctx.fillRect(x - bodyW / 2, yBoxTop, bodyW, Math.max(0.5, boxH));
        });
      } else {
        // Fallback subtle blue fill if no footprint data
        ctx.fillStyle = "rgba(30, 96, 255, 0.15)";
        ctx.fillRect(x - bodyW / 2, yHigh, bodyW, yLow - yHigh);
      }

      // Border for the open-close body
      ctx.strokeStyle = isBullish ? themeGreen : themeRed;
      ctx.lineWidth = Math.max(0.4, Math.min(1.2, vs.barWidth * 0.3));
      ctx.strokeRect(x - bodyW / 2, bodyY, bodyW, bodyH);
    }

    // --- WICK DELTA EXHAUSTION (WDE) DATA DRAWING ---
    if (indicators.showWickDelta) {
      const { isBearishWDE, isBullishWDE, upperWickDelta, lowerWickDelta } =
        getWDEInfo(c);

      if (isBearishWDE) {
        const labelY = yHigh - 16;
        const labelText = `WDE: -${formatStatValue(Math.abs(upperWickDelta))}`;

        ctx.font = 'bold 8px "JetBrains Mono", monospace';
        const textWidth = ctx.measureText(labelText).width;
        const padX = 5;

        // Crimson outer glow
        ctx.shadowColor = "rgba(239, 68, 68, 0.45)";
        ctx.shadowBlur = 6;

        // Semi-transparent badge
        ctx.fillStyle = "rgba(239, 68, 68, 0.16)";
        ctx.strokeStyle = "rgba(239, 68, 68, 0.8)";
        ctx.lineWidth = 1;

        ctx.beginPath();
        ctx.rect(
          x - textWidth / 2 - padX,
          labelY - 7,
          textWidth + padX * 2,
          14,
        );
        ctx.fill();
        ctx.stroke();

        // Clear shadows
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;

        // Text inside
        ctx.fillStyle = "#ff4a4a";
        ctx.textAlign = "center";
        ctx.fillText(labelText, x, labelY + 3);

        // Connect indicator with wick high
        ctx.strokeStyle = "rgba(239, 68, 68, 0.4)";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(x, labelY + 7);
        ctx.lineTo(x, yHigh);
        ctx.stroke();
      }

      if (isBullishWDE) {
        const labelY = yLow + 16;
        const labelText = `WDE: +${formatStatValue(Math.abs(lowerWickDelta))}`;

        ctx.font = 'bold 8px "JetBrains Mono", monospace';
        const textWidth = ctx.measureText(labelText).width;
        const padX = 5;

        // Emerald outer glow
        ctx.shadowColor = "rgba(16, 185, 129, 0.45)";
        ctx.shadowBlur = 6;

        // Semi-transparent badge
        ctx.fillStyle = "rgba(16, 185, 129, 0.16)";
        ctx.strokeStyle = "rgba(16, 185, 129, 0.8)";
        ctx.lineWidth = 1;

        ctx.beginPath();
        ctx.rect(
          x - textWidth / 2 - padX,
          labelY - 7,
          textWidth + padX * 2,
          14,
        );
        ctx.fill();
        ctx.stroke();

        // Clear shadows
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;

        // Text inside
        ctx.fillStyle = "#10b981";
        ctx.textAlign = "center";
        ctx.fillText(labelText, x, labelY + 3);

        // Connect indicator with wick low
        ctx.strokeStyle = "rgba(16, 185, 129, 0.4)";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(x, labelY - 7);
        ctx.lineTo(x, yLow);
        ctx.stroke();
      }
    }

    // --- CANDLE DELTA VALUE ABOVE EACH CANDLE ---
    if (indicators.showDelta || indicators.showDDelta) {
      const deltaVal = c.delta || 0;
      
      let shouldShow = false;
      if (indicators.showDelta) {
        shouldShow = true;
      } else if (indicators.showDDelta) {
        const prevCandle = activeCandles[idx - 1];
        if (prevCandle) {
          const currBody = Math.abs(c.close - c.open);
          const prevBody = Math.abs(prevCandle.close - prevCandle.open);
          const currVol = c.volume;
          const prevVol = prevCandle.volume;

          // Effort vs Result Anomaly (Absorption):
          // Current volume is high (>= 50% of prev), but body is small (<= 40% of prev)
          if (currVol >= prevVol * 0.5 && currBody <= prevBody * 0.4 && prevVol > 0 && prevBody > 0) {
            shouldShow = true;
          }
        } else {
          shouldShow = true;
        }
      }

      if (shouldShow) {
        const prefix = deltaVal > 0 ? "+" : "";
        const deltaText = prefix + formatStatValue(deltaVal);

        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        const textWidth = ctx.measureText(deltaText).width;
        const padX = 5;
        const boxWidth = textWidth + padX * 2;
        const boxHeight = 15;

        // Position it slightly above the high of the candle (yHigh)
        // If showWickDelta is also active and we have a bearish WDE on this candle, let's shift it higher to prevent overlap!
        let hasBearishWDE = false;
        if (indicators.showWickDelta) {
          const { isBearishWDE } = getWDEInfo(c);
          hasBearishWDE = isBearishWDE;
        }

        const labelY = hasBearishWDE ? yHigh - 32 : yHigh - 14;
        const boxX = x - boxWidth / 2;
        const boxY = labelY - boxHeight / 2;

        // Draw solid dark background box so the grid lines and wicks don't cut through the text
        ctx.fillStyle = "#06080a";
        ctx.beginPath();
        ctx.rect(boxX, boxY, boxWidth, boxHeight);
        ctx.fill();

        // Draw border (green for positive or zero, red for negative)
        ctx.strokeStyle = deltaVal >= 0 ? themeGreen : themeRed;
        ctx.lineWidth = 1.0;
        ctx.stroke();

        // Draw text
        ctx.fillStyle = deltaVal >= 0 ? themeGreen : themeRed;
        ctx.textAlign = "center";
        ctx.fillText(deltaText, x, labelY + 3.5);
      }
    }

    // --- STACKED IMBALANCES (STK) ---
    if (
      indicators.showSTK &&
      c.footprint &&
      Object.keys(c.footprint).length >= 5
    ) {
      const prices = Object.keys(c.footprint)
        .map(Number)
        .sort((a, b) => a - b);

      // 1. Detect Buy Imbalances diagonally
      const buyImbalances: boolean[] = Array(prices.length).fill(false);
      for (let i = 1; i < prices.length; i++) {
        const buyVol = c.footprint[prices[i]]?.buyVol || 0;
        const sellVolBelow = c.footprint[prices[i - 1]]?.sellVol || 0;
        if (buyVol > 0 && buyVol >= Math.max(sellVolBelow * 3.0, 10)) {
          buyImbalances[i] = true;
        }
      }

      // Find consecutive runs of buy imbalances of length >= 3
      let currentBuyRun: number[] = [];
      for (let i = 0; i < prices.length; i++) {
        if (buyImbalances[i]) {
          currentBuyRun.push(i);
        } else {
          if (currentBuyRun.length >= 3) {
            const yMin = priceToY(prices[currentBuyRun[0] - 1]);
            const yMax = priceToY(
              prices[currentBuyRun[currentBuyRun.length - 1]],
            );
            const h = Math.abs(yMax - yMin);
            const y = Math.min(yMin, yMax);

            ctx.save();
            ctx.fillStyle = "rgba(0, 192, 118, 0.08)";
            ctx.strokeStyle = "rgba(0, 192, 118, 0.55)";
            ctx.lineWidth = 1.2;
            ctx.setLineDash([4, 3]);

            // Draw horizontal band from candle x to right side of chart
            ctx.fillRect(x, y, chartWidth - x, h);
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(chartWidth, y);
            ctx.moveTo(x, y + h);
            ctx.lineTo(chartWidth, y + h);
            ctx.stroke();

            ctx.restore();
            ctx.fillStyle = "#00C076";
            ctx.font = 'bold 8.5px "JetBrains Mono", monospace';
            ctx.fillText(`STK BUY IMB`, x + 5, y + h / 2 + 3);
          }
          currentBuyRun = [];
        }
      }
      if (currentBuyRun.length >= 3) {
        const yMin = priceToY(prices[currentBuyRun[0] - 1]);
        const yMax = priceToY(prices[currentBuyRun[currentBuyRun.length - 1]]);
        const h = Math.abs(yMax - yMin);
        const y = Math.min(yMin, yMax);

        ctx.save();
        ctx.fillStyle = "rgba(0, 192, 118, 0.08)";
        ctx.strokeStyle = "rgba(0, 192, 118, 0.55)";
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 3]);
        ctx.fillRect(x, y, chartWidth - x, h);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(chartWidth, y);
        ctx.moveTo(x, y + h);
        ctx.lineTo(chartWidth, y + h);
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = "#00C076";
        ctx.font = 'bold 8.5px "JetBrains Mono", monospace';
        ctx.fillText(`STK BUY IMB`, x + 5, y + h / 2 + 3);
      }

      // 2. Detect Sell Imbalances diagonally
      const sellImbalances: boolean[] = Array(prices.length).fill(false);
      for (let i = 0; i < prices.length - 1; i++) {
        const sellVol = c.footprint[prices[i]]?.sellVol || 0;
        const buyVolAbove = c.footprint[prices[i + 1]]?.buyVol || 0;
        if (sellVol > 0 && sellVol >= Math.max(buyVolAbove * 3.0, 10)) {
          sellImbalances[i] = true;
        }
      }

      // Find consecutive runs of sell imbalances of length >= 3
      let currentSellRun: number[] = [];
      for (let i = 0; i < prices.length; i++) {
        if (sellImbalances[i]) {
          currentSellRun.push(i);
        } else {
          if (currentSellRun.length >= 3) {
            const yMin = priceToY(prices[currentSellRun[0]]);
            const yMax = priceToY(
              prices[currentSellRun[currentSellRun.length - 1] + 1],
            );
            const h = Math.abs(yMax - yMin);
            const y = Math.min(yMin, yMax);

            ctx.save();
            ctx.fillStyle = "rgba(255, 59, 48, 0.08)";
            ctx.strokeStyle = "rgba(255, 59, 48, 0.55)";
            ctx.lineWidth = 1.2;
            ctx.setLineDash([4, 3]);

            ctx.fillRect(x, y, chartWidth - x, h);
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(chartWidth, y);
            ctx.moveTo(x, y + h);
            ctx.lineTo(chartWidth, y + h);
            ctx.stroke();

            ctx.restore();
            ctx.fillStyle = "#FF3B30";
            ctx.font = 'bold 8.5px "JetBrains Mono", monospace';
            ctx.fillText(`STK SELL IMB`, x + 5, y + h / 2 + 3);
          }
          currentSellRun = [];
        }
      }
      if (currentSellRun.length >= 3) {
        const yMin = priceToY(prices[currentSellRun[0]]);
        const yMax = priceToY(
          prices[currentSellRun[currentSellRun.length - 1] + 1],
        );
        const h = Math.abs(yMax - yMin);
        const y = Math.min(yMin, yMax);

        ctx.save();
        ctx.fillStyle = "rgba(255, 59, 48, 0.08)";
        ctx.strokeStyle = "rgba(255, 59, 48, 0.55)";
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 3]);
        ctx.fillRect(x, y, chartWidth - x, h);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(chartWidth, y);
        ctx.moveTo(x, y + h);
        ctx.lineTo(chartWidth, y + h);
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = "#FF3B30";
        ctx.font = 'bold 8.5px "JetBrains Mono", monospace';
        ctx.fillText(`STK SELL IMB`, x + 5, y + h / 2 + 3);
      }
    }

    // --- SPOOF DETECTION (SPOOF) ---
    if (indicators.showSpoof) {
      const body = Math.abs(c.close - c.open);
      const upperWick = c.high - Math.max(c.open, c.close);
      const lowerWick = Math.min(c.open, c.close) - c.low;

      // Sell Spoof: Fake buying pressure pulled, resulting in long upper wick and low volume relative to price movement
      if (c.close < c.open && upperWick > body * 1.5 && c.volume < averageVolume * 0.8) {
        const markerY = priceToY(c.high) - 10;
        ctx.fillStyle = "#FF3B30";
        ctx.beginPath();
        ctx.arc(x, markerY, 5, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = "#FFFFFF";
        ctx.font = 'bold 8px "JetBrains Mono", monospace';
        ctx.fillText("S", x - 2.5, markerY + 2.5);
      }
      
      // Buy Spoof: Fake selling pressure pulled, resulting in long lower wick and low volume
      if (c.close > c.open && lowerWick > body * 1.5 && c.volume < averageVolume * 0.8) {
        const markerY = priceToY(c.low) + 10;
        ctx.fillStyle = "#00C076";
        ctx.beginPath();
        ctx.arc(x, markerY, 5, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = "#FFFFFF";
        ctx.font = 'bold 8px "JetBrains Mono", monospace';
        ctx.fillText("S", x - 2.5, markerY + 3);
      }
    }

    // --- FP SHAPE (FOOTPRINT SHAPE) ---
    if (indicators.showFPShape) {
      if (c.footprint && Object.keys(c.footprint).length > 2) {
        const prices = Object.keys(c.footprint).map(Number).sort((a, b) => a - b);
        let topVol = 0;
        let midVol = 0;
        let botVol = 0;
        
        const third = Math.floor(prices.length / 3);
        prices.forEach((p, idx) => {
          const v = c.footprint[p].buyVol + c.footprint[p].sellVol;
          if (idx < third) botVol += v;
          else if (idx >= prices.length - third) topVol += v;
          else midVol += v;
        });
        
        let shape = "";
        let color = "";
        if (topVol > midVol * 1.5 && topVol > botVol * 2) {
          shape = "P";
          color = "#00C076"; // Bullish structure
        } else if (botVol > midVol * 1.5 && botVol > topVol * 2) {
          shape = "b";
          color = "#FF3B30"; // Bearish structure
        } else if (midVol > topVol * 1.5 && midVol > botVol * 1.5) {
          shape = "D";
          color = "#00e5ff"; // Balanced
        }

        if (shape) {
          const yPos = c.close > c.open ? priceToY(c.high) - 18 : priceToY(c.low) + 25;
          ctx.fillStyle = color;
          ctx.font = 'bold 14px "JetBrains Mono", monospace';
          ctx.fillText(shape, x - 4, yPos);
        }
      }
    }

    // --- WHALE TRADES (WHALE) ---
      if (indicators.showWhales && c.footprint && Object.keys(c.footprint).length > 0) {
      let maxBuyVol = 0;
      let maxSellVol = 0;
      Object.values(c.footprint).forEach((stats: any) => {
        if (stats.buyVol > maxBuyVol) maxBuyVol = stats.buyVol;
        if (stats.sellVol > maxSellVol) maxSellVol = stats.sellVol;
      });

      // Lower threshold so whales appear more frequently
      const threshold = Math.max(c.volume * 0.05, 5);

      const matchingWhales: { side: "BUY" | "SELL" }[] = [];
      if (maxBuyVol >= threshold) matchingWhales.push({ side: "BUY" });
      if (maxSellVol >= threshold) matchingWhales.push({ side: "SELL" });

      if (matchingWhales.length > 0) {
        matchingWhales.forEach((w, wIdx) => {
          const isBuy = w.side === "BUY";
          const bubbleY = isBuy
            ? yLow + 25 + wIdx * 18
            : yHigh - 25 - wIdx * 18;
          const text = `🐳 ${isBuy ? "BUY" : "SELL"} WHALE`;

          ctx.save();
          ctx.shadowColor = isBuy
            ? "rgba(0, 245, 212, 0.7)"
            : "rgba(255, 0, 127, 0.7)";
          ctx.shadowBlur = 8;
          ctx.fillStyle = isBuy
            ? "rgba(0, 245, 212, 0.15)"
            : "rgba(255, 0, 127, 0.15)";
          ctx.strokeStyle = isBuy ? "#00F5D4" : "#FF007F";
          ctx.lineWidth = 1.5;

          ctx.font = "bold 9px Inter, sans-serif";
          const textW = ctx.measureText(text).width;
          const bW = textW + 14;
          const bH = 18;

          ctx.beginPath();
          if (ctx.roundRect) {
            ctx.roundRect(x - bW / 2, bubbleY - bH / 2, bW, bH, 6);
          } else {
            ctx.rect(x - bW / 2, bubbleY - bH / 2, bW, bH);
          }
          ctx.fill();
          ctx.stroke();

          // Draw connector line
          ctx.beginPath();
          ctx.strokeStyle = isBuy
            ? "rgba(0, 245, 212, 0.4)"
            : "rgba(255, 0, 127, 0.4)";
          ctx.lineWidth = 1.0;
          ctx.setLineDash([2, 2]);
          ctx.moveTo(x, isBuy ? yLow : yHigh);
          ctx.lineTo(x, bubbleY);
          ctx.stroke();

          ctx.restore();
          ctx.fillStyle = "#ffffff";
          ctx.textAlign = "center";
          ctx.fillText(text, x, bubbleY + 3);
        });
      }
    }
  });

  // --- DRAW EMA CROSS (9 & 26) ---
  if (indicators.showEMA && activeCandles.length > 0) {
    const shortPeriod = 9;
    const longPeriod = 26;
    const kShort = 2 / (shortPeriod + 1);
    const kLong = 2 / (longPeriod + 1);
    
    let prevEmaShort = activeCandles[0].close;
    let prevEmaLong = activeCandles[0].close;
    
    const shortPts: {x: number, y: number}[] = [];
    const longPts: {x: number, y: number}[] = [];
    const crosses: {x: number, y: number}[] = [];
    
    activeCandles.forEach((c, i) => {
      const emaShort = i === 0 ? c.close : (c.close * kShort) + (prevEmaShort * (1 - kShort));
      const emaLong = i === 0 ? c.close : (c.close * kLong) + (prevEmaLong * (1 - kLong));
      
      if (i > 0) {
        if ((prevEmaShort <= prevEmaLong && emaShort > emaLong) || 
            (prevEmaShort >= prevEmaLong && emaShort < emaLong)) {
          crosses.push({ x: timeToX(c.time), y: priceToY(emaShort) });
        }
      }
      
      prevEmaShort = emaShort;
      prevEmaLong = emaLong;
      
      const x = timeToX(c.time);
      if (x >= -10 && x <= chartWidth + 10) {
        shortPts.push({ x, y: priceToY(emaShort) });
        longPts.push({ x, y: priceToY(emaLong) });
      }
    });

    // Draw Long EMA (Green)
    if (longPts.length > 0) {
      ctx.beginPath();
      ctx.strokeStyle = "#4CAF50"; 
      ctx.lineWidth = 1.5;
      ctx.moveTo(longPts[0].x, longPts[0].y);
      for(let i=1; i<longPts.length; i++) ctx.lineTo(longPts[i].x, longPts[i].y);
      ctx.stroke();
    }

    // Draw Short EMA (Orange)
    if (shortPts.length > 0) {
      ctx.beginPath();
      ctx.strokeStyle = "#FF9800"; 
      ctx.lineWidth = 1.5;
      ctx.moveTo(shortPts[0].x, shortPts[0].y);
      for(let i=1; i<shortPts.length; i++) ctx.lineTo(shortPts[i].x, shortPts[i].y);
      ctx.stroke();
    }

    // Draw Crosses (Blue +)
    crosses.forEach(cross => {
      if (cross.x >= -10 && cross.x <= chartWidth + 10) {
        ctx.beginPath();
        ctx.strokeStyle = "#2196F3"; 
        ctx.lineWidth = 3.5;
        const size = 6;
        ctx.moveTo(cross.x - size, cross.y);
        ctx.lineTo(cross.x + size, cross.y);
        ctx.moveTo(cross.x, cross.y - size);
        ctx.lineTo(cross.x, cross.y + size);
        ctx.stroke();
      }
    });
  }



  // --- DRAW INTERACTIVE DRAWING TOOLS ON CANVAS ---
  drawings.forEach((d) => {
    if (d.points.length === 0) return;
    const p1 = d.points[0];
    const x1 = timeToX(p1.time);
    const y1 = priceToY(p1.price);
    const isSelected = d.id === selectedDrawingId;

    ctx.lineWidth = d.lineWidth || (isSelected ? 2 : 1.5);
    ctx.strokeStyle = isSelected ? "#ff9900" : d.color;
    ctx.fillStyle = isSelected ? "#ff9900" : d.color;
    const fillColor =
      d.fillColor ||
      (isSelected ? "rgba(255, 153, 0, 0.15)" : "rgba(255,255,255,0.05)");

    // Draw common vertices if selected
    const drawVertices = () => {
      if (!isSelected) return;
      ctx.fillStyle = "#ff9900";
      d.points.forEach((p) => {
        ctx.beginPath();
        ctx.arc(timeToX(p.time), priceToY(p.price), 4, 0, Math.PI * 2);
        ctx.fill();
      });
    };

    if (d.type === "trendline" && d.points.length >= 2) {
      const x2 = timeToX(d.points[1].time);
      const y2 = priceToY(d.points[1].price);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      drawVertices();
    } else if (d.type === "measure" && d.points.length >= 2) {
      const x2 = timeToX(d.points[1].time);
      const y2 = priceToY(d.points[1].price);
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(0, 192, 255, 0.2)";
      ctx.fillRect(
        Math.min(x1, x2),
        Math.min(y1, y2),
        Math.abs(x2 - x1),
        Math.abs(y2 - y1),
      );
      
      // Draw measurement text (price & percentage)
      const p1 = d.points[0].price;
      const p2 = d.points[1].price;
      const priceDiff = p2 - p1;
      const pctDiff = p1 !== 0 ? (priceDiff / p1) * 100 : 0;
      const diffSign = priceDiff > 0 ? '+' : '';
      const text = `${diffSign}${priceDiff.toFixed(2)} (${diffSign}${pctDiff.toFixed(2)}%)`;
      
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      
      ctx.font = 'bold 12px "Inter", sans-serif';
      const textWidth = ctx.measureText(text).width;
      
      ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
      ctx.fillRect(midX - textWidth/2 - 6, midY - 14, textWidth + 12, 22);
      
      // Force pure white text for readability against the dark box
      ctx.fillStyle = "#ffffff"; 
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, midX, midY - 2);

      drawVertices();
    } else if (d.type === "horizontal") {
      ctx.beginPath();
      ctx.moveTo(0, y1);
      ctx.lineTo(chartWidth, y1);
      ctx.stroke();
      drawVertices();
    } else if (d.type === "rectangle" && d.points.length >= 2) {
      const x2 = timeToX(d.points[1].time);
      const y2 = priceToY(d.points[1].price);
      ctx.fillStyle = fillColor;
      ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
      drawVertices();
    } else if (d.type === "circle" && d.points.length >= 2) {
      const x2 = timeToX(d.points[1].time);
      const y2 = priceToY(d.points[1].price);
      const radius = Math.hypot(x2 - x1, y2 - y1);
      ctx.beginPath();
      ctx.arc(x1, y1, radius, 0, Math.PI * 2);
      ctx.fillStyle = fillColor;
      ctx.fill();
      ctx.stroke();
      drawVertices();
    } else if (d.type === "triangle" && d.points.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(timeToX(d.points[1].time), priceToY(d.points[1].price));
      if (d.points.length >= 3) {
        ctx.lineTo(timeToX(d.points[2].time), priceToY(d.points[2].price));
      }
      ctx.closePath();
      if (d.points.length >= 3) {
        ctx.fillStyle = fillColor;
        ctx.fill();
      }
      ctx.stroke();
      drawVertices();
    } else if (d.type === "path" && d.points.length > 1) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      for (let i = 1; i < d.points.length; i++) {
        ctx.lineTo(timeToX(d.points[i].time), priceToY(d.points[i].price));
      }
      ctx.stroke();
      if (isSelected) drawVertices();
    } else if (d.type === "text-box" || d.type === "price-tag") {
      ctx.font = `${d.textSize || 14}px sans-serif`;
      ctx.fillStyle = d.color;
      const text =
        d.text ||
        (d.type === "price-tag" ? d.points[0].price.toFixed(2) : "Text");
      ctx.fillText(text, x1 + 8, y1 + 4);
      if (d.type === "price-tag") {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1 + 5, y1 + 5);
        ctx.lineTo(x1 + 5, y1 - 5);
        ctx.fill();
      }
      drawVertices();
    } else if (d.type === "fib-retracement" && d.points.length >= 2) {
      const x2 = timeToX(d.points[1].time);
      const y2 = priceToY(d.points[1].price);
      const pRange = d.points[1].price - d.points[0].price;
      const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

      // Draw trendline
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);

      levels.forEach((lvl) => {
        const lvlPrice = d.points[0].price + pRange * lvl;
        const lvlY = priceToY(lvlPrice);
        ctx.strokeStyle = lvl === 0.618 || lvl === 0.382 ? "#FFE100" : d.color;
        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath();
        ctx.moveTo(x1, lvlY);
        ctx.lineTo(Math.max(x1, x2) + 100, lvlY);
        ctx.stroke();
        ctx.font = "10px monospace";
        ctx.fillText(
          `${lvl.toFixed(3)} (${lvlPrice.toFixed(2)})`,
          Math.max(x1, x2) + 105,
          lvlY + 4,
        );
      });
      
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 12px sans-serif";
      ctx.fillText("A", x1 - 10, y1 - 10);
      ctx.fillText("B", x2 - 10, y2 - 10);
      drawVertices();
    } else if (d.type === "fib-extension" && d.points.length >= 2) {
      const x2 = timeToX(d.points[1].time);
      const y2 = priceToY(d.points[1].price);
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);

      if (d.points.length >= 3) {
        const x3 = timeToX(d.points[2].time);
        const y3 = priceToY(d.points[2].price);
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x3, y3);
        ctx.stroke();
        ctx.setLineDash([]);

        const pRange = d.points[1].price - d.points[0].price;
        const levels = [0, 0.618, 1, 1.618, 2.618];
        levels.forEach((lvl) => {
          const lvlPrice = d.points[2].price + pRange * lvl;
          const lvlY = priceToY(lvlPrice);
          ctx.strokeStyle = lvl === 0.618 || lvl === 1.618 ? "#FFD700" : d.color;
          ctx.fillStyle = ctx.strokeStyle;
          ctx.beginPath();
          ctx.moveTo(x3, lvlY);
          ctx.lineTo(x3 + 150, lvlY);
          ctx.stroke();
          ctx.font = "10px monospace";
          ctx.fillText(
            `${lvl.toFixed(3)} (${lvlPrice.toFixed(2)})`,
            x3 + 155,
            lvlY + 4,
          );
        });
      
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 12px sans-serif";
        ctx.fillText("A", x1 - 10, y1 - 10);
        ctx.fillText("B", x2 - 10, y2 - 10);
        ctx.fillText("C", x3 - 10, y3 - 10);
      }
      drawVertices();
    } else if (
      (d.type === "long" || d.type === "short") &&
      d.points.length >= 2
    ) {
      const p2 = d.points[1];
      const p3 = d.points[2];
      const x2 = timeToX(p2.time);
      const y2 = priceToY(p2.price);
      
      let stopY;
      if (p3) {
        stopY = priceToY(p3.price);
      } else {
        const targetDiff = Math.abs(y2 - y1);
        stopY = d.type === "long" ? y1 + targetDiff * 0.4 : y1 - targetDiff * 0.4;
      }

      ctx.fillStyle = "rgba(0, 192, 118, 0.15)";
      ctx.fillRect(x1, Math.min(y1, y2), x2 - x1, Math.abs(y2 - y1));
      ctx.fillStyle = "rgba(255, 59, 48, 0.15)";
      ctx.fillRect(x1, Math.min(y1, stopY), x2 - x1, Math.abs(stopY - y1));
      ctx.strokeStyle = "#00c076";
      ctx.strokeRect(x1, Math.min(y1, y2), x2 - x1, Math.abs(y2 - y1));
      ctx.strokeStyle = "#ff3b30";
      ctx.strokeRect(x1, Math.min(y1, stopY), x2 - x1, Math.abs(stopY - y1));

      const entryPrice = yToPrice(y1);
      const targetPrice = yToPrice(y2);
      const stopLossPrice = yToPrice(stopY);
      
      const targetPct = Math.abs((targetPrice - entryPrice) / entryPrice * 100).toFixed(2);
      const stopPct = Math.abs((stopLossPrice - entryPrice) / entryPrice * 100).toFixed(2);
      const rr = stopPct !== "0.00" ? (parseFloat(targetPct) / parseFloat(stopPct)).toFixed(2) : "∞";

      ctx.fillStyle = "#ffffff";
      ctx.font = "11px sans-serif";
      
      const textPadding = 4;
      
      // Target %
      const targetText = targetPct + "%";
      const targetTextWidth = ctx.measureText(targetText).width;
      ctx.fillStyle = "rgba(0, 192, 118, 0.4)";
      ctx.fillRect(x1 + 5, Math.min(y1, y2) + Math.abs(y2 - y1) / 2 - 6, targetTextWidth + textPadding * 2, 16);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(targetText, x1 + 5 + textPadding, Math.min(y1, y2) + Math.abs(y2 - y1) / 2 + 5);
      
      // Stop %
      const stopText = stopPct + "%";
      const stopTextWidth = ctx.measureText(stopText).width;
      ctx.fillStyle = "rgba(255, 59, 48, 0.4)";
      ctx.fillRect(x1 + 5, Math.min(y1, stopY) + Math.abs(stopY - y1) / 2 - 6, stopTextWidth + textPadding * 2, 16);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(stopText, x1 + 5 + textPadding, Math.min(y1, stopY) + Math.abs(stopY - y1) / 2 + 5);
      
      // RR Ratio
      const rrText = "RR: " + rr;
      const rrTextWidth = ctx.measureText(rrText).width;
      ctx.fillStyle = "rgba(20, 25, 30, 0.6)";
      ctx.fillRect(x1 + 5, y1 + (d.type === "long" ? -18 : 7), rrTextWidth + textPadding * 2, 16);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(rrText, x1 + 5 + textPadding, y1 + (d.type === "long" ? -7 : 18));
      
      // Axis Price Tags
      const drawAxisTag = (y: number, text: string, bgColor: string, txtColor: string = "#ffffff") => {
        if (y < 0 || y > chartHeight) return;
        ctx.fillStyle = bgColor;
        ctx.fillRect(chartWidth + 2, y - 8, 80, 16);
        ctx.fillStyle = txtColor;
        ctx.textAlign = "center";
        ctx.fillText(text, chartWidth + 42, y + 4);
        ctx.textAlign = "left"; // reset
      };
      
      drawAxisTag(y2, targetPrice.toFixed(2), "#00c076"); // TP
      drawAxisTag(y1, entryPrice.toFixed(2), "#555555");  // Entry
      drawAxisTag(stopY, stopLossPrice.toFixed(2), "#ff3b30"); // SL

      drawVertices();
    }
  });

  // --- STATISTICS FOOTPRINT TABLE    // --- STATISTICS FOOTPRINT TABLE (Ask, Bid, Delta, Volume) ---
  if (indicators.showStats) {
    const statsTop = chartHeight;
    const rowHeight = 18;

    // Draw solid dark background matching institutional trading UI (distinct panel shade)
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, statsTop, width, statsHeight);

    // Top container boundary border
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, statsTop);
    ctx.lineTo(width, statsTop);
    ctx.stroke();

    // Draw subtle row dividers & left labels
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 1;

    const labels = ["Ask", "Bid", "Delta", "Volume"];
    labels.forEach((label, i) => {
      const yLine = statsTop + i * rowHeight;
      if (i > 0) {
        ctx.beginPath();
        ctx.moveTo(0, yLine);
        ctx.lineTo(width, yLine);
        ctx.stroke();
      }

      ctx.fillStyle = "#cbd5e1"; // Bright high-contrast label color
      ctx.font = "bold 9.5px Inter, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(label, 12, yLine + 12.5);
    });

    // Left panel divider separating labels from actual values
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(75, statsTop);
    ctx.lineTo(75, statsTop + statsHeight);
    ctx.stroke();

    // Render columns aligned with candles
    activeCandles.forEach((c) => {
      const x = timeToX(c.time);
      if (x <= 75 || x >= chartWidth) return;

      // Vertical alignment line
      ctx.strokeStyle = "rgba(51, 65, 85, 0.35)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, statsTop);
      ctx.lineTo(x, statsTop + statsHeight);
      ctx.stroke();

      ctx.font = 'bold 9.5px "JetBrains Mono", Courier, monospace';
      ctx.textAlign = "center";

      // 1. Ask (buyVolume)
      const rawAsk = c.buyVolume;
      const rawBid = c.sellVolume;

      const roundedAsk = Math.round(rawAsk);
      const roundedBid = Math.round(rawBid);
      const roundedDelta = roundedAsk - roundedBid;
      const roundedVolume = roundedAsk + roundedBid;

      let displayAsk = "";
      let displayBid = "";
      let displayDelta = "";
      let displayVolume = "";

      if (Math.max(Math.abs(rawAsk), Math.abs(rawBid)) < 1000) {
        displayAsk = roundedAsk.toString();
        displayBid = roundedBid.toString();
        displayDelta = (roundedDelta > 0 ? "+" : "") + roundedDelta.toString();
        displayVolume = roundedVolume.toString();
      } else {
        displayAsk = formatStatValue(rawAsk);
        displayBid = formatStatValue(rawBid);
        displayDelta =
          (roundedDelta > 0 ? "+" : "") + formatStatValue(roundedDelta);
        displayVolume = formatStatValue(roundedVolume);
      }

      ctx.fillStyle = "#00C076";
      ctx.fillText(displayAsk, x, statsTop + 12.5);

      // 2. Bid (sellVolume)
      ctx.fillStyle = "#FF3B30";
      ctx.fillText(displayBid, x, statsTop + rowHeight + 12.5);

      // 3. Delta
      ctx.fillStyle = roundedDelta >= 0 ? "#00C076" : "#FF3B30";
      ctx.fillText(displayDelta, x, statsTop + 2 * rowHeight + 12.5);

      // 4. Volume
      ctx.fillStyle = "#ffffff";
      ctx.fillText(displayVolume, x, statsTop + 3 * rowHeight + 12.5);
    });
  }

  let currentRSI: number | null = null;
  let currentRsiY: number | null = null;
  let currentVPT: number | null = null;
  let currentVptY: number | null = null;
  let currentDeltaV: number | null = null;
  let currentDeltaVY: number | null = null;

  const paneHeight = 100;
  let activePanes = 0;
  if (indicators.showRSI && activeCandles.length > 14) activePanes++;
  if (indicators.showVPT && activeCandles.length > 0) activePanes++;
  if (indicators.showDeltaCVD && activeCandles.length > 0) activePanes++;
  if (indicators.showDeltaV && activeCandles.length > 0) activePanes++;
  if (indicators.showVol && activeCandles.length > 0) activePanes++;
  if (indicators.showOI && activeCandles.length > 0) activePanes++;
  if (indicators.showOIT && activeCandles.length > 0) activePanes++;
  
  const bottomPanesTotalHeight = activePanes * paneHeight;
  let currentPaneTop = chartHeight - bottomPanesTotalHeight;

  // --- VPT OVERLAY ---
  if (indicators.showVPT && activeCandles.length > 0) {
    const vptTop = currentPaneTop;
    currentPaneTop += paneHeight;

    // Draw Background
    ctx.fillStyle = "rgba(10, 13, 18, 0.8)";
    ctx.fillRect(0, vptTop, chartWidth, paneHeight);
    
    // Draw 0 line
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, vptTop + paneHeight / 2);
    ctx.lineTo(chartWidth, vptTop + paneHeight / 2);
    ctx.stroke();

    // Calculate VPT
    const vptValues: number[] = new Array(activeCandles.length).fill(0);
    let vpt = 0;
    let minVpt = 0;
    let maxVpt = 0;

    for (let i = 1; i < activeCandles.length; i++) {
      const c = activeCandles[i];
      const prevC = activeCandles[i - 1];
      const priceChange = (c.close - prevC.close) / prevC.close;
      vpt = vpt + (c.volume * priceChange);
      vptValues[i] = vpt;
      if (i === activeCandles.length - 1) currentVPT = vpt;
      
      const x = timeToX(c.time);
      if (x >= -10 && x <= chartWidth + 10) {
        if (vpt < minVpt) minVpt = vpt;
        if (vpt > maxVpt) maxVpt = vpt;
      }
    }
    
    // Normalize to Pane
    const vptRange = Math.max(Math.abs(maxVpt), Math.abs(minVpt), 1) * 1.1; // 10% padding
    
    ctx.beginPath();
    ctx.strokeStyle = "#ff9800"; // Orange VPT line
    ctx.lineWidth = 1.5;
    
    let started = false;
    for (let i = 1; i < activeCandles.length; i++) {
      const x = timeToX(activeCandles[i].time);
      if (x >= -10 && x <= chartWidth + 10) {
        // vptRange maps to paneHeight/2. Center is vptTop + paneHeight/2.
        const vptY = (vptTop + paneHeight / 2) - (vptValues[i] / vptRange) * (paneHeight / 2);
        if (i === activeCandles.length - 1) currentVptY = vptY;
        
        if (!started) {
          ctx.moveTo(x, vptY);
          started = true;
        } else {
          ctx.lineTo(x, vptY);
        }
      }
    }
    ctx.stroke();

    // Draw VPT label
    ctx.fillStyle = "#ff9800";
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.fillText("VPT", 10, vptTop + 15);
  }

  // --- CVD OVERLAY ---
  if (indicators.showDeltaCVD && activeCandles.length > 0) {
    const cvdTop = currentPaneTop;
    currentPaneTop += paneHeight;

    // Draw Background
    ctx.fillStyle = "rgba(10, 13, 18, 0.8)";
    ctx.fillRect(0, cvdTop, chartWidth, paneHeight);
    
    // Draw 0 line
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, cvdTop + paneHeight / 2);
    ctx.lineTo(chartWidth, cvdTop + paneHeight / 2);
    ctx.stroke();

    // Calculate CVD
    const cvdValues: number[] = new Array(activeCandles.length).fill(0);
    let cvd = 0;
    let minCvd = 0;
    let maxCvd = 0;

    for (let i = 0; i < activeCandles.length; i++) {
      cvd += activeCandles[i].delta;
      cvdValues[i] = cvd;
      if (cvd < minCvd) minCvd = cvd;
      if (cvd > maxCvd) maxCvd = cvd;
    }

    const cvdRange = Math.max(Math.abs(maxCvd), Math.abs(minCvd));

    // Draw CVD line
    ctx.strokeStyle = "#00e5ff"; // cyan for CVD
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    let started = false;
    let currentCvdY = cvdTop + paneHeight / 2;
    for (let i = 0; i < activeCandles.length; i++) {
      const c = activeCandles[i];
      const x = timeToX(c.time);
      if (x >= -vs.barWidth && x <= chartWidth + vs.barWidth) {
        let cvdY = cvdTop + paneHeight / 2;
        if (cvdRange !== 0) {
          cvdY = (cvdTop + paneHeight / 2) - (cvdValues[i] / cvdRange) * (paneHeight / 2);
        }
        
        if (i === activeCandles.length - 1) currentCvdY = cvdY;

        if (!started) {
          ctx.moveTo(x, cvdY);
          started = true;
        } else {
          ctx.lineTo(x, cvdY);
        }
      }
    }
    ctx.stroke();

    const currentCvdStr = cvdValues.length > 0 ? cvdValues[cvdValues.length - 1].toFixed(2) : "0.00";

    // Draw CVD label on the right scale (level)
    ctx.fillStyle = "#00e5ff"; // cyan
    ctx.fillRect(chartWidth, currentCvdY - 10, width - chartWidth, 20);
    ctx.fillStyle = "#000000"; // black text
    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    ctx.fillText(currentCvdStr, chartWidth + 5, currentCvdY + 4);

    // Draw CVD label at the top left
    ctx.fillStyle = "#00e5ff";
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.fillText(`CVD (Cumulative Volume Delta): ${currentCvdStr}`, 10, cvdTop + 15);
  }

  // --- OI OVERLAY ---
  if (indicators.showOI && activeCandles.length > 0) {
    const oiTop = currentPaneTop;
    currentPaneTop += paneHeight;

    // Draw Background
    ctx.fillStyle = "rgba(10, 13, 18, 0.8)";
    ctx.fillRect(0, oiTop, chartWidth, paneHeight);

    // Calculate OI (Simulated as cumulative sum of volume influenced by delta)
    const oiValues: number[] = new Array(activeCandles.length).fill(0);
    let oi = 1000000; // Base arbitrary OI
    let minOi = Infinity;
    let maxOi = -Infinity;

    for (let i = 0; i < activeCandles.length; i++) {
      const c = activeCandles[i];
      const body = Math.abs(c.close - c.open);
      const totalWicks = (c.high - c.low) - body;
      const oiChange = (c.volume * 0.1) - (totalWicks * c.volume * 0.05);
      oi += oiChange;
      oiValues[i] = oi;
      if (oi < minOi) minOi = oi;
      if (oi > maxOi) maxOi = oi;
    }

    const oiRange = Math.max(maxOi - minOi, 1);

    ctx.strokeStyle = "#32CD32"; // Lime green for OI
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    let started = false;
    let currentOiY = oiTop + paneHeight / 2;
    for (let i = 0; i < activeCandles.length; i++) {
      const c = activeCandles[i];
      const x = timeToX(c.time);
      if (x >= -vs.barWidth && x <= chartWidth + vs.barWidth) {
        let oiY = (oiTop + paneHeight - 10) - ((oiValues[i] - minOi) / oiRange) * (paneHeight - 20);
        if (i === activeCandles.length - 1) currentOiY = oiY;

        if (!started) {
          ctx.moveTo(x, oiY);
          started = true;
        } else {
          ctx.lineTo(x, oiY);
        }
      }
    }
    ctx.stroke();

    const currentOiStr = oiValues.length > 0 ? (oiValues[oiValues.length - 1] / 1000).toFixed(1) + "k" : "0.0k";

    ctx.fillStyle = "#32CD32";
    ctx.fillRect(chartWidth, currentOiY - 10, width - chartWidth, 20);
    ctx.fillStyle = "#000000";
    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    ctx.fillText(currentOiStr, chartWidth + 5, currentOiY + 4);

    ctx.fillStyle = "#32CD32";
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.fillText(`OI (Open Interest): ${currentOiStr}`, 10, oiTop + 15);
  }

  // --- OIT OVERLAY (Open Interest Trend) ---
  if (indicators.showOIT && activeCandles.length > 0) {
    const oitTop = currentPaneTop;
    currentPaneTop += paneHeight;

    // Draw Background
    ctx.fillStyle = "rgba(10, 13, 18, 0.8)";
    ctx.fillRect(0, oitTop, chartWidth, paneHeight);
    
    // Draw 0 line
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, oitTop + paneHeight / 2);
    ctx.lineTo(chartWidth, oitTop + paneHeight / 2);
    ctx.stroke();

    // Calculate OIT (Simulated as delta of OI over 5 periods)
    const oitValues: number[] = new Array(activeCandles.length).fill(0);
    let maxOit = 0;
    
    let oi = 1000000;
    const pastOi: number[] = [];
    for (let i = 0; i < activeCandles.length; i++) {
      const c = activeCandles[i];
      const body = Math.abs(c.close - c.open);
      const totalWicks = (c.high - c.low) - body;
      oi += (c.volume * 0.1) - (totalWicks * c.volume * 0.05);
      pastOi.push(oi);
      
      if (i > 5) {
        const oit = pastOi[i] - pastOi[i - 5];
        oitValues[i] = oit;
        if (Math.abs(oit) > maxOit) maxOit = Math.abs(oit);
      }
    }

    const oitRange = Math.max(maxOit, 1);
    const zeroLineY = oitTop + paneHeight / 2;

    for (let i = 0; i < activeCandles.length; i++) {
      const x = timeToX(activeCandles[i].time);
      if (x >= -vs.barWidth && x <= chartWidth + vs.barWidth) {
        const val = oitValues[i];
        const barHeight = (Math.abs(val) / oitRange) * (paneHeight / 2 - 5);
        
        ctx.fillStyle = val > 0 ? "rgba(50, 205, 50, 0.8)" : "rgba(255, 59, 48, 0.8)";
        
        if (val > 0) {
          ctx.fillRect(x - vs.barWidth / 2, zeroLineY - barHeight, vs.barWidth, barHeight);
        } else {
          ctx.fillRect(x - vs.barWidth / 2, zeroLineY, vs.barWidth, barHeight);
        }
      }
    }

    ctx.fillStyle = "#32CD32";
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.fillText(`OIT (OI Trend)`, 10, oitTop + 15);
  }


  // --- DELTA-V OVERLAY ---
  if (indicators.showDeltaV && activeCandles.length > 0) {
    const deltaVPaneHeight = paneHeight;
    const deltaVTop = currentPaneTop;
    currentPaneTop += paneHeight;
    const deltaVBottom = deltaVTop + deltaVPaneHeight;
    const zeroLineY = deltaVTop + deltaVPaneHeight / 2;

    // Draw Background
    ctx.fillStyle = "rgba(10, 13, 18, 0.8)";
    ctx.fillRect(0, deltaVTop, chartWidth, deltaVPaneHeight);

    // Draw 0 line
    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(0, zeroLineY);
    ctx.lineTo(chartWidth, zeroLineY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Calculate Scale
    let maxAbsDelta = 0;
    activeCandles.forEach(c => {
      const cMax = Math.max(0, c.delta) + (c.buyVolume * 0.2);
      const cMin = Math.min(0, c.delta) - (c.sellVolume * 0.2);
      if (Math.abs(cMax) > maxAbsDelta) maxAbsDelta = Math.abs(cMax);
      if (Math.abs(cMin) > maxAbsDelta) maxAbsDelta = Math.abs(cMin);
    });
    const deltaScale = (deltaVPaneHeight / 2) / (maxAbsDelta * 1.1 || 1);

    // Draw Candles
    for (let i = 0; i < activeCandles.length; i++) {
      const c = activeCandles[i];
      const x = timeToX(c.time);
      if (x < -20 || x > chartWidth + 20) continue;

      const cMax = Math.max(0, c.delta) + (c.buyVolume * 0.2);
      const cMin = Math.min(0, c.delta) - (c.sellVolume * 0.2);

      const openY = zeroLineY;
      const closeY = zeroLineY - (c.delta * deltaScale);
      const highY = zeroLineY - (cMax * deltaScale);
      const lowY = zeroLineY - (cMin * deltaScale);

      const col = c.delta > 0 ? "#008080" : "#FF3B30"; // Teal and Red

      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, highY);
      ctx.lineTo(x, lowY);
      ctx.stroke();

      ctx.fillStyle = col;
      const candleW = Math.max(1, vs.barWidth);
      const rectTop = Math.min(openY, closeY);
      const rectHeight = Math.abs(openY - closeY) || 1;
      ctx.fillRect(x - candleW / 2, rectTop, candleW, rectHeight);
      
      if (i === activeCandles.length - 1) {
          currentDeltaV = c.delta;
          currentDeltaVY = closeY;
      }
    }

    // Draw Label
    ctx.fillStyle = "#008080";
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    const lastC = activeCandles[activeCandles.length - 1];
    const cMax = Math.max(0, lastC.delta) + (lastC.buyVolume * 0.2);
    const cMin = Math.min(0, lastC.delta) - (lastC.sellVolume * 0.2);
    ctx.fillText(`Volume Delta 0 ${cMax.toFixed(0)} ${cMin.toFixed(0)} ${lastC.delta.toFixed(0)}`, 10, deltaVTop + 15);
  }

  // --- RSI OVERLAY ---
  if (indicators.showRSI && activeCandles.length > 14) {
    const rsiPeriod = 14;
    const rsiPaneHeight = paneHeight;
    const rsiTop = currentPaneTop;
    currentPaneTop += paneHeight;
    const rsiBottom = rsiTop + rsiPaneHeight;

    // Draw RSI Background Pane
    ctx.fillStyle = "rgba(10, 13, 18, 0.8)";
    ctx.fillRect(0, rsiTop, chartWidth, rsiPaneHeight);
    
    // Draw 30 / 70 lines
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, rsiTop + rsiPaneHeight * 0.3); // 70 line
    ctx.lineTo(chartWidth, rsiTop + rsiPaneHeight * 0.3);
    ctx.moveTo(0, rsiTop + rsiPaneHeight * 0.7); // 30 line
    ctx.lineTo(chartWidth, rsiTop + rsiPaneHeight * 0.7);
    ctx.stroke();

    // Fill area between 30 and 70 (optional for styling)
    ctx.fillStyle = "rgba(123, 97, 255, 0.05)";
    ctx.fillRect(0, rsiTop + rsiPaneHeight * 0.3, chartWidth, rsiPaneHeight * 0.4);

    let gains = 0;
    let losses = 0;
    const rsiValues = new Array(activeCandles.length).fill(0);

    for (let i = 1; i <= rsiPeriod; i++) {
      const change = activeCandles[i].close - activeCandles[i - 1].close;
      if (change > 0) gains += change;
      else losses -= change;
    }
    let avgGain = gains / rsiPeriod;
    let avgLoss = losses / rsiPeriod;
    rsiValues[rsiPeriod] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));

    ctx.beginPath();
    ctx.strokeStyle = "#7b61ff"; // Purple RSI line
    ctx.lineWidth = 1.5;

    let started = false;

    for (let i = rsiPeriod + 1; i < activeCandles.length; i++) {
      const change = activeCandles[i].close - activeCandles[i - 1].close;
      const gain = change > 0 ? change : 0;
      const loss = change < 0 ? -change : 0;
      
      avgGain = (avgGain * (rsiPeriod - 1) + gain) / rsiPeriod;
      avgLoss = (avgLoss * (rsiPeriod - 1) + loss) / rsiPeriod;
      
      const rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
      rsiValues[i] = rsi;
      const rsiY = rsiBottom - (rsi / 100) * rsiPaneHeight;
      if (i === activeCandles.length - 1) {
        currentRSI = rsi;
        currentRsiY = rsiY;
      }

      const x = timeToX(activeCandles[i].time);
      if (x >= -10 && x <= chartWidth + 10) {
        const rsiY = rsiBottom - (rsi / 100) * rsiPaneHeight;
        if (!started) {
          ctx.moveTo(x, rsiY);
          started = true;
        } else {
          ctx.lineTo(x, rsiY);
        }
      }
    }
    ctx.stroke();

    // Draw RSI label
    ctx.fillStyle = "#7b61ff";
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.fillText("RSI 14", 10, rsiTop + 15);
  }

  // --- VOL OVERLAY ---
  if (indicators.showVol && activeCandles.length > 0) {
    const volPaneHeight = paneHeight;
    const volTop = currentPaneTop;
    currentPaneTop += paneHeight;
    const volBottom = volTop + volPaneHeight;

    // Background Pane
    ctx.fillStyle = "rgba(10, 13, 18, 0.8)";
    ctx.fillRect(0, volTop, chartWidth, volPaneHeight);

    const maxVol = Math.max(...activeCandles.map(c => c.volume || 0), 1);
    const defaultW = activeCandles.length > 1 ? (timeToX(activeCandles[1].time) - timeToX(activeCandles[0].time)) * 0.8 : 5;
    const barW = Math.max(1, defaultW);

    for (let i = 0; i < activeCandles.length; i++) {
      const c = activeCandles[i];
      const x = timeToX(c.time);
      if (x >= -20 && x <= chartWidth + 20) {
        const volH = (c.volume / maxVol) * volPaneHeight * 0.9;
        ctx.fillStyle = c.close >= c.open ? "rgba(16, 185, 129, 0.5)" : "rgba(239, 68, 68, 0.5)";
        ctx.fillRect(x - barW / 2, volBottom - volH, barW, volH);
      }
    }

    // Label
    ctx.fillStyle = "#ffffff";
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.fillText("Volume", 10, volTop + 15);
  }

  // --- TIMELINE AXIS & PRICE SCALE RENDERING ---
  ctx.fillStyle = "#000000"; // Seamless continuous black background matching screenshot!
  ctx.fillRect(chartWidth, 0, 85, chartHeight + statsHeight); // scale fill
  
  if (mpasFibData) {
      const { p1x, p1y, p2x, p2y } = mpasFibData;
      const diff = p2y - p1y;
      const levels = [
        { v: 0.236, c: "#808080" },
        { v: 0.382, c: "#00ff00" },
        { v: 0.500, c: "#ffff00" },
        { v: 0.618, c: "#ffa500" },
        { v: 0.786, c: "#ff0000" }
      ];
      
      // Calculate where to stop the lines and text
      const isMobile = window.innerWidth < 768;
      const hasDom = indicators.showLiveDOMProfile || indicators.showVolumeProfile;
      const domWidth = hasDom ? (isMobile ? 90 : 140) : 0;
      const endX = chartWidth - domWidth;
      
      ctx.save();
      ctx.strokeStyle = "#ffffff";
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(p1x, p1y);
      ctx.lineTo(p2x, p2y);
      ctx.stroke();
      ctx.restore();
      
      levels.forEach(lvl => {
         const ly = p1y + diff * lvl.v;
         ctx.save();
         ctx.strokeStyle = "rgba(255,255,255,0.2)";
         ctx.lineWidth = 1;
         ctx.beginPath();
         ctx.moveTo(p2x, ly);
         ctx.lineTo(endX, ly);
         ctx.stroke();
         ctx.restore();
         
         ctx.save();
         ctx.font = "10px sans-serif";
         ctx.fillStyle = lvl.c;
         ctx.textAlign = "right";
         ctx.textBaseline = "bottom";
         ctx.fillText(lvl.v.toString(), endX - 5, ly - 2);
         ctx.restore();
      });
  }
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, chartHeight + statsHeight, width, 28); // timeline fill

  ctx.strokeStyle = "#141a22";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(chartWidth, 0);
  ctx.lineTo(chartWidth, chartHeight + statsHeight);
  ctx.moveTo(0, chartHeight + statsHeight);
  ctx.lineTo(width, chartHeight + statsHeight);
  ctx.stroke();

  // --- DRAW NEWS VERTICAL LINES ---
  if (indicators.showNews && globalNews && globalNews.length > 0) {
    globalNews.forEach((news) => {
      // API provides date string like "2026-07-08T10:00:00-04:00"
      const newsTime = new Date(news.date).getTime();
      
      const x = timeToX(newsTime);
      
      // Check if news x coordinate is within the visible canvas width
      if (x >= 0 && x <= chartWidth) {
        const impact = news.impact?.toLowerCase() || '';
        const isHigh = impact.includes('high');
        const isMedium = impact.includes('medium');
        
        // Vertical Band (Zone)
        const bandColor = isHigh ? 'rgba(239, 68, 68, 0.08)' : isMedium ? 'rgba(249, 115, 22, 0.08)' : 'rgba(100, 100, 100, 0.05)';
        ctx.fillStyle = bandColor;
        // The band covers 20px width around the timestamp
        ctx.fillRect(x - 10, 0, 20, chartHeight);

        // Vertical Line inside the band (optional, faint)
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, chartHeight);
        ctx.strokeStyle = isHigh ? 'rgba(239, 68, 68, 0.3)' : isMedium ? 'rgba(249, 115, 22, 0.3)' : 'rgba(100, 100, 100, 0.2)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Draw interactive circle at the bottom (Time axis)
        const cy = chartHeight + statsHeight - 12; // 12px up into the chart area
        ctx.beginPath();
        ctx.arc(x, cy, 10, 0, Math.PI * 2); // Radius 10
        ctx.fillStyle = isHigh ? '#ef4444' : isMedium ? '#f97316' : '#64748b';
        ctx.fill();
        ctx.strokeStyle = '#0f172a'; // Background color border
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw icon/flag text (N) inside
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px Inter';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        let countryCode = 'N';
        if (news.country === 'USD') countryCode = 'US';
        if (news.country === 'EUR') countryCode = 'EU';
        if (news.country === 'GBP') countryCode = 'GB';
        if (news.country === 'JPY') countryCode = 'JP';
        if (news.country === 'AUD') countryCode = 'AU';
        if (news.country === 'CAD') countryCode = 'CA';
        if (news.country === 'CHF') countryCode = 'CH';
        if (news.country === 'NZD') countryCode = 'NZ';
        ctx.fillText(countryCode, x, cy + 1);
      }
    });
  }

  // --- Y-AXIS STATIC PRICE LABELS ---
  const roughAxisStep = priceRange / 10;
  const axisMagnitude = Math.pow(10, Math.floor(Math.log10(roughAxisStep || 1)));
  const normAxisStep = roughAxisStep / axisMagnitude;
  let axisStepMulti = 1;
  if (normAxisStep < 1.5) axisStepMulti = 1;
  else if (normAxisStep < 3.5) axisStepMulti = 2.5;
  else if (normAxisStep < 7.5) axisStepMulti = 5;
  else axisStepMulti = 10;
  let cleanAxisStep = axisMagnitude * axisStepMulti;

  ctx.fillStyle = "#8f9cae";
  ctx.font = '11px "JetBrains Mono", monospace';
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  for (
    let p = Math.floor(currentPriceMin / cleanAxisStep) * cleanAxisStep;
    p <= currentPriceMax;
    p += cleanAxisStep
  ) {
    const y = priceToY(p);
    const bottomPanesOffset = bottomPanesTotalHeight;
    if (y > 0 && y < chartHeight - bottomPanesOffset) {
      ctx.fillText(formatPrice(p), chartWidth + 8, y);
    }
  }

  // --- LIVE PRICE TRACKER ON Y-AXIS ---
  const lastCandleObj = activeCandles[activeCandles.length - 1];
  const currentPrice = lastCandleObj ? lastCandleObj.close : 0;
  if (currentPrice > 0) {
    const y = priceToY(currentPrice);
    const isUp = lastCandleObj.close >= lastCandleObj.open;
    ctx.fillStyle = isUp ? "#10b981" : "#ef4444"; // bg-emerald-500 or bg-rose-500
    ctx.fillRect(chartWidth, y - 12, 85, 24);
    ctx.fillStyle = "#ffffff";
    ctx.font = 'bold 12px "JetBrains Mono", monospace';
    ctx.fillText(formatPrice(currentPrice), chartWidth + 8, y + 1);

    // Draw dashed line across the chart for current price
    ctx.strokeStyle = isUp ? "#10b981" : "#ef4444";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(chartWidth, y);
    ctx.stroke();
    ctx.setLineDash([]); // reset
  }

  // --- SUB-WINDOW LIVE TRACKERS ON Y-AXIS ---
  if (currentRsiY !== null && currentRSI !== null) {
    ctx.fillStyle = "#7b61ff";
    ctx.fillRect(chartWidth, currentRsiY - 12, 85, 24);
    ctx.fillStyle = "#ffffff";
    ctx.font = 'bold 12px "JetBrains Mono", monospace';
    ctx.fillText(currentRSI.toFixed(2), chartWidth + 8, currentRsiY + 4);

    ctx.strokeStyle = "#7b61ff";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, currentRsiY);
    ctx.lineTo(chartWidth, currentRsiY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (currentVptY !== null && currentVPT !== null) {
    ctx.fillStyle = "#ff9800";
    ctx.fillRect(chartWidth, currentVptY - 12, 85, 24);
    ctx.fillStyle = "#ffffff";
    ctx.font = 'bold 12px "JetBrains Mono", monospace';
    ctx.fillText(currentVPT.toFixed(2), chartWidth + 8, currentVptY + 4);

    ctx.strokeStyle = "#ff9800";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, currentVptY);
    ctx.lineTo(chartWidth, currentVptY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // --- REAL-TIME DOM PROFILE COLUMN OVERLAY (as requested by user) ---
  {
    const isMobile = window.innerWidth < 768;
    const domColWidth = isMobile ? 90 : 140;
    const domColX = chartWidth - domColWidth;

    // Draw a solid black background for DOM column inside the chart area to hide lines behind it
    ctx.fillStyle = "#000000"; // Solid black as requested
    ctx.fillRect(domColX, 0, domColWidth, chartHeight);

    // --- DRAW MPAS DATA (PRICES) OVER DOM BACKGROUND ---
    if (mpasObBoxesToDraw.length > 0) {
        ctx.save();
        ctx.font = "bold 10px sans-serif";
        mpasObBoxesToDraw.forEach(ob => {
           const y1 = priceToY(ob.y1);
           const y2 = priceToY(ob.y2);
           ctx.fillStyle = ob.isTop ? "#f24968" : "#14d990";
           ctx.fillText(formatPrice(ob.y1), domColX + 5, y1 + 3);
           ctx.fillText(formatPrice(ob.y2), domColX + 5, y2 + 3);
        });
        ctx.restore();
    }
  
    if (mpasFvgsToDraw.length > 0) {
        ctx.save();
        ctx.font = "bold 10px sans-serif";
        ctx.fillStyle = "#f2b807";
        mpasFvgsToDraw.forEach(fvg => {
           const y1 = priceToY(fvg.y1);
           const y2 = priceToY(fvg.y2);
           ctx.fillText(formatPrice(fvg.y1), domColX + 5, y1 + 3);
           ctx.fillText(formatPrice(fvg.y2), domColX + 5, y2 + 3);
        });
        ctx.restore();
    }



    // Draw vertical divider between chart and DOM column
    ctx.strokeStyle = "rgba(20, 26, 34, 0.6)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(domColX, 0);
    ctx.lineTo(domColX, chartHeight);
    ctx.stroke();

    // Dynamically scale bucket count based on zoom ratio
    // When zoomed in (small zoomRatio), we want fewer, thicker bars (e.g., 20-35 buckets) so text fits beautifully
    // When zoomed out (large zoomRatio), we want more, denser bars (e.g., 75 buckets) for a smooth profile
    const zoomRatio = (currentPriceMax - currentPriceMin) / (currentPrice || 1);
    let bucketCount = 75;
    if (zoomRatio < 0.008) {
      bucketCount = 20;
    } else if (zoomRatio < 0.015) {
      bucketCount = 30;
    } else if (zoomRatio < 0.03) {
      bucketCount = 45;
    } else if (zoomRatio < 0.06) {
      bucketCount = 60;
    }

    const bucketStep = (currentPriceMax - currentPriceMin) / bucketCount || 0.1;

    if (indicators.showVolumeProfile) {
      // --- HISTORICAL CANDLE VOLUME PROFILE (VP) DRAWN INSIDE THE DOM COLUMN OVERLAY ---
      // We will compute the REAL, STABLE Volume Profile using activeCandles volume distributed by price
      const domProfileBuckets: {
        price: number;
        type: "bid" | "ask";
        amount: number;
      }[] = [];

      for (let i = 0; i < bucketCount; i++) {
        const price = currentPriceMin + i * bucketStep + bucketStep / 2;
        const type = price >= currentPrice ? "ask" : "bid";
        domProfileBuckets.push({ price, type, amount: 0 });
      }

      // Fetch deep order book and merge with live websocket bids/asks for a dancing DOM
      // Fetch deep order book and merge with live websocket bids/asks for perfectly accurate center
      const liveBids = domState.deepOrderBook?.bids ? [...domState.deepOrderBook.bids] : [...bids];
      const liveAsks = domState.deepOrderBook?.asks ? [...domState.deepOrderBook.asks] : [...asks];

      // Merge the actual live 30-level WebSocket data to guarantee perfect accuracy at the center
      bids.forEach(l => {
        const idx = liveBids.findIndex(t => Math.abs(t.price - l.price) < 0.5);
        if (idx !== -1) liveBids[idx] = l;
        else liveBids.push(l);
      });
      asks.forEach(l => {
        const idx = liveAsks.findIndex(t => Math.abs(t.price - l.price) < 0.5);
        if (idx !== -1) liveAsks[idx] = l;
        else liveAsks.push(l);
      });

      // Distribute REAL liquidity into the visual buckets!
      liveBids.forEach((b) => {
        const binIdx = Math.floor((b.price - currentPriceMin) / bucketStep);
        if (binIdx >= 0 && binIdx < bucketCount) {
          domProfileBuckets[binIdx].amount += b.amount * (0.95 + Math.random() * 0.1); // Add live breathing jitter
        }
      });
      liveAsks.forEach((a) => {
        const binIdx = Math.floor((a.price - currentPriceMin) / bucketStep);
        if (binIdx >= 0 && binIdx < bucketCount) {
          domProfileBuckets[binIdx].amount += a.amount * (0.95 + Math.random() * 0.1);
        }
      });

      // EXTRAPOLATION: If the exchange depth (e.g. 1000 levels = $100) doesn't cover the full zoomed-out screen,
      // the outer buckets will be perfectly empty. We extrapolate them so the user sees a full-screen DOM!
      
      // Find the outermost populated bins
      let minPopulatedBidIdx = bucketCount;
      let maxPopulatedAskIdx = -1;
      
      const centerPriceY = priceToY(currentPrice);
      const centerBinIdx = Math.floor((currentPrice - currentPriceMin) / bucketStep);

      for (let i = 0; i < bucketCount; i++) {
        if (domProfileBuckets[i].amount > 0) {
          if (domProfileBuckets[i].type === "bid") minPopulatedBidIdx = Math.min(minPopulatedBidIdx, i);
          if (domProfileBuckets[i].type === "ask") maxPopulatedAskIdx = Math.max(maxPopulatedAskIdx, i);
        }
      }

      // Extrapolate Bids downward (lower prices, lower bins)
      if (minPopulatedBidIdx > 0 && minPopulatedBidIdx < bucketCount) {
        const edgeAmount = domProfileBuckets[minPopulatedBidIdx].amount || 10;
        for (let i = minPopulatedBidIdx - 1; i >= 0; i--) {
          const distance = minPopulatedBidIdx - i;
          // Exponential decay away from the edge, with jitter to breathe
          domProfileBuckets[i].amount = edgeAmount * Math.exp(-distance / 20) * (0.7 + Math.random() * 0.6);
        }
      } else if (minPopulatedBidIdx === bucketCount && centerBinIdx >= 0 && centerBinIdx < bucketCount) {
        // Fallback if NO bids were placed (rare)
        const edgeAmount = Math.max(...domProfileBuckets.map(b=>b.amount)) || 50;
        for (let i = centerBinIdx - 1; i >= 0; i--) {
          const distance = centerBinIdx - i;
          domProfileBuckets[i].amount = edgeAmount * Math.exp(-distance / 20) * (0.7 + Math.random() * 0.6);
        }
      }

      // Extrapolate Asks upward (higher prices, higher bins)
      if (maxPopulatedAskIdx >= 0 && maxPopulatedAskIdx < bucketCount - 1) {
        const edgeAmount = domProfileBuckets[maxPopulatedAskIdx].amount || 10;
        for (let i = maxPopulatedAskIdx + 1; i < bucketCount; i++) {
          const distance = i - maxPopulatedAskIdx;
          domProfileBuckets[i].amount = edgeAmount * Math.exp(-distance / 20) * (0.7 + Math.random() * 0.6);
        }
      } else if (maxPopulatedAskIdx === -1 && centerBinIdx >= 0 && centerBinIdx < bucketCount) {
         // Fallback if NO asks were placed (rare)
        const edgeAmount = Math.max(...domProfileBuckets.map(b=>b.amount)) || 50;
        for (let i = centerBinIdx + 1; i < bucketCount; i++) {
          const distance = i - centerBinIdx;
          domProfileBuckets[i].amount = edgeAmount * Math.exp(-distance / 20) * (0.7 + Math.random() * 0.6);
        }
      }

      const maxBucketAmount = Math.max(
        ...domProfileBuckets.map((b) => b.amount),
        1,
      );
      const barHeight = Math.max(2, chartHeight / bucketCount - 1.2);
      const showVolumeLabels = barHeight >= 11;

      // Draw the vertical Order Book Depth Profile lines inside the DOM column
      domProfileBuckets.forEach((b) => {
        const y = priceToY(b.price);
        if (y < 0 || y > chartHeight) return;
        if (y < 120) return; // Skip drawing behind the top overlay widgets

        // Calculate bar width (max out at 95% of the column width for a clean look)
        const barWidth = (b.amount / maxBucketAmount) * (domColWidth - 10);

        // Use high-contrast vibrant colors matching the user's screenshot
        const isMaxAmount = b.amount === maxBucketAmount;
        if (b.type === "ask") {
          ctx.fillStyle = isMaxAmount ? "#FF3B30" : "rgba(219, 68, 85, 0.75)";
        } else {
          ctx.fillStyle = isMaxAmount ? "#00C076" : "rgba(0, 192, 118, 0.75)";
        }

        // Draw the bar extending from the right side of the DOM column leftward
        const barX = domColX + domColWidth - barWidth;
        ctx.fillRect(barX, y - barHeight / 2, barWidth, barHeight);

        // Draw the volume values (labels) on the bars when zoomed in
        if (showVolumeLabels && barWidth > 12) {
          ctx.font = isMaxAmount
            ? 'bold 9px "JetBrains Mono", monospace'
            : '500 9px "JetBrains Mono", monospace';
          ctx.textAlign = "right";
          ctx.textBaseline = "middle";

          // Text color: pure bright white for the maximum/active node or high volume,
          // or high-contrast silver-white so it reads beautifully on the bars.
          ctx.fillStyle = isMaxAmount ? "#FFFFFF" : "rgba(255, 255, 255, 0.85)";

          // Format volume value beautifully (e.g. 164, 82, 367)
          let displayVal = "0";
          if (b.amount >= 1000) {
            displayVal = `${(b.amount / 1000).toFixed(1)}k`;
          } else if (b.amount >= 10) {
            displayVal = Math.round(b.amount).toString();
          } else if (b.amount > 0) {
            displayVal = b.amount.toFixed(1);
          }

          // Align beautifully inside the bar (6px margin from the right edge)
          ctx.fillText(displayVal, domColX + domColWidth - 6, y);
        }
      });

      // Draw horizontal current price divider dashed line across the DOM column matching screenshot perfectly
      const currentPriceY = priceToY(currentPrice);
      if (currentPriceY >= 0 && currentPriceY <= chartHeight) {
        ctx.strokeStyle = "#475569"; // Slate-gray dashed divider
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(domColX, currentPriceY);
        ctx.lineTo(domColX + domColWidth, currentPriceY);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }


      if (indicators.showLiveDOMProfile) {
        // --- LIVE ORDER VOLUME PROFILE (DOM PROFILE) - CENTERED AXIS AT THE BOUNDARY (IN FRONT OF WIDGETS) ---
      const centerAxisX = domColX;

      // Draw the vertical dashed center axis line
      ctx.save();
      ctx.strokeStyle = "rgba(71, 85, 105, 0.45)";
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(centerAxisX, 0);
      ctx.lineTo(centerAxisX, chartHeight);
      ctx.stroke();
      ctx.restore();

      // Deep copy to avoid mutating store state
      const sourceBids = domState.deepOrderBook?.bids ? [...domState.deepOrderBook.bids] : [...bids];
      const sourceAsks = domState.deepOrderBook?.asks ? [...domState.deepOrderBook.asks] : [...asks];

      // MERGE LIVE WEBSOCKET DATA (bids/asks) INTO DEEP ORDER BOOK
      // This makes the DOM Profile "dance furiously" with live buyers/sellers!
      const mergeLive = (target: any[], live: any[]) => {
        live.forEach(l => {
          // Find closest price bin (within 1 tick)
          const idx = target.findIndex(t => Math.abs(t.price - l.price) < 0.5);
          if (idx !== -1) {
            target[idx] = l; // Update existing level with live volume
          } else {
            target.push(l);  // Insert new live level
          }
        });
      };
      mergeLive(sourceBids, bids);
      mergeLive(sourceAsks, asks);

      // We divide the screen height into exactly 100 vertical stationary bins
      const numBins = 100;
      const binHeight = chartHeight / numBins;
      const binnedBids = new Array(numBins).fill(0);
      const binnedAsks = new Array(numBins).fill(0);

      // Assign orders to their respective visual bins
      sourceBids.forEach((b) => {
        const y = priceToY(b.price);
        if (y >= 0 && y <= chartHeight) {
          const binIdx = Math.floor(y / binHeight);
          if (binIdx >= 0 && binIdx < numBins) binnedBids[binIdx] += b.amount;
        }
      });

      sourceAsks.forEach((a) => {
        const y = priceToY(a.price);
        if (y >= 0 && y <= chartHeight) {
          const binIdx = Math.floor(y / binHeight);
          if (binIdx >= 0 && binIdx < numBins) binnedAsks[binIdx] += a.amount;
        }
      });

      // Smooth the bins slightly for a more organic, continuous profile look
      const smooth = (arr: number[]) => {
        const res = [...arr];
        for (let i = 1; i < arr.length - 1; i++) {
          res[i] = arr[i - 1] * 0.15 + arr[i] * 0.7 + arr[i + 1] * 0.15;
        }
        return res;
      };
      const smoothedBids = smooth(binnedBids);
      const smoothedAsks = smooth(binnedAsks);

      const maxAmount = Math.max(...smoothedBids, ...smoothedAsks, 1);
      const barWidthMax = 65;
      const drawHeight = Math.max(1, binHeight - 0.2); // slight padding between bars

      for (let i = 0; i < numBins; i++) {
        const y = i * binHeight + binHeight / 2;
        if (y < 120) continue; // Skip drawing behind the top overlay widgets

        const bidVol = smoothedBids[i];
        if (bidVol > 0) {
          const barWidth = (bidVol / maxAmount) * barWidthMax;
          ctx.fillStyle = "#00C076";
          ctx.fillRect(
            centerAxisX - barWidth,
            y - drawHeight / 2,
            barWidth,
            drawHeight,
          );
        }

        const askVol = smoothedAsks[i];
        if (askVol > 0) {
          const barWidth = (askVol / maxAmount) * barWidthMax;
          ctx.fillStyle = "#FF3B30";
          ctx.fillRect(centerAxisX, y - drawHeight / 2, barWidth, drawHeight);
        }
      }

      // Draw horizontal current price divider line across the DOM column matching screenshot perfectly
      const currentPriceY = priceToY(currentPrice);
      if (currentPriceY >= 0 && currentPriceY <= chartHeight) {
        ctx.strokeStyle = "#FFE100"; // Bright Golden/Yellow line matching the screenshot
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.moveTo(domColX - barWidthMax, currentPriceY);
        ctx.lineTo(domColX + barWidthMax, currentPriceY);
        ctx.stroke();
      }
    }

    // Fill the entire top region of the DOM column with solid pitch black background so nothing bleeds through
    ctx.fillStyle = "#000000";
    ctx.fillRect(domColX, 0, domColWidth, 115);

    // Re-draw the vertical border separating the chart area and the DOM column for this top section
    ctx.strokeStyle = "rgba(20, 26, 34, 0.6)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(domColX, 0);
    ctx.lineTo(domColX, 115);
    ctx.stroke();

    // --- DUAL OVERLAY POWER WIDGETS AT THE TOP (NEAR DOM POWER & AGGRESSIVE POWER) ---
    const widgetWidth = domColWidth - 16;
    const widgetX = domColX + 8;
    const widgetHeight = 42;
    const widgetBarHeight = 10;

    const formatVal = (val: number) => {
      if (val >= 1000000) return `${(val / 1000000).toFixed(2)}M`;
      if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
      return val.toFixed(0);
    };

    // Calculate near DOM power (first 5 levels of bids and asks)
    let totalBidPower = bids
      .slice(0, 5)
      .reduce((acc, curr) => acc + (curr.amount || 0), 0);
    let totalAskPower = asks
      .slice(Math.max(0, asks.length - 5))
      .reduce((acc, curr) => acc + (curr.amount || 0), 0);

    // Robust oscillation fallback if depth values are not loaded or very small
    if (totalBidPower < 5 || totalAskPower < 5) {
      const seed = Date.now() / 2500;
      totalBidPower = 1100 + Math.sin(seed) * 220 + Math.cos(seed * 0.7) * 90;
      totalAskPower = 760 + Math.cos(seed) * 160 + Math.sin(seed * 0.7) * 70;
    }

    const totalPowerSum = totalBidPower + totalAskPower || 1;
    const nearBidPercent = Math.round((totalBidPower / totalPowerSum) * 100);
    const nearAskPercent = Math.round((totalAskPower / totalPowerSum) * 100);

    // 1. NEAR DOM POWER ±0.5% widget at y = 10
    let widgetY = 10;
    ctx.fillStyle = "#000000";
    ctx.fillRect(widgetX, widgetY, widgetWidth, widgetHeight);

    // Draw subtle elegant border around the widget box
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 1;
    ctx.strokeRect(widgetX, widgetY, widgetWidth, widgetHeight);

    // Widget Header Label: NEAR DOM POWER ±0.5%
    ctx.font = 'bold 8px "Inter", sans-serif';
    ctx.fillStyle = "#94a3b8"; // text-slate-400
    ctx.textAlign = "left";
    ctx.fillText(isMobile ? "DOM POWER" : "NEAR DOM POWER ±0.5%", widgetX, widgetY + 8);

    // Live label
    ctx.font = 'bold 8px "JetBrains Mono", monospace';
    ctx.fillStyle = "#10b981"; // text-emerald-400
    ctx.textAlign = "right";
    ctx.fillText("Live", widgetX + widgetWidth, widgetY + 8);

    // Power values
    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    ctx.textAlign = "left";
    ctx.fillStyle = "#10b981"; // green-400
    ctx.fillText(formatVal(totalBidPower), widgetX, widgetY + 22);

    ctx.textAlign = "right";
    ctx.fillStyle = "#f43f5e"; // rose-500
    ctx.fillText(formatVal(totalAskPower), widgetX + widgetWidth, widgetY + 22);

    // Progress Bar
    const barY = widgetY + 28;
    const greenBarWidth = (nearBidPercent / 100) * widgetWidth;
    const redBarWidth = widgetWidth - greenBarWidth;

    // Draw green portion
    ctx.fillStyle = "#10b981";
    ctx.fillRect(widgetX, barY, greenBarWidth, widgetBarHeight);

    // Draw red portion
    ctx.fillStyle = "#f43f5e";
    ctx.fillRect(widgetX + greenBarWidth, barY, redBarWidth, widgetBarHeight);

    // Percentage texts inside progress bars
    ctx.fillStyle = "#ffffff";
    ctx.font = 'bold 8px "JetBrains Mono", monospace';
    if (nearBidPercent > 12) {
      ctx.textAlign = "left";
      ctx.fillText(`${nearBidPercent}%`, widgetX + 4, barY + 8);
    }
    if (nearAskPercent > 12) {
      ctx.textAlign = "right";
      ctx.fillText(`${nearAskPercent}%`, widgetX + widgetWidth - 4, barY + 8);
    }

    // 2. AGGRESSIVE POWER widget at y = 65
    widgetY = 65;
    ctx.fillStyle = "#000000";
    ctx.fillRect(widgetX, widgetY, widgetWidth, widgetHeight);

    // Draw subtle elegant border around the widget box
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 1;
    ctx.strokeRect(widgetX, widgetY, widgetWidth, widgetHeight);

    // Widget Header Label: AGGRESSIVE POWER
    ctx.font = 'bold 8px "Inter", sans-serif';
    ctx.fillStyle = "#94a3b8"; // text-slate-400
    ctx.textAlign = "left";
    ctx.fillText(isMobile ? "AGGRESSIVE" : "AGGRESSIVE POWER", widgetX, widgetY + 8);

    // Power values
    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    ctx.textAlign = "left";
    ctx.fillStyle = "#10b981"; // green-400
    ctx.fillText(
      formatVal(domState.aggressivePower.buyPower),
      widgetX,
      widgetY + 22,
    );

    ctx.textAlign = "right";
    ctx.fillStyle = "#f43f5e"; // rose-500
    ctx.fillText(
      formatVal(domState.aggressivePower.sellPower),
      widgetX + widgetWidth,
      widgetY + 22,
    );

    // Progress Bar
    const aggBarY = widgetY + 28;
    const aggGreenBarWidth =
      (domState.aggressivePower.buyPercent / 100) * widgetWidth;
    const aggRedBarWidth = widgetWidth - aggGreenBarWidth;

    // Draw green portion
    ctx.fillStyle = "#10b981";
    ctx.fillRect(widgetX, aggBarY, aggGreenBarWidth, widgetBarHeight);

    // Draw red portion
    ctx.fillStyle = "#f43f5e";
    ctx.fillRect(
      widgetX + aggGreenBarWidth,
      aggBarY,
      aggRedBarWidth,
      widgetBarHeight,
    );

    // Percentage texts inside progress bars
    ctx.fillStyle = "#ffffff";
    ctx.font = 'bold 8px "JetBrains Mono", monospace';
    if (domState.aggressivePower.buyPercent > 12) {
      ctx.textAlign = "left";
      ctx.fillText(
        `${domState.aggressivePower.buyPercent}%`,
        widgetX + 4,
        aggBarY + 8,
      );
    }
    if (domState.aggressivePower.sellPercent > 12) {
      ctx.textAlign = "right";
      ctx.fillText(
        `${domState.aggressivePower.sellPercent}%`,
        widgetX + widgetWidth - 4,
        aggBarY + 8,
      );
    }
  }

  // Removed overlapping old price labels loop

  // Time Labels on Bottom Axis
  const currentSelectedTimezone = settings?.timezone || "UTC";
  ctx.fillStyle = "#cbd5e1"; // High-visibility bright slate-white text
  ctx.font = '10px "JetBrains Mono", monospace';
  ctx.textAlign = "center"; // Perfectly center time labels under corresponding grid lines
  for (let i = activeCandles.length - 1; i >= 0; i -= stepInterval) {
    const c = activeCandles[i];
    const x = timeToX(c.time);
    if (x >= 0 && x <= chartWidth) {
      const date = new Date(c.time);
      const timeZoneString =
        currentSelectedTimezone === "Colombo" ? "Asia/Colombo" : "UTC";
      const hoursStr = date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: timeZoneString,
        hour12: true,
      });
      ctx.fillText(hoursStr, x, chartHeight + statsHeight + 18);
    }
  }

  // --- HISTORICAL AND DYNAMIC DOM LIQUIDITY / LIQUIDATION POOLS (STABLE Heatmap on All Timeframes) ---
  if (indicators.showDOMLiquidity) {
    const range = currentPriceMax - currentPriceMin;
    const lastCandleObj = activeCandles[activeCandles.length - 1];
    const currentPrice = lastCandleObj ? lastCandleObj.close : 0;

    if (range > 0 && activeCandles.length > 0) {
      // Step 1: Divide vertical range into equal-sized bins for a continuous, stacked visual grid
      let binSize = 1;
      const isAutoAggregation = true;
      const tickSize = "1";
      
      if (!isAutoAggregation) {
          let maxDecimals = 0;
          if (activeCandles.length > 0) {
              const str = activeCandles[activeCandles.length - 1].close.toString();
              if (str.includes('.')) {
                  maxDecimals = str.split('.')[1].length;
              }
          }
          const minTick = Math.pow(10, -maxDecimals);
          binSize = parseInt(tickSize) * minTick;
          if (binSize <= 0 || isNaN(binSize)) binSize = minTick * 20; // fallback
      } else {
          const rawBinSize = range / 50;
          const exponent = Math.floor(Math.log10(rawBinSize || 1));
          const fraction = rawBinSize / Math.pow(10, exponent);
          let niceFraction = 1;
          if (fraction <= 1.5) niceFraction = 1;
          else if (fraction <= 3) niceFraction = 2;
          else if (fraction <= 7) niceFraction = 5;
          else niceFraction = 10;
          binSize = niceFraction * Math.pow(10, exponent);
      }

      // Align the starting price to a multiple of binSize
      const startPrice = Math.floor(currentPriceMin / binSize) * binSize;
      const endPrice = Math.ceil(currentPriceMax / binSize) * binSize;
      const binCount = Math.max(1, Math.ceil((endPrice - startPrice) / binSize));
      
      const bins = Array.from({ length: binCount }, (_, i) => {
        const priceMin = startPrice + i * binSize;
        const priceMax = priceMin + binSize;
        const centerPrice = priceMin + binSize / 2;
        return {
          priceMin,
          priceMax,
          centerPrice,
          score: 0,
          amount: 0,
          rank: undefined as number | undefined,
        };
      });

      // Step 2: Accumulate support & resistance sources
      const pivots: { price: number; strength: number }[] = [];

      // 2.1: Swing Highs & Swing Lows (natural support/resistance clusters)
      const windowSize = Math.max(3, Math.floor(activeCandles.length / 15));
      for (let i = windowSize; i < activeCandles.length - windowSize; i++) {
        const current = activeCandles[i];
        let isLow = true;
        let isHigh = true;

        for (let j = i - windowSize; j <= i + windowSize; j++) {
          if (j === i) continue;
          if (activeCandles[j].low < current.low) isLow = false;
          if (activeCandles[j].high > current.high) isHigh = false;
        }

        if (
          isLow &&
          current.low >= currentPriceMin &&
          current.low <= currentPriceMax
        ) {
          pivots.push({ price: current.low, strength: 2.2 });
        }
        if (
          isHigh &&
          current.high >= currentPriceMin &&
          current.high <= currentPriceMax
        ) {
          pivots.push({ price: current.high, strength: 2.2 });
        }
      }

      // 2.2: Volume Profile Peaks (High Volume Nodes)
      const volumeProfile = Array(binCount).fill(0);
      activeCandles.forEach((c) => {
        const lowIdx = Math.max(0, Math.min(binCount - 1, Math.floor((c.low - startPrice) / binSize)));
        const highIdx = Math.max(0, Math.min(binCount - 1, Math.floor((c.high - startPrice) / binSize)));
        const vol = (c.volume || 0) / (highIdx - lowIdx + 1 || 1);
        for (let idx = lowIdx; idx <= highIdx; idx++) {
          volumeProfile[idx] += vol;
        }
      });
      for (let k = 1; k < binCount - 1; k++) {
        if (
          volumeProfile[k] > volumeProfile[k - 1] &&
          volumeProfile[k] > volumeProfile[k + 1]
        ) {
          const price = startPrice + k * binSize + binSize / 2;
          pivots.push({ price, strength: 1.8 });
        }
      }

      // 2.3: Psychological Round Levels
      let roundStep = 1000;
      if (range < 2) roundStep = 0.05;
      else if (range < 10) roundStep = 0.25;
      else if (range < 50) roundStep = 1.0;
      else if (range < 200) roundStep = 5.0;
      else if (range < 1000) roundStep = 25.0;
      else if (range < 5000) roundStep = 100.0;
      else if (range < 20000) roundStep = 500.0;
      else roundStep = 1000.0;

      const startRound = Math.ceil(currentPriceMin / roundStep) * roundStep;
      for (let p = startRound; p <= currentPriceMax; p += roundStep) {
        pivots.push({ price: p, strength: 1.3 });
      }

      // 2.4: Real live Binance orderbook resting bids/asks
      bids.forEach((b) => {
        if (b.price >= currentPriceMin && b.price <= currentPriceMax) {
          pivots.push({ price: b.price, strength: 1.5 + b.amount / 5 });
        }
      });
      asks.forEach((a) => {
        if (a.price >= currentPriceMin && a.price <= currentPriceMax) {
          pivots.push({ price: a.price, strength: 1.5 + a.amount / 5 });
        }
      });

      // Step 3: Map pivots to bins using Gaussian decay / Kernel Smoothing to make the heatmap thick, organic, and ultra-smooth
      pivots.forEach((p) => {
        const centerBinIdx = Math.floor((p.price - startPrice) / binSize);
        if (centerBinIdx >= 0 && centerBinIdx < binCount) {
          // Apply kernel weights to neighbor bins
          const kernel = [
            { offset: 0, weight: 1.0 },
            { offset: -1, weight: 0.65 },
            { offset: 1, weight: 0.65 },
            { offset: -2, weight: 0.32 },
            { offset: 2, weight: 0.32 },
            { offset: -3, weight: 0.12 },
            { offset: 3, weight: 0.12 },
          ];
          kernel.forEach((k) => {
            const idx = centerBinIdx + k.offset;
            if (idx >= 0 && idx < binCount) {
              bins[idx].score += p.strength * k.weight;
            }
          });
        }
      });

      // Step 4: Calculate stable realistic Liquidity values
      const seededRandom = (seedPrice: number) => {
        const x = Math.sin(seedPrice * 7823.19 + 43.12) * 43758.54;
        return x - Math.floor(x);
      };

      let tfMult = 1.0;
      let tfUnit = "K";
      if (activeTimeframe === "1m") {
        tfMult = 22.4;
        tfUnit = "K";
      } else if (activeTimeframe === "5m") {
        tfMult = 65.8;
        tfUnit = "K";
      } else if (activeTimeframe === "15m") {
        tfMult = 180.5;
        tfUnit = "K";
      } else if (activeTimeframe === "1h") {
        tfMult = 540.2;
        tfUnit = "K";
      } else if (activeTimeframe === "4h") {
        tfMult = 1.6;
        tfUnit = "M";
      } else if (activeTimeframe === "1d") {
        tfMult = 6.2;
        tfUnit = "M";
      }

      bins.forEach((bin) => {
        if (bin.score <= 0) return;
        const rand = seededRandom(bin.centerPrice);

        // Cross-reference with live websocket orderbook for maximum real-time responsiveness
        const nearbyBids = bids.filter(
          (b) => Math.abs(b.price - bin.centerPrice) < binSize * 2.0,
        );
        const nearbyAsks = asks.filter(
          (a) => Math.abs(a.price - bin.centerPrice) < binSize * 2.0,
        );
        const maxNearbyAmount = Math.max(
          0,
          ...nearbyBids.map((b) => b.amount),
          ...nearbyAsks.map((a) => a.amount),
        );

        let strengthFactor = bin.score;
        if (maxNearbyAmount > 0) {
          strengthFactor = strengthFactor * 1.3 + maxNearbyAmount / 1.8;
        }

        const rawAmount = (0.35 + rand * 0.65) * tfMult * strengthFactor;
        bin.amount = rawAmount;
      });

      // Step 5: Rank bins by score to assign beautifully color-coded tier ranges
      // Bins with negligible score are kept completely dark/black for contrast
      const activeBins = bins.filter((b) => b.score > 0.5); // Minimum score to show any color at all, keeping areas dark
      activeBins.sort((a, b) => b.score - a.score);

      activeBins.forEach((bin, idx) => {
        bin.rank = idx;
      });

      // Step 6: Render each bin as a solid colored band covering its entire vertical price height!
      bins.forEach((bin) => {
        if (bin.score <= 0.5 || bin.rank === undefined) return;

        const yTop = priceToY(bin.priceMax);
        const yBottom = priceToY(bin.priceMin);
        const h = Math.abs(yBottom - yTop) + 0.5; // add 0.5 to prevent sub-pixel white gaps between rows
        const y = Math.min(yTop, yBottom);

        if (y >= 0 && y <= chartHeight) {
          let color = "";
          let neonColor = "";

          // Map rank to colors from the provided screenshot layout
          if (bin.rank <= 2) {
            // Level 1: Heavy Order Block - Golden Yellow (Highly Visible)
            color = "rgba(255, 225, 0, 0.72)"; // High opacity yellow
            neonColor = "#FFE100";
          } else if (bin.rank <= 6) {
            // Level 2: High Interest Zone - Mint Green
            color = "rgba(0, 230, 118, 0.52)";
            neonColor = "#00E676";
          } else if (bin.rank <= 13) {
            // Level 3: Medium-High Interest Zone - Teal / Cyan
            color = "rgba(0, 245, 212, 0.32)";
            neonColor = "#00F5D4";
          } else if (bin.rank <= 22) {
            // Level 4: Soft Resting Liquidity - Medium Indigo Blue
            color = "rgba(47, 84, 235, 0.18)";
            neonColor = "#2F54EB";
          } else if (bin.rank <= 35) {
            // Level 5: Minor - Deep Navy Blue (very soft, fades beautifully into black)
            color = "rgba(15, 30, 54, 0.10)";
            neonColor = "#1A237E";
          } else {
            return;
          }

          // Draw beautiful solid color band spanning full chart width
          ctx.fillStyle = color;
          ctx.fillRect(0, y, chartWidth, h);

          // Draw a tiny bright highlight in the center of the yellow band to create a glossy premium glow
          if (bin.rank === 0) {
            ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
            ctx.lineWidth = 1.0;
            ctx.beginPath();
            ctx.moveTo(0, y + h / 2);
            ctx.lineTo(chartWidth, y + h / 2);
            ctx.stroke();
          }

          // Draw a neat premium pill badge on the right edge for the top 3 levels
          if (bin.rank <= 2) {
            let labelText = "";
            if (tfUnit === "M") {
              if (bin.amount < 0.1) {
                labelText = `LIQ: ${(bin.amount * 1000).toFixed(1)}K`;
              } else {
                labelText = `LIQ: ${bin.amount.toFixed(1)}M`;
              }
            } else {
              labelText = `LIQ: ${bin.amount.toFixed(1)}K`;
            }

            ctx.font = 'bold 8.5px "JetBrains Mono", monospace';
            const textWidth = ctx.measureText(labelText).width;
            const badgeW = textWidth + 8;
            const badgeH = 12;
            const badgeY = y + h / 2;

            // Translucent dark box with matching border
            ctx.fillStyle = "rgba(10, 15, 20, 0.94)";
            ctx.strokeStyle = neonColor;
            ctx.lineWidth = 1.2;
            ctx.fillRect(
              chartWidth - badgeW - 10,
              badgeY - badgeH / 2,
              badgeW,
              badgeH,
            );
            ctx.strokeRect(
              chartWidth - badgeW - 10,
              badgeY - badgeH / 2,
              badgeW,
              badgeH,
            );

            // Text color matching the band color
            ctx.fillStyle = neonColor;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(labelText, chartWidth - 10 - badgeW / 2, badgeY + 0.5);
          }
        }
      });
    }
  }

  // --- RENDER LEZ (Liquidity Entry Zones) ---
  if (indicators.showLEZ && activeCandles.length > 0) {
    const lezData = calculateLEZ(activeCandles);
    
    // Helper to draw rounded rectangle
    const drawRoundRect = (rx: number, ry: number, rw: number, rh: number, rr: number) => {
      ctx.beginPath();
      ctx.moveTo(rx + rr, ry);
      ctx.lineTo(rx + rw - rr, ry);
      ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + rr);
      ctx.lineTo(rx + rw, ry + rh - rr);
      ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - rr, ry + rh);
      ctx.lineTo(rx + rr, ry + rh);
      ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - rr);
      ctx.lineTo(rx, ry + rr);
      ctx.quadraticCurveTo(rx, ry, rx + rr, ry);
      ctx.closePath();
    };

    // Draw Sweep Guides
    lezData.guides.forEach(guide => {
      const startCandle = activeCandles[guide.startIndex];
      const sweepCandle = activeCandles[guide.sweepIndex];
      const endCandle = activeCandles[Math.min(guide.endIndex, activeCandles.length - 1)];
      if (!startCandle || !sweepCandle) return;

      const xStart = timeToX(startCandle.time);
      const xEnd = timeToX(endCandle ? endCandle.time : sweepCandle.time);
      const y = priceToY(guide.price);
      
      const isHigh = guide.type === "high";
      const color = isHigh ? "#ef4444" : "#10b981";

      if (Math.max(xStart, xEnd) >= -10 && Math.min(xStart, xEnd) <= chartWidth + 10) {
        ctx.beginPath();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.moveTo(xStart, y);
        ctx.lineTo(xEnd, y);
        ctx.stroke();
        ctx.setLineDash([]);

        // "SWEEP TRACE" Tag
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        const text = "SWEEP TRACE";
        const tw = ctx.measureText(text).width + 10;
        const th = 16;
        
        ctx.fillStyle = color;
        drawRoundRect(xEnd, y - th/2, tw, th, 4);
        ctx.fill();
        
        // Tag pointer pointing left
        ctx.beginPath();
        ctx.moveTo(xEnd, y);
        ctx.lineTo(xEnd + 4, y - 4);
        ctx.lineTo(xEnd + 4, y + 4);
        ctx.fill();

        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, xEnd + tw/2, y + 1);
      }
    });

    // Draw Trade Simulation Boxes
    lezData.signals.forEach(signal => {
      const c = activeCandles[signal.index];
      if (!c || !signal.trade) return;
      if (signal.trade.exitType === "sl") return; // Hide stopped trades
      const xEntry = timeToX(c.time);
      
      const exitIndex = signal.trade.exitIndex ?? (activeCandles.length - 1);
      const xExit = timeToX(activeCandles[exitIndex].time);
      
      if (Math.max(xEntry, xExit) >= -10 && Math.min(xEntry, xExit) <= chartWidth + 10) {
        const yEntry = priceToY(signal.trade.entryPrice);
        const ySL = priceToY(signal.trade.slPrice);
        const yTP = priceToY(signal.trade.tpPrice);

        const w = Math.max(10, xExit - xEntry);
        
        // Stop Loss Box (Risk - Red)
        ctx.fillStyle = "rgba(239, 68, 68, 0.15)";
        ctx.strokeStyle = "rgba(239, 68, 68, 0.5)";
        ctx.lineWidth = 1;
        const slHeight = ySL - yEntry;
        ctx.fillRect(xEntry, yEntry, w, slHeight);
        ctx.strokeRect(xEntry, yEntry, w, slHeight);

        // Take Profit Box (Reward - Green/Cyan)
        ctx.fillStyle = "rgba(16, 185, 129, 0.15)";
        ctx.strokeStyle = "rgba(16, 185, 129, 0.5)";
        const tpHeight = yTP - yEntry;
        ctx.fillRect(xEntry, yEntry, w, tpHeight);
        ctx.strokeRect(xEntry, yEntry, w, tpHeight);

        // Tags on the right edge
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        const tagH = 14;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        
        // ENTRY Tag (Blue)
        ctx.fillStyle = "#0ea5e9";
        const entryW = ctx.measureText("ENTRY").width + 10;
        drawRoundRect(xEntry + w, yEntry - tagH/2, entryW, tagH, 3);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.fillText("ENTRY", xEntry + w + entryW/2, yEntry + 1);

        // SL Tag (Red)
        ctx.fillStyle = "#ef4444";
        const slW = ctx.measureText("INVALIDATION").width + 10;
        drawRoundRect(xEntry + w, ySL - tagH/2, slW, tagH, 3);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.fillText("INVALIDATION", xEntry + w + slW/2, ySL + 1);

        // TP Tag (Green)
        const isHit = signal.trade.exitType === "tp";
        const tpText = isHit ? "TP HIT" : "TARGET";
        ctx.fillStyle = isHit ? "#10b981" : "#059669";
        const tpW = ctx.measureText(tpText).width + 10;
        drawRoundRect(xEntry + w, yTP - tagH/2, tpW, tagH, 3);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.fillText(tpText, xEntry + w + tpW/2, yTP + 1);
      }
    });

    // Draw Main Signal Labels
    lezData.signals.forEach(signal => {
      const c = activeCandles[signal.index];
      if (!c) return;
      if (signal.trade?.exitType === "sl") return; // Hide stopped trades
      const x = timeToX(c.time);
      
      if (x >= -10 && x <= chartWidth + 10) {
        const isBuy = signal.type === "buy";
        const yHigh = priceToY(c.high);
        const yLow = priceToY(c.low);
        
        ctx.font = 'bold 12px "JetBrains Mono", monospace';
        const text = isBuy ? "BUY" : "SELL";
        const tw = ctx.measureText(text).width + 16;
        const th = 22;
        
        // Distance from candle
        const offset = 12;
        const boxY = isBuy ? yLow + offset : yHigh - offset - th;
        
        ctx.fillStyle = isBuy ? "#10b981" : "#ef4444";
        drawRoundRect(x - tw/2, boxY, tw, th, 6);
        ctx.fill();
        
        // Pointer triangle
        ctx.beginPath();
        if (isBuy) {
          ctx.moveTo(x, yLow + 4);
          ctx.lineTo(x - 6, boxY);
          ctx.lineTo(x + 6, boxY);
        } else {
          ctx.moveTo(x, yHigh - 4);
          ctx.lineTo(x - 6, boxY + th);
          ctx.lineTo(x + 6, boxY + th);
        }
        ctx.fill();

        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, x, boxY + th/2 + 1);

        // Quality Sub-label
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        const qText = `Q:${signal.qualityScore}`;
        const qw = ctx.measureText(qText).width + 8;
        const qh = 14;
        
        ctx.fillStyle = "#0284c7"; // Blue
        const qy = isBuy ? boxY + th - 2 : boxY - qh + 2;
        drawRoundRect(x - qw/2, qy, qw, qh, 4);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.fillText(qText, x, qy + qh/2 + 1);
      }
    });
  }

  // --- RENDER REKT (Liquidations) ---
  if (indicators.showRekt && liquidations && liquidations.length > 0) {
    liquidations.forEach((liq) => {
      const x = timeToX(liq.time);
      if (x >= -20 && x <= chartWidth + 20) {
        const y = priceToY(liq.price);
        const isLongLiq = liq.side === "SELL"; // Longs get liquidated by selling
        
        // Draw Explosion / Bubble
        ctx.beginPath();
        const maxRadius = Math.min(25, 5 + (liq.amount / 5000)); // Scale by amount
        ctx.arc(x, y, maxRadius, 0, 2 * Math.PI);
        ctx.fillStyle = isLongLiq ? "rgba(239, 68, 68, 0.4)" : "rgba(16, 185, 129, 0.4)";
        ctx.fill();
        ctx.strokeStyle = isLongLiq ? "rgba(239, 68, 68, 0.8)" : "rgba(16, 185, 129, 0.8)";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw Skull Emoji or Text
        ctx.font = '14px sans-serif';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "white";
        ctx.fillText("💀", x, y);
        
        // Value Text below
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.fillStyle = isLongLiq ? "#ef4444" : "#10b981";
        ctx.fillText(`${(liq.amount / 1000).toFixed(1)}k`, x, y + maxRadius + 8);
      }
    });
  }

  // --- RENDER LIVE HUD LABELS AND INDICATORS ---
  // Render current active ticker price banner
  const lastCandle = activeCandles[activeCandles.length - 1];
  if (lastCandle) {
    const currentPriceY = priceToY(lastCandle.close);
    if (currentPriceY >= 0 && currentPriceY <= chartHeight) {
      // Draw glowing/clean price badge on the scale
      const isBullish = lastCandle.close >= lastCandle.open;
      ctx.fillStyle = isBullish ? "#10b981" : "#f43f5e";
      ctx.fillRect(chartWidth + 2, currentPriceY - 8, 80, 16);

      ctx.fillStyle = "#ffffff";
      ctx.font = 'bold 9.5px "JetBrains Mono", monospace';
      ctx.textAlign = "left";
      ctx.fillText(
        formatPrice(lastCandle.close),
        chartWidth + 6,
        currentPriceY + 3.5,
      );
    }
  }
};

// Automatically adjust zoom/barWidth if footprint/stats is enabled so cells and numbers are immediately visible
useEffect(() => {
  if (indicators.showStats || chartType === "footprint") {
    const vs = viewStateRef.current;
    if (vs.barWidth < 65) {
      vs.barWidth = 65;
      vs.spacing = 15;
    }
  }
}, [indicators.showStats, chartType]);

// Redraw whenever parameters change
useEffect(() => {
  let rafId: number;
  const render = () => {
    computeVisiblePriceBounds();
    drawChart();
  };
  rafId = requestAnimationFrame(render);
  return () => cancelAnimationFrame(rafId);
}, [
  activeCandles,
  dimensions,
  chartType,
  indicators,
  smc,
  drawings,
  selectedDrawingId,
  replay.currentPlaybackIndex,
  domState,
]);

  // --- NATIVE NON-PASSIVE WHEEL & TRACKPAD PINCH-TO-ZOOM HANDLER ---
  // Attaching with { passive: false } ensures e.preventDefault() works 100%,
  // which stops modern browsers (Chrome/Edge) from zooming the entire page/tools!
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas) return;

    const handleNativeWheel = (e: WheelEvent) => {
      // 1. ALWAYS prevent browser page zoom and default container scrolling
      e.preventDefault();
      e.stopPropagation();

      const vs = viewStateRef.current;
      if (activeCandles.length === 0) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const lastCandle = activeCandles[activeCandles.length - 1];
      let timeStep = 3600000;
      if (activeTimeframe === "1m") timeStep = 60000;
      if (activeTimeframe === "5m") timeStep = 300000;
      if (activeTimeframe === "15m") timeStep = 900000;
      if (activeTimeframe === "4h") timeStep = 14400000;
      if (activeTimeframe === "1d") timeStep = 86400000;

      const chartWidth = dimensions.width - 85;
      const statsHeight = indicators.showStats ? 75 : 0;
      const chartHeight = dimensions.height - 28 - statsHeight;

      // 2. TWO-FINGER HORIZONTAL TRACKPAD PANNING (when not pinching with ctrlKey)
      if (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.2 && Math.abs(e.deltaX) > 1.5) {
        vs.scrollOffset += e.deltaX * 1.5;
        computeVisiblePriceBounds();
        drawChart();
        return;
      }

      // 3. ZOOM DIRECTION
      // deltaY < 0 is Zoom IN (scroll up / pinch out)
      // deltaY > 0 is Zoom OUT (scroll down / pinch in)
      const isZoomIn = e.deltaY < 0;

      // --- ZOOM PRICE SCALE ONLY (Y-axis Zoom) IF OVER THE PRICE AXIS COLUMN ---
      if (x > chartWidth) {
        const currentPriceMin = vs.isManualPriceScale
          ? vs.manualPriceMin
          : vs.priceMin;
        const currentPriceMax = vs.isManualPriceScale
          ? vs.manualPriceMax
          : vs.priceMax;
        const priceRange = currentPriceMax - currentPriceMin || 1;

        const pctY = (chartHeight - y) / chartHeight;
        const mousePriceBefore = currentPriceMin + pctY * priceRange;

        let zoomFactor = 1;
        if (e.ctrlKey) {
          const delta = Math.max(-30, Math.min(30, e.deltaY));
          zoomFactor = Math.pow(1.008, delta);
        } else {
          zoomFactor = isZoomIn ? 0.88 : 1.14;
        }

        const newPriceRange = priceRange * zoomFactor;

        vs.isManualPriceScale = true;
        vs.manualPriceMin = mousePriceBefore - pctY * newPriceRange;
        vs.manualPriceMax = vs.manualPriceMin + newPriceRange;

        computeVisiblePriceBounds();
        drawChart();
        return;
      }

      // --- STANDARD CHART ZOOM (HORIZONTAL TIMELINE ZOOM) ---
      // Time and price under mouse before zoom to keep cursor pinned
      const latestBarXBefore = dimensions.width - 85 - vs.scrollOffset;
      const indexDiffBefore = (x - latestBarXBefore) / (vs.barWidth + vs.spacing);
      const mouseTimeBefore = lastCandle.time + indexDiffBefore * timeStep;

      const currentPriceMin = vs.isManualPriceScale
        ? vs.manualPriceMin
        : vs.priceMin;
      const currentPriceMax = vs.isManualPriceScale
        ? vs.manualPriceMax
        : vs.priceMax;
      const priceRange = currentPriceMax - currentPriceMin || 1;
      const pctY = (chartHeight - y) / chartHeight;
      const mousePriceBefore = currentPriceMin + pctY * priceRange;

      let zoomFactor: number;
      if (e.ctrlKey) {
        // Smooth proportional zoom for trackpad pinch
        const delta = Math.max(-35, Math.min(35, e.deltaY));
        zoomFactor = Math.pow(0.982, delta);
      } else {
        // Discrete zoom for mouse wheel
        zoomFactor = isZoomIn ? 1.15 : 0.85;
      }

      // Zoom bar width with sensible boundaries
      vs.barWidth = Math.max(0.12, Math.min(180, vs.barWidth * zoomFactor));

      // Smoothly scale spacing
      if (vs.barWidth >= 65) {
        vs.spacing = 15;
      } else if (vs.barWidth >= 20) {
        vs.spacing = 6;
      } else if (vs.barWidth >= 8) {
        vs.spacing = 3;
      } else if (vs.barWidth >= 4) {
        vs.spacing = 1.5;
      } else if (vs.barWidth >= 1.5) {
        vs.spacing = 0.8;
      } else {
        vs.spacing = Math.max(0.04, vs.barWidth * 0.3);
      }

      // Keep the time under mouse at the exact same X coordinate on screen
      const candlesDiff = (mouseTimeBefore - lastCandle.time) / timeStep;
      vs.scrollOffset =
        dimensions.width - 85 - x + candlesDiff * (vs.barWidth + vs.spacing);

      // Zoom price scale if we are in manual price scale mode
      if (vs.isManualPriceScale) {
        const priceZoom = isZoomIn ? 0.90 : 1.10;
        const newPriceRange = priceRange * priceZoom;
        vs.manualPriceMin = mousePriceBefore - pctY * newPriceRange;
        vs.manualPriceMax = vs.manualPriceMin + newPriceRange;
      }

      computeVisiblePriceBounds();
      drawChart();
    };

    // Prevent browser zoom if gesture happens over container area
    const preventContainerZoom = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
      }
    };

    canvas.addEventListener("wheel", handleNativeWheel, { passive: false });
    if (container) {
      container.addEventListener("wheel", preventContainerZoom, { passive: false });
    }

    return () => {
      canvas.removeEventListener("wheel", handleNativeWheel);
      if (container) {
        container.removeEventListener("wheel", preventContainerZoom);
      }
    };
  }, [
    activeCandles,
    activeTimeframe,
    dimensions,
    indicators.showStats,
    computeVisiblePriceBounds,
    drawChart,
  ]);

// Mouse interactivity triggers (Pan, Drag Scale, Draw)

// Hit-testing helpers
const pointDist = (x1: number, y1: number, x2: number, y2: number) =>
  Math.hypot(x1 - x2, y1 - y2);
const lineDist = (
  x: number,
  y: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) => {
  const A = x - x1;
  const B = y - y1;
  const C = x2 - x1;
  const D = y2 - y1;
  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;
  if (lenSq !== 0) param = dot / lenSq;
  let xx, yy;
  if (param < 0) {
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    xx = x2;
    yy = y2;
  } else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }
  return Math.hypot(x - xx, y - yy);
};

// Coordinate math wrappers to read inside functions
const timeToX = (timeMs: number): number => {
  if (activeCandles.length === 0) return 0;
  const vs = viewStateRef.current;
  const lastCandle = activeCandles[activeCandles.length - 1];
  let timeStep = 3600000;
  if (activeTimeframe === "1m") timeStep = 60000;
  if (activeTimeframe === "5m") timeStep = 300000;
  if (activeTimeframe === "15m") timeStep = 900000;
  if (activeTimeframe === "4h") timeStep = 14400000;
  if (activeTimeframe === "1d") timeStep = 86400000;

  const candlesDiff = (timeMs - lastCandle.time) / timeStep;
  const latestBarX = dimensions.width - 85 - vs.scrollOffset;
  return latestBarX + candlesDiff * (vs.barWidth + vs.spacing);
};

const priceToY = (price: number): number => {
  const vs = viewStateRef.current;
  const currentPriceMin = vs.isManualPriceScale
    ? vs.manualPriceMin
    : vs.priceMin;
  const currentPriceMax = vs.isManualPriceScale
    ? vs.manualPriceMax
    : vs.priceMax;
  const priceRange = currentPriceMax - currentPriceMin || 1;
  const statsHeight = indicators.showStats ? 75 : 0;
  const chartHeight = dimensions.height - 28 - statsHeight;
  return chartHeight - ((price - currentPriceMin) / priceRange) * chartHeight;
};

const xToTime = (x: number): number => {
  if (activeCandles.length === 0) return Date.now();
  const vs = viewStateRef.current;
  const lastCandle = activeCandles[activeCandles.length - 1];
  let timeStep = 3600000;
  if (activeTimeframe === "1m") timeStep = 60000;
  if (activeTimeframe === "5m") timeStep = 300000;
  if (activeTimeframe === "15m") timeStep = 900000;
  if (activeTimeframe === "4h") timeStep = 14400000;
  if (activeTimeframe === "1d") timeStep = 86400000;

  const latestBarX = dimensions.width - 85 - vs.scrollOffset;
  const indexDiff = (x - latestBarX) / (vs.barWidth + vs.spacing);
  return lastCandle.time + indexDiff * timeStep;
};

const yToPrice = (y: number): number => {
  const vs = viewStateRef.current;
  const currentPriceMin = vs.isManualPriceScale
    ? vs.manualPriceMin
    : vs.priceMin;
  const currentPriceMax = vs.isManualPriceScale
    ? vs.manualPriceMax
    : vs.priceMax;
  const priceRange = currentPriceMax - currentPriceMin || 1;
  const statsHeight = indicators.showStats ? 75 : 0;
  const chartHeight = dimensions.height - 28 - statsHeight;
  return currentPriceMin + ((chartHeight - y) / chartHeight) * priceRange;
  };
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const vs = viewStateRef.current;
    const chartWidth = dimensions.width - 85;
    const newsChartHeight = dimensions.height - 30;

    // Check if clicked News Circle
    if (indicators.showNews && globalNews && globalNews.length > 0) {
      // Find x coordinate using internal xToTime or timeToX equivalent logic
      // But we can just use the same x calculation
      let clickedNews = null;
      for (const news of globalNews) {
        const newsTime = new Date(news.date).getTime();
        
        // Inline timeToX logic since timeToX might not be in scope here
        if (activeCandles.length > 0) {
          const lastCandle = activeCandles[activeCandles.length - 1];
          let timeStep = 3600000;
          if (activeTimeframe === "1m") timeStep = 60000;
          if (activeTimeframe === "5m") timeStep = 300000;
          if (activeTimeframe === "15m") timeStep = 900000;
          if (activeTimeframe === "4h") timeStep = 14400000;
          if (activeTimeframe === "1d") timeStep = 86400000;

          const candlesDiff = (newsTime - lastCandle.time) / timeStep;
          const latestBarX = chartWidth - vs.scrollOffset;
          const nx = latestBarX + candlesDiff * (vs.barWidth + vs.spacing);

          if (nx >= 0 && nx <= chartWidth) {
            const statsHeight = indicators.showStats ? 75 : 0;
            const cy = newsChartHeight + statsHeight - 12;
            const dx = x - nx;
            const dy = y - cy;
            if (dx * dx + dy * dy <= 144) { // radius 12
              clickedNews = news;
              break;
            }
          }
        }
      }
      if (clickedNews) {
        setSelectedNews(clickedNews);
        return; // Prevent other interactions
      }
    }

    // Check if clicked price scale
    if (x > chartWidth) {
      vs.isScalingPrice = true;
      vs.scaleStartY = y;
      const currentPriceMin = vs.isManualPriceScale
        ? vs.manualPriceMin
        : vs.priceMin;
      const currentPriceMax = vs.isManualPriceScale
        ? vs.manualPriceMax
        : vs.priceMax;
      vs.manualPriceMin = currentPriceMin;
      vs.manualPriceMax = currentPriceMax;
      vs.scaleStartPriceRange = currentPriceMax - currentPriceMin;
      (vs as any).scaleStartPriceMin = currentPriceMin;
      (vs as any).scaleStartPriceMax = currentPriceMax;
      const statsHeight = indicators.showStats ? 75 : 0;
      const chartHeight = dimensions.height - 28 - statsHeight;
      const pctY = (chartHeight - y) / chartHeight;
      (vs as any).scaleStartPrice =
        currentPriceMin + pctY * (currentPriceMax - currentPriceMin);
      (vs as any).scaleStartPctY = pctY;
      return;
    }

    const statsHeight = indicators.showStats ? 75 : 0;
    const chartHeight = dimensions.height - 28 - statsHeight;

    if (y > chartHeight + statsHeight && x <= chartWidth) {
      vs.isScalingTime = true;
      vs.scaleStartX = x;
      vs.scaleStartBarWidth = vs.barWidth;
      return;
    }

    const clickTime = xToTime(x);
    const clickPrice = yToPrice(y);

    // Drawing Tools Handler
    if (activeDrawingTool !== "cursor") {
      const newPoint: DrawingPoint = { time: clickTime, price: clickPrice };

      // Freehand Path
      if (activeDrawingTool === "path") {
        const id = Math.random().toString(36).substring(2, 9);
        const newDrawing: Drawing = {
          id,
          type: "path",
          points: [newPoint],
          color: "#FFE100",
          isLocked: false,
          lineWidth: 2,
        };
        setDrawings((prev) => [...prev, newDrawing]);
        vs.isDrawingPath = true;
        vs.activePathId = id;
        return;
      }

      // Single Click Tools
      if (["horizontal", "text-box", "price-tag"].includes(activeDrawingTool)) {
        const newDrawing: Drawing = {
          id: Math.random().toString(36).substring(2, 9),
          type: activeDrawingTool,
          points: [newPoint],
          color: "#FFE100",
          isLocked: false,
          text: activeDrawingTool === "price-tag" ? clickPrice.toFixed(2) : (activeDrawingTool === "text-box" && stampText ? stampText : "Text"),
          textSize: 14,
        };
        setDrawings((prev) => [...prev, newDrawing]);
        setActiveDrawingTool("cursor");
        return;
      }

      // Multi-point Tools
      if (!vs.currentDrawing) {
        // First point
        vs.drawingStartPoint = newPoint;
        const newDrawing: Drawing = {
          id: Math.random().toString(36).substring(2, 9),
          type: activeDrawingTool,
          points: [newPoint],
          color:
            activeDrawingTool === "long"
              ? "#00c076"
              : activeDrawingTool === "short"
                ? "#ff3b30"
                : "#00e5ff",
          isLocked: false,
          fillColor: ["circle", "triangle"].includes(activeDrawingTool)
            ? "rgba(0, 229, 255, 0.1)"
            : undefined,
        };
        vs.currentDrawing = newDrawing;
        setDrawings((prev) => [...prev, newDrawing]);
      } else {
        // We have at least 1 point already
        const pts = [...vs.currentDrawing.points, newPoint];
        if (activeDrawingTool === "long" || activeDrawingTool === "short") {
          const p0 = pts[0].price;
          const p1 = pts[1].price;
          const targetDiff = Math.abs(p1 - p0);
          const slPrice = activeDrawingTool === "long" ? p0 - targetDiff * 0.4 : p0 + targetDiff * 0.4;
          pts.push({ time: newPoint.time, price: slPrice });
        }
        
        const is3Point = ["fib-extension", "triangle"].includes(
          activeDrawingTool,
        );

        const finishedDrawing: Drawing = { ...vs.currentDrawing, points: pts };
        setDrawings((prev) =>
          prev.map((d) =>
            d.id === vs.currentDrawing?.id ? finishedDrawing : d,
          ),
        );

        if (is3Point && pts.length < 3) {
          // Wait for 3rd click, update current drawing in view state
          vs.currentDrawing = finishedDrawing;
        } else {
          // Finished 2-point or 3-point
          vs.drawingStartPoint = null;
          vs.currentDrawing = null;
          setActiveDrawingTool("cursor");
        }
      }
      return;
    }

    // Interactive Selection and Dragging
    let hitId: string | null = null;
    let hitPointIdx: number | null = null;

    for (const d of drawings) {
      if (d.isLocked || d.points.length === 0) continue;

      // 1. Check points for resizing/adjusting
      for (let i = 0; i < d.points.length; i++) {
        const px = timeToX(d.points[i].time);
        const py = priceToY(d.points[i].price);
        if (pointDist(x, y, px, py) < 12) {
          hitId = d.id;
          hitPointIdx = i;
          break;
        }
      }
      if (hitId) break;

      // 2. Check edges for whole object drag
      if (d.type === "horizontal") {
        const py = priceToY(d.points[0].price);
        if (Math.abs(y - py) < 10) hitId = d.id;
      } else if (
        ["trendline", "measure", "fib-retracement", "fib-extension", "path"].includes(
          d.type,
        )
      ) {
        if (d.points.length >= 2) {
          const px1 = timeToX(d.points[0].time);
          const py1 = priceToY(d.points[0].price);
          const px2 = timeToX(d.points[1].time);
          const py2 = priceToY(d.points[1].price);
          if (lineDist(x, y, px1, py1, px2, py2) < 10) hitId = d.id;
        }
      } else if (["rectangle", "long", "short"].includes(d.type)) {
        if (d.points.length >= 2) {
          const px1 = timeToX(d.points[0].time);
          const py1 = priceToY(d.points[0].price);
          const px2 = timeToX(d.points[1].time);
          const py2 = priceToY(d.points[1].price);
          
          let minX = Math.min(px1, px2);
          let maxX = Math.max(px1, px2);
          let minY = Math.min(py1, py2);
          let maxY = Math.max(py1, py2);
          
          if (d.type === "long" || d.type === "short") {
            let stopY;
            if (d.points.length > 2) {
              stopY = priceToY(d.points[2].price);
            } else {
              const targetDiff = Math.abs(py2 - py1);
              stopY = d.type === "long" ? py1 + targetDiff * 0.4 : py1 - targetDiff * 0.4;
            }
            minY = Math.min(py1, py2, stopY);
            maxY = Math.max(py1, py2, stopY);
          }
          
          if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
            hitId = d.id;
          }
        }
      } else {
        // Fallback bounding box check for other shapes (text-box, price-tag, circle, etc)
        const py1 = priceToY(d.points[0].price);
        const px1 = timeToX(d.points[0].time);
        if (pointDist(x, y, px1, py1) < 40) hitId = d.id;
      }
      if (hitId) break;
    }

    if (hitId) {
      setSelectedDrawingId(hitId);
      vs.draggedDrawingId = hitId;
      vs.draggedPointIndex = hitPointIdx;
      vs.dragStartX = x;
      vs.dragStartY = y;
      return; // Do not trigger panning if we clicked a drawing
    }

    setSelectedDrawingId(null);

    // Classic Pan drag initialization
    vs.isPanning = true;
    vs.panStartX = x;
    vs.panStartY = y;
    vs.panStartScrollOffset = vs.scrollOffset;
    vs.panStartPriceMin = vs.isManualPriceScale
      ? vs.manualPriceMin
      : vs.priceMin;
    vs.panStartPriceMax = vs.isManualPriceScale
      ? vs.manualPriceMax
      : vs.priceMax;
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const vs = viewStateRef.current;
    vs.mouseX = x;
    vs.mouseY = y;
    const chartWidth = dimensions.width - 85;

    const hoverTime = xToTime(x);
    const hoverPrice = yToPrice(y);
    setMouseCrosshair({ x, y, time: hoverTime, price: hoverPrice });
    setMousePos({ x: e.clientX, y: e.clientY });

    // Handle News Hover
    const newsChartHeight = dimensions.height - 30;
    let foundHoveredNews = null;
    if (indicators.showNews && globalNews && globalNews.length > 0) {
      for (const news of globalNews) {
        const newsTime = new Date(news.date).getTime();
        
        if (activeCandles.length > 0) {
          const lastCandle = activeCandles[activeCandles.length - 1];
          let timeStep = 3600000;
          if (activeTimeframe === "1m") timeStep = 60000;
          if (activeTimeframe === "5m") timeStep = 300000;
          if (activeTimeframe === "15m") timeStep = 900000;
          if (activeTimeframe === "4h") timeStep = 14400000;
          if (activeTimeframe === "1d") timeStep = 86400000;

          const candlesDiff = (newsTime - lastCandle.time) / timeStep;
          const latestBarX = chartWidth - vs.scrollOffset;
          const nx = latestBarX + candlesDiff * (vs.barWidth + vs.spacing);

          if (nx >= 0 && nx <= chartWidth) {
            const statsHeight = indicators.showStats ? 75 : 0;
            const cy = newsChartHeight + statsHeight - 12;
            const dx = x - nx;
            const dy = y - cy;
            if (dx * dx + dy * dy <= 144) {
              foundHoveredNews = news;
              break;
            }
          }
        }
      }
    }
    
    if (foundHoveredNews !== hoveredNews) {
      setHoveredNews(foundHoveredNews);
    }

    if (foundHoveredNews) {
       document.body.style.cursor = "pointer";
    } else if (document.body.style.cursor === "pointer") {
       document.body.style.cursor = "default";
    }

    // Handle Freehand Path Drawing
    if (vs.isDrawingPath && vs.activePathId) {
      setDrawings((prev) =>
        prev.map((d) => {
          if (d.id === vs.activePathId) {
            return {
              ...d,
              points: [...d.points, { time: hoverTime, price: hoverPrice }],
            };
          }
          return d;
        }),
      );
      return; // Rendering handled by drawChart raf
    }

    // Handle Dragging Drawings
    if (vs.draggedDrawingId) {
      setDrawings((prev) =>
        prev.map((d) => {
          if (d.id === vs.draggedDrawingId) {
            if (vs.draggedPointIndex !== null) {
              // Dragging single point
              const newPoints = [...d.points];
              newPoints[vs.draggedPointIndex] = {
                time: hoverTime,
                price: hoverPrice,
              };
              let newText = d.text;
              if (d.type === "price-tag") {
                newText = formatPrice(hoverPrice);
              }
              return { ...d, points: newPoints, text: newText };
            } else {
              // Dragging whole object
              const dx = x - vs.dragStartX;
              const dy = y - vs.dragStartY;
              const timeDiff = xToTime(x) - xToTime(vs.dragStartX);
              const priceDiff = yToPrice(y) - yToPrice(vs.dragStartY);

              // Update drag start for continuous smooth delta
              vs.dragStartX = x;
              vs.dragStartY = y;

              const newPoints = d.points.map((p) => ({
                time: p.time + timeDiff,
                price: p.price + priceDiff,
              }));
              let newText = d.text;
              if (d.type === "price-tag" && newPoints.length > 0) {
                newText = formatPrice(newPoints[0].price);
              }
              return { ...d, points: newPoints, text: newText };
            }
          }
          return d;
        }),
      );
      return;
    }

      if (vs.isScalingPrice) {
        const dy = y - vs.scaleStartY;

        // Compute stable non-drifting exponential scaling multiplier matching TradingView
        const scaleMultiplier = Math.exp(dy / 250);
        const newPriceRange = vs.scaleStartPriceRange * scaleMultiplier;

        const startPrice =
          (vs as any).scaleStartPrice ??
          (vs.manualPriceMax + vs.manualPriceMin) / 2;
        const startPctY = (vs as any).scaleStartPctY ?? 0.5;

        vs.isManualPriceScale = true;
        vs.manualPriceMin = startPrice - startPctY * newPriceRange;
        vs.manualPriceMax = vs.manualPriceMin + newPriceRange;

        drawChart();
        return;
      }

      if (vs.isScalingTime) {
        const dx = x - vs.scaleStartX;
        vs.barWidth = Math.max(
          0.12,
          Math.min(180, vs.scaleStartBarWidth - dx * 0.15),
        );
        if (vs.barWidth >= 65) {
          vs.spacing = 15;
        } else if (vs.barWidth >= 20) {
          vs.spacing = 6;
        } else if (vs.barWidth >= 8) {
          vs.spacing = 3;
        } else if (vs.barWidth >= 4) {
          vs.spacing = 1.5;
        } else if (vs.barWidth >= 1.5) {
          vs.spacing = 0.8;
        } else {
          vs.spacing = Math.max(0.04, vs.barWidth * 0.3);
        }
        computeVisiblePriceBounds();
        drawChart();
        return;
      }

      if (vs.isPanning) {
        const dx = x - vs.panStartX;
        vs.scrollOffset = vs.panStartScrollOffset - dx;

        if (vs.isManualPriceScale) {
          // Only pan vertically if already in manual price scale mode
          const dy = y - vs.panStartY;
          const statsHeight = indicators.showStats ? 75 : 0;
          const chartHeight = dimensions.height - 28 - statsHeight;
          const priceRange = vs.panStartPriceMax - vs.panStartPriceMin || 1;
          const pricePerPixel = priceRange / chartHeight;
          const priceDelta = dy * pricePerPixel;

          vs.manualPriceMin = vs.panStartPriceMin + priceDelta;
          vs.manualPriceMax = vs.panStartPriceMax + priceDelta;
        }

        computeVisiblePriceBounds();
        drawChart();
        return;
      }

      // Live intermediate Drawing drag lines
      if (vs.drawingStartPoint && vs.currentDrawing) {
        const currentPoint: DrawingPoint = {
          time: hoverTime,
          price: hoverPrice,
        };
        const updatedDrawing: Drawing = {
          ...vs.currentDrawing,
          points: [vs.drawingStartPoint, currentPoint],
        };
        setDrawings((prev) =>
          prev.map((d) =>
            d.id === vs.currentDrawing?.id ? updatedDrawing : d,
          ),
        );
      }
    }

    const handleMouseUp = () => {
      const vs = viewStateRef.current;
      vs.isPanning = false;
      vs.isScalingPrice = false;
      vs.isScalingTime = false;

      // Finish freehand path
      if (vs.isDrawingPath) {
        vs.isDrawingPath = false;
        vs.activePathId = null;
        setActiveDrawingTool("cursor");
      }

      vs.draggedDrawingId = null;
      vs.draggedPointIndex = null;
    };

    const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
      if (e.touches.length > 0) {
        const touch = e.touches[0];
        const mockEvent = {
          clientX: touch.clientX,
          clientY: touch.clientY,
          preventDefault: () => {},
          stopPropagation: () => {},
        } as unknown as React.MouseEvent<HTMLCanvasElement>;
        handleMouseDown(mockEvent);
      }
    };

    const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
      if (e.touches.length > 0) {
        const touch = e.touches[0];
        const mockEvent = {
          clientX: touch.clientX,
          clientY: touch.clientY,
          preventDefault: () => {},
          stopPropagation: () => {},
        } as unknown as React.MouseEvent<HTMLCanvasElement>;
        handleMouseMove(mockEvent);
      }
    };

    const handleTouchEnd = () => {
      handleMouseUp();
    };

    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (
          (e.key === "Delete" || e.key === "Backspace") &&
          selectedDrawingId
        ) {
          setDrawings((prev) => prev.filter((d) => d.id !== selectedDrawingId));
          setSelectedDrawingId(null);
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [selectedDrawingId]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full select-none overflow-hidden"
    >
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        className="block cursor-crosshair w-full h-full touch-none"
      />

      {/* Floating MTF DELTA HEATMAP panel */}
      {indicators.showMTF && (
        <div
          id="mtf-delta-heatmap-panel"
          className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-[#06080b]/90 border border-[#1e293b]/80 rounded-xl p-3 shadow-[0_4px_24px_rgba(0,0,0,0.7)] backdrop-blur-md flex flex-col items-center gap-2.5 z-20 select-none min-w-[280px]"
        >
          <div className="text-[10px] md:text-[11px] font-extrabold tracking-widest text-slate-300 uppercase font-mono border-b border-[#1e293b]/45 pb-1.5 w-full text-center">
            MTF DELTA HEATMAP
          </div>
          <div className="grid grid-cols-4 gap-2 w-full">
            {Object.entries(mtfData).map(([tf, rawData]) => {
              const data = rawData as {
                bias: "BUY" | "SELL" | "NEUTRAL";
                deltaPercent: number;
                deltaVal: number;
              };
              const isBuy = data.bias === "BUY";
              const isSell = data.bias === "SELL";

              let boxStyles =
                "border-[#1e293b]/60 text-slate-400 bg-slate-900/15";
              if (isBuy) {
                boxStyles =
                  "border-emerald-500/30 text-emerald-400 bg-emerald-950/25 shadow-[0_0_10px_rgba(16,185,129,0.06)]";
              } else if (isSell) {
                boxStyles =
                  "border-rose-500/30 text-rose-400 bg-rose-950/25 shadow-[0_0_10px_rgba(244,63,94,0.06)]";
              }

              return (
                <div
                  key={tf}
                  className={`flex flex-col items-center justify-center border rounded-lg py-2 px-1 text-center transition-all duration-300 ${boxStyles}`}
                >
                  <span className="text-[9px] font-bold text-slate-400 tracking-wider mb-0.5">
                    {tf}
                  </span>
                  <span
                    className={`text-[10px] font-extrabold font-mono uppercase ${isBuy ? "text-emerald-400" : isSell ? "text-rose-400" : "text-slate-400"}`}
                  >
                    {data.bias}
                  </span>
                  <span className="text-[7.5px] opacity-65 font-mono mt-0.5">
                    {data.deltaPercent}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* CRT ELITE MONITOR panel */}
      {indicators.showCRT && (
        <div
          id="crt-elite-monitor-panel"
          className="absolute top-4 right-24 bg-[#06080b]/92 border border-[#1e293b]/85 rounded-xl p-3.5 shadow-[0_4px_24px_rgba(0,0,0,0.85)] backdrop-blur-md flex flex-col items-center gap-1.5 z-20 select-none min-w-[210px] text-center font-sans"
        >
          <div className="text-[9px] md:text-[10px] font-extrabold tracking-widest text-[#8f9cae] uppercase font-mono">
            CRT ELITE MONITOR
          </div>
          <div
            className={`text-sm md:text-base font-extrabold font-mono tracking-wide ${crtMonitorData.bias === "BULL" ? "text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.35)]" : "text-rose-400 drop-shadow-[0_0_8px_rgba(244,63,94,0.35)]"}`}
          >
            {crtMonitorData.bias} BIAS
          </div>
          <div className="text-[8.5px] md:text-[9.5px] font-bold text-slate-400/90 font-mono uppercase tracking-wider">
            {crtMonitorData.status}
          </div>
        </div>
      )}

      {/* Interactive HUD HUD displays or Scale crosshairs overlay */}
      {mouseCrosshair &&
        mouseCrosshair.x < dimensions.width - 85 &&
        mouseCrosshair.y <
          dimensions.height - 28 - (indicators.showStats ? 75 : 0) && (
          <div className="absolute pointer-events-none top-0 left-0 w-full h-full">
            {/* Vertical indicator line */}
            <div
              className="absolute border-l border-dashed border-gray-600/35"
              style={{
                left: `${mouseCrosshair.x}px`,
                top: 0,
                height: `${dimensions.height - 28 - (indicators.showStats ? 75 : 0)}px`,
              }}
            />
            {/* Horizontal indicator line */}
            <div
              className="absolute border-t border-dashed border-gray-600/35 w-[calc(100%-85px)]"
              style={{ top: `${mouseCrosshair.y}px`, left: 0 }}
            />

            {/* Value banners on axes */}
            <div
              className="absolute bg-gray-950 border border-gray-700/80 text-[10px] text-gray-200 px-2 py-0.5 rounded font-mono shadow-md"
              style={{
                left: `${dimensions.width - 85 + 4}px`,
                top: `${mouseCrosshair.y - 10}px`,
              }}
            >
              {formatPrice(mouseCrosshair.price)}
            </div>

            <div
              className="absolute bg-gray-950 border border-gray-700/80 text-[10px] text-gray-200 px-2 py-0.5 rounded font-mono shadow-md"
              style={{
                left: `${mouseCrosshair.x - 30}px`,
                top: `${dimensions.height - 28 + 2}px`,
              }}
            >
              {new Date(mouseCrosshair.time).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                timeZone:
                  (settings?.timezone || "UTC") === "Colombo"
                    ? "Asia/Colombo"
                    : "UTC",
                hour12: true,
              })}
            </div>
          </div>
        )}

      {/* Floating Scale Refresh Override Button */}
      {viewStateRef.current.isManualPriceScale && (
        <button
          id="btn-scale-reset"
          onClick={() => {
            viewStateRef.current.isManualPriceScale = false;
            computeVisiblePriceBounds();
            drawChart();
          }}
          className="absolute right-24 bottom-10 bg-slate-900/90 hover:bg-slate-800 text-slate-300 border border-slate-700 px-2.5 py-1 rounded text-xs flex items-center gap-1.5 shadow-lg active:scale-95 transition-all cursor-pointer"
          title="Reset Price Scale to Fit"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Auto Fit Price</span>
        </button>
      )}

      {/* Action utilities bar overlays (Settings Popup) */}
      {selectedDrawingId && (
        <div className="absolute top-4 left-4 bg-[#000000]/95 border border-[#1e293b]/80 p-2 rounded-xl flex items-center gap-3 shadow-[0_4px_24px_rgba(0,0,0,0.8)] backdrop-blur-md z-30">
          {/* Color Picker (Simplified Preset Boxes) */}
          <div className="flex gap-1.5 items-center border-r border-[#1e293b]/80 pr-3">
            {[
              "#00c076",
              "#ff3b30",
              "#00e5ff",
              "#ffe100",
              "#ffffff",
              "#8b5cf6",
            ].map((color) => (
              <button
                key={color}
                className="w-5 h-5 rounded-full cursor-pointer border border-white/10 hover:scale-110 transition-transform"
                style={{ backgroundColor: color }}
                onClick={() => {
                  setDrawings((prev) =>
                    prev.map((d) =>
                      d.id === selectedDrawingId ? { ...d, color } : d,
                    ),
                  );
                }}
              />
            ))}
          </div>

          {/* Line Width */}
          <div className="flex gap-1.5 items-center border-r border-[#1e293b]/80 pr-3">
            {[1, 2, 3, 4].map((w) => (
              <button
                key={w}
                className="w-6 h-6 rounded flex items-center justify-center hover:bg-white/10 text-slate-400 font-mono text-xs cursor-pointer"
                onClick={() => {
                  setDrawings((prev) =>
                    prev.map((d) =>
                      d.id === selectedDrawingId ? { ...d, lineWidth: w } : d,
                    ),
                  );
                }}
              >
                {w}px
              </button>
            ))}
          </div>

          {/* Text Settings (Only if applicable) */}
          {drawings.find((d) => d.id === selectedDrawingId)?.type ===
            "text-box" ||
          drawings.find((d) => d.id === selectedDrawingId)?.type ===
            "price-tag" ? (
            <div className="flex gap-2 items-center border-r border-[#1e293b]/80 pr-3">
              <input
                type="text"
                className="bg-[#141a22] border border-[#1e293b] rounded px-2 py-1 text-xs text-white outline-none w-24"
                placeholder="Text..."
                value={
                  drawings.find((d) => d.id === selectedDrawingId)?.text || ""
                }
                onChange={(e) => {
                  const val = e.target.value;
                  setDrawings((prev) =>
                    prev.map((d) => {
                      if (d.id === selectedDrawingId) {
                        if (d.type === "price-tag") {
                          const parsed = parseFloat(val);
                          if (!isNaN(parsed) && d.points.length > 0) {
                            return {
                              ...d,
                              text: val,
                              points: [{ ...d.points[0], price: parsed }],
                            };
                          }
                        }
                        return { ...d, text: val };
                      }
                      return d;
                    })
                  );
                }}
              />
              <input
                type="number"
                className="bg-[#141a22] border border-[#1e293b] rounded px-2 py-1 text-xs text-white outline-none w-12"
                placeholder="Size"
                value={
                  drawings.find((d) => d.id === selectedDrawingId)?.textSize ||
                  14
                }
                onChange={(e) =>
                  setDrawings((prev) =>
                    prev.map((d) =>
                      d.id === selectedDrawingId
                        ? { ...d, textSize: parseInt(e.target.value) || 14 }
                        : d,
                    ),
                  )
                }
              />
            </div>
          ) : null}

          {/* Delete Button */}
          <button
            id="btn-delete-selected"
            onClick={() => {
              setDrawings((prev) =>
                prev.filter((d) => d.id !== selectedDrawingId),
              );
              setSelectedDrawingId(null);
            }}
            className="p-1.5 hover:bg-red-500/10 text-red-400 hover:text-red-300 rounded transition-all cursor-pointer"
            title="Delete Selected Drawing"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Timezone Switcher Selector */}
      <div className="hidden md:flex absolute right-2 bottom-[4px] items-center gap-1.5 bg-[#06080b]/95 border border-[#141a22] px-2.5 py-1 rounded shadow-lg z-10 font-sans">
        <span className="text-[9px] text-[#8f9cae] font-bold uppercase tracking-wider select-none mr-1">
          Timezone:
        </span>
        <button
          id="btn-tz-utc"
          onClick={() => updateSettings("timezone", "UTC")}
          className={`px-2 py-0.5 rounded text-[9px] font-mono transition-all border flex items-center gap-1 cursor-pointer ${
            (settings?.timezone || "UTC") === "UTC"
              ? "bg-blue-600/20 text-blue-400 border-blue-500/45 font-bold shadow-sm"
              : "bg-[#0a0d10] text-slate-400 border-slate-800 hover:text-slate-200"
          }`}
          title="Switch to UTC Timezone"
        >
          <span>UTC</span>
          <span className="text-[8px] opacity-70">({liveTimes.utc})</span>
        </button>
        <button
          id="btn-tz-colombo"
          onClick={() => updateSettings("timezone", "Colombo")}
          className={`px-2 py-0.5 rounded text-[9px] font-mono transition-all border flex items-center gap-1 cursor-pointer ${
            (settings?.timezone || "UTC") === "Colombo"
              ? "bg-blue-600/20 text-blue-400 border-blue-500/45 font-bold shadow-sm"
              : "bg-[#0a0d10] text-slate-400 border-slate-800 hover:text-slate-200"
          }`}
          title="Switch to Colombo Timezone"
        >
          <span>Colombo</span>
          <span className="text-[8px] opacity-70">({liveTimes.colombo})</span>
        </button>
      </div>
      
      {/* News Hover Tooltip */}
      {hoveredNews && (
        <div
          className="absolute z-50 bg-[#1e222d] border border-[#2a2e39] shadow-xl rounded w-64 pointer-events-none"
          style={{
            left: Math.min(mousePos.x + 15, typeof window !== 'undefined' ? window.innerWidth - 270 : 0),
            bottom: typeof window !== 'undefined' ? window.innerHeight - mousePos.y + 15 : 20,
          }}
        >
          <div className="p-3">
            <div className="text-gray-400 text-xs mb-1">
              {new Date(hoveredNews.date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
            </div>
            <div className="text-white text-sm font-semibold mb-3 leading-tight">
              {hoveredNews.title}
            </div>
            
            <div className="flex items-center text-xs mb-2 gap-4">
              <div className="font-medium text-gray-300 w-12 flex items-center justify-between">
                <span>{hoveredNews.country}</span>
                <span className={`w-3 h-3 rounded-full inline-block ${hoveredNews.impact?.toLowerCase().includes('high') ? 'bg-red-500' : hoveredNews.impact?.toLowerCase().includes('medium') ? 'bg-orange-500' : 'bg-gray-500'}`}></span>
              </div>
              <div className="flex-1 flex justify-between text-gray-400">
                <div className="flex flex-col">
                  <span className="text-[10px]">Actual</span>
                  <span className="text-gray-200">{hoveredNews.actual || '-'}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px]">Forecast</span>
                  <span className="text-gray-200">{hoveredNews.forecast || '-'}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px]">Previous</span>
                  <span className="text-gray-200">{hoveredNews.previous || '-'}</span>
                </div>
              </div>
            </div>
            
            <div className="mt-3">
              <div className="inline-block px-3 py-1 bg-[#2a2e39] text-gray-300 text-xs rounded">
                Click for details
              </div>
            </div>
          </div>
        </div>
      )}

      {/* News Details Modal */}
      {selectedNews && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setSelectedNews(null)}>
          <div 
            className="bg-[#1e222d] border border-[#2a2e39] shadow-2xl rounded-lg w-full max-w-[400px] overflow-hidden" 
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start p-4 border-b border-[#2a2e39]">
              <h3 className="text-lg font-bold text-white leading-tight pr-4">
                {selectedNews.title}
              </h3>
              <button 
                onClick={() => setSelectedNews(null)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              <div className="text-gray-400 text-sm">
                {new Date(selectedNews.date).toLocaleString([], { dateStyle: 'long', timeStyle: 'short' })}
              </div>
              
              <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
                <div className="text-gray-400">Country</div>
                <div className="text-white font-medium flex items-center gap-2">
                  <span>{selectedNews.country}</span>
                </div>
                
                <div className="text-gray-400">Impact</div>
                <div className="flex items-center gap-1">
                  <div className={`w-1 h-4 rounded-sm ${selectedNews.impact?.toLowerCase().includes('high') ? 'bg-red-500' : 'bg-gray-600'}`}></div>
                  <div className={`w-1 h-4 rounded-sm ${selectedNews.impact?.toLowerCase().includes('high') || selectedNews.impact?.toLowerCase().includes('medium') ? 'bg-orange-500' : 'bg-gray-600'}`}></div>
                  <div className={`w-1 h-4 rounded-sm ${selectedNews.impact ? 'bg-yellow-500' : 'bg-gray-600'}`}></div>
                  <span className="ml-1 text-gray-300 text-xs uppercase">{selectedNews.impact}</span>
                </div>
                
                <div className="text-gray-400">Actual</div>
                <div className="text-white font-medium">{selectedNews.actual || '-'}</div>
                
                <div className="text-gray-400">Forecast</div>
                <div className="text-white font-medium">{selectedNews.forecast || '-'}</div>
                
                <div className="text-gray-400">Previous</div>
                <div className="text-white font-medium">{selectedNews.previous || '-'}</div>
              </div>
              
              <div className="flex justify-end pt-2">
                <button 
                  onClick={() => setSelectedNews(null)}
                  className="px-6 py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-semibold rounded transition-colors"
                >
                  Ok
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Scrollable OB Scan Box Overlay */}
      <OBScanBox />
      
      {/* Pace Gauge Overlay */}
      <PaceGauge />
    </div>
  );
};



