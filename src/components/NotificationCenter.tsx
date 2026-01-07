import { Fragment, useEffect, useState } from 'react';
import { Popover, Transition } from '@headlessui/react';
import { Bell, Package, Phone, MessageSquare, Check, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/utils/cn';

type NotificationItem = {
    id: string;
    type: 'parcel' | 'callback' | 'message';
    title: string;
    subtitle?: string;
    date: string;
    read: boolean;
    link: string;
    icon: any;
    color: string;
};

export const NotificationCenter = () => {
    const { user } = useStore();
    const navigate = useNavigate();
    const [items, setItems] = useState<NotificationItem[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchNotifications = async () => {
        if (!user) return;
        setLoading(true);

        try {
            // 1. Parcels (Pending for me)
            const { data: parcels } = await supabase
                .from('parcels')
                .select('*')
                .eq('recipient_id', user.id)
                .eq('status', 'pending')
                .order('created_at', { ascending: false });

            // 2. Callbacks (Assigned to me, not done)
            const { data: callbacks } = await supabase
                .from('callbacks')
                .select('*')
                .eq('assigned_to', user.id)
                .neq('status', 'done')
                .order('created_at', { ascending: false });

            // 3. Board Messages (Last 24h)
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const { data: messages } = await supabase
                .from('board_messages')
                .select('*, profiles(full_name)')
                .gte('created_at', yesterday.toISOString())
                .order('created_at', { ascending: false });

            const newItems: NotificationItem[] = [];

            parcels?.forEach(p => {
                newItems.push({
                    id: `parcel-${p.id}`,
                    type: 'parcel',
                    title: `Neues Paket: ${p.carrier}`,
                    subtitle: `Von: ${p.sender || 'Unbekannt'}`,
                    date: p.created_at,
                    read: false,
                    link: '/parcels',
                    icon: Package,
                    color: 'text-blue-500 bg-blue-50'
                });
            });

            callbacks?.forEach(c => {
                newItems.push({
                    id: `cb-${c.id}`,
                    type: 'callback',
                    title: `Rückruf: ${c.customer_name}`,
                    subtitle: c.phone,
                    date: c.created_at,
                    read: false,
                    link: '/callbacks',
                    icon: Phone,
                    color: 'text-indigo-500 bg-indigo-50'
                });
            });

            messages?.forEach(m => {
                // Don't show my own messages
                if (m.user_id === user.id) return;
                
                newItems.push({
                    id: `msg-${m.id}`,
                    type: 'message',
                    title: `Pinnwand: ${m.profiles?.full_name}`,
                    subtitle: m.content,
                    date: m.created_at,
                    read: false, // In a real app, track read state in DB
                    link: '/board',
                    icon: MessageSquare,
                    color: 'text-purple-500 bg-purple-50'
                });
            });

            // Sort by date desc
            newItems.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            setItems(newItems);

        } catch (error) {
            console.error('Error fetching notifications:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchNotifications();
        
        // Realtime Subscription
        const sub = supabase.channel('notifications')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'parcels' }, fetchNotifications)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'callbacks' }, fetchNotifications)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'board_messages' }, fetchNotifications)
            .subscribe();

        return () => { sub.unsubscribe(); };
    }, [user]);

    const unreadCount = items.length; // Simplified: All items here are "actionable" or "new"

    return (
        <Popover className="relative">
            {({ open }) => (
                <>
                    <Popover.Button className={cn(
                        "p-2 rounded-full transition-all relative focus:outline-none",
                        open 
                            ? "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400" 
                            : "text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                    )}>
                        <Bell className="w-5 h-5" />
                        {unreadCount > 0 && (
                            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full animate-pulse ring-2 ring-white dark:ring-gray-800" />
                        )}
                    </Popover.Button>

                    <Transition
                        as={Fragment}
                        enter="transition ease-out duration-200"
                        enterFrom="opacity-0 translate-y-1"
                        enterTo="opacity-100 translate-y-0"
                        leave="transition ease-in duration-150"
                        leaveFrom="opacity-100 translate-y-0"
                        leaveTo="opacity-0 translate-y-1"
                    >
                        <Popover.Panel className="fixed left-1/2 top-20 z-50 w-full max-w-sm -translate-x-1/2 transform px-4 sm:px-0">
                            <div className="overflow-hidden rounded-2xl shadow-xl ring-1 ring-black ring-opacity-5 bg-white dark:bg-gray-800">
                                <div className="relative bg-white dark:bg-gray-800 p-4">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-sm font-bold text-gray-900 dark:text-white">Benachrichtigungen</h3>
                                        <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
                                            {unreadCount} Neu
                                        </span>
                                    </div>
                                    
                                    <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar">
                                        {loading ? (
                                            <div className="text-center py-8 text-gray-400 text-xs">Lade...</div>
                                        ) : items.length === 0 ? (
                                            <div className="text-center py-8">
                                                <div className="mx-auto w-12 h-12 bg-gray-50 dark:bg-gray-700/50 rounded-full flex items-center justify-center mb-3">
                                                    <Check className="w-6 h-6 text-green-500" />
                                                </div>
                                                <p className="text-sm text-gray-900 dark:text-white font-medium">Alles erledigt!</p>
                                                <p className="text-xs text-gray-500 mt-1">Keine neuen Aufgaben für dich.</p>
                                            </div>
                                        ) : (
                                            items.map((item) => (
                                                <div 
                                                    key={item.id}
                                                    onClick={() => {
                                                        navigate(item.link);
                                                        // Close popover logic implicitly by navigation (or explicit close if needed)
                                                    }}
                                                    className="flex items-start gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer group"
                                                >
                                                    <div className={cn("w-10 h-10 rounded-full flex items-center justify-center shrink-0", item.color)}>
                                                        <item.icon className="w-5 h-5" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                                                            {item.title}
                                                        </p>
                                                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                                            {item.subtitle}
                                                        </p>
                                                        <p className="text-[10px] text-gray-400 mt-1">
                                                            {formatDistanceToNow(new Date(item.date), { locale: de, addSuffix: true })}
                                                        </p>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                                <div className="bg-gray-50 dark:bg-gray-700/50 p-2 text-center">
                                    <button onClick={() => navigate('/dashboard')} className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300">
                                        Zum Dashboard
                                    </button>
                                </div>
                            </div>
                        </Popover.Panel>
                    </Transition>
                </>
            )}
        </Popover>
    );
};
