import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, Settings, User as UserIcon, CheckCircle, 
  XCircle, Clock, ShieldAlert, LogOut, ArrowLeft, CreditCard, Activity, Power, Zap
} from 'lucide-react';
import { SignalFormModal } from '../components/SignalFormModal';
import { API_BASE } from '../config/api';

type Tab = 'dashboard' | 'users' | 'settings' | 'profile';

const INDICATOR_LIST = [
  { key: 'showEMA', name: 'EMA' },
  { key: 'showSMA', name: 'SMA' },
  { key: 'showVWAP', name: 'VWAP' },
  { key: 'showMPAS', name: 'MPAS' },
  { key: 'showVolumeProfile', name: 'Volume Profile' },
  { key: 'showTPO', name: 'TPO' },
  { key: 'showDeltaCVD', name: 'Delta CVD' },
  { key: 'showStats', name: 'Stats' },
  { key: 'showDOMLiquidity', name: 'DOM Liquidity' },
  { key: 'showWickDelta', name: 'Wick Delta' },
  { key: 'showDelta', name: 'Delta' },
  { key: 'showDDelta', name: 'D-Delta' },
  { key: 'showDeltaV', name: 'Delta-V' },
  { key: 'showIMB', name: 'Imbalances' },
  { key: 'showWhales', name: 'Whale Tracking' },
  { key: 'showRSI', name: 'RSI' },
  { key: 'showVPT', name: 'VPT' },
  { key: 'showHeatmap', name: 'Heatmap' },
  { key: 'showSTK', name: 'STK' },
  { key: 'showLiveDOMProfile', name: 'Live DOM Profile' },
  { key: 'showMTF', name: 'MTF' },
  { key: 'showPivot', name: 'Pivot' },
  { key: 'showAbs', name: 'Abs' },
  { key: 'showDVol', name: 'DVol' },
  { key: 'showDOpen', name: 'DOpen' },
  { key: 'showSess', name: 'Session' },
  { key: 'showCRT', name: 'CRT' },
  { key: 'showEW', name: 'EW' },
  { key: 'showSK', name: 'SK' },
  { key: 'showWYC', name: 'WYC' },
  { key: 'showVWBA', name: 'VWBA / Scanner' },
  { key: 'showFVG', name: 'Fair Value Gaps' },
  { key: 'showBOS', name: 'Break of Structure' },
  { key: 'showCHOCH', name: 'Change of Character' },
  { key: 'showOB', name: 'Order Blocks' },
  { key: 'showMitigation', name: 'Mitigation' },
  { key: 'showLiquiditySweeps', name: 'Liquidity Sweeps' },
  { key: 'showPremiumDiscount', name: 'Premium Discount' },
  { key: 'showHVBuy', name: 'HV Buy' },
  { key: 'showHVSell', name: 'HV Sell' },
];

export function AdminPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [profileForm, setProfileForm] = useState({ username: '', email: '', password: '' });
  const [profileStatus, setProfileStatus] = useState({ loading: false, error: '', success: '' });
  const [users, setUsers] = useState<any[]>([]);
  const [onlineUsersCount, setOnlineUsersCount] = useState<number>(0);  
  const [onlineUsersList, setOnlineUsersList] = useState<any[]>([]);
  const [globalSettings, setGlobalSettings] = useState<any>({
    indicatorsEnabled: false,
    individualIndicators: {},
    usdtTrc20Address: '',
    usdtBep20Address: '',
    bankDetails: '',
    monthlyPrice: 50,
    lifetimePrice: 500
  });

  const [approvingUserId, setApprovingUserId] = useState<string | null>(null);
  const [expiryDaysInput, setExpiryDaysInput] = useState<number>(30);

  const [isSignalFormOpen, setIsSignalFormOpen] = useState(false);

  const [pendingSearch, setPendingSearch] = useState('');
  const [registeredSearch, setRegisteredSearch] = useState('');

  const [error, setError] = useState('');
  const navigate = useNavigate();

  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  useEffect(() => {
    if (!token || user.role !== 'admin') {
      navigate('/ceo-login');
      return;
    }
    fetchUsers();
    fetchSettings();
    fetchProfile();
    fetchOnlineUsers();
    
    const interval = setInterval(() => {
      fetchUsers();
      fetchOnlineUsers();
    }, 10000);
    return () => clearInterval(interval);
  }, [token, navigate, user.role]);

  const handleAuthError = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/ceo-login?expired=true');
  };

  const fetchOnlineUsers = async () => {
    try {
      const res = await fetch(API_BASE + '/api/admin/onlineUsers', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setOnlineUsersCount(data.activeCount || 0);
        setOnlineUsersList(data.users || []);
      } else if (res.status === 401 || res.status === 403) {
        handleAuthError();
      }
    } catch (err) {}
  };

  const fetchProfile = async () => {
    try {
      const res = await fetch(API_BASE + '/api/admin/profile', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setProfileForm(prev => ({ ...prev, username: data.username, email: data.email || '' }));
      } else if (res.status === 401 || res.status === 403) {
        handleAuthError();
      }
    } catch (err) {}
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch(API_BASE + '/api/admin/users', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setUsers(await res.json());
        setError('');
      } else {
        const data = await res.json().catch(() => ({}));
        if (res.status === 401 || res.status === 403) {
          handleAuthError();
          return;
        }
        setError(data.error || 'Failed to fetch users');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch(API_BASE + '/api/settings');
      if (res.ok) {
        const data = await res.json();
        setGlobalSettings(data);
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleApprove = async (userId: string) => {
    if (!expiryDaysInput || expiryDaysInput <= 0) {
      alert("Please enter a valid number of days.");
      return;
    }
    
    const d = new Date();
    d.setDate(d.getDate() + Number(expiryDaysInput));
    const expiryDateStr = d.toISOString();

    try {
      const res = await fetch(API_BASE + `/api/admin/users/${userId}/approve`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ expiryDate: expiryDateStr })
      });
      if (!res.ok) throw new Error('Failed to approve user');
      setUsers(users.map(u => u._id === userId ? { ...u, approved: true, expiryDate: expiryDateStr } : u));
      setApprovingUserId(null);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleReject = async (userId: string) => {
    if (!window.confirm("Are you sure you want to reject and delete this user?")) return;
    
    try {
      const res = await fetch(API_BASE + `/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to reject user');
      setUsers(users.filter(u => u._id !== userId));
    } catch (err: any) {
      alert(err.message);
    }
  };

  const saveSettings = async (newSettings: any) => {
    try {
      const res = await fetch(API_BASE + '/api/admin/settings', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newSettings)
      });
      if (res.ok) {
        setGlobalSettings(newSettings);
      }
    } catch (err) {}
  };

  const toggleMasterSwitch = async () => {
    try {
      const newSettings = { ...globalSettings, indicatorsEnabled: !globalSettings.indicatorsEnabled };
      const res = await fetch(API_BASE + '/api/admin/settings', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify(newSettings)
      });
      if (res.ok) {
        setGlobalSettings(newSettings);
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  const toggleIndividualIndicator = async (key: string) => {
    try {
      const currentVal = globalSettings.individualIndicators?.[key] ?? false;
      const updatedIndicators = {
        ...globalSettings.individualIndicators,
        [key]: !currentVal
      };

      const res = await fetch(API_BASE + '/api/admin/settings', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ ...globalSettings, individualIndicators: updatedIndicators })
      });
      if (res.ok) {
        fetchSettings();
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/ceo-login');
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileStatus({ loading: true, error: '', success: '' });
    try {
      const res = await fetch(API_BASE + '/api/admin/profile', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify(profileForm)
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Failed to update profile');
      
      setProfileStatus({ loading: false, error: '', success: 'Profile updated! Please log in again.' });
      setTimeout(() => {
        handleLogout();
      }, 2000);
    } catch (err: any) {
      setProfileStatus({ loading: false, error: err.message, success: '' });
    }
  };

  const pendingUsers = users
    .filter(u => !u.approved)
    .filter(u => {
      if (!pendingSearch) return true;
      const s = pendingSearch.toLowerCase();
      return (
        (u.paymentMethod || '').toLowerCase().includes(s) ||
        (u.transactionId || '').toLowerCase().includes(s) ||
        (u.firstName || '').toLowerCase().includes(s) ||
        (u.lastName || '').toLowerCase().includes(s) ||
        (u.username || '').toLowerCase().includes(s) ||
        (u.email || '').toLowerCase().includes(s)
      );
    });

  const approvedUsers = users
    .filter(u => u.approved)
    .filter(u => {
      if (!registeredSearch) return true;
      const s = registeredSearch.toLowerCase();
      return (
        (u.selectedPackage || '').toLowerCase().includes(s) ||
        (u.firstName || '').toLowerCase().includes(s) ||
        (u.lastName || '').toLowerCase().includes(s) ||
        (u.username || '').toLowerCase().includes(s) ||
        (u.email || '').toLowerCase().includes(s)
      );
    });

  return (
    <div className="flex h-screen bg-[#030712] text-slate-300 font-sans overflow-hidden relative">
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-600/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[150px] pointer-events-none" />

      <aside className="w-72 bg-white/5 border-r border-white/10 backdrop-blur-xl flex flex-col relative z-10">
        <div className="p-6 border-b border-white/5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.4)]">
            <ShieldAlert className="text-white w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400">Tizer CEO</h2>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">CEO Panel</p>
          </div>
        </div>

        <nav className="flex-1 p-4 flex flex-col gap-2">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center gap-3 w-full p-3 rounded-lg transition-all duration-300 font-medium ${
              activeTab === 'dashboard' 
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.15)]' 
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200 border border-transparent'
            }`}
          >
            <LayoutDashboard size={18} />
            Overview
          </button>
          
          <button 
            onClick={() => setActiveTab('users')}
            className={`flex items-center justify-between w-full p-3 rounded-lg transition-all duration-300 font-medium ${
              activeTab === 'users' 
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.15)]' 
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200 border border-transparent'
            }`}
          >
            <div className="flex items-center gap-3">
              <Users size={18} />
              User Management
            </div>
            {pendingUsers.length > 0 && (
              <span className="bg-red-500/20 text-red-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-red-500/30">
                {pendingUsers.length} NEW
              </span>
            )}
          </button>

          <button 
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-bold ${
              activeTab === 'settings' 
                ? 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-400 border border-purple-500/30' 
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
            }`}
          >
            <Settings size={20} className={activeTab === 'settings' ? 'text-purple-400' : ''} /> Global Settings
          </button>
          <button 
            onClick={() => setActiveTab('profile')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-bold ${
              activeTab === 'profile' 
                ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-400 border border-emerald-500/30' 
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
            }`}
          >
            <UserIcon size={20} className={activeTab === 'profile' ? 'text-emerald-400' : ''} /> CEO Profile
          </button>

          {/* Divider */}
          <div className="w-full h-[1px] bg-white/5 my-1" />

          <button 
            onClick={() => setIsSignalFormOpen(true)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-bold text-yellow-400 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/30 shadow-[0_0_15px_rgba(234,179,8,0.15)]"
          >
            <Zap size={20} className="fill-yellow-400" /> Signal Generator
          </button>
        </nav>

        <div className="p-4 border-t border-white/5 flex flex-col gap-2">
          <button 
            onClick={() => navigate('/')} 
            className="flex items-center justify-center gap-2 w-full p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-slate-300 transition-colors"
          >
            <ArrowLeft size={16} />
            Back to Chart
          </button>
          <button 
            onClick={handleLogout} 
            className="flex items-center justify-center gap-2 w-full p-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 rounded-lg transition-colors"
          >
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </aside>

      <main className="flex-1 p-8 overflow-y-auto relative z-10">
        {error && (
          <div className="mb-6 text-red-400 text-sm bg-red-500/10 border border-red-500/20 p-4 rounded-xl backdrop-blur-md flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <ShieldAlert className="w-5 h-5 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-300 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer"
            >
              Log In Again
            </button>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h1 className="text-3xl font-bold text-white mb-8">System Overview</h1>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white/5 border border-white/10 p-6 rounded-2xl backdrop-blur-xl hover:border-cyan-500/30 transition-all duration-300 group">
                <div className="w-12 h-12 bg-cyan-500/10 rounded-full flex items-center justify-center mb-4 group-hover:bg-cyan-500/20 transition-colors">
                  <Users className="text-cyan-400 w-6 h-6" />
                </div>
                <div className="text-slate-400 text-sm font-medium mb-1">Total Registered Users</div>
                <div className="text-4xl font-bold text-white">{approvedUsers.length}</div>
              </div>
              
              <div className="bg-white/5 border border-white/10 p-6 rounded-2xl backdrop-blur-xl hover:border-purple-500/30 transition-all duration-300 group">
                <div className="w-12 h-12 bg-purple-500/10 rounded-full flex items-center justify-center mb-4 group-hover:bg-purple-500/20 transition-colors">
                  <Clock className="text-purple-400 w-6 h-6" />
                </div>
                <div className="text-slate-400 text-sm font-medium mb-1">Pending Approvals</div>
                <div className="text-4xl font-bold text-white">{pendingUsers.length}</div>
              </div>

              <div className="bg-white/5 border border-white/10 p-6 rounded-2xl backdrop-blur-xl hover:border-blue-500/30 transition-all duration-300 group">
                <div className="w-12 h-12 bg-blue-500/10 rounded-full flex items-center justify-center mb-4 group-hover:bg-blue-500/20 transition-colors">
                  <Activity className="text-blue-400 w-6 h-6" />
                </div>
                <div className="text-slate-400 text-sm font-medium mb-1">Online Users (Live Chart)</div>
                <div className="text-4xl font-bold text-white">{onlineUsersCount}</div>
              </div>

              <div className="bg-white/5 border border-white/10 p-6 rounded-2xl backdrop-blur-xl hover:border-green-500/30 transition-all duration-300 group">
                <div className="w-12 h-12 bg-green-500/10 rounded-full flex items-center justify-center mb-4 group-hover:bg-green-500/20 transition-colors">
                  <Power className="text-green-400 w-6 h-6" />
                </div>
                <div className="text-slate-400 text-sm font-medium mb-1">Master Indicator Switch</div>
                <div className="text-2xl font-bold text-white mt-2">
                  {globalSettings.indicatorsEnabled ? (
                    <span className="text-green-400 flex items-center gap-2"><CheckCircle size={20}/> ACTIVE</span>
                  ) : (
                    <span className="text-red-400 flex items-center gap-2"><Power size={20}/> DISABLED</span>
                  )}
                </div>
              </div>
            </div>

            {/* Live Online Users Section */}
            <div className="mt-8 bg-white/5 border border-white/10 p-6 rounded-2xl backdrop-blur-xl">
              <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <Activity className="text-blue-400 w-5 h-5" />
                Live Online Users
              </h2>
              {onlineUsersList.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {onlineUsersList.map(user => (
                    <div key={user.id} className="flex items-center gap-3 bg-black/20 p-3 rounded-xl border border-blue-500/20">
                      <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/30">
                        <UserIcon className="text-blue-400 w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-200">
                          {user.username}
                        </div>
                        <div className="text-xs text-slate-500 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                          Online
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-slate-500 text-sm py-4">No users are currently online.</div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 flex flex-col h-full space-y-8">
            <h1 className="text-3xl font-bold text-white mb-2">User Management</h1>
            
            <div>
              <h2 className="text-xl font-bold text-orange-400 mb-4 flex items-center gap-2">
                <Clock size={20} /> Pending Approvals ({pendingUsers.length})
              </h2>
              <div className="bg-white/5 border border-orange-500/20 rounded-2xl backdrop-blur-xl flex flex-col overflow-hidden shadow-[0_0_15px_rgba(249,115,22,0.1)]">
                <div className="p-4 border-b border-orange-500/20 bg-black/20 font-bold text-slate-400 text-sm grid grid-cols-12 gap-4 items-center">
                  <div className="col-span-3">User Details</div>
                  <div className="col-span-3">Contact Info</div>
                  <div className="col-span-3 text-orange-300 flex items-center gap-2">
                    Payment Details
                    <input 
                      type="text" 
                      placeholder="Search..." 
                      value={pendingSearch}
                      onChange={(e) => setPendingSearch(e.target.value)}
                      className="bg-black/40 border border-orange-500/30 rounded px-2 py-0.5 text-xs text-white outline-none focus:border-orange-500 w-24 font-normal"
                    />
                  </div>
                  <div className="col-span-3 text-right">Action</div>
                </div>
                <div className="p-4 flex flex-col gap-3">
                  {pendingUsers.map(u => (
                    <div key={u._id} className="grid grid-cols-12 gap-4 items-center bg-black/20 p-4 rounded-xl border border-orange-500/10 hover:border-orange-500/30 transition-colors group">
                      <div className="col-span-3">
                        <div className="font-bold text-white group-hover:text-cyan-400 transition-colors">{u.firstName} {u.lastName}</div>
                        <div className="text-xs text-slate-500">@{u.username} • <span className="uppercase text-cyan-600 font-bold">{u.role}</span></div>
                      </div>
                      <div className="col-span-3">
                        <div className="text-sm text-slate-300">{u.email}</div>
                        <div className="text-xs text-slate-500">{u.phone}</div>
                      </div>
                      <div className="col-span-3 bg-orange-500/10 p-2 rounded-lg border border-orange-500/20">
                        <div className="text-xs text-orange-200 flex items-center gap-1 mb-1">
                          <CreditCard size={12} /> {u.paymentMethod || 'N/A'}
                          <span className="ml-auto text-[10px] bg-orange-500/20 px-1.5 py-0.5 rounded text-orange-300 font-bold border border-orange-500/20">
                            {u.selectedPackage}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 mb-1">
                          Trx ID: <span className="text-white font-mono break-all">{u.transactionId || 'N/A'}</span>
                        </div>
                        {u.paymentReceiptUrl && (
                          <a 
                            href={u.paymentReceiptUrl} 
                            target="_blank" 
                            rel="noreferrer"
                            className="inline-block mt-1 text-xs text-cyan-400 hover:text-cyan-300 underline bg-cyan-500/10 px-2 py-1 rounded"
                          >
                            View Receipt
                          </a>
                        )}
                      </div>
                      <div className="col-span-3 flex justify-end gap-2 items-start">
                        <button 
                          onClick={() => handleReject(u._id)}
                          className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 px-3 py-1.5 rounded-lg font-bold text-xs transition-all flex items-center gap-1.5"
                        >
                          <XCircle size={14} /> Reject
                        </button>
                        
                        {approvingUserId === u._id ? (
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                              <input 
                                type="number" 
                                min="1"
                                className="w-16 bg-black/40 border border-cyan-500/50 rounded p-1 text-xs text-white text-center"
                                value={expiryDaysInput}
                                onChange={(e) => setExpiryDaysInput(Number(e.target.value))}
                              />
                              <span className="text-xs text-slate-400">Days</span>
                            </div>
                            <div className="flex gap-1">
                              <button 
                                onClick={() => handleApprove(u._id)}
                                className="bg-cyan-500 hover:bg-cyan-600 text-white px-2 py-1 rounded text-xs font-bold"
                              >Confirm</button>
                              <button 
                                onClick={() => setApprovingUserId(null)}
                                className="bg-slate-700 hover:bg-slate-600 text-white px-2 py-1 rounded text-xs"
                              >Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <button 
                            onClick={() => {
                              setApprovingUserId(u._id);
                              setExpiryDaysInput(u.selectedPackage === 'Lifetime' ? 36500 : 30);
                            }}
                            className="bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 px-3 py-1.5 rounded-lg font-bold text-xs transition-all flex items-center gap-1.5"
                          >
                            <CheckCircle size={14} /> Approve
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {pendingUsers.length === 0 && <div className="text-slate-500 text-center py-8">No pending registrations.</div>}
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-xl font-bold text-cyan-400 mb-4 flex items-center gap-2">
                <CheckCircle size={20} /> Registered Users ({approvedUsers.length})
              </h2>
              <div className="bg-white/5 border border-cyan-500/20 rounded-2xl backdrop-blur-xl flex flex-col overflow-hidden">
                <div className="p-4 border-b border-cyan-500/20 bg-black/20 font-bold text-slate-400 text-sm grid grid-cols-12 gap-4 items-center">
                  <div className="col-span-3">User Details</div>
                  <div className="col-span-3">Contact Info</div>
                  <div className="col-span-4 flex items-center gap-2">
                    Membership
                    <input 
                      type="text" 
                      placeholder="Search..." 
                      value={registeredSearch}
                      onChange={(e) => setRegisteredSearch(e.target.value)}
                      className="bg-black/40 border border-cyan-500/30 rounded px-2 py-0.5 text-xs text-white outline-none focus:border-cyan-500 w-24 font-normal"
                    />
                  </div>
                  <div className="col-span-2 text-right">Status</div>
                </div>
                <div className="p-4 flex flex-col gap-3">
                  {approvedUsers.map(u => (
                    <div key={u._id} className="grid grid-cols-12 gap-4 items-center bg-black/20 p-4 rounded-xl border border-cyan-500/10 hover:border-cyan-500/30 transition-colors group">
                      <div className="col-span-3">
                        <div className="font-bold text-white text-sm">{u.firstName} {u.lastName}</div>
                        <div className="text-xs text-cyan-400">@{u.username}</div>
                      </div>
                      <div className="col-span-3">
                        <div className="text-sm text-slate-300">{u.email}</div>
                        <div className="text-xs text-slate-500">{u.phone}</div>
                      </div>
                      <div className="col-span-4 flex items-center gap-4">
                        <div className="bg-purple-500/10 text-purple-400 px-2 py-1 rounded text-xs font-bold border border-purple-500/20">
                          {u.selectedPackage || 'Standard'}
                        </div>
                        {u.expiryDate && (
                          <div className={`text-xs px-2 py-1 rounded border font-bold ${new Date(u.expiryDate) < new Date() ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-green-500/10 text-green-400 border-green-500/20'}`}>
                            Expires: {new Date(u.expiryDate).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                      <div className="col-span-2 flex justify-end">
                        <span className="flex items-center gap-1.5 text-green-400 text-sm bg-green-500/10 border border-green-500/20 px-3 py-1.5 rounded-lg">
                          <CheckCircle size={16} /> Active
                        </span>
                      </div>
                    </div>
                  ))}
                  {approvedUsers.length === 0 && <div className="text-slate-500 text-center py-8">No approved users yet.</div>}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h1 className="text-3xl font-bold text-white mb-8">Indicator & Payment Settings</h1>
            
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl mb-8 shadow-[0_0_20px_rgba(16,185,129,0.1)]">
              <h2 className="text-xl font-bold text-emerald-400 mb-6 flex items-center gap-2">
                <CreditCard size={20} /> Payment & Packages Configuration
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-slate-300 mb-1">USDT TRC20 Address</label>
                    <input 
                      type="text"
                      className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-white focus:border-emerald-500/50 outline-none"
                      value={globalSettings.usdtTrc20Address || ''}
                      onChange={(e) => setGlobalSettings({...globalSettings, usdtTrc20Address: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-300 mb-1">USDT BEP20 Address</label>
                    <input 
                      type="text"
                      className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-white focus:border-emerald-500/50 outline-none"
                      value={globalSettings.usdtBep20Address || ''}
                      onChange={(e) => setGlobalSettings({...globalSettings, usdtBep20Address: e.target.value})}
                    />
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-slate-300 mb-1">Bank Details (Account No, Bank Name)</label>
                    <textarea 
                      className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-white focus:border-emerald-500/50 outline-none resize-none h-20"
                      value={globalSettings.bankDetails || ''}
                      onChange={(e) => setGlobalSettings({...globalSettings, bankDetails: e.target.value})}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-slate-300 mb-1">1 Month Price ($)</label>
                      <input 
                        type="number"
                        className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-white focus:border-emerald-500/50 outline-none"
                        value={globalSettings.monthlyPrice || 50}
                        onChange={(e) => setGlobalSettings({...globalSettings, monthlyPrice: Number(e.target.value)})}
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-300 mb-1">Lifetime Price ($)</label>
                      <input 
                        type="number"
                        className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-white focus:border-emerald-500/50 outline-none"
                        value={globalSettings.lifetimePrice || 500}
                        onChange={(e) => setGlobalSettings({...globalSettings, lifetimePrice: Number(e.target.value)})}
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-6 flex justify-end">
                <button 
                  onClick={() => saveSettings(globalSettings)}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2 px-6 rounded-lg transition-colors flex items-center gap-2"
                >
                  <CheckCircle size={18} /> Save Payment Config
                </button>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl mb-8">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Power className={globalSettings.indicatorsEnabled ? "text-cyan-400" : "text-slate-500"} />
                    Master System Switch
                  </h2>
                  <p className="text-slate-400 text-sm mt-1">Enable or disable all indicators system-wide</p>
                </div>
                <button
                  onClick={toggleMasterSwitch}
                  className={`w-14 h-8 rounded-full transition-colors relative ${globalSettings.indicatorsEnabled ? 'bg-cyan-500' : 'bg-slate-700'}`}
                >
                  <div className={`w-6 h-6 rounded-full bg-white absolute top-1 transition-transform ${globalSettings.indicatorsEnabled ? 'translate-x-7' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>

            <div className={`transition-opacity duration-300 ${!globalSettings.indicatorsEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
              <h3 className="text-xl font-bold text-cyan-400 mb-4 flex items-center gap-2">
                Individual Indicator Toggles
              </h3>
              <p className="text-slate-400 text-sm mb-6">
                Turn specific features on or off for all users on the platform.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {INDICATOR_LIST.map((ind) => {
                  const isActive = globalSettings.individualIndicators?.[ind.key] ?? false;
                  
                  return (
                    <div 
                      key={ind.key}
                      onClick={() => toggleIndividualIndicator(ind.key)}
                      className={`cursor-pointer p-4 rounded-xl border transition-all duration-300 flex items-center justify-between group ${
                        isActive 
                          ? 'bg-cyan-500/10 border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.1)]' 
                          : 'bg-black/40 border-white/5 hover:border-white/10'
                      }`}
                    >
                      <div className="font-medium text-slate-200 group-hover:text-white transition-colors">
                        {ind.name}
                      </div>
                      <div className={`w-10 h-5 rounded-full relative transition-colors ${isActive ? 'bg-cyan-500' : 'bg-slate-700'}`}>
                        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${isActive ? 'left-[22px] shadow-[0_0_10px_rgba(255,255,255,0.8)]' : 'left-0.5'}`} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-black/20 border border-emerald-500/20 rounded-2xl p-6 backdrop-blur-md">
              <div className="flex items-center gap-3 mb-6 border-b border-emerald-500/20 pb-4">
                <UserIcon className="text-emerald-400 w-8 h-8" />
                <div>
                  <h3 className="text-2xl font-bold text-white">CEO Profile Settings</h3>
                  <p className="text-sm text-emerald-400/80">Update your login credentials</p>
                </div>
              </div>

              <form onSubmit={handleUpdateProfile} className="max-w-md space-y-4">
                {profileStatus.error && <div className="text-red-400 text-sm bg-red-500/10 p-3 rounded">{profileStatus.error}</div>}
                {profileStatus.success && <div className="text-green-400 text-sm bg-green-500/10 p-3 rounded">{profileStatus.success}</div>}
                
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Username</label>
                  <input 
                    type="text"
                    className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-white focus:border-emerald-500/50 outline-none"
                    value={profileForm.username}
                    onChange={(e) => setProfileForm({...profileForm, username: e.target.value})}
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Email</label>
                  <input 
                    type="email"
                    className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-white focus:border-emerald-500/50 outline-none"
                    value={profileForm.email}
                    onChange={(e) => setProfileForm({...profileForm, email: e.target.value})}
                  />
                </div>

                <div>
                  <label className="block text-sm text-slate-300 mb-1">New Password (leave blank to keep current)</label>
                  <input 
                    type="password"
                    className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-white focus:border-emerald-500/50 outline-none"
                    value={profileForm.password}
                    onChange={(e) => setProfileForm({...profileForm, password: e.target.value})}
                  />
                </div>

                <button 
                  type="submit"
                  disabled={profileStatus.loading}
                  className="mt-6 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold py-3 px-6 rounded-lg shadow-[0_0_20px_rgba(16,185,129,0.2)] hover:shadow-[0_0_30px_rgba(16,185,129,0.4)] transition-all w-full"
                >
                  {profileStatus.loading ? 'Updating...' : 'Save Changes'}
                </button>
                <p className="text-xs text-slate-500 text-center mt-4">
                  Note: Changing these details will log you out for security reasons.
                </p>
              </form>
            </div>
          </div>
        )}
      </main>

      <SignalFormModal 
        isOpen={isSignalFormOpen} 
        onClose={() => setIsSignalFormOpen(false)} 
      />
    </div>
  );
}

