import React, { useState } from 'react';
import { ArrowRight, Lock, Loader2, Check } from 'lucide-react';
import { makeBrowserClient } from '@/lib/supabaseClient';

// We need a client-side supabase instance for auth
const supabase = makeBrowserClient();

export default function LoginView({ onLoginSuccess }: { onLoginSuccess: () => void }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState('');
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [otp, setOtp] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    setErrorMessage('');
    
    try {
        // Check authorization first
        const authCheck = await fetch('/api/auth/check-access', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        
        const authResult = await authCheck.json();
        
        if (!authCheck.ok || !authResult.allowed) {
            throw new Error('You are not authorized to access this platform.');
        }

        const { error } = await supabase.auth.signInWithOtp({
            email,
            options: {
                // We still provide this for backward compatibility, 
                // but we'll primarily use the OTP flow
                emailRedirectTo: window.location.origin,
            },
        });

        if (error) throw error;
        
        setShowOtpInput(true);
        setStatus('success');
    } catch (err: any) {
        setStatus('error');
        setErrorMessage(err.message || 'Failed to send login code');
    } finally {
        setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp) return;

    setLoading(true);
    setErrorMessage('');

    try {
        const { error } = await supabase.auth.verifyOtp({
            email,
            token: otp,
            type: 'email'
        });

        if (error) throw error;
        
        onLoginSuccess();
    } catch (err: any) {
        setErrorMessage(err.message || 'Invalid code');
    } finally {
        setLoading(false);
    }
  };

  if (showOtpInput) {
      return (
          <div className="w-full max-w-xl mx-auto animate-fadeIn relative z-20">
            <form onSubmit={handleVerifyOtp} className="relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                
                <div className="relative flex items-center bg-slate-900/80 border border-slate-700/50 rounded-full shadow-2xl backdrop-blur-xl transition-all duration-300 focus-within:border-emerald-500/50 focus-within:ring-2 focus-within:ring-emerald-500/20 focus-within:bg-slate-900 overflow-hidden">
                    <div className="pl-6 text-slate-400">
                        <Check size={20} />
                    </div>
                    
                    <input
                        type="text"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value)}
                        placeholder="Enter the 6-digit code..."
                        className="w-full bg-transparent border-none text-lg text-white placeholder-slate-500 focus:ring-0 py-4 px-4 outline-none font-light tracking-widest"
                        autoFocus
                        disabled={loading}
                        maxLength={6}
                    />

                    <button
                        type="submit"
                        disabled={!otp || loading}
                        className="mr-2 p-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full transition-all disabled:opacity-0 disabled:scale-75 active:scale-95"
                    >
                        {loading ? <Loader2 size={20} className="animate-spin" /> : <ArrowRight size={20} />}
                    </button>
                </div>

                <div className="text-center mt-4">
                    <button 
                        type="button"
                        onClick={() => setShowOtpInput(false)}
                        className="text-slate-500 hover:text-slate-300 text-sm transition-colors"
                    >
                        Use a different email
                    </button>
                </div>

                {errorMessage && (
                    <div className="absolute -bottom-10 left-0 right-0 text-center text-red-400 text-sm animate-shake">
                        {errorMessage}
                    </div>
                )}
            </form>
          </div>
      );
  }

  if (status === 'success' && !showOtpInput) {
      return (
          <div className="w-full max-w-xl mx-auto text-center animate-fadeIn">
              <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-6 rounded-2xl mb-6 flex flex-col items-center">
                  <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mb-3">
                      <Check size={24} />
                  </div>
                  <h3 className="text-xl font-medium mb-2">Check your inbox</h3>
                  <p className="text-emerald-500/80">
                      We've sent a magic link to <span className="font-bold text-emerald-400">{email}</span>.
                      <br/>Click it to access the platform.
                  </p>
              </div>
              <button 
                onClick={() => setStatus('idle')}
                className="text-slate-500 hover:text-slate-300 text-sm transition-colors"
              >
                  Use a different email
              </button>

              {/* Chrome Optimization Message */}
              <div className="mt-8 flex items-center justify-center gap-2 text-slate-500 text-sm font-light opacity-80 animate-fadeIn">
                  <span>Optimized for</span>
                  <div className="flex items-center gap-1.5 bg-slate-900/50 px-2 py-1 rounded-full border border-slate-800/50">
                      <img src="/chrome.svg" alt="Chrome" className="w-4 h-4" />
                      <span className="text-slate-400 text-xs tracking-wide">Chrome</span>
                  </div>
              </div>
          </div>
      );
  }

  return (
    <div className="w-full max-w-xl mx-auto animate-fadeIn relative z-20">
      <form onSubmit={handleLogin} className="relative group">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
        
        <div className="relative flex items-center bg-slate-900/80 border border-slate-700/50 rounded-full shadow-2xl backdrop-blur-xl transition-all duration-300 focus-within:border-blue-500/50 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:bg-slate-900 overflow-hidden">
            <div className="pl-6 text-slate-400">
                <Lock size={20} />
            </div>
            
            <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter email to access..."
                className="w-full bg-transparent border-none text-lg text-white placeholder-slate-500 focus:ring-0 py-4 px-4 outline-none font-light"
                autoFocus
                disabled={loading}
            />

            <button
                type="submit"
                disabled={!email || loading}
                className="mr-2 p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-full transition-all disabled:opacity-0 disabled:scale-75 active:scale-95"
            >
                {loading ? <Loader2 size={20} className="animate-spin" /> : <ArrowRight size={20} />}
            </button>
        </div>

        {errorMessage && (
            <div className="absolute -bottom-10 left-0 right-0 text-center text-red-400 text-sm animate-shake">
                {errorMessage}
            </div>
        )}
      </form>
    </div>
  );
}
