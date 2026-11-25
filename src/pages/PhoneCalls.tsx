import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Phone, PhoneMissed, PhoneIncoming, Clock, CheckCircle, XCircle, Search, ClipboardList, Plus, AlertCircle, Trash2, ArrowRight, PenTool, Check, MessageSquare, PhoneOutgoing, Calendar, UserPlus, BookOpen } from 'lucide-react';
import { format, isSameDay, subDays } from 'date-fns';
import { de } from 'date-fns/locale';
import { cn } from '@/utils/cn';
import toast from 'react-hot-toast';
import { useStore } from '@/store/useStore';
import { Modal } from '@/components/Modal';
import { ConfirmModal } from '@/components/ConfirmModal';
import { Callback, Profile } from '@/types';
import { useSearchParams } from 'react-router-dom';
import { Avatar, Button, EmptyState, PageHeader, Segmented } from '@/components/ui';
import { Dialer } from '@/components/calls/Dialer';
import { HeroBars, HeroDivider, HeroNumber, HeroPanel, HeroStat, StatusPill } from '@/components/ui/hero';

export const PhoneCalls = () => {
  const { user, profile } = useStore();
  const [searchParams, setSearchParams] = useSearchParams();
  type Tab = 'live' | 'tasks' | 'dialer' | 'history';
  const tabParam = searchParams.get('tab') as Tab | null;
  const activeTab: Tab = tabParam && ['live', 'tasks', 'dialer', 'history'].includes(tabParam) ? tabParam : 'live';
  const setActiveTab = (tab: Tab) => setSearchParams({ tab }, { replace: true });

  // --- CALL LOGS STATE ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [callLogs, setCallLogs] = useState<any[]>([]);
  const [loadingCallLogs, setLoadingCallLogs] = useState(true);
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [submittingLog, setSubmittingLog] = useState(false);
  const [logCustomerName, setLogCustomerName] = useState('');
  const [logPhone, setLogPhone] = useState('');
  const [logReachability, setLogReachability] = useState('erreicht');
  const [logStatus, setLogStatus] = useState('erledigt');
  const [logNotes, setLogNotes] = useState('');
  const [logFollowUpDate, setLogFollowUpDate] = useState('');
  
  const getCurrentTime = () => {
      const now = new Date();
      return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  };
  const [logReachTime, setLogReachTime] = useState(getCurrentTime());
  const [logFollowUpTime, setLogFollowUpTime] = useState('10:00');


  // "?new=1" öffnet direkt das Formular für einen neuen Rückruf (z. B. aus der Übersicht)
  useEffect(() => {
      if (searchParams.get('new') === '1') {
          setIsModalOpen(true);
          setSearchParams({ tab: 'tasks' }, { replace: true });
      }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  // --- STATE FOR LIVE CALLS ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      const call = calls.find(c => c.id === id);
      const notes = call?.notes ? `${call.notes} · erledigt` : 'erledigt';
      const { error } = await supabase
        .from('phone_calls')
        .update({ notes })
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleCreateTaskFromCall = (call: any) => {
      setCustomerName(call.notes?.replace('Anrufer: ', '') || 'Unbekannt');
      setPhone(call.caller_number || '');
      setTopic('Verpasster Anruf');
      setIsModalOpen(true);
      setActiveTab('tasks'); // Switch to tasks tab so user sees the modal in context
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
          creator:created_by(id, full_name, avatar_url),
          assignee:assigned_to(id, full_name, avatar_url),
          completer:completed_by(id, full_name)
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
    const { data } = await supabase.from('profiles').select('id, full_name, avatar_url, is_approved').order('full_name');
    setProfiles(((data || []) as Profile[]).filter(p => p.is_approved !== false));
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

      toast.success('Rückruf angelegt');
      fetchCallbacks();
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
        toast.success('Rückruf erledigt');
        fetchCallbacks();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
        toast.error('Fehler.');
    }
  };

  const handleDeleteTask = async () => {
    if (!deleteId) return;
    try {
        const { error } = await supabase.from('callbacks').delete().eq('id', deleteId);
        if (error) throw error;
        toast.success('Rückruf gelöscht');
        setDeleteId(null);
        fetchCallbacks();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

  // --- CALL LOGS LOGIC ---
  const fetchCallLogs = async () => {
      try {
          const { data, error } = await supabase
              .from('call_logs')
              .select(`*, user:user_id(full_name)`)
              .order('call_time', { ascending: false });
          if (error) throw error;
          setCallLogs(data || []);
      } catch (error) {
          console.error(error);
      } finally {
          setLoadingCallLogs(false);
      }
  };

  const handleCreateCallLog = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!user) return;
      setSubmittingLog(true);
      try {
          const { error } = await supabase.from('call_logs').insert({
              user_id: user.id,
              customer_name: logCustomerName,
              phone_number: logPhone,
              reachability: logReachability,
              status: logStatus,
              notes: logNotes,
              reach_time: logReachability === 'erreicht' ? (logReachTime || null) : null,
              follow_up_date: logStatus === 'wiedervorlage' ? logFollowUpDate : null,
              follow_up_time: logStatus === 'wiedervorlage' ? (logFollowUpTime || null) : null
          });
          if (error) throw error;
          toast.success('Anruf protokolliert!');
          setIsLogModalOpen(false);
          setLogCustomerName('');
          setLogPhone('');
          setLogReachability('erreicht');
          setLogStatus('erledigt');
          setLogNotes('');
          setLogFollowUpDate('');
          setLogReachTime(getCurrentTime());
          setLogFollowUpTime('10:00');
          fetchCallLogs();
      } catch (error) {
          console.error(error);
          toast.error('Fehler beim Speichern.');
      } finally {
          setSubmittingLog(false);
      }
  };

  const [deleteLogId, setDeleteLogId] = useState<string | null>(null);
  const handleDeleteCallLog = (id: string) => setDeleteLogId(id);
  const confirmDeleteCallLog = async () => {
      const id = deleteLogId;
      setDeleteLogId(null);
      if (!id) return;
      try {
          const { error } = await supabase.from('call_logs').delete().eq('id', id);
          if (error) throw error;
          toast.success('Gelöscht');
          setCallLogs(prev => prev.filter(l => l.id !== id));
      } catch (error) {
          console.error(error);
          toast.error('Fehler beim Löschen');
      }
  };

  const filteredCallLogs = callLogs.filter(log => {
      const q = logSearchQuery.toLowerCase();
      return (log.customer_name?.toLowerCase().includes(q) || log.phone_number?.includes(q) || log.notes?.toLowerCase().includes(q));
  });

  // --- EFFECTS ---
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    const debouncedFetchCallbacks = () => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            fetchCallbacks();
        }, 500);
    };

    fetchCalls();
    fetchCallbacks();
    fetchProfiles();
    fetchCallLogs();

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'callbacks' }, debouncedFetchCallbacks)
      .subscribe();

    return () => {
      clearTimeout(timeoutId);
      supabase.removeChannel(channel1);
      supabase.removeChannel(channel2);
    };
  }, []);

  const missedOpen = uniqueCalls.filter(c => c.status === 'missed' && !isDone(c)).length;
  const openTasks = callbacks.filter(c => c.status !== 'done').length;
  const myOpenTasks = callbacks.filter(c => c.status !== 'done' && c.assigned_to === user?.id).length;
  const urgentTasks = callbacks.filter(c => c.status !== 'done' && c.priority === 'high').length;
  const now = new Date();
  const callsToday = uniqueCalls.filter(c => isSameDay(new Date(c.created_at), now)).length;
  const logsToday = callLogs.filter(l => isSameDay(new Date(l.created_at), now)).length;
  const callBars = Array.from({ length: 14 }, (_, i) => {
      const day = subDays(now, 13 - i);
      const n = uniqueCalls.filter(c => isSameDay(new Date(c.created_at), day)).length;
      return { key: format(day, 'yyyy-MM-dd'), label: format(day, 'EEEEEE', { locale: de }), value: n, display: `${n} ${n === 1 ? 'Anruf' : 'Anrufe'}`, current: i === 13 };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Anrufe"
        description="Verpasste Anrufe, Rückrufe, Power Dialer und Gesprächsprotokoll."
        actions={
          <>
            <Button variant="secondary" icon={BookOpen} onClick={() => setIsLogModalOpen(true)}>Gespräch protokollieren</Button>
            <Button icon={Plus} onClick={() => setIsModalOpen(true)}>Rückruf notieren</Button>
          </>
        }
      >
        <Segmented
          value={activeTab}
          onChange={(v) => setActiveTab(v as Tab)}
          options={[
            { value: 'live', label: 'Eingang', icon: PhoneIncoming, count: missedOpen },
            { value: 'tasks', label: 'Rückrufe', icon: ClipboardList, count: openTasks },
            { value: 'dialer', label: 'Power Dialer', icon: PhoneOutgoing },
            { value: 'history', label: 'Protokoll', icon: BookOpen },
          ]}
        />
      </PageHeader>

      <HeroPanel aria-label="Anrufe im Überblick">
        <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[auto_1fr] lg:items-end">
          <div>
            <HeroNumber value={missedOpen + openTasks} label="Wartet auf dich und das Team" unit={missedOpen + openTasks === 1 ? 'Anruf' : 'Anrufe'} />
            <p className="mt-4 flex flex-wrap gap-2 text-sm">
              {missedOpen > 0 && <button type="button" onClick={() => setActiveTab('live')} className="rounded-full bg-red-500/20 px-3 py-1 font-medium text-red-100 ring-1 ring-red-400/40 hover:bg-red-500/30">{missedOpen} verpasst</button>}
              {urgentTasks > 0 && <button type="button" onClick={() => setActiveTab('tasks')} className="rounded-full bg-amber-300 px-3 py-1 font-semibold text-brand-950 hover:bg-amber-200">{urgentTasks} dringend</button>}
              {missedOpen + openTasks === 0 && <span className="text-brand-100">Alles abgearbeitet. Stark.</span>}
            </p>
          </div>
          <div>
            <p className="mb-1 text-xs text-brand-200">Eingang der letzten 14 Tage</p>
            <HeroBars bars={callBars} height="h-28" />
          </div>
        </div>
        <HeroDivider />
        <dl className="grid grid-cols-2 gap-x-6 gap-y-5 px-6 py-5 sm:grid-cols-4 sm:px-8">
          <HeroStat label="Offene Rückrufe" value={openTasks} />
          <HeroStat label="Davon für dich" value={myOpenTasks} accent={myOpenTasks > 0} />
          <HeroStat label="Anrufe heute" value={callsToday} />
          <HeroStat label="Gespräche protokolliert heute" value={logsToday} />
        </dl>
      </HeroPanel>

      {/* EINGANG */}
      {activeTab === 'live' && (
        <div className="card animate-fade-in overflow-hidden">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3 dark:border-gray-700 sm:px-6">
            <p className="text-sm text-gray-500">Die letzten 50 Anrufe</p>
            <Segmented size="sm" value={filterCalls} onChange={(v) => setFilterCalls(v as 'all' | 'missed')} options={[{ value: 'all', label: 'Alle' }, { value: 'missed', label: 'Offen verpasst', count: missedOpen }]} />
          </div>
          {loadingCalls ? (
            <p className="p-12 text-center text-sm text-gray-500">Anrufe werden geladen</p>
          ) : filteredCalls.length === 0 ? (
            <EmptyState icon={PhoneIncoming} title={filterCalls === 'missed' ? 'Keine offenen verpassten Anrufe' : 'Noch keine Anrufe'} description="Eingehende Anrufe der Telefonanlage erscheinen hier automatisch." />
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700/70">
              {filteredCalls.map((call) => {
                const open = call.status === 'missed' && !isDone(call);
                const caller = call.notes?.replace('Anrufer: ', '').replace(/ · erledigt$|^erledigt$|Rückruf erledigt/, '').trim();
                return (
                  <li key={call.id} className="group flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:px-6">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', open ? 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300' : 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-400')}>
                        {call.status === 'missed' ? <PhoneMissed className="h-4 w-4" /> : <PhoneIncoming className="h-4 w-4" />}
                      </span>
                      <div className="min-w-0">
                        <p className="flex items-center gap-2">
                          <a href={`tel:${(call.caller_number || '').replace(/\s/g, '')}`} className={cn('tabular text-[15px] font-semibold hover:underline', open ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400')}>{call.caller_number || 'Unbekannt'}</a>
                          {open && <StatusPill tone="red" pulse>Verpasst</StatusPill>}
                          {isDone(call) && <StatusPill tone="emerald">Erledigt</StatusPill>}
                        </p>
                        <p className="truncate text-xs text-gray-500">
                          {format(new Date(call.created_at), "EEE, dd.MM. 'um' HH:mm", { locale: de })}
                          {call.duration > 0 && ` · ${Math.floor(call.duration / 60)}:${String(call.duration % 60).padStart(2, '0')} Min.`}
                          {caller && ` · ${caller}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 self-end sm:self-auto">
                      {open && (
                        <>
                          <button type="button" onClick={() => handleCreateTaskFromCall(call)} className="btn-secondary btn-sm"><ClipboardList className="h-3.5 w-3.5" /> Rückruf anlegen</button>
                          <button type="button" onClick={() => handleMarkDone(call.id)} className="btn-secondary btn-sm"><Check className="h-3.5 w-3.5" /> Erledigt</button>
                        </>
                      )}
                      <button type="button" onClick={() => handleDeleteCall(call.id)} className="btn-icon p-1.5 opacity-60 hover:!text-red-600 group-hover:opacity-100" title="Eintrag löschen" aria-label="Eintrag löschen"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* RÜCKRUFE */}
      {activeTab === 'tasks' && (
        <div className="animate-fade-in space-y-4">
          <Segmented size="sm" value={filterCallbacks} onChange={(v) => setFilterCallbacks(v as 'open' | 'done')} options={[{ value: 'open', label: 'Offen', count: openTasks }, { value: 'done', label: 'Erledigt' }]} />

          {loadingCallbacks ? (
            <p className="py-16 text-center text-sm text-gray-500">Rückrufe werden geladen</p>
          ) : filteredCallbacks.length === 0 ? (
            <div className="card">
              <EmptyState
                icon={ClipboardList}
                title={filterCallbacks === 'open' ? 'Keine offenen Rückrufe' : 'Noch nichts erledigt'}
                description={filterCallbacks === 'open' ? 'Wenn jemand um Rückruf bittet, notiere es hier und weise es einer Person zu.' : undefined}
                action={filterCallbacks === 'open' ? <Button icon={Plus} onClick={() => setIsModalOpen(true)}>Rückruf notieren</Button> : undefined}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {[...filteredCallbacks]
                .sort((a, b) => Number(b.assigned_to === user?.id) - Number(a.assigned_to === user?.id) || Number(b.priority === 'high') - Number(a.priority === 'high'))
                .map((cb) => {
                const isHighPrio = cb.priority === 'high';
                const done = cb.status === 'done';
                const isForMe = cb.assigned_to === user?.id;
                const isCreator = cb.created_by === user?.id;
                return (
                  <article
                    key={cb.id}
                    className={cn(
                      'card group flex flex-col p-5',
                      isHighPrio && !done && 'border-l-4 border-l-red-500',
                      isForMe && !done && !isHighPrio && 'border-l-4 border-l-brand-500',
                      done && 'opacity-70'
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {isHighPrio && !done && <StatusPill tone="red" pulse>Dringend</StatusPill>}
                          {isForMe && !done && <StatusPill tone="brand">Für dich</StatusPill>}
                          {done && <StatusPill tone="emerald">Erledigt</StatusPill>}
                        </div>
                        <h3 className="mt-2 truncate font-display text-lg font-semibold text-gray-900 dark:text-white">{cb.customer_name}</h3>
                        {cb.phone ? (
                          <a href={`tel:${cb.phone.replace(/\s/g, '')}`} className="tabular text-sm font-medium text-brand-700 hover:underline dark:text-brand-300">{cb.phone}</a>
                        ) : (
                          <span className="text-sm text-gray-400">Keine Nummer</span>
                        )}
                      </div>
                      {(isCreator || isAdmin || done) && (
                        <button type="button" onClick={() => setDeleteId(cb.id)} className="btn-icon p-1.5 opacity-0 hover:!text-red-600 focus:opacity-100 group-hover:opacity-100" title="Löschen" aria-label="Rückruf löschen">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    <button type="button" onClick={() => setScriptOpen(cb.id === scriptOpen ? null : cb.id)} className="mt-3 flex-1 rounded-lg bg-gray-50 p-3 text-left text-sm leading-relaxed text-gray-700 transition-colors hover:bg-gray-100 dark:bg-gray-900/40 dark:text-gray-300 dark:hover:bg-gray-900/60">
                      <span className="whitespace-pre-wrap">{cb.topic || 'Ohne Notiz'}</span>
                      {scriptOpen === cb.id && (
                        <span className="mt-3 block border-t border-gray-200 pt-3 text-gray-600 dark:border-gray-700 dark:text-gray-300">
                          <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-brand-700 dark:text-brand-300"><MessageSquare className="h-3.5 w-3.5" /> Gesprächseinstieg</span>
                          „Guten Tag, hier ist {profile?.full_name?.split(' ')[0]} vom Agenturverbund. Sie hatten um Rückruf gebeten{cb.topic ? <> wegen <strong>{cb.topic}</strong></> : ''}.“
                        </span>
                      )}
                    </button>

                    <div className="mt-4 flex items-center justify-between gap-3 border-t border-gray-100 pt-3 dark:border-gray-700">
                      <div className="min-w-0 text-xs text-gray-500">
                        <p className="flex items-center gap-1.5 truncate"><PenTool className="h-3 w-3" /> {cb.creator?.full_name?.split(' ')[0] || 'Unbekannt'} · {format(new Date(cb.created_at), 'dd.MM. HH:mm', { locale: de })}</p>
                        {done && cb.completer && <p className="mt-0.5 truncate text-emerald-700 dark:text-emerald-400">Erledigt von {cb.completer.full_name?.split(' ')[0]}</p>}
                      </div>
                      {!done && (
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="flex items-center gap-1.5 text-xs text-gray-500" title="Zuständig">
                            {cb.assignee ? <Avatar name={cb.assignee.full_name} src={cb.assignee.avatar_url} size="xs" /> : <ArrowRight className="h-3 w-3" />}
                            {cb.assignee?.full_name?.split(' ')[0] || 'Alle'}
                          </span>
                          <button type="button" onClick={() => handleCompleteTask(cb.id)} className="btn-primary btn-sm"><Check className="h-3.5 w-3.5" /> Erledigt</button>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* CONTENT DIALER */}
      {activeTab === 'dialer' && <Dialer />}

      {/* CONTENT HISTORY */}
      {activeTab === 'history' && (
          <div className="space-y-6 animate-fade-in">
              <div className="flex flex-col sm:flex-row justify-between gap-4">
                  <div className="relative flex-1 max-w-md">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input 
                          type="search" 
                          placeholder="Name, Nummer oder Notiz" 
                          className="input pl-10"
                          value={logSearchQuery}
                          onChange={(e) => setLogSearchQuery(e.target.value)}
                      />
                  </div>
              </div>

              <div className="card overflow-hidden">
                  {loadingCallLogs ? (
                      <div className="p-12 text-center text-gray-500">Lade Historie...</div>
                  ) : filteredCallLogs.length === 0 ? (
                      <div className="p-20 text-center">
                          <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Keine Einträge</h3>
                          <p className="text-gray-500 text-sm mt-1">Es wurden noch keine Anrufe protokolliert.</p>
                      </div>
                  ) : (
                      <div className="overflow-x-auto">
                          <table className="table-base">
                              <thead>
                                  <tr>
                                      <th >Datum / Zeit</th>
                                      <th >Kunde</th>
                                      <th >Erreichbarkeit</th>
                                      <th >Status</th>
                                      <th >Notiz</th>
                                      <th >Benutzer</th>
                                      <th ></th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                  {filteredCallLogs.map((log) => (
                                      <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                                          <td className="whitespace-nowrap text-gray-500">
                                              {format(new Date(log.call_time), 'dd.MM.yyyy HH:mm')}
                                          </td>
                                          <td className="font-bold text-gray-900 dark:text-white">
                                              {log.customer_name}
                                              <div className="text-xs text-gray-500 font-normal">{log.phone_number}</div>
                                          </td>
                                          <td>
                                              <span className={cn(
                                                  "chip",
                                                  log.reachability === 'erreicht' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' :
                                                  log.reachability === 'nicht_erreicht' ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' :
                                                  log.reachability === 'mailbox' ? 'bg-sky-50 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300' :
                                                  'bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                                              )}>
                                                  {({ erreicht: 'Erreicht', nicht_erreicht: 'Nicht erreicht', mailbox: 'Mailbox', falsche_nummer: 'Falsche Nummer' } as Record<string, string>)[log.reachability] || log.reachability}
                                              </span>
                                              {log.reachability === 'erreicht' && log.reach_time && (
                                                  <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                                                      <Clock className="w-3 h-3" />
                                                      {log.reach_time.substring(0, 5)} Uhr
                                                  </div>
                                              )}
                                          </td>
                                          <td>
                                              <span className={cn(
                                                  "chip",
                                                  log.status === 'erledigt' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' :
                                                  log.status === 'wiedervorlage' ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' :
                                                  'bg-brand-50 text-brand-700 dark:bg-brand-900/50 dark:text-brand-200'
                                              )}>
                                                  {({ erledigt: 'Erledigt', wiedervorlage: 'Wiedervorlage', termin_vereinbart: 'Termin vereinbart' } as Record<string, string>)[log.status] || log.status}
                                              </span>
                                              {log.status === 'wiedervorlage' && log.follow_up_date && (
                                                  <div className="text-xs text-amber-700 dark:text-amber-300 mt-1 flex items-center gap-1">
                                                      <Clock className="w-3 h-3" />
                                                      {format(new Date(log.follow_up_date), 'dd.MM.yyyy')}
                                                      {log.follow_up_time ? ` ${log.follow_up_time.substring(0, 5)} Uhr` : ''}
                                                  </div>
                                              )}
                                          </td>
                                          <td className="max-w-xs truncate text-gray-500" title={log.notes}>
                                              {log.notes || '-'}
                                          </td>
                                          <td className="text-gray-500">
                                              {log.user?.full_name?.split(' ')[0] || 'Unbekannt'}
                                          </td>
                                          <td className="text-right">
                                              {(isAdmin || user?.id === log.user_id) && (
                                                  <button type="button" onClick={() => handleDeleteCallLog(log.id)} className="btn-icon p-1.5 hover:!text-red-600" aria-label="Eintrag löschen">
                                                      <Trash2 className="w-4 h-4" />
                                                  </button>
                                              )}
                                          </td>
                                      </tr>
                                  ))}
                              </tbody>
                          </table>
                      </div>
                  )}
              </div>
          </div>
      )}

      {/* MODAL FOR LOGGING A CALL */}
      <Modal isOpen={isLogModalOpen} onClose={() => setIsLogModalOpen(false)} title="Gespräch protokollieren">
          <form onSubmit={handleCreateCallLog} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                  <div>
                      <label className="field-label">Name</label>
                      <input required type="text" value={logCustomerName} onChange={e => setLogCustomerName(e.target.value)} className="input" />
                  </div>
                  <div>
                      <label className="field-label">Nummer</label>
                      <input type="text" value={logPhone} onChange={e => setLogPhone(e.target.value)} className="input" />
                  </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                  <div>
                      <label className="field-label">Erreichbarkeit</label>
                      <select required value={logReachability} onChange={e => setLogReachability(e.target.value)} className="input">
                          <option value="erreicht">Erreicht</option>
                          <option value="nicht_erreicht">Nicht erreicht</option>
                          <option value="mailbox">Mailbox / AB</option>
                          <option value="falsche_nummer">Falsche Nummer</option>
                      </select>
                  </div>
                  <div>
                      <label className="field-label">Ergebnis</label>
                      <select required value={logStatus} onChange={e => setLogStatus(e.target.value)} className="input">
                          <option value="erledigt">Erledigt</option>
                          <option value="wiedervorlage">Wiedervorlage</option>
                          <option value="termin_vereinbart">Termin vereinbart</option>
                      </select>
                  </div>
              </div>

              {logReachability === 'erreicht' && (
                  <div className="overflow-hidden mt-2">
                      <label className="field-label">Erreicht um (Uhrzeit)</label>
                      <input type="time" value={logReachTime} onChange={e => setLogReachTime(e.target.value)} className="input" />
                  </div>
              )}
              
              {logStatus === 'wiedervorlage' && (
                  <div className="overflow-hidden mt-2">
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="field-label">Wiedervorlage am</label>
                              <input required type="date" value={logFollowUpDate} onChange={e => setLogFollowUpDate(e.target.value)} className="input" />
                          </div>
                          <div>
                              <label className="field-label">Uhrzeit</label>
                              <input type="time" value={logFollowUpTime} onChange={e => setLogFollowUpTime(e.target.value)} className="input" />
                          </div>
                      </div>
                  </div>
              )}

              <div>
                  <label className="field-label">Notizen</label>
                  <textarea rows={3} value={logNotes} onChange={e => setLogNotes(e.target.value)} className="input resize-none" placeholder="Was wurde besprochen?" />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                  <button type="button" onClick={() => setIsLogModalOpen(false)} className="btn-secondary">Abbrechen</button>
                  <button type="submit" disabled={submittingLog} className="btn-primary">Speichern</button>
              </div>
          </form>
      </Modal>

      {/* MODALS FOR TASKS */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Rückruf notieren"
        description="Erscheint bei der zuständigen Person in der Übersicht und als Benachrichtigung."
      >
        <form onSubmit={handleCreateCallback} className="space-y-6">
          {/* ... existing task form ... */}
          <div>
            <label className="field-label">
              Wer hat angerufen?
            </label>
            <input
              required
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Name / Firma"
              className="input"
            />
          </div>

          <div>
            <label className="field-label">
              Rückrufnummer
            </label>
            <input
              required
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0171..."
              className="input"
            />
          </div>

          <div>
            <label className="field-label">
              Worum geht es?
            </label>
            <textarea
              rows={4}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Hat Fragen zu Vertrag XYZ..."
              className="input resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
                <label className="field-label">
                Wer ruft zurück?
                </label>
                <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="input"
                >
                <option value="">Wer zuerst Zeit hat</option>
                {profiles.map(p => (
                    <option key={p.id} value={p.id}>{p.full_name}</option>
                ))}
                </select>
            </div>
             <div>
                <label className="field-label">
                Dringlichkeit
                </label>
                <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as 'normal' | 'high')}
                className="input"
                >
                <option value="normal">Normal</option>
                <option value="high">Dringend</option>
                </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="btn-secondary"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary"
            >
              {submitting ? 'Wird gespeichert' : 'Rückruf speichern'}
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
      <ConfirmModal
        isOpen={!!deleteLogId}
        onClose={() => setDeleteLogId(null)}
        onConfirm={confirmDeleteCallLog}
        title="Protokolleintrag löschen?"
        message="Der Eintrag wird endgültig entfernt."
        confirmText="Löschen"
        isDestructive
      />
    </div>
  );
};
