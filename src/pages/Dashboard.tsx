import { useEffect, useState } from 'react';
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
      boardRes
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
    const missedCalls = (boardRes[5] as any)?.data || []; // Type assertion trick or proper fetch above

    // Filter missed calls: Show own calls + unassigned calls (if no user_id)
    const myMissedCalls = missedCalls.filter((c: any) => 
        !c.notes?.includes('erledigt') && 
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
        type: 'missed_call', // New Type
        title: `Verpasst: ${c.caller_number}`,
        time: new Date(c.created_at),
        meta: c.notes?.replace('Anrufer: ', '') || 'Unbekannt',
        priority: 'high' // Missed calls are important
      }))
    ].sort((a, b) => {
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
    <div className="max-w-[1600px] mx-auto space-y-8 pb-12">
      
      {/* 1. HERO SECTION (Personal HUD) */}
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
                        <div className="grid grid-cols-2 sm:grid-cols-4 md:flex gap-2 pb-1 flex-wrap">
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

            {/* Quick KPIs */}
            <div className="flex gap-4 sm:gap-8">
                <div className="text-right">
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Umsatz (Monat)</p>
                    <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                        {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(stats.monthlyCommission)}
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
            </div>
         </div>
      </div>

      {/* 2. MAIN GRID */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        
        {/* LEFT COLUMN: TIMELINE & TASKS (5 cols) */}
        <div className="xl:col-span-5 space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold flex items-center gap-2">
                    <Clock className="w-5 h-5 text-gray-400" />
                    Mein Fokus heute
                </h2>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 min-h-[500px]">
                {myTasks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-center text-gray-400">
                        <div className="w-16 h-16 bg-gray-50 dark:bg-gray-900 rounded-full flex items-center justify-center mb-4">
                            <Coffee className="w-8 h-8 text-gray-300" />
                        </div>
                        <p>Nichts Dringendes anstehend.</p>
                        <p className="text-xs mt-1">Genieß den Kaffee!</p>
                    </div>
                ) : (
                    <div className="space-y-6 relative before:absolute before:inset-y-0 before:left-[27px] before:w-0.5 before:bg-gray-100 dark:before:bg-gray-700">
                        {myTasks.map((task, idx) => {
                            const isEvent = task.type === 'event';
                            const isMissedCall = task.type === 'missed_call';
                            const isHighPrio = task.priority === 'high' || isMissedCall;
                            
                            return (
                                <motion.div 
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: idx * 0.1 }}
                                    key={`${task.type}-${task.id}`} 
                                    className="relative pl-16 group"
                                >
                                    {/* Time Bubble */}
                                    <div className={cn(
                                        "absolute left-0 top-0 w-14 text-xs font-bold text-right pr-4 pt-1",
                                        isHighPrio ? "text-red-500" : "text-gray-400"
                                    )}>
                                        {isEvent ? format(task.time, 'HH:mm') : (isMissedCall ? 'Anruf' : 'Todo')}
                                    </div>
                                    
                                    {/* Dot */}
                                    <div className={cn(
                                        "absolute left-[21px] top-1.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-gray-800 z-10",
                                        isEvent ? "bg-indigo-500" : (isHighPrio ? "bg-red-500 animate-pulse" : "bg-emerald-500")
                                    )} />

                                    {/* Content Card */}
                                    <div className={cn(
                                        "p-4 rounded-2xl border transition-all hover:shadow-md cursor-pointer",
                                        isHighPrio 
                                            ? "bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-900/30" 
                                            : "bg-gray-50 dark:bg-gray-900/50 border-transparent hover:border-gray-200 dark:hover:border-gray-700"
                                    )} onClick={() => navigate(isEvent ? '/general-calendar' : '/calls')}>
                                        <div className="flex justify-between items-start">
                                            <h3 className={cn("font-medium text-sm", isHighPrio ? "text-red-900 dark:text-red-200" : "text-gray-900 dark:text-white")}>
                                                {task.title}
                                            </h3>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                                            {isEvent ? (
                                                <span className="bg-white dark:bg-gray-800 px-1.5 py-0.5 rounded text-gray-400 border border-gray-100 dark:border-gray-700">{task.meta || 'Allgemein'}</span>
                                            ) : (
                                                <span className="flex items-center gap-1 text-indigo-500 hover:underline">
                                                    <Phone className="w-3 h-3" /> {task.meta}
                                                </span>
                                            )}
                                        </p>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>

        {/* MIDDLE COLUMN: TEAM & BOARD (4 cols) */}
        <div className="xl:col-span-4 space-y-6">
            <h2 className="text-lg font-bold flex items-center gap-2">
                <Users className="w-5 h-5 text-gray-400" />
                Team Status
            </h2>

            <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden flex flex-col max-h-[600px]">
                <div className="p-2 overflow-y-auto flex-1 space-y-1 custom-scrollbar">
                    {colleagues.map(colleague => {
                        const status = colleague.current_status;
                        const isMe = colleague.id === user?.id;
                        
                        return (
                            <div key={colleague.id} className={cn(
                                "flex items-center gap-3 p-3 rounded-2xl transition-colors",
                                isMe ? "bg-indigo-50/50 dark:bg-indigo-900/10" : "hover:bg-gray-50 dark:hover:bg-gray-700/50"
                            )}>
                                <div className="relative shrink-0">
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 flex items-center justify-center font-bold text-gray-500 text-sm">
                                        {colleague.full_name?.charAt(0)}
                                    </div>
                                    <div className={cn(
                                        "absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-gray-800",
                                        status?.status === 'office' ? "bg-emerald-500" :
                                        status?.status === 'remote' ? "bg-blue-500" :
                                        status?.status === 'break' ? "bg-amber-500" :
                                        status?.status === 'off' ? "bg-gray-400" : "bg-purple-500"
                                    )} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex justify-between items-baseline">
                                        <p className={cn("text-sm font-medium truncate", isMe && "text-indigo-700 dark:text-indigo-300")}>
                                            {colleague.full_name} {isMe && '(Du)'}
                                        </p>
                                        <span className="text-[10px] text-gray-400 ml-2 whitespace-nowrap">
                                            {status?.updated_at ? format(new Date(status.updated_at), 'HH:mm') : ''}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <StatusBadge status={status?.status || 'off'} />
                                        {status?.message && (
                                            <span className="text-xs text-gray-500 truncate max-w-[120px]">
                                                • {status.message}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Board Teaser */}
            <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold flex items-center gap-2 text-gray-900 dark:text-white">
                        <MessageSquare className="w-5 h-5 text-gray-400" /> 
                        Pinnwand
                    </h3>
                    <button onClick={() => navigate('/board')} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline transition-colors">Alle</button>
                </div>
                <div className="space-y-4">
                    {boardMessages.length === 0 ? (
                        <p className="text-sm text-gray-400 italic">Keine Nachrichten.</p>
                    ) : (
                        boardMessages.slice(0, 2).map(msg => (
                            <div key={msg.id} className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-3 border border-gray-100 dark:border-gray-700/50">
                                <p className="text-xs text-indigo-600 dark:text-indigo-400 mb-1 flex justify-between">
                                    <span className="font-medium">{msg.profiles?.full_name}</span>
                                    <span className="text-gray-400">{formatDistanceToNow(new Date(msg.created_at), { locale: de, addSuffix: true })}</span>
                                </p>
                                <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-2">{msg.content}</p>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>

        {/* RIGHT COLUMN: ASSETS & TOOLS (3 cols) */}
        <div className="xl:col-span-3 space-y-6">
            
            {/* NEW: Revenue Trend Chart Widget */}
            <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold flex items-center gap-2">
                        <BarChartIcon className="w-5 h-5 text-gray-400" />
                        Trend
                    </h2>
                    <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-1 rounded-lg">6 Monate</span>
                </div>
                
                <div className="h-[150px] w-full">
                     <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={revenueData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                            <XAxis 
                                dataKey="name" 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{ fill: '#9CA3AF', fontSize: 10 }} 
                                dy={5}
                                interval={1} // Show every 2nd label if tight
                            />
                            <Tooltip 
                                cursor={{ fill: '#EEF2FF', opacity: 0.5 }}
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', fontSize: '12px' }}
                                formatter={(value: number) => [new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value), '']}
                                labelStyle={{ display: 'none' }}
                            />
                            <Bar 
                                dataKey="value" 
                                radius={[4, 4, 0, 0]} 
                                barSize={20}
                            >
                                {revenueData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.value > 0 ? '#6366f1' : '#e5e7eb'} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                <div className="mt-4 flex justify-between items-end">
                    <div>
                        <p className="text-xs text-gray-500">Ø Umsatz (6M)</p>
                        <p className="text-lg font-bold text-gray-900 dark:text-white">
                            {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(
                                revenueData.reduce((acc, curr) => acc + curr.value, 0) / (revenueData.length || 1)
                            )}
                        </p>
                    </div>
                    <button onClick={() => navigate('/production')} className="text-xs font-bold text-indigo-600 hover:text-indigo-700 transition-colors">
                        Details &rarr;
                    </button>
                </div>
            </div>

            <h2 className="text-lg font-bold flex items-center gap-2">
                <Package className="w-5 h-5 text-gray-400" />
                Logistik
            </h2>

            {/* Parcels Card */}
            <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats.pendingParcels}</p>
                        <p className="text-xs text-gray-500">Pakete im Büro</p>
                    </div>
                    <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 rounded-2xl flex items-center justify-center text-blue-600">
                        <Package className="w-6 h-6" />
                    </div>
                </div>
                
                <div className="space-y-3">
                    {parcels.slice(0, 3).map(p => (
                        <div key={p.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl">
                            <div className="flex items-center gap-3">
                                <div className="w-2 h-2 rounded-full bg-blue-500" />
                                <div>
                                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate max-w-[100px]">{p.recipient_name}</p>
                                    <p className="text-[10px] text-gray-500">{p.carrier}</p>
                                </div>
                            </div>
                            <span className="text-[10px] text-gray-400">{format(new Date(p.created_at), 'dd.MM')}</span>
                        </div>
                    ))}
                    {parcels.length > 3 && (
                         <button onClick={() => navigate('/parcels')} className="w-full text-center text-xs text-indigo-600 font-medium py-2 hover:underline">
                             + {parcels.length - 3} weitere
                         </button>
                    )}
                    {parcels.length === 0 && (
                        <div className="text-center py-4">
                            <p className="text-xs text-gray-400">Alles ausgeliefert ✅</p>
                        </div>
                    )}
                </div>
                <button onClick={() => navigate('/parcels')} className="w-full mt-4 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 py-2 rounded-xl text-sm font-medium hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors">
                    Zur Paketliste
                </button>
            </div>

            {/* Quick Actions / Tools */}
            <div className="grid grid-cols-2 gap-4">
                <button onClick={() => navigate('/production')} className="bg-indigo-600 hover:bg-indigo-700 text-white p-4 rounded-3xl shadow-lg shadow-indigo-200 dark:shadow-none flex flex-col items-center justify-center gap-2 transition-transform hover:scale-[1.02]">
                    <TrendingUp className="w-6 h-6" />
                    <span className="text-sm font-bold">Umsatz +</span>
                </button>
                <button onClick={() => navigate('/calls')} className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-800 p-4 rounded-3xl flex flex-col items-center justify-center gap-2 transition-all hover:scale-[1.02] group">
                    <Phone className="w-6 h-6 text-gray-400 group-hover:text-indigo-500 transition-colors" />
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">Rückruf</span>
                </button>
            </div>
            
        </div>

      </div>
    </div>
  );
};
