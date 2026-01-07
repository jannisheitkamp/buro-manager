import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { motion } from 'framer-motion';
import { Shield, Users, DollarSign, Activity, CheckCircle, XCircle, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';

export const Admin = () => {
    const { profile } = useStore();
    const [stats, setStats] = useState({
        totalUsers: 0,
        pendingUsers: 0,
        totalRevenue: 0,
        activePolls: 0
    });
    const [recentActivity, setRecentActivity] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (profile?.roles?.includes('admin')) {
            fetchAdminData();
        }
    }, [profile]);

    const fetchAdminData = async () => {
        setLoading(true);
        try {
            // 1. User Stats
            const { data: users } = await supabase.from('profiles').select('is_approved');
            const totalUsers = users?.length || 0;
            const pendingUsers = users?.filter(u => !u.is_approved).length || 0;

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
        <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8">
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
                    <p className="text-gray-500 mt-2">Globale Übersicht und Systemstatus.</p>
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
                            <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
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
