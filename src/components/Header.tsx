/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { useTrading } from '../stores/useTradingStore';
import { ChartType } from '../types/chart';
import { Search, ChevronDown, Check, X } from 'lucide-react';
import { FAEngineModal } from './FAEngineModal';

const highlightMatch = (text: string, query: string) => {
  if (!query) return <span className="font-mono tracking-wider font-bold">{text}</span>;
  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (index === -1) return <span className="font-mono tracking-wider">{text}</span>;

  const before = text.substring(0, index);
  const match = text.substring(index, index + query.length);
  const after = text.substring(index + query.length);

  return (
    <span className="font-mono tracking-wider text-slate-300">
      {before}
      <span className="text-cyan-400 bg-cyan-500/10 font-black px-0.5 rounded-sm">{match}</span>
      {after}
    </span>
  );
};

export const Header: React.FC = () => {
  const {
    activeSymbol,
    setActiveSymbol,
    activeTimeframe,
    setActiveTimeframe,
    chartType,
    setChartType,
    isWsConnected,
    indicators,
    setIndicators,
    smc,
    setSMC,
    thresholds,
    updateThreshold,
    activeThresholdId,
    setActiveThresholdId,
    tickSize,
    setTickSize,
    aggregation,
    setAggregation,
    isAutoAggregation,
    setIsAutoAggregation,
    mobileTab,
    setMobileTab,
    settings,
    updateSettings,
    globalConfig
  } = useTrading();

  // Selected state for local active toggles
  const [activeToggles, setActiveToggles] = useState<Record<string, boolean>>(() => {
    const defaultToggles: Record<string, boolean> = {
      'A': true,
      'IMB': false,
      'STK': false,
      'RSI': false,
      'DELTA': false,
      'WHALE': true,
      'EMA': false,
      'LEZ': false,
      'VPT': !!indicators.showVPT,
      'DOM-LIQ': true,
      'DOM-PROF': true,
      'MMS': false,
      'NEWS': false,
      'LIQ-POOL': false,
      'ICEBERG': true,
      'PACE': false,
      'WICK-Δ': false,
      'REKT': true,
      'FVG': true,
      'VWBA': false,
      'TWB': false,
      'STATS': false,
      'SNR': true,
      'SK': false,
      'EW': false,
      'WYC': false,
      'CRT': false,
      'SESS': false,
      'VOL': true,
      'D-OPEN': true,
      'D-VOL': false,
      'N-POC': true,
      'ABS': false,
      'HV-BUY': false,
      'HV-SELL': false,
      'PIVOT': false,
      'SPOOF': false,
      'OI': true,
      'OIT': false,
      'OI-WALL': true,
      'LVN': false,
      'MTF': false,
      'FP SHAPE': false,
      'BBA-DELTA': false,
      '24H-BACK': false,
    };
    try {
      const saved = localStorage.getItem('active_toggles');
      let parsed = saved ? JSON.parse(saved) : null;
      const initialized = localStorage.getItem('toggles_initialized_v3');
      if (!initialized) {
        if (!parsed) parsed = {};
        parsed['DOM-PROF'] = true;
        parsed['DOM-LIQ'] = true;
        localStorage.setItem('active_toggles', JSON.stringify({ ...defaultToggles, ...parsed }));
        localStorage.setItem('toggles_initialized_v3', 'true');
      }
      return parsed ? { ...defaultToggles, ...parsed } : defaultToggles;
    } catch {
      return defaultToggles;
    }
  });



  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setFocusedIndex(0);
  }, [searchQuery, isSearchOpen]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) &&
        (listContainerRef.current ? !listContainerRef.current.contains(event.target as Node) : true)
      ) {
        setIsSearchOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (isSearchOpen && listRef.current && focusedIndex >= 0) {
      const container = listRef.current;
      const child = container.children[focusedIndex] as HTMLElement;
      if (child) {
        const containerTop = container.scrollTop;
        const containerBottom = containerTop + container.clientHeight;
        const elemTop = child.offsetTop;
        const elemBottom = elemTop + child.clientHeight;

        if (elemTop < containerTop) {
          container.scrollTop = elemTop;
        } else if (elemBottom > containerBottom) {
          container.scrollTop = elemBottom - container.clientHeight;
        }
      }
    }
  }, [focusedIndex, isSearchOpen]);

  const fallbackSymbols = ["BTCUSDT", "ETHUSDT", "BCHUSDT", "XRPUSDT", "LTCUSDT", "TRXUSDT", "ETCUSDT", "LINKUSDT", "XLMUSDT", "ADAUSDT", "XMRUSDT", "DASHUSDT", "ZECUSDT", "XTZUSDT", "BNBUSDT", "ATOMUSDT", "ONTUSDT", "IOTAUSDT", "BATUSDT", "VETUSDT", "NEOUSDT", "QTUMUSDT", "IOSTUSDT", "THETAUSDT", "ALGOUSDT", "ZILUSDT", "KNCUSDT", "ZRXUSDT", "COMPUSDT", "DOGEUSDT", "KAVAUSDT", "BANDUSDT", "RLCUSDT", "SNXUSDT", "DOTUSDT", "YFIUSDT", "CRVUSDT", "TRBUSDT", "RUNEUSDT", "SUSHIUSDT", "EGLDUSDT", "SOLUSDT", "ICXUSDT", "STORJUSDT", "UNIUSDT", "AVAXUSDT", "ENJUSDT", "KSMUSDT", "NEARUSDT", "AAVEUSDT", "FILUSDT", "RSRUSDT", "BELUSDT", "AXSUSDT", "ZENUSDT", "SKLUSDT", "GRTUSDT", "1INCHUSDT", "CHZUSDT", "SANDUSDT", "ANKRUSDT", "RVNUSDT", "SFPUSDT", "COTIUSDT", "CHRUSDT", "MANAUSDT", "ALICEUSDT", "HBARUSDT", "ONEUSDT", "CELRUSDT", "HOTUSDT", "MTLUSDT", "OGNUSDT", "1000SHIBUSDT", "GTCUSDT", "BTCDOMUSDT", "IOTXUSDT", "C98USDT", "MASKUSDT", "DYDXUSDT", "1000XECUSDT", "GALAUSDT", "CELOUSDT", "ARUSDT", "ARPAUSDT", "CTSIUSDT", "LPTUSDT", "ENSUSDT", "PEOPLEUSDT", "ROSEUSDT", "DUSKUSDT", "FLOWUSDT", "IMXUSDT", "API3USDT", "GMTUSDT", "APEUSDT", "WOOUSDT", "JASMYUSDT", "OPUSDT", "INJUSDT", "STGUSDT", "SPELLUSDT", "1000LUNCUSDT", "LUNA2USDT", "LDOUSDT", "ICPUSDT", "APTUSDT", "QNTUSDT", "FETUSDT", "MAGICUSDT", "TUSDT", "MINAUSDT", "ASTRUSDT", "GMXUSDT", "CFXUSDT", "STXUSDT", "ACHUSDT", "SSVUSDT", "CKBUSDT", "LQTYUSDT", "USDCUSDT", "IDUSDT", "ARBUSDT", "JOEUSDT", "TLMUSDT", "HFTUSDT", "XVSUSDT", "BLURUSDT", "EDUUSDT", "SUIUSDT", "1000PEPEUSDT", "1000FLOKIUSDT", "UMAUSDT", "NMRUSDT", "MAVUSDT", "XVGUSDT", "WLDUSDT", "PENDLEUSDT", "ARKMUSDT", "AGLDUSDT", "YGGUSDT", "DODOXUSDT", "BNTUSDT", "SEIUSDT", "CYBERUSDT", "ARKUSDT", "BICOUSDT", "BIGTIMEUSDT", "WAXPUSDT", "BSVUSDT", "RIFUSDT", "POLYXUSDT", "GASUSDT", "POWRUSDT", "TIAUSDT", "CAKEUSDT", "MEMEUSDT", "TWTUSDT", "ORDIUSDT", "STEEMUSDT", "ILVUSDT", "KASUSDT", "BEAMXUSDT", "1000BONKUSDT", "PYTHUSDT", "SUPERUSDT", "USTCUSDT", "ONGUSDT", "ETHWUSDT", "JTOUSDT", "1000SATSUSDT", "AUCTIONUSDT", "1000RATSUSDT", "ACEUSDT", "MOVRUSDT", "XAIUSDT", "WIFUSDT", "MANTAUSDT", "ONDOUSDT", "LSKUSDT", "ALTUSDT", "JUPUSDT", "ZETAUSDT", "RONINUSDT", "DYMUSDT", "PIXELUSDT", "STRKUSDT", "GLMUSDT", "PORTALUSDT", "AXLUSDT", "METISUSDT", "AEVOUSDT", "VANRYUSDT", "BOMEUSDT", "ETHFIUSDT", "ENAUSDT", "WUSDT", "TNSRUSDT", "SAGAUSDT", "TAOUSDT", "REZUSDT", "BBUSDT", "NOTUSDT", "TURBOUSDT", "IOUSDT", "ZKUSDT", "MEWUSDT", "LISTAUSDT", "ZROUSDT", "RENDERUSDT", "BANANAUSDT", "RAREUSDT", "GUSDT", "SYNUSDT", "BRETTUSDT", "POPCATUSDT", "SUNUSDT", "DOGSUSDT", "FLUXUSDT", "RPLUSDT", "POLUSDT", "1MBABYDOGEUSDT", "NEIROUSDT", "FIDAUSDT", "CATIUSDT", "HMSTRUSDT", "EIGENUSDT", "DIAUSDT", "1000CATUSDT", "SCRUSDT", "GOATUSDT", "MOODENGUSDT", "SAFEUSDT", "SANTOSUSDT", "COWUSDT", "CETUSUSDT", "1000000MOGUSDT", "GRASSUSDT", "DRIFTUSDT", "ACTUSDT", "PNUTUSDT", "BANUSDT", "AKTUSDT", "SCRTUSDT", "1000CHEEMSUSDT", "THEUSDT", "MORPHOUSDT", "CHILLGUYUSDT", "KAIAUSDT", "AEROUSDT", "ACXUSDT", "ORCAUSDT", "MOVEUSDT", "RAYSOLUSDT", "KOMAUSDT", "VIRTUALUSDT", "SPXUSDT", "MEUSDT", "AVAUSDT", "VELODROMEUSDT", "MOCAUSDT", "VANAUSDT", "PENGUUSDT", "LUMIAUSDT", "USUALUSDT", "AIXBTUSDT", "FARTCOINUSDT", "KMNOUSDT", "CGPTUSDT", "HIVEUSDT", "DEXEUSDT", "PHAUSDT", "GRIFFAINUSDT", "ZEREBROUSDT", "BIOUSDT", "COOKIEUSDT", "ALCHUSDT", "SWARMSUSDT", "SONICUSDT", "PROMUSDT", "SUSDT", "SOLVUSDT", "ARCUSDT", "AVAAIUSDT", "TRUMPUSDT", "MELANIAUSDT", "VTHOUSDT", "ANIMEUSDT", "PIPPINUSDT", "VVVUSDT", "BERAUSDT", "TSTUSDT", "LAYERUSDT", "HEIUSDT", "GPSUSDT", "SHELLUSDT", "KAITOUSDT", "REDUSDT", "VICUSDT", "EPICUSDT", "BMTUSDT", "MUBARAKUSDT", "FORMUSDT", "TUTUSDT", "BROCCOLI714USDT", "BROCCOLIF3BUSDT", "SIRENUSDT", "BANANAS31USDT", "BRUSDT", "PLUMEUSDT", "NILUSDT", "PARTIUSDT", "JELLYJELLYUSDT", "MAVIAUSDT", "PAXGUSDT", "WALUSDT", "GUNUSDT", "ATHUSDT", "BABYUSDT", "PROMPTUSDT", "STOUSDT", "FHEUSDT", "KERNELUSDT", "WCTUSDT", "INITUSDT", "AERGOUSDT", "BANKUSDT", "DEEPUSDT", "HYPERUSDT", "JSTUSDT", "SIGNUSDT", "PUNDIXUSDT", "CTKUSDT", "AIOTUSDT", "DOLOUSDT", "HAEDALUSDT", "SXTUSDT", "ASRUSDT", "ALPINEUSDT", "B2USDT", "SYRUPUSDT", "DOODUSDT", "OGUSDT", "SKYAIUSDT", "NXPCUSDT", "CVCUSDT", "AGTUSDT", "AWEUSDT", "BUSDT", "SOONUSDT", "HUMAUSDT", "AUSDT", "SOPHUSDT", "MERLUSDT", "HYPEUSDT", "1000000BOBUSDT", "LAUSDT", "HOMEUSDT", "RESOLVUSDT", "TAIKOUSDT", "SQDUSDT", "PUMPBTCUSDT", "SPKUSDT", "MYXUSDT", "FUSDT", "NEWTUSDT", "HUSDT", "SAHARAUSDT", "ICNTUSDT", "BULLAUSDT", "IDOLUSDT", "MUSDT", "PUMPUSDT", "CROSSUSDT", "AINUSDT", "CUSDT", "VELVETUSDT", "TACUSDT", "ERAUSDT", "TAUSDT", "CVXUSDT", "SLPUSDT", "ZORAUSDT", "TAGUSDT", "ESPORTSUSDT", "TREEUSDT", "PLAYUSDT", "NAORISUSDT", "TOWNSUSDT", "PROVEUSDT", "ALLUSDT", "INUSDT", "CARVUSDT", "AIOUSDT", "XNYUSDT", "USELESSUSDT", "SAPIENUSDT", "XPLUSDT", "WLFIUSDT", "SOMIUSDT", "BASUSDT", "BTRUSDT", "MITOUSDT", "HEMIUSDT", "LINEAUSDT", "QUSDT", "ARIAUSDT", "TAKEUSDT", "PTBUSDT", "OPENUSDT", "FLOCKUSDT", "SKYUSDT", "AVNTUSDT", "HOLOUSDT", "XPINUSDT", "UBUSDT", "ZKCUSDT", "TOSHIUSDT", "STBLUSDT", "0GUSDT", "BARDUSDT", "ASTERUSDT", "TRADOORUSDT", "BLESSUSDT", "FLUIDUSDT", "COAIUSDT", "HANAUSDT", "MIRAUSDT", "AKEUSDT", "ORDERUSDT", "LIGHTUSDT", "XANUSDT", "FFUSDT", "EDENUSDT", "NOMUSDT", "TRUTHUSDT", "2ZUSDT", "EVAAUSDT", "LYNUSDT", "KGENUSDT", "4USDT", "GIGGLEUSDT", "MONUSDT", "YBUSDT", "METUSDT", "EULUSDT", "ENSOUSDT", "CLOUSDT", "RECALLUSDT", "ZBTUSDT", "LABUSDT", "RIVERUSDT", "\u5e01\u5b89\u4eba\u751fUSDT", "BLUAIUSDT", "TURTLEUSDT", "APRUSDT", "ONUSDT", "KITEUSDT", "ATUSDT", "CCUSDT", "MMTUSDT", "TRUSTUSDT", "UAIUSDT", "FOLKSUSDT", "STABLEUSDT", "JCTUSDT", "ALLOUSDT", "CLANKERUSDT", "BEATUSDT", "PIEVERSEUSDT", "SENTUSDT", "IRYSUSDT", "POWERUSDT", "WETUSDT", "NIGHTUSDT", "USUSDT", "CYSUSDT", "RAVEUSDT", "ZKPUSDT", "GUAUSDT", "LITUSDT", "BREVUSDT", "COLLECTUSDT", "MAGMAUSDT", "ZAMAUSDT", "FOGOUSDT", "FRAXUSDT", "SPORTFUNUSDT", "AIAUSDT", "ACUUSDT", "\u6211\u8e0f\u9a6c\u6765\u4e86USDT", "ELSAUSDT", "SKRUSDT", "SPACEUSDT", "FIGHTUSDT", "BIRBUSDT", "GWEIUSDT", "MEGAUSDT", "INXUSDT", "TRIAUSDT", "ESPUSDT", "AZTECUSDT", "OPNUSDT", "ROBOUSDT", "KATUSDT", "MANTRAUSDT", "\u9f99\u867eUSDT", "CFGUSDT", "EDGEUSDT", "BSBUSDT", "XAUTUSDT", "BASEDUSDT", "PRLUSDT", "GENIUSUSDT", "CHIPUSDT", "OPGUSDT", "AIGENSYNUSDT", "BILLUSDT", "PHAROSUSDT", "STARUSDT", "CTRUSDT", "SLXUSDT", "ZESTUSDT", "BTWUSDT", "REUSDT", "ARXUSDT", "OUSDT", "CAPUSDT", "GRAMUSDT", "DATAIPUSDT"];
  const [symbols, setSymbols] = useState<string[]>(fallbackSymbols);
  
  useEffect(() => {
    fetch('https://fapi.binance.com/fapi/v1/exchangeInfo')
      .then(res => res.json())
      .then(data => {
        if (data && data.symbols) {
          const syms = data.symbols
            .filter((s: any) => s.status === 'TRADING' && s.contractType === 'PERPETUAL' && s.quoteAsset === 'USDT')
            .map((s: any) => s.symbol);
          setSymbols(syms);
        }
      })
      .catch(err => {
        console.error('Failed to fetch symbols', err);
        setSymbols(fallbackSymbols);
      });
  }, []);

  const filteredSymbols = symbols.filter((sym) =>
    sym.toLowerCase().includes(searchQuery.toLowerCase())
  ).sort((a, b) => {
    const query = searchQuery.toLowerCase();
    const aStarts = a.toLowerCase().startsWith(query);
    const bStarts = b.toLowerCase().startsWith(query);
    if (aStarts && !bStarts) return -1;
    if (!aStarts && bStarts) return 1;
    return a.localeCompare(b);
  });

  const timeframes = ['1S', '1M', '5M', '15M', '1H', '4H', '1D'];

  // Row 1 Buttons Array
  const row1Buttons = [
    { id: 'IMB', label: 'IMB', theme: 'steel' },
    { id: 'STK', label: 'STK', theme: 'steel' },
    { id: 'RSI', label: 'RSI', theme: 'steel' },
    { id: 'DELTA', label: 'DELTA', theme: 'steel' },
    { id: 'D-DELTA', label: 'D-DELTA', theme: 'steel' },
    { id: 'DELTA-V', label: 'DELTA-V', theme: 'steel' },
    { id: 'WHALE', label: 'WHALE', theme: 'steel' },
    { id: 'EMA', label: 'EMA', theme: 'purple' },
    { id: 'LEZ', label: 'LEZ', theme: 'cyan' },
    { id: 'VPT', label: 'VPT', theme: 'orange' },
    { id: 'DOM-LIQ', label: 'DOM-LIQ', theme: 'cyan' },
    { id: 'DOM-PROF', label: 'DOM-PROF', theme: 'green' },
    { id: 'MMS', label: 'MMS', theme: 'purple' },
    { id: 'NEWS', label: 'NEWS', theme: 'blue' },
    { id: 'LIQ-POOL', label: 'LIQ-POOL', theme: 'pink' },
    { id: 'ICEBERG', label: 'ICEBERG', theme: 'cyan' },
    { id: 'PACE', label: 'PACE', theme: 'orange' },
    { id: 'WICK-Δ', label: 'WICK-Δ', theme: 'crimson' },
    { id: 'REKT', label: '☠️ REKT', theme: 'orange-red' },
    { id: 'FVG', label: 'FVG', theme: 'rose' }
  ];

  // Row 2 Buttons Array
  const row2Buttons = [
    { id: 'VWBA', label: 'OBScan', theme: 'green' },
    { id: 'TWB', label: 'TWB', theme: 'steel' },
    { id: 'FOOT', label: 'FOOT', theme: 'steel' },
    { id: 'STATS', label: 'STATS', theme: 'steel' },
    { id: 'LIQ-V', label: 'LIQ-V', theme: 'cyan' },
    { id: 'SK', label: 'SK', theme: 'orange' },
    { id: 'EW', label: 'EW', theme: 'pink' },
    { id: 'WYC', label: 'WYC', theme: 'purple' },
    { id: 'SMC', label: 'SMC', theme: 'blue' },
    { id: 'CRT', label: 'CRT', theme: 'pink' },
    { id: 'VWAP', label: 'VWAP', theme: 'steel' },
    { id: 'SESS', label: 'SESS', theme: 'steel' },
    { id: 'VOL', label: 'VOL', theme: 'steel' },
    { id: 'D-OPEN', label: 'D-OPEN', theme: 'white' },
    { id: 'D-TPO', label: 'D-TPO', theme: 'purple' },
    { id: 'D-VOL', label: 'D-VOL', theme: 'blue' },
    { id: 'N-POC', label: 'N-POC', theme: 'orange' },
    { id: 'CVD', label: 'CVD', theme: 'yellow' },
    { id: 'ABS', label: 'ABS', theme: 'yellow' },
    { id: 'HV-BUY', label: 'HV-BUY', theme: 'cyan' },
    { id: 'HV-SELL', label: 'HV-SELL', theme: 'pink' },
    { id: 'PIVOT', label: 'PIVOT', theme: 'purple' },
    { id: 'AVWAP', label: 'MPAS', theme: 'blue' },
    { id: 'SPOOF', label: 'SPOOF', theme: 'orange' },
    { id: 'OI', label: 'OI', theme: 'cyan' },
    { id: 'OIT', label: 'OIT', theme: 'green' },
    { id: 'OI-WALL', label: '🔥 OI-WALL', theme: 'orange' },
    { id: 'LVN', label: 'LVN', theme: 'cyan' },
    { id: 'MTF', label: 'MTF', theme: 'orange' },
    { id: 'FP SHAPE', label: 'FP SHAPE', theme: 'purple' }
  ];

  // Customizable threshold controls rendered in Row 3

  // Determine active state by checking local state + syncing global states
  const isButtonActive = (id: string) => {
    if (id === 'FOOT') return chartType === 'footprint';
    if (id === 'FVG') return smc.showFVG;
    if (id === 'SMC') return smc.showOB || smc.showBOS;
    if (id === 'VWAP') return indicators.showVWAP;
    if (id === 'AVWAP') return indicators.showMPAS;
    if (id === 'LIQ-V') return indicators.showSNR;
    if (id === 'D-TPO') return indicators.showTPO;
    if (id === 'N-POC') return indicators.showNPOC;
    if (id === 'CVD') return indicators.showDeltaCVD;
    if (id === 'SPOOF') return indicators.showSpoof;
    if (id === 'OI') return indicators.showOI;
    if (id === 'OIT') return indicators.showOIT;
    if (id === 'OI-WALL') return indicators.showOIWall;
    if (id === 'LVN') return indicators.showLVN;
    if (id === 'FP SHAPE') return indicators.showFPShape;
    if (id === 'NEWS') return !!indicators.showNews;
    if (id === 'PACE') return !!indicators.showPace;
    if (id === 'DOM-LIQ') return !!indicators.showDOMLiquidity;
    if (id === 'LIQ-POOL') return !!smc.showLiquiditySweeps;
    if (id === 'DOM-PROF') return !!indicators.showLiveDOMProfile;
    if (id === 'LIVE') return isWsConnected;
    if (id === 'STATS') return !!indicators.showStats;
    if (id === 'WICK-Δ') return !!indicators.showWickDelta;
    if (id === 'DELTA') return !!indicators.showDelta;
    if (id === 'D-DELTA') return !!indicators.showDDelta;
    if (id === 'DELTA-V') return !!indicators.showDeltaV;
    if (id === 'WHALE') return !!indicators.showWhales;
    if (id === 'RSI') return !!indicators.showRSI;
    if (id === 'VPT') return !!indicators.showVPT;
    if (id === 'IMB') return !!indicators.showIMB;
    if (id === 'STK') return !!indicators.showSTK;
    if (id === 'MTF') return !!indicators.showMTF;
    if (id === 'PIVOT') return !!indicators.showPivot;
    if (id === 'ABS') return !!indicators.showAbs;
    if (id === 'MMS') return !!indicators.showMMS;
    if (id === 'EMA') return !!indicators.showEMA;
    if (id === 'LEZ') return !!indicators.showLEZ;
    if (id === 'VOL') return !!indicators.showVol;
    if (id === 'D-VOL') return !!indicators.showDVol;
    if (id === 'D-OPEN') return !!indicators.showDOpen;
    if (id === 'SESS') return !!indicators.showSess;
    if (id === 'CRT') return !!indicators.showCRT;
    if (id === 'EW') return !!indicators.showEW;
    if (id === 'SK') return !!indicators.showSK;
    if (id === 'TWB') return !!indicators.showTWB;
    if (id === 'LIQ-V') return !!indicators.showSNR;
    if (id === 'WYC') return !!indicators.showWYC;
    if (id === 'VWBA') return !!indicators.showVWBA;
    if (id === 'HV-BUY') return smc.showHVBuy;
    if (id === 'HV-SELL') return smc.showHVSell;
    if (id === 'A') return isAutoAggregation;
    return !!activeToggles[id];
  };

  const handleToggle = (id: string) => {
    // Admin config enforcement
    if (globalConfig) {
      if (!globalConfig.indicatorsEnabled) return; // Master switch off

      const mapping: Record<string, string> = {
        'EMA': 'showEMA',
        'LEZ': 'showLEZ',
        'VP': 'showVolumeProfile',
        'VWAP': 'showVWAP',
        'AVWAP': 'showMPAS',
        'LIQ-V': 'showSNR',
        'NEWS': 'showNews',
        'PACE': 'showPace',
        'DOM-PROF': 'showLiveDOMProfile',
        'DOM-LIQ': 'showDOMLiquidity',
        'LIQ-POOL': 'showLiquiditySweeps',
        'WHALE': 'showWhales',
        'RSI': 'showRSI',
        'VPT': 'showVPT',
        'IMB': 'showIMB',
        'STK': 'showSTK',
        'MTF': 'showMTF',
        'PIVOT': 'showPivot',
        'ABS': 'showAbs',
        'D-TPO': 'showTPO',
        'N-POC': 'showNPOC',
        'CVD': 'showDeltaCVD',
        'SPOOF': 'showSpoof',
        'OI': 'showOI',
        'OIT': 'showOIT',
        'OI-WALL': 'showOIWall',
        'LVN': 'showLVN',
        'FP SHAPE': 'showFPShape',
        'WICK-Δ': 'showWickDelta',
        'DELTA': 'showDelta',
        'D-DELTA': 'showDDelta',
        'DELTA-V': 'showDeltaV',
        'STATS': 'showStats',
        'FVG': 'showFVG',
        'SMC': 'showOB', 
        'HV-BUY': 'showHVBuy',
        'HV-SELL': 'showHVSell',
        'VOL': 'showVol',
        'D-VOL': 'showDVol',
        'D-OPEN': 'showDOpen',
        'SESS': 'showSess',
        'CRT': 'showCRT',
        'EW': 'showEW',
        'SK': 'showSK',
        'TWB': 'showTWB',
        'WYC': 'showWYC',
        'VWBA': 'showVWBA',
        'MMS': 'showMMS',
        'REKT': 'showRekt'
      };
      
      const schemaKey = mapping[id];
      if (schemaKey && globalConfig.individualIndicators) {
        if (globalConfig.individualIndicators[schemaKey] === false) {
          return; // Block toggle if admin disabled it
        }
      }
    }

    if (id === 'A') {
      setIsAutoAggregation(!isAutoAggregation);
      return;
    }
    const currentActive = isButtonActive(id);
    const nextActive = !currentActive;

    setActiveToggles(prev => {
      const updated = { ...prev, [id]: nextActive };
      if (id === 'FOOT') {
        updated['FOOT'] = nextActive;
      }
      localStorage.setItem('active_toggles', JSON.stringify(updated));
      return updated;
    });

    // Core functionality bindings (called safely outside of the state updater)
    if (id === 'FOOT') {
      if (nextActive) {
        setChartType('footprint');
      } else {
        setChartType('candlestick');
      }
    } else if (id === 'STATS') {
      setIndicators({ showStats: nextActive });
    } else if (id === 'DELTA') {
      setIndicators({ showDelta: nextActive });
    } else if (id === 'D-DELTA') {
      setIndicators({ showDDelta: nextActive });
    } else if (id === 'DELTA-V') {
      setIndicators({ showDeltaV: nextActive });
    } else if (id === 'FVG') {
      setSMC({ showFVG: nextActive });
    } else if (id === 'HV-BUY') {
      setSMC({ showHVBuy: nextActive });
    } else if (id === 'HV-SELL') {
      setSMC({ showHVSell: nextActive });
    } else if (id === 'SMC') {
      setSMC({ showOB: nextActive, showBOS: nextActive, showCHOCH: nextActive });
    } else if (id === 'VWAP') {
      setIndicators({ showVWAP: nextActive });
    } else if (id === 'AVWAP') {
      setIndicators({ showMPAS: nextActive });
    } else if (id === 'LIQ-V') {
      setIndicators({ showSNR: nextActive });
    } else if (id === 'D-TPO') {
      setIndicators({ showTPO: nextActive });
    } else if (id === 'N-POC') {
      setIndicators({ showNPOC: nextActive });
    } else if (id === 'CVD') {
      setIndicators({ showDeltaCVD: nextActive });
    } else if (id === 'SPOOF') {
      setIndicators({ showSpoof: nextActive });
    } else if (id === 'OI') {
      setIndicators({ showOI: nextActive });
    } else if (id === 'OIT') {
      setIndicators({ showOIT: nextActive });
    } else if (id === 'OI-WALL') {
      setIndicators({ showOIWall: nextActive });
    } else if (id === 'LVN') {
      setIndicators({ showLVN: nextActive });
    } else if (id === 'FP SHAPE') {
      setIndicators({ showFPShape: nextActive });
    } else if (id === 'NEWS') {
      setIndicators({ showNews: nextActive });
    } else if (id === 'PACE') {
      setIndicators({ showPace: nextActive });
    } else if (id === 'DOM-LIQ') {
      setIndicators({ showDOMLiquidity: nextActive });
    } else if (id === 'LIQ-POOL') {
      setSMC({ showLiquiditySweeps: nextActive });
    } else if (id === 'DOM-PROF') {
      setIndicators({ showLiveDOMProfile: nextActive });
    } else if (id === 'WICK-Δ') {
      setIndicators({ showWickDelta: nextActive });
    } else if (id === 'WHALE') {
      setIndicators({ showWhales: nextActive });
    } else if (id === 'RSI') {
      setIndicators({ showRSI: nextActive });
    } else if (id === 'VPT') {
      setIndicators({ showVPT: nextActive });
    } else if (id === 'STK') {
      setIndicators({ showSTK: nextActive });
    } else if (id === 'IMB') {
      setIndicators({ showIMB: nextActive });
    } else if (id === 'MTF') {
      setIndicators({ showMTF: nextActive });
    } else if (id === 'PIVOT') {
      setIndicators({ showPivot: nextActive });
    } else if (id === 'ABS') {
      setIndicators({ showAbs: nextActive });
    } else if (id === 'EMA') {
      setIndicators({ showEMA: nextActive });
    } else if (id === 'LEZ') {
      setIndicators({ showLEZ: nextActive });
    } else if (id === 'VOL') {
      setIndicators({ showVol: nextActive });
    } else if (id === 'D-VOL') {
      setIndicators({ showDVol: nextActive });
    } else if (id === 'D-OPEN') {
      setIndicators({ showDOpen: nextActive });
    } else if (id === 'SESS') {
      setIndicators({ showSess: nextActive });
    } else if (id === 'CRT') {
      setIndicators({ showCRT: nextActive });
    } else if (id === 'EW') {
      setIndicators({ showEW: nextActive });
    } else if (id === 'SK') {
      setIndicators({ showSK: nextActive });
    } else if (id === 'TWB') {
      setIndicators({ showTWB: nextActive });
    } else if (id === 'SNR') {
      setIndicators({ showSNR: nextActive });
    } else if (id === 'WYC') {
      setIndicators({ showWYC: nextActive });
    } else if (id === 'VWBA') {
      setIndicators({ showVWBA: nextActive });
    } else if (id === 'ICEBERG') {
      setIndicators({ showIceberg: nextActive });
    } else if (id === 'MMS') {
      setIndicators({ showMMS: nextActive });
    } else if (id === 'REKT') {
      setIndicators({ showRekt: nextActive });
    }
  };

  // Generate responsive classes & neon styles for each item based on its theme and status
  const getButtonStyle = (theme: string, isActive: boolean) => {
    const base = "px-2.5 py-1 text-[10px] md:text-[11px] font-bold font-mono uppercase border rounded transition-all duration-150 active:scale-95 cursor-pointer whitespace-nowrap select-none";
    
    if (isActive) {
      switch (theme) {
        case 'cyan':
          return `${base} bg-cyan-950/40 text-cyan-400 border-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.4)]`;
        case 'green':
          return `${base} bg-emerald-950/40 text-emerald-400 border-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.4)]`;
        case 'yellow':
          return `${base} bg-yellow-950/40 text-yellow-400 border-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.4)]`;
        case 'orange':
          return `${base} bg-orange-950/40 text-orange-400 border-orange-400 shadow-[0_0_8px_rgba(251,146,60,0.4)]`;
        case 'orange-red':
          return `${base} bg-red-950/40 text-red-400 border-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]`;
        case 'crimson':
          return `${base} bg-rose-950/40 text-rose-400 border-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]`;
        case 'rose':
          return `${base} bg-rose-950/40 text-rose-400 border-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.4)]`;
        case 'purple':
          return `${base} bg-purple-950/40 text-purple-400 border-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.4)]`;
        case 'blue':
          return `${base} bg-blue-950/40 text-blue-400 border-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.4)]`;
        case 'pink':
          return `${base} bg-pink-950/40 text-pink-400 border-pink-400 shadow-[0_0_8px_rgba(244,114,182,0.4)]`;
        case 'white':
          return `${base} bg-slate-900/40 text-white border-slate-200 shadow-[0_0_8px_rgba(255,255,255,0.4)]`;
        case 'gray-select':
          return `${base} bg-slate-800 text-cyan-400 border-slate-600 shadow-[0_0_8px_rgba(34,211,238,0.2)]`;
        case 'live-cyan':
          return `${base} bg-cyan-400 text-slate-950 border-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.65)] font-extrabold`;
        case 'steel':
        default:
          return `${base} bg-slate-900/60 text-slate-100 border-slate-600 shadow-[0_0_6px_rgba(148,163,184,0.25)]`;
      }
    } else {
      switch (theme) {
        case 'cyan':
          return `${base} bg-transparent text-cyan-400/70 border-cyan-500/25 hover:border-cyan-500/50 hover:text-cyan-400`;
        case 'green':
          return `${base} bg-transparent text-emerald-400/70 border-emerald-500/25 hover:border-emerald-500/50 hover:text-emerald-400`;
        case 'yellow':
          return `${base} bg-transparent text-yellow-400/70 border-yellow-500/25 hover:border-yellow-500/50 hover:text-yellow-400`;
        case 'orange':
          return `${base} bg-transparent text-orange-400/70 border-orange-500/25 hover:border-orange-500/50 hover:text-orange-400`;
        case 'orange-red':
          return `${base} bg-transparent text-red-400/70 border-red-500/25 hover:border-red-500/50 hover:text-red-400`;
        case 'crimson':
          return `${base} bg-transparent text-rose-400/70 border-rose-500/25 hover:border-rose-500/50 hover:text-rose-400`;
        case 'rose':
          return `${base} bg-transparent text-rose-400/70 border-rose-500/25 hover:border-rose-500/50 hover:text-rose-400`;
        case 'purple':
          return `${base} bg-transparent text-purple-400/70 border-purple-500/25 hover:border-purple-500/50 hover:text-purple-400`;
        case 'blue':
          return `${base} bg-transparent text-blue-400/70 border-blue-500/25 hover:border-blue-500/50 hover:text-blue-400`;
        case 'pink':
          return `${base} bg-transparent text-pink-400/70 border-pink-500/25 hover:border-pink-500/50 hover:text-pink-400`;
        case 'white':
          return `${base} bg-transparent text-slate-300/70 border-slate-500/25 hover:border-slate-500/50 hover:text-slate-200`;
        case 'gray-select':
          return `${base} bg-slate-950/80 text-slate-400 border-slate-800/80 hover:border-slate-700 hover:text-slate-300`;
        case 'live-cyan':
          return `${base} bg-transparent text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/10`;
        case 'steel':
        default:
          return `${base} bg-transparent text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-300`;
      }
    }
  };

  const renderThresholdButton = (
    id: 'whaleBtc' | 'mediumTrade' | 'largeTrade' | 'whaleTrade',
    label: string,
    emoji: string,
    colorClass: string,
    activeColorClass: string
  ) => {
    const isActive = activeThresholdId === id;
    const value = thresholds[id];

    return (
      <div
        id={`threshold-container-${id}`}
        onClick={() => setActiveThresholdId(id)}
        className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded border transition-all duration-150 select-none h-7 cursor-pointer shrink-0 ${
          isActive
            ? `bg-slate-900/80 ${activeColorClass} shadow-[0_0_8px_rgba(34,211,238,0.25)]`
            : 'bg-slate-950/40 border-slate-800/80 text-slate-400 hover:border-slate-700 hover:text-slate-300'
        }`}
      >
        <span className="text-[10px] md:text-[11px] font-bold font-sans flex items-center gap-1">
          <span>{emoji}</span>
          <span className="hidden sm:inline">{label}:</span>
          <span className="sm:hidden">{label.split(' ')[0]}:</span>
        </span>
        <input
          id={`input-threshold-${id}`}
          type="number"
          value={value}
          onChange={(e) => {
            const val = parseFloat(e.target.value);
            updateThreshold(id, isNaN(val) ? 0 : val);
          }}
          className={`bg-slate-950/60 focus:bg-slate-950 px-1 py-0.5 rounded text-[10px] md:text-[11px] font-mono font-bold w-14 md:w-20 border border-slate-800 outline-none text-center ${
            isActive ? 'text-cyan-400 border-cyan-500/50' : 'text-slate-300'
          }`}
          onClick={(e) => {
            e.stopPropagation();
            setActiveThresholdId(id);
          }}
        />
      </div>
    );
  };

  return (
    <div className="bg-[#07090b] border-b border-slate-900/80 p-2 flex flex-col gap-2 w-full font-sans select-none shrink-0 relative z-40">
      
      {/* DROPDOWN PORTAL (Extracted from overflow-x-auto container) */}
      {isSearchOpen && (
            <div ref={listContainerRef} className="absolute top-[38px] left-[65px] w-52 bg-slate-950 border border-slate-800 rounded-lg shadow-2xl z-[100] flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-1 duration-100">
              <div 
                ref={listRef}
                className="max-h-64 overflow-y-auto py-1 no-scrollbar bg-slate-950/95"
              >
                {filteredSymbols.length > 0 ? (
                  filteredSymbols.map((sym, idx) => (
                    <button
                      key={sym}
                      onClick={() => {
                        setActiveSymbol(sym);
                        setIsSearchOpen(false);
                        setSearchQuery('');
                      }}
                      onMouseEnter={() => setFocusedIndex(idx)}
                      className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between transition-all duration-75 cursor-pointer ${
                        idx === focusedIndex
                          ? 'bg-slate-900 text-cyan-300 font-extrabold'
                          : sym === activeSymbol
                          ? 'bg-cyan-500/5 text-cyan-400 font-bold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span className="font-mono tracking-wide">
                        {highlightMatch(sym, searchQuery)}
                      </span>
                      {sym === activeSymbol && (
                        <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0 ml-2" />
                      )}
                    </button>
                  ))
                ) : (
                  <div className="text-slate-500 text-xs text-center py-6 font-sans">
                    No coins found matching "{searchQuery}"
                  </div>
                )}
              </div>
            </div>
          )}

      
      {/* ROW 1: SELECTORS & INDICATORS group (IMB through FVG) */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5 whitespace-nowrap w-full">
        {/* SYMBOL Selector */}
        <div className="flex items-center gap-1.5 shrink-0 relative" ref={dropdownRef}>
          <span className="text-slate-400 text-[10px] md:text-[11px] font-bold font-sans tracking-tight">SYMBOL:</span>
          
          <div className="relative group">
            <input
              type="text"
              value={isSearchOpen ? searchQuery : activeSymbol}
              onClick={() => {
                setIsSearchOpen(true);
                setSearchQuery('');
              }}
              onChange={(e) => {
                if (!isSearchOpen) setIsSearchOpen(true);
                setSearchQuery(e.target.value);
              }}
              onFocus={() => {
                setIsSearchOpen(true);
                setSearchQuery('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  if (!isSearchOpen) setIsSearchOpen(true);
                  setFocusedIndex((prev) => filteredSymbols.length > 0 ? (prev + 1) % filteredSymbols.length : 0);
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  if (!isSearchOpen) setIsSearchOpen(true);
                  setFocusedIndex((prev) => filteredSymbols.length > 0 ? (prev - 1 + filteredSymbols.length) % filteredSymbols.length : 0);
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  if (isSearchOpen && filteredSymbols.length > 0 && filteredSymbols[focusedIndex]) {
                    setActiveSymbol(filteredSymbols[focusedIndex]);
                    setIsSearchOpen(false);
                    e.currentTarget.blur();
                  } else if (searchQuery.trim().length > 0) {
                     setActiveSymbol(searchQuery.trim().toUpperCase());
                     setIsSearchOpen(false);
                     e.currentTarget.blur();
                  }
                } else if (e.key === 'Escape') {
                  setIsSearchOpen(false);
                  e.currentTarget.blur();
                }
              }}
              className="bg-slate-950 hover:bg-slate-900 border border-slate-800 px-2.5 py-1 rounded text-cyan-400 font-mono tracking-wide text-xs font-bold w-[110px] h-7 shadow-inner transition-all duration-150 focus:outline-none focus:border-cyan-500/50 cursor-text uppercase"
              placeholder="Search..."
            />
            <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          
        </div>

        {/* TICK Selector */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-slate-400 text-[10px] md:text-[11px] font-bold font-sans tracking-tight">TICK:</span>
          <div className="bg-slate-950 border border-slate-800 px-2 py-1 rounded text-slate-200 text-[11px] font-semibold flex items-center h-7 shadow-inner">
            <select
              id="select-tick"
              value={tickSize}
              onChange={(e) => setTickSize(e.target.value)}
              className="bg-transparent border-none outline-none text-slate-200 cursor-pointer text-xs font-bold font-mono focus:ring-0"
            >
              <option value="5" className="bg-slate-950 text-slate-300">5</option>
              <option value="10" className="bg-slate-950 text-slate-300">10</option>
              <option value="20" className="bg-slate-950 text-slate-300">20</option>
              <option value="50" className="bg-slate-950 text-slate-300">50</option>
              <option value="100" className="bg-slate-950 text-slate-300">100</option>
            </select>
          </div>
        </div>

        {/* Auto button "A" */}
        <button
          id="btn-auto-aggregation"
          onClick={() => handleToggle('A')}
          className={`h-7 w-7 rounded flex items-center justify-center font-bold text-xs shrink-0 transition-all cursor-pointer ${
            isButtonActive('A')
              ? 'bg-cyan-400 text-slate-950 shadow-[0_0_10px_rgba(34,211,238,0.6)]'
              : 'border border-slate-850 text-slate-400 hover:text-slate-200'
          }`}
          title="Auto Aggregation Mode"
        >
          A
        </button>

        {/* AGGREGATION Dropdown */}
        <div className="bg-slate-950 border border-slate-800 px-2 py-1 rounded text-slate-200 text-[11px] font-semibold flex items-center h-7 shrink-0 shadow-inner">
          <select
            id="select-aggregation"
            value={aggregation}
            onChange={(e) => setAggregation(e.target.value)}
            className="bg-transparent border-none outline-none text-slate-200 cursor-pointer text-[10px] md:text-[11px] font-bold font-sans pr-1 focus:ring-0 text-cyan-400"
          >
            <option value="auto" className="bg-slate-950 text-cyan-400">-- AGGREGATION --</option>
            <option value="cumulative" className="bg-slate-950 text-slate-300">Cumulative</option>
            <option value="individual" className="bg-slate-950 text-slate-300">Individual</option>
          </select>
        </div>

        {/* PERIOD Selector */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-slate-400 text-[10px] md:text-[11px] font-bold font-sans tracking-tight">PERIOD:</span>
          <div className="bg-slate-950 border border-slate-800 px-2 py-1 rounded text-slate-200 text-[11px] font-semibold flex items-center h-7 shadow-inner">
            <select
              id="select-timeframe"
              value={activeTimeframe.toUpperCase()}
              onChange={(e) => setActiveTimeframe(e.target.value.toLowerCase())}
              className="bg-transparent border-none outline-none text-cyan-400 cursor-pointer text-xs font-bold font-sans pr-1 focus:ring-0"
            >
              {timeframes.map((tf) => (
                <option key={tf} value={tf} className="bg-slate-950 text-slate-300 font-sans font-bold">
                  {tf}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Vertical divider */}
        <div className="hidden md:block h-6 w-[1px] bg-slate-800 shrink-0 mx-1" />

        {/* Row 1 indicators (Desktop Only) */}
        <div className="hidden md:flex items-center gap-1.5">
          {row1Buttons.map((btn) => (
            <button
              id={`header-btn-${btn.id}`}
              key={btn.id}
              onClick={() => handleToggle(btn.id)}
              className={getButtonStyle(btn.theme, isButtonActive(btn.id))}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* ROW 2: VWBA through FP SHAPE (Desktop Only) */}
      <div className="hidden md:flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 whitespace-nowrap w-full">
        {row2Buttons.map((btn) => (
          <button
            id={`header-btn-${btn.id}`}
            key={btn.id}
            onClick={() => handleToggle(btn.id)}
            className={getButtonStyle(btn.theme, isButtonActive(btn.id))}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* ROW 3: BBA DELTA, Customizable Thresholds, 24H BACK, and LIVE (Desktop Only) */}
      <div className="hidden md:flex items-center gap-2 overflow-x-auto no-scrollbar py-1.5 whitespace-nowrap w-full border-t border-slate-900/50 mt-0.5">
        <button
          id="header-btn-BBA-DELTA"
          onClick={() => handleToggle('BBA-DELTA')}
          className={getButtonStyle('orange', isButtonActive('BBA-DELTA'))}
        >
          BBA DELTA
        </button>

        {/* Separator */}
        <div className="h-4 w-[1px] bg-slate-800 self-center mx-1 shrink-0" />

        {/* Custom customizable inputs */}
        {renderThresholdButton('whaleBtc', 'Whale BTC', '🐳', 'text-cyan-400', 'border-cyan-500/80 text-cyan-400')}
        {renderThresholdButton('mediumTrade', 'Med Trade $', '🟢', 'text-emerald-400', 'border-emerald-500/80 text-emerald-400')}
        {renderThresholdButton('largeTrade', 'Large Trade $', '🟡', 'text-amber-400', 'border-amber-500/80 text-amber-400')}
        {renderThresholdButton('whaleTrade', 'Whale Trade $', '🔴', 'text-rose-400', 'border-rose-500/80 text-rose-400')}

        {/* Separator */}
        <div className="h-4 w-[1px] bg-slate-800 self-center mx-1 shrink-0" />

        <button
          id="header-btn-24H-BACK"
          onClick={() => handleToggle('24H-BACK')}
          className={getButtonStyle('cyan', isButtonActive('24H-BACK'))}
        >
          24H BACK
        </button>

        <button
          id="header-btn-LIVE"
          onClick={() => handleToggle('LIVE')}
          className={getButtonStyle('live-cyan', isButtonActive('LIVE'))}
        >
          LIVE
        </button>

        <button
          id="header-btn-FOUND"
          onClick={() => handleToggle('FOUND')}
          className={getButtonStyle('live-cyan', isButtonActive('FOUND'))}
        >
          FOUND
        </button>

        <button
          id="header-btn-LOGOUT"
          onClick={() => {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/login';
          }}
          className="h-7 px-3 text-[10px] sm:text-[11px] font-bold uppercase tracking-widest border border-rose-500/80 text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 shadow-[0_0_15px_rgba(244,63,94,0.3)] transition-all shrink-0 rounded whitespace-nowrap"
        >
          LOGOUT
        </button>

      </div>

      {/* --- MOBILE OVERLAYS (Floating Dropdowns) --- */}
      {mobileTab === 'indicators' && (
        <div className="md:hidden absolute top-full left-0 w-full bg-[#0b0e14]/95 border-b border-[#141a22] p-4 shadow-2xl z-50 flex flex-wrap gap-2.5 backdrop-blur-md max-h-[60vh] overflow-y-auto">
          <div className="w-full text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Primary Indicators</div>
          {row1Buttons.map((btn) => (
            <button
              id={`header-btn-mobile-${btn.id}`}
              key={btn.id}
              onClick={() => handleToggle(btn.id)}
              className={getButtonStyle(btn.theme, isButtonActive(btn.id))}
            >
              {btn.label}
            </button>
          ))}
          <div className="w-full h-[1px] bg-slate-800/50 my-2" />
          <div className="w-full text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">Secondary Indicators</div>
          {row2Buttons.map((btn) => (
            <button
              id={`header-btn-mobile-${btn.id}`}
              key={btn.id}
              onClick={() => handleToggle(btn.id)}
              className={getButtonStyle(btn.theme, isButtonActive(btn.id))}
            >
              {btn.label}
            </button>
          ))}
        </div>
      )}

      {mobileTab === 'settings' && (
        <div className="md:hidden absolute top-full left-0 w-full bg-[#0b0e14]/95 border-b border-[#141a22] p-4 shadow-2xl z-50 flex flex-col gap-4 backdrop-blur-md max-h-[60vh] overflow-y-auto">
          <div className="w-full text-[10px] font-bold text-slate-500 uppercase tracking-wider">Chart Controls</div>
          <div className="flex flex-wrap gap-2.5">
            <button
              id="header-btn-BBA-DELTA-mobile"
              onClick={() => handleToggle('BBA-DELTA')}
              className={getButtonStyle('orange', isButtonActive('BBA-DELTA'))}
            >
              BBA DELTA
            </button>
            <button
              id="header-btn-24H-BACK-mobile"
              onClick={() => handleToggle('24H-BACK')}
              className={getButtonStyle('cyan', isButtonActive('24H-BACK'))}
            >
              24H BACK
            </button>
            <button
              id="header-btn-LIVE-mobile"
              onClick={() => handleToggle('LIVE')}
              className={getButtonStyle('live-cyan', isButtonActive('LIVE'))}
            >
              LIVE
            </button>
            <button
              id="header-btn-FOUND-mobile"
              onClick={() => handleToggle('FOUND')}
              className={getButtonStyle('live-cyan', isButtonActive('FOUND'))}
            >
              FOUND
            </button>
            <button
              id="header-btn-LOGOUT-mobile"
              onClick={() => {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                window.location.href = '/login';
              }}
              className="h-7 px-3 text-[10px] sm:text-[11px] font-bold uppercase tracking-widest border border-rose-500/80 text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 shadow-[0_0_15px_rgba(244,63,94,0.3)] transition-all shrink-0 rounded whitespace-nowrap"
            >
              LOGOUT
            </button>
          </div>

          <div className="w-full h-[1px] bg-slate-800/50" />
          
          <div className="w-full text-[10px] font-bold text-slate-500 uppercase tracking-wider">Thresholds</div>
          <div className="flex flex-wrap gap-2.5">
            {renderThresholdButton('whaleBtc', 'Whale BTC', '🐳', 'text-cyan-400', 'border-cyan-500/80 text-cyan-400')}
            {renderThresholdButton('mediumTrade', 'Med Trade $', '🟢', 'text-emerald-400', 'border-emerald-500/80 text-emerald-400')}
            {renderThresholdButton('largeTrade', 'Large Trade $', '🟡', 'text-amber-400', 'border-amber-500/80 text-amber-400')}
            {renderThresholdButton('whaleTrade', 'Whale Trade $', '🔴', 'text-rose-400', 'border-rose-500/80 text-rose-400')}
          </div>

          <div className="w-full h-[1px] bg-slate-800/50" />
          
          <div className="w-full text-[10px] font-bold text-slate-500 uppercase tracking-wider">Timezone</div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => updateSettings("timezone", "UTC")}
              className={`px-4 py-2 rounded text-[11px] font-mono transition-all border flex items-center gap-1 cursor-pointer ${
                (settings?.timezone || "UTC") === "UTC"
                  ? "bg-blue-600/20 text-blue-400 border-blue-500/45 font-bold shadow-sm"
                  : "bg-[#0a0d10] text-slate-400 border-slate-800 hover:text-slate-200"
              }`}
            >
              <span>UTC</span>
            </button>
            <button
              onClick={() => updateSettings("timezone", "Colombo")}
              className={`px-4 py-2 rounded text-[11px] font-mono transition-all border flex items-center gap-1 cursor-pointer ${
                (settings?.timezone || "UTC") === "Colombo"
                  ? "bg-blue-600/20 text-blue-400 border-blue-500/45 font-bold shadow-sm"
                  : "bg-[#0a0d10] text-slate-400 border-slate-800 hover:text-slate-200"
              }`}
            >
              <span>Colombo</span>
            </button>
          </div>
        </div>
      )}

      <FAEngineModal 
        isOpen={isButtonActive('FOUND')} 
        onClose={() => handleToggle('FOUND')} 
        activeSymbol={activeSymbol} 
      />
    </div>
  );
};

