import { useState, useRef, useEffect } from 'react';
import { Send, X, Bot, ArrowRight, Minimize2, Maximize2 } from 'lucide-react';
import { cn } from '@/utils/cn';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { endOfMonth, endOfWeek, startOfMonth, startOfWeek, subMonths } from 'date-fns';

type Message = {
    id: string;
    role: 'user' | 'bot';
    content: string;
    timestamp: Date;
    actions?: { label: string; action: () => void }[];
};

type BotResponse = {
    text: string;
    actions?: Message['actions'];
};

type IntentHandler = {
    id: string;
    keywords: string[];
    handler: (ctx: { userId: string; navigate: ReturnType<typeof useNavigate>; input: string }) => Promise<BotResponse>;
};

const fmtEur = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);

const normalize = (s: string) =>
    s
        .toLowerCase()
        .trim()
        .replace(/[ä]/g, 'ae')
        .replace(/[ö]/g, 'oe')
        .replace(/[ü]/g, 'ue')
        .replace(/[ß]/g, 'ss');

const includesAny = (text: string, keywords: string[]) => keywords.some(k => text.includes(k));

export const AIAssistant = () => {
    const { user } = useStore();
    const navigate = useNavigate();
    const [isOpen, setIsOpen] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [messages, setMessages] = useState<Message[]>([
        {
            id: '1',
            role: 'bot',
            content: 'Hallo! Ich bin dein Büro Manager Assistent (ohne externe KI). Frag mich z.B.: "Umsatz diesen Monat", "Offene Leads", "Offene Rückrufe" oder "Wer ist heute abwesend?".',
            timestamp: new Date()
        }
    ]);
    
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isOpen, isTyping]);

    const processInput = async (userInput: string) => {
        if (!user) return;

        const input = normalize(userInput);

        const INTENTS: IntentHandler[] = [
            {
                id: 'help',
                keywords: ['hilfe', 'help', 'was kannst du', 'funktionen', 'befehle'],
                handler: async () => ({
                    text:
                        'Ich kann dir u.a. helfen mit:\n' +
                        '- Umsatz: "Umsatz diesen Monat" / "Umsatz letzten Monat"\n' +
                        '- Leads: "Offene Leads"\n' +
                        '- Rückrufe: "Offene Rückrufe"\n' +
                        '- Pakete: "Pakete"\n' +
                        '- Abwesenheiten: "Wer ist heute abwesend?"\n' +
                        'Du kannst auch sagen: "Öffne Produktion/Leads/Kalender/Callbacks/Pakete".',
                }),
            },
            {
                id: 'navigate',
                keywords: ['oeffne', 'geh zu', 'zeige', 'bring mich zu'],
                handler: async ({ navigate, input }) => {
                    const map: { keywords: string[]; href: string; label: string }[] = [
                        { keywords: ['produktion', 'umsatz'], href: '/production', label: 'Produktion öffnen' },
                        { keywords: ['leads', 'pipeline'], href: '/leads', label: 'Leads öffnen' },
                        { keywords: ['kalender', 'termine'], href: '/general-calendar', label: 'Kalender öffnen' },
                        { keywords: ['rueckruf', 'callbacks', 'anrufe'], href: '/callbacks', label: 'Rückrufe öffnen' },
                        { keywords: ['pakete', 'paket'], href: '/parcels', label: 'Pakete öffnen' },
                        { keywords: ['pinnwand', 'board'], href: '/board', label: 'Pinnwand öffnen' },
                        { keywords: ['dokumente', 'documents'], href: '/documents', label: 'Dokumente öffnen' },
                    ];

                    const hit = map.find(m => includesAny(input, m.keywords));
                    if (!hit) {
                        return { text: 'Wohin genau soll ich dich bringen? Z.B. "Öffne Leads" oder "Öffne Produktion".' };
                    }
                    return {
                        text: `Alles klar: **${hit.label}**.`,
                        actions: [{ label: hit.label, action: () => navigate(hit.href) }],
                    };
                },
            },
            {
                id: 'revenue',
                keywords: ['umsatz', 'provision', 'einnahmen', 'verdient'],
                handler: async ({ userId, navigate, input }) => {
                    const now = new Date();
                    const wantsLastMonth = input.includes('letzten monat') || input.includes('vergangenen monat');
                    const wantsThisMonth = input.includes('diesen monat') || input.includes('aktuellen monat') || input.includes('dieser monat');
                    const wantsThisWeek = input.includes('diese woche') || input.includes('aktuelle woche');
                    const wantsLastWeek = input.includes('letzte woche') || input.includes('vergangene woche');

                    let start = '1900-01-01';
                    let end = '2100-01-01';
                    let label = 'Umsatz gesamt';

                    if (wantsLastMonth) {
                        const lastMonth = subMonths(now, 1);
                        start = startOfMonth(lastMonth).toISOString().split('T')[0];
                        end = endOfMonth(lastMonth).toISOString().split('T')[0];
                        label = 'Umsatz letzten Monat';
                    } else if (wantsThisMonth) {
                        start = startOfMonth(now).toISOString().split('T')[0];
                        end = endOfMonth(now).toISOString().split('T')[0];
                        label = 'Umsatz diesen Monat';
                    } else if (wantsLastWeek) {
                        const lastWeek = new Date(now);
                        lastWeek.setDate(now.getDate() - 7);
                        start = startOfWeek(lastWeek, { weekStartsOn: 1 }).toISOString().split('T')[0];
                        end = endOfWeek(lastWeek, { weekStartsOn: 1 }).toISOString().split('T')[0];
                        label = 'Umsatz letzte Woche';
                    } else if (wantsThisWeek) {
                        start = startOfWeek(now, { weekStartsOn: 1 }).toISOString().split('T')[0];
                        end = endOfWeek(now, { weekStartsOn: 1 }).toISOString().split('T')[0];
                        label = 'Umsatz diese Woche';
                    }

                    const personal = input.includes('mein') || input.includes('ich') || input.includes('persoenlich');

                    let q = supabase
                        .from('production_entries')
                        .select('commission_amount', { count: 'exact' })
                        .gte('submission_date', start)
                        .lte('submission_date', end);

                    if (personal) q = q.eq('user_id', userId);

                    const { data, error } = await q;
                    if (error) return { text: `Ich konnte den Umsatz gerade nicht laden. (${error.message})` };

                    const total = (data || []).reduce((acc: number, curr: any) => acc + (Number(curr.commission_amount) || 0), 0);
                    const who = personal ? ' (dein Bereich)' : ' (Team)';

                    return {
                        text: `${label}${who}: **${fmtEur(total)}**`,
                        actions: [{ label: 'Produktion öffnen', action: () => navigate('/production') }],
                    };
                },
            },
            {
                id: 'leads',
                keywords: ['lead', 'leads', 'pipeline', 'offen', 'offene leads'],
                handler: async ({ navigate }) => {
                    const { count, error } = await supabase
                        .from('leads')
                        .select('*', { count: 'exact', head: true })
                        .in('status', ['new', 'contacted', 'proposal']);

                    if (error) return { text: `Ich konnte die Leads gerade nicht laden. (${error.message})` };

                    return {
                        text: `Offene Leads: **${count || 0}**`,
                        actions: [{ label: 'Leads öffnen', action: () => navigate('/leads') }],
                    };
                },
            },
            {
                id: 'callbacks',
                keywords: ['rueckruf', 'rueckrufe', 'callback', 'callbacks', 'anrufen'],
                handler: async ({ userId, navigate }) => {
                    const { count, error } = await supabase
                        .from('callbacks')
                        .select('*', { count: 'exact', head: true })
                        .eq('assigned_to', userId)
                        .neq('status', 'done');

                    if (error) return { text: `Ich konnte die Rückrufe gerade nicht laden. (${error.message})` };

                    return {
                        text: `Offene Rückrufe (für dich): **${count || 0}**`,
                        actions: [{ label: 'Rückrufe öffnen', action: () => navigate('/callbacks') }],
                    };
                },
            },
            {
                id: 'parcels',
                keywords: ['paket', 'pakete', 'post', 'lieferung'],
                handler: async ({ userId, navigate }) => {
                    const { count, error } = await supabase
                        .from('parcels')
                        .select('*', { count: 'exact', head: true })
                        .eq('recipient_id', userId)
                        .in('status', ['pending', 'expected']);

                    if (error) return { text: `Ich konnte die Pakete gerade nicht laden. (${error.message})` };

                    return {
                        text: `Pakete (für dich, offen/unterwegs): **${count || 0}**`,
                        actions: [{ label: 'Pakete öffnen', action: () => navigate('/parcels') }],
                    };
                },
            },
            {
                id: 'absences',
                keywords: ['krank', 'abwesend', 'urlaub', 'wer fehlt', 'wer ist nicht da'],
                handler: async ({ navigate }) => {
                    const today = new Date().toISOString().split('T')[0];
                    const { data, error } = await supabase
                        .from('absences')
                        .select('type, profiles(full_name)')
                        .eq('status', 'approved')
                        .lte('start_date', today)
                        .gte('end_date', today);

                    if (error) return { text: `Ich konnte die Abwesenheiten gerade nicht laden. (${error.message})` };

                    if (!data || data.length === 0) {
                        return { text: 'Heute ist niemand als abwesend eingetragen.', actions: [{ label: 'Kalender öffnen', action: () => navigate('/general-calendar') }] };
                    }

                    const names = data.map((a: any) => `${a.profiles?.full_name || '-'} (${a.type})`).join(', ');

                    return {
                        text: `Heute abwesend: **${names}**`,
                        actions: [{ label: 'Kalender öffnen', action: () => navigate('/general-calendar') }],
                    };
                },
            },
            {
                id: 'calendar',
                keywords: ['kalender', 'termin', 'termine', 'naechster termin', 'heute termine'],
                handler: async ({ userId, navigate, input }) => {
                    const now = new Date();
                    const todayStart = new Date(now);
                    todayStart.setHours(0, 0, 0, 0);
                    const todayEnd = new Date(now);
                    todayEnd.setHours(23, 59, 59, 999);

                    const personal = input.includes('mein') || input.includes('ich') || input.includes('persoenlich');
                    const nextOnly = input.includes('naechster');

                    let q = supabase
                        .from('calendar_events')
                        .select('title, start_time')
                        .order('start_time', { ascending: true })
                        .limit(3);

                    if (personal) q = q.eq('user_id', userId);

                    if (nextOnly) {
                        q = q.gte('start_time', now.toISOString());
                    } else {
                        q = q.gte('start_time', todayStart.toISOString()).lte('start_time', todayEnd.toISOString());
                    }

                    const { data, error } = await q;
                    if (error) return { text: `Ich konnte die Termine gerade nicht laden. (${error.message})` };

                    if (!data || data.length === 0) {
                        return { text: nextOnly ? 'Kein nächster Termin gefunden.' : 'Heute sind keine Termine eingetragen.', actions: [{ label: 'Kalender öffnen', action: () => navigate('/general-calendar') }] };
                    }

                    const lines = data.map((e: any) => {
                        const t = new Date(e.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        return `- ${t} ${e.title}`;
                    });

                    return {
                        text: `${nextOnly ? 'Nächste Termine' : 'Termine heute'}:\n${lines.join('\n')}`,
                        actions: [{ label: 'Kalender öffnen', action: () => navigate('/general-calendar') }],
                    };
                },
            },
            {
                id: 'board',
                keywords: ['pinnwand', 'board', 'nachrichten', 'ankuendigung'],
                handler: async ({ userId, navigate }) => {
                    const since = new Date();
                    since.setDate(since.getDate() - 1);

                    const { count, error } = await supabase
                        .from('board_messages')
                        .select('*', { count: 'exact', head: true })
                        .gte('created_at', since.toISOString())
                        .neq('user_id', userId);

                    if (error) return { text: `Ich konnte die Pinnwand gerade nicht laden. (${error.message})` };

                    return {
                        text: `Neue Pinnwand-Beiträge (letzte 24h, ohne deine): **${count || 0}**`,
                        actions: [{ label: 'Pinnwand öffnen', action: () => navigate('/board') }],
                    };
                },
            },
            {
                id: 'fallback',
                keywords: [],
                handler: async ({ navigate }) => ({
                    text: 'Ich bin ein Offline-Assistent. Schreib z.B. "Hilfe" oder "Öffne Leads".',
                    actions: [{ label: 'Dashboard öffnen', action: () => navigate('/') }],
                }),
            },
        ];

        try {
            const scored = INTENTS
                .map(i => ({
                    intent: i,
                    score:
                        i.id === 'fallback'
                            ? 0
                            : i.keywords.reduce((acc, k) => (input.includes(normalize(k)) ? acc + 1 : acc), 0),
                }))
                .filter(x => x.intent.id === 'fallback' || x.score > 0)
                .sort((a, b) => b.score - a.score);

            const best = scored[0]?.intent || INTENTS.find(i => i.id === 'fallback')!;
            const response = await best.handler({ userId: user.id, navigate, input });
            addBotMessage(response);
        } catch (error) {
            const msg = (error as Error)?.message || 'Unbekannter Fehler';
            addBotMessage({ text: `Ich konnte das gerade nicht ausführen. (${msg})` });
        }
    };

    const addBotMessage = (response: { text: string; actions?: Message['actions'] }) => {
        const botMsg: Message = {
            id: Date.now().toString(),
            role: 'bot',
            content: response.text,
            timestamp: new Date(),
            actions: response.actions
        };
        setMessages(prev => [...prev, botMsg]);
        setIsTyping(false);
    };

    const handleSend = async () => {
        if (!input.trim()) return;

        const userText = input;
        const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: userText,
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsTyping(true);

        await processInput(userText);
    };

    const renderContent = (text: string) => {
        const parts = text.split(/(\*\*.*?\*\*)/g);
        return parts.map((part, index) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={index} className="font-bold text-indigo-700 dark:text-indigo-300">{part.slice(2, -2)}</strong>;
            }
            return part;
        });
    };

    return (
        <>
            {/* Toggle Button */}
            <AnimatePresence>
                {!isOpen && (
                    <motion.button
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        onClick={() => setIsOpen(true)}
                        className="fixed bottom-32 sm:bottom-6 right-6 z-[60] p-4 bg-gradient-to-br from-indigo-600 to-purple-600 text-white rounded-full shadow-2xl hover:shadow-indigo-500/50 transition-all hover:scale-110 group"
                    >
                        <Bot className="w-7 h-7" />
                        <span className="absolute -top-1 -right-1 flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                        </span>
                    </motion.button>
                )}
            </AnimatePresence>

            {/* Chat Window */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ y: 20, opacity: 0, scale: 0.95 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        exit={{ y: 20, opacity: 0, scale: 0.95 }}
                        className={cn(
                            "fixed right-4 sm:right-6 z-[60] bg-white dark:bg-gray-900 shadow-2xl rounded-3xl border border-gray-200 dark:border-gray-800 flex flex-col overflow-hidden transition-all duration-300",
                            isMinimized ? "bottom-24 sm:bottom-6 w-72 h-16" : "bottom-24 sm:bottom-6 w-[90vw] sm:w-96 h-[600px] max-h-[80vh]"
                        )}
                    >
                        {/* Header */}
                        <div 
                            className="p-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white flex items-center justify-between cursor-pointer"
                            onClick={() => !isMinimized && setIsMinimized(true)}
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm">
                                    <Bot className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-sm">AI Assistent</h3>
                                    <p className="text-[10px] text-indigo-100 flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 bg-green-400 rounded-full" /> Online & Bereit
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                {isMinimized ? (
                                    <button onClick={(e) => { e.stopPropagation(); setIsMinimized(false); }} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
                                        <Maximize2 className="w-4 h-4" />
                                    </button>
                                ) : (
                                    <button onClick={(e) => { e.stopPropagation(); setIsMinimized(true); }} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
                                        <Minimize2 className="w-4 h-4" />
                                    </button>
                                )}
                                <button onClick={() => setIsOpen(false)} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Chat Area */}
                        {!isMinimized && (
                            <>
                                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-gray-900/50 custom-scrollbar">
                                    {messages.map((msg) => (
                                        <div 
                                            key={msg.id} 
                                            className={cn(
                                                "flex w-full",
                                                msg.role === 'user' ? "justify-end" : "justify-start"
                                            )}
                                        >
                                            <div className={cn(
                                                "max-w-[85%] rounded-2xl p-3 text-sm shadow-sm",
                                                msg.role === 'user' 
                                                    ? "bg-indigo-600 text-white rounded-tr-none" 
                                                    : "bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-100 dark:border-gray-700 rounded-tl-none"
                                            )}>
                                                <p className="leading-relaxed whitespace-pre-wrap">{renderContent(msg.content)}</p>
                                                {msg.actions && msg.actions.length > 0 && (
                                                    <div className="mt-3 flex flex-wrap gap-2">
                                                        {msg.actions.map((action, idx) => (
                                                            <button
                                                                key={idx}
                                                                onClick={() => action.action()}
                                                                className="text-xs bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 px-3 py-1.5 rounded-lg font-medium hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors flex items-center gap-1 border border-indigo-100 dark:border-indigo-800"
                                                            >
                                                                {action.label} <ArrowRight className="w-3 h-3" />
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                                <span className={cn(
                                                    "text-[10px] mt-1 block text-right opacity-70",
                                                    msg.role === 'user' ? "text-indigo-100" : "text-gray-400"
                                                )}>
                                                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                    {isTyping && (
                                        <div className="flex justify-start">
                                            <div className="bg-white dark:bg-gray-800 p-3 rounded-2xl rounded-tl-none border border-gray-100 dark:border-gray-700 shadow-sm">
                                                <div className="flex gap-1">
                                                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
                                                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-100" />
                                                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-200" />
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    <div ref={messagesEndRef} />
                                </div>

                                {/* Input Area */}
                                <div className="p-3 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700">
                                    <form 
                                        onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                                        className="flex items-center gap-2"
                                    >
                                        <div className="relative flex-1">
                                            <input 
                                                type="text" 
                                                value={input}
                                                onChange={(e) => setInput(e.target.value)}
                                                placeholder="Schreib eine Nachricht..." 
                                                className="w-full bg-gray-50 dark:bg-gray-900 border-none rounded-xl pl-4 pr-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 dark:text-white"
                                            />
                                        </div>
                                        <button 
                                            type="submit"
                                            disabled={!input.trim()}
                                            className="p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-indigo-200 dark:shadow-none"
                                        >
                                            <Send className="w-4 h-4" />
                                        </button>
                                    </form>
                                </div>
                            </>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
};
