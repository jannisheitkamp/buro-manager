import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { Button, Field } from '@/components/ui';

const greeting = (d: Date) => {
  const h = d.getHours();
  if (h < 11) return 'Guten Morgen';
  if (h < 17) return 'Guten Tag';
  return 'Guten Abend';
};

const translateError = (message?: string) => {
  if (!message) return 'Anmeldung fehlgeschlagen. Bitte versuche es erneut.';
  if (message.includes('Invalid login credentials')) return 'E-Mail oder Passwort stimmen nicht.';
  if (message.includes('Email not confirmed')) return 'Bitte bestätige zuerst deine E-Mail-Adresse.';
  if (message.includes('User already registered')) return 'Für diese E-Mail gibt es schon ein Konto.';
  if (message.includes('Password should be')) return 'Das Passwort muss mindestens 6 Zeichen haben.';
  if (message.toLowerCase().includes('rate limit')) return 'Zu viele Versuche. Warte kurz und versuche es dann erneut.';
  return message;
};

export const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [needsMfa, setNeedsMfa] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaFactorId, setMfaFactorId] = useState('');
  const [now, setNow] = useState(() => new Date());

  const navigate = useNavigate();
  const location = useLocation();
  const user = useStore((s) => s.user);
  const authLoading = useStore((s) => s.loading);
  const fetchProfile = useStore((s) => s.fetchProfile);
  const redirectTo = (location.state as { from?: string } | null)?.from || '/';

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Bereits angemeldet (und keine 2FA offen) → direkt in die App
  if (!authLoading && user && !needsMfa && !loading) return <Navigate to={redirectTo} replace />;

  const finishLogin = async () => {
    try {
      localStorage.setItem('last_mfa_check', Date.now().toString());
    } catch {
      /* ignorieren */
    }
    await fetchProfile();
    navigate(redirectTo, { replace: true });
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName.trim() || email.split('@')[0] } },
        });
        if (error) throw error;
        await supabase.auth.signOut();
        toast.success('Konto angelegt. Du kannst dich anmelden, sobald es freigeschaltet ist.', { duration: 6000 });
        setMode('signin');
        setPassword('');
        return;
      }

      const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('is_approved, roles')
        .eq('id', authData.user.id)
        .maybeSingle();
      if (profileError) throw profileError;

      if (!profileData?.is_approved && !profileData?.roles?.includes('admin')) {
        await supabase.auth.signOut();
        toast.error('Dein Konto ist noch nicht freigeschaltet. Melde dich bei der Büroleitung.', { duration: 6000 });
        return;
      }

      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.nextLevel === 'aal2' && aal.currentLevel === 'aal1') {
        const { data: factors } = await supabase.auth.mfa.listFactors();
        const totp = factors?.all.find((f) => f.factor_type === 'totp' && f.status === 'verified');
        if (totp) {
          setMfaFactorId(totp.id);
          setNeedsMfa(true);
          return;
        }
      }

      await finishLogin();
    } catch (err) {
      toast.error(translateError((err as Error)?.message));
    } finally {
      setLoading(false);
    }
  };

  const handleMfaVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: mfaFactorId, code: mfaCode });
      if (error) throw error;
      setNeedsMfa(false);
      await finishLogin();
    } catch {
      toast.error('Der Code stimmt nicht. Nimm den aktuellen Code aus deiner Authenticator-App.');
      setMfaCode('');
    } finally {
      setLoading(false);
    }
  };

  const cancelMfa = async () => {
    setNeedsMfa(false);
    setMfaCode('');
    setPassword('');
    await supabase.auth.signOut();
  };

  return (
    <div className="flex min-h-dvh bg-gray-50 dark:bg-gray-900">
      {/* Markenfläche */}
      <aside className="relative hidden w-[46%] max-w-[720px] flex-col justify-between overflow-hidden bg-brand-900 p-12 text-white lg:flex xl:p-16">
        {/* Lineal-Raster als ruhiger Hintergrund */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.07]" aria-hidden>
          <defs>
            <pattern id="ruler" width="48" height="48" patternUnits="userSpaceOnUse">
              <path d="M48 0H0V48" fill="none" stroke="white" strokeWidth="1" />
              <path d="M24 0V6M0 24H6" stroke="white" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#ruler)" />
        </svg>

        <div className="relative flex items-center gap-3">
          <img src="/favicon.svg" alt="" className="h-9 w-9" />
          <span className="font-display text-lg font-semibold">Büro Manager</span>
        </div>

        <div className="relative">
          <p className="tabular font-mono text-sm text-brand-200">
            {format(now, "EEEE, d. MMMM", { locale: de })} · {format(now, 'HH:mm')}
          </p>
          <h1 className="mt-4 font-display text-6xl font-semibold leading-[1.02] tracking-tight xl:text-7xl">
            {greeting(now)},
            <br />
            Dortmund.
          </h1>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-brand-100/80">
            Team, Empfang, Anrufe und Produktion des Agenturverbunds an einem Ort.
          </p>
        </div>

        <div className="relative flex items-center gap-2 text-sm text-brand-200/80">
          <ShieldCheck className="h-4 w-4" />
          Anmeldung mit Zwei-Faktor-Schutz
        </div>
      </aside>

      {/* Formular */}
      <main className="flex flex-1 items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <img src="/favicon.svg" alt="" className="h-10 w-10" />
            <span className="font-display text-xl font-semibold text-gray-900 dark:text-white">Büro Manager</span>
          </div>

          {needsMfa ? (
            <form onSubmit={handleMfaVerify} className="animate-fade-in">
              <h2 className="text-3xl font-semibold text-gray-900 dark:text-white">Code eingeben</h2>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Öffne deine Authenticator-App und gib den 6-stelligen Code ein.</p>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                autoFocus
                aria-label="6-stelliger Code"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="tabular mt-8 block w-full px-4 py-4 text-center font-mono text-3xl tracking-[0.5em]"
                placeholder="000000"
              />
              <Button type="submit" loading={loading} disabled={mfaCode.length !== 6} className="mt-6 w-full py-2.5">
                Bestätigen
              </Button>
              <button type="button" onClick={cancelMfa} className="btn-ghost mt-2 w-full">
                <ArrowLeft className="h-4 w-4" /> Abbrechen und abmelden
              </button>
            </form>
          ) : (
            <form onSubmit={handleAuth} className="animate-fade-in" key={mode}>
              <h2 className="text-3xl font-semibold text-gray-900 dark:text-white">{mode === 'signin' ? 'Anmelden' : 'Konto anlegen'}</h2>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                {mode === 'signin' ? 'Mit deiner Büro-E-Mail-Adresse.' : 'Die Büroleitung schaltet dein Konto danach frei.'}
              </p>

              <div className="mt-8 space-y-4">
                {mode === 'signup' && (
                  <Field label="Vor- und Nachname" htmlFor="name">
                    <input id="name" type="text" required autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} className="input py-2.5" />
                  </Field>
                )}
                <Field label="E-Mail" htmlFor="email">
                  <input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input py-2.5"
                    placeholder="name@agentur.de"
                  />
                </Field>
                <Field label="Passwort" htmlFor="password">
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={mode === 'signup' ? 8 : undefined}
                      autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="input py-2.5 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                      aria-label={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </Field>
              </div>

              <Button type="submit" loading={loading} className="mt-6 w-full py-2.5">
                {mode === 'signin' ? 'Anmelden' : 'Konto anlegen'}
              </Button>

              <p className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
                {mode === 'signin' ? 'Neu im Team?' : 'Schon ein Konto?'}{' '}
                <button
                  type="button"
                  onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
                  className="font-medium text-brand-700 hover:underline dark:text-brand-300"
                >
                  {mode === 'signin' ? 'Konto anlegen' : 'Anmelden'}
                </button>
              </p>
            </form>
          )}
        </div>
      </main>
    </div>
  );
};
