import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { Building2, ArrowRight, Sparkles, ShieldCheck, Lock } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

export const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  
  // MFA State
  const [needsMfa, setNeedsMfa] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaFactorId, setMfaFactorId] = useState('');

  const navigate = useNavigate();
  const fetchProfile = useStore((state) => state.fetchProfile);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: email.split('@')[0], 
            },
          },
        });
        if (error) throw error;
        toast.success('Registrierung erfolgreich! Bitte warten Sie auf Freischaltung.');
        setMode('signin');
        setLoading(false);
      } else {
        // 1. First Factor Login
        const { data: authData, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        // Check Approval
        if (authData.user) {
            const { data: profileData, error: profileError } = await supabase
                .from('profiles')
                .select('is_approved, roles')
                .eq('id', authData.user.id)
                .maybeSingle();
            
            if (profileError) throw profileError;

            const isApproved = profileData?.is_approved;
            const isAdmin = profileData?.roles?.includes('admin');

            if (!isApproved && !isAdmin) {
                await supabase.auth.signOut();
                toast.error('Ihr Account wurde noch nicht freigeschaltet. Bitte kontaktieren Sie den Administrator.', { duration: 6000, icon: '🔒' });
                setLoading(false);
                return;
            }
        }

        // 2. Check if MFA is required
        const { data: mfaData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        
        if (mfaData && mfaData.nextLevel === 'aal2' && mfaData.currentLevel === 'aal1') {
            const { data: factors } = await supabase.auth.mfa.listFactors();
            const totpFactor = factors.all.find(f => f.factor_type === 'totp' && f.status === 'verified');
            
            if (totpFactor) {
                setMfaFactorId(totpFactor.id);
                setNeedsMfa(true);
                setLoading(false);
                toast('Bitte 2FA Code eingeben.', { icon: '🔐' });
                return;
            }
        }

        await fetchProfile();
        toast.success('Erfolgreich angemeldet!');
        navigate('/');
      }
    } catch (err: any) {
      console.error('Login error:', err);
      let msg = 'Ein Fehler ist aufgetreten.';
      if (err.message) msg = err.message;
      if (msg?.includes('Invalid login credentials')) msg = 'Falsche E-Mail oder Passwort.';
      toast.error(msg);
      setLoading(false);
    }
  };

  const handleMfaVerify = async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);

      try {
          const { error } = await supabase.auth.mfa.challengeAndVerify({
              factorId: mfaFactorId,
              code: mfaCode
          });

          if (error) throw error;

          await fetchProfile();
          toast.success('Login bestätigt! 🚀');
          navigate('/');
      } catch (err) {
          console.error(err);
          toast.error('Falscher Code.');
          setLoading(false);
      }
  };

  return (
    <div className="min-h-screen flex bg-white dark:bg-gray-900">
      {/* Left Side - Image/Brand */}
      <motion.div 
        initial={{ opacity: 0, x: -50 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.8 }}
        className="hidden lg:flex lg:w-1/2 bg-indigo-600 relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 to-purple-800 opacity-90 z-10" />
        <img 
            src="https://images.unsplash.com/photo-1497366216548-37526070297c?ixlib=rb-1.2.1&auto=format&fit=crop&w=1950&q=80" 
            alt="Office" 
            className="absolute inset-0 w-full h-full object-cover"
        />
        
        {/* Animated Shapes */}
        <motion.div 
            animate={{ rotate: 360 }}
            transition={{ duration: 50, repeat: Infinity, ease: "linear" }}
            className="absolute top-[-20%] right-[-20%] w-[800px] h-[800px] border-[100px] border-white/5 rounded-full z-10 blur-3xl"
        />

        <div className="relative z-20 flex flex-col justify-between h-full p-16 text-white">
            <div>
                <motion.div 
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="flex items-center gap-3 mb-12"
                >
                    <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-md shadow-lg border border-white/10">
                        <Building2 className="h-8 w-8 text-white" />
                    </div>
                    <span className="text-2xl font-bold tracking-tight">Büro Manager</span>
                </motion.div>
                
                <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.3 }}
                >
                    <h1 className="text-5xl font-bold leading-tight mb-8">
                        Agenturverbund <br/> <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-200 to-indigo-100">Dortmund.</span>
                    </h1>
                    <p className="text-xl text-indigo-100 max-w-lg leading-relaxed font-light">
                        Die zentrale Plattform für den Agenturverbund der Nürnberger Versicherung.
                    </p>
                </motion.div>
            </div>
            
            <motion.div 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="flex items-center gap-6 text-sm text-indigo-200"
            >
                <div className="flex items-center gap-2 px-4 py-2 bg-white/10 rounded-full backdrop-blur-md border border-white/10">
                    <ShieldCheck className="w-4 h-4 text-white" />
                    <span className="font-medium">Nürnberger Versicherung</span>
                </div>
            </motion.div>
        </div>
      </motion.div>

      {/* Right Side - Form */}
      <div className="flex-1 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-20 xl:px-24 bg-white dark:bg-gray-900 relative">
        <div className="mx-auto w-full max-w-sm lg:w-96 relative z-10">
            
            <div className="mb-10 lg:hidden text-center">
                 <div className="flex justify-center mb-6">
                    <div className="bg-indigo-600 p-4 rounded-2xl inline-block shadow-lg shadow-indigo-200">
                        <Building2 className="h-8 w-8 text-white" />
                    </div>
                 </div>
                 <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Büro Manager</h2>
            </div>

            <AnimatePresence mode="wait">
                <motion.div
                    key={needsMfa ? 'mfa' : mode}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                >
                    <div className="text-left mb-10">
                        <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-3">
                            {needsMfa ? 'Sicherheits-Check' : (mode === 'signin' ? 'Willkommen zurück' : 'Account erstellen')}
                        </h2>
                        <p className="text-base text-gray-500 dark:text-gray-400">
                            {needsMfa 
                                ? 'Bitte geben Sie den Code aus Ihrer Authenticator-App ein.' 
                                : (mode === 'signin' ? 'Bitte melden Sie sich an, um fortzufahren.' : 'Starten Sie jetzt mit Ihrem Team.')}
                        </p>
                    </div>

                    {!needsMfa ? (
                        // --- Normal Login Form ---
                        <form className="space-y-6" onSubmit={handleAuth}>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 ml-1">
                                    E-Mail Adresse
                                </label>
                                <div className="mt-1">
                                    <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="appearance-none block w-full px-5 py-4 border border-gray-200 dark:border-gray-700 rounded-2xl bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white dark:focus:bg-gray-800 transition-all font-medium"
                                    placeholder="name@firma.de"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 ml-1">
                                    Passwort
                                </label>
                                <div className="mt-1">
                                    <input
                                    type="password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="appearance-none block w-full px-5 py-4 border border-gray-200 dark:border-gray-700 rounded-2xl bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white dark:focus:bg-gray-800 transition-all font-medium"
                                    placeholder="••••••••"
                                    />
                                </div>
                            </div>

                            <div>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full flex justify-center py-4 px-4 border border-transparent rounded-2xl shadow-lg shadow-indigo-200 dark:shadow-none text-base font-bold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-all hover:scale-[1.02] active:scale-[0.98]"
                                >
                                    {loading ? 'Laden...' : (mode === 'signin' ? 'Anmelden' : 'Registrieren')}
                                    {!loading && <ArrowRight className="ml-2 w-5 h-5" />}
                                </button>
                            </div>
                        </form>
                    ) : (
                        // --- MFA Verification Form ---
                        <form className="space-y-8" onSubmit={handleMfaVerify}>
                            <div>
                                <div className="flex justify-center mb-8">
                                    <motion.div 
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        className="bg-indigo-50 dark:bg-indigo-900/30 p-6 rounded-3xl"
                                    >
                                        <ShieldCheck className="w-16 h-16 text-indigo-600 dark:text-indigo-400" />
                                    </motion.div>
                                </div>
                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 text-center mb-4">
                                    6-stelliger Code
                                </label>
                                <div className="mt-1">
                                    <input
                                    type="text"
                                    required
                                    autoFocus
                                    value={mfaCode}
                                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    className="appearance-none block w-full px-4 py-4 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-sm placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-center text-3xl tracking-[0.5em] font-mono bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white transition-all"
                                    placeholder="000000"
                                    />
                                </div>
                            </div>

                            <div className="space-y-3">
                                <button
                                    type="submit"
                                    disabled={loading || mfaCode.length !== 6}
                                    className="w-full flex justify-center py-4 px-4 border border-transparent rounded-2xl shadow-lg text-base font-bold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-all hover:scale-[1.02]"
                                >
                                    {loading ? 'Prüfe Code...' : 'Bestätigen'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setNeedsMfa(false);
                                        setMfaCode('');
                                        setEmail('');
                                        setPassword('');
                                    }}
                                    className="w-full text-center text-sm font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 py-2"
                                >
                                    Abbrechen
                                </button>
                            </div>
                        </form>
                    )}

                    {!needsMfa && (
                        <div className="mt-10">
                            <div className="relative">
                                <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t border-gray-100 dark:border-gray-800" />
                                </div>
                                <div className="relative flex justify-center text-sm">
                                    <span className="px-4 bg-white dark:bg-gray-900 text-gray-400">
                                        {mode === 'signin' ? 'Neu hier?' : 'Bereits registriert?'}
                                    </span>
                                </div>
                            </div>

                            <div className="mt-6">
                                <button
                                    onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
                                    className="w-full flex justify-center py-4 px-4 border-2 border-gray-100 dark:border-gray-800 rounded-2xl shadow-sm text-sm font-bold text-gray-600 dark:text-gray-300 bg-transparent hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
                                >
                                    {mode === 'signin' ? 'Jetzt Account erstellen' : 'Zum Login zurückkehren'}
                                </button>
                            </div>
                        </div>
                    )}
                </motion.div>
            </AnimatePresence>
        </div>
      </div>
    </div>
  );
};
