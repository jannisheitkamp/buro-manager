import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Booking } from '@/types';
import { useStore } from '@/store/useStore';
import { format, parseISO, isSameDay, addDays, startOfDay, isBefore, setHours, setMinutes } from 'date-fns';
import { de } from 'date-fns/locale';
import { Plus, Trash2, Calendar as CalendarIcon, Clock, MapPin } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { ConfirmModal } from '@/components/ConfirmModal';
import { cn } from '@/utils/cn';
import { toast } from 'react-hot-toast';

const RESOURCES = ['Besprechungsraum'];

export const Bookings = () => {
  const { user } = useStore();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    resource_name: RESOURCES[0],
    title: '',
    start_time: '09:00',
    end_time: '10:00',
  });

  const fetchBookings = async () => {
    try {
      // Get bookings for the selected date range (full day)
      // Actually, let's just get all future bookings or bookings for the selected day
      // For simplicity, let's get bookings around the selected date
      
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
    } finally {
      setLoading(false);
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
      // Construct timestamps
      const [startHour, startMinute] = formData.start_time.split(':').map(Number);
      const [endHour, endMinute] = formData.end_time.split(':').map(Number);

      const startDate = setMinutes(setHours(selectedDate, startHour), startMinute);
      const endDate = setMinutes(setHours(selectedDate, endHour), endMinute);

      if (!isBefore(startDate, endDate)) {
        toast.error('Endzeit muss nach der Startzeit liegen.');
        setSubmitting(false);
        return;
      }

      // Check overlaps (client-side first for immediate feedback, RLS/DB constraint ideally handles this too)
      const hasOverlap = bookings.some(b => {
        if (b.resource_name !== formData.resource_name) return false;
        const bStart = parseISO(b.start_time);
        const bEnd = parseISO(b.end_time);
        return (
            (isBefore(startDate, bEnd) && isBefore(bStart, endDate)) // Standard overlap check
        );
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
      toast.success('Raum erfolgreich gebucht!');
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

  // Group bookings by resource
  const bookingsByResource = RESOURCES.reduce((acc, resource) => {
    acc[resource] = bookings.filter(b => b.resource_name === resource);
    return acc;
  }, {} as Record<string, Booking[]>);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <CalendarIcon className="w-8 h-8" />
          Raumbuchung
        </h1>
        
        <div className="flex items-center gap-4 bg-white dark:bg-gray-800 p-2 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700">
            <button 
                onClick={() => setSelectedDate(d => addDays(d, -1))}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full"
            >
                ←
            </button>
            <span className="font-medium min-w-[140px] text-center">
                {format(selectedDate, 'EEEE, d. MMM', { locale: de })}
            </span>
            <button 
                onClick={() => setSelectedDate(d => addDays(d, 1))}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full"
            >
                →
            </button>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors w-full sm:w-auto justify-center"
        >
          <Plus className="w-4 h-4" />
          Buchen
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 max-w-2xl mx-auto">
        {RESOURCES.map(resource => (
          <div key={resource} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-indigo-500" />
                <h2 className="font-semibold text-gray-900 dark:text-white">{resource}</h2>
            </div>
            <div className="p-4 space-y-3 min-h-[200px]">
                {bookingsByResource[resource].length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-8">Keine Buchungen für heute.</p>
                ) : (
                    bookingsByResource[resource].map(booking => {
                        const isOwn = booking.user_id === user?.id;
                        return (
                            <div key={booking.id} className="relative group border border-l-4 border-l-indigo-500 border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-700/20 p-3 rounded-r-md shadow-sm">
                                <div className="flex justify-between items-start">
                                    <div className="w-full">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-mono font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
                                                {format(parseISO(booking.start_time), 'HH:mm')} - {format(parseISO(booking.end_time), 'HH:mm')}
                                            </span>
                                            {isOwn && (
                                                <button 
                                                    onClick={() => setDeleteId(booking.id)}
                                                    className="text-red-500 hover:text-red-700 transition-opacity p-2"
                                                    title="Löschen"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                        <h3 className="font-medium text-gray-900 dark:text-white mt-1 truncate" title={booking.title}>{booking.title}</h3>
                                        <div className="flex items-center gap-2 mt-2">
                                            <img
                                                src={booking.profiles?.avatar_url || `https://ui-avatars.com/api/?name=${booking.profiles?.full_name || 'User'}&background=random`}
                                                alt={booking.profiles?.full_name || ''}
                                                className="w-5 h-5 rounded-full"
                                            />
                                            <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                                {booking.profiles?.full_name}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
          </div>
        ))}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Raum buchen"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Raum
            </label>
            <select
              value={formData.resource_name}
              onChange={(e) => setFormData({ ...formData, resource_name: e.target.value })}
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {RESOURCES.map(r => (
                  <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Titel / Zweck
            </label>
            <input
              type="text"
              required
              placeholder="z.B. Daily Standup"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Von
              </label>
              <input
                type="time"
                required
                value={formData.start_time}
                onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Bis
              </label>
              <input
                type="time"
                required
                value={formData.end_time}
                onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          
          <div className="text-xs text-gray-500 flex items-center gap-1">
            <CalendarIcon className="w-3 h-3" />
            Datum: {format(selectedDate, 'dd.MM.yyyy')}
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
