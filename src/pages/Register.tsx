import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, UserPlus, Mail, KeyRound, X } from 'lucide-react';

// ==========================================
// EMAILJS CONFIGURATION
// Replace these with your actual EmailJS keys
// ==========================================
const EMAILJS_SERVICE_ID = 'service_vasfol8';
const EMAILJS_TEMPLATE_ID = 'template_l2gnoik';
const EMAILJS_PUBLIC_KEY = 'trC86bFik7MCvBmdT';

const InputField = ({ name, placeholder, value, onChange, type = "text", required = true }: any) => (
  <input 
    className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-white outline-none 
               focus:border-cyan-500/80 focus:bg-black/40 focus:ring-1 focus:ring-cyan-500/50 transition-all placeholder:text-slate-500"
    type={type}
    name={name}
    placeholder={placeholder}
    value={value}
    onChange={onChange}
    required={required}
  />
);

export function Register() {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    postalCode: '',
    password: ''
  });
  
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const navigate = useNavigate();

  // OTP State
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [generatedOtp, setGeneratedOtp] = useState('');
  const [enteredOtp, setEnteredOtp] = useState('');
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const generateOtp = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  };

  const handleRegisterClick = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!formData.email) {
      setError('Email is required for verification.');
      return;
    }

    setIsSendingOtp(true);

    try {
      // First check if user or email already exists in the database
      const checkRes = await fetch('/api/auth/check-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.email, username: formData.email })
      });
      
      let checkData;
      try {
        checkData = await checkRes.json();
      } catch (e) {
        throw new Error('Server returned an invalid response. The backend might be down.');
      }
      
      if (!checkRes.ok) {
        throw new Error(checkData?.error || 'User validation failed');
      }

      const newOtp = generateOtp();
      setGeneratedOtp(newOtp);

      // Send OTP via EmailJS REST API
      const emailParams = {
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ID,
        user_id: EMAILJS_PUBLIC_KEY,
        template_params: {
          to_email: formData.email,
          to_name: formData.firstName || 'User',
          otp_code: newOtp,
        }
      };

      const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(emailParams)
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`EmailJS Error: Please configure your EmailJS keys in Register.tsx. (${errorText})`);
      }

      setShowOtpModal(true);
      setSuccess(`OTP sent to ${formData.email}!`);
      setTimeout(() => setSuccess(''), 3000); // clear success msg after 3s
    } catch (err: any) {
      setError(err.message || 'Failed to send OTP email.');
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    setError('');
    setIsVerifying(true);

    if (enteredOtp !== generatedOtp) {
      setError('Invalid OTP code. Please try again.');
      setIsVerifying(false);
      return;
    }

    try {
      // OTP matched, proceed with actual registration
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, username: formData.email })
      });
      const data = await res.json();
      
      if (!res.ok) {
        setError(data.error || 'Registration failed at server');
        setIsVerifying(false);
        return;
      }
      
      setShowOtpModal(false);
      setSuccess('Email Verified & Registration successful! Redirecting to login...');
      setTimeout(() => {
        navigate('/login');
      }, 1500);
    } catch (err: any) {
      setError(err.message);
      setIsVerifying(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#030712] relative overflow-hidden font-sans py-12">
      {/* Neon glowing orbs background */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-600/20 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-[100px] pointer-events-none" />

      {/* Registration Form */}
      <form 
        onSubmit={handleRegisterClick} 
        className={`relative z-10 p-8 rounded-2xl w-[600px] max-w-[95vw] flex flex-col gap-6
                   bg-white/5 backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.37)]
                   transition-all duration-300 hover:border-cyan-500/30 hover:shadow-[0_0_30px_rgba(6,182,212,0.1)]
                   ${showOtpModal ? 'opacity-50 pointer-events-none scale-95 blur-sm' : ''}`}
      >
        <div className="flex flex-col items-center gap-2 mb-2">
          <div className="w-12 h-12 rounded-full bg-cyan-500/20 flex items-center justify-center border border-cyan-500/30">
            <UserPlus className="text-cyan-400 w-6 h-6" />
          </div>
          <h2 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400">
            Create Account
          </h2>
        </div>

        {error && !showOtpModal && (
          <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 p-3 rounded-lg text-center backdrop-blur-sm">
            {error}
          </div>
        )}
        {success && !showOtpModal && (
          <div className="text-green-400 text-sm bg-green-500/10 border border-green-500/20 p-3 rounded-lg text-center backdrop-blur-sm">
            {success}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InputField name="firstName" placeholder="First Name" value={formData.firstName} onChange={handleChange} />
          <InputField name="lastName" placeholder="Last Name" value={formData.lastName} onChange={handleChange} />
          
          <div className="md:col-span-2">
            <InputField name="email" placeholder="Email Address" type="email" value={formData.email} onChange={handleChange} />
          </div>
          
          <InputField name="phone" placeholder="Phone Number" type="tel" value={formData.phone} onChange={handleChange} />
          <InputField name="city" placeholder="City" value={formData.city} onChange={handleChange} />
          
          <div className="md:col-span-2">
            <InputField name="address" placeholder="Full Address" value={formData.address} onChange={handleChange} />
          </div>
          
          <InputField name="postalCode" placeholder="Postal Code" value={formData.postalCode} onChange={handleChange} />

          <div className="md:col-span-2 relative mt-2">
            <input 
              className="w-full bg-black/20 border border-white/10 rounded-lg p-3 pr-12 text-white outline-none 
                         focus:border-cyan-500/80 focus:bg-black/40 focus:ring-1 focus:ring-cyan-500/50 transition-all placeholder:text-slate-500"
              type={showPassword ? "text" : "password"} 
              name="password"
              placeholder="Password" 
              value={formData.password} 
              onChange={handleChange} 
              required 
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-cyan-400 transition-colors focus:outline-none"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
        </div>

        <button 
          type="submit" 
          disabled={isSendingOtp || !!success}
          className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 
                     text-white font-bold py-3.5 rounded-lg mt-2 shadow-[0_0_20px_rgba(6,182,212,0.3)]
                     hover:shadow-[0_0_30px_rgba(6,182,212,0.5)] transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isSendingOtp ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Sending OTP...
            </>
          ) : (
            'Register & Verify Email'
          )}
        </button>

        <p className="text-sm text-center text-slate-400 mt-2">
          Already have an account?{' '}
          <Link to="/login" className="text-cyan-400 hover:text-cyan-300 hover:underline font-medium transition-colors">
            Login here
          </Link>
        </p>
      </form>

      {/* OTP Modal */}
      {showOtpModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-[#0b0e14] border border-cyan-500/30 rounded-2xl w-[400px] max-w-[95vw] shadow-2xl p-8 flex flex-col relative">
            <button 
              onClick={() => setShowOtpModal(false)}
              className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>

            <div className="flex flex-col items-center gap-4 text-center mb-6">
              <div className="w-16 h-16 rounded-full bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20">
                <Mail className="text-cyan-400 w-8 h-8" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white mb-1">Verify Your Email</h3>
                <p className="text-sm text-slate-400">
                  We've sent a 6-digit verification code to <br/>
                  <span className="text-cyan-400 font-medium">{formData.email}</span>
                </p>
              </div>
            </div>

            {error && showOtpModal && (
              <div className="text-rose-400 text-sm bg-rose-500/10 border border-rose-500/20 p-3 rounded-lg text-center mb-4">
                {error}
              </div>
            )}
            
            {success && showOtpModal && (
              <div className="text-emerald-400 text-sm bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-lg text-center mb-4">
                {success}
              </div>
            )}

            <div className="relative mb-6">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-5 h-5" />
              <input 
                type="text"
                maxLength={6}
                placeholder="Enter 6-digit OTP"
                value={enteredOtp}
                onChange={(e) => setEnteredOtp(e.target.value.replace(/[^0-9]/g, ''))}
                className="w-full bg-black/40 border border-white/10 rounded-xl py-4 pl-12 pr-4 text-center text-xl tracking-[0.5em] font-bold text-white outline-none 
                         focus:border-cyan-500/80 focus:bg-black/60 focus:ring-1 focus:ring-cyan-500/50 transition-all placeholder:text-slate-600 placeholder:tracking-normal placeholder:font-normal"
              />
            </div>

            <button 
              onClick={handleVerifyOtp}
              disabled={enteredOtp.length !== 6 || isVerifying || !!success}
              className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 
                         text-white font-bold py-3.5 rounded-xl shadow-[0_0_20px_rgba(6,182,212,0.3)]
                         hover:shadow-[0_0_30px_rgba(6,182,212,0.5)] transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isVerifying ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Verifying...
                </>
              ) : (
                'Verify & Complete Registration'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
