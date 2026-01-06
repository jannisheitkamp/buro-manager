import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { UserCircle, Save, LogOut, ShieldCheck, Smartphone, Copy, Check } from 'lucide-react';
import { toast } from 'react-hot-toast';
import QRCode from 'qrcode';

export const ProfilePage = () => {
  const { user, profile, fetchProfile, signOut } = useStore();
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
        issuer: 'Trae AI',
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
    <div className="max-w-2xl mx-auto space-y-8 pb-20">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
        <UserCircle className="w-8 h-8" />
        Mein Profil
      </h1>

      {/* Main Profile Card */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-8">
        <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-6">
                <img
                  src={avatarUrl || `https://ui-avatars.com/api/?name=${fullName || 'User'}&background=random`}
                  alt={fullName}
                  className="w-20 h-20 rounded-full object-cover shadow-sm bg-gray-100"
                />
                <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">{fullName || 'Dein Name'}</h2>
                    <p className="text-gray-500 dark:text-gray-400">{user?.email}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                        {profile?.roles?.map(role => (
                            <span key={role} className="inline-block px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs text-gray-600 dark:text-gray-300 capitalize">
                                {role.replace(/_/g, ' ')}
                            </span>
                        ))}
                    </div>
                </div>
            </div>
            
            <button
                onClick={() => navigate('/onboarding')}
                className="hidden sm:flex items-center gap-2 px-4 py-2 text-sm text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors border border-indigo-100"
            >
                <Settings className="w-4 h-4" />
                Provisionssätze
            </button>
        </div>

        <form onSubmit={handleUpdate} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Vollständiger Name
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Max Mustermann"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Adresse (für Formulare)
            </label>
            <textarea
              rows={3}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Musterstraße 1&#10;12345 Musterstadt"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Avatar URL (Optional)
            </label>
            <input
              type="url"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="https://example.com/avatar.jpg"
            />
            <p className="text-xs text-gray-500 mt-1">
                Lassen Sie dieses Feld leer, um einen automatisch generierten Avatar zu verwenden.
            </p>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-700">
             <button
                type="button"
                onClick={() => signOut()}
                className="text-red-600 hover:text-red-700 text-sm font-medium flex items-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                Abmelden
              </button>
            
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Speichert...' : 'Speichern'}
            </button>
          </div>
        </form>
      </div>

      {/* Security & 2FA Section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-8">
        <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
                <div className="bg-indigo-50 dark:bg-indigo-900/30 p-2 rounded-lg">
                    <ShieldCheck className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">Sicherheit</h3>
                    <p className="text-sm text-gray-500">2-Faktor-Authentifizierung (2FA)</p>
                </div>
            </div>
            {hasMfa && (
                <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                    <Check className="w-3 h-3" /> Aktiv
                </span>
            )}
        </div>

        <div className="mt-6 border-t border-gray-100 dark:border-gray-700 pt-6">
            {!showMfaSetup ? (
                <div>
                    {hasMfa ? (
                        <div className="space-y-4">
                            <p className="text-sm text-gray-600 dark:text-gray-300">
                                Dein Account ist durch 2FA geschützt. Beim Login wird zusätzlich ein Code abgefragt.
                            </p>
                            <button 
                                onClick={() => disableMfa(mfaFactors.find(f => f.status === 'verified')?.id)}
                                className="text-red-600 hover:text-red-700 text-sm font-medium border border-red-200 px-4 py-2 rounded-lg hover:bg-red-50 transition-colors"
                            >
                                2FA deaktivieren
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <p className="text-sm text-gray-600 dark:text-gray-300">
                                Schütze deinen Account zusätzlich mit einer Authenticator-App (z.B. Google Authenticator, Microsoft Authenticator).
                            </p>
                            <button 
                                onClick={startMfaSetup}
                                className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2"
                            >
                                <Smartphone className="w-4 h-4" />
                                Jetzt einrichten
                            </button>
                        </div>
                    )}
                </div>
            ) : (
                <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-lg border border-indigo-100 dark:border-indigo-800">
                        <h4 className="font-semibold text-indigo-900 dark:text-indigo-300 mb-2">1. Scanne den QR-Code</h4>
                        <p className="text-xs text-indigo-700 dark:text-indigo-400 mb-4">
                            Öffne deine Authenticator-App und scanne diesen Code.
                        </p>
                        <div className="flex justify-center bg-white p-4 rounded-xl shadow-sm max-w-[200px] mx-auto">
                            {mfaQrCode && <img src={mfaQrCode} alt="2FA QR Code" className="w-full h-full" />}
                        </div>
                        <div className="mt-4 text-center">
                            <p className="text-xs text-gray-500 mb-1">Code wird nicht erkannt?</p>
                            <code className="bg-white dark:bg-gray-900 px-2 py-1 rounded text-xs font-mono select-all cursor-pointer" onClick={() => {
                                navigator.clipboard.writeText(mfaSecret);
                                toast.success('Kopiert!');
                            }}>
                                {mfaSecret} <Copy className="w-3 h-3 inline ml-1" />
                            </code>
                        </div>
                    </div>

                    <div>
                        <h4 className="font-semibold text-gray-900 dark:text-white mb-2">2. Code eingeben</h4>
                        <p className="text-xs text-gray-500 mb-3">
                            Gib den 6-stelligen Code aus deiner App ein, um die Einrichtung abzuschließen.
                        </p>
                        <div className="flex gap-2">
                            <input 
                                type="text" 
                                placeholder="000 000" 
                                value={verifyCode}
                                onChange={e => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                className="w-32 text-center text-lg tracking-widest font-mono rounded-lg border-gray-300 focus:ring-indigo-500"
                            />
                            <button 
                                onClick={verifyAndEnableMfa}
                                disabled={verifyCode.length !== 6}
                                className="flex-1 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                Aktivieren
                            </button>
                        </div>
                        <button onClick={() => setShowMfaSetup(false)} className="mt-4 text-xs text-gray-400 hover:text-gray-600">
                            Abbrechen
                        </button>
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};
