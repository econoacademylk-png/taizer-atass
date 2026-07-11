import React, { useState, useEffect } from 'react';
import { useTrading } from '../stores/useTradingStore';

export const OBScanBox: React.FC = () => {
  const { indicators, vwbaScannedCoins, currentlyScanningCoin, nextScanTime } = useTrading();
  const [expandedCoin, setExpandedCoin] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<string>('');

  useEffect(() => {
    if (!nextScanTime) {
      setTimeRemaining('');
      return;
    }

    const updateTimer = () => {
      const diff = Math.max(0, nextScanTime - Date.now());
      if (diff === 0) {
        setTimeRemaining('Scanning...');
        return;
      }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeRemaining(`${m}m ${s}s`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [nextScanTime]);

  if (!indicators.showVWBA) return null;

  const displayCoins = (vwbaScannedCoins || []).slice(0, 35);

  const toggleCoin = (symbol: string) => {
    if (expandedCoin === symbol) {
      setExpandedCoin(null);
    } else {
      setExpandedCoin(symbol);
    }
  };

  const formatAge = (obTime: number) => {
    const diff = Date.now() - obTime;
    const minutes = Math.floor((diff / 1000 / 60) % 60);
    const totalHours = Math.floor(diff / (1000 * 60 * 60));
    
    if (totalHours > 0) return `${totalHours}h ${minutes}m ago`;
    return `${minutes}m ago`;
  };

  return (
    <div 
      style={{
        position: 'absolute',
        top: '10px',
        left: '10px',
        width: '180px',
        maxHeight: '300px', // Approx 3 inches
        backgroundColor: '#000000',
        border: '2px solid transparent',
        borderImage: 'linear-gradient(to bottom right, #ff00ff, #00ffff, #00ff00, #ffff00) 1',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: '"JetBrains Mono", monospace',
        overflow: 'hidden'
      }}
    >
      <div style={{ padding: '8px', borderBottom: '1px solid rgba(0,255,255,0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ color: '#00ffff', fontSize: '11px', fontWeight: 'bold' }}>SMC OB SCANS</div>
        {timeRemaining && (
          <div style={{ 
            color: '#ffff00', 
            fontSize: '9px', 
            fontFamily: '"JetBrains Mono", monospace',
            backgroundColor: 'rgba(255,255,0,0.1)',
            padding: '2px 4px',
            borderRadius: '3px'
          }}>
            Next: {timeRemaining}
          </div>
        )}
      </div>
      
      <div 
        style={{ 
          flex: 1, 
          overflowY: 'auto', 
          padding: '8px',
          // Custom scrollbar styling
          scrollbarWidth: 'thin',
          scrollbarColor: '#00ffff #000'
        }}
      >
        {displayCoins.length > 0 ? (
          displayCoins.map((coin, idx) => {
            const isBullish = coin.type === 'BULLISH';
            const color = isBullish ? '#00ff00' : '#ff0000';
            const isExpanded = expandedCoin === (coin.symbol + coin.timeframe);
            
            return (
              <div key={`${coin.symbol}-${idx}`} style={{ marginBottom: '8px' }}>
                <div 
                  onClick={() => toggleCoin(coin.symbol + coin.timeframe)}
                  style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    color: color, 
                    fontSize: '11px', 
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    padding: '4px',
                    backgroundColor: isExpanded ? 'rgba(255,255,255,0.1)' : 'transparent',
                    borderRadius: '4px',
                    transition: 'background-color 0.2s'
                  }}
                >
                  <span>{coin.symbol} <span style={{ color: '#888', fontSize: '9px' }}>[{coin.timeframe}]</span></span>
                  <span>{isBullish ? '🟢' : '🔴'}</span>
                </div>
                
                {isExpanded && (
                  <div style={{ 
                    padding: '6px', 
                    marginTop: '2px', 
                    backgroundColor: 'rgba(255,255,255,0.05)', 
                    borderRadius: '4px',
                    fontSize: '10px',
                    color: '#aaaaaa'
                  }}>
                    <div style={{ marginBottom: '4px' }}>
                      <span style={{ color: '#fff' }}>Zone: </span> 
                      {coin.obPriceStart.toFixed(4)} - {coin.obPriceEnd.toFixed(4)}
                    </div>
                    <div>
                      <span style={{ color: '#fff' }}>Age: </span> 
                      {formatAge(coin.obTime)}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '10px', fontStyle: 'italic' }}>
            No Active OBs found.
          </div>
        )}
      </div>

      <div style={{ 
        padding: '8px', 
        borderTop: '1px dashed rgba(255,255,255,0.2)',
        fontSize: '10px',
        color: 'rgba(255,255,255,0.6)',
        fontStyle: 'italic',
        backgroundColor: '#050505'
      }}>
        {currentlyScanningCoin ? (
          <div>
            <div>Scanning:</div>
            <div style={{ color: '#fff', fontWeight: 'bold' }}>{currentlyScanningCoin}</div>
          </div>
        ) : (
          <div>Waiting for next batch...</div>
        )}
      </div>
    </div>
  );
};
