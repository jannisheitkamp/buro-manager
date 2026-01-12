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
  BarChart as BarChartIcon
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
    openCallbacks: 0,
    pendingParcels: 0
  });
  const [revenueData, setRevenueData] = useState<{name: string, value: number}[]>([]);

  // UI State
  const [statusMessage, setStatusMessage] = useState('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const fetchData = async () => {
    if (!user) return;

    const now = new Date();
    const startMonth = startOfMonth(now).toISOString();
    const endMonth = endOfMonth(now).toISOString();
    
    // For Chart: Last 6 months
    const sixMonthsAgo = subMonths(now, 5);
    const startSixMonthsAgo = startOfMonth(sixMonthsAgo).toISOString();

    const todayStart = new Date(now.setHours(0,0,0,0)).toISOString();
    const todayEnd = new Date(now.setHours(23,59,59,999)).toISOString();

    // 1. Parallel Fetching for Speed
    const [
      statusRes, 
      profilesRes, 
      callbacksRes, 
      parcelsRes, 
      prodRes,
      eventsRes,
      boardRes,
      callsRes // Add this!
    ] = await Promise.all([
      supabase.from('user_status').select('*').order('updated_at', { ascending: false }),
      supabase.from('profiles').select('*'),
      supabase.from('callbacks').select('*').neq('status', 'done').or(`assigned_to.eq.${user.id},assigned_to.is.null`),
      supabase.from('parcels').select('*').eq('status', 'pending').order('created_at', { ascending: false }),
      // Fetch 6 months of production data
      supabase.from('production_entries').select('commission_amount, submission_date').eq('user_id', user.id).gte('submission_date', startSixMonthsAgo),
      supabase.from('calendar_events').select('*').gte('start_time', todayStart).lte('start_time', todayEnd).order('start_time', { ascending: true }),
      supabase.from('board_messages').select('*, profiles(full_name)').order('created_at', { ascending: false }).limit(3),
      supabase.from('phone_calls').select('*').eq('status', 'missed').order('created_at', { ascending: false }) // New: Live Calls
    ]);

    // 2. Process Colleagues
    const latestStatuses = statusRes.data || [];
    const profiles = profilesRes.data || [];
    const mergedColleagues = profiles.map(p => ({
      ...p,
      current_status: latestStatuses.find(s => s.user_id === p.id)
    })).sort((a, b) => {
        // Sort: Online first, then alphabetical
        const aOnline = a.current_status?.status !== 'off' && a.current_status?.status !== 'vacation';
        const bOnline = b.current_status?.status !== 'off' && b.current_status?.status !== 'vacation';
        if (aOnline && !bOnline) return -1;
        if (!aOnline && bOnline) return 1;
        return (a.full_name || '').localeCompare(b.full_name || '');
    });
    setColleagues(mergedColleagues);

    // 3. Process Tasks (Timeline)
    const callbacks = callbacksRes.data || [];
    const events = eventsRes.data || [];
    const missedCalls = callsRes.data || [];


      // Filter missed calls: Show own calls + unassigned calls (if no user_id)
    const myMissedCalls = missedCalls.filter((c: any) => 
        !c.notes?.includes('erledigt') && c.status === 'missed' &&
        (c.user_id === user.id || (!c.user_id && profile?.roles?.includes('admin')))
    );
    
    // Transform to unified "Task" format
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
    ].sort((a, b) => {
        // Sort by time: Show newest/soonest first
        // Events are future (ascending), Tasks/Calls are past (descending)
        // Let's just sort by "relevance": Future events soon, then past tasks recent
        return a.time.getTime() - b.time.getTime(); 
    });
    setMyTasks(timelineItems);

    // 4. Stats & Chart Data
    const allProd = prodRes.data || [];
    
    // Calculate Monthly Commission (Current Month)
    const currentMonthKey = format(now, 'yyyy-MM');
    const monthlyComm = allProd
        .filter(e => e.submission_date.startsWith(currentMonthKey))
        .reduce((sum, e) => sum + (e.commission_amount || 0), 0);

    // Calculate Chart Data (Last 6 Months)
    const last6Months = Array.from({ length: 6 }, (_, i) => {
        const d = new Date();
        d.setMonth(d.getMonth() - (5 - i));
        return d;
    });

    const chartData = last6Months.map(date => {
        const monthKey = format(date, 'yyyy-MM');
        const monthLabel = format(date, 'MMM', { locale: de });
        
        const total = allProd
          .filter(e => e.submission_date.startsWith(monthKey))
          .reduce((acc, curr) => acc + (curr.commission_amount || 0), 0);
          
        return { name: monthLabel, value: total };
    });

    setRevenueData(chartData);

    setStats({
      monthlyCommission: monthlyComm,
      openCallbacks: callbacks.length,
      pendingParcels: parcelsRes.data?.length || 0
    });
    setParcels(parcelsRes.data || []);
    setBoardMessages(boardRes.data || []);

    setLoading(false);
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

  return (
    <div className="max-w-full mx-auto space-y-6 pb-6 px-4 md:px-8 lg:px-12 h-[calc(100vh-6rem)] overflow-hidden flex flex-col">
      
      {/* 1. TOP BAR (KPIs & Status) */}
      <div className="flex flex-col xl:flex-row gap-4 xl:items-center justify-between shrink-0">
         <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                Moin, {profile?.full_name?.split(' ')[0]}! 👋
            </h1>
            <div className="flex items-center gap-2 mt-1">
                <div className="relative group">
                    <input 
                        type="text" 
                        placeholder="Status setzen..." 
                        className="bg-transparent border-none text-sm text-gray-500 focus:ring-0 p-0 w-48 placeholder-gray-400"
                        value={statusMessage}
                        onChange={e => setStatusMessage(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleStatusUpdate(myCurrentStatus?.status || 'office')}
                    />
                    <div className="hidden group-hover:flex absolute top-full left-0 bg-white dark:bg-gray-800 shadow-xl rounded-xl p-2 gap-1 z-50 border border-gray-100 dark:border-gray-700 mt-2">
                        {STATUS_CONFIG.map(s => {
                            const Icon = s.icon;
                            return (
                                <button key={s.value} onClick={() => handleStatusUpdate(s.value)} className={cn("p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700", myCurrentStatus?.status === s.value && "bg-indigo-50 text-indigo-600")} title={s.label}>
                                    <Icon className="w-4 h-4" />
                                </button>
                            )
                        })}
                    </div>
                </div>
                <span className={cn("w-2 h-2 rounded-full", myCurrentStatus?.status === 'office' ? "bg-emerald-500" : "bg-gray-400")} />
            </div>
         </div>

         <div className="flex gap-4 overflow-x-auto pb-2 xl:pb-0">
            <div className="bg-white dark:bg-gray-800 px-4 py-3 rounded-2xl border border-gray-100 dark:border-gray-700 flex items-center gap-3 min-w-[140px] shadow-sm">
                <div className="w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center text-indigo-600">
                    <TrendingUp className="w-4 h-4" />
                </div>
                <div>
                    <p className="text-[10px] text-gray-500 font-bold uppercase">Umsatz</p>
                    <p className="text-sm font-bold text-gray-900 dark:text-white">{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(stats.monthlyCommission)}</p>
                </div>
            </div>
            
            <div className="bg-white dark:bg-gray-800 px-4 py-3 rounded-2xl border border-gray-100 dark:border-gray-700 flex items-center gap-3 min-w-[140px] shadow-sm">
                <div className="w-8 h-8 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center text-red-600">
                    <Phone className="w-4 h-4" />
                </div>
                <div>
                    <p className="text-[10px] text-gray-500 font-bold uppercase">Offen</p>
                    <p className="text-sm font-bold text-gray-900 dark:text-white">{stats.openCallbacks} Tasks</p>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 px-4 py-3 rounded-2xl border border-gray-100 dark:border-gray-700 flex items-center gap-3 min-w-[140px] shadow-sm">
                <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600">
                    <Package className="w-4 h-4" />
                </div>
                <div>
                    <p className="text-[10px] text-gray-500 font-bold uppercase">Pakete</p>
                    <p className="text-sm font-bold text-gray-900 dark:text-white">{stats.pendingParcels} im Büro</p>
                </div>
            </div>
         </div>
      </div>

      {/* 2. MAIN SPLIT VIEW (Full Height) */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-0">
        
        {/* LEFT: WORKSPACE (2/3) */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm flex flex-col overflow-hidden">
            <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50">
                <h2 className="font-bold flex items-center gap-2 text-gray-900 dark:text-white">
                    <Briefcase className="w-4 h-4 text-gray-400" />
                    Mein Schreibtisch
                </h2>
                <div className="flex gap-2">
                    <button onClick={() => navigate('/calls?tab=tasks')} className="text-xs bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 px-3 py-1.5 rounded-lg font-medium hover:text-indigo-600 transition-colors">
                        + Aufgabe
                    </button>
                </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                {myTasks.length === 0 ? (
                     <div className="h-full flex flex-col items-center justify-center text-gray-400">
                        <Coffee className="w-12 h-12 mb-2 opacity-20" />
                        <p className="text-sm">Alles erledigt.</p>
                     </div>
                ) : (
                    myTasks.map((task) => {
                        const isHigh = task.priority === 'high' || task.type === 'missed_call';
                        return (
                            <div 
                                key={`${task.type}-${task.id}`}
                                onClick={() => {
                                    if (task.type === 'event') navigate('/general-calendar');
                                    else navigate('/calls?tab=tasks');
                                }}
                                className={cn(
                                    "p-3 rounded-xl border flex items-center gap-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group",
                                    isHigh ? "bg-red-50/30 border-red-100 dark:border-red-900/30" : "border-gray-100 dark:border-gray-700/50"
                                )}
                            >
                                <div className={cn(
                                    "w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                                    task.type === 'missed_call' ? "bg-red-100 text-red-600" :
                                    task.type === 'event' ? "bg-indigo-100 text-indigo-600" : "bg-emerald-100 text-emerald-600"
                                )}>
                                    {format(task.time, 'HH:mm')}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className={cn("font-medium truncate", isHigh && "text-red-600")}>{task.title}</h3>
                                    <p className="text-xs text-gray-500 truncate">{task.meta || 'Keine Details'}</p>
                                </div>
                                {isHigh && <span className="w-2 h-2 bg-red-500 rounded-full" />}
                            </div>
                        );
                    })
                )}
            </div>
        </div>

        {/* RIGHT: CONTEXT (1/3) */}
        <div className="flex flex-col gap-6 min-h-0">
            {/* Team List (Flexible Height) */}
            <div className="flex-1 bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm flex flex-col overflow-hidden min-h-[300px]">
                <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
                    <h2 className="font-bold flex items-center gap-2 text-gray-900 dark:text-white">
                        <Users className="w-4 h-4 text-gray-400" /> Team
                    </h2>
                </div>
                <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                    {colleagues.map(c => (
                        <div key={c.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-700/30 rounded-xl transition-colors">
                            <div className="relative">
                                {c.avatar_url ? (
                                    <img src={c.avatar_url} className="w-8 h-8 rounded-full object-cover" />
                                ) : (
                                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold">{c.full_name?.charAt(0)}</div>
                                )}
                                <span className={cn("absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-gray-800", 
                                    c.current_status?.status === 'office' ? "bg-emerald-500" : 
                                    c.current_status?.status === 'remote' ? "bg-blue-500" : "bg-gray-400"
                                )} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{c.full_name}</p>
                                <p className="text-[10px] text-gray-500 truncate">{c.current_status?.message || STATUS_CONFIG.find(s => s.value === c.current_status?.status)?.label || 'Abwesend'}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Chart (Fixed Height) */}
            <div className="h-[200px] bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm p-4 flex flex-col">
                 <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold text-gray-500 uppercase">Trend</span>
                    <span className="text-xs font-bold text-indigo-600">+12%</span>
                 </div>
                 <div className="flex-1 w-full min-h-0">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={revenueData}>
                            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                {revenueData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.value > 0 ? '#6366f1' : '#e5e7eb'} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                 </div>
            </div>
        </div>

      </div>
    </div>
  );
};
