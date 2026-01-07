import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { Parcel, Profile } from '@/types';
import { Package, Plus, Check, Search, Box, Truck, Trash2, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Modal } from '@/components/Modal';
import { ConfirmModal } from '@/components/ConfirmModal';
import { toast } from 'react-hot-toast';
import { cn } from '@/utils/cn';
import { motion, AnimatePresence } from 'framer-motion';

export const Parcels = () => {
  const { user, profile } = useStore();
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'mine'>('all');

  // Form State
  const [recipientId, setRecipientId] = useState('');
  const [carrier, setCarrier] = useState('');
  const [location, setLocation] = useState('Empfang');
  const [status, setStatus] = useState<'pending' | 'expected'>('pending');

  const fetchParcels = async () => {
    try {
      const { data, error } = await supabase
        .from('parcels')
        .select(`
          *,
          profiles:recipient_id(*)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setParcels(data || []);
    } catch (error) {
      console.error('Error fetching parcels:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchProfiles = async () => {
    const { data } = await supabase.from('profiles').select('*').order('full_name');
    setProfiles(data || []);
  };

  useEffect(() => {
    fetchParcels();
    fetchProfiles();

    const channel = supabase
      .channel('parcels_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parcels' }, fetchParcels)
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, []);

  const handleCreateParcel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSubmitting(true);
    try {
      const { error } = await supabase.from('parcels').insert({
        recipient_id: recipientId,
        created_by: user.id,
        carrier: carrier || 'Unbekannt',
        location: status === 'expected' ? 'Unterwegs' : location,
        status: status // 'pending' or 'expected'
      });

      if (error) throw error;

      toast.success(status === 'expected' ? 'Paket angekündigt!' : 'Paket erfasst!');
      setIsModalOpen(false);
      setRecipientId('');
      setCarrier('');
      setLocation('Empfang');
      setStatus('pending');
    } catch (error) {
      console.error('Error creating parcel:', error);
      toast.error('Fehler beim Erfassen.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCollect = async (parcelId: string) => {
    try {
      const { error } = await supabase
        .from('parcels')
        .update({ 
            status: 'collected',
            collected_at: new Date().toISOString()
        })
        .eq('id', parcelId);

      if (error) throw error;
      toast.success('Paket abgeholt markiert.');
    } catch (error) {
      console.error('Error updating parcel:', error);
      toast.error('Fehler beim Aktualisieren.');
    }
  };
  
  const handleArrived = async (parcelId: string) => {
    try {
      const { error } = await supabase
        .from('parcels')
        .update({ 
            status: 'pending',
            location: 'Empfang', // Default to reception when arrived
            created_at: new Date().toISOString() // Update timestamp to now
        })
        .eq('id', parcelId);

      if (error) throw error;
      toast.success('Paket ist jetzt da!');
    } catch (error) {
      console.error('Error updating parcel:', error);
      toast.error('Fehler beim Aktualisieren.');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
        const { error } = await supabase.from('parcels').delete().eq('id', deleteId);
        if (error) throw error;
        toast.success('Eintrag gelöscht.');
        setDeleteId(null);
    } catch (error) {
        console.error('Error deleting parcel:', error);
        toast.error('Fehler beim Löschen.');
    }
  };

  const filteredParcels = parcels.filter(p => {
    if (filter === 'mine') return p.recipient_id === user?.id;
    return true;
  });

  const pendingCount = parcels.filter(p => p.status === 'pending').length;
  const expectedCount = parcels.filter(p => p.status === 'expected').length;

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
            <Package className="w-8 h-8 text-indigo-600" />
            Paketstation
          </motion.h1>
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="flex items-center gap-4 mt-2"
          >
            <div className="flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-400">
                <span className="flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 px-2 py-1 rounded-lg">
                    <Box className="w-3.5 h-3.5" /> {pendingCount} am Empfang
                </span>
                {expectedCount > 0 && (
                    <span className="flex items-center gap-1.5 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400 px-2 py-1 rounded-lg">
                        <Truck className="w-3.5 h-3.5" /> {expectedCount} erwartet
                    </span>
                )}
            </div>
          </motion.div>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
             <motion.div 
               initial={{ opacity: 0, scale: 0.9 }}
               animate={{ opacity: 1, scale: 1 }}
               transition={{ delay: 0.2 }}
               className="flex bg-white/50 dark:bg-gray-800/50 backdrop-blur-md p-1.5 rounded-2xl border border-gray-100 dark:border-gray-700"
             >
                <button
                    onClick={() => setFilter('all')}
                    className={cn(
                        "px-4 py-2 text-sm font-bold rounded-xl transition-all",
                        filter === 'all' 
                            ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-lg shadow-gray-200/50 dark:shadow-none" 
                            : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    )}
                >
                    Alle
                </button>
                <button
                    onClick={() => setFilter('mine')}
                    className={cn(
                        "px-4 py-2 text-sm font-bold rounded-xl transition-all",
                        filter === 'mine' 
                            ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-lg shadow-gray-200/50 dark:shadow-none" 
                            : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    )}
                >
                    Meine
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
              <span className="relative z-10">Paket erfassen</span>
            </motion.button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <AnimatePresence>
            {loading ? (
                <div className="col-span-full py-20 text-center text-gray-400">Lade Pakete...</div>
            ) : filteredParcels.length === 0 ? (
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="col-span-full text-center py-20"
                >
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-800 mb-4">
                        <Search className="w-10 h-10 text-gray-400" />
                    </div>
                    <p className="text-xl text-gray-500 font-medium">Keine Pakete gefunden.</p>
                </motion.div>
            ) : (
                filteredParcels.map((parcel, index) => {
                    const isMine = parcel.recipient_id === user?.id;
                    const isCreator = parcel.created_by === user?.id;
                    const isPending = parcel.status === 'pending';
                    const isExpected = parcel.status === 'expected';
                    const isCollected = parcel.status === 'collected';

                    return (
                        <motion.div 
                            key={parcel.id} 
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.05 }}
                            layout
                            className={cn(
                                "bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl p-6 border shadow-xl transition-all relative overflow-hidden group hover:-translate-y-1",
                                isPending ? "border-indigo-100 dark:border-indigo-900/30" : 
                                isExpected ? "border-yellow-100 dark:border-yellow-900/30 bg-yellow-50/50 dark:bg-yellow-900/10" :
                                "border-gray-100 dark:border-gray-700 opacity-60 hover:opacity-100"
                            )}
                        >
                            {isPending && isMine && (
                                <div className="absolute top-0 right-0 bg-indigo-600 text-white text-[10px] font-black tracking-wider px-3 py-1 rounded-bl-2xl shadow-sm z-10">
                                    FÜR DICH
                                </div>
                            )}
                            {isExpected && (
                                <div className="absolute top-0 right-0 bg-yellow-500 text-white text-[10px] font-black tracking-wider px-3 py-1 rounded-bl-2xl flex items-center gap-1 shadow-sm z-10">
                                    <Clock className="w-3 h-3" /> ERWARTET
                                </div>
                            )}

                            <div className="flex items-start justify-between mb-6">
                                <div className="flex items-center gap-4">
                                     <div className={cn(
                                         "w-12 h-12 rounded-2xl flex items-center justify-center shadow-inner",
                                         isPending ? "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400" : 
                                         isExpected ? "bg-yellow-100 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400" :
                                         "bg-gray-100 dark:bg-gray-700 text-gray-400"
                                     )}>
                                         {isExpected ? <Truck className="w-6 h-6" /> : <Box className="w-6 h-6" />}
                                     </div>
                                     <div>
                                         <p className="font-bold text-gray-900 dark:text-white text-lg leading-tight">
                                             {parcel.profiles?.full_name || 'Unbekannt'}
                                         </p>
                                         <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1.5 mt-0.5">
                                            <Truck className="w-3.5 h-3.5" /> {parcel.carrier}
                                         </p>
                                     </div>
                                </div>
                                
                                {(isCreator || isAdmin || isCollected) && (
                                    <button 
                                        onClick={() => setDeleteId(parcel.id)}
                                        className="text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                                        title="Eintrag löschen"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                )}
                            </div>

                            <div className="bg-white/50 dark:bg-gray-700/30 rounded-2xl p-4 mb-6 space-y-2 border border-gray-100 dark:border-gray-600/30">
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500 dark:text-gray-400 font-medium">Ort:</span>
                                    <span className="font-bold text-gray-900 dark:text-white">{parcel.location}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500 dark:text-gray-400 font-medium">{isExpected ? 'Erstellt:' : 'Eingetroffen:'}</span>
                                    <span className="text-gray-700 dark:text-gray-300 font-mono">{format(new Date(parcel.created_at), 'dd.MM. HH:mm', { locale: de })}</span>
                                </div>
                                {isCollected && parcel.collected_at && (
                                    <div className="flex justify-between text-sm pt-2 border-t border-gray-200 dark:border-gray-600/50">
                                        <span className="text-gray-500 dark:text-gray-400 font-medium">Abgeholt:</span>
                                        <span className="text-green-600 dark:text-green-400 font-mono font-bold">{format(new Date(parcel.collected_at), 'dd.MM. HH:mm', { locale: de })}</span>
                                    </div>
                                )}
                            </div>

                            <div className="mt-auto">
                                {isExpected ? (
                                    <button
                                    onClick={() => handleArrived(parcel.id)}
                                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:scale-[1.02] flex items-center justify-center gap-2"
                                    >
                                    <Box className="w-4 h-4" /> Ist jetzt da
                                    </button>
                                ) : isPending ? (
                                    <button
                                        onClick={() => handleCollect(parcel.id)}
                                        className="w-full py-3 bg-gray-900 hover:bg-gray-800 dark:bg-white dark:hover:bg-gray-100 text-white dark:text-gray-900 rounded-xl text-sm font-bold transition-all shadow-lg hover:scale-[1.02] flex items-center justify-center gap-2"
                                    >
                                        <Check className="w-4 h-4" /> Als abgeholt markieren
                                    </button>
                                ) : (
                                    <div className="w-full py-3 bg-gray-100 dark:bg-gray-700/50 text-gray-400 dark:text-gray-500 rounded-xl text-sm font-bold text-center cursor-default border border-gray-200 dark:border-gray-700 flex items-center justify-center gap-2">
                                        <Check className="w-4 h-4" /> Erledigt
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
        title="Paket"
      >
        <form onSubmit={handleCreateParcel} className="space-y-6">
          
          <div className="flex p-1.5 bg-gray-100 dark:bg-gray-700 rounded-xl mb-6">
             <button
                type="button"
                onClick={() => setStatus('pending')}
                className={cn(
                    "flex-1 py-2 text-sm font-bold rounded-lg transition-all",
                    status === 'pending' 
                        ? "bg-white dark:bg-gray-600 shadow-md text-indigo-600 dark:text-indigo-400" 
                        : "text-gray-500 dark:text-gray-400 hover:text-gray-700"
                )}
             >
                Ist da (Empfang)
             </button>
             <button
                type="button"
                onClick={() => setStatus('expected')}
                className={cn(
                    "flex-1 py-2 text-sm font-bold rounded-lg transition-all",
                    status === 'expected' 
                        ? "bg-white dark:bg-gray-600 shadow-md text-indigo-600 dark:text-indigo-400" 
                        : "text-gray-500 dark:text-gray-400 hover:text-gray-700"
                )}
             >
                Ankündigen
             </button>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Empfänger
            </label>
            <select
              required
              value={recipientId}
              onChange={(e) => setRecipientId(e.target.value)}
              className="w-full rounded-xl border-transparent bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 px-4 py-3 text-sm transition-all"
            >
              <option value="">Bitte wählen...</option>
              {profiles.map(p => (
                  <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Lieferdienst / Info
            </label>
            <input
              type="text"
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              placeholder="z.B. DHL, UPS, Amazon"
              className="w-full rounded-xl border-transparent bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 px-4 py-3 text-sm transition-all"
            />
          </div>

          {status === 'pending' && (
            <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Ablageort
                </label>
                <select
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full rounded-xl border-transparent bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 px-4 py-3 text-sm transition-all"
                >
                <option value="Empfang">Empfang</option>
                <option value="Poststelle">Poststelle</option>
                <option value="Lager">Lager</option>
                <option value="Küche">Küche</option>
                </select>
            </div>
          )}

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
              {submitting ? 'Speichere...' : (status === 'expected' ? 'Ankündigen' : 'Erfassen')}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Paket-Eintrag löschen"
        message="Möchten Sie diesen Eintrag wirklich löschen?"
        confirmText="Löschen"
        isDestructive
      />
    </div>
  );
};
