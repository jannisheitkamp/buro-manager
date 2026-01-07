import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { ShieldCheck, Smartphone, Copy, Check, LogOut, Lock } from 'lucide-react';
import { toast } from 'react-hot-toast';
import QRCode from 'qrcode';
import { motion, AnimatePresence } from 'framer-motion';

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
    <div className="min-h-screen bg-[#F3F4F6] dark:bg-gray-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-3xl" />
          <div className="absolute bottom-[-10%] left-[-5%] w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-3xl" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="sm:mx-auto sm:w-full sm:max-w-md relative z-10"
      >
        <div className="text-center mb-8">
            <motion.div 
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
                className="mx-auto h-20 w-20 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl shadow-xl shadow-indigo-500/30 flex items-center justify-center mb-6"
            >
                <ShieldCheck className="h-10 w-10 text-white" />
            </motion.div>
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                Account absichern
            </h2>
            <p className="mt-3 text-gray-500 dark:text-gray-400">
                Richte die 2-Faktor-Authentifizierung ein,<br/> um deinen Account optimal zu schützen.
            </p>
        </div>

        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl py-8 px-4 shadow-2xl rounded-3xl sm:px-10 border border-white/20 dark:border-gray-700/50">
            <AnimatePresence mode="wait">
                {step === 'intro' && (
                    <motion.div
                        key="intro"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-6"
                    >
                        <div className="bg-indigo-50 dark:bg-indigo-900/20 p-6 rounded-2xl border border-indigo-100 dark:border-indigo-800/50">
                            <h3 className="font-bold text-indigo-900 dark:text-indigo-300 mb-2">So funktioniert's:</h3>
                            <ol className="text-sm text-indigo-800 dark:text-indigo-200 space-y-3 list-decimal list-inside marker:font-bold">
                                <li>Lade eine Authenticator-App herunter (z.B. Google Auth, Authy).</li>
                                <li>Klicke auf "Starten".</li>
                                <li>Scanne den angezeigten QR-Code.</li>
                            </ol>
                        </div>
                        <button
                            onClick={startSetup}
                            disabled={loading}
                            className="w-full flex justify-center items-center gap-2 py-4 px-4 border border-transparent rounded-2xl shadow-lg shadow-indigo-200 dark:shadow-none text-base font-bold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all hover:scale-[1.02]"
                        >
                            <Smartphone className="w-5 h-5" />
                            {loading ? 'Laden...' : 'Einrichtung starten'}
                        </button>
                    </motion.div>
                )}

                {step === 'qr' && (
                    <motion.div
                        key="qr"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-6"
                    >
                        <div className="text-center">
                            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">QR-Code scannen</h3>
                            <div className="bg-white p-4 rounded-3xl shadow-sm inline-block border border-gray-100">
                                {qrCode && <img src={qrCode} alt="QR Code" className="w-48 h-48 rounded-xl" />}
                            </div>
                        </div>

                        <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-2xl text-center border border-gray-100 dark:border-gray-800">
                            <p className="text-xs text-gray-500 mb-2">Oder Code manuell eingeben:</p>
                            <div 
                                className="group flex items-center justify-center gap-2 cursor-pointer p-2 hover:bg-white dark:hover:bg-gray-800 rounded-xl transition-colors" 
                                onClick={() => {
                                    navigator.clipboard.writeText(secret);
                                    toast.success('In Zwischenablage kopiert');
                                }}
                            >
                                <code className="text-sm font-mono font-bold text-gray-700 dark:text-gray-300">
                                    {secret}
                                </code>
                                <Copy className="w-4 h-4 text-gray-400 group-hover:text-indigo-500 transition-colors" />
                            </div>
                        </div>

                        <button
                            onClick={() => setStep('verify')}
                            className="w-full flex justify-center py-4 px-4 border border-gray-200 dark:border-gray-700 rounded-2xl text-sm font-bold text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
                        >
                            Weiter zur Code-Eingabe
                        </button>
                    </motion.div>
                )}

                {step === 'verify' && (
                    <motion.div
                        key="verify"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-6"
                    >
                        <div>
                            <label className="block text-center text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
                                6-stelligen Code aus der App eingeben
                            </label>
                            <input
                                type="text"
                                value={verifyCode}
                                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                className="block w-full text-center text-3xl tracking-[0.5em] font-mono py-4 border-gray-200 dark:border-gray-700 rounded-2xl focus:ring-indigo-500 focus:border-indigo-500 bg-gray-50 dark:bg-gray-900 dark:text-white transition-all focus:ring-2 focus:bg-white dark:focus:bg-gray-800"
                                placeholder="000000"
                                autoFocus
                            />
                        </div>

                        <button
                            onClick={verifyAndEnable}
                            disabled={verifyCode.length !== 6 || loading}
                            className="w-full flex justify-center items-center gap-2 py-4 px-4 border border-transparent rounded-2xl shadow-lg shadow-emerald-200 dark:shadow-none text-base font-bold text-white bg-emerald-500 hover:bg-emerald-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50 transition-all hover:scale-[1.02]"
                        >
                            {loading ? 'Prüfe...' : 'Aktivieren & Fertig'}
                            {!loading && <Check className="w-5 h-5" />}
                        </button>
                        
                        <button
                            onClick={() => setStep('qr')}
                            className="w-full text-center text-sm text-gray-400 hover:text-gray-600 transition-colors"
                        >
                            Zurück zum QR-Code
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
        
        <div className="mt-8 text-center">
             <button 
                onClick={() => signOut()} 
                className="inline-flex items-center gap-2 px-4 py-2 text-sm text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all"
            >
                 <LogOut className="w-4 h-4" /> 
                 Abbrechen & Ausloggen
             </button>
        </div>
      </motion.div>
    </div>
  );
};
