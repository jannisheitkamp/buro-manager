import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { Callback, Profile } from '@/types';
import { Phone, Plus, Check, User as UserIcon, AlertCircle, Search, ArrowRight, PenTool, Trash2, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Modal } from '@/components/Modal';
import { ConfirmModal } from '@/components/ConfirmModal';
import { toast } from 'react-hot-toast';
import { cn } from '@/utils/cn';
import { motion, AnimatePresence } from 'framer-motion';

export const Callbacks = () => {
  const { user, profile } = useStore();
  const [callbacks, setCallbacks] = useState<Callback[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'open' | 'done'>('open');

  // Form State
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [topic, setTopic] = useState('');
  const [priority, setPriority] = useState<'normal' | 'high'>('normal');
  const [assignedTo, setAssignedTo] = useState<string>('');

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
      setLoading(false);
    }
  };

  const fetchProfiles = async () => {
    const { data } = await supabase.from('profiles').select('*').order('full_name');
    setProfiles(data || []);
  };

  useEffect(() => {
    fetchCallbacks();
    fetchProfiles();

    const channel = supabase
      .channel('callbacks_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'callbacks' }, fetchCallbacks)
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, []);

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
      // Reset form
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

  const handleComplete = async (id: string) => {
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

  const handleDelete = async () => {
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
    if (filter === 'open') return c.status !== 'done';
    if (filter === 'done') return c.status === 'done';
    return true;
  });

  const isAdmin = profile?.roles?.includes('admin');

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <motion.h1 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 flex items-center gap-3"
          >
            <Phone className="w-8 h-8 text-indigo-600" />
            Telefon-Notizen
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="text-lg text-gray-500 dark:text-gray-400 mt-2 font-medium"
          >
            Wer hat angerufen? Wer soll zurückrufen?
          </motion.p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
             <motion.div 
               initial={{ opacity: 0, scale: 0.9 }}
               animate={{ opacity: 1, scale: 1 }}
               transition={{ delay: 0.2 }}
               className="flex bg-white/50 dark:bg-gray-800/50 backdrop-blur-md p-1.5 rounded-2xl border border-gray-100 dark:border-gray-700"
             >
                <button
                    onClick={() => setFilter('open')}
                    className={cn(
                        "px-4 py-2 text-sm font-bold rounded-xl transition-all",
                        filter === 'open' 
                            ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-lg shadow-gray-200/50 dark:shadow-none" 
                            : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    )}
                >
                    Offen
                </button>
                <button
                    onClick={() => setFilter('done')}
                    className={cn(
                        "px-4 py-2 text-sm font-bold rounded-xl transition-all",
                        filter === 'done' 
                            ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-lg shadow-gray-200/50 dark:shadow-none" 
                            : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    )}
                >
                    Erledigt
                </button>
             </motion.div>

            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 }}
              onClick={() => setIsModalOpen(true)}
              className="flex-1 sm:flex-none group relative px-6 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-semibold rounded-2xl shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:scale-[1.02] transition-all flex items-center justify-center gap-2 overflow-hidden"
            >
              <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
              <Plus className="w-5 h-5 relative z-10" />
              <span className="relative z-10">Notiz erfassen</span>
            </motion.button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        <AnimatePresence>
            {loading ? (
                <div className="col-span-full py-20 text-center text-gray-400">Lade Notizen...</div>
            ) : filteredCallbacks.length === 0 ? (
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="col-span-full text-center py-20"
                >
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-800 mb-4">
                        <Phone className="w-10 h-10 text-gray-400" />
                    </div>
                    <p className="text-xl text-gray-500 font-medium">Keine Notizen vorhanden.</p>
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
                                "bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl p-6 border shadow-xl flex flex-col relative overflow-hidden group hover:-translate-y-1 transition-all duration-300",
                                isForMe && !isDone ? "ring-2 ring-indigo-500/50 border-indigo-200 dark:border-indigo-900 shadow-indigo-500/10" : "border-white/20 dark:border-gray-700",
                                isHighPrio && !isDone ? "bg-red-50/80 dark:bg-red-900/10 border-red-200 dark:border-red-900/30" : "",
                                isDone && "opacity-60 grayscale-[0.5] hover:opacity-80 hover:grayscale-0"
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

                            <div className="bg-gray-50/80 dark:bg-gray-700/30 rounded-2xl p-4 mb-6 flex-grow border border-gray-100 dark:border-gray-600/30">
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
                                            onClick={() => handleComplete(cb.id)}
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

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Rückruf notieren"
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
        onConfirm={handleDelete}
        title="Löschen"
        message="Wirklich löschen?"
        confirmText="Weg damit"
        isDestructive
      />
    </div>
  );
};
