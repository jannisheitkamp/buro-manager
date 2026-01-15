import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Absence, Profile } from '@/types';
import { useStore } from '@/store/useStore';
import { format, parseISO, isAfter, startOfDay } from 'date-fns';
import { de } from 'date-fns/locale';
import { Plus, Check, X, Clock, Calendar as CalendarIcon, Trash2, Download, Palmtree, ThermometerSun, HelpCircle, GraduationCap, Repeat } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { ConfirmModal } from '@/components/ConfirmModal';
import { cn } from '@/utils/cn';
import { toast } from 'react-hot-toast';
import { generateVacationRequestPDF } from '@/utils/pdfGenerator';
import { motion, AnimatePresence } from 'framer-motion';

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
    note: '',
    is_recurring: false,
    recurrence_interval: 'weekly'
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
      // Auto-approve sick leave and seminar. Others pending.
      // School is also auto-approved usually? User didn't specify, but let's assume school is a schedule thing, so maybe auto-approve or pending?
      // User said "Seminar... keine genehmigung notwendig".
      // School: "Serie...". Let's assume auto-approve for school too as it's a fixed schedule.
      let status = 'pending';
      if (['sick_leave', 'seminar', 'school'].includes(formData.type)) {
          status = 'approved';
      }

      const payload: any = {
        user_id: user.id,
        type: formData.type,
        start_date: formData.start_date,
        end_date: formData.end_date,
        status: status,
        note: formData.note
      };

      if (formData.type === 'school' && formData.is_recurring) {
          payload.is_recurring = true;
          payload.recurrence_interval = formData.recurrence_interval;
          // For recurring events, end_date might be the end of the series or just the first day?
          // Usually a series has a start and end date for the whole series.
          // Let's assume start_date is the first occurrence.
      }

      const { error } = await supabase.from('absences').insert(payload);

      if (error) throw error;

      setIsModalOpen(false);
      setFormData({ 
          type: 'vacation', 
          start_date: '', 
          end_date: '', 
          note: '',
          is_recurring: false,
          recurrence_interval: 'weekly'
      });
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
    
    // Logic for School Series: Only show if TODAY is one of the recurring days
    if (a.type === 'school' && a.is_recurring) {
        const today = startOfDay(new Date());
        const start = parseISO(a.start_date);
        
        // If today is before start date, don't show
        if (isAfter(start, today)) return false;

        // Calculate if today matches the interval
        const diffInDays = Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        
        if (a.recurrence_interval === 'weekly') {
            return diffInDays % 7 === 0;
        } else if (a.recurrence_interval === 'biweekly') {
            return diffInDays % 14 === 0;
        } else if (a.recurrence_interval === 'monthly') {
            // Simple monthly check (same day of month)
            return today.getDate() === start.getDate();
        }
        return false;
    }

    const end = parseISO(a.end_date);
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
    if (myRoles.includes('vaupel') && (targetRoles.includes('marcio') || targetRoles.includes('lucas'))) return true;

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
      case 'seminar': return 'Seminar';
      case 'school': return 'Schule';
      case 'other': return 'Sonstiges';
      default: return type;
    }
  };

  const getTypeIcon = (type: string) => {
      switch (type) {
          case 'vacation': return Palmtree;
          case 'sick_leave': return ThermometerSun;
          case 'seminar': return GraduationCap;
          case 'school': return GraduationCap;
          default: return HelpCircle;
      }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'vacation': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 ring-emerald-500/20';
      case 'sick_leave': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 ring-red-500/20';
      case 'seminar': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 ring-blue-500/20';
      case 'school': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 ring-purple-500/20';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300 ring-gray-500/20';
    }
  };

  if (loading) return (
      <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
  );

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
        >
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl">
                    <Palmtree className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
                </div>
                Abwesenheiten
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-2 ml-1">Verwalte Urlaubstage und Krankmeldungen.</p>
        </motion.div>
        
        <motion.button
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          onClick={() => setIsModalOpen(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-500/30 hover:scale-105 active:scale-95"
        >
          <Plus className="w-5 h-5" />
          <span className="font-semibold">Antrag stellen</span>
        </motion.button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Upcoming Approved Absences */}
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 dark:border-gray-700/50 p-6 sm:p-8"
        >
          <h2 className="text-xl font-bold mb-6 text-gray-900 dark:text-white flex items-center gap-3">
              <div className="p-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg">
                <CalendarIcon className="w-5 h-5 text-indigo-500" />
              </div>
              Kommende Abwesenheiten
          </h2>
          
          {approvedAbsences.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
                <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
                    className="w-20 h-20 bg-gray-50 dark:bg-gray-700/50 rounded-full flex items-center justify-center mb-4"
                >
                    <Palmtree className="w-10 h-10 text-gray-300" />
                </motion.div>
                <p className="text-gray-500 dark:text-gray-400 font-medium text-lg">Alle an Deck! ⚓️</p>
                <p className="text-sm text-gray-400">Keine geplanten Abwesenheiten.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <AnimatePresence>
                {approvedAbsences.map((absence, idx) => {
                    const TypeIcon = getTypeIcon(absence.type);
                    return (
                        <motion.div 
                            key={absence.id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.1 }}
                            className="group relative bg-white dark:bg-gray-700/30 hover:bg-indigo-50/50 dark:hover:bg-gray-700 p-5 rounded-2xl transition-all border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md"
                        >
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex items-center gap-4">
                                <div className="relative">
                                    <img
                                    src={absence.profiles?.avatar_url || `https://ui-avatars.com/api/?name=${absence.profiles?.full_name || 'User'}&background=random`}
                                    alt={absence.profiles?.full_name || ''}
                                    className="w-14 h-14 rounded-2xl object-cover shadow-sm ring-2 ring-white dark:ring-gray-800"
                                    />
                                    <div className={cn("absolute -bottom-2 -right-2 p-1.5 rounded-xl shadow-sm bg-white dark:bg-gray-800", getTypeColor(absence.type).split(' ')[1])}>
                                        <TypeIcon className="w-3.5 h-3.5" />
                                    </div>
                                </div>
                                <div>
                            <p className="font-bold text-gray-900 dark:text-white text-lg">{absence.profiles?.full_name}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2 mt-1">
                                <span className={cn("w-2 h-2 rounded-full", absence.type === 'sick_leave' ? 'bg-red-400' : 'bg-emerald-400')} />
                                {format(parseISO(absence.start_date), 'dd. MMM', { locale: de })} - {format(parseISO(absence.end_date), 'dd. MMM yyyy', { locale: de })}
                            </p>
                            {absence.note && (
                                <p className="text-xs text-gray-400 mt-1 italic max-w-[200px] truncate">
                                    "{absence.note}"
                                </p>
                            )}
                            </div>
                            </div>
                            
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity absolute top-4 right-4 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm p-1.5 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                                <button
                                    onClick={() => generateVacationRequestPDF(absence, absence.profiles!)}
                                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-400 hover:text-indigo-600 transition-colors"
                                    title="PDF"
                                >
                                    <Download className="w-4 h-4" />
                                </button>
                                {absence.user_id === user?.id && (
                                    <button
                                    onClick={() => setDeleteId(absence.id)}
                                    className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-gray-400 hover:text-red-500 transition-colors"
                                    title="Löschen"
                                    >
                                    <Trash2 className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        </div>
                        
                        <div className="mt-3 flex gap-2 ml-[72px]">
                            <span className={cn("px-3 py-1 rounded-lg text-xs font-bold ring-1 ring-inset", getTypeColor(absence.type))}>
                                {getTypeLabel(absence.type)}
                            </span>
                        </div>
                        </motion.div>
                    );
                })}
              </AnimatePresence>
            </div>
          )}
        </motion.div>

        {/* Pending Requests */}
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 dark:border-gray-700/50 p-6 sm:p-8"
        >
          <h2 className="text-xl font-bold mb-6 text-gray-900 dark:text-white flex items-center gap-3">
              <div className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                <Clock className="w-5 h-5 text-amber-500" />
              </div>
              Offene Anträge
          </h2>
          
          {pendingAbsences.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
                <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
                    className="w-20 h-20 bg-gray-50 dark:bg-gray-700/50 rounded-full flex items-center justify-center mb-4"
                >
                    <Check className="w-10 h-10 text-gray-300" />
                </motion.div>
                <p className="text-gray-500 dark:text-gray-400 font-medium text-lg">Alles erledigt! ✨</p>
                <p className="text-sm text-gray-400">Keine offenen Anträge zur Bearbeitung.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <AnimatePresence>
                {pendingAbsences.map((absence, idx) => {
                    const isOwn = absence.user_id === user?.id;
                    const canModerate = checkCanModerate(absence.profiles);

                    if (!isOwn && !canModerate) return null;

                    return (
                    <motion.div 
                        key={absence.id}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        className="p-5 bg-amber-50/50 dark:bg-amber-900/10 rounded-2xl border border-amber-100 dark:border-amber-900/20 shadow-sm"
                    >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-4">
                        <div className="flex items-center gap-3">
                            <img
                            src={absence.profiles?.avatar_url || `https://ui-avatars.com/api/?name=${absence.profiles?.full_name || 'User'}&background=random`}
                            alt={absence.profiles?.full_name || ''}
                            className="w-12 h-12 rounded-2xl ring-2 ring-white dark:ring-gray-800 shadow-sm"
                            />
                            <div>
                            <p className="font-bold text-gray-900 dark:text-white text-lg">
                                {absence.profiles?.full_name} {isOwn && <span className="text-gray-400 font-normal text-sm">(Du)</span>}
                            </p>
                            <span className={cn("text-xs font-medium px-2.5 py-1 rounded-lg inline-block mt-1", getTypeColor(absence.type))}>
                                {getTypeLabel(absence.type)}
                            </span>
                            </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => generateVacationRequestPDF(absence, absence.profiles!)}
                                className="p-2 bg-white dark:bg-gray-800 rounded-xl text-gray-400 hover:text-indigo-600 shadow-sm border border-gray-100 dark:border-gray-700 transition-colors"
                                title="PDF"
                            >
                                <Download className="w-4 h-4" />
                            </button>
                            {isOwn && (
                                <button
                                onClick={() => setDeleteId(absence.id)}
                                className="p-2 bg-white dark:bg-gray-800 rounded-xl text-gray-400 hover:text-red-500 shadow-sm border border-gray-100 dark:border-gray-700 transition-colors"
                                title="Löschen"
                                >
                                <Trash2 className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                        </div>
                        
                        <div className="flex items-center justify-between pt-3 border-t border-amber-100 dark:border-amber-900/20 mt-2">
                        <p className="text-sm font-medium text-gray-600 dark:text-gray-300 flex items-center gap-2">
                            <CalendarIcon className="w-4 h-4 text-amber-500" />
                            {format(parseISO(absence.start_date), 'dd. MMM', { locale: de })} - {format(parseISO(absence.end_date), 'dd. MMM yyyy', { locale: de })}
                        </p>
                        
                        {canModerate && (
                            <div className="flex gap-2">
                            <button
                                onClick={() => handleStatusUpdate(absence.id, 'approved')}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50 rounded-xl text-xs font-bold transition-colors shadow-sm"
                            >
                                <Check className="w-3.5 h-3.5" /> Genehmigen
                            </button>
                            <button
                                onClick={() => handleStatusUpdate(absence.id, 'rejected')}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50 rounded-xl text-xs font-bold transition-colors shadow-sm"
                            >
                                <X className="w-3.5 h-3.5" /> Ablehnen
                            </button>
                            </div>
                        )}
                        </div>
                    </motion.div>
                    );
                })}
              </AnimatePresence>
              {pendingAbsences.filter(a => a.user_id === user?.id || checkCanModerate(a.profiles)).length === 0 && pendingAbsences.length > 0 && (
                 <p className="text-gray-500 dark:text-gray-400 text-center py-4">Keine relevanten Anträge für dich.</p>
              )}
            </div>
          )}
        </motion.div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={formData.type === 'sick_leave' ? "Krankmeldung" : "Abwesenheit beantragen"}
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              Art der Abwesenheit
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                {[
                    { val: 'vacation', label: 'Urlaub', icon: Palmtree },
                    { val: 'sick_leave', label: 'Krank', icon: ThermometerSun },
                    { val: 'seminar', label: 'Seminar', icon: GraduationCap },
                    { val: 'school', label: 'Schule', icon: GraduationCap },
                    { val: 'other', label: 'Sonstiges', icon: HelpCircle }
                ].map(opt => {
                    const Icon = opt.icon;
                    const active = formData.type === opt.val;
                    return (
                        <button
                            key={opt.val}
                            type="button"
                            onClick={() => setFormData({ ...formData, type: opt.val })}
                            className={cn(
                                "flex flex-col items-center justify-center gap-2 p-3 rounded-xl border transition-all h-24",
                                active 
                                    ? "bg-indigo-50 border-indigo-500 text-indigo-700 ring-1 ring-indigo-500 dark:bg-indigo-900/20 dark:border-indigo-400 dark:text-indigo-300 shadow-sm" 
                                    : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300"
                            )}
                        >
                            <Icon className="w-5 h-5" />
                            <span className="text-[10px] font-bold text-center leading-tight">{opt.label}</span>
                        </button>
                    )
                })}
            </div>
          </div>

          {formData.type === 'other' && (
              <div className="animate-in fade-in slide-in-from-top-2">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Grund</label>
                  <input 
                      type="text" 
                      value={formData.note} 
                      onChange={e => setFormData({...formData, note: e.target.value})} 
                      placeholder="Bitte Grund angeben..."
                      className="w-full rounded-xl border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                  />
              </div>
          )}

          {formData.type === 'school' && (
              <div className="bg-purple-50 dark:bg-purple-900/10 p-4 rounded-xl border border-purple-100 dark:border-purple-900/30 space-y-4 animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-center justify-between">
                      <label className="text-sm font-bold text-purple-900 dark:text-purple-300 flex items-center gap-2">
                          <Repeat className="w-4 h-4" /> Wiederkehrend?
                      </label>
                      <input 
                          type="checkbox" 
                          checked={formData.is_recurring} 
                          onChange={e => setFormData({...formData, is_recurring: e.target.checked})}
                          className="w-5 h-5 rounded-lg border-purple-300 text-purple-600 focus:ring-purple-500"
                      />
                  </div>
                  
                  {formData.is_recurring && (
                      <div>
                          <label className="block text-xs font-bold text-purple-700 dark:text-purple-400 uppercase tracking-wider mb-2">Intervall</label>
                          <div className="grid grid-cols-3 gap-2">
                              {[
                                  { val: 'weekly', label: 'Wöchentlich' },
                                  { val: 'biweekly', label: 'Alle 2 Wochen' },
                                  { val: 'monthly', label: 'Monatlich' }
                              ].map(int => (
                                  <button
                                      key={int.val}
                                      type="button"
                                      onClick={() => setFormData({...formData, recurrence_interval: int.val})}
                                      className={cn(
                                          "px-3 py-2 rounded-lg text-xs font-bold transition-all",
                                          formData.recurrence_interval === int.val 
                                              ? "bg-purple-200 text-purple-800 dark:bg-purple-800 dark:text-purple-200" 
                                              : "bg-white dark:bg-gray-800 text-gray-600 hover:bg-purple-100"
                                      )}
                                  >
                                      {int.label}
                                  </button>
                              ))}
                          </div>
                      </div>
                  )}
              </div>
          )}

          {formData.type !== 'other' && (
              <div className="animate-in fade-in slide-in-from-top-2">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Notiz</label>
                  <input 
                      type="text" 
                      value={formData.note} 
                      onChange={e => setFormData({...formData, note: e.target.value})} 
                      placeholder="Optionale Notiz..."
                      className="w-full rounded-xl border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                  />
              </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                Von
              </label>
              <div className="relative">
                  <CalendarIcon className="absolute left-3 top-3.5 w-4 h-4 text-gray-400" />
                  <input
                    type="date"
                    required
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    className="w-full rounded-xl border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                  />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                Bis
              </label>
              <div className="relative">
                  <CalendarIcon className="absolute left-3 top-3.5 w-4 h-4 text-gray-400" />
                  <input
                    type="date"
                    required
                    value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    className="w-full rounded-xl border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                  />
              </div>
            </div>
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
