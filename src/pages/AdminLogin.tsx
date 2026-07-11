import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ShieldAlert } from 'lucide-react';
import { API_BASE } from '../config/api';

export function AdminLogin() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    try {
      const res = await fetch(API_BASE + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      
      if (!res.ok) {
        setError(data.error || 'Login failed');
        return;
      }
      
      if (data.user.role !== 'admin') {
        setError('Unauthorized: You are not an Admin');
        return;
      }
      
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      
      setSuccess('CEO login successful! Redirecting...');
      setTimeout(() => {
        navigate('/ceo');
      }, 1500);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#030712] relative overflow-hidden font-sans">
      {/* Neon glowing orbs background (Red theme for CEO) */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-red-600/20 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-[100px] pointer-events-none" />

      <form 
        onSubmit={handleLogin} 
        className="relative z-10 p-8 rounded-2xl w-[400px] flex flex-col gap-6
                   bg-white/5 backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.37)]
                   transition-all duration-300 hover:border-red-500/50 hover:shadow-[0_0_30px_rgba(239,68,68,0.15)]"
      >
        <div className="flex flex-col items-center gap-2 mb-2">
          <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center border border-red-500/30">
            <ShieldAlert className="text-red-400 w-6 h-6" />
          </div>
          <h2 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-purple-400">
            CEO Portal
          </h2>
        </div>

        {error && (
          <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 p-3 rounded-lg text-center backdrop-blur-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="text-green-400 text-sm bg-green-500/10 border border-green-500/20 p-3 rounded-lg text-center backdrop-blur-sm">
            {success}
          </div>
        )}

        <div className="space-y-4">
          <div className="relative">
            <input 
              className="w-full bg-black/20 border border-white/10 rounded-lg p-3.5 text-white outline-none 
                         focus:border-red-500/80 focus:bg-black/40 focus:ring-1 focus:ring-red-500/50 transition-all placeholder:text-slate-500"
              placeholder="CEO Username" 
              value={username} 
              onChange={(e) => setUsername(e.target.value)} 
              required 
            />
          </div>

          <div className="relative">
            <input 
              className="w-full bg-black/20 border border-white/10 rounded-lg p-3.5 pr-12 text-white outline-none 
                         focus:border-red-500/80 focus:bg-black/40 focus:ring-1 focus:ring-red-500/50 transition-all placeholder:text-slate-500"
              type={showPassword ? "text" : "password"} 
              placeholder="CEO Password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              required 
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-400 transition-colors focus:outline-none"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
        </div>

        <button 
          type="submit" 
          disabled={!!success}
          className="w-full bg-gradient-to-r from-red-600 to-purple-600 hover:from-red-500 hover:to-purple-500 
                     text-white font-bold py-3.5 rounded-lg mt-2 shadow-[0_0_20px_rgba(239,68,68,0.3)]
                     hover:shadow-[0_0_30px_rgba(239,68,68,0.5)] transition-all active:scale-[0.98] disabled:opacity-50"
        >
          {success ? 'Granted Access!' : 'Access Dashboard'}
        </button>
      </form>
    </div>
  );
}
