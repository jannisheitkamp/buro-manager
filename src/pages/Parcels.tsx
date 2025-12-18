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
      // If "expected", we set the location to "Erwartet" or keep it as user selected?
      // Better: Use status field. DB constraints allow text, so 'expected' works.
      
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
  const myPendingCount = parcels.filter(p => p.status === 'pending' && p.recipient_id === user?.id).length;
  const expectedCount = parcels.filter(p => p.status === 'expected').length;

  const isAdmin = profile?.roles?.includes('admin');

  if (loading) return <div className="p-8 text-center">Laden...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Package className="w-8 h-8" />
            Paketstation
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 flex gap-3">
            <span>📦 {pendingCount} am Empfang</span>
            {expectedCount > 0 && <span className="text-indigo-500">🚚 {expectedCount} erwartet</span>}
          </p>
        </div>
        
        <div className="flex gap-2 w-full sm:w-auto">
             <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
                <button
                    onClick={() => setFilter('all')}
                    className={cn(
                        "px-3 py-1.5 text-sm font-medium rounded-md transition-all",
                        filter === 'all' 
                            ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm" 
                            : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    )}
                >
                    Alle
                </button>
                <button
                    onClick={() => setFilter('mine')}
                    className={cn(
                        "px-3 py-1.5 text-sm font-medium rounded-md transition-all",
                        filter === 'mine' 
                            ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm" 
                            : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    )}
                >
                    Meine
                </button>
             </div>

            <button
              onClick={() => setIsModalOpen(true)}
              className="flex-1 sm:flex-none bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Erfassen / Ankündigen</span>
              <span className="sm:hidden">Neu</span>
            </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredParcels.map((parcel) => {
            const isMine = parcel.recipient_id === user?.id;
            const isCreator = parcel.created_by === user?.id;
            const isPending = parcel.status === 'pending';
            const isExpected = parcel.status === 'expected';
            const isCollected = parcel.status === 'collected';

            return (
                <div 
                    key={parcel.id} 
                    className={cn(
                        "bg-white dark:bg-gray-800 rounded-xl p-5 border shadow-sm transition-all relative overflow-hidden group",
                        isPending ? "border-indigo-100 dark:border-indigo-900/30" : 
                        isExpected ? "border-yellow-100 dark:border-yellow-900/30 bg-yellow-50/50 dark:bg-yellow-900/10" :
                        "border-gray-100 dark:border-gray-700 opacity-75"
                    )}
                >
                    {isPending && isMine && (
                        <div className="absolute top-0 right-0 bg-indigo-500 text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg">
                            FÜR DICH
                        </div>
                    )}
                    {isExpected && (
                        <div className="absolute top-0 right-0 bg-yellow-500 text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg flex items-center gap-1">
                            <Clock className="w-3 h-3" /> ERWARTET
                        </div>
                    )}

                    <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                             <div className={cn(
                                 "w-10 h-10 rounded-full flex items-center justify-center",
                                 isPending ? "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400" : 
                                 isExpected ? "bg-yellow-100 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400" :
                                 "bg-gray-100 dark:bg-gray-700 text-gray-400"
                             )}>
                                 {isExpected ? <Truck className="w-5 h-5" /> : <Box className="w-5 h-5" />}
                             </div>
                             <div>
                                 <p className="font-semibold text-gray-900 dark:text-white text-sm">
                                     {parcel.profiles?.full_name || 'Unbekannt'}
                                 </p>
                                 <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                    <Truck className="w-3 h-3" /> {parcel.carrier}
                                 </p>
                             </div>
                        </div>
                        
                        {(isCreator || isAdmin || isCollected) && (
                            <button 
                                onClick={() => setDeleteId(parcel.id)}
                                className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                                title="Eintrag löschen"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        )}
                    </div>

                    <div className="space-y-2 mb-4">
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-500 dark:text-gray-400">Ort:</span>
                            <span className="font-medium text-gray-900 dark:text-white">{parcel.location}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-500 dark:text-gray-400">{isExpected ? 'Erstellt:' : 'Eingetroffen:'}</span>
                            <span className="text-gray-900 dark:text-white">{format(new Date(parcel.created_at), 'dd.MM. HH:mm', { locale: de })}</span>
                        </div>
                        {isCollected && parcel.collected_at && (
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500 dark:text-gray-400">Abgeholt:</span>
                                <span className="text-green-600 dark:text-green-400">{format(new Date(parcel.collected_at), 'dd.MM. HH:mm', { locale: de })}</span>
                            </div>
                        )}
                    </div>

                    {isExpected ? (
                         <button
                           onClick={() => handleArrived(parcel.id)}
                           className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                         >
                           <Box className="w-4 h-4" /> Ist jetzt da
                         </button>
                    ) : isPending ? (
                        <button
                            onClick={() => handleCollect(parcel.id)}
                            className="w-full py-2 bg-gray-900 hover:bg-gray-800 dark:bg-white dark:hover:bg-gray-100 text-white dark:text-gray-900 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                        >
                            <Check className="w-4 h-4" /> Als abgeholt markieren
                        </button>
                    ) : (
                        <div className="w-full py-2 bg-gray-50 dark:bg-gray-700/50 text-gray-400 dark:text-gray-500 rounded-lg text-sm font-medium text-center cursor-default">
                            Erledigt
                        </div>
                    )}
                </div>
            );
        })}

        {filteredParcels.length === 0 && (
            <div className="col-span-full py-12 text-center text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
                <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>Keine Pakete gefunden.</p>
            </div>
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Paket"
      >
        <form onSubmit={handleCreateParcel} className="space-y-4">
          
          <div className="flex p-1 bg-gray-100 dark:bg-gray-700 rounded-lg mb-4">
             <button
                type="button"
                onClick={() => setStatus('pending')}
                className={cn(
                    "flex-1 py-1.5 text-sm font-medium rounded-md transition-all",
                    status === 'pending' 
                        ? "bg-white dark:bg-gray-600 shadow-sm text-indigo-600 dark:text-indigo-400" 
                        : "text-gray-500 dark:text-gray-400"
                )}
             >
                Ist da (Empfang)
             </button>
             <button
                type="button"
                onClick={() => setStatus('expected')}
                className={cn(
                    "flex-1 py-1.5 text-sm font-medium rounded-md transition-all",
                    status === 'expected' 
                        ? "bg-white dark:bg-gray-600 shadow-sm text-indigo-600 dark:text-indigo-400" 
                        : "text-gray-500 dark:text-gray-400"
                )}
             >
                Ankündigen
             </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Empfänger
            </label>
            <select
              required
              value={recipientId}
              onChange={(e) => setRecipientId(e.target.value)}
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Bitte wählen...</option>
              {profiles.map(p => (
                  <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Lieferdienst / Info
            </label>
            <input
              type="text"
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              placeholder="z.B. DHL, UPS, Amazon"
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {status === 'pending' && (
            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Ablageort
                </label>
                <select
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                <option value="Empfang">Empfang</option>
                <option value="Poststelle">Poststelle</option>
                <option value="Lager">Lager</option>
                <option value="Küche">Küche</option>
                </select>
            </div>
          )}

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
