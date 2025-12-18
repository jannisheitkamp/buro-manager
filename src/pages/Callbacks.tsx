import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { Callback, Profile } from '@/types';
import { Phone, Plus, Check, UserPlus, Flame, Search, CheckCircle2, User } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Modal } from '@/components/Modal';
import { ConfirmModal } from '@/components/ConfirmModal';
import { toast } from 'react-hot-toast';
import { cn } from '@/utils/cn';

export const Callbacks = () => {
  const { user } = useStore();
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
        .order('priority', { ascending: false }) // High priority first
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

      toast.success('Rückruf angelegt!');
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

  const handleTakeOver = async (id: string) => {
    if (!user) return;
    try {
        const { error } = await supabase
            .from('callbacks')
            .update({ assigned_to: user.id, status: 'in_progress' })
            .eq('id', id);
        
        if (error) throw error;
        toast.success('Übernommen!');
    } catch (error) {
        toast.error('Fehler.');
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

  if (loading) return <div className="p-8 text-center">Laden...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Phone className="w-8 h-8 text-indigo-600" />
            Rückruf-Zentrale
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Verpasse keinen Lead. Schnelle Reaktion gewinnt!
          </p>
        </div>
        
        <div className="flex gap-2 w-full sm:w-auto">
             <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
                <button
                    onClick={() => setFilter('open')}
                    className={cn(
                        "px-3 py-1.5 text-sm font-medium rounded-md transition-all",
                        filter === 'open' 
                            ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm" 
                            : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    )}
                >
                    Offen
                </button>
                <button
                    onClick={() => setFilter('done')}
                    className={cn(
                        "px-3 py-1.5 text-sm font-medium rounded-md transition-all",
                        filter === 'done' 
                            ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm" 
                            : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    )}
                >
                    Erledigt
                </button>
             </div>

            <button
              onClick={() => setIsModalOpen(true)}
              className="flex-1 sm:flex-none bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Rückruf anlegen</span>
              <span className="sm:hidden">Neu</span>
            </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredCallbacks.map((cb) => {
            const isHighPrio = cb.priority === 'high';
            const isDone = cb.status === 'done';
            const assignedToMe = cb.assigned_to === user?.id;

            return (
                <div 
                    key={cb.id} 
                    className={cn(
                        "bg-white dark:bg-gray-800 rounded-xl p-5 border shadow-sm transition-all relative overflow-hidden group",
                        isHighPrio && !isDone ? "border-red-200 dark:border-red-900/50 bg-red-50/30 dark:bg-red-900/10" : "border-gray-100 dark:border-gray-700",
                        isDone && "opacity-60 grayscale-[0.5]"
                    )}
                >
                    {isHighPrio && !isDone && (
                        <div className="absolute top-0 right-0 bg-red-500 text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg flex items-center gap-1">
                            <Flame className="w-3 h-3" /> DRINGEND
                        </div>
                    )}

                    <div className="flex justify-between items-start mb-3">
                        <div>
                            <h3 className="font-bold text-lg text-gray-900 dark:text-white">
                                {cb.customer_name}
                            </h3>
                            {cb.topic && (
                                <p className="text-gray-600 dark:text-gray-300 text-sm mt-0.5">
                                    {cb.topic}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-4">
                        <Phone className="w-4 h-4" />
                        <a href={`tel:${cb.phone}`} className="hover:text-indigo-600 hover:underline">
                            {cb.phone || 'Keine Nummer'}
                        </a>
                    </div>

                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                            <span>{format(new Date(cb.created_at), 'HH:mm')} Uhr</span>
                            <span>•</span>
                            <span>von {cb.creator?.full_name?.split(' ')[0] || '?'}</span>
                        </div>

                        {!isDone && (
                            <div className="flex gap-2">
                                {!cb.assigned_to ? (
                                    <button 
                                        onClick={() => handleTakeOver(cb.id)}
                                        className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-md text-sm font-medium transition-colors flex items-center gap-1"
                                    >
                                        <UserPlus className="w-3.5 h-3.5" /> Ich
                                    </button>
                                ) : (
                                    <div className="flex items-center gap-1 text-xs bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 px-2 py-1 rounded-md">
                                        <User className="w-3 h-3" />
                                        {cb.assignee?.full_name?.split(' ')[0]}
                                    </div>
                                )}
                                
                                <button 
                                    onClick={() => handleComplete(cb.id)}
                                    className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm font-medium transition-colors flex items-center gap-1"
                                >
                                    <Check className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        )}
                        
                        {isDone && (
                             <div className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1 font-medium">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Erledigt ({cb.completer?.full_name?.split(' ')[0]})
                             </div>
                        )}
                    </div>
                </div>
            );
        })}

        {filteredCallbacks.length === 0 && (
            <div className="col-span-full py-12 text-center text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
                <div className="bg-gray-50 dark:bg-gray-700/50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Phone className="w-8 h-8 opacity-50" />
                </div>
                <p>Keine Rückrufe in dieser Liste.</p>
            </div>
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Rückruf anlegen"
      >
        <form onSubmit={handleCreateCallback} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Kunde / Name *
            </label>
            <input
              required
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="z.B. Herr Müller (Firma XYZ)"
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Telefonnummer *
            </label>
            <input
              required
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0171 12345678"
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Thema / Stichwort
            </label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="z.B. KFZ Schaden, Angebot Hausrat"
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
             <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Priorität
                </label>
                <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as 'normal' | 'high')}
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                <option value="normal">Normal</option>
                <option value="high">🔥 Dringend</option>
                </select>
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Zuweisen an (Optional)
                </label>
                <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                <option value="">-- Niemand (Pool) --</option>
                {profiles.map(p => (
                    <option key={p.id} value={p.id}>{p.full_name}</option>
                ))}
                </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition-colors disabled:opacity-50"
            >
              {submitting ? 'Speichere...' : 'Anlegen'}
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
