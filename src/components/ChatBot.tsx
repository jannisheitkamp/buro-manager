import { useState, useRef, useEffect } from 'react';
import { MessageCircle, Send, X, Bot, User, Sparkles } from 'lucide-react';
import { cn } from '@/utils/cn';
import { supabase } from '@/lib/supabase';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

type Message = {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
};

export const ChatBot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      text: 'Hi! Ich bin dein Büro-Assistent. Frag mich z.B. "Wer ist im Büro?" oder "Ist der Besprechungsraum frei?".',
      sender: 'bot',
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen]);

  const processCommand = async (text: string) => {
    const lowerText = text.toLowerCase();
    let responseText = '';

    // Simulate thinking delay
    setIsTyping(true);
    await new Promise(resolve => setTimeout(resolve, 600));

    try {
      if (lowerText.includes('wer') && (lowerText.includes('büro') || lowerText.includes('office'))) {
        // Fetch users in office
        const { data: statuses } = await supabase
          .from('user_status')
          .select('*, profiles(full_name)')
          .eq('status', 'office')
          .order('updated_at', { ascending: false });

        // Filter for recent statuses (e.g. today) - simple check
        // In a real app we'd filter by date in DB
        const uniqueUsers = Array.from(new Set(statuses?.map(s => s.profiles?.full_name))).filter(Boolean);
        
        if (uniqueUsers.length > 0) {
            responseText = `Aktuell im Büro: ${uniqueUsers.join(', ')}.`;
        } else {
            responseText = 'Gerade scheint niemand im Büro zu sein (oder niemand hat sich eingestempelt).';
        }

      } else if (lowerText.includes('wer') && lowerText.includes('home')) {
         // Fetch users in home office
         const { data: statuses } = await supabase
         .from('user_status')
         .select('*, profiles(full_name)')
         .eq('status', 'remote')
         .order('updated_at', { ascending: false });

       const uniqueUsers = Array.from(new Set(statuses?.map(s => s.profiles?.full_name))).filter(Boolean);
       
       if (uniqueUsers.length > 0) {
           responseText = `Im Home Office sind: ${uniqueUsers.join(', ')}.`;
       } else {
           responseText = 'Niemand ist gerade im Home Office gemeldet.';
       }

      } else if (lowerText.includes('raum') || lowerText.includes('meeting')) {
        // Check bookings for today
        const start = new Date().toISOString();
        const { data: bookings } = await supabase
            .from('bookings')
            .select('*')
            .gte('end_time', start)
            .limit(3);
        
        if (bookings && bookings.length > 0) {
            responseText = `Es gibt ${bookings.length} kommende Buchungen heute. Der nächste Termin ist "${bookings[0].title}" um ${format(new Date(bookings[0].start_time), 'HH:mm')} Uhr.`;
        } else {
            responseText = 'Der Besprechungsraum sieht für den Rest des Tages frei aus! 🎉';
        }

      } else if (lowerText.includes('witz') || lowerText.includes('joke')) {
        const jokes = [
            "Warum stehen Studenten schon um 7 Uhr auf? Weil um 8 der Supermarkt zumacht.",
            "Was macht ein Pirat am Computer? Er drückt die Enter-Taste!",
            "Ich habe einen Witz über Zeitreisen, aber den hast du noch nicht verstanden.",
            "Was ist rot und schlecht für die Zähne? Ein Backstein."
        ];
        responseText = jokes[Math.floor(Math.random() * jokes.length)];

      } else if (lowerText.includes('hallo') || lowerText.includes('hi')) {
        responseText = 'Hallo! Wie kann ich helfen? 👋';

      } else if (lowerText.includes('danke')) {
        responseText = 'Gerne! 😊';
        
      } else if (lowerText.includes('kalender') || lowerText.includes('abwesenheit')) {
        navigate('/calendar');
        responseText = 'Ich habe dich zum Kalender weitergeleitet. 📅';

      } else if (lowerText.includes('umfrage') || lowerText.includes('poll')) {
        navigate('/polls');
        responseText = 'Hier sind die Umfragen! 📊';

      } else if (lowerText.includes('rückruf') || lowerText.includes('callback') || lowerText.includes('telefon') || lowerText.includes('anruf') || lowerText.includes('notiz')) {
        navigate('/callbacks');
        responseText = 'Ich habe dich zu den Telefon-Notizen gebracht. Hier kannst du Rückrufe für Kollegen eintragen oder sehen, wer dich angerufen hat! 📞';

      } else if (lowerText.includes('paket') || lowerText.includes('parcel') || lowerText.includes('lieferung')) {
        navigate('/parcels');
        responseText = 'Hier ist die Paketstation. Du kannst neue Pakete eintragen oder sehen, ob etwas für dich angekommen ist. 📦';

      } else {
        responseText = 'Das habe ich leider nicht verstanden. Ich lerne noch! Probier es mal mit "Wer ist im Büro?" oder "Ist der Raum frei?".';
      }
    } catch (error) {
      console.error(error);
      responseText = 'Hoppla, da ist ein Fehler passiert. Versuch es später nochmal.';
    }

    setIsTyping(false);
    
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      text: responseText,
      sender: 'bot',
      timestamp: new Date(),
    }]);
  };

  const handleSend = () => {
    if (!inputValue.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      text: inputValue,
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    
    processCommand(userMsg.text);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  return (
    <>
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "fixed bottom-20 lg:bottom-6 right-6 z-[100] p-4 rounded-full shadow-lg transition-all duration-300 hover:scale-110",
          isOpen 
            ? "bg-red-500 text-white rotate-90" 
            : "bg-indigo-600 text-white hover:bg-indigo-700"
        )}
      >
        {isOpen ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
      </button>

      {/* Chat Window */}
      <div
        className={cn(
          "fixed bottom-36 lg:bottom-24 right-6 z-[100] w-80 sm:w-96 bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 dark:border-gray-700/50 overflow-hidden transition-all duration-300 origin-bottom-right flex flex-col",
          isOpen 
            ? "opacity-100 scale-100 translate-y-0" 
            : "opacity-0 scale-95 translate-y-10 pointer-events-none"
        )}
        style={{ height: '500px', maxHeight: '60vh' }}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-4 flex items-center gap-3">
          <div className="bg-white/20 p-2.5 rounded-full backdrop-blur-sm shadow-inner">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-white font-bold tracking-wide">Büro Bot</h3>
            <p className="text-indigo-100 text-xs flex items-center gap-1.5 font-medium">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400"></span>
              </span>
              Online
            </p>
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50 dark:bg-gray-900/50">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex gap-3 max-w-[85%]",
                msg.sender === 'user' ? "ml-auto flex-row-reverse" : ""
              )}
            >
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                msg.sender === 'user' ? "bg-gray-200 dark:bg-gray-700" : "bg-indigo-100 dark:bg-indigo-900/30"
              )}>
                {msg.sender === 'user' ? (
                  <User className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                ) : (
                  <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                )}
              </div>
              
              <div className={cn(
                "p-3 rounded-2xl text-sm shadow-sm",
                msg.sender === 'user' 
                  ? "bg-indigo-600 text-white rounded-tr-none" 
                  : "bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-tl-none border border-gray-100 dark:border-gray-700"
              )}>
                {msg.text}
                <div className={cn(
                    "text-[10px] mt-1 opacity-70",
                    msg.sender === 'user' ? "text-indigo-100" : "text-gray-400"
                )}>
                    {format(msg.timestamp, 'HH:mm')}
                </div>
              </div>
            </div>
          ))}
          
          {isTyping && (
             <div className="flex gap-3 max-w-[85%]">
                <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="bg-white dark:bg-gray-800 p-3 rounded-2xl rounded-tl-none border border-gray-100 dark:border-gray-700 flex items-center gap-1">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
             </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 bg-white/80 dark:bg-gray-800/80 backdrop-blur-md border-t border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700/50 rounded-full px-4 py-2.5 transition-all focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:bg-white dark:focus-within:bg-gray-700">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Frag mich etwas..."
              className="flex-1 bg-transparent focus:outline-none text-sm text-gray-900 dark:text-white placeholder-gray-400 font-medium"
            />
            <button
              onClick={handleSend}
              disabled={!inputValue.trim()}
              className="p-2 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 transition-all hover:scale-105 active:scale-95 shadow-md shadow-indigo-200 dark:shadow-none"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
