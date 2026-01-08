import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Phone, PhoneMissed, PhoneIncoming, Clock, CheckCircle, XCircle, Search, ClipboardList, Plus, AlertCircle, Trash2, ArrowRight, PenTool, Check } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { cn } from '@/utils/cn';
import toast from 'react-hot-toast';
import { useStore } from '@/store/useStore';
import { Modal } from '@/components/Modal';
import { ConfirmModal } from '@/components/ConfirmModal';
import { motion, AnimatePresence } from 'framer-motion';
import { Callback, Profile } from '@/types';

export const PhoneCalls = () => {
  const { user, profile } = useStore();
  const [activeTab, setActiveTab] = useState<'live' | 'tasks'>('live');
  
  // --- STATE FOR LIVE CALLS ---
  const [calls, setCalls] = useState<any[]>([]);
  const [loadingCalls, setLoadingCalls] = useState(true);
  const [filterCalls, setFilterCalls] = useState<'all' | 'missed'>('all');

  // --- STATE FOR CALLBACK TASKS ---
  const [callbacks, setCallbacks] = useState<Callback[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loadingCallbacks, setLoadingCallbacks] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filterCallbacks, setFilterCallbacks] = useState<'open' | 'done'>('open');

  // Form State for Tasks
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [topic, setTopic] = useState('');
  const [priority, setPriority] = useState<'normal' | 'high'>('normal');
  const [assignedTo, setAssignedTo] = useState<string>('');


  // --- LIVE CALLS LOGIC ---
  const fetchCalls = async () => {
    setLoadingCalls(true);
    // Fetch calls for current user
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
    setLoadingCalls(false);
  };

  const handleMarkDone = async (id: string) => {
      const { error } = await supabase
        .from('phone_calls')
        .update({ notes: 'Rückruf erledigt' }) 
        .eq('id', id);
      
      if (error) toast.error('Fehler');
      else {
          toast.success('Als erledigt markiert');
          fetchCalls(); 
      }
  };

  const handleDeleteCall = async (id: string) => {
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

  const isDone = (call: any) => call.notes?.includes('erledigt');
  const filteredCalls = filterCalls === 'all' ? calls : calls.filter(c => c.status === 'missed' && !isDone(c));


  // --- CALLBACK TASKS LOGIC ---
  const fetchCallbacks = async () => {
    try {
      const { data, error } = await supabase
        .from('callbacks')
        .select(`
          *,
          creator:created_by(*),
          assignee:assigned_to(*),
          completer:completed_by(*)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCallbacks(data || []);
    } catch (error) {
      console.error('Error fetching callbacks:', error);
    } finally {
      setLoadingCallbacks(false);
    }
  };

  const fetchProfiles = async () => {
    const { data } = await supabase.from('profiles').select('*').order('full_name');
    setProfiles(data || []);
  };

  const handleCreateCallback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSubmitting(true);
    try {
      const { error } = await supabase.from('callbacks').insert({
        customer_name: customerName,
        phone,
        topic,
        priority,
        assigned_to: assignedTo || null,
        created_by: user.id,
        status: 'open'
      });

      if (error) throw error;

      toast.success('Notiz erstellt!');
      setIsModalOpen(false);
      setCustomerName('');
      setPhone('');
      setTopic('');
      setPriority('normal');
      setAssignedTo('');
    } catch (error) {
      console.error('Error creating callback:', error);
      toast.error('Fehler beim Erstellen.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompleteTask = async (id: string) => {
    if (!user) return;
    try {
        const { error } = await supabase
            .from('callbacks')
            .update({ 
                status: 'done', 
                completed_by: user.id,
                completed_at: new Date().toISOString()
            })
            .eq('id', id);
        
        if (error) throw error;
        toast.success('Erledigt! ✅');
    } catch (error) {
        toast.error('Fehler.');
    }
  };

  const handleDeleteTask = async () => {
    if (!deleteId) return;
    try {
        await supabase.from('callbacks').delete().eq('id', deleteId);
        toast.success('Gelöscht.');
        setDeleteId(null);
    } catch (error) {
        toast.error('Fehler beim Löschen.');
    }
  };

  const filteredCallbacks = callbacks.filter(c => {
    if (filterCallbacks === 'open') return c.status !== 'done';
    if (filterCallbacks === 'done') return c.status === 'done';
    return true;
  });
  
  const isAdmin = profile?.roles?.includes('admin');


  // --- EFFECTS ---
  useEffect(() => {
    fetchCalls();
    fetchCallbacks();
    fetchProfiles();

    const channel1 = supabase
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

    const channel2 = supabase
      .channel('callbacks_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'callbacks' }, fetchCallbacks)
      .subscribe();

    return () => {
      supabase.removeChannel(channel1);
      supabase.removeChannel(channel2);
    };
  }, []);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8">
      {/* HEADER & TABS */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white flex items-center gap-3">
            <Phone className="w-8 h-8 text-indigo-600" />
            Telefonie
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2">
            Zentrale Übersicht für alle Anrufe und Rückruf-Aufgaben.
          </p>
        </div>
        
        <div className="flex bg-gray-100 dark:bg-gray-800 p-1.5 rounded-2xl self-start md:self-auto">
            <button 
                onClick={() => setActiveTab('live')}
                className={cn(
                    "px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
                    activeTab === 'live' 
                        ? "bg-white dark:bg-gray-700 shadow-sm text-indigo-600 dark:text-indigo-400" 
                        : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                )}
            >
                <PhoneIncoming className="w-4 h-4" />
                Live / Verpasst
            </button>
            <button 
                onClick={() => setActiveTab('tasks')}
                className={cn(
                    "px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
                    activeTab === 'tasks' 
                        ? "bg-white dark:bg-gray-700 shadow-sm text-indigo-600 dark:text-indigo-400" 
                        : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                )}
            >
                <ClipboardList className="w-4 h-4" />
                Rückruf-Aufgaben
            </button>
        </div>
      </div>

      {/* CONTENT LIVE CALLS */}
      {activeTab === 'live' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-end">
                <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
                    <button 
                        onClick={() => setFilterCalls('all')}
                        className={cn(
                            "px-4 py-2 rounded-lg text-xs font-bold transition-all",
                            filterCalls === 'all' ? "bg-white dark:bg-gray-700 shadow-sm text-indigo-600" : "text-gray-500"
                        )}
                    >
                        Alle
                    </button>
                    <button 
                        onClick={() => setFilterCalls('missed')}
                        className={cn(
                            "px-4 py-2 rounded-lg text-xs font-bold transition-all",
                            filterCalls === 'missed' ? "bg-white dark:bg-gray-700 shadow-sm text-red-600" : "text-gray-500"
                        )}
                    >
                        Nur Verpasste
                    </button>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                {loadingCalls ? (
                    <div className="p-12 text-center text-gray-500">Lade Anrufe...</div>
                ) : filteredCalls.length === 0 ? (
                    <div className="p-20 text-center">
                        <div className="w-16 h-16 bg-gray-50 dark:bg-gray-700/50 rounded-full flex items-center justify-center mx-auto mb-4">
                            <PhoneIncoming className="w-8 h-8 text-gray-400" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white">Keine Anrufe</h3>
                        <p className="text-gray-500 text-sm mt-1">Die Liste ist leer.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-100 dark:divide-gray-700">
                        {filteredCalls.map((call) => (
                            <div key={call.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4 group">
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
                                                <span className="text-gray-400 italic max-w-md truncate hidden md:inline">• {call.notes}</span>
                                            )}
                                        </div>
                                        {call.notes && !isDone(call) && (
                                            <p className="text-xs text-gray-400 mt-1 md:hidden">{call.notes}</p>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 self-end md:self-auto">
                                    {call.status === 'missed' && !isDone(call) && (
                                        <button 
                                            onClick={() => handleMarkDone(call.id)}
                                            className="px-4 py-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-xl text-sm font-bold transition-colors"
                                        >
                                            Rückruf erledigt
                                        </button>
                                    )}
                                    <button 
                                        onClick={() => handleDeleteCall(call.id)}
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
      )}

      {/* CONTENT CALLBACK TASKS */}
      {activeTab === 'tasks' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
             <div className="flex flex-col sm:flex-row justify-between gap-4">
                 <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl self-start">
                    <button 
                        onClick={() => setFilterCallbacks('open')}
                        className={cn(
                            "px-4 py-2 rounded-lg text-xs font-bold transition-all",
                            filterCallbacks === 'open' ? "bg-white dark:bg-gray-700 shadow-sm text-indigo-600" : "text-gray-500"
                        )}
                    >
                        Offen
                    </button>
                    <button 
                        onClick={() => setFilterCallbacks('done')}
                        className={cn(
                            "px-4 py-2 rounded-lg text-xs font-bold transition-all",
                            filterCallbacks === 'done' ? "bg-white dark:bg-gray-700 shadow-sm text-green-600" : "text-gray-500"
                        )}
                    >
                        Erledigt
                    </button>
                </div>

                <button
                    onClick={() => setIsModalOpen(true)}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20 hover:scale-105 transition-all flex items-center gap-2"
                >
                    <Plus className="w-5 h-5" />
                    Aufgabe erstellen
                </button>
             </div>

             <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                <AnimatePresence>
                    {loadingCallbacks ? (
                        <div className="col-span-full py-20 text-center text-gray-400">Lade Aufgaben...</div>
                    ) : filteredCallbacks.length === 0 ? (
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="col-span-full text-center py-20"
                        >
                            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 mb-4">
                                <ClipboardList className="w-8 h-8 text-gray-400" />
                            </div>
                            <p className="text-lg text-gray-500 font-medium">Keine Aufgaben gefunden.</p>
                        </motion.div>
                    ) : (
                        filteredCallbacks.map((cb, index) => {
                            const isHighPrio = cb.priority === 'high';
                            const isDone = cb.status === 'done';
                            const isForMe = cb.assigned_to === user?.id;
                            const isCreator = cb.created_by === user?.id;

                            return (
                                <motion.div 
                                    key={cb.id} 
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: index * 0.05 }}
                                    layout
                                    className={cn(
                                        "bg-white dark:bg-gray-800 rounded-3xl p-6 border shadow-sm flex flex-col relative overflow-hidden group hover:-translate-y-1 transition-all duration-300",
                                        isForMe && !isDone ? "ring-2 ring-indigo-500/50 border-indigo-200 dark:border-indigo-900" : "border-gray-100 dark:border-gray-700",
                                        isHighPrio && !isDone ? "bg-red-50/50 dark:bg-red-900/10 border-red-100" : "",
                                        isDone && "opacity-60 grayscale-[0.5]"
                                    )}
                                >
                                    {isHighPrio && !isDone && (
                                        <div className="absolute top-0 right-0 bg-red-500 text-white text-[10px] font-black tracking-wider px-3 py-1 rounded-bl-2xl flex items-center gap-1 shadow-sm z-10">
                                            <AlertCircle className="w-3 h-3" /> WICHTIG
                                        </div>
                                    )}
                                    
                                    {isForMe && !isDone && (
                                        <div className="absolute top-0 left-0 bg-indigo-600 text-white text-[10px] font-black tracking-wider px-3 py-1 rounded-br-2xl shadow-sm z-10">
                                            FÜR DICH
                                        </div>
                                    )}

                                    <div className="mb-4 mt-2">
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-start gap-4">
                                                <div className={cn(
                                                    "w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-inner",
                                                    isHighPrio && !isDone ? "bg-red-100 text-red-600" : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                                                )}>
                                                    <Phone className="w-6 h-6" />
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-lg text-gray-900 dark:text-white leading-tight">
                                                        {cb.customer_name}
                                                    </h3>
                                                    <a href={`tel:${cb.phone}`} className="text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 font-semibold text-sm block mt-1 hover:underline">
                                                        {cb.phone || 'Keine Nummer'}
                                                    </a>
                                                </div>
                                            </div>

                                            {(isCreator || isAdmin || isDone) && (
                                                <button 
                                                    onClick={() => setDeleteId(cb.id)}
                                                    className="text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                                                    title="Notiz löschen"
                                                >
                                                    <Trash2 className="w-5 h-5" />
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    <div className="bg-gray-50 dark:bg-gray-700/30 rounded-2xl p-4 mb-6 flex-grow border border-gray-100 dark:border-gray-600/30">
                                        <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">
                                            {cb.topic || 'Keine Notiz hinterlassen.'}
                                        </p>
                                    </div>

                                    <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-700/50 mt-auto">
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                                                <PenTool className="w-3 h-3" />
                                                <span>{cb.creator?.full_name?.split(' ')[0]}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
                                                <Clock className="w-3 h-3" />
                                                {format(new Date(cb.created_at), 'dd.MM. HH:mm', { locale: de })}
                                            </div>
                                        </div>

                                        {!isDone ? (
                                            <div className="flex items-center gap-3">
                                                <div className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                                                    <ArrowRight className="w-3 h-3" />
                                                    {cb.assignee?.full_name?.split(' ')[0] || 'Alle'}
                                                </div>
                                                
                                                <button 
                                                    onClick={() => handleCompleteTask(cb.id)}
                                                    className="p-2.5 bg-green-500 hover:bg-green-600 text-white rounded-xl shadow-lg shadow-green-500/30 hover:shadow-green-500/50 hover:scale-105 transition-all"
                                                    title="Als erledigt markieren"
                                                >
                                                    <Check className="w-5 h-5" />
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                                                <Check className="w-3 h-3" /> Erledigt
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            );
                        })
                    )}
                </AnimatePresence>
             </div>
        </div>
      )}

      {/* MODALS FOR TASKS */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Rückruf-Aufgabe erstellen"
      >
        <form onSubmit={handleCreateCallback} className="space-y-6">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Wer hat angerufen? *
            </label>
            <input
              required
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Name / Firma"
              className="w-full rounded-xl border-transparent bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 px-4 py-3 text-sm transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Rückruf-Nummer *
            </label>
            <input
              required
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0171..."
              className="w-full rounded-xl border-transparent bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 px-4 py-3 text-sm transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Worum geht es? (Notiz)
            </label>
            <textarea
              rows={4}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Hat Fragen zu Vertrag XYZ..."
              className="w-full rounded-xl border-transparent bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 px-4 py-3 text-sm transition-all resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Für wen? *
                </label>
                <select
                required
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="w-full rounded-xl border-transparent bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 px-4 py-3 text-sm transition-all"
                >
                <option value="">-- Bitte wählen --</option>
                {profiles.map(p => (
                    <option key={p.id} value={p.id}>{p.full_name}</option>
                ))}
                </select>
            </div>
             <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Dringlichkeit
                </label>
                <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as 'normal' | 'high')}
                className="w-full rounded-xl border-transparent bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 px-4 py-3 text-sm transition-all"
                >
                <option value="normal">Normal</option>
                <option value="high">🔥 Wichtig</option>
                </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-6 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-lg shadow-indigo-500/30 transition-all hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
            >
              {submitting ? 'Speichere...' : 'Notieren'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDeleteTask}
        title="Löschen"
        message="Wirklich löschen?"
        confirmText="Weg damit"
        isDestructive
      />
    </div>
  );
};
