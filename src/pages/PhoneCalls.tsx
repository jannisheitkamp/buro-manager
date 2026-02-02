import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Phone, PhoneMissed, PhoneIncoming, Clock, CheckCircle, XCircle, Search, ClipboardList, Plus, AlertCircle, Trash2, ArrowRight, PenTool, Check, MessageSquare, PhoneOutgoing, Calendar, UserPlus } from 'lucide-react';
import { format, addDays } from 'date-fns';
import { de } from 'date-fns/locale';
import { cn } from '@/utils/cn';
import toast from 'react-hot-toast';
import { useStore } from '@/store/useStore';
import { Modal } from '@/components/Modal';
import { ConfirmModal } from '@/components/ConfirmModal';
import { motion, AnimatePresence } from 'framer-motion';
import { Callback, Profile } from '@/types';
import { useSearchParams } from 'react-router-dom';

export const PhoneCalls = () => {
  const { user, profile } = useStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'live' | 'tasks' | 'dialer'>(
      (searchParams.get('tab') as 'live' | 'tasks' | 'dialer') || 'live'
  );

  // --- DIALER STATE ---
  const [leads, setLeads] = useState<any[]>([]);
  const [currentLeadIndex, setCurrentLeadIndex] = useState(0);
  const [dialerMode, setDialerMode] = useState<'idle' | 'calling'>('idle');
  const [importText, setImportText] = useState('');
  const [showImporter, setShowImporter] = useState(false);

  // --- DIALER LOGIC ---
  const fetchLeads = async () => {
      const { data } = await supabase.from('leads').select('*').neq('status', 'done').order('created_at', { ascending: false });
      setLeads(data || []);
  };

  const handleImportLeads = async () => {
      // Format: Name, Phone (one per line)
      const lines = importText.split('\n');
      const newLeads = [];
      
      for (const line of lines) {
          const [name, phone] = line.split(',');
          if (name && phone) {
              newLeads.push({
                  user_id: user?.id,
                  customer_name: name.trim(),
                  phone: phone.trim().replace(/\s/g, ''),
                  status: 'new'
              });
          }
      }
      
      if (newLeads.length > 0) {
          const { error } = await supabase.from('leads').insert(newLeads);
          if (!error) {
              toast.success(`${newLeads.length} Leads importiert!`);
              setImportText('');
              setShowImporter(false);
              fetchLeads();
          } else {
              toast.error('Fehler beim Import');
          }
      }
  };

  const handleLeadResult = async (leadId: string, result: 'appointment' | 'later' | 'no_interest' | 'unreachable' | 'bad_number') => {
      let updateData: any = { last_call_at: new Date().toISOString() };
      
      // Update logic based on result
      if (result === 'appointment') {
          updateData.status = 'done';
          updateData.notes = 'Termin vereinbart ✅';
          toast.success('Termin vereinbart! 🎉');
      } else if (result === 'no_interest') {
          updateData.status = 'lost';
          updateData.notes = 'Kein Interesse ❌';
      } else if (result === 'bad_number') {
          updateData.status = 'bad';
          updateData.notes = 'Falsche Nummer';
      } else if (result === 'unreachable') {
          updateData.status = 'retry';
          updateData.next_call_at = addDays(new Date(), 1).toISOString(); // Auto-reschedule tomorrow
          updateData.call_attempts = (leads[currentLeadIndex].call_attempts || 0) + 1;
          toast('Wiedervorlage: Morgen', { icon: '📅' });
      } else if (result === 'later') {
          // Ideally open date picker, for now auto 3 days
          updateData.status = 'retry';
          updateData.next_call_at = addDays(new Date(), 3).toISOString();
          toast('Wiedervorlage: in 3 Tagen', { icon: '⏰' });
      }

      await supabase.from('leads').update(updateData).eq('id', leadId);
      
      // Move to next lead
      if (currentLeadIndex < leads.length - 1) {
          setCurrentLeadIndex(prev => prev + 1);
      } else {
          toast.success('Liste abgearbeitet! 💪');
          setDialerMode('idle');
          fetchLeads(); // Refresh list (completed ones will disappear)
          setCurrentLeadIndex(0);
      }
  };

  useEffect(() => {
      if (activeTab === 'dialer') fetchLeads();
  }, [activeTab]);
  
  // Update URL when tab changes
  useEffect(() => {
      setSearchParams({ tab: activeTab });
  }, [activeTab, setSearchParams]);
  
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
  const [scriptOpen, setScriptOpen] = useState<string | null>(null); // New: Anruf-Skript Overlay ID

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
      // Direct delete without confirmation as requested for faster workflow
      const { error } = await supabase.from('phone_calls').delete().eq('id', id);
      if(!error) {
          toast.success('Gelöscht');
          setCalls(prev => prev.filter(c => c.id !== id));
      } else {
          toast.error('Fehler beim Löschen');
      }
  };

  const handleCreateTaskFromCall = (call: any) => {
      setCustomerName(call.notes?.replace('Anrufer: ', '') || 'Unbekannt');
      setPhone(call.caller_number || '');
      setTopic('Verpasster Anruf');
      setIsModalOpen(true);
      setActiveTab('tasks'); // Switch to tasks tab so user sees the modal in context
  };

  const isDone = (call: any) => call.notes?.includes('erledigt');

  // --- RENDER HELPERS ---
  // Ensure uniqueness just before rendering to be absolutely safe
  const uniqueCalls = Array.from(new Map(calls.map(item => [item.id, item])).values());
  const filteredCalls = filterCalls === 'all' ? uniqueCalls : uniqueCalls.filter(c => c.status === 'missed' && !isDone(c));


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
        setCalls((prev) => {
            // Strong deduplication: Check ID existence
            const exists = prev.some(c => c.id === payload.new.id);
            if (exists) return prev;
            return [payload.new, ...prev];
        });
        if (payload.new.status === 'missed') {
            toast('Neuer verpasster Anruf!', { icon: '📞' });
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'phone_calls' }, (payload) => {
        setCalls((prev) => prev.map(c => c.id === payload.new.id ? payload.new : c));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'phone_calls' }, (payload) => {
        setCalls((prev) => prev.filter(c => c.id !== payload.old.id));
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
            <button 
                onClick={() => setActiveTab('dialer')}
                className={cn(
                    "px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
                    activeTab === 'dialer' 
                        ? "bg-white dark:bg-gray-700 shadow-sm text-indigo-600 dark:text-indigo-400" 
                        : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                )}
            >
                <PhoneOutgoing className="w-4 h-4" />
                Power Dialer
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
                            <div key={call.id} className={cn(
                                "p-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4 group rounded-2xl border mb-3",
                                call.status === 'missed' && !isDone(call) 
                                    ? "bg-white dark:bg-gray-800 border-indigo-100 dark:border-indigo-900/30 shadow-sm" 
                                    : "bg-gray-50 dark:bg-gray-900/20 border-transparent opacity-75"
                            )}>
                                <div className="flex items-center gap-4">
                                    <div className={cn(
                                        "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-inner",
                                        call.status === 'missed' && !isDone(call)
                                            ? "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400" 
                                            : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                                    )}>
                                        <PhoneIncoming className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h3 className={cn(
                                            "font-bold text-lg",
                                            call.status === 'missed' && !isDone(call) ? "text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-400"
                                        )}>
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
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 self-end md:self-auto">
                                    {call.status === 'missed' && !isDone(call) ? (
                                        <>
                                            <button 
                                                onClick={() => handleCreateTaskFromCall(call)}
                                                className="px-4 py-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 rounded-xl text-sm font-bold transition-colors flex items-center gap-2"
                                                title="Rückruf-Aufgabe erstellen"
                                            >
                                                <ClipboardList className="w-4 h-4" />
                                                <span className="hidden md:inline">Aufgabe</span>
                                            </button>
                                            <button 
                                                onClick={() => handleMarkDone(call.id)}
                                                className="px-4 py-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 rounded-xl text-sm font-bold transition-colors flex items-center gap-2"
                                                title="Als erledigt markieren (keine Aktion nötig)"
                                            >
                                                <Check className="w-4 h-4" />
                                                <span className="hidden md:inline">Erledigt</span>
                                            </button>
                                            <button 
                                                onClick={() => handleDeleteCall(call.id)}
                                                className="px-4 py-2 bg-gray-50 dark:bg-gray-800 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl text-sm font-bold transition-colors flex items-center gap-2"
                                                title="Eintrag löschen"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </>
                                    ) : (
                                        <button 
                                            onClick={() => handleDeleteCall(call.id)}
                                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors opacity-50 hover:opacity-100"
                                            title="Löschen"
                                        >
                                            <XCircle className="w-5 h-5" />
                                        </button>
                                    )}
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

                                    <div className="bg-gray-50 dark:bg-gray-700/30 rounded-2xl p-4 mb-6 flex-grow border border-gray-100 dark:border-gray-600/30 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
                                         onClick={() => setScriptOpen(cb.id === scriptOpen ? null : cb.id)}
                                         title="Klicken für Gesprächsleitfaden">
                                        <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">
                                            {cb.topic || 'Keine Notiz hinterlassen.'}
                                        </p>
                                        
                                        {/* Script Overlay */}
                                        {scriptOpen === cb.id && (
                                            <motion.div 
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: 'auto' }}
                                                className="mt-4 pt-4 border-t border-indigo-100 dark:border-indigo-800/30"
                                                onClick={e => e.stopPropagation()}
                                            >
                                                <div className="flex items-center gap-2 mb-2 text-indigo-700 dark:text-indigo-300">
                                                    <MessageSquare className="w-3 h-3" />
                                                    <span className="text-xs font-bold uppercase tracking-wider">Gesprächsleitfaden</span>
                                                </div>
                                                <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-3 text-sm text-gray-700 dark:text-gray-300 space-y-2 border border-indigo-100 dark:border-indigo-800/50">
                                                    <p>👋 "Hallo Herr/Frau {cb.customer_name}, hier ist {profile?.full_name?.split(' ')[0]} von der Agentur..."</p>
                                                    <p>📞 "Sie hatten um einen Rückruf gebeten bezüglich <strong>{cb.topic || 'Ihrer Anfrage'}</strong>?"</p>
                                                    <div className="flex justify-end mt-2">
                                                        <button onClick={() => setScriptOpen(null)} className="text-xs text-indigo-600 dark:text-indigo-400 font-bold hover:underline">
                                                            Schließen
                                                        </button>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
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

      {/* CONTENT DIALER */}
      {activeTab === 'dialer' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              
              {/* Toolbar */}
              <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                      <div className="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-3 py-1 rounded-lg text-xs font-bold">
                          {leads.length} Leads in der Liste
                      </div>
                  </div>
                  <button 
                      onClick={() => setShowImporter(!showImporter)}
                      className="text-sm text-indigo-600 hover:text-indigo-700 font-bold flex items-center gap-1"
                  >
                      <UserPlus className="w-4 h-4" />
                      Leads importieren
                  </button>
              </div>

              {/* Importer */}
              <AnimatePresence>
                  {showImporter && (
                      <motion.div 
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                      >
                          <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-sm">
                              <h3 className="font-bold mb-2">CSV / Text Import</h3>
                              <p className="text-xs text-gray-500 mb-4">Format pro Zeile: <code>Name, Telefonnummer</code></p>
                              <textarea
                                  value={importText}
                                  onChange={e => setImportText(e.target.value)}
                                  placeholder={`Max Mustermann, 0171123456\nErika Musterfrau, 0172987654`}
                                  className="w-full h-32 rounded-xl border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-sm p-4 font-mono mb-4"
                              />
                              <button 
                                  onClick={handleImportLeads}
                                  className="bg-indigo-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-indigo-700 transition-colors w-full"
                              >
                                  Importieren
                              </button>
                          </div>
                      </motion.div>
                  )}
              </AnimatePresence>

              {/* DIALER INTERFACE */}
              {leads.length === 0 ? (
                  <div className="text-center py-20 bg-white dark:bg-gray-800 rounded-3xl border border-dashed border-gray-300 dark:border-gray-700">
                      <div className="w-16 h-16 bg-gray-50 dark:bg-gray-900 rounded-full flex items-center justify-center mx-auto mb-4">
                          <PhoneOutgoing className="w-8 h-8 text-gray-300" />
                      </div>
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white">Keine Leads vorhanden</h3>
                      <p className="text-gray-500 mb-4">Importiere Leads um zu starten.</p>
                      <button onClick={() => setShowImporter(true)} className="text-indigo-600 font-bold hover:underline">Jetzt importieren</button>
                  </div>
              ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      {/* ACTIVE CARD */}
                      <div className="bg-white dark:bg-gray-800 rounded-3xl p-8 shadow-xl border border-indigo-100 dark:border-indigo-900/50 relative overflow-hidden flex flex-col items-center text-center">
                          <div className="absolute top-0 left-0 w-full h-2 bg-gray-100">
                              <div 
                                  className="h-full bg-indigo-500 transition-all duration-500"
                                  style={{ width: `${((currentLeadIndex + 1) / leads.length) * 100}%` }}
                              />
                          </div>
                          
                          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-6 mt-2">
                              Lead {currentLeadIndex + 1} von {leads.length}
                          </span>

                          <div className="w-24 h-24 bg-indigo-50 dark:bg-indigo-900/20 rounded-full flex items-center justify-center mb-6 animate-pulse">
                              <PhoneOutgoing className="w-10 h-10 text-indigo-600" />
                          </div>

                          <h2 className="text-3xl font-black text-gray-900 dark:text-white mb-2">
                              {leads[currentLeadIndex].customer_name}
                          </h2>
                          
                          <a 
                              href={`tel:${leads[currentLeadIndex].phone}`}
                              onClick={(e) => {
                                  // Don't prevent default, we want the call to happen!
                                  setDialerMode('calling');
                              }}
                              className="text-4xl font-mono font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 my-8 block hover:scale-105 transition-transform cursor-pointer"
                          >
                              {leads[currentLeadIndex].phone}
                          </a>

                          {/* Always show buttons but maybe highlight them after clicking */}
                          <div className={cn(
                              "w-full space-y-3 transition-all duration-500",
                              dialerMode === 'idle' ? "opacity-50 grayscale blur-[1px] pointer-events-none" : "opacity-100 scale-100"
                          )}>
                                  <p className={cn(
                                      "text-xs font-bold uppercase mb-2 transition-colors",
                                      dialerMode === 'idle' ? "text-gray-300" : "text-indigo-500 animate-pulse"
                                  )}>
                                      {dialerMode === 'idle' ? "Erst wählen, dann Ergebnis eintragen..." : "Gespräch läuft... Ergebnis wählen:"}
                                  </p>
                                  
                                  <div className="grid grid-cols-2 gap-3">
                                      <button 
                                          onClick={() => handleLeadResult(leads[currentLeadIndex].id, 'appointment')}
                                          className="bg-emerald-500 hover:bg-emerald-600 text-white p-4 rounded-2xl font-bold flex flex-col items-center gap-1 transition-transform hover:scale-105 shadow-md"
                                      >
                                          <CheckCircle className="w-6 h-6" />
                                          Termin
                                      </button>
                                      
                                      <button 
                                          onClick={() => handleLeadResult(leads[currentLeadIndex].id, 'later')}
                                          className="bg-amber-500 hover:bg-amber-600 text-white p-4 rounded-2xl font-bold flex flex-col items-center gap-1 transition-transform hover:scale-105 shadow-md"
                                      >
                                          <Clock className="w-6 h-6" />
                                          Später (Erreicht)
                                      </button>

                                      <button 
                                          onClick={() => handleLeadResult(leads[currentLeadIndex].id, 'unreachable')}
                                          className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 p-4 rounded-2xl font-bold flex flex-col items-center gap-1 transition-transform hover:scale-105 shadow-sm"
                                      >
                                          <PhoneMissed className="w-6 h-6" />
                                          Nicht erreicht
                                      </button>

                                      <button 
                                          onClick={() => handleLeadResult(leads[currentLeadIndex].id, 'no_interest')}
                                          className="bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 p-4 rounded-2xl font-bold flex flex-col items-center gap-1 transition-transform hover:scale-105 shadow-sm"
                                      >
                                          <XCircle className="w-6 h-6" />
                                          Kein Interesse
                                      </button>
                                  </div>
                                  
                                  <button 
                                      onClick={() => handleLeadResult(leads[currentLeadIndex].id, 'bad_number')}
                                      className="text-xs text-gray-400 hover:text-red-500 mt-4 flex items-center justify-center gap-1 w-full py-2"
                                  >
                                      <AlertCircle className="w-3 h-3" /> Falsche Nummer / Ungültig
                                  </button>
                          </div>
                      </div>

                      {/* UPCOMING LIST */}
                      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-3xl p-6 border border-gray-100 dark:border-gray-700">
                          <h3 className="font-bold text-gray-500 uppercase text-xs tracking-wider mb-4">Nächste Anrufe</h3>
                          <div className="space-y-3 opacity-60 pointer-events-none">
                              {leads.slice(currentLeadIndex + 1, currentLeadIndex + 6).map((lead, idx) => (
                                  <div key={lead.id} className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm flex justify-between items-center">
                                      <div>
                                          <p className="font-bold text-gray-900 dark:text-white">{lead.customer_name}</p>
                                          <p className="text-xs text-gray-500">{lead.phone}</p>
                                      </div>
                                      <div className="w-8 h-8 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center text-gray-400 font-bold text-xs">
                                          {currentLeadIndex + idx + 2}
                                      </div>
                                  </div>
                              ))}
                              {leads.length > currentLeadIndex + 6 && (
                                  <p className="text-center text-xs text-gray-400 mt-4">...und {leads.length - (currentLeadIndex + 6)} weitere</p>
                              )}
                          </div>
                      </div>
                  </div>
              )}
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
