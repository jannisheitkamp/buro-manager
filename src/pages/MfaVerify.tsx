import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Shield, KeyRound, ArrowRight, LogOut } from 'lucide-react';
import toast from 'react-hot-toast';

export function MfaVerify() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [factorId, setFactorId] = useState<string | null>(null);

  useEffect(() => {
    // Get the first verified factor
    const loadFactor = async () => {
        const { data, error } = await supabase.auth.mfa.listFactors();
        if (error) {
            console.error(error);
            toast.error('Fehler beim Laden der 2FA-Methoden');
            return;
        }
        
        const verifiedFactor = data.all.find(f => f.status === 'verified' && f.factor_type === 'totp');
        if (verifiedFactor) {
            setFactorId(verifiedFactor.id);
        } else {
            toast.error('Keine 2FA-Methode gefunden. Bitte neu einrichten.');
            navigate('/mfa-setup');
        }
    };
    loadFactor();
  }, [navigate]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factorId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code,
      });

      if (error) throw error;

      toast.success('Verifizierung erfolgreich');
      
      // Store timestamp for the 6-hour check
      localStorage.setItem('last_mfa_check', Date.now().toString());
      
      navigate('/');
    } catch (error) {
      console.error(error);
      toast.error('Falscher Code. Bitte erneut versuchen.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 border border-gray-100 dark:border-gray-700">
        <div className="text-center mb-8">
          <div className="bg-indigo-100 dark:bg-indigo-900/30 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Sicherheitsprüfung</h1>
          <p className="text-gray-500 dark:text-gray-400">
            Bitte geben Sie Ihren Authenticator-Code ein, um fortzufahren.
            Dies ist alle 6 Stunden erforderlich.
          </p>
        </div>

        <form onSubmit={handleVerify} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              6-stelliger Code
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <KeyRound className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="block w-full pl-10 pr-3 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 transition-colors text-center text-xl tracking-widest font-mono"
                placeholder="000 000"
                required
                autoFocus
                autoComplete="one-time-code"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {loading ? 'Prüfe...' : 'Verifizieren'}
            {!loading && <ArrowRight className="w-4 h-4" />}
          </button>
        </form>

        <div className="mt-6 text-center border-t border-gray-100 dark:border-gray-700 pt-6">
          <button
            onClick={handleSignOut}
            className="text-sm text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 flex items-center justify-center gap-2 mx-auto transition-colors font-medium"
          >
            <LogOut className="w-4 h-4" />
            Abmelden
          </button>
        </div>
      </div>
    </div>
  );
}
