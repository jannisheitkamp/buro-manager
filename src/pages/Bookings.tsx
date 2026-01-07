import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Booking } from '@/types';
import { useStore } from '@/store/useStore';
import { format, parseISO, addDays, startOfDay, isBefore, setHours, setMinutes } from 'date-fns';
import { de } from 'date-fns/locale';
import { Plus, Trash2, Calendar as CalendarIcon, MapPin, Clock, ChevronLeft, ChevronRight, Car, Projector, Monitor } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { ConfirmModal } from '@/components/ConfirmModal';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

const RESOURCES = [
    { id: 'Besprechungsraum', label: 'Besprechungsraum', icon: MapPin, color: 'text-indigo-600', bg: 'bg-indigo-100' },
    { id: 'Firmenwagen', label: 'Firmenwagen (BMW)', icon: Car, color: 'text-blue-600', bg: 'bg-blue-100' },
    { id: 'Beamer', label: 'Beamer / Projektor', icon: Projector, color: 'text-orange-600', bg: 'bg-orange-100' },
    { id: 'Zoom', label: 'Zoom Account (Pro)', icon: Monitor, color: 'text-cyan-600', bg: 'bg-cyan-100' }
];

export const Bookings = () => {
  const { user } = useStore();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    resource_name: RESOURCES[0].id,
    title: '',
    start_time: '09:00',
    end_time: '10:00',
  });

  const fetchBookings = async () => {
    try {
      const start = startOfDay(selectedDate).toISOString();
      const end = addDays(startOfDay(selectedDate), 1).toISOString();

      const { data, error } = await supabase
        .from('bookings')
        .select('*, profiles(*)')
        .gte('end_time', start)
        .lt('start_time', end)
        .order('start_time', { ascending: true });

      if (error) throw error;
      setBookings(data || []);
    } catch (error) {
      console.error('Error fetching bookings:', error);
    }
  };

  useEffect(() => {
    fetchBookings();

    const subscription = supabase
      .channel('bookings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => {
        fetchBookings();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [selectedDate]);

  const handleDelete = async () => {
    if (!deleteId) return;

    try {
      const { error } = await supabase.from('bookings').delete().eq('id', deleteId);
      if (error) throw error;
      toast.success('Buchung storniert.');
      fetchBookings();
    } catch (error) {
      console.error('Error deleting booking:', error);
      toast.error('Fehler beim Löschen der Buchung.');
    } finally {
      setDeleteId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSubmitting(true);
    try {
      const [startHour, startMinute] = formData.start_time.split(':').map(Number);
      const [endHour, endMinute] = formData.end_time.split(':').map(Number);

      const startDate = setMinutes(setHours(selectedDate, startHour), startMinute);
      const endDate = setMinutes(setHours(selectedDate, endHour), endMinute);

      if (!isBefore(startDate, endDate)) {
        toast.error('Endzeit muss nach der Startzeit liegen.');
        setSubmitting(false);
        return;
      }

      const hasOverlap = bookings.some(b => {
        if (b.resource_name !== formData.resource_name) return false;
        
        const bStart = parseISO(b.start_time);
        const bEnd = parseISO(b.end_time);
        
        return isBefore(startDate, bEnd) && isBefore(bStart, endDate);
      });

      if (hasOverlap) {
        toast.error('Dieser Zeitraum ist bereits belegt.');
        setSubmitting(false);
        return;
      }

      const { error } = await supabase.from('bookings').insert({
        user_id: user.id,
        resource_name: formData.resource_name,
        title: formData.title,
        start_time: startDate.toISOString(),
        end_time: endDate.toISOString(),
      });

      if (error) throw error;

      setIsModalOpen(false);
      setFormData(prev => ({ ...prev, title: '' }));
      fetchBookings();
      toast.success('Erfolgreich gebucht!');
    } catch (error: any) {
      console.error('Error creating booking:', error);
      if (error.message?.includes('Zeitraum überschneidet')) {
        toast.error('Dieser Zeitraum ist bereits belegt.');
      } else {
        toast.error('Fehler beim Erstellen der Buchung.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const bookingsByResource = RESOURCES.reduce((acc, resource) => {
    acc[resource.id] = bookings.filter(b => b.resource_name === resource.id);
    return acc;
  }, {} as Record<string, Booking[]>);

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
        >
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl">
                    <CalendarIcon className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
                </div>
                Ressourcen & Räume
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-2 ml-1">Reserviere Besprechungsräume, Autos oder Equipment.</p>
        </motion.div>
        
        <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-4 bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl p-2 rounded-2xl shadow-sm border border-white/20 dark:border-gray-700/50"
        >
            <button 
                onClick={() => setSelectedDate(d => addDays(d, -1))}
                className="p-3 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
            >
                <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>
            <div className="flex flex-col items-center min-w-[140px] px-2">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Datum</span>
                <span className="font-bold text-gray-900 dark:text-white text-lg">
                    {format(selectedDate, 'EEE, d. MMM', { locale: de })}
                </span>
            </div>
            <button 
                onClick={() => setSelectedDate(d => addDays(d, 1))}
                className="p-3 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
            >
                <ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>
        </motion.div>

        <motion.button
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          onClick={() => setIsModalOpen(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-500/30 hover:scale-105 active:scale-95"
        >
          <Plus className="w-5 h-5" />
          <span className="font-semibold">Buchen</span>
        </motion.button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {RESOURCES.map((resource, idx) => {
            const Icon = resource.icon;
            return (
                <motion.div 
                    key={resource.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 dark:border-gray-700/50 overflow-hidden flex flex-col h-full"
                >
                    <div className="p-5 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl ${resource.bg} dark:bg-opacity-20 flex items-center justify-center ${resource.color} dark:text-opacity-80 shadow-inner`}>
                            <Icon className="w-5 h-5" />
                        </div>
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white">{resource.label}</h2>
                    </div>
                    <div className="p-5 flex-1 overflow-y-auto max-h-[400px]">
                        {bookingsByResource[resource.id]?.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-40 text-center opacity-60">
                                <Clock className="w-8 h-8 text-gray-300 mb-2" />
                                <p className="text-gray-500 dark:text-gray-400 font-medium text-sm">Verfügbar</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <AnimatePresence>
                                    {bookingsByResource[resource.id]?.map((booking, i) => {
                                        const isOwn = booking.user_id === user?.id;
                                        return (
                                            <motion.div 
                                                key={booking.id}
                                                initial={{ opacity: 0, x: -20 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: i * 0.1 }}
                                                className="relative group flex items-start gap-3 bg-white dark:bg-gray-700/40 hover:bg-indigo-50/50 dark:hover:bg-gray-700 p-3 rounded-xl border border-gray-100 dark:border-gray-700 transition-all shadow-sm"
                                            >
                                                {/* Time */}
                                                <div className="flex flex-col items-center justify-center min-w-[60px] border-r border-gray-100 dark:border-gray-600 pr-3 py-1">
                                                    <span className="text-sm font-bold text-gray-900 dark:text-white">
                                                        {format(parseISO(booking.start_time), 'HH:mm')}
                                                    </span>
                                                    <span className="text-[10px] font-medium text-gray-400">
                                                        {format(parseISO(booking.end_time), 'HH:mm')}
                                                    </span>
                                                </div>

                                                {/* Content */}
                                                <div className="flex-1 min-w-0">
                                                    <h3 className="font-bold text-gray-800 dark:text-gray-200 text-sm truncate">{booking.title}</h3>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <img
                                                            src={booking.profiles?.avatar_url || `https://ui-avatars.com/api/?name=${booking.profiles?.full_name || 'User'}&background=random`}
                                                            alt={booking.profiles?.full_name || ''}
                                                            className="w-4 h-4 rounded-full ring-1 ring-white dark:ring-gray-800"
                                                        />
                                                        <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                                            {booking.profiles?.full_name}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Actions */}
                                                {isOwn && (
                                                    <button 
                                                        onClick={() => setDeleteId(booking.id)}
                                                        className="p-1.5 bg-white dark:bg-gray-800 rounded-lg text-gray-400 hover:text-red-500 shadow-sm border border-gray-100 dark:border-gray-600 opacity-0 group-hover:opacity-100 transition-all absolute right-2 top-2"
                                                        title="Stornieren"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                            </motion.div>
                                        );
                                    })}
                                </AnimatePresence>
                            </div>
                        )}
                    </div>
                </motion.div>
            );
        })}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Ressource buchen"
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              Was möchtest du buchen?
            </label>
            <div className="grid grid-cols-2 gap-3">
                {RESOURCES.map(r => (
                    <button
                        key={r.id}
                        type="button"
                        onClick={() => setFormData({ ...formData, resource_name: r.id })}
                        className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${formData.resource_name === r.id ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                    >
                        <r.icon className="w-5 h-5" />
                        <span className="text-xs font-semibold">{r.label}</span>
                    </button>
                ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              Titel / Zweck
            </label>
            <input
              type="text"
              required
              placeholder="z.B. Kundentermin Müller"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full rounded-xl border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                Von
              </label>
              <div className="relative">
                  <Clock className="absolute left-3 top-3.5 w-4 h-4 text-gray-400" />
                  <input
                    type="time"
                    required
                    value={formData.start_time}
                    onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                    className="w-full rounded-xl border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                  />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                Bis
              </label>
              <div className="relative">
                  <Clock className="absolute left-3 top-3.5 w-4 h-4 text-gray-400" />
                  <input
                    type="time"
                    required
                    value={formData.end_time}
                    onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                    className="w-full rounded-xl border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                  />
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3 p-4 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 rounded-2xl text-sm border border-indigo-100 dark:border-indigo-800/50">
            <CalendarIcon className="w-5 h-5" />
            <span>Datum: <strong>{format(selectedDate, 'dd.MM.yyyy')}</strong></span>
          </div>

          <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-gray-100 dark:border-gray-800">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 rounded-xl transition-colors"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-lg shadow-indigo-500/30 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100"
            >
              {submitting ? 'Wird gebucht...' : 'Buchen'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Buchung stornieren"
        message="Möchten Sie diese Buchung wirklich stornieren?"
        confirmText="Stornieren"
        isDestructive
      />
    </div>
  );
};
