import { useState, useRef, useEffect } from 'react';
import { Send, X, Bot, ArrowRight, Minimize2, Maximize2, Loader2 } from 'lucide-react';
import { cn } from '@/utils/cn';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import ReactMarkdown from 'react-markdown';

type Message = {
    id: string;
    role: 'user' | 'bot';
    content: string;
    timestamp: Date;
    actions?: { label: string; action: () => void }[];
};

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
            content: 'Hallo! Ich bin dein neuer, intelligenter Büro Manager KI-Assistent. Frag mich nach Umsätzen, offenen Leads, wer heute krank ist oder lass mich dir bei anderen Dingen helfen! 🚀',
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
        
        try {
            // Get last 10 messages for context
            const history = messages.slice(-10).map(m => ({
                role: m.role,
                content: m.content
            }));
            
            // Add new user message
            history.push({ role: 'user', content: userInput });

            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

            const { data: sessionData } = await supabase.auth.getSession();
            const accessToken = sessionData.session?.access_token;

            const res = await fetch(`${supabaseUrl}/functions/v1/chat-assistant`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    apikey: supabaseAnonKey,
                    Authorization: accessToken ? `Bearer ${accessToken}` : '',
                },
                body: JSON.stringify({ messages: history }),
            });

            const payload = await res.json().catch(() => ({}));

            if (!res.ok) {
                const msg = payload?.error || `Fehler ${res.status}`;
                throw new Error(msg);
            }

            addBotMessage({ text: payload.text });
            
        } catch (error) {
            console.error('AI Chat Error:', error);
            addBotMessage({ 
                text: `Entschuldigung, ich bekomme gerade keine Antwort von der KI. (${(error as Error)?.message || 'Unbekannter Fehler'})` 
            });
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

    // Helper to render text with bold markdown
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
                                                <div className={cn("prose prose-sm max-w-none", msg.role === 'user' ? "text-white prose-p:text-white prose-strong:text-white" : "dark:prose-invert prose-indigo")}>
                                                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                                                </div>
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
