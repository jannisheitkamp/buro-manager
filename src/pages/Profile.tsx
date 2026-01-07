import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { motion } from 'framer-motion';
import { User, Lock, Save, Briefcase, Mail, Key, Shield, Upload, DollarSign } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { cn } from '@/utils/cn';

export const ProfilePage = () => {
    const { user, profile } = useStore();
    const [loading, setLoading] = useState(false);

    // Profile State
    const [fullName, setFullName] = useState('');
    const [avatarUrl, setAvatarUrl] = useState('');
    
    // Password State
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    // Commission Rates State
    // Default values for standard German insurance products
    const [rates, setRates] = useState({
        'Leben': 8.0,
        'BU': 8.0,
        'KV Voll': 3.0,
        'KV Zusatz': 3.0,
        'Reise-KV': 10.0,
        'PHV': 7.5,
        'HR': 7.5,
        'UNF': 7.5,
        'Sach': 7.5,
        'KFZ': 3.0,
        'Rechtsschutz': 5.0,
        'Sonstige': 5.0
    });

    useEffect(() => {
        if (profile) {
            setFullName(profile.full_name || '');
            setAvatarUrl(profile.avatar_url || '');
            fetchUserRates();
        }
    }, [profile]);

    const fetchUserRates = async () => {
        if (!user) return;
        const { data } = await supabase.from('user_commission_settings').select('*').eq('user_id', user.id);
        
        if (data && data.length > 0) {
            const newRates = { ...rates };
            data.forEach((row: any) => {
                if (row.sub_category && newRates.hasOwnProperty(row.sub_category)) {
                    // @ts-ignore
                    newRates[row.sub_category] = Number(row.rate_value);
                }
            });
            setRates(newRates);
        }
    };

    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        setLoading(true);

        try {
            const { error } = await supabase
                .from('profiles')
                .update({ 
                    full_name: fullName,
                    avatar_url: avatarUrl 
                })
                .eq('id', user.id);

            if (error) throw error;
            toast.success('Profil aktualisiert');
        } catch (error) {
            console.error(error);
            toast.error('Fehler beim Speichern');
        } finally {
            setLoading(false);
        }
    };

    const handleUpdatePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== confirmPassword) {
            toast.error('Passwörter stimmen nicht überein');
            return;
        }
        if (password.length < 6) {
            toast.error('Passwort muss mind. 6 Zeichen haben');
            return;
        }
        setLoading(true);

        try {
            const { error } = await supabase.auth.updateUser({ password });
            if (error) throw error;
            toast.success('Passwort geändert');
            setPassword('');
            setConfirmPassword('');
        } catch (error) {
            console.error(error);
            toast.error('Fehler beim Ändern');
        } finally {
            setLoading(false);
        }
    };

    const handleSaveRates = async () => {
        if (!user) return;
        setLoading(true);
        try {
            // Delete old settings (simple way to update all)
            await supabase.from('user_commission_settings').delete().eq('user_id', user.id);
            
            // Insert new
            const inserts = Object.entries(rates).map(([key, val]) => ({
                user_id: user.id,
                sub_category: key,
                rate_value: val,
                updated_at: new Date().toISOString()
            }));

            const { error } = await supabase.from('user_commission_settings').insert(inserts);
            if (error) throw error;
            
            toast.success('Provisionssätze gespeichert');
        } catch (err) {
            console.error(err);
            toast.error('Fehler beim Speichern');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-8 pb-24">
            <motion.h1 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-3xl font-black text-gray-900 dark:text-white flex items-center gap-3"
            >
                <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-2xl">
                    <User className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
                </div>
                Mein Profil
            </motion.h1>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* Left Column: Personal Info & Password */}
                <div className="lg:col-span-1 space-y-8">
                    {/* Personal Info Card */}
                    <motion.div 
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-700"
                    >
                        <h2 className="font-bold text-lg mb-6 flex items-center gap-2">
                            <Briefcase className="w-5 h-5 text-gray-400" />
                            Stammdaten
                        </h2>
                        
                        <form onSubmit={handleUpdateProfile} className="space-y-4">
                            <div className="flex justify-center mb-6">
                                <div className="relative group">
                                    <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500 to-purple-500 rounded-full blur opacity-20 group-hover:opacity-40 transition-opacity" />
                                    <img 
                                        src={avatarUrl || `https://ui-avatars.com/api/?name=${fullName}&background=random`} 
                                        alt="Avatar" 
                                        className="w-24 h-24 rounded-full object-cover ring-4 ring-white dark:ring-gray-700 relative z-10"
                                    />
                                    {/* Mock Upload Button */}
                                    <div className="absolute bottom-0 right-0 z-20 bg-indigo-600 text-white p-1.5 rounded-full shadow-lg cursor-pointer hover:bg-indigo-700 transition-colors" title="Bild ändern (Demo)">
                                        <Upload className="w-3.5 h-3.5" />
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Name</label>
                                <input 
                                    type="text" 
                                    value={fullName}
                                    onChange={e => setFullName(e.target.value)}
                                    className="w-full rounded-xl bg-gray-50 dark:bg-gray-900 border-transparent focus:bg-white focus:ring-2 focus:ring-indigo-500/20 px-4 py-2.5 text-sm transition-all"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">E-Mail</label>
                                <div className="relative opacity-70">
                                    <Mail className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                                    <input 
                                        type="email" 
                                        value={user?.email || ''}
                                        disabled
                                        className="w-full rounded-xl bg-gray-100 dark:bg-gray-900 border-transparent pl-10 px-4 py-2.5 text-sm cursor-not-allowed"
                                    />
                                </div>
                            </div>
                            
                            <div className="pt-2">
                                <button type="submit" disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl shadow-lg shadow-indigo-500/20 transition-all active:scale-95 flex items-center justify-center gap-2">
                                    <Save className="w-4 h-4" /> Speichern
                                </button>
                            </div>
                        </form>
                    </motion.div>

                    {/* Password Card */}
                    <motion.div 
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 }}
                        className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-700"
                    >
                        <h2 className="font-bold text-lg mb-6 flex items-center gap-2">
                            <Lock className="w-5 h-5 text-gray-400" />
                            Sicherheit
                        </h2>
                        
                        <form onSubmit={handleUpdatePassword} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Neues Passwort</label>
                                <div className="relative">
                                    <Key className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                                    <input 
                                        type="password" 
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        className="w-full rounded-xl bg-gray-50 dark:bg-gray-900 border-transparent focus:bg-white focus:ring-2 focus:ring-indigo-500/20 pl-10 px-4 py-2.5 text-sm transition-all"
                                        placeholder="••••••••"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Bestätigen</label>
                                <div className="relative">
                                    <Key className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                                    <input 
                                        type="password" 
                                        value={confirmPassword}
                                        onChange={e => setConfirmPassword(e.target.value)}
                                        className="w-full rounded-xl bg-gray-50 dark:bg-gray-900 border-transparent focus:bg-white focus:ring-2 focus:ring-indigo-500/20 pl-10 px-4 py-2.5 text-sm transition-all"
                                        placeholder="••••••••"
                                    />
                                </div>
                            </div>
                             <div className="pt-2">
                                <button type="submit" disabled={loading || !password} className="w-full bg-gray-900 dark:bg-gray-700 hover:bg-gray-800 text-white font-bold py-2.5 rounded-xl transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                                    Passwort ändern
                                </button>
                            </div>
                        </form>
                    </motion.div>
                </div>

                {/* Right Column: Commission Settings */}
                <motion.div 
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                    className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 h-fit"
                >
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h2 className="font-bold text-lg flex items-center gap-2">
                                <DollarSign className="w-5 h-5 text-gray-400" />
                                Meine Provisionssätze
                            </h2>
                            <p className="text-sm text-gray-500 mt-1">
                                Diese Werte werden automatisch für neue Verträge in der Produktion vorselektiert.
                            </p>
                        </div>
                        <button 
                            onClick={handleSaveRates}
                            disabled={loading}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-bold text-sm shadow-lg shadow-indigo-500/20 transition-all hover:scale-105 active:scale-95 flex items-center gap-2"
                        >
                            <Save className="w-4 h-4" /> Speichern
                        </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
                        {Object.entries(rates).map(([key, value]) => (
                            <div key={key} className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors border border-transparent hover:border-gray-100 dark:hover:border-gray-700">
                                <div className="flex items-center gap-3">
                                    <div className={cn(
                                        "w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold",
                                        ['Leben', 'BU'].includes(key) ? "bg-green-100 text-green-700" :
                                        ['KV Voll', 'KV Zusatz', 'Reise-KV'].includes(key) ? "bg-blue-100 text-blue-700" :
                                        "bg-orange-100 text-orange-700"
                                    )}>
                                        {key.substring(0, 2).toUpperCase()}
                                    </div>
                                    <span className="font-medium text-gray-700 dark:text-gray-300">{key}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <input 
                                        type="number" 
                                        step="0.1"
                                        value={value}
                                        onChange={(e) => setRates(prev => ({ ...prev, [key]: Number(e.target.value) }))}
                                        className="w-20 text-right font-mono font-bold bg-gray-50 dark:bg-gray-900 border-none rounded-lg focus:ring-2 focus:ring-indigo-500/20 py-1.5"
                                    />
                                    <span className="text-xs font-medium text-gray-400 w-6">
                                        {key === 'Leben' || key === 'BU' ? '‰' : (key === 'KV Voll' || key === 'KV Zusatz' ? 'MB' : '%')}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>
            </div>
        </div>
    );
};
