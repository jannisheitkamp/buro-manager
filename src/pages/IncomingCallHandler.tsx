import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { PhoneIncoming, Loader2 } from 'lucide-react';
import { useStore } from '@/store/useStore';

export const IncomingCallHandler = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useStore();
  const [status, setStatus] = useState('Wird gespeichert');
  const hasLogged = useRef(false); // Prevent double execution

  useEffect(() => {
    if (hasLogged.current) return;
    hasLogged.current = true;

    const logCall = async () => {
      // ... params extraction ...
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
          setStatus('Anruf gespeichert');
      } else {
          setStatus('Anruf war bereits erfasst');
      }
      
      // Auto-Close logic
      setTimeout(() => window.close(), 800);
      setTimeout(() => { if (!window.closed) navigate('/calls'); }, 1000);
    };

    logCall();
  }, [searchParams, navigate, user?.id]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-brand-900 px-6 text-white">
      <div className="flex max-w-sm flex-col items-center gap-5 text-center">
        <span className="relative flex h-20 w-20 items-center justify-center rounded-full bg-white/10">
          <span className="absolute inset-0 animate-ping rounded-full bg-white/10" />
          <PhoneIncoming className="h-8 w-8 text-amber-300" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold">Eingehender Anruf</h1>
          <p className="mt-1 text-brand-100">{status}</p>
        </div>
        {status === 'Wird gespeichert' && (
          <p className="flex items-center gap-2 text-sm text-brand-200">
            <Loader2 className="h-4 w-4 animate-spin" /> Verbindung zum Büro Manager
          </p>
        )}
      </div>
    </div>
  );
};
