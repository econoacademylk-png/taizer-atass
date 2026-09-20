/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { TradingProvider, useTrading } from './stores/useTradingStore';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { ChartContainer } from './components/ChartContainer';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AlertTriangle, BarChart2, List, Settings, PenTool } from 'lucide-react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';

import { useSMCScanner } from './hooks/useSMCScanner';
import { useLEZScanner } from './hooks/useLEZScanner';
import { LEZAlertToast } from './components/LEZAlertToast';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { AdminPanel } from './pages/AdminPanel';
import { AdminLogin } from './pages/AdminLogin';
import { SubmitPayment } from './pages/SubmitPayment';
import { API_BASE } from './config/api';

function DashboardContent() {
  const { setIndicators, setSMC, error, mobileTab, setMobileTab, setGlobalConfig } = useTrading();
  useSMCScanner();
  useLEZScanner();
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        navigate('/login');
        return;
      }
      setIsAuthenticated(true);
      try {
        const res = await fetch(API_BASE + '/api/settings');
        if (res.ok) {
          const data = await res.json();
          if (!data.indicatorsEnabled) {
            // Force disable ALL indicators if globally disabled
            setIndicators((prev: any) => {
              const off: any = { ...prev };
              Object.keys(off).forEach(k => off[k] = false);
              return off;
            });
            setSMC((prev: any) => {
              const off: any = { ...prev };
              Object.keys(off).forEach(k => off[k] = false);
              return off;
            });
          } else if (data.individualIndicators) {
            // Selectively disable based on individual switches
            setIndicators((prev: any) => {
              const next: any = { ...prev };
              Object.keys(next).forEach(k => {
                if (data.individualIndicators[k] === false) {
                  next[k] = false;
                }
              });
              return next;
            });
            setSMC((prev: any) => {
              const next: any = { ...prev };
              Object.keys(next).forEach(k => {
                if (data.individualIndicators[k] === false) {
                  next[k] = false;
                }
              });
              return next;
            });
          }
          setGlobalConfig(data);
        }
      } catch (err) {}
    };
    checkAuth();

    const interval = setInterval(() => {
      checkAuth();
    }, 15000); // Poll every 15 seconds

    return () => clearInterval(interval);
  }, [navigate]);

  if (isAuthenticated === null) {
    return <div className="flex w-screen h-screen bg-[#07090b] items-center justify-center text-cyan-400">Loading...</div>;
  }

  return (
    <div className="flex flex-col h-[100dvh] w-screen bg-[#07090b] text-slate-300 overflow-hidden select-none font-sans">
      {/* 1. TOP UTILITY HEADER */}
      <Header />

      {/* LEZ Live Signal Real-time Alert Toast */}
      <LEZAlertToast />

      {/* 2. INNER WORKSPACE WRAPPER */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0 relative">
        {/* Left Vertical Tools Toolbar (Handles its own mobile view) */}
        <Sidebar />

        {/* Central Area: Chart Panel */}
        <div className="flex-1 min-w-0 min-h-0 relative">
          {error ? (
            <div className="flex flex-col items-center justify-center w-full h-full bg-[#07090b] text-red-500 font-sans p-8 z-50">
              <AlertTriangle size={64} className="mb-4 text-red-500 opacity-80" />
              <h1 className="text-2xl font-bold mb-2">Data Fetch Error</h1>
              <p className="text-sm text-red-400 opacity-80 max-w-lg text-center mb-6">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md transition-colors"
              >
                Retry Connection
              </button>
            </div>
          ) : (
            <ErrorBoundary>
              <ChartContainer />
            </ErrorBoundary>
          )}
        </div>
      </div>

      {/* 3. MOBILE BOTTOM NAVIGATION (Hidden on Desktop) */}
      <div className="md:hidden flex items-center justify-around bg-slate-950 border-t border-slate-900/80 h-14 shrink-0 pb-safe">
        <button
          onClick={() => setMobileTab('chart')}
          className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${
            !mobileTab || mobileTab === 'chart' ? 'text-cyan-400' : 'text-slate-500'
          }`}
        >
          <BarChart2 className="w-5 h-5" />
          <span className="text-[10px] font-bold tracking-wider">Chart</span>
        </button>
        <button
          onClick={() => setMobileTab(mobileTab === 'indicators' ? null : 'indicators')}
          className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${
            mobileTab === 'indicators' ? 'text-cyan-400' : 'text-slate-500'
          }`}
        >
          <List className="w-5 h-5" />
          <span className="text-[10px] font-bold tracking-wider">Indicators</span>
        </button>
        <button
          onClick={() => setMobileTab(mobileTab === 'drawings' ? null : 'drawings')}
          className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${
            mobileTab === 'drawings' ? 'text-cyan-400' : 'text-slate-500'
          }`}
        >
          <PenTool className="w-5 h-5" />
          <span className="text-[10px] font-bold tracking-wider">Drawings</span>
        </button>
        <button
          onClick={() => setMobileTab(mobileTab === 'settings' ? null : 'settings')}
          className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${
            mobileTab === 'settings' ? 'text-cyan-400' : 'text-slate-500'
          }`}
        >
          <Settings className="w-5 h-5" />
          <span className="text-[10px] font-bold tracking-wider">Settings</span>
        </button>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <TradingProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/submit-payment" element={<SubmitPayment />} />
          <Route path="/ceo-login" element={<AdminLogin />} />
          <Route path="/ceo" element={<ErrorBoundary><AdminPanel /></ErrorBoundary>} />
          <Route path="/" element={<DashboardContent />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </BrowserRouter>
    </TradingProvider>
  );
}
