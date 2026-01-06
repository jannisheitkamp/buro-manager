import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { format, startOfWeek, addDays, startOfMonth, endOfMonth, endOfWeek, isSameMonth, isSameDay, addMonths, subMonths, isToday } from 'date-fns';
import { de } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus, Clock, MapPin, AlignLeft } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Modal } from '@/components/Modal';
import { toast } from 'react-hot-toast';

// Simple Event type
type CalendarEvent = {
  id: string;
  title: string;
  description?: string;
  start_time: string;
  end_time: string;
  user_id: string;
  location?: string;
  color?: string; // 'blue', 'red', 'green', 'yellow'
  type?: 'event' | 'absence' | 'booking' | 'parcel';
  profiles?: {
      full_name: string;
      avatar_url?: string;
  }
};

export const GeneralCalendar = () => {
  const { user } = useStore();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Form State
  const [eventTitle, setEventTitle] = useState('');
  const [eventDesc, setEventDesc] = useState('');
  const [eventStart, setEventStart] = useState('09:00');
  const [eventEnd, setEventEnd] = useState('10:00');
  const [eventLocation, setEventLocation] = useState('');
  const [eventColor, setEventColor] = useState('blue');

  const fetchEvents = async () => {
    // Fetch events for current month view (plus buffer)
    const start = startOfWeek(startOfMonth(currentDate)).toISOString();
    const end = endOfWeek(endOfMonth(currentDate)).toISOString();

    console.log('Fetching events for range:', { start, end });

    // 1. Calendar Events: Load ALL for debugging
    const { data: calendarData, error: calError } = await supabase
        .from('calendar_events')
        .select('*, profiles(full_name, avatar_url)');
        // .lte('start_time', end)
        // .gte('end_time', start);

    if (calError) console.error('Error fetching calendar events:', calError);
    console.log('Raw Calendar Data:', calendarData);

    // 2. Absences (Leaves)
    // Note: Absences use DATE type, so we compare simply
    const { data: absenceData } = await supabase
        .from('absences')
        .select('*, profiles(full_name, avatar_url)')
        .eq('status', 'approved')
        .or(`start_date.lte.${end},end_date.gte.${start}`);

    // 3. Bookings (Rooms)
    const { data: bookingData } = await supabase
        .from('bookings')
        .select('*, profiles(full_name, avatar_url)')
        .lte('start_time', end)
        .gte('end_time', start);

    // 4. Parcels (Expected)
    const { data: parcelData } = await supabase
        .from('parcels')
        .select('*')
        .eq('status', 'expected')
        .gte('created_at', start)
        .lte('created_at', end);


    // Transform and merge all events
    const allEvents: CalendarEvent[] = [];

    // Add Calendar Events
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    calendarData?.forEach((e: any) => {
        allEvents.push({
            id: e.id,
            title: e.title,
            start_time: e.start_time,
            end_time: e.end_time,
            user_id: e.user_id,
            color: e.color || 'blue',
            type: 'event',
            profiles: e.profiles
        });
    });

    // Add Absences
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    absenceData?.forEach((a: any) => {
        // Create an event for each day of the absence within the view
        let d = new Date(a.start_date);
        const endDate = new Date(a.end_date);
        
        // Prevent infinite loop if dates are invalid
        if (d > endDate) return;

        while (d <= endDate) {
            allEvents.push({
                id: `${a.id}-${d.toISOString()}`,
                title: `Urlaub: ${a.profiles?.full_name}`,
                start_time: d.toISOString(),
                end_time: d.toISOString(),
                user_id: a.user_id,
                color: 'green',
                type: 'absence',
                profiles: a.profiles
            });
            d = addDays(d, 1);
        }
    });

    // Add Bookings
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bookingData?.forEach((b: any) => {
        allEvents.push({
            id: b.id,
            title: `Raum: ${b.resource_name} (${b.title})`,
            start_time: b.start_time,
            end_time: b.end_time,
            user_id: b.user_id,
            color: 'yellow',
            type: 'booking',
            profiles: b.profiles
        });
    });
    
    // Add Parcels
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parcelData?.forEach((p: any) => {
        allEvents.push({
            id: p.id,
            title: `Paket: ${p.carrier}`,
            start_time: p.created_at,
            end_time: p.created_at, // Just a point in time
            user_id: p.recipient_id || '',
            color: 'red',
            type: 'parcel'
        });
    });

    setEvents(allEvents);
  };

  useEffect(() => {
    fetchEvents();
    
    const sub1 = supabase.channel('cal_1').on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events' }, fetchEvents).subscribe();
    const sub2 = supabase.channel('cal_2').on('postgres_changes', { event: '*', schema: 'public', table: 'absences' }, fetchEvents).subscribe();
    const sub3 = supabase.channel('cal_3').on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, fetchEvents).subscribe();
    const sub4 = supabase.channel('cal_4').on('postgres_changes', { event: '*', schema: 'public', table: 'parcels' }, fetchEvents).subscribe();

    return () => { 
        sub1.unsubscribe(); 
        sub2.unsubscribe();
        sub3.unsubscribe();
        sub4.unsubscribe();
    };
  }, [currentDate]);

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);

    try {
        // Combine selectedDate with time
        const startDateTime = new Date(selectedDate);
        const [sh, sm] = eventStart.split(':').map(Number);
        startDateTime.setHours(sh, sm);

        const endDateTime = new Date(selectedDate);
        const [eh, em] = eventEnd.split(':').map(Number);
        endDateTime.setHours(eh, em);

        const { error } = await supabase.from('calendar_events').insert({
            title: eventTitle,
            description: eventDesc,
            start_time: startDateTime.toISOString(),
            end_time: endDateTime.toISOString(),
            location: eventLocation,
            color: eventColor,
            user_id: user.id
        });

        if (error) throw error;
        toast.success('Termin erstellt!');
        setIsModalOpen(false);
        setEventTitle('');
        setEventDesc('');
        fetchEvents();
    } catch (error) {
        console.error(error);
        toast.error('Fehler beim Erstellen.');
    } finally {
        setSubmitting(false);
    }
  };

  const renderHeader = () => {
    return (
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white capitalize">
                {format(currentDate, 'MMMM yyyy', { locale: de })}
            </h2>
            <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="p-1 hover:bg-white dark:hover:bg-gray-700 rounded-md transition-colors"><ChevronLeft className="w-5 h-5" /></button>
                <button onClick={() => setCurrentDate(new Date())} className="px-3 text-sm font-medium hover:bg-white dark:hover:bg-gray-700 rounded-md transition-colors">Heute</button>
                <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="p-1 hover:bg-white dark:hover:bg-gray-700 rounded-md transition-colors"><ChevronRight className="w-5 h-5" /></button>
            </div>
        </div>
        <button
            onClick={() => setIsModalOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm transition-colors"
        >
            <Plus className="w-4 h-4" /> Termin
        </button>
      </div>
    );
  };

  const renderDays = () => {
    const days = [];
    const dateFormat = "EEEE";
    const startDate = startOfWeek(currentDate, { weekStartsOn: 1 });

    for (let i = 0; i < 7; i++) {
      days.push(
        <div key={i} className="text-center text-sm font-medium text-gray-500 dark:text-gray-400 py-2">
          {format(addDays(startDate, i), dateFormat, { locale: de })}
        </div>
      );
    }
    return <div className="grid grid-cols-7 mb-2">{days}</div>;
  };

  const renderCells = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

    const rows = [];
    let days = [];
    let day = startDate;
    let formattedDate = "";

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        formattedDate = format(day, "d");
        const cloneDay = day;
        
        // Filter events for this day
        const dayEvents = events.filter(e => {
            const eventDate = format(new Date(e.start_time), 'yyyy-MM-dd');
            const currentDay = format(day, 'yyyy-MM-dd');
            return eventDate === currentDay;
        });

        days.push(
          <div
            key={day.toString()}
            className={cn(
                "min-h-[100px] border border-gray-100 dark:border-gray-700/50 p-2 transition-colors relative group",
                !isSameMonth(day, monthStart) ? "bg-gray-50/50 dark:bg-gray-800/30 text-gray-400" : "bg-white dark:bg-gray-800",
                isSameDay(day, selectedDate) ? "ring-2 ring-indigo-500 z-10" : "",
                isToday(day) ? "bg-indigo-50/30 dark:bg-indigo-900/10" : ""
            )}
            onClick={() => setSelectedDate(cloneDay)}
          >
            <span className={cn(
                "text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full mb-1",
                isToday(day) ? "bg-indigo-600 text-white" : "text-gray-700 dark:text-gray-300"
            )}>
                {formattedDate}
            </span>
            
            <div className="space-y-1">
                {dayEvents.map(ev => (
                    <div 
                        key={ev.id} 
                        className={cn(
                            "text-xs px-1.5 py-0.5 rounded truncate border-l-2 cursor-pointer hover:opacity-80 flex items-center gap-1",
                            ev.color === 'red' ? "bg-red-100 text-red-700 border-red-500 dark:bg-red-900/30 dark:text-red-200" :
                            ev.color === 'green' ? "bg-green-100 text-green-700 border-green-500 dark:bg-green-900/30 dark:text-green-200" :
                            ev.color === 'yellow' ? "bg-yellow-100 text-yellow-700 border-yellow-500 dark:bg-yellow-900/30 dark:text-yellow-200" :
                            "bg-blue-100 text-blue-700 border-blue-500 dark:bg-blue-900/30 dark:text-blue-200"
                        )}
                        title={ev.title}
                    >
                        {ev.type === 'absence' && <span className="w-1.5 h-1.5 rounded-full bg-current opacity-50" />}
                        <span className="truncate">{format(new Date(ev.start_time), 'HH:mm')} {ev.title}</span>
                    </div>
                ))}
            </div>
            
            {/* Quick add button on hover */}
            <button 
                onClick={(e) => { e.stopPropagation(); setSelectedDate(cloneDay); setIsModalOpen(true); }}
                className="absolute bottom-1 right-1 p-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 opacity-0 group-hover:opacity-100 transition-all"
            >
                <Plus className="w-3 h-3" />
            </button>
          </div>
        );
        day = addDays(day, 1);
      }
      rows.push(
        <div key={day.toString()} className="grid grid-cols-7">
          {days}
        </div>
      );
      days = [];
    }
    return <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">{rows}</div>;
  };

  return (
    <div className="space-y-6">
        {renderHeader()}
        {renderDays()}
        {renderCells()}

        <Modal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            title={`Termin am ${format(selectedDate, 'dd.MM.yyyy')}`}
        >
            <form onSubmit={handleCreateEvent} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Titel</label>
                    <input
                        required
                        type="text"
                        value={eventTitle}
                        onChange={e => setEventTitle(e.target.value)}
                        className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="Meeting, Deadline, etc."
                    />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Von</label>
                        <div className="relative">
                            <Clock className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
                            <input
                                type="time"
                                value={eventStart}
                                onChange={e => setEventStart(e.target.value)}
                                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Bis</label>
                        <div className="relative">
                            <Clock className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
                            <input
                                type="time"
                                value={eventEnd}
                                onChange={e => setEventEnd(e.target.value)}
                                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ort (Optional)</label>
                    <div className="relative">
                        <MapPin className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            value={eventLocation}
                            onChange={e => setEventLocation(e.target.value)}
                            className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="Konferenzraum, Online, etc."
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Beschreibung</label>
                    <div className="relative">
                        <AlignLeft className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
                        <textarea
                            rows={3}
                            value={eventDesc}
                            onChange={e => setEventDesc(e.target.value)}
                            className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="Details zum Termin..."
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Farbe</label>
                    <div className="flex gap-3">
                        {['blue', 'green', 'yellow', 'red'].map(c => (
                            <button
                                key={c}
                                type="button"
                                onClick={() => setEventColor(c)}
                                className={cn(
                                    "w-8 h-8 rounded-full border-2 transition-all",
                                    c === 'blue' ? "bg-blue-500 border-blue-600" :
                                    c === 'green' ? "bg-green-500 border-green-600" :
                                    c === 'yellow' ? "bg-yellow-500 border-yellow-600" :
                                    "bg-red-500 border-red-600",
                                    eventColor === c ? "ring-2 ring-offset-2 ring-gray-400 scale-110" : "opacity-70 hover:opacity-100"
                                )}
                            />
                        ))}
                    </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                    <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-md">Abbrechen</button>
                    <button type="submit" disabled={submitting} className="px-4 py-2 text-sm text-white bg-indigo-600 hover:bg-indigo-700 rounded-md">Speichern</button>
                </div>
            </form>
        </Modal>
    </div>
  );
};
