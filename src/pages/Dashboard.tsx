import { useEffect, useState } from 'react';
// Bento Grid Dashboard Layout
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { Profile, UserStatus } from '@/types';
import { formatDistanceToNow, format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { de } from 'date-fns/locale';
import { 
  Briefcase, 
  Home, 
  Coffee, 
  Users, 
  Palmtree, 
  ThermometerSun, 
  LogOut,
  Phone,
  Package,
  TrendingUp,
  Clock,
  MessageSquare,
  BarChart as BarChartIcon,
  GraduationCap,
  ArrowUpRight,
  Sparkles
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { motion } from 'framer-motion';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';

// --- Types ---

type StatusType = UserStatus['status'];

interface StatusConfig {
  value: StatusType;
  label: string;
  icon: any;
  // Separate classes for light/dark mode for better visibility
  className: string; 
}

const STATUS_CONFIG: StatusConfig[] = [
  { value: 'office', label: 'Im Büro', icon: Briefcase, className: 'text-emerald-700 bg-emerald-100 dark:text-emerald-200 dark:bg-emerald-900/50' },
  { value: 'remote', label: 'Home Office', icon: Home, className: 'text-blue-700 bg-blue-100 dark:text-blue-200 dark:bg-blue-900/50' },
  { value: 'break', label: 'Pause', icon: Coffee, className: 'text-amber-700 bg-amber-100 dark:text-amber-200 dark:bg-amber-900/50' },
  { value: 'meeting', label: 'Im Termin', icon: Users, className: 'text-purple-700 bg-purple-100 dark:text-purple-200 dark:bg-purple-900/50' },
  { value: 'vacation', label: 'Urlaub', icon: Palmtree, className: 'text-indigo-700 bg-indigo-100 dark:text-indigo-200 dark:bg-indigo-900/50' },
  { value: 'sick', label: 'Krank', icon: ThermometerSun, className: 'text-red-700 bg-red-100 dark:text-red-200 dark:bg-red-900/50' },
  { value: 'seminar', label: 'Seminar', icon: GraduationCap, className: 'text-blue-700 bg-blue-100 dark:text-blue-200 dark:bg-blue-900/50' },
  { value: 'off', label: 'Feierabend', icon: LogOut, className: 'text-gray-700 bg-gray-100 dark:text-gray-300 dark:bg-gray-700/50' },
];

// --- Helper Components ---

const StatusBadge = ({ status }: { status: StatusType }) => {
  const config = STATUS_CONFIG.find(c => c.value === status) || STATUS_CONFIG[6];
  const Icon = config.icon;
  return (
    <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border border-transparent", config.className)}>
      <Icon className="w-3.5 h-3.5" />
      {config.label}
    </div>
  );
};

// --- Main Dashboard ---

export const Dashboard = () => {
  const { user, profile } = useStore();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  // Data State
  const [colleagues, setColleagues] = useState<(Profile & { current_status?: UserStatus })[]>([]);
  const [myTasks, setMyTasks] = useState<any[]>([]); // Callbacks + Events merged
  const [parcels, setParcels] = useState<any[]>([]);
  const [boardMessages, setBoardMessages] = useState<any[]>([]);
  const [stats, setStats] = useState({
    monthlyCommission: 0,
    monthlyLifeValues: 0,
    openCallbacks: 0,
    pendingParcels: 0,
    monthlyGoal: 10000 // Default goal
  });
  const [revenueData, setRevenueData] = useState<{name: string, value: number}[]>([]);
  const [scriptOpen, setScriptOpen] = useState<string | null>(null); // New: Anruf-Skript Overlay ID
  
  // Prediction Logic
  const getTrendPrediction = () => {
    const today = new Date().getDate();
    const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const progress = today / daysInMonth;
    
    // Simple linear projection based on current stats
    // Formula: (Current / DaysPassed) * TotalDays
    const projectedLifeValues = Math.round((stats.monthlyLifeValues / today) * daysInMonth);
    const projectedCommission = Math.round((stats.monthlyCommission / today) * daysInMonth);
    
    return {
        lifeValues: isFinite(projectedLifeValues) ? projectedLifeValues : 0,
        commission: isFinite(projectedCommission) ? projectedCommission : 0,
        onTrack: projectedLifeValues >= stats.monthlyGoal
    };
  };

  const trend = getTrendPrediction();

  // UI State
  const [statusMessage, setStatusMessage] = useState('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [debugInfo, setDebugInfo] = useState<string>('');

  const fetchData = async () => {
    if (!user) return;
    setError(null);

    const now = new Date();
    const todayStart = new Date(now.setHours(0,0,0,0)).toISOString();
    const todayEnd = new Date(now.setHours(23,59,59,999)).toISOString();
    
    // For Chart: Last 6 months
    const startSixMonthsAgo = new Date();
    startSixMonthsAgo.setMonth(startSixMonthsAgo.getMonth() - 5);
    startSixMonthsAgo.setDate(1);
    const dateStr = format(startSixMonthsAgo, 'yyyy-MM-dd'); // Format YYYY-MM-DD for Supabase date column

    try {
      // 1. Parallel Fetching
      const [
        statusRes, 
        profilesRes, 
        callbacksRes, 
        parcelsRes, 
        eventsRes,
        boardRes,
        callsRes,
        prodRes // Fetch separately or in parallel
      ] = await Promise.all([
        supabase.from('user_status').select('*').order('updated_at', { ascending: false }),
        supabase.from('profiles').select('*'),
        supabase.from('callbacks').select('*').neq('status', 'done').or(`assigned_to.eq.${user.id},assigned_to.is.null`),
        supabase.from('parcels').select('*').eq('status', 'pending').order('created_at', { ascending: false }),
        supabase.from('calendar_events').select('*').gte('start_time', todayStart).lte('start_time', todayEnd).order('start_time', { ascending: true }),
        supabase.from('board_messages').select('*, profiles(full_name)').order('created_at', { ascending: false }).limit(3),
        supabase.from('phone_calls').select('*').eq('status', 'missed').order('created_at', { ascending: false }),
        // Production Data: Fetch ALL for now to debug visibility issues
        supabase.from('production_entries').select('commission_amount, life_values, submission_date, user_id').gte('submission_date', dateStr)
      ]);

      if (profilesRes.error) throw profilesRes.error;
      if (prodRes.error) throw prodRes.error;

      // Debugging
      const loadedProd = prodRes.data || [];
      console.log(`Loaded ${loadedProd.length} production entries`);
      setDebugInfo(`Debug: ${loadedProd.length} Entries loaded. First: ${loadedProd[0]?.submission_date}`);

      // 2. Process Colleagues
      const latestStatuses = statusRes.data || [];
      const profiles = profilesRes.data || [];
      const myProfile = profiles.find(p => p.id === user.id);

      const mergedColleagues = profiles.map(p => ({
        ...p,
        current_status: latestStatuses.find(s => s.user_id === p.id)
      })).sort((a, b) => {
          const onlineStatuses = ['office', 'remote', 'meeting'];
          const aOnline = onlineStatuses.includes(a.current_status?.status || 'office');
          const bOnline = onlineStatuses.includes(b.current_status?.status || 'office');
          if (aOnline && !bOnline) return -1;
          if (!aOnline && bOnline) return 1;
          return (a.full_name || '').localeCompare(b.full_name || '');
      });
      setColleagues(mergedColleagues);

      // Show ALL parcels for EVERYONE
      const allParcels = parcelsRes.data || [];
      
      // 3. Process Tasks (Timeline)
      const callbacks = callbacksRes.data || [];
      const events = eventsRes.data || [];
      const missedCalls = callsRes.data || [];

      // Filter missed calls
      const myMissedCalls = missedCalls.filter((c: any) => 
          !c.notes?.includes('erledigt') && c.status === 'missed' &&
          (c.user_id === user.id || (!c.user_id && profile?.roles?.includes('admin')))
      );
      
      const timelineItems = [
        ...events.map(e => ({
          id: e.id,
          type: 'event',
          title: e.title,
          time: new Date(e.start_time),
          meta: e.category,
          priority: 'normal'
        })),
        ...callbacks.map(c => ({
          id: c.id,
          type: 'callback',
          title: `Rückruf: ${c.customer_name}`,
          time: new Date(c.created_at), 
          meta: c.phone,
          priority: c.priority
        })),
        ...myMissedCalls.map((c: any) => ({
          id: c.id,
          type: 'missed_call', 
          title: `Verpasst: ${c.caller_number}`,
          time: new Date(c.created_at),
          meta: c.notes?.replace('Anrufer: ', '').replace(/Raw Params:.*/, '') || 'Unbekannt',
          priority: 'high'
        }))
      ].sort((a, b) => a.time.getTime() - b.time.getTime());
      
      setMyTasks(timelineItems);

      // 4. Stats & Chart Data
      // Use ALL loaded data (no user_id filter for now to ensure visibility)
      const myProd = loadedProd; 

      // Calculate Monthly Commission (Current Month)
      const currentMonthKey = format(new Date(), 'yyyy-MM');
      
      const monthlyComm = myProd
          .filter(e => e.submission_date && String(e.submission_date).substring(0, 7) === currentMonthKey)
          .reduce((sum, e) => sum + Number(e.commission_amount || 0), 0);

      const monthlyLifeValues = myProd
          .filter(e => e.submission_date && String(e.submission_date).substring(0, 7) === currentMonthKey)
          .reduce((sum, e) => sum + Number(e.life_values || 0), 0);

      // Calculate Chart Data (Last 6 Months)
      const last6Months = Array.from({ length: 6 }, (_, i) => {
          const d = new Date();
          d.setMonth(d.getMonth() - (5 - i));
          return d;
      });

      const chartData = last6Months.map(date => {
          const monthKey = format(date, 'yyyy-MM');
          const monthLabel = format(date, 'MMM', { locale: de });
          
          const total = myProd
            .filter(e => e.submission_date && String(e.submission_date).substring(0, 7) === monthKey)
            .reduce((acc, curr) => acc + Number(curr.commission_amount || 0), 0);
            
          return { name: monthLabel, value: total };
      });

      setRevenueData(chartData);

      setStats({
        monthlyCommission: monthlyComm,
        monthlyLifeValues: monthlyLifeValues,
        openCallbacks: callbacks.length,
        pendingParcels: allParcels.length,
        monthlyGoal: myProfile?.monthly_goal || 10000
      });
      setParcels(parcelsRes.data || []);
      setBoardMessages(boardRes.data || []);

      setLoading(false);

    } catch (e) {
      console.error('Unexpected error fetching dashboard data:', e);
      setError('Ein unerwarteter Fehler ist aufgetreten.');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Subscribe to everything relevant
    const channels = [
      supabase.channel('d_status').on('postgres_changes', { event: '*', schema: 'public', table: 'user_status' }, fetchData),
      supabase.channel('d_cb').on('postgres_changes', { event: '*', schema: 'public', table: 'callbacks' }, fetchData),
      supabase.channel('d_parcels').on('postgres_changes', { event: '*', schema: 'public', table: 'parcels' }, fetchData),
      supabase.channel('d_prod').on('postgres_changes', { event: '*', schema: 'public', table: 'production_entries' }, fetchData),
      supabase.channel('d_events').on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events' }, fetchData),
      supabase.channel('d_board').on('postgres_changes', { event: '*', schema: 'public', table: 'board_messages' }, fetchData),
      supabase.channel('d_calls').on('postgres_changes', { event: '*', schema: 'public', table: 'phone_calls' }, fetchData) // Subscribe to calls
    ].map(c => c.subscribe());

    return () => channels.forEach(c => c.unsubscribe());
  }, [user]);

  const handleStatusUpdate = async (status: StatusType) => {
    if (!user || isUpdatingStatus) return;
    setIsUpdatingStatus(true);
    const { error } = await supabase.from('user_status').insert({
        user_id: user.id,
        status,
        message: statusMessage || null,
        updated_at: new Date().toISOString()
    });
    if (!error) {
        toast.success('Status aktualisiert');
        setStatusMessage('');
    }
    setIsUpdatingStatus(false);
  };

  const myCurrentStatus = colleagues.find(c => c.id === user?.id)?.current_status;

  if (loading) return (
    <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
    </div>
  );

  if (error) return (
    <div className="flex flex-col items-center justify-center h-96 gap-4">
        <div className="p-4 bg-red-50 text-red-700 rounded-lg flex items-center gap-2">
            <LogOut className="w-5 h-5 rotate-180" /> {/* Using LogOut as error icon alternative or AlertTriangle if available */}
            <span className="font-medium">{error}</span>
        </div>
        <button 
            onClick={() => fetchData()} 
            className="px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-medium text-sm shadow-sm"
        >
            Erneut versuchen
        </button>
    </div>
  );

  return (
    <div className="max-w-[1600px] mx-auto space-y-8 pb-12 px-4 md:px-8">
      
      {/* 1. HERO SECTION (Restored & Improved) */}
      <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 relative overflow-hidden">
         <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/10 dark:to-purple-900/10 rounded-bl-[100px] -mr-10 -mt-10 pointer-events-none" />
         
         <div className="relative z-10 flex flex-col xl:flex-row gap-8 items-start xl:items-center justify-between">
            {/* Greeting & Status Input */}
            <div className="flex-1 w-full xl:w-auto">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                    Moin, {profile?.full_name?.split(' ')[0]}! 👋
                </h1>
                <div className="flex flex-col gap-4 bg-white dark:bg-gray-800 p-4 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm max-w-4xl">
                    <div className="w-full">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 block">Deine Nachricht</label>
                        <input 
                            type="text" 
                            placeholder="Was machst du gerade? (z.B. 'Kundenmeeting')" 
                            className="w-full rounded-xl border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 dark:placeholder-gray-500"
                            value={statusMessage}
                            onChange={e => setStatusMessage(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleStatusUpdate(myCurrentStatus?.status || 'office')}
                        />
                    </div>
                    <div className="w-full">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Dein Status</label>
                        <div className="flex gap-2 pb-1 flex-wrap">
                            {STATUS_CONFIG.map(s => {
                                const Icon = s.icon;
                                const active = myCurrentStatus?.status === s.value;
                                return (
                                    <button
                                        key={s.value}
                                        onClick={() => handleStatusUpdate(s.value)}
                                        className={cn(
                                            "px-3 py-2 rounded-xl transition-all flex items-center gap-2",
                                            active 
                                                ? cn("shadow-md ring-2 ring-offset-1 ring-offset-white dark:ring-offset-gray-900 ring-indigo-500 font-bold transform scale-105", s.className) 
                                                : "bg-gray-50 dark:bg-gray-900/50 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 border border-transparent hover:border-gray-200 dark:hover:border-gray-600"
                                        )}
                                        title={s.label}
                                    >
                                        <Icon className={cn("w-4 h-4", active ? "scale-110" : "")} />
                                        <span className="text-xs whitespace-nowrap">{s.label}</span>
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {/* Quick KPIs (Top Right) */}
            <div className="flex gap-6 items-center">
                <div className="text-right">
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1">Monatsziel</p>
                    <div className="relative w-32 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden group">
                        <div 
                            className="absolute top-0 left-0 h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-1000"
                            style={{ width: `${Math.min((stats.monthlyLifeValues / stats.monthlyGoal) * 100, 100)}%` }}
                        />
                        {/* Hidden Debug Tooltip */}
                        <div className="absolute top-4 right-0 w-64 bg-black text-white text-[10px] p-2 rounded hidden group-hover:block z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                            {debugInfo}
                        </div>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1 font-mono">
                        {Math.round((stats.monthlyLifeValues / stats.monthlyGoal) * 100)}% erreicht
                    </p>
                </div>
                <div className="w-px bg-gray-200 dark:bg-gray-700 h-10 hidden sm:block" />
                <div className="text-right">
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Umsatz</p>
                    <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                        {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(stats.monthlyCommission)}
                    </p>
                </div>
                <div className="w-px bg-gray-200 dark:bg-gray-700 h-10 self-center hidden sm:block" />
                <div className="text-right">
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Lebenswerte</p>
                    <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                        {new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(stats.monthlyLifeValues)}
                    </p>
                </div>
                <div className="w-px bg-gray-200 dark:bg-gray-700 h-10 self-center hidden sm:block" />
                <div className="text-right">
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Offene Tasks</p>
                    <div className="flex items-center justify-end gap-2">
                        <span className="text-2xl font-bold text-gray-900 dark:text-white">{stats.openCallbacks}</span>
                        {stats.openCallbacks > 0 && <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />}
                    </div>
                </div>
                 <div className="w-px bg-gray-200 dark:bg-gray-700 h-10 self-center hidden sm:block" />
                <div className="text-right">
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Pakete</p>
                    <div className="flex items-center justify-end gap-2">
                        <span className="text-2xl font-bold text-gray-900 dark:text-white">{stats.pendingParcels}</span>
                        {stats.pendingParcels > 0 && <span className="w-2.5 h-2.5 bg-blue-500 rounded-full" />}
                    </div>
                </div>
            </div>
         </div>
      </div>

      {/* 2. MAIN CONTENT GRID (2 Columns: Main + Sidebar) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        
        {/* LEFT COLUMN: TIMELINE & TASKS (2/3 width) */}
        <div className="lg:col-span-2 space-y-6">
            
            {/* New: Trend Prediction Card (Only show if data exists) */}
            {stats.monthlyLifeValues > 0 && (
                <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-3xl p-6 text-white shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-16 -mt-16 blur-3xl" />
                    <div className="relative z-10 flex items-center justify-between">
                        <div>
                            <div className="flex items-center gap-2 mb-1 text-indigo-100">
                                <Sparkles className="w-4 h-4" />
                                <span className="text-xs font-bold uppercase tracking-wider">KI-Trendvorhersage</span>
                            </div>
                            <h3 className="text-xl font-bold mb-2">
                                {trend.onTrack ? "Stark! Du bist auf Kurs." : "Gib Gas, du packst das!"}
                            </h3>
                            <p className="text-sm text-indigo-100 opacity-90 max-w-md">
                                Basierend auf deiner aktuellen Performance landest du diesen Monat voraussichtlich bei 
                                <strong className="text-white"> {new Intl.NumberFormat('de-DE').format(trend.lifeValues)} Bewertungssumme</strong>.
                            </p>
                        </div>
                        <div className="text-right hidden sm:block">
                            <div className="bg-white/20 backdrop-blur-md rounded-2xl p-3 inline-block">
                                <span className="block text-xs text-indigo-100 mb-1">Prognose</span>
                                <span className="text-2xl font-bold">{new Intl.NumberFormat('de-DE').format(trend.lifeValues)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold flex items-center gap-2">
                    <Clock className="w-6 h-6 text-gray-400" />
                    Aktuelles & Aufgaben
                </h2>
                <button onClick={() => navigate('/calls?tab=tasks')} className="text-sm font-medium text-indigo-600 hover:underline">
                    Alle anzeigen
                </button>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-3xl p-0 shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden min-h-[500px]">
                {myTasks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-center text-gray-400">
                        <div className="w-16 h-16 bg-gray-50 dark:bg-gray-900 rounded-full flex items-center justify-center mb-4">
                            <Coffee className="w-8 h-8 text-gray-300" />
                        </div>
                        <p>Nichts Dringendes anstehend.</p>
                        <p className="text-xs mt-1">Genieß den Kaffee!</p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-100 dark:divide-gray-700">
                        {myTasks.map((task, idx) => {
                            const isEvent = task.type === 'event';
                            const isMissedCall = task.type === 'missed_call';
                            const isCallback = task.type === 'callback';
                            const isHighPrio = task.priority === 'high' || isMissedCall;
                            
                            return (
                                <motion.div 
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.05 }}
                                    key={`${task.type}-${task.id}`} 
                                    className={cn(
                                        "p-4 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer group relative",
                                        isHighPrio ? "bg-red-50/10" : ""
                                    )}
                                    onClick={() => {
                                        if (isEvent) navigate('/general-calendar');
                                        else if (isMissedCall) navigate('/calls?tab=live');
                                        else if (isCallback) setScriptOpen(task.id === scriptOpen ? null : task.id);
                                        else navigate('/calls?tab=tasks');
                                    }}
                                >
                                    {/* Icon Box */}
                                    <div className={cn(
                                        "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm border border-white/50 dark:border-gray-700",
                                        isEvent ? "bg-indigo-100 text-indigo-600" : 
                                        isMissedCall ? "bg-red-100 text-red-600" : 
                                        isHighPrio ? "bg-orange-100 text-orange-600" : "bg-emerald-100 text-emerald-600"
                                    )}>
                                        {isEvent ? <Briefcase className="w-5 h-5" /> : 
                                         isMissedCall ? <Phone className="w-5 h-5" /> :
                                         <Clock className="w-5 h-5" />}
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-start">
                                            <h3 className={cn("font-bold text-base truncate pr-2", isHighPrio ? "text-red-600" : "text-gray-900 dark:text-white")}>
                                                {task.title}
                                            </h3>
                                            <span className="text-xs font-mono text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-lg shrink-0">
                                                {format(task.time, 'HH:mm')}
                                            </span>
                                        </div>
                                        <p className="text-sm text-gray-500 truncate mt-0.5 flex items-center gap-2">
                                            {task.meta}
                                            {isHighPrio && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Dringend</span>}
                                        </p>

                                        {/* Script Overlay (Only for Callbacks) */}
                                        {isCallback && scriptOpen === task.id && (
                                            <motion.div 
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: 'auto' }}
                                                className="mt-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-3 border border-indigo-100 dark:border-indigo-800/50"
                                                onClick={e => e.stopPropagation()}
                                            >
                                                <div className="flex items-center gap-2 mb-2 text-indigo-700 dark:text-indigo-300">
                                                    <MessageSquare className="w-3 h-3" />
                                                    <span className="text-xs font-bold uppercase tracking-wider">Gesprächsleitfaden</span>
                                                </div>
                                                <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                                                    <p>👋 "Hallo Herr/Frau {task.title.replace('Rückruf: ', '')}, hier ist {profile?.full_name?.split(' ')[0]} von der Agentur..."</p>
                                                    <p>📞 "Sie hatten um einen Rückruf gebeten bezüglich <strong>{task.meta}</strong>?"</p>
                                                    <div className="flex gap-2 mt-2 pt-2 border-t border-indigo-200 dark:border-indigo-800">
                                                        <button onClick={() => navigate('/calls?tab=tasks')} className="flex-1 bg-white dark:bg-gray-800 py-1.5 rounded-lg text-xs font-bold shadow-sm hover:bg-gray-50">
                                                            Zum Task
                                                        </button>
                                                        <button onClick={() => setScriptOpen(null)} className="flex-1 bg-transparent py-1.5 rounded-lg text-xs font-bold text-gray-500 hover:bg-black/5">
                                                            Schließen
                                                        </button>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </div>
                                    
                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300">
                                        &rarr;
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>

        {/* RIGHT COLUMN: SIDEBAR (1/3 width) */}
        <div className="space-y-6">
            
            {/* Team Widget */}
            <div className="bg-white dark:bg-gray-800 rounded-3xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
                <h3 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <Users className="w-5 h-5 text-gray-400" /> Team Status
                </h3>
                <div className="space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar pr-1">
                     {colleagues.map((colleague) => {
                        const status = colleague.current_status?.status || 'office';
                        const note = colleague.current_status?.message;
                        const isOnline = ['office', 'remote', 'meeting'].includes(status);
                        
                        return (
                             <div key={colleague.id} className={cn("flex items-center gap-3 p-2 rounded-xl transition-colors", isOnline ? "hover:bg-gray-50 dark:hover:bg-gray-700/50" : "opacity-60 grayscale")}>
                                 <div className="relative">
                                     {colleague.avatar_url ? (
                                         <img src={colleague.avatar_url} className="w-10 h-10 rounded-full object-cover" />
                                     ) : (
                                         <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center font-bold text-gray-400">{colleague.full_name?.charAt(0)}</div>
                                     )}
                                     {isOnline && <div className={cn("absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-gray-800", 
                                        status === 'office' ? "bg-emerald-500" : status === 'remote' ? "bg-blue-500" : "bg-amber-500"
                                     )} />}
                                 </div>
                                 <div className="min-w-0">
                                     <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{colleague.full_name}</p>
                                     <p className="text-xs text-gray-500 truncate">{note || (STATUS_CONFIG.find(s => s.value === status)?.label)}</p>
                                 </div>
                             </div>
                        );
                     })}
                </div>
            </div>

            {/* Quick Actions Grid */}
            <div className="grid grid-cols-2 gap-3">
                 <button onClick={() => navigate('/production')} className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl flex flex-col items-center justify-center gap-2 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors text-indigo-700 dark:text-indigo-300">
                    <TrendingUp className="w-6 h-6" />
                    <span className="text-xs font-bold">Umsatz +</span>
                 </button>
                 <button onClick={() => navigate('/calls?tab=tasks')} className="p-4 bg-white border border-gray-100 dark:bg-gray-800 dark:border-gray-700 rounded-2xl flex flex-col items-center justify-center gap-2 hover:border-indigo-200 transition-colors">
                    <Phone className="w-6 h-6 text-gray-400" />
                    <span className="text-xs font-bold text-gray-600 dark:text-gray-300">Rückruf</span>
                 </button>
            </div>

            {/* Pinnwand Teaser */}
             <div className="bg-gradient-to-br from-gray-50 to-white dark:from-gray-800 dark:to-gray-900 rounded-3xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-gray-400" /> Pinnwand
                    </h3>
                    <span className="text-xs bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded-full text-gray-600 dark:text-gray-300">{boardMessages.length}</span>
                </div>
                {boardMessages.length > 0 ? (
                    <div className="bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-100 dark:border-gray-700/50 shadow-sm">
                        <p className="text-xs font-bold text-indigo-600 mb-1">{boardMessages[0].profiles?.full_name}</p>
                        <p className="text-xs text-gray-600 dark:text-gray-300 line-clamp-3 leading-relaxed">"{boardMessages[0].content}"</p>
                    </div>
                ) : (
                    <p className="text-xs text-gray-400 italic">Alles ruhig heute.</p>
                )}
                <button onClick={() => navigate('/board')} className="w-full mt-3 text-xs text-center text-gray-500 hover:text-indigo-600 font-medium">Zur Pinnwand &rarr;</button>
             </div>

        </div>

      </div>
    </div>
  );
};
