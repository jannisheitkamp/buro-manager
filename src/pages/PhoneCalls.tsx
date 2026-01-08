import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Phone, PhoneMissed, PhoneIncoming, Clock, CheckCircle, XCircle, Search } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { cn } from '@/utils/cn';
import toast from 'react-hot-toast';

export const PhoneCalls = () => {
  const [calls, setCalls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'missed'>('all');

    const fetchCalls = async () => {
    setLoading(true);
    // Fetch ALL calls for debugging purposes temporarily
    const { data, error } = await supabase
      .from('phone_calls')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error(error);
      toast.error('Fehler beim Laden der Anrufe');
    } else {
      setCalls(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCalls();

    // Realtime subscription for new calls
    const channel = supabase
      .channel('phone_calls_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'phone_calls' }, (payload) => {
        setCalls((prev) => [payload.new, ...prev]);
        if (payload.new.status === 'missed') {
            toast('Neuer verpasster Anruf!', { icon: '📞' });
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'phone_calls' }, (payload) => {
        setCalls((prev) => prev.map(c => c.id === payload.new.id ? payload.new : c));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleMarkDone = async (id: string) => {
      const { error } = await supabase
        .from('phone_calls')
        .update({ notes: 'Rückruf erledigt' }) // Simple marker for now
        .eq('id', id);
      
      if (error) toast.error('Fehler');
      else {
          toast.success('Als erledigt markiert');
          fetchCalls(); // Refresh to update UI
      }
  };

  const handleDelete = async (id: string) => {
      toast((t) => (
          <div className="flex flex-col gap-2">
              <span className="font-semibold">Anruf wirklich löschen?</span>
              <div className="flex gap-2">
                  <button 
                      onClick={async () => {
                          toast.dismiss(t.id);
                          const { error } = await supabase.from('phone_calls').delete().eq('id', id);
                          if(!error) {
                              toast.success('Gelöscht');
                              setCalls(prev => prev.filter(c => c.id !== id));
                          } else {
                              toast.error('Fehler beim Löschen');
                          }
                      }}
                      className="bg-red-500 text-white px-3 py-1 rounded-lg text-sm hover:bg-red-600 transition-colors"
                  >
                      Löschen
                  </button>
                  <button 
                      onClick={() => toast.dismiss(t.id)}
                      className="bg-gray-100 text-gray-700 px-3 py-1 rounded-lg text-sm hover:bg-gray-200 transition-colors"
                  >
                      Abbrechen
                  </button>
              </div>
          </div>
      ), { duration: 5000 });
  };

  // Only show "done" if explicitly marked in notes. New calls have no notes.
  const isDone = (call: any) => call.notes?.includes('erledigt');

  const filteredCalls = filter === 'all' ? calls : calls.filter(c => c.status === 'missed' && !isDone(c));

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white flex items-center gap-3">
            <Phone className="w-8 h-8 text-indigo-600" />
            Anrufliste
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2">
            Verpasste und eingehende Anrufe in Echtzeit.
          </p>
        </div>
        
        <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
            <button 
                onClick={() => setFilter('all')}
                className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                    filter === 'all' ? "bg-white dark:bg-gray-700 shadow-sm text-indigo-600" : "text-gray-500"
                )}
            >
                Alle
            </button>
            <button 
                onClick={() => setFilter('missed')}
                className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                    filter === 'missed' ? "bg-white dark:bg-gray-700 shadow-sm text-red-600" : "text-gray-500"
                )}
            >
                Nur Verpasste
            </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        {loading ? (
            <div className="p-8 text-center text-gray-500">Lade Anrufe...</div>
        ) : filteredCalls.length === 0 ? (
            <div className="p-12 text-center">
                <div className="w-16 h-16 bg-gray-50 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                    <PhoneIncoming className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">Keine Anrufe gefunden</h3>
                <p className="text-gray-500 text-sm mt-1">Es liegen keine aktuellen Einträge vor.</p>
            </div>
        ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {filteredCalls.map((call) => (
                    <div key={call.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors flex items-center justify-between group">
                        <div className="flex items-center gap-4">
                            <div className={cn(
                                "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0",
                                call.status === 'missed' ? "bg-red-100 text-red-600 dark:bg-red-900/20" : "bg-green-100 text-green-600 dark:bg-green-900/20"
                            )}>
                                {call.status === 'missed' ? <PhoneMissed className="w-6 h-6" /> : <PhoneIncoming className="w-6 h-6" />}
                            </div>
                            <div>
                                <h3 className="font-bold text-gray-900 dark:text-white text-lg">
                                    {call.caller_number || 'Unbekannt'}
                                </h3>
                                <div className="flex items-center gap-3 text-sm text-gray-500">
                                    <span className="flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        {format(new Date(call.created_at), 'dd.MM. HH:mm', { locale: de })}
                                    </span>
                                    {call.duration > 0 && (
                                        <span>• {Math.floor(call.duration / 60)}m {call.duration % 60}s</span>
                                    )}
                                    {isDone(call) && (
                                        <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
                                            <CheckCircle className="w-3 h-3" /> Erledigt
                                        </span>
                                    )}
                                    {call.notes && !isDone(call) && (
                                         <span className="text-gray-400 italic">• {call.notes}</span>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            {call.status === 'missed' && !isDone(call) && (
                                <button 
                                    onClick={() => handleMarkDone(call.id)}
                                    className="px-4 py-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-xl text-sm font-medium transition-colors opacity-0 group-hover:opacity-100"
                                >
                                    Rückruf erledigt
                                </button>
                            )}
                            <button 
                                onClick={() => handleDelete(call.id)}
                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors opacity-0 group-hover:opacity-100"
                                title="Löschen"
                            >
                                <XCircle className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        )}
      </div>
    </div>
  );
};
