import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { Building2, ArrowRight, Sparkles } from 'lucide-react';
import { toast } from 'react-hot-toast';

export const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
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
              full_name: email.split('@')[0], // Default name from email
            },
          },
        });
        if (error) throw error;
        toast.success('Registrierung erfolgreich! Bitte loggen Sie sich ein.');
        setMode('signin');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        await fetchProfile();
        toast.success('Erfolgreich angemeldet!');
      }

      navigate('/');
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      console.error('Login error:', err);
      let msg = 'Ein Fehler ist aufgetreten.';
      if (err.message?.includes('Invalid login credentials')) {
        msg = 'Falsche E-Mail oder Passwort.';
      }
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-white dark:bg-gray-900">
      {/* Left Side - Image/Brand */}
      <div className="hidden lg:flex lg:w-1/2 bg-indigo-600 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 to-purple-700 opacity-90 z-10" />
        <img 
            src="https://images.unsplash.com/photo-1497366216548-37526070297c?ixlib=rb-1.2.1&auto=format&fit=crop&w=1950&q=80" 
            alt="Office" 
            className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="relative z-20 flex flex-col justify-between h-full p-12 text-white">
            <div>
                <div className="flex items-center gap-3 mb-8">
                    <div className="bg-white/20 p-2.5 rounded-xl backdrop-blur-sm">
                        <Building2 className="h-8 w-8 text-white" />
                    </div>
                    <span className="text-2xl font-bold tracking-tight">Büro Manager</span>
                </div>
                <h1 className="text-5xl font-bold leading-tight mb-6">
                    Das moderne OS <br/> für deine Agentur.
                </h1>
                <p className="text-lg text-indigo-100 max-w-md leading-relaxed">
                    Organisiere Rückrufe, Pakete und Anwesenheiten an einem Ort. Effizient, übersichtlich und einfach schön.
                </p>
            </div>
            <div className="flex items-center gap-4 text-sm text-indigo-200">
                <div className="flex -space-x-2">
                    {[1,2,3,4].map(i => (
                        <div key={i} className="w-8 h-8 rounded-full bg-white/20 border-2 border-indigo-600 flex items-center justify-center text-xs">
                             <Sparkles className="w-3 h-3" />
                        </div>
                    ))}
                </div>
                <p>Nutze die Power von KI & Automation.</p>
            </div>
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="flex-1 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-20 xl:px-24">
        <div className="mx-auto w-full max-w-sm lg:w-96">
            <div className="mb-8 lg:hidden text-center">
                 <div className="flex justify-center mb-4">
                    <div className="bg-indigo-600 p-3 rounded-xl inline-block">
                        <Building2 className="h-8 w-8 text-white" />
                    </div>
                 </div>
                 <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Büro Manager</h2>
            </div>

            <div className="text-left mb-8">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
                    {mode === 'signin' ? 'Willkommen zurück' : 'Account erstellen'}
                </h2>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                    {mode === 'signin' ? 'Bitte melden Sie sich an, um fortzufahren.' : 'Starten Sie jetzt mit Ihrem Team.'}
                </p>
            </div>

            <form className="space-y-6" onSubmit={handleAuth}>
                <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        E-Mail Adresse
                    </label>
                    <div className="mt-1">
                        <input
                        id="email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="appearance-none block w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white transition-all"
                        placeholder="name@firma.de"
                        />
                    </div>
                </div>

                <div>
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Passwort
                    </label>
                    <div className="mt-1">
                        <input
                        id="password"
                        name="password"
                        type="password"
                        autoComplete="current-password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="appearance-none block w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white transition-all"
                        placeholder="••••••••"
                        />
                    </div>
                </div>

                <div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-lg text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-all hover:scale-[1.02]"
                    >
                        {loading ? 'Laden...' : (mode === 'signin' ? 'Anmelden' : 'Registrieren')}
                        {!loading && <ArrowRight className="ml-2 w-4 h-4" />}
                    </button>
                </div>
            </form>

            <div className="mt-8">
                <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-gray-300 dark:border-gray-700" />
                    </div>
                    <div className="relative flex justify-center text-sm">
                        <span className="px-2 bg-white dark:bg-gray-900 text-gray-500">
                            {mode === 'signin' ? 'Neu hier?' : 'Bereits registriert?'}
                        </span>
                    </div>
                </div>

                <div className="mt-6">
                    <button
                        onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
                        className="w-full flex justify-center py-3 px-4 border-2 border-gray-100 dark:border-gray-700 rounded-xl shadow-sm text-sm font-bold text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all"
                    >
                        {mode === 'signin' ? 'Jetzt Account erstellen' : 'Zum Login zurückkehren'}
                    </button>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};
