import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { motion } from 'framer-motion';
import { Shield, Users, DollarSign, Activity, CheckCircle, XCircle, Search, MoreHorizontal, Trash2, UserCheck, UserX, BadgeCheck, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';
import { cn } from '@/utils/cn';

export const Admin = () => {
    const { profile } = useStore();
    const [stats, setStats] = useState({
        totalUsers: 0,
        pendingUsers: 0,
        totalRevenue: 0,
        activePolls: 0
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [recentActivity, setRecentActivity] = useState<any[]>([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        if (profile?.roles?.includes('admin')) {
            fetchAdminData();
        }
    }, [profile]);

    const fetchAdminData = async () => {
        setLoading(true);
        try {
            // 1. User Stats & List
            const { data: allUsers } = await supabase
                .from('profiles')
                .select('*')
                .order('created_at', { ascending: false });
            
            const totalUsers = allUsers?.length || 0;
            const pendingUsers = allUsers?.filter(u => !u.is_approved).length || 0;
            setUsers(allUsers || []);

            // 2. Revenue (Global)
            const { data: revenue } = await supabase.from('production_entries').select('commission_amount');
            const totalRevenue = revenue?.reduce((acc, curr) => acc + (curr.commission_amount || 0), 0) || 0;

            // 3. Recent Activity (Production)
            const { data: activity } = await supabase
                .from('production_entries')
                .select('*, profiles(full_name)')
                .order('created_at', { ascending: false })
                .limit(10);
            
            setStats({ totalUsers, pendingUsers, totalRevenue, activePolls: 0 });
            setRecentActivity(activity || []);

        } catch (error) {
            console.error(error);
            toast.error('Fehler beim Laden der Admin-Daten');
        } finally {
            setLoading(false);
        }
    };

    const toggleApproval = async (userId: string, currentStatus: boolean) => {
        const action = currentStatus ? 'deaktivieren' : 'freischalten';
        toast((t) => (
            <div className="flex flex-col gap-3 min-w-[250px]">
                <p className="font-bold text-gray-900 dark:text-white">Nutzer wirklich {action}?</p>
                <div className="flex gap-2">
                    <button 
                        onClick={async () => {
                            toast.dismiss(t.id);
                            try {
                                const { error } = await supabase
                                    .from('profiles')
                                    .update({ is_approved: !currentStatus })
                                    .eq('id', userId);
                                
                                if (error) throw error;
                                
                                setUsers(users.map(u => u.id === userId ? { ...u, is_approved: !currentStatus } : u));
                                toast.success(currentStatus ? 'Nutzer deaktiviert' : 'Nutzer freigeschaltet');
                            } catch (error) {
                                toast.error('Fehler beim Update');
                            }
                        }}
                        className={cn(
                            "flex-1 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors text-white",
                            currentStatus ? "bg-amber-500 hover:bg-amber-600" : "bg-emerald-500 hover:bg-emerald-600"
                        )}
                    >
                        Ja, {action}
                    </button>
                    <button 
                        onClick={() => toast.dismiss(t.id)}
                        className="flex-1 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-bold transition-colors"
                    >
                        Abbrechen
                    </button>
                </div>
            </div>
        ), { duration: 5000, position: 'top-center' });
    };

    const toggleAdmin = async (userId: string, currentRoles: string[] | null) => {
        const roles = currentRoles || [];
        const isAdmin = roles.includes('admin');
        let newRoles;
        
        if (isAdmin) {
            newRoles = roles.filter(r => r !== 'admin');
        } else {
            newRoles = [...roles, 'admin'];
        }

        try {
            const { error } = await supabase
                .from('profiles')
                .update({ roles: newRoles })
                .eq('id', userId);
            
            if (error) throw error;
            
            setUsers(users.map(u => u.id === userId ? { ...u, roles: newRoles } : u));
            toast.success(isAdmin ? 'Admin-Rechte entzogen' : 'Admin-Rechte vergeben');
        } catch (error) {
            toast.error('Fehler beim Update');
        }
    };

    const deleteUser = async (userId: string) => {
        toast((t) => (
            <div className="flex flex-col gap-3 min-w-[250px]">
                <p className="font-bold text-gray-900 dark:text-white">Nutzer wirklich löschen?</p>
                <p className="text-xs text-gray-500">Dies kann nicht rückgängig gemacht werden.</p>
                <div className="flex gap-2">
                    <button 
                        onClick={async () => {
                            toast.dismiss(t.id);
                            try {
                                const { error } = await supabase
                                    .from('profiles')
                                    .delete()
                                    .eq('id', userId);
                                
                                if (error) throw error;
                                
                                setUsers(users.filter(u => u.id !== userId));
                                toast.success('Nutzer gelöscht');
                            } catch (error) {
                                console.error(error);
                                toast.error('Fehler beim Löschen');
                            }
                        }}
                        className="flex-1 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-bold transition-colors"
                    >
                        Löschen
                    </button>
                    <button 
                        onClick={() => toast.dismiss(t.id)}
                        className="flex-1 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-bold transition-colors"
                    >
                        Abbrechen
                    </button>
                </div>
            </div>
        ), { duration: 5000, position: 'top-center' });
    };

    const filteredUsers = users.filter(u => 
        u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (!profile?.roles?.includes('admin')) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="text-center space-y-4">
                    <Shield className="w-16 h-16 text-gray-300 mx-auto" />
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Zugriff verweigert</h2>
                    <p className="text-gray-500">Du benötigst Administrator-Rechte für diesen Bereich.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 pb-20">
            <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-between"
            >
                <div>
                    <h1 className="text-3xl font-black text-gray-900 dark:text-white flex items-center gap-3">
                        <Shield className="w-8 h-8 text-indigo-600" />
                        Admin Dashboard
                    </h1>
                    <p className="text-gray-500 mt-2">Globale Übersicht und Benutzerverwaltung.</p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
                        <CheckCircle className="w-3 h-3" /> System Online
                    </span>
                </div>
            </motion.div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-blue-600 dark:text-blue-400">
                            <Users className="w-6 h-6" />
                        </div>
                        {stats.pendingUsers > 0 && (
                            <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full animate-pulse">
                                {stats.pendingUsers} Warten
                            </span>
                        )}
                    </div>
                    <p className="text-sm text-gray-500 font-medium">Nutzer Gesamt</p>
                    <p className="text-3xl font-black text-gray-900 dark:text-white">{stats.totalUsers}</p>
                </div>

                <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-xl text-green-600 dark:text-green-400">
                            <DollarSign className="w-6 h-6" />
                        </div>
                    </div>
                    <p className="text-sm text-gray-500 font-medium">Umsatz (YTD)</p>
                    <p className="text-3xl font-black text-gray-900 dark:text-white">
                        {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(stats.totalRevenue)}
                    </p>
                </div>

                <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-xl text-purple-600 dark:text-purple-400">
                            <Activity className="w-6 h-6" />
                        </div>
                    </div>
                    <p className="text-sm text-gray-500 font-medium">Letzte Aktivität</p>
                    <p className="text-sm font-bold text-gray-900 dark:text-white mt-1">
                        {recentActivity[0] ? format(new Date(recentActivity[0].created_at), 'dd.MM. HH:mm') : '-'}
                    </p>
                </div>
            </div>

            {/* User Management Section */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">Benutzerverwaltung</h2>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input 
                            type="text" 
                            placeholder="Nutzer suchen..." 
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="pl-10 pr-4 py-2 rounded-xl border-none bg-white dark:bg-gray-800 shadow-sm focus:ring-2 focus:ring-indigo-500/20 text-sm"
                        />
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50/50 dark:bg-gray-900/50">
                                <tr>
                                    <th className="px-6 py-4 font-semibold text-gray-500">Nutzer</th>
                                    <th className="px-6 py-4 font-semibold text-gray-500">Rollen</th>
                                    <th className="px-6 py-4 font-semibold text-gray-500">Status</th>
                                    <th className="px-6 py-4 font-semibold text-gray-500">Beitritt</th>
                                    <th className="px-6 py-4 font-semibold text-gray-500 text-right">Aktionen</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                {filteredUsers.map((u) => (
                                    <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <img 
                                                    src={u.avatar_url || `https://ui-avatars.com/api/?name=${u.full_name}&background=random`} 
                                                    alt="" 
                                                    className="w-10 h-10 rounded-full bg-gray-100 object-cover"
                                                />
                                                <div>
                                                    <div className="font-bold text-gray-900 dark:text-white">{u.full_name}</div>
                                                    <div className="text-xs text-gray-500">{u.email}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex gap-1 flex-wrap">
                                                {u.roles?.map((r: string) => (
                                                    <span key={r} className={cn(
                                                        "px-2 py-0.5 rounded-md text-xs font-medium border",
                                                        r === 'admin' 
                                                            ? "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-300"
                                                            : "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-700 dark:text-gray-300"
                                                    )}>
                                                        {r}
                                                    </span>
                                                ))}
                                                {(!u.roles || u.roles.length === 0) && <span className="text-gray-400 text-xs">-</span>}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {u.is_approved ? (
                                                <span className="inline-flex items-center gap-1 text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full text-xs font-bold dark:bg-emerald-900/20 dark:text-emerald-400">
                                                    <CheckCircle className="w-3 h-3" /> Aktiv
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 text-amber-600 bg-amber-50 px-2 py-1 rounded-full text-xs font-bold dark:bg-amber-900/20 dark:text-amber-400">
                                                    <Clock className="w-3 h-3" /> Wartet
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-gray-500">
                                            {format(new Date(u.created_at), 'dd.MM.yyyy')}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => toggleApproval(u.id, u.is_approved)}
                                                    className={cn(
                                                        "p-2 rounded-lg transition-colors",
                                                        u.is_approved 
                                                            ? "text-gray-400 hover:text-amber-600 hover:bg-amber-50" 
                                                            : "text-emerald-600 bg-emerald-50 hover:bg-emerald-100"
                                                    )}
                                                    title={u.is_approved ? "Deaktivieren" : "Freischalten"}
                                                >
                                                    {u.is_approved ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                                                </button>
                                                
                                                <button
                                                    onClick={() => toggleAdmin(u.id, u.roles)}
                                                    className={cn(
                                                        "p-2 rounded-lg transition-colors",
                                                        u.roles?.includes('admin')
                                                            ? "text-purple-600 bg-purple-50 hover:bg-purple-100"
                                                            : "text-gray-400 hover:text-purple-600 hover:bg-purple-50"
                                                    )}
                                                    title="Admin-Rechte umschalten"
                                                >
                                                    <BadgeCheck className="w-4 h-4" />
                                                </button>

                                                <button
                                                    onClick={() => deleteUser(u.id)}
                                                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                    title="Löschen"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Recent Activity Table */}
            <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div className="p-6 border-b border-gray-100 dark:border-gray-700">
                    <h3 className="font-bold text-lg">Neueste Einreichungen (Global)</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 dark:bg-gray-900/50">
                            <tr>
                                <th className="px-6 py-4 font-semibold text-gray-500">Mitarbeiter</th>
                                <th className="px-6 py-4 font-semibold text-gray-500">Kunde</th>
                                <th className="px-6 py-4 font-semibold text-gray-500">Sparte</th>
                                <th className="px-6 py-4 font-semibold text-gray-500 text-right">Provision</th>
                                <th className="px-6 py-4 font-semibold text-gray-500 text-right">Zeit</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                            {recentActivity.map((entry) => (
                                <tr key={entry.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                    <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">
                                        {entry.profiles?.full_name || 'Unbekannt'}
                                    </td>
                                    <td className="px-6 py-4 text-gray-600 dark:text-gray-300">
                                        {entry.customer_name}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded-lg text-xs font-medium">
                                            {entry.category}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right font-bold text-green-600">
                                        {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(entry.commission_amount)}
                                    </td>
                                    <td className="px-6 py-4 text-right text-gray-400 text-xs">
                                        {format(new Date(entry.created_at), 'dd.MM. HH:mm')}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
