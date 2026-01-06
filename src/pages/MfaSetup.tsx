import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { ShieldCheck, Smartphone, Copy, Check, LogOut } from 'lucide-react';
import { toast } from 'react-hot-toast';
import QRCode from 'qrcode';

export const MfaSetup = () => {
  const { user, signOut } = useStore();
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
  }, []);

  const startSetup = async () => {
    setLoading(true);
    try {
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
    } catch (err) {
      console.error(err);
      toast.error('Fehler beim Starten der Einrichtung.');
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

      toast.success('2FA erfolgreich aktiviert! 🎉');
      navigate('/'); // Go to dashboard (or onboarding)
    } catch (err) {
      console.error(err);
      toast.error('Falscher Code. Bitte erneut versuchen.');
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center">
            <div className="mx-auto h-16 w-16 bg-indigo-100 dark:bg-indigo-900/50 rounded-full flex items-center justify-center mb-6">
                <ShieldCheck className="h-8 w-8 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                Sicherheit geht vor
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                Um fortzufahren, müssen Sie die 2-Faktor-Authentifizierung (2FA) einrichten.
            </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white dark:bg-gray-800 py-8 px-4 shadow-xl rounded-2xl sm:px-10 border border-gray-100 dark:border-gray-700">
            
            {step === 'intro' && (
                <div className="space-y-6">
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800">
                        <p className="text-sm text-blue-800 dark:text-blue-200">
                            1. Laden Sie eine Authenticator-App herunter (Google Authenticator, Microsoft Authenticator etc.).
                            <br/><br/>
                            2. Klicken Sie auf "Jetzt einrichten".
                        </p>
                    </div>
                    <button
                        onClick={startSetup}
                        disabled={loading}
                        className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all"
                    >
                        <Smartphone className="w-4 h-4" />
                        {loading ? 'Laden...' : 'Jetzt einrichten'}
                    </button>
                </div>
            )}

            {step === 'qr' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="text-center">
                        <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Scannen Sie den QR-Code</h3>
                        <div className="bg-white p-4 rounded-xl shadow-sm inline-block border border-gray-200">
                            {qrCode && <img src={qrCode} alt="QR Code" className="w-48 h-48" />}
                        </div>
                    </div>

                    <div className="bg-gray-50 dark:bg-gray-900/50 p-3 rounded-lg text-center">
                        <p className="text-xs text-gray-500 mb-1">Code manuell eingeben:</p>
                        <code className="text-xs font-mono font-bold select-all flex justify-center items-center gap-2 cursor-pointer" onClick={() => {
                             navigator.clipboard.writeText(secret);
                             toast.success('Kopiert');
                        }}>
                            {secret} <Copy className="w-3 h-3" />
                        </code>
                    </div>

                    <button
                        onClick={() => setStep('verify')}
                        className="w-full flex justify-center py-3 px-4 border border-gray-300 dark:border-gray-600 rounded-xl shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
                    >
                        Weiter zur Eingabe
                    </button>
                </div>
            )}

            {step === 'verify' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Code aus der App eingeben
                        </label>
                        <input
                            type="text"
                            value={verifyCode}
                            onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            className="block w-full text-center text-2xl tracking-[0.5em] font-mono py-3 border-gray-300 dark:border-gray-600 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-900 dark:text-white"
                            placeholder="000000"
                            autoFocus
                        />
                    </div>

                    <button
                        onClick={verifyAndEnable}
                        disabled={verifyCode.length !== 6 || loading}
                        className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 transition-all"
                    >
                        {loading ? 'Prüfe...' : 'Aktivieren & Fertig'}
                        {!loading && <Check className="w-4 h-4" />}
                    </button>
                    
                    <button
                        onClick={() => setStep('qr')}
                        className="w-full text-center text-sm text-gray-400 hover:text-gray-600"
                    >
                        Zurück zum QR-Code
                    </button>
                </div>
            )}

          </div>
          
          <div className="mt-6 text-center">
               <button onClick={() => signOut()} className="flex items-center justify-center gap-2 mx-auto text-sm text-red-500 hover:text-red-600">
                   <LogOut className="w-4 h-4" /> Abbrechen & Ausloggen
               </button>
          </div>

        </div>
      </div>
    </div>
  );
};
