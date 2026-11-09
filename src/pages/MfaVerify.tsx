import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { KeyRound, LogOut } from 'lucide-react';
import { AuthShell } from '@/components/AuthShell';
import { useStore } from '@/store/useStore';
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
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code,
      });

      if (error) throw error;

      toast.success('Verifizierung erfolgreich');
      
      // Store timestamp for the 6-hour check
      localStorage.setItem('last_mfa_check', Date.now().toString());
      
      // Neu laden, damit die Schutzprüfung den neuen Stand sieht
      window.location.replace('/');
    } catch (error) {
      console.error(error);
      toast.error('Der Code stimmt nicht. Nimm den aktuellen Code aus der App.');
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  const signOut = useStore((st) => st.signOut);
  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <AuthShell
      title="Code bestätigen"
      description="Aus Sicherheitsgründen fragen wir alle 6 Stunden nach dem Code aus deiner Authenticator-App."
      footer={
        <button type="button" onClick={handleSignOut} className="btn-ghost btn-sm">
          <LogOut className="h-3.5 w-3.5" /> Abmelden
        </button>
      }
    >
      <form onSubmit={handleVerify} className="space-y-4">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          aria-label="6-stelliger Code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="000000"
          className="tabular block w-full px-4 py-3.5 text-center font-mono text-3xl tracking-[0.5em]"
        />
        <button type="submit" disabled={loading || code.length !== 6 || !factorId} className="btn-primary w-full py-2.5">
          <KeyRound className="h-4 w-4" /> {loading ? 'Wird geprüft' : 'Bestätigen'}
        </button>
      </form>
    </AuthShell>
  );
}
