import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { CreditCard, CheckCircle, ArrowRight, Clock } from 'lucide-react';
import { API_BASE } from '../config/api';

export function SubmitPayment() {
  const [searchParams] = useSearchParams();
  const username = searchParams.get('user') || '';
  const isPending = searchParams.get('status') === 'pending';
  const isExpired = searchParams.get('status') === 'expired';
  
  const [paymentMethod, setPaymentMethod] = useState('USDT (TRC20)');
  const [selectedPackage, setSelectedPackage] = useState('1 Month');
  const [transactionId, setTransactionId] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<any>(null);
  const [hasUsedFreeTrial, setHasUsedFreeTrial] = useState(false);
  const [isApproved, setIsApproved] = useState(false);
  const [isAwaitingApproval, setIsAwaitingApproval] = useState(isPending);

  React.useEffect(() => {
    fetch(API_BASE + '/api/settings')
      .then(res => res.json())
      .then(data => setSettings(data))
      .catch(console.error);
      
    if (username) {
      fetch(API_BASE + `/api/auth/user-status/${encodeURIComponent(username)}`)
        .then(res => res.json())
        .then(data => {
          if (data.hasUsedFreeTrial) {
            setHasUsedFreeTrial(true);
            if (selectedPackage === 'Free') setSelectedPackage('1 Month');
          }
          if (data.approved) {
            setIsApproved(true);
          }
        })
        .catch(console.error);
    }
  }, [username, selectedPackage]);

  React.useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (username && (isAwaitingApproval || isPending) && !isApproved) {
      interval = setInterval(() => {
        fetch(API_BASE + `/api/auth/user-status/${encodeURIComponent(username)}`)
          .then(res => res.json())
          .then(data => {
            if (data.approved) {
              setIsApproved(true);
              clearInterval(interval);
            }
          })
          .catch(console.error);
      }, 5000); // Check every 5 seconds
    }
    return () => clearInterval(interval);
  }, [username, isAwaitingApproval, isPending, isApproved]);
  
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username) {
      setError('Username not found. Please log in or register again.');
      return;
    }
    
    setError('');
    setLoading(true);
    
    try {
      const formData = new FormData();
      formData.append('username', username);
      formData.append('paymentMethod', paymentMethod);
      formData.append('transactionId', transactionId);
      formData.append('selectedPackage', selectedPackage);
      if (receiptFile) {
        formData.append('receipt', receiptFile);
      }

      const res = await fetch(API_BASE + '/api/auth/submit-payment', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      
      if (!res.ok) {
        setError(data.error || 'Failed to submit payment details');
        setLoading(false);
        return;
      }
      
      setSuccess('Payment details submitted! Please wait while the admin reviews your account.');
      setIsAwaitingApproval(true);
      setLoading(false);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#030712] relative overflow-hidden font-sans">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-600/20 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-600/20 rounded-full blur-[100px] pointer-events-none" />

      {isApproved && !isExpired ? (
        <div className="relative z-10 p-8 rounded-2xl w-[450px] flex flex-col gap-6 items-center text-center
                     bg-emerald-500/10 backdrop-blur-xl border border-emerald-500/30 shadow-[0_8px_32px_0_rgba(16,185,129,0.2)]
                     animate-in zoom-in duration-500">
          <div className="w-24 h-24 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/50 mb-2">
            <CheckCircle className="text-emerald-400 w-12 h-12" />
          </div>
          <h2 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">
            Account Approved!
          </h2>
          <p className="text-emerald-200/80 mb-4">
            Congratulations! Your account <strong>@{username}</strong> has been successfully approved by the admin.
          </p>
          <button 
            onClick={() => navigate('/login')}
            className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 px-8 rounded-lg transition-all w-full flex items-center justify-center gap-2"
          >
            Go to Login <ArrowRight size={20} />
          </button>
        </div>
      ) : (
        <form 
          onSubmit={handleSubmit} 
          className="relative z-10 p-8 rounded-2xl w-[450px] flex flex-col gap-6
                     bg-white/5 backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.37)]"
        >
          <div className="flex flex-col items-center gap-4 mb-8 text-center">
            <div className="w-16 h-16 rounded-full bg-cyan-500/20 flex items-center justify-center border border-cyan-500/30">
              {isAwaitingApproval ? (
                <Clock className="text-yellow-400 w-8 h-8 animate-pulse" />
              ) : (
                <CreditCard className="text-cyan-400 w-8 h-8" />
              )}
            </div>
            <div>
              <h2 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400">
                Payment Verification
              </h2>
              {isAwaitingApproval ? (
                <p className="text-slate-400 mt-2 font-medium">
                  Your account <strong className="text-white">@{username}</strong> is currently pending admin approval. <br/> Please wait on this screen...
                </p>
              ) : isExpired ? (
                <p className="text-red-400 mt-2 font-medium">
                  Your trial/subscription <strong className="text-white">@{username}</strong> has expired. <br/> Please purchase a package to continue.
                </p>
              ) : (
                <p className="text-slate-400 mt-2 font-medium">
                  Submit your payment details below to activate <strong className="text-white">@{username}</strong>.
                </p>
              )}
            </div>
          </div>

        {isAwaitingApproval && !success && (
          <div className="bg-orange-500/10 border border-orange-500/20 p-4 rounded-xl flex items-start gap-3">
            <Clock className="text-orange-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-orange-400 font-bold mb-1">Approval Pending</h3>
              <p className="text-slate-300 text-sm leading-relaxed">
                The admin is still reviewing your account. If you haven't made a payment yet, please follow the instructions below and submit your details. If you already submitted them, please wait here for the admin to grant you access.
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 p-3 rounded-lg text-center backdrop-blur-sm">
            {error}
          </div>
        )}

        {success ? (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center border border-green-500/30 text-green-400">
              <CheckCircle size={32} />
            </div>
            <div className="text-green-400 text-center font-medium">
              {success}
              <div className="text-xs text-green-400/70 mt-2">Redirecting to login...</div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Select Package</label>
              <div className={`grid ${!hasUsedFreeTrial ? 'grid-cols-3' : 'grid-cols-2'} gap-3`}>
                {!hasUsedFreeTrial && (
                  <button
                    type="button"
                    onClick={() => setSelectedPackage('Free')}
                    className={`p-3 rounded-lg border text-sm font-bold transition-all ${
                      selectedPackage === 'Free' 
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' 
                        : 'bg-black/20 border-white/10 text-slate-400 hover:bg-white/5'
                    }`}
                  >
                    Free <br/> <span className="text-lg font-black">$0</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedPackage('1 Month')}
                  className={`p-3 rounded-lg border text-sm font-bold transition-all ${
                    selectedPackage === '1 Month' 
                      ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400' 
                      : 'bg-black/20 border-white/10 text-slate-400 hover:bg-white/5'
                  }`}
                >
                  1 Month <br/> <span className="text-lg font-black">${settings?.monthlyPrice || 50}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPackage('Lifetime')}
                  className={`p-3 rounded-lg border text-sm font-bold transition-all ${
                    selectedPackage === 'Lifetime' 
                      ? 'bg-purple-500/20 border-purple-500/50 text-purple-400' 
                      : 'bg-black/20 border-white/10 text-slate-400 hover:bg-white/5'
                  }`}
                >
                  Lifetime <br/> <span className="text-lg font-black">${settings?.lifetimePrice || 500}</span>
                </button>
              </div>
            </div>

            {selectedPackage !== 'Free' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Payment Method</label>
                  <select 
                    value={paymentMethod} 
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white outline-none 
                               focus:border-cyan-500/80 focus:bg-black/40 focus:ring-1 focus:ring-cyan-500/50 transition-all"
                  >
                    <option value="USDT (TRC20)">USDT (TRC20)</option>
                    <option value="USDT (BEP20)">USDT (BEP20)</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                  </select>
                </div>

                {settings && (
                  <div className="bg-blue-500/10 border border-blue-500/30 p-4 rounded-lg">
                    <h4 className="text-sm font-bold text-blue-400 mb-1">Payment Instructions</h4>
                    <p className="text-xs text-blue-200/80 font-mono break-all whitespace-pre-wrap">
                      {paymentMethod === 'USDT (TRC20)' && (settings.usdtTrc20Address || 'No TRC20 address provided by admin.')}
                      {paymentMethod === 'USDT (BEP20)' && (settings.usdtBep20Address || 'No BEP20 address provided by admin.')}
                      {paymentMethod === 'Bank Transfer' && (settings.bankDetails || 'No bank details provided by admin.')}
                    </p>
                  </div>
                )}
                
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Transaction ID / Reference Number</label>
                  <input 
                    className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white outline-none 
                               focus:border-cyan-500/80 focus:bg-black/40 focus:ring-1 focus:ring-cyan-500/50 transition-all placeholder:text-slate-500"
                    placeholder="e.g. TX123456789"
                    value={transactionId}
                    onChange={(e) => setTransactionId(e.target.value)}
                    required={selectedPackage !== 'Free'}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Upload Receipt (Photo/PDF)</label>
                  <input 
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setReceiptFile(e.target.files[0]);
                      }
                    }}
                    className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-sm text-slate-300 
                               file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-bold 
                               file:bg-cyan-500/20 file:text-cyan-400 hover:file:bg-cyan-500/30 transition-all cursor-pointer"
                  />
                </div>
              </>
            )}
            
            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 
                         text-white font-bold py-4 rounded-xl mt-4 shadow-[0_0_20px_rgba(6,182,212,0.3)]
                         hover:shadow-[0_0_30px_rgba(6,182,212,0.5)] transition-all active:scale-[0.98] disabled:opacity-50
                         flex items-center justify-center gap-2"
            >
              {loading ? 'Submitting...' : isPending ? 'Resubmit Payment Details' : 'Submit for Approval'} <ArrowRight size={20} />
            </button>
            
            {isPending && (
              <div className="mt-4 text-center">
                <Link to="/login" className="text-sm text-slate-400 hover:text-white underline">
                  Back to Login
                </Link>
              </div>
            )}
            
            {!isPending && (
              <div className="text-center mt-4">
                <Link to="/login" className="text-xs text-slate-500 hover:text-cyan-400 transition-colors">
                  I'll do this later
                </Link>
              </div>
            )}
          </div>
        )}
        </form>
      )}
    </div>
  );
}
