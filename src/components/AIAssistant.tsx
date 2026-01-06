import { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, X, Bot, User, ArrowRight, Minimize2, Maximize2 } from 'lucide-react';
import { cn } from '@/utils/cn';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';

type Message = {
    id: string;
    role: 'user' | 'bot';
    content: string;
    timestamp: Date;
    actions?: { label: string; action: () => void }[];
};

export const AIAssistant = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [messages, setMessages] = useState<Message[]>([
        {
            id: '1',
            role: 'bot',
            content: 'Hi! Ich bin dein Büro-Assistent. Wie kann ich helfen?',
            timestamp: new Date(),
            actions: [
                { label: 'Zeig mir den Umsatz', action: () => {} }, // Placeholder
                { label: 'Neuer Rückruf', action: () => {} }
            ]
        }
    ]);
    
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();
    const { user } = useStore();

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isOpen]);

    const handleSend = async () => {
        if (!input.trim()) return;

        const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: input,
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsTyping(true);

        // --- BRAIN (Simple Rule-Based for now) ---
        const lowerInput = userMsg.content.toLowerCase();
        let botResponse = "Das habe ich leider nicht verstanden.";
        let actions: Message['actions'] = [];

        // Simulate thinking
        setTimeout(async () => {
            if (lowerInput.includes('hallo') || lowerInput.includes('moin')) {
                botResponse = "Moin moin! Alles fit im Büro?";
            } 
            else if (lowerInput.includes('umsatz') || lowerInput.includes('geld')) {
                // Fetch quick stats
                const { data } = await supabase.from('production_entries').select('commission_amount');
                const total = data?.reduce((acc, curr) => acc + (curr.commission_amount || 0), 0) || 0;
                botResponse = `Dein aktueller Gesamtumsatz beträgt ${new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(total)}.`;
                actions = [{ label: 'Zur Produktion', action: () => navigate('/production') }];
            }
            else if (lowerInput.includes('rückruf') || lowerInput.includes('anruf')) {
                const { count } = await supabase.from('callbacks').select('*', { count: 'exact', head: true }).neq('status', 'done');
                botResponse = `Du hast aktuell ${count || 0} offene Rückrufe.`;
                actions = [{ label: 'Öffnen', action: () => navigate('/callbacks') }];
            }
            else if (lowerInput.includes('paket')) {
                const { count } = await supabase.from('parcels').select('*', { count: 'exact', head: true }).eq('status', 'pending');
                botResponse = `Es liegen ${count || 0} Pakete für dich bereit.`;
                actions = [{ label: 'Ansehen', action: () => navigate('/parcels') }];
            }
            else if (lowerInput.includes('kalender') || lowerInput.includes('termin')) {
                botResponse = "Ich bringe dich zum Kalender.";
                navigate('/calendar');
            }
            else if (lowerInput.includes('witz')) {
                const jokes = [
                    "Warum können Geister so schlecht lügen? Weil man durch sie hindurchsehen kann!",
                    "Was macht ein Clown im Büro? Faxen!",
                    "Ich würde dir einen UDP-Witz erzählen, aber ich weiß nicht, ob er ankommt."
                ];
                botResponse = jokes[Math.floor(Math.random() * jokes.length)];
            }

            const botMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'bot',
                content: botResponse,
                timestamp: new Date(),
                actions
            };

            setMessages(prev => [...prev, botMsg]);
            setIsTyping(false);
        }, 800);
    };

    // Handle Action Click (need to wire this up inside the message renderer)
    const handleActionClick = (action: () => void, label: string) => {
        action();
        // Optionally add a system message or feedback
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
                        className="fixed bottom-6 right-6 z-50 p-4 bg-gradient-to-br from-indigo-600 to-purple-600 text-white rounded-full shadow-2xl hover:shadow-indigo-500/50 transition-all hover:scale-110 group"
                    >
                        <Sparkles className="w-6 h-6 group-hover:rotate-12 transition-transform" />
                        <span className="absolute -top-1 -right-1 flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
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
                            "fixed right-4 sm:right-6 z-50 bg-white dark:bg-gray-900 shadow-2xl rounded-3xl border border-gray-200 dark:border-gray-800 flex flex-col overflow-hidden transition-all duration-300",
                            isMinimized ? "bottom-6 w-72 h-16" : "bottom-6 w-[90vw] sm:w-96 h-[600px] max-h-[80vh]"
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
                                    <h3 className="font-bold text-sm">Büro Assistent</h3>
                                    <p className="text-[10px] text-indigo-100 flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 bg-green-400 rounded-full" /> Online
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
                                                "max-w-[80%] rounded-2xl p-3 text-sm shadow-sm",
                                                msg.role === 'user' 
                                                    ? "bg-indigo-600 text-white rounded-tr-none" 
                                                    : "bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-100 dark:border-gray-700 rounded-tl-none"
                                            )}>
                                                <p>{msg.content}</p>
                                                {msg.actions && msg.actions.length > 0 && (
                                                    <div className="mt-3 flex flex-wrap gap-2">
                                                        {msg.actions.map((action, idx) => (
                                                            <button
                                                                key={idx}
                                                                onClick={() => handleActionClick(action.action, action.label)}
                                                                className="text-xs bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 px-3 py-1.5 rounded-lg font-medium hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors flex items-center gap-1"
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
                                            <div className="bg-white dark:bg-gray-800 p-3 rounded-2xl rounded-tl-none border border-gray-100 dark:border-gray-700">
                                                <div className="flex gap-1">
                                                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                                                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100" />
                                                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200" />
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
                                        <input 
                                            type="text" 
                                            value={input}
                                            onChange={(e) => setInput(e.target.value)}
                                            placeholder="Schreib etwas..." 
                                            className="flex-1 bg-gray-50 dark:bg-gray-900 border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 dark:text-white"
                                        />
                                        <button 
                                            type="submit"
                                            disabled={!input.trim()}
                                            className="p-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
