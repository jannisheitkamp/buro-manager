import { useEffect, useState } from 'react';
import { addDays, format } from 'date-fns';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Phone, PhoneMissed, PhoneIncoming, Clock, CheckCircle, XCircle, Search, ClipboardList, Plus, AlertCircle, Trash2, ArrowRight, PenTool, Check, MessageSquare, PhoneOutgoing, Calendar, UserPlus, BookOpen } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { Modal } from '@/components/Modal';
import { cn } from '@/utils/cn';

/** Power-Dialer: fällige Leads nacheinander anrufen, Ergebnis mit einem Klick festhalten */
export function Dialer() {
  const { user } = useStore();

  // --- DIALER STATE ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [leads, setLeads] = useState<any[]>([]);
  const [currentLeadIndex, setCurrentLeadIndex] = useState(0);
  const [dialerMode, setDialerMode] = useState<'idle' | 'calling'>('idle');
  const [importText, setImportText] = useState('');
  const [showImporter, setShowImporter] = useState(false);

  // Modals for Dialer
  const [isLaterModalOpen, setIsLaterModalOpen] = useState(false);
  const [laterDelay, setLaterDelay] = useState<string>('3h'); // 1h, 3h, 1d, 3d, custom
  const [laterCustomDate, setLaterCustomDate] = useState('');

  const [isAppointmentModalOpen, setIsAppointmentModalOpen] = useState(false);
  const [appointmentDate, setAppointmentDate] = useState('');
  const [appointmentTime, setAppointmentTime] = useState('10:00');
  const [appointmentNote, setAppointmentNote] = useState('');


  // --- DIALER LOGIC ---
  const fetchLeads = async () => {
      // Fetch leads that are NOT done/lost/bad
      // AND (next_call_at is NULL OR next_call_at <= NOW)
      const now = new Date().toISOString();

      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .not('status', 'in', '("done","lost","bad")') // Exclude finished states
        .or(`next_call_at.is.null,next_call_at.lte.${now}`) // Show only if due
        .order('next_call_at', { ascending: true, nullsFirst: true }) // Due ones first
        .order('created_at', { ascending: false });

      if (error) console.error(error);
      setLeads(data || []);
  };

  const handleImportLeads = async () => {
      // Format: Name, Phone (one per line)
      const lines = importText.split('\n');
      const newLeads = [];

      for (const line of lines) {
          const [name, phone] = line.split(',');
          if (name && phone) {
              newLeads.push({
                  user_id: user?.id,
                  customer_name: name.trim(),
                  phone: phone.trim().replace(/\s/g, ''),
                  status: 'new'
              });
          }
      }

      if (newLeads.length > 0) {
          const { error } = await supabase.from('leads').insert(newLeads);
          if (!error) {
              toast.success(`${newLeads.length} Leads importiert!`);
              setImportText('');
              setShowImporter(false);
              fetchLeads();
          } else {
              toast.error('Fehler beim Import');
          }
      }
  };

  const handleConfirmLater = async () => {
      let nextDate = new Date();
      if (laterDelay === '1h') nextDate.setHours(nextDate.getHours() + 1);
      else if (laterDelay === '3h') nextDate.setHours(nextDate.getHours() + 3);
      else if (laterDelay === '1d') nextDate = addDays(nextDate, 1);
      else if (laterDelay === '3d') nextDate = addDays(nextDate, 3);
      else if (laterDelay === 'custom' && laterCustomDate) nextDate = new Date(laterCustomDate);

      if (isNaN(nextDate.getTime())) {
          toast.error('Bitte ein gültiges Datum angeben.');
          return;
      }
      const leadId = leads[currentLeadIndex].id;
      const { error } = await supabase.from('leads').update({
          status: 'retry',
          next_call_at: nextDate.toISOString(),
          last_call_at: new Date().toISOString()
      }).eq('id', leadId);
      if (error) {
          toast.error('Wiedervorlage konnte nicht gespeichert werden.');
          return;
      }

      toast.success('Wiedervorlage gespeichert! ⏰');
      setIsLaterModalOpen(false);
      advanceLead();
  };

  const handleConfirmAppointment = async () => {
      if (!user) {
          toast.error('Nicht eingeloggt');
          return;
      }
      const lead = leads[currentLeadIndex];
      const start = new Date(`${appointmentDate}T${appointmentTime}`);
      if (isNaN(start.getTime())) {
          toast.error('Bitte Datum und Uhrzeit angeben.');
          return;
      }
      const end = new Date(start.getTime() + 30 * 60000); // 30 min default

      // 1. Create Calendar Event
      const eventData = {
          title: `Termin: ${lead.customer_name}`,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          user_id: user.id,
          color: 'green', 
          description: appointmentNote
      };

      const { error: calendarError } = await supabase.from('calendar_events').insert(eventData);

      // Ohne Kalendertermin den Lead nicht abschließen, sonst geht der Termin verloren
      if (calendarError) {
          toast.error(`Fehler Kalender: ${calendarError.message}`);
          return;
      }

      // 2. Mark Lead as Done
      const { error: leadError } = await supabase.from('leads').update({
          status: 'done',
          notes: `Termin: ${format(start, 'dd.MM. HH:mm')} - ${appointmentNote}`,
          last_call_at: new Date().toISOString()
      }).eq('id', lead.id);
      if (leadError) {
          toast.error('Termin steht im Kalender, aber der Lead konnte nicht abgeschlossen werden.');
          return;
      }

      toast.success('Termin & Kalender erstellt! 🎉');
      setIsAppointmentModalOpen(false);
      advanceLead();
  };

  const advanceLead = () => {
      setDialerMode('idle');
      // Remove current lead from local list immediately
      const newLeads = [...leads];
      newLeads.splice(currentLeadIndex, 1);
      setLeads(newLeads);

      // Index stays 0 because list shifted, unless empty
      if (newLeads.length === 0) {
          toast.success('Alle fälligen Leads erledigt! 💪');
      } else {
          // If we were at the end, go to 0
          if (currentLeadIndex >= newLeads.length) setCurrentLeadIndex(0);
      }
  };

  const handleLeadResult = async (leadId: string, result: 'appointment' | 'later' | 'no_interest' | 'unreachable' | 'bad_number') => {
      if (result === 'appointment') {
          setAppointmentDate(format(new Date(), 'yyyy-MM-dd'));
          setIsAppointmentModalOpen(true);
          return;
      } 

      if (result === 'later') {
          setLaterDelay('3h');
          setIsLaterModalOpen(true);
          return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updateData: any = { last_call_at: new Date().toISOString() };

      if (result === 'no_interest') {
          updateData.status = 'lost';
          updateData.notes = 'Kein Interesse ❌';
      } else if (result === 'bad_number') {
          updateData.status = 'bad';
          updateData.notes = 'Falsche Nummer';
      } else if (result === 'unreachable') {
          updateData.status = 'retry';
          // Auto reschedule to 3 hours later or tomorrow if late
          const now = new Date();
          let next = new Date(now.getTime() + 3 * 60 * 60 * 1000); // +3h
          if (next.getHours() >= 18) {
              next = addDays(now, 1);
              next.setHours(10, 0, 0, 0);
          }
          updateData.next_call_at = next.toISOString();
          updateData.call_attempts = (leads[currentLeadIndex].call_attempts || 0) + 1;
          toast('Nicht erreicht -> Später nochmal', { icon: '📞' });
      }

      const { error } = await supabase.from('leads').update(updateData).eq('id', leadId);
      if (error) {
          toast.error('Ergebnis konnte nicht gespeichert werden.');
          return;
      }
      advanceLead();
  };


  useEffect(() => {
    fetchLeads();
  }, []);

  return (
    <>
      <div className="space-y-6 animate-fade-in">

          {/* Toolbar */}
          <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                  <div className="chip bg-brand-50 text-brand-700 dark:bg-brand-900/50 dark:text-brand-200">
                      {leads.length} Leads in der Liste
                  </div>
              </div>
              <button 
                  onClick={() => setShowImporter(!showImporter)}
                  className="btn-ghost btn-sm"
              >
                  <UserPlus className="w-4 h-4" />
                  Leads importieren
              </button>
          </div>

          {/* Importer */}
          <AnimatePresence>
              {showImporter && (
                  <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                  >
                      <div className="card card-pad">
                          <h3 className="font-bold mb-2">CSV / Text Import</h3>
                          <p className="text-xs text-gray-500 mb-4">Format pro Zeile: <code>Name, Telefonnummer</code></p>
                          <textarea
                              value={importText}
                              onChange={e => setImportText(e.target.value)}
                              placeholder={`Max Mustermann, 0171123456\nErika Musterfrau, 0172987654`}
                              className="input mb-4 h-32 font-mono"
                          />
                          <button 
                              onClick={handleImportLeads}
                              className="btn-primary w-full"
                          >
                              Importieren
                          </button>
                      </div>
                  </motion.div>
              )}
          </AnimatePresence>

          {/* DIALER INTERFACE */}
          {leads.length === 0 ? (
              <div className="card py-16 text-center">
                  <div className="w-16 h-16 bg-gray-50 dark:bg-gray-900 rounded-full flex items-center justify-center mx-auto mb-4">
                      <PhoneOutgoing className="w-8 h-8 text-gray-300" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">Keine Leads vorhanden</h3>
                  <p className="text-gray-500 mb-4">Importiere Leads um zu starten.</p>
                  <button onClick={() => setShowImporter(true)} className="text-indigo-600 font-bold hover:underline">Jetzt importieren</button>
              </div>
          ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* ACTIVE CARD */}
                  <div className="card relative flex flex-col items-center overflow-hidden p-8 text-center">
                      <div className="absolute left-0 top-0 h-1 w-full bg-gray-100 dark:bg-gray-700">
                          <div 
                              className="h-full bg-brand-600 transition-all duration-500"
                              style={{ width: `${((currentLeadIndex + 1) / leads.length) * 100}%` }}
                          />
                      </div>

                      <span className="text-xs font-bold text-gray-400 mb-6 mt-2">
                          Lead {currentLeadIndex + 1} von {leads.length}
                      </span>

                      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 dark:bg-brand-900/40">
                          <PhoneOutgoing className="h-7 w-7 text-brand-600 dark:text-brand-300" />
                      </div>

                      <h2 className="text-3xl font-semibold text-gray-900 dark:text-white mb-2">
                          {leads[currentLeadIndex].customer_name}
                      </h2>

                      <a 
                          href={`tel:${leads[currentLeadIndex].phone}`}
                          className="tabular my-6 block font-mono text-3xl font-semibold text-brand-700 hover:underline dark:text-brand-300"
                      >
                          {leads[currentLeadIndex].phone}
                      </a>

                      {dialerMode === 'idle' ? (
                          <button 
                              onClick={() => setDialerMode('calling')}
                              className="btn-primary px-6 py-2.5 text-base"
                          >
                              Ich rufe jetzt an
                          </button>
                      ) : (
                          <div className="w-full space-y-3 animate-fade-in">
                              <p className="mb-2 text-xs font-medium text-gray-500">Wie ist das Gespräch gelaufen?</p>

                              <div className="grid grid-cols-2 gap-3">
                                  <button 
                                      onClick={() => handleLeadResult(leads[currentLeadIndex].id, 'appointment')}
                                      className="flex flex-col items-center gap-1 rounded-lg bg-emerald-600 p-3 text-sm font-medium text-white hover:bg-emerald-700"
                                  >
                                      <CheckCircle className="h-5 w-5" />
                                      Termin
                                  </button>

                                  <button 
                                      onClick={() => handleLeadResult(leads[currentLeadIndex].id, 'later')}
                                      className="flex flex-col items-center gap-1 rounded-lg bg-amber-400 p-3 text-sm font-medium text-gray-950 hover:bg-amber-500"
                                  >
                                      <Clock className="h-5 w-5" />
                                      Später nochmal
                                  </button>

                                  <button 
                                      onClick={() => handleLeadResult(leads[currentLeadIndex].id, 'unreachable')}
                                      className="flex flex-col items-center gap-1 rounded-lg border border-gray-200 p-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-700/50"
                                  >
                                      <PhoneMissed className="h-5 w-5" />
                                      Nicht erreicht
                                  </button>

                                  <button 
                                      onClick={() => handleLeadResult(leads[currentLeadIndex].id, 'no_interest')}
                                      className="flex flex-col items-center gap-1 rounded-lg border border-red-200 p-3 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-900/20"
                                  >
                                      <XCircle className="h-5 w-5" />
                                      Kein Interesse
                                  </button>
                              </div>

                              <button 
                                  onClick={() => handleLeadResult(leads[currentLeadIndex].id, 'bad_number')}
                                  className="text-xs text-gray-400 hover:text-red-500 mt-4 flex items-center justify-center gap-1 w-full py-2"
                              >
                                  <AlertCircle className="w-3 h-3" /> Falsche Nummer / Ungültig
                              </button>
                          </div>
                      )}
                  </div>

                  {/* UPCOMING LIST */}
                  <div className="card card-pad">
                      <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-white">Nächste Anrufe</h3>
                      <div className="divide-y divide-gray-100 dark:divide-gray-700">
                          {leads.slice(currentLeadIndex + 1, currentLeadIndex + 6).map((lead, idx) => (
                              <div key={lead.id} className="flex items-center justify-between py-2.5">
                                  <div>
                                      <p className="text-sm font-medium text-gray-900 dark:text-white">{lead.customer_name}</p>
                                      <p className="text-xs text-gray-500">{lead.phone}</p>
                                  </div>
                                  <div className="tabular text-xs text-gray-400">
                                      {currentLeadIndex + idx + 2}
                                  </div>
                              </div>
                          ))}
                          {leads.length > currentLeadIndex + 6 && (
                              <p className="text-center text-xs text-gray-400 mt-4">...und {leads.length - (currentLeadIndex + 6)} weitere</p>
                          )}
                      </div>
                  </div>
              </div>
          )}
      </div>

      {/* DIALER: LATER MODAL */}
      <Modal
        isOpen={isLaterModalOpen}
        onClose={() => setIsLaterModalOpen(false)}
        title="Wann wieder vorlegen?"
      >
          <div className="space-y-6">
              <div className="grid grid-cols-2 gap-3">
                  {['1h', '3h', '1d', '3d'].map(val => (
                      <button
                          key={val}
                          onClick={() => setLaterDelay(val)}
                          className={cn(
                              "p-3 rounded-lg text-sm font-medium border transition-colors",
                              laterDelay === val ? "bg-brand-50 border-brand-500 text-brand-800 dark:bg-brand-900/40 dark:text-brand-100" : "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700/50"
                          )}
                      >
                          {{ '1h': 'In 1 Stunde', '3h': 'In 3 Stunden', '1d': 'Morgen', '3d': 'In 3 Tagen' }[val]}
                      </button>
                  ))}
                  <button
                          onClick={() => setLaterDelay('custom')}
                          className={cn(
                              "p-3 rounded-lg text-sm font-medium border transition-colors col-span-2",
                              laterDelay === 'custom' ? "bg-brand-50 border-brand-500 text-brand-800 dark:bg-brand-900/40 dark:text-brand-100" : "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700/50"
                          )}
                      >
                          Datum wählen
                  </button>
              </div>

              {laterDelay === 'custom' && (
                  <input 
                      type="datetime-local" 
                      className="input"
                      value={laterCustomDate}
                      onChange={e => setLaterCustomDate(e.target.value)}
                  />
              )}

              <div className="flex justify-end gap-3 pt-4">
                  <button type="button" onClick={() => setIsLaterModalOpen(false)} className="btn-secondary">Abbrechen</button>
                  <button type="button" onClick={handleConfirmLater} disabled={laterDelay === 'custom' && !laterCustomDate} className="btn-primary">Wiedervorlage speichern</button>
              </div>
          </div>
      </Modal>

      {/* DIALER: APPOINTMENT MODAL */}
      <Modal
        isOpen={isAppointmentModalOpen}
        onClose={() => setIsAppointmentModalOpen(false)}
        title="Termin vereinbaren"
      >
          <div className="space-y-4">
              <div>
                  <label className="field-label">Datum</label>
                  <input 
                      type="date" 
                      className="input"
                      value={appointmentDate}
                      onChange={e => setAppointmentDate(e.target.value)}
                  />
              </div>
              <div>
                  <label className="field-label">Uhrzeit</label>
                  <input 
                      type="time" 
                      className="input"
                      value={appointmentTime}
                      onChange={e => setAppointmentTime(e.target.value)}
                  />
              </div>
              <div>
                  <label className="field-label">Notiz / Thema</label>
                  <textarea 
                      className="input h-24 resize-none"
                      placeholder="Was wird besprochen?"
                      value={appointmentNote}
                      onChange={e => setAppointmentNote(e.target.value)}
                  />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                  <button type="button" onClick={() => setIsAppointmentModalOpen(false)} className="btn-secondary">Abbrechen</button>
                  <button type="button" onClick={handleConfirmAppointment} disabled={!appointmentDate || !appointmentTime} className="btn-primary">Termin eintragen</button>
              </div>
          </div>
      </Modal>
    </>
  );
}
