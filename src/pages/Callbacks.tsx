import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { Callback, Profile } from '@/types';
import { Phone, Plus, Check, User as UserIcon, AlertCircle, Search, ArrowRight, PenTool } from 'lucide-react';
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

  if (loading) return <div className="p-8 text-center">Laden...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Phone className="w-8 h-8 text-indigo-600" />
            Telefon-Notizen
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Wer hat angerufen? Wer soll zurückrufen?
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
              <span className="hidden sm:inline">Notiz erfassen</span>
              <span className="sm:hidden">Neu</span>
            </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredCallbacks.map((cb) => {
            const isHighPrio = cb.priority === 'high';
            const isDone = cb.status === 'done';
            const isForMe = cb.assigned_to === user?.id;

            return (
                <div 
                    key={cb.id} 
                    className={cn(
                        "bg-white dark:bg-gray-800 rounded-xl p-5 border shadow-sm transition-all relative overflow-hidden group",
                        isForMe && !isDone ? "ring-2 ring-indigo-500/20 border-indigo-200 dark:border-indigo-900" : "border-gray-100 dark:border-gray-700",
                        isHighPrio && !isDone ? "bg-red-50/30 dark:bg-red-900/10" : "",
                        isDone && "opacity-60 grayscale-[0.5]"
                    )}
                >
                    {isHighPrio && !isDone && (
                        <div className="absolute top-0 right-0 bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-300 text-[10px] font-bold px-2 py-1 rounded-bl-lg flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> WICHTIG
                        </div>
                    )}
                    
                    {isForMe && !isDone && (
                        <div className="absolute top-0 left-0 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold px-2 py-1 rounded-br-lg">
                            FÜR DICH
                        </div>
                    )}

                    <div className="mb-4 mt-2">
                        <div className="flex items-start gap-3">
                             <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                                <Phone className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                             </div>
                             <div>
                                <h3 className="font-bold text-gray-900 dark:text-white leading-tight">
                                    {cb.customer_name}
                                </h3>
                                <a href={`tel:${cb.phone}`} className="text-indigo-600 hover:underline text-sm font-medium block mt-0.5">
                                    {cb.phone || 'Keine Nummer'}
                                </a>
                             </div>
                        </div>
                    </div>

                    <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3 mb-4">
                        <p className="text-gray-700 dark:text-gray-300 text-sm">
                            {cb.topic || 'Keine Notiz hinterlassen.'}
                        </p>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
                        <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                                <PenTool className="w-3 h-3" />
                                <span>Notiert von {cb.creator?.full_name?.split(' ')[0]}</span>
                            </div>
                            <div className="text-[10px] text-gray-400">
                                {format(new Date(cb.created_at), 'dd.MM. HH:mm', { locale: de })} Uhr
                            </div>
                        </div>

                        {!isDone && (
                            <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                                    <ArrowRight className="w-3 h-3" />
                                    {cb.assignee?.full_name?.split(' ')[0] || 'Alle'}
                                </div>
                                
                                <button 
                                    onClick={() => handleComplete(cb.id)}
                                    className="p-2 bg-green-600 hover:bg-green-700 text-white rounded-full shadow-sm transition-colors"
                                    title="Erledigt"
                                >
                                    <Check className="w-4 h-4" />
                                </button>
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
                <p>Keine Notizen vorhanden.</p>
            </div>
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Rückruf notieren"
      >
        <form onSubmit={handleCreateCallback} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Wer hat angerufen? *
            </label>
            <input
              required
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Name / Firma"
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Rückruf-Nummer *
            </label>
            <input
              required
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0171..."
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Worum geht es? (Notiz)
            </label>
            <textarea
              rows={3}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Hat Fragen zu Vertrag XYZ..."
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Für wen? *
                </label>
                <select
                required
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                <option value="">-- Bitte wählen --</option>
                {profiles.map(p => (
                    <option key={p.id} value={p.id}>{p.full_name}</option>
                ))}
                </select>
            </div>
             <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Dringlichkeit
                </label>
                <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as 'normal' | 'high')}
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                <option value="normal">Normal</option>
                <option value="high">🔥 Wichtig</option>
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
