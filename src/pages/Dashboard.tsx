import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { Profile, UserStatus } from '@/types';
import { formatDistanceToNow, format, startOfMonth, endOfMonth } from 'date-fns';
import { de } from 'date-fns/locale';
import { 
  Briefcase, 
  Home, 
  Coffee, 
  Users, 
  Palmtree, 
  ThermometerSun, 
  LogOut,
  MessageSquare,
  Phone,
  ArrowRight,
  Package,
  Plus,
  TrendingUp,
  Euro
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { motion } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

type StatusOption = {
  value: UserStatus['status'];
  label: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any;
  color: string;
};

const STATUS_OPTIONS: StatusOption[] = [
  { value: 'office', label: 'Im Büro', icon: Briefcase, color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
  { value: 'remote', label: 'Home Office', icon: Home, color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  { value: 'break', label: 'Pause', icon: Coffee, color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' },
  { value: 'meeting', label: 'Termin', icon: Users, color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' },
  { value: 'vacation', label: 'Urlaub', icon: Palmtree, color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300' },
  { value: 'sick', label: 'Krank', icon: ThermometerSun, color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
  { value: 'off', label: 'Feierabend', icon: LogOut, color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300' },
];

type UserWithStatus = Profile & {
  current_status?: UserStatus;
};

// Helper to format currency
const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
};

export const Dashboard = () => {
  const user = useStore((state) => state.user);
  const profile = useStore((state) => state.profile);
  const [colleagues, setColleagues] = useState<UserWithStatus[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [openCallbacks, setOpenCallbacks] = useState<any[]>([]);
  const [stats, setStats] = useState({
    callbacksCount: 0,
    parcelsCount: 0,
    officeCount: 0,
    monthlyCommission: 0
  });
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  const chartData = [
    { name: 'Mo', calls: 4 },
    { name: 'Di', calls: 7 },
    { name: 'Mi', calls: 5 },
    { name: 'Do', calls: 8 },
    { name: 'Fr', calls: 6 },
    { name: 'Sa', calls: 1 },
    { name: 'So', calls: 0 },
  ];

  const fetchData = async () => {
    if (!user) return;
    
    // 1. Fetch Callbacks (assigned or pool)
    const { data: cbData, count: cbCount } = await supabase
        .from('callbacks')
        .select('*', { count: 'exact' })
        .neq('status', 'done')
        .or(`assigned_to.eq.${user.id},assigned_to.is.null`)
        .order('priority', { ascending: false });
    
    setOpenCallbacks(cbData?.slice(0, 3) || []);

    // 2. Fetch Parcels (pending)
    const { count: parcelCount } = await supabase
        .from('parcels')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

    // 3. Fetch Production Stats (Current Month)
    const start = startOfMonth(new Date()).toISOString();
    const end = endOfMonth(new Date()).toISOString();
    
    const { data: productionData } = await supabase
        .from('production_entries')
        .select('commission_amount')
        .gte('submission_date', start)
        .lte('submission_date', end);
        
    const monthlyCommission = productionData?.reduce((sum, entry) => sum + (entry.commission_amount || 0), 0) || 0;

    // 4. Fetch Colleagues & Status
    const { data: profiles } = await supabase.from('profiles').select('*');
    const { data: statuses } = await supabase
      .from('user_status')
      .select('*')
      .order('updated_at', { ascending: false });

    const merged = profiles?.map(p => ({
        ...p,
        current_status: statuses?.find(s => s.user_id === p.id)
    })) || [];

    setColleagues(merged);
    
    const officeCount = merged.filter(c => c.current_status?.status === 'office').length;

    setStats({
        callbacksCount: cbCount || 0,
        parcelsCount: parcelCount || 0,
        officeCount,
        monthlyCommission
    });

    setLoading(false);
  };

  useEffect(() => {
    fetchData();

    // Realtime subscriptions
    const sub1 = supabase.channel('dash_status').on('postgres_changes', { event: '*', schema: 'public', table: 'user_status' }, fetchData).subscribe();
    const sub2 = supabase.channel('dash_cb').on('postgres_changes', { event: '*', schema: 'public', table: 'callbacks' }, fetchData).subscribe();
    const sub3 = supabase.channel('dash_parcels').on('postgres_changes', { event: '*', schema: 'public', table: 'parcels' }, fetchData).subscribe();
    // Also listen to production changes to update the widget live
    const sub4 = supabase.channel('dash_prod').on('postgres_changes', { event: '*', schema: 'public', table: 'production_entries' }, fetchData).subscribe();

    return () => {
      sub1.unsubscribe();
      sub2.unsubscribe();
      sub3.unsubscribe();
      sub4.unsubscribe();
    };
  }, [user]);

  const handleStatusUpdate = async (status: UserStatus['status']) => {
    if (!user) return;

    const { error } = await supabase
      .from('user_status')
      .insert({
        user_id: user.id,
        status,
        message: statusMessage || null,
        updated_at: new Date().toISOString()
      });

    if (error) {
      console.error('Error updating status:', error);
      toast.error('Fehler beim Aktualisieren des Status');
    } else {
      setStatusMessage('');
      toast.success('Status aktualisiert');
    }
  };

  if (loading) return <div className="p-8 text-center">Lade Cockpit...</div>;

  const myStatus = colleagues.find(c => c.id === user?.id)?.current_status;

  const filteredColleagues = colleagues.filter(colleague => {
    const searchLower = searchQuery.toLowerCase();
    const name = (colleague.full_name || '').toLowerCase();
    const statusLabel = STATUS_OPTIONS.find(o => o.value === colleague.current_status?.status)?.label.toLowerCase() || '';
    return name.includes(searchLower) || statusLabel.includes(searchLower);
  });

  return (
    <div className="space-y-8 pb-12">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                Guten Morgen, {profile?.full_name?.split(' ')[0] || 'Nutzer'}! 👋
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
                Heute ist {format(new Date(), 'EEEE, d. MMMM', { locale: de })}.
            </p>
        </div>
        <div className="flex gap-2">
            <button 
                onClick={() => navigate('/production')}
                className="bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 px-4 py-2 rounded-lg font-medium transition-colors hover:bg-gray-50 flex items-center gap-2"
            >
                <TrendingUp className="w-4 h-4" />
                Umsatz
            </button>
            <button 
                onClick={() => navigate('/callbacks')}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-lg shadow-indigo-200 dark:shadow-none flex items-center gap-2"
            >
                <Plus className="w-4 h-4" />
                Rückruf
            </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
        <motion.div 
            whileHover={{ y: -5 }}
            className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center justify-between"
        >
            <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Offene Rückrufe</p>
                <h3 className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{stats.callbacksCount}</h3>
            </div>
            <div className="w-12 h-12 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center text-red-600 dark:text-red-400">
                <Phone className="w-6 h-6" />
            </div>
        </motion.div>

        <motion.div 
            whileHover={{ y: -5 }}
            className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center justify-between"
        >
            <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Pakete erwartet</p>
                <h3 className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{stats.parcelsCount}</h3>
            </div>
            <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400">
                <Package className="w-6 h-6" />
            </div>
        </motion.div>

        <motion.div 
            whileHover={{ y: -5 }}
            className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center justify-between"
        >
            <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Im Büro</p>
                <h3 className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{stats.officeCount}</h3>
            </div>
            <div className="w-12 h-12 bg-green-50 dark:bg-green-900/20 rounded-full flex items-center justify-center text-green-600 dark:text-green-400">
                <Users className="w-6 h-6" />
            </div>
        </motion.div>

        {/* New Revenue Widget */}
        <motion.div 
            whileHover={{ y: -5 }}
            className="bg-gradient-to-br from-indigo-600 to-purple-700 p-6 rounded-2xl shadow-lg shadow-indigo-200 dark:shadow-none flex items-center justify-between text-white"
        >
            <div>
                <p className="text-sm font-medium text-indigo-100">Provision (Monat)</p>
                <h3 className="text-2xl font-bold mt-1">{formatCurrency(stats.monthlyCommission)}</h3>
            </div>
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center text-white backdrop-blur-sm">
                <Euro className="w-6 h-6" />
            </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content (Left 2 cols) */}
        <div className="lg:col-span-2 space-y-8">
            
            {/* My Status */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-indigo-500" />
                    Mein Status
                </h2>
                
                <div className="flex gap-4 mb-6">
                    <div className="flex-1 relative">
                        <input
                        type="text"
                        placeholder="Nachricht (z.B. 'Im Meeting bis 14 Uhr')"
                        className="block w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border-none rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-indigo-500"
                        value={statusMessage}
                        onChange={(e) => setStatusMessage(e.target.value)}
                        />
                    </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
                {STATUS_OPTIONS.map((option) => {
                    const Icon = option.icon;
                    const isSelected = myStatus?.status === option.value;
                    return (
                    <button
                        key={option.value}
                        onClick={() => handleStatusUpdate(option.value)}
                        className={cn(
                        "flex flex-col items-center justify-center p-3 rounded-xl border transition-all duration-200",
                        isSelected 
                            ? "ring-2 ring-offset-2 ring-indigo-500 border-transparent shadow-md dark:ring-offset-gray-800 scale-105" 
                            : "border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 hover:scale-105",
                        option.color
                        )}
                    >
                        <Icon className="h-6 w-6 mb-2" />
                        <span className="text-xs font-medium">{option.label}</span>
                    </button>
                    );
                })}
                </div>
            </div>

            {/* Colleagues List */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">Team Status</h2>
                    <input
                        type="text"
                        placeholder="Suchen..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="bg-gray-50 dark:bg-gray-900 border-none rounded-lg px-3 py-1.5 text-sm w-40 focus:ring-2 focus:ring-indigo-500"
                    />
                </div>
                <div className="max-h-[400px] overflow-y-auto">
                    {filteredColleagues.map((colleague) => {
                        const status = colleague.current_status;
                        const statusConfig = STATUS_OPTIONS.find(o => o.value === status?.status);
                        
                        return (
                            <div key={colleague.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors border-b border-gray-50 dark:border-gray-700/50 last:border-0 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
                                        {colleague.full_name?.charAt(0) || '?'}
                                    </div>
                                    <div>
                                        <p className="font-medium text-gray-900 dark:text-white">{colleague.full_name}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">{statusConfig?.label || 'Abwesend'}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    {status?.message && <span className="text-xs italic text-gray-500 block">"{status.message}"</span>}
                                    {status?.updated_at && <span className="text-[10px] text-gray-400 block">{formatDistanceToNow(new Date(status.updated_at), { locale: de })}</span>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

        </div>

        {/* Sidebar Widgets (Right Col) */}
        <div className="space-y-8">
            
            {/* Callbacks Widget */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden h-full flex flex-col">
                <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-red-50/50 dark:bg-red-900/10 flex items-center justify-between shrink-0">
                    <h3 className="font-bold text-red-700 dark:text-red-400 flex items-center gap-2">
                        <Phone className="w-4 h-4" /> Wichtig
                    </h3>
                    <Link to="/callbacks" className="text-xs font-medium text-red-600 hover:underline">Alle ansehen</Link>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-gray-700 overflow-y-auto flex-1">
                    {openCallbacks.length === 0 ? (
                        <div className="p-8 text-center text-gray-400 text-sm">Alles erledigt! ✅</div>
                    ) : (
                        openCallbacks.map(cb => (
                            <div key={cb.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                                <div className="flex justify-between items-start mb-1">
                                    <span className="font-semibold text-gray-900 dark:text-white text-sm">{cb.customer_name}</span>
                                    {cb.priority === 'high' && <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />}
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{cb.topic}</p>
                                <div className="mt-2 flex justify-between items-center">
                                    <a href={`tel:${cb.phone}`} className="text-xs text-indigo-600 font-medium hover:underline">{cb.phone}</a>
                                    <span className="text-[10px] text-gray-400">{format(new Date(cb.created_at), 'HH:mm')}</span>
                                </div>
                            </div>
                        ))
                    )}
                    {/* Placeholder to fill space if few callbacks */}
                    {openCallbacks.length > 0 && openCallbacks.length < 5 && (
                        <div className="p-4 text-center text-xs text-gray-300 italic">
                            Keine weiteren dringenden Rückrufe.
                        </div>
                    )}
                </div>
            </div>

        </div>
      </div>
    </div>
  );
};
