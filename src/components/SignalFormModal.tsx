import React, { useState, useEffect } from 'react';
import { X, Copy, Share2, Eye, Edit2, Zap, Target, Crosshair, Check } from 'lucide-react';
import { API_BASE } from '../config/api';

interface SignalFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultCoin?: string;
}

export const SignalFormModal: React.FC<SignalFormModalProps> = ({ isOpen, onClose, defaultCoin = 'BTC' }) => {
  const [signalNumber, setSignalNumber] = useState<number>(1);
  const [direction, setDirection] = useState<'LONG' | 'SHORT'>('LONG');
  const [coin, setCoin] = useState<string>(defaultCoin);
  const [leverage, setLeverage] = useState<string>('50X');
  const [entryType, setEntryType] = useState<'Market' | 'Custom'>('Market');
  const [entryPrice, setEntryPrice] = useState<string>('');
  
  const [tpEnabled, setTpEnabled] = useState([true, true, true, true]);
  const [tpValues, setTpValues] = useState(['10%', '30%', '50%', '100%']);
  
  const [stopLoss, setStopLoss] = useState<string>('');
  const [walletUsage, setWalletUsage] = useState<string>('10%');

  const popularCoins = ['MORPHO', 'BTC', 'ETH', 'SOL', 'XRP', 'SUI', 'PEPE', 'DOGE'];
  const popularLeverages = ['10X', '20X', '25X', '50X', '75X', '100X'];
  const popularWallet = ['5%', '10%', '15%', '20%'];

  useEffect(() => {
    if (isOpen) {
      setCoin(defaultCoin.replace('USDT', ''));
    }
  }, [isOpen, defaultCoin]);

  if (!isOpen) return null;

  const getFormattedCoin = () => {
    return `#${coin.toUpperCase()}/USDT`;
  };

  const getSignalNumberStr = () => {
    return `#${signalNumber.toString().padStart(3, '0')}`;
  };

  const generateMessage = () => {
    let msg = `⚡ TAIZER VVIP ⚡\n`;
    msg += `📊 SIGNAL ${getSignalNumberStr()}\n\n`;
    msg += `🚀 ${getFormattedCoin()}\n`;
    msg += `${direction === 'LONG' ? '📈 LONG' : '📉 SHORT'}\n`;
    msg += `⚡ Leverage: ${leverage}\n\n`;
    
    msg += `📍 Entry: ${entryType === 'Market' ? 'Market' : entryPrice}\n\n`;
    
    msg += `🎯 Take Profit Targets:\n`;
    tpEnabled.forEach((enabled, idx) => {
      if (enabled && tpValues[idx]) {
        msg += `✅ TP${idx + 1}: ${tpValues[idx]}\n`;
      }
    });
    msg += `\n`;
    
    if (stopLoss) {
      msg += `🛑 Stop Loss: ${stopLoss}\n\n`;
    }
    
    msg += `💸 Use only ${walletUsage} of wallet.\n`;
    msg += `⚠️ Use proper Risk Management.\n`;
    msg += `💎 VVIP Members Only Signal`;
    
    return msg;
  };

  const saveSignalToDB = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      
      const payload = {
        signalNumber,
        coin: getFormattedCoin(),
        direction,
        leverage,
        entryType,
        entryPrice,
        tpTargets: tpValues.filter((_, i) => tpEnabled[i] && tpValues[i]),
        stopLoss,
        walletUsage,
        status: 'Pending'
      };

      await fetch(`${API_BASE}/api/admin/signals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
    } catch (err) {
      console.error('Failed to save signal:', err);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generateMessage());
    saveSignalToDB();
  };

  const handleShare = () => {
    const text = encodeURIComponent(generateMessage());
    window.open(`https://wa.me/?text=${text}`, '_blank');
    saveSignalToDB();
  };

  const handleClear = () => {
    setDirection('LONG');
    setCoin('BTC');
    setLeverage('50X');
    setEntryType('Market');
    setEntryPrice('');
    setTpEnabled([true, true, true, true]);
    setTpValues(['10%', '30%', '50%', '100%']);
    setStopLoss('');
    setWalletUsage('10%');
  };

  const handleNextSignal = () => {
    setSignalNumber(prev => prev + 1);
    handleClear();
  };

  const generatedText = generateMessage();

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200 font-sans">
      <div className="bg-[#0f1115] border border-slate-800 rounded-2xl w-full max-w-6xl max-h-[95vh] flex flex-col overflow-hidden shadow-2xl relative shadow-[0_0_50px_rgba(0,0,0,0.8)]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-[#14161a]">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Zap className="text-yellow-400 w-5 h-5 fill-yellow-400" />
            SIGNAL GENERATOR
          </h2>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-col lg:flex-row flex-1 overflow-y-auto min-h-0 bg-[#0a0c10]">
          
          {/* LEFT PANEL: Trade Parameters */}
          <div className="flex-1 p-6 border-r border-slate-800 lg:w-1/2 overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2 uppercase tracking-widest">
                <div className="w-2 h-2 rounded-full bg-yellow-400"></div>
                Trade Parameters
              </h3>
              <div className="text-xs font-mono text-yellow-500 bg-yellow-500/10 px-2 py-1 rounded">
                Signal {getSignalNumberStr()}
              </div>
            </div>

            <div className="space-y-6">
              {/* Row 1: Signal Number & Direction */}
              <div className="flex flex-wrap gap-6">
                <div className="flex-1 min-w-[150px]">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex justify-between">
                    <span># Signal Number</span>
                    <span className="text-slate-600">Auto-increments</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 relative">
                      <input 
                        type="number" 
                        value={signalNumber}
                        onChange={(e) => setSignalNumber(Number(e.target.value))}
                        className="w-full bg-[#14161a] border border-slate-800 rounded-lg p-3 text-white font-mono outline-none focus:border-cyan-500/50"
                      />
                      <span className="absolute right-3 top-3 text-yellow-500 text-sm font-mono">{getSignalNumberStr()}</span>
                    </div>
                    <button onClick={() => setSignalNumber(Math.max(1, signalNumber - 1))} className="w-12 h-12 bg-[#14161a] border border-slate-800 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center font-bold cursor-pointer">-</button>
                    <button onClick={() => setSignalNumber(signalNumber + 1)} className="w-12 h-12 bg-[#14161a] border border-slate-800 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center font-bold cursor-pointer">+</button>
                  </div>
                </div>

                <div className="flex-1 min-w-[200px]">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">
                    Trade Direction
                  </label>
                  <div className="flex bg-[#14161a] border border-slate-800 rounded-lg p-1">
                    <button 
                      onClick={() => setDirection('LONG')}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md font-bold text-sm transition-all cursor-pointer ${direction === 'LONG' ? 'bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 'text-slate-400 hover:text-slate-300'}`}
                    >
                      📈 LONG
                    </button>
                    <button 
                      onClick={() => setDirection('SHORT')}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md font-bold text-sm transition-all cursor-pointer ${direction === 'SHORT' ? 'bg-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.3)]' : 'text-slate-400 hover:text-slate-300'}`}
                    >
                      📉 SHORT
                    </button>
                  </div>
                </div>
              </div>

              {/* Row 2: Coin / Pair */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex justify-between">
                  <span>Coin / Pair <span className="text-slate-600 normal-case">(auto: {getFormattedCoin().toLowerCase()})</span></span>
                  <span className="text-slate-600 normal-case">e.g. {coin || 'MORPHO'}</span>
                </label>
                <div className="relative mb-2">
                  <input 
                    type="text" 
                    value={coin}
                    onChange={(e) => setCoin(e.target.value.toUpperCase())}
                    placeholder="Enter coin symbol (e.g. BTC)"
                    className="w-full bg-[#14161a] border border-slate-800 rounded-lg p-3 text-white font-bold outline-none focus:border-cyan-500/50 uppercase"
                  />
                  <span className="absolute right-3 top-3 text-emerald-400 text-xs font-mono font-bold bg-emerald-500/10 px-2 py-1 rounded">{getFormattedCoin()}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mr-1">Popular:</span>
                  {popularCoins.map(c => (
                    <button 
                      key={c}
                      onClick={() => setCoin(c)}
                      className={`text-[10px] font-bold px-3 py-1.5 rounded transition-colors cursor-pointer ${coin === c ? 'bg-yellow-500 text-black' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'}`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {/* Row 3: Leverage & Entry Price */}
              <div className="flex flex-wrap gap-6">
                <div className="flex-1 min-w-[200px]">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <Zap size={12} className="text-yellow-400" /> Leverage
                  </label>
                  <input 
                    type="text" 
                    value={leverage}
                    onChange={(e) => setLeverage(e.target.value)}
                    className="w-full bg-[#14161a] border border-slate-800 rounded-lg p-3 text-white font-bold outline-none focus:border-cyan-500/50 mb-2"
                  />
                  <div className="flex gap-2">
                    {popularLeverages.map(l => (
                      <button 
                        key={l}
                        onClick={() => setLeverage(l)}
                        className={`flex-1 text-[10px] font-bold py-1.5 rounded border transition-colors cursor-pointer ${leverage === l ? 'bg-yellow-500/10 border-yellow-500/50 text-yellow-400' : 'bg-transparent border-slate-800 text-slate-500 hover:text-slate-300'}`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex-1 min-w-[200px]">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex justify-between">
                    <span className="flex items-center gap-1 text-slate-400"><Target size={12} /> Entry Price</span>
                    <div className="flex gap-2">
                      <button onClick={() => setEntryType('Market')} className={`text-[10px] cursor-pointer ${entryType === 'Market' ? 'text-yellow-400' : 'text-slate-600'}`}>Market</button>
                      <button onClick={() => setEntryType('Custom')} className={`text-[10px] cursor-pointer ${entryType === 'Custom' ? 'text-cyan-400' : 'text-slate-600'}`}>Custom</button>
                    </div>
                  </label>
                  
                  {entryType === 'Market' ? (
                    <div className="w-full bg-[#14161a] border border-slate-800 rounded-lg p-3 flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 text-rose-400 font-bold">
                        <span className="w-2 h-2 rounded-full bg-rose-500"></span> Market Price
                      </div>
                      <button onClick={() => setEntryType('Custom')} className="text-[10px] text-slate-500 underline hover:text-white cursor-pointer">Edit price</button>
                    </div>
                  ) : (
                    <input 
                      type="text" 
                      value={entryPrice}
                      onChange={(e) => setEntryPrice(e.target.value)}
                      placeholder="e.g. 1.234"
                      className="w-full bg-[#14161a] border border-cyan-500/30 rounded-lg p-3 text-cyan-400 font-bold font-mono outline-none focus:border-cyan-500 mb-2"
                    />
                  )}
                  <div className="text-[10px] text-slate-600">Select Market or type custom entry level</div>
                </div>
              </div>

              {/* Row 4: Take Profit Targets */}
              <div>
                <label className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-3 flex items-center justify-between">
                  <span className="flex items-center gap-1"><Crosshair size={12} /> Take Profit Targets (TP1 - TP4)</span>
                  <button 
                    onClick={() => {
                      setTpEnabled([true, true, true, true]);
                      setTpValues(['10%', '30%', '50%', '100%']);
                    }} 
                    className="text-yellow-500 hover:text-yellow-400 flex items-center gap-1 cursor-pointer"
                  >
                    <Zap size={10} /> Reset % Targets
                  </button>
                </label>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {[0, 1, 2, 3].map(idx => (
                    <div key={idx}>
                      <label className="flex items-center gap-2 text-[10px] font-bold text-slate-400 mb-1 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={tpEnabled[idx]} 
                          onChange={(e) => {
                            const newEnabled = [...tpEnabled];
                            newEnabled[idx] = e.target.checked;
                            setTpEnabled(newEnabled);
                          }}
                          className="accent-emerald-500 w-3 h-3 cursor-pointer"
                        />
                        <span className={tpEnabled[idx] ? 'text-emerald-400' : ''}>TP {idx + 1}</span>
                      </label>
                      <input 
                        type="text"
                        disabled={!tpEnabled[idx]}
                        value={tpValues[idx]}
                        onChange={(e) => {
                          const newVals = [...tpValues];
                          newVals[idx] = e.target.value;
                          setTpValues(newVals);
                        }}
                        className={`w-full bg-[#14161a] border rounded-lg p-2.5 text-sm outline-none transition-colors ${tpEnabled[idx] ? 'border-emerald-500/30 text-emerald-100 focus:border-emerald-500' : 'border-slate-800 text-slate-600 cursor-not-allowed opacity-50'}`}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Row 5: Stop Loss & Wallet */}
              <div className="flex flex-wrap gap-6">
                <div className="flex-1 min-w-[200px]">
                  <label className="text-[10px] font-bold text-rose-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-rose-500 border border-rose-400/50"></span> Stop Loss
                  </label>
                  <input 
                    type="text"
                    value={stopLoss}
                    onChange={(e) => setStopLoss(e.target.value)}
                    placeholder="e.g. 2.34"
                    className="w-full bg-[#14161a] border border-rose-500/20 rounded-lg p-3 text-rose-100 font-mono outline-none focus:border-rose-500"
                  />
                </div>
                
                <div className="flex-1 min-w-[200px]">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex justify-between">
                    <span>% Wallet Usage</span>
                    <span className="text-slate-600">Default: 10%</span>
                  </label>
                  <div className="relative mb-2">
                    <input 
                      type="text"
                      value={walletUsage}
                      onChange={(e) => setWalletUsage(e.target.value)}
                      className="w-full bg-[#14161a] border border-slate-800 rounded-lg p-3 text-white outline-none focus:border-cyan-500/50"
                    />
                  </div>
                  <div className="flex gap-2">
                    {popularWallet.map(w => (
                      <button 
                        key={w}
                        onClick={() => setWalletUsage(w)}
                        className={`flex-1 text-[10px] font-bold py-1.5 rounded border transition-colors cursor-pointer ${walletUsage === w ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400' : 'bg-transparent border-slate-800 text-slate-500 hover:text-slate-300'}`}
                      >
                        {w}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

            </div>

            {/* Actions */}
            <div className="mt-8 flex flex-col gap-3">
              <button 
                onClick={handleCopy}
                className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-black text-sm p-4 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-[0_0_20px_rgba(234,179,8,0.2)] cursor-pointer"
              >
                <Zap size={18} className="fill-black" /> GENERATE SIGNAL
              </button>
              
              <div className="flex gap-3">
                <button 
                  onClick={handleNextSignal}
                  className="flex-1 bg-transparent border border-yellow-500/30 text-yellow-500 hover:bg-yellow-500/10 font-bold text-xs p-3 rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Target size={16} /> NEXT SIGNAL
                </button>
                <button 
                  onClick={handleClear}
                  className="flex-1 bg-transparent border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800 font-bold text-xs p-3 rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <X size={16} /> CLEAR
                </button>
              </div>
            </div>

          </div>

          {/* RIGHT PANEL: WhatsApp Output */}
          <div className="flex-1 p-6 lg:w-1/2 flex flex-col h-[500px] lg:h-auto">
            <div className="flex items-center justify-between mb-4 bg-slate-900/50 p-3 rounded-xl border border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <div className="w-5 h-5 rounded-md border-2 border-emerald-500 text-emerald-500 flex items-center justify-center text-[10px]">W</div>
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">WHATSAPP OUTPUT</h3>
                  <p className="text-xs text-slate-500">Ready to broadcast</p>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-black/40 border border-slate-800 rounded-lg p-1">
                <button className="p-1.5 rounded bg-slate-800 text-yellow-500"><Eye size={14} /></button>
                <button className="p-1.5 rounded hover:bg-slate-800 text-slate-500"><Edit2 size={14} /></button>
              </div>
            </div>

            <div className="flex items-center gap-4 text-[10px] font-mono text-yellow-500 bg-black/40 p-2 rounded-lg border border-slate-800 mb-4 px-4">
              <span className="font-bold flex-1">Signal {getSignalNumberStr()}</span>
              <span className="text-slate-500 border border-slate-700 px-2 py-0.5 rounded">{generatedText.length} chars</span>
              <span className="text-slate-500 border border-slate-700 px-2 py-0.5 rounded">{generatedText.split(/\s+/).filter(w => w.length > 0).length} words</span>
              <span className="text-slate-500 border border-slate-700 px-2 py-0.5 rounded">{generatedText.split('\n').length} lines</span>
            </div>

            <div className="flex-1 bg-[#101a1c] border border-slate-800 rounded-xl overflow-hidden flex flex-col shadow-inner relative">
              <div className="bg-[#1b262a] border-b border-slate-800 p-2 px-4 flex justify-between items-center text-[10px]">
                <span className="text-emerald-400 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> WhatsApp Message Preview</span>
                <span className="text-slate-500">Today</span>
              </div>
              
              <div className="flex-1 p-4 overflow-y-auto no-scrollbar font-mono text-sm text-slate-200 whitespace-pre-wrap leading-relaxed relative z-10">
                {generatedText}
              </div>
              
              <div className="absolute bottom-2 right-4 text-[10px] text-emerald-500 flex items-center gap-1 z-20">
                Just now <Check size={12} className="inline" /><Check size={12} className="inline -ml-2" />
              </div>
            </div>

            <div className="flex gap-4 mt-6">
              <button 
                onClick={handleCopy}
                className="flex-1 bg-yellow-500 hover:bg-yellow-400 text-black font-black text-sm p-4 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-[0_0_15px_rgba(234,179,8,0.2)] cursor-pointer"
              >
                <Copy size={18} /> COPY SIGNAL
              </button>
              <button 
                onClick={handleShare}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm p-4 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-[0_0_15px_rgba(5,150,105,0.3)] cursor-pointer"
              >
                <Share2 size={18} /> SHARE ON WHATSAPP
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
