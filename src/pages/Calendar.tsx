import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Absence, Profile } from '@/types';
import { useStore } from '@/store/useStore';
import { format, parseISO, isAfter, startOfDay } from 'date-fns';
import { de } from 'date-fns/locale';
import { Plus, Check, X, Clock, Calendar as CalendarIcon, Trash2, Download } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { ConfirmModal } from '@/components/ConfirmModal';
import { cn } from '@/utils/cn';
import { toast } from 'react-hot-toast';
import { generateVacationRequestPDF } from '@/utils/pdfGenerator';

export const Calendar = () => {
  const { user, profile } = useStore();
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    type: 'vacation',
    start_date: '',
    end_date: '',
  });

  const fetchAbsences = async () => {
    try {
      const { data, error } = await supabase
        .from('absences')
        .select('*, profiles(*)')
        .order('start_date', { ascending: true });

      if (error) throw error;
      setAbsences(data || []);
    } catch (error) {
      console.error('Error fetching absences:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAbsences();

    const subscription = supabase
      .channel('absences')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'absences' }, () => {
        fetchAbsences();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSubmitting(true);
    try {
      // For sick leave, auto-approve. For others, set to pending.
      const status = formData.type === 'sick_leave' ? 'approved' : 'pending';

      const { error } = await supabase.from('absences').insert({
        user_id: user.id,
        type: formData.type,
        start_date: formData.start_date,
        end_date: formData.end_date,
        status: status,
      });

      if (error) throw error;

      setIsModalOpen(false);
      setFormData({ type: 'vacation', start_date: '', end_date: '' });
      fetchAbsences();
    } catch (error) {
      console.error('Error creating absence:', error);
      toast.error('Fehler beim Erstellen der Anfrage.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusUpdate = async (id: string, status: 'approved' | 'rejected') => {
    try {
      const { error } = await supabase
        .from('absences')
        .update({ status })
        .eq('id', id);

      if (error) throw error;
      fetchAbsences();
      toast.success(status === 'approved' ? 'Antrag genehmigt.' : 'Antrag abgelehnt.');
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Fehler beim Aktualisieren des Status.');
    }
  };

  const pendingAbsences = absences.filter((a) => a.status === 'pending');
  // Show future or current absences (end_date >= today)
  const approvedAbsences = absences.filter((a) => {
    if (a.status !== 'approved') return false;
    const end = parseISO(a.end_date);
    // Add one day to end date to make it inclusive if it's strictly date (00:00)
    // Or just compare if end >= startOfToday
    return isAfter(end, startOfDay(new Date())) || end.getTime() === startOfDay(new Date()).getTime();
  });

  const isAdmin = profile?.roles?.includes('admin');
  const myRoles = profile?.roles || [];

  const checkCanModerate = (targetProfile?: Profile) => {
    if (!targetProfile) return false;
    if (isAdmin) return true;
    
    const targetRoles = targetProfile.roles || [];

    // Custom permission logic based on roles
    if (myRoles.includes('tim') && targetRoles.includes('jannis')) return true;
    if (myRoles.includes('morris') && targetRoles.includes('flori')) return true;
    if (myRoles.includes('vaupel') && targetRoles.includes('marcio')) return true;

    return false;
  };

  const handleDelete = async () => {
    if (!deleteId) return;

    try {
      const { error } = await supabase
        .from('absences')
        .delete()
        .eq('id', deleteId);

      if (error) throw error;
      fetchAbsences();
      toast.success('Antrag gelöscht.');
    } catch (error) {
      console.error('Error deleting absence:', error);
      toast.error('Fehler beim Löschen des Antrags.');
    } finally {
      setDeleteId(null);
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'vacation': return 'Urlaub';
      case 'sick_leave': return 'Krankheit';
      case 'other': return 'Sonstiges';
      default: return type;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'vacation': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
      case 'sick_leave': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  if (loading) return <div className="p-8 text-center">Laden...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <CalendarIcon className="w-8 h-8" />
          Abwesenheitskalender
        </h1>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Antrag stellen
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Approved Absences */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Kommende Abwesenheiten</h2>
          {approvedAbsences.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-center py-4">Keine geplanten Abwesenheiten.</p>
          ) : (
            <div className="space-y-4">
              {approvedAbsences.map((absence) => (
                <div key={absence.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg group">
                  <div className="flex items-center gap-3">
                    <img
                      src={absence.profiles?.avatar_url || `https://ui-avatars.com/api/?name=${absence.profiles?.full_name || 'User'}&background=random`}
                      alt={absence.profiles?.full_name || ''}
                      className="w-10 h-10 rounded-full"
                    />
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{absence.profiles?.full_name}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {format(parseISO(absence.start_date), 'dd. MMM', { locale: de })} - {format(parseISO(absence.end_date), 'dd. MMM yyyy', { locale: de })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                      <button
                        onClick={() => generateVacationRequestPDF(absence, absence.profiles!)}
                        className="text-gray-400 hover:text-indigo-600 transition-colors p-2"
                        title="PDF herunterladen"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-medium", getTypeColor(absence.type))}>
                        {getTypeLabel(absence.type)}
                      </span>
                      {absence.user_id === user?.id && (
                        <button
                          onClick={() => setDeleteId(absence.id)}
                          className="text-gray-400 hover:text-red-500 transition-opacity p-2"
                          title="Löschen"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pending Requests */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Offene Anträge</h2>
          {pendingAbsences.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-center py-4">Keine offenen Anträge.</p>
          ) : (
            <div className="space-y-4">
              {pendingAbsences.map((absence) => {
                const isOwn = absence.user_id === user?.id;
                const canModerate = isAdmin;

                if (!isOwn && !canModerate) return null;

                return (
                  <div key={absence.id} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <img
                          src={absence.profiles?.avatar_url || `https://ui-avatars.com/api/?name=${absence.profiles?.full_name || 'User'}&background=random`}
                          alt={absence.profiles?.full_name || ''}
                          className="w-8 h-8 rounded-full"
                        />
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {absence.profiles?.full_name} {isOwn && '(Du)'}
                          </p>
                          <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", getTypeColor(absence.type))}>
                            {getTypeLabel(absence.type)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                         <button
                           onClick={() => generateVacationRequestPDF(absence, absence.profiles!)}
                           className="text-gray-400 hover:text-indigo-600 transition-colors p-1"
                           title="PDF herunterladen"
                         >
                           <Download className="w-4 h-4" />
                         </button>
                         {absence.status === 'pending' && <span className="flex items-center text-xs text-yellow-600 dark:text-yellow-400 gap-1"><Clock className="w-3 h-3"/> Warten</span>}
                         {isOwn && (
                           <button
                             onClick={() => setDeleteId(absence.id)}
                             className="text-gray-400 hover:text-red-500 transition-colors p-1 ml-2"
                             title="Antrag löschen"
                           >
                             <Trash2 className="w-4 h-4" />
                           </button>
                         )}
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between mt-2 pl-11">
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {format(parseISO(absence.start_date), 'dd. MMM', { locale: de })} - {format(parseISO(absence.end_date), 'dd. MMM yyyy', { locale: de })}
                      </p>
                      
                      {canModerate && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleStatusUpdate(absence.id, 'approved')}
                            className="p-1.5 bg-green-100 text-green-700 hover:bg-green-200 rounded-md transition-colors"
                            title="Genehmigen"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleStatusUpdate(absence.id, 'rejected')}
                            className="p-1.5 bg-red-100 text-red-700 hover:bg-red-200 rounded-md transition-colors"
                            title="Ablehnen"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {pendingAbsences.filter(a => a.user_id === user?.id || isAdmin).length === 0 && (
                 <p className="text-gray-500 dark:text-gray-400 text-center py-4">Keine relevanten Anträge.</p>
              )}
            </div>
          )}
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={formData.type === 'sick_leave' ? "Krankmeldung" : "Abwesenheit beantragen"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Art der Abwesenheit
            </label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="vacation">Urlaub</option>
              <option value="sick_leave">Krankheit</option>
              <option value="other">Sonstiges</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Von
              </label>
              <input
                type="date"
                required
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Bis
              </label>
              <input
                type="date"
                required
                value={formData.end_date}
                onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
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
              {submitting ? 'Wird gesendet...' : (formData.type === 'sick_leave' ? 'Krankmeldung senden' : 'Beantragen')}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Antrag löschen"
        message="Sind Sie sicher, dass Sie diesen Antrag löschen möchten?"
        confirmText="Löschen"
        isDestructive
      />
    </div>
  );
};
