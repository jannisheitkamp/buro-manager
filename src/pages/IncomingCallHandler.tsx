import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { PhoneIncoming, Loader2 } from 'lucide-react';
import { useStore } from '@/store/useStore';

export const IncomingCallHandler = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useStore();
  const [status, setStatus] = useState('Logging...');

  useEffect(() => {
    const logCall = async () => {
      // Log ALL params to see what we get (will be visible in notes/console)
      const allParams = Object.fromEntries(searchParams.entries());
      console.log('Received params:', allParams);

      // Support both our custom params and standard 3CX/example params
      // Fallback to "Unknown" if nothing is found
      const number = searchParams.get('number') || searchParams.get('phoneNumber') || 'Unbekannt';
      const name = searchParams.get('name') || searchParams.get('displayName') || 'Unbekannt';
      const ext = searchParams.get('ext') || searchParams.get('agent'); 

      // REMOVED THE BLOCKING CHECK
      // if (!number) { ... }

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

      // Check if we already logged this call in the last minute (debounce)
      const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
      const { data: recent } = await supabase
        .from('phone_calls')
        .select('id')
        .eq('caller_number', number)
        .gte('created_at', oneMinuteAgo)
        .single();

      const payload = {
          caller_number: number,
          direction: 'inbound',
          status: 'missed',
          notes: name !== 'Unbekannt' ? `Anrufer: ${name}` : undefined,
          agent_extension: ext || undefined,
          user_id: userId || null
      };
      
      await supabase.from('phone_calls').insert(payload);
      
      // Feedback UI
      setStatus('Gespeichert!');
      
      // Auto-Close the window after a short delay
      // This solves the "annoying popup" issue
      setTimeout(() => {
          window.close();
      }, 800);
      
      // Fallback redirect if window.close() is blocked by browser
      // (Browsers sometimes block scripts from closing windows they didn't open via script)
      setTimeout(() => {
          if (!window.closed) {
              navigate('/calls');
          }
      }, 1000);
    };

    logCall();
  }, [searchParams, navigate, user]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-xl flex flex-col items-center gap-4 text-center max-w-sm mx-auto animate-in fade-in zoom-in duration-300">
        <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center animate-pulse">
            <PhoneIncoming className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Anruf erkannt</h2>
            <p className="text-gray-500 dark:text-gray-400 mt-1">{status}</p>
        </div>
        {status === 'Logging...' && <Loader2 className="w-5 h-5 animate-spin text-gray-400" />}
      </div>
    </div>
  );
};
