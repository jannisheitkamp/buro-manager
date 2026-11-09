import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { ShieldCheck, Smartphone, Copy, LogOut } from 'lucide-react';
import { AuthShell } from '@/components/AuthShell';
import { toast } from 'react-hot-toast';
import QRCode from 'qrcode';

export const MfaSetup = () => {
  const { signOut } = useStore();
  const navigate = useNavigate();
  
  const [step, setStep] = useState<'intro' | 'qr' | 'verify'>('intro');
  const [loading, setLoading] = useState(false);
  
  // MFA Data
  const [factorId, setFactorId] = useState('');
  const [secret, setSecret] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [verifyCode, setVerifyCode] = useState('');

  // Check if already set up
  useEffect(() => {
      const checkMfa = async () => {
          const { data } = await supabase.auth.mfa.listFactors();
          const hasMfa = data?.all?.some(f => f.status === 'verified');
          if (hasMfa) {
              toast.success('2FA ist bereits aktiv!');
              navigate('/');
          }
      };
      checkMfa();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startSetup = async () => {
    setLoading(true);
    try {
      // 1. Cleanup old unverified factors to avoid limit errors
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const unverified = factors?.all?.filter(f => f.status === 'unverified') || [];
      
      for (const factor of unverified) {
          await supabase.auth.mfa.unenroll({ factorId: factor.id });
      }

      // 2. Enroll new factor
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        issuer: 'Büro Manager',
      });
      
      if (error) throw error;

      setFactorId(data.id);
      setSecret(data.totp.secret);
      
      const qrUrl = await QRCode.toDataURL(data.totp.uri);
      setQrCode(qrUrl);
      
      setStep('qr');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      console.error(err);
      let msg = 'Fehler beim Starten der Einrichtung.';
      if (err.message) msg = err.message;
      if (err.message?.includes('not enabled')) msg = 'MFA ist im System nicht aktiviert. Bitte Admin kontaktieren.';
      toast.error(msg);
    } finally {
        setLoading(false);
    }
  };

  const verifyAndEnable = async () => {
    if (!verifyCode || !factorId) return;
    setLoading(true);

    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code: verifyCode,
      });

      if (error) throw error;

      toast.success('Zwei-Faktor-Anmeldung ist aktiv');
      localStorage.setItem('last_mfa_check', Date.now().toString());
      // Neu laden, damit die Schutzprüfung den neuen Stand sieht
      window.location.replace('/');
    } catch (err) {
      console.error(err);
      toast.error('Falscher Code. Bitte erneut versuchen.');
    } finally {
        setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Zwei-Faktor-Anmeldung einrichten"
      description="Einmalig nötig. Danach meldest du dich mit Passwort und einem Code aus einer Authenticator-App an."
      footer={
        <button type="button" onClick={() => signOut()} className="btn-ghost btn-sm">
          <LogOut className="h-3.5 w-3.5" /> Abmelden
        </button>
      }
    >
      {step === 'intro' && (
        <div className="space-y-5">
          <ol className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
            {[
              'Authenticator-App installieren, zum Beispiel Google Authenticator oder Microsoft Authenticator.',
              'Den QR-Code auf der nächsten Seite mit der App scannen.',
              'Den 6-stelligen Code aus der App eingeben.',
            ].map((t, i) => (
              <li key={t} className="flex gap-3">
                <span className="tabular flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700 dark:bg-brand-900/50 dark:text-brand-200">{i + 1}</span>
                {t}
              </li>
            ))}
          </ol>
          <button type="button" onClick={startSetup} disabled={loading} className="btn-primary w-full py-2.5">
            <Smartphone className="h-4 w-4" /> {loading ? 'Wird vorbereitet' : 'Einrichtung starten'}
          </button>
        </div>
      )}

      {step === 'qr' && (
        <div className="space-y-5">
          <div className="flex justify-center rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700">
            {qrCode && <img src={qrCode} alt="QR-Code für die Authenticator-App" className="h-48 w-48" />}
          </div>
          <div>
            <p className="field-label">Kein Scanner? Schlüssel manuell eingeben:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all rounded-lg bg-gray-100 px-3 py-2 font-mono text-xs text-gray-800 dark:bg-gray-900 dark:text-gray-200">{secret}</code>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(secret);
                  toast.success('Schlüssel kopiert');
                }}
                className="btn-secondary btn-sm"
              >
                <Copy className="h-3.5 w-3.5" /> Kopieren
              </button>
            </div>
          </div>
          <button type="button" onClick={() => setStep('verify')} className="btn-primary w-full py-2.5">
            Weiter zum Code
          </button>
        </div>
      )}

      {step === 'verify' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            verifyAndEnable();
          }}
          className="space-y-4"
        >
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            aria-label="6-stelliger Code"
            value={verifyCode}
            onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            className="tabular block w-full px-4 py-3.5 text-center font-mono text-3xl tracking-[0.5em]"
          />
          <button type="submit" disabled={loading || verifyCode.length !== 6} className="btn-primary w-full py-2.5">
            <ShieldCheck className="h-4 w-4" /> {loading ? 'Wird geprüft' : 'Aktivieren'}
          </button>
          <button type="button" onClick={() => setStep('qr')} className="btn-ghost w-full">
            Zurück zum QR-Code
          </button>
        </form>
      )}
    </AuthShell>
  );
};
