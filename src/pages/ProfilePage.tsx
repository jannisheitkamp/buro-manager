import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { UserCircle, Save, LogOut, ShieldCheck, Smartphone, Copy, Check, Settings, Sparkles, CreditCard } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import QRCode from 'qrcode';
import { motion, AnimatePresence } from 'framer-motion';

export const ProfilePage = () => {
  const { user, profile, fetchProfile, signOut } = useStore();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);

  // MFA State
  const [mfaFactors, setMfaFactors] = useState<any[]>([]);
  const [showMfaSetup, setShowMfaSetup] = useState(false);
  const [mfaSecret, setMfaSecret] = useState('');
  const [mfaQrCode, setMfaQrCode] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [factorId, setFactorId] = useState('');

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setAvatarUrl(profile.avatar_url || '');
      setAddress(profile.address || '');
    }
    fetchMfaFactors();
  }, [profile]);

  const fetchMfaFactors = async () => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) {
      console.error('Error fetching MFA factors:', error);
    } else {
      setMfaFactors(data.all || []);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSaving(true);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName,
          avatar_url: avatarUrl,
          address: address,
        })
        .eq('id', user.id);

      if (error) throw error;

      await fetchProfile();
      toast.success('Profil erfolgreich aktualisiert.');
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error('Fehler beim Speichern.');
    } finally {
      setSaving(false);
    }
  };

  // --- MFA Logic ---

  const startMfaSetup = async () => {
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        issuer: 'Büro Manager',
      });
      
      if (error) throw error;

      setFactorId(data.id);
      setMfaSecret(data.totp.secret);
      
      // Generate QR Code
      const qrUrl = await QRCode.toDataURL(data.totp.uri);
      setMfaQrCode(qrUrl);
      
      setShowMfaSetup(true);
    } catch (err) {
      console.error(err);
      toast.error('Konnte 2FA-Setup nicht starten.');
    }
  };

  const verifyAndEnableMfa = async () => {
    if (!verifyCode || !factorId) return;

    try {
      const { data, error } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code: verifyCode,
      });

      if (error) throw error;

      toast.success('2-Faktor-Authentifizierung aktiviert! 🚀');
      setShowMfaSetup(false);
      setVerifyCode('');
      fetchMfaFactors();
    } catch (err) {
      console.error(err);
      toast.error('Falscher Code. Bitte versuche es erneut.');
    }
  };

  const disableMfa = async (id: string) => {
    if (!confirm('Möchtest du 2FA wirklich deaktivieren? Dein Account ist dann weniger geschützt.')) return;

    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
      if (error) throw error;
      
      toast.success('2FA deaktiviert.');
      fetchMfaFactors();
    } catch (err) {
      console.error(err);
      toast.error('Fehler beim Deaktivieren.');
    }
  };

  const hasMfa = mfaFactors.some(f => f.status === 'verified');

  return (
    <div className="space-y-8 pb-20">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
          <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl">
             <UserCircle className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
          </div>
          Mein Profil
        </h1>
        
        <button
            onClick={() => signOut()}
            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition-colors"
        >
            <LogOut className="w-4 h-4" />
            Abmelden
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Profile Card */}
        <div className="lg:col-span-2 space-y-6">
            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 dark:border-gray-700/50 p-8"
            >
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 mb-8">
                    <div className="relative group">
                        <img
                        src={avatarUrl || `https://ui-avatars.com/api/?name=${fullName || 'User'}&background=random`}
                        alt={fullName}
                        className="w-24 h-24 rounded-2xl object-cover shadow-lg ring-4 ring-white dark:ring-gray-700 transition-transform group-hover:scale-105"
                        />
                        <div className="absolute inset-0 rounded-2xl ring-1 ring-black/5 dark:ring-white/10" />
                    </div>
                    
                    <div className="text-center sm:text-left flex-1">
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{fullName || 'Dein Name'}</h2>
                        <p className="text-gray-500 dark:text-gray-400">{user?.email}</p>
                        <div className="mt-3 flex flex-wrap justify-center sm:justify-start gap-2">
                            {profile?.roles?.map(role => (
                                <span key={role} className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300 capitalize">
                                    {role.replace(/_/g, ' ')}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>

                <form onSubmit={handleUpdate} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Vollständiger Name
                            </label>
                            <input
                            type="text"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            className="w-full rounded-xl border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                            placeholder="Max Mustermann"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Avatar URL
                            </label>
                            <input
                            type="url"
                            value={avatarUrl}
                            onChange={(e) => setAvatarUrl(e.target.value)}
                            className="w-full rounded-xl border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                            placeholder="https://example.com/bild.jpg"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Adresse (für Formulare)
                        </label>
                        <textarea
                        rows={3}
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        className="w-full rounded-xl border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all resize-none"
                        placeholder="Musterstraße 1&#10;12345 Musterstadt"
                        />
                    </div>

                    <div className="pt-4 flex justify-end">
                        <button
                        type="submit"
                        disabled={saving}
                        className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-lg shadow-indigo-200 dark:shadow-none transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
                        >
                        <Save className="w-4 h-4" />
                        {saving ? 'Speichert...' : 'Änderungen speichern'}
                        </button>
                    </div>
                </form>
            </motion.div>
        </div>

        {/* Right Column: Settings & Security */}
        <div className="space-y-6">
            {/* Commission Settings */}
            <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 dark:border-gray-700/50 p-6"
            >
                <div className="flex items-center gap-4 mb-4">
                    <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-2xl">
                        <CreditCard className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                        <h3 className="font-bold text-gray-900 dark:text-white">Provision</h3>
                        <p className="text-xs text-gray-500">Einstellungen verwalten</p>
                    </div>
                </div>
                
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
                    Verwalte deine individuellen Provisionssätze für alle Sparten und Produkte.
                </p>

                <button 
                    onClick={() => navigate('/onboarding')}
                    className="w-full group flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-700/50 hover:bg-blue-50 dark:hover:bg-blue-900/20 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-200 transition-all"
                >
                    <span className="flex items-center gap-2">
                        <Settings className="w-4 h-4 text-gray-400 group-hover:text-blue-500 transition-colors" />
                        Sätze bearbeiten
                    </span>
                    <Sparkles className="w-4 h-4 text-yellow-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
            </motion.div>

            {/* Security */}
            <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 dark:border-gray-700/50 p-6"
            >
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-4">
                        <div className="bg-emerald-100 dark:bg-emerald-900/30 p-3 rounded-2xl">
                            <ShieldCheck className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-900 dark:text-white">Sicherheit</h3>
                            <p className="text-xs text-gray-500">2-Faktor-Authentifizierung</p>
                        </div>
                    </div>
                    {hasMfa && (
                        <span className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1">
                            <Check className="w-3 h-3" /> Aktiv
                        </span>
                    )}
                </div>

                <div className="space-y-4">
                    {!showMfaSetup ? (
                        <>
                            <p className="text-sm text-gray-600 dark:text-gray-300">
                                {hasMfa 
                                    ? 'Dein Account ist bestmöglich geschützt.' 
                                    : 'Erhöhe die Sicherheit deines Accounts durch einen zweiten Faktor.'}
                            </p>
                            
                            {hasMfa ? (
                                <button 
                                    onClick={() => disableMfa(mfaFactors.find(f => f.status === 'verified')?.id)}
                                    className="w-full px-4 py-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl text-sm font-medium transition-colors border border-dashed border-red-200 dark:border-red-900/50"
                                >
                                    Deaktivieren
                                </button>
                            ) : (
                                <button 
                                    onClick={startMfaSetup}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-200 dark:shadow-none transition-all hover:scale-[1.02]"
                                >
                                    <Smartphone className="w-4 h-4" />
                                    Jetzt aktivieren
                                </button>
                            )}
                        </>
                    ) : (
                        <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
                            <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-700">
                                <p className="text-xs font-medium text-center text-gray-500 mb-3">Scanne den QR-Code mit deiner App</p>
                                <div className="flex justify-center bg-white p-3 rounded-xl shadow-sm max-w-[160px] mx-auto mb-4">
                                    {mfaQrCode && <img src={mfaQrCode} alt="2FA QR Code" className="w-full h-full" />}
                                </div>
                                <div className="flex items-center gap-2 bg-white dark:bg-gray-800 p-2 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => {
                                    navigator.clipboard.writeText(mfaSecret);
                                    toast.success('Code kopiert!');
                                }}>
                                    <code className="flex-1 text-center text-[10px] font-mono text-gray-600 dark:text-gray-300 truncate">
                                        {mfaSecret}
                                    </code>
                                    <Copy className="w-3 h-3 text-gray-400" />
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <input 
                                    type="text" 
                                    placeholder="000 000" 
                                    value={verifyCode}
                                    onChange={e => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    className="w-full text-center font-mono text-lg rounded-xl border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-emerald-500"
                                    maxLength={6}
                                />
                            </div>
                            
                            <div className="grid grid-cols-2 gap-2">
                                <button 
                                    onClick={() => setShowMfaSetup(false)} 
                                    className="px-3 py-2 text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                    Abbrechen
                                </button>
                                <button 
                                    onClick={verifyAndEnableMfa}
                                    disabled={verifyCode.length !== 6}
                                    className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                                >
                                    Bestätigen
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </motion.div>
        </div>
      </div>
    </div>
  );
};
