import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { PhoneIncoming, Loader2 } from 'lucide-react';
import { useStore } from '@/store/useStore';

export const IncomingCallHandler = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useStore();
  const [status, setStatus] = useState('Logging...');
  const hasLogged = useRef(false); // Prevent double execution

  useEffect(() => {
    if (hasLogged.current) return;
    hasLogged.current = true;

    const logCall = async () => {
      // ... params extraction ...
      const allParams = Object.fromEntries(searchParams.entries());
      const number = searchParams.get('number') || searchParams.get('phoneNumber') || 'Unbekannt';
      const name = searchParams.get('name') || searchParams.get('displayName') || 'Unbekannt';
      const ext = searchParams.get('ext') || searchParams.get('agent'); 

      // Try to find the user by extension (if provided)
      let userId = user?.id; 
      if (!userId && ext) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .eq('phone_extension', ext)
            .single();
          if (profile) userId = profile.id;
      }

      // Check for recent duplicate calls (Debounce)
      const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
      const { data: recent } = await supabase
        .from('phone_calls')
        .select('id')
        .eq('caller_number', number)
        .gte('created_at', oneMinuteAgo)
        .maybeSingle(); // Use maybeSingle to avoid errors if 0 found

      if (!recent) {
          const payload = {
              caller_number: number,
              direction: 'inbound',
              status: 'missed',
              notes: name !== 'Unbekannt' ? `Anrufer: ${name}` : undefined,
              agent_extension: ext || undefined,
              user_id: userId || null
          };
          
          await supabase.from('phone_calls').insert(payload);
          setStatus('Gespeichert!');
      } else {
          setStatus('Bereits erfasst.');
      }
      
      // Auto-Close logic
      setTimeout(() => window.close(), 800);
      setTimeout(() => { if (!window.closed) navigate('/calls'); }, 1000);
    };

    logCall();
  }, [searchParams, navigate, user]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-500 via-purple-600 to-indigo-800 text-white overflow-hidden relative">
      {/* Background decoration */}
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150 mix-blend-overlay"></div>
      <div className="absolute -top-24 -left-24 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob"></div>
      <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000"></div>

      <div className="bg-white/10 backdrop-blur-xl border border-white/20 p-8 rounded-3xl shadow-2xl flex flex-col items-center gap-6 text-center max-w-sm mx-auto animate-in fade-in zoom-in duration-500 relative z-10">
        
        <div className="relative">
            <div className="absolute inset-0 bg-white/20 rounded-full animate-ping duration-1000"></div>
            <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-lg relative z-10">
                <PhoneIncoming className="w-10 h-10 text-indigo-600 animate-bounce" />
            </div>
        </div>

        <div className="space-y-1">
            <h2 className="text-2xl font-black tracking-tight">Eingehender Anruf</h2>
            <p className="text-indigo-100 font-medium text-lg">{status}</p>
        </div>

        {status === 'Logging...' && (
            <div className="flex items-center gap-2 text-sm text-white/60">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Verbinde mit System...</span>
            </div>
        )}
      </div>
    </div>
  );
};
