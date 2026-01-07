import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { format, startOfWeek, addDays, startOfMonth, endOfMonth, endOfWeek, isSameMonth, isSameDay, addMonths, subMonths, isToday } from 'date-fns';
import { de } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus, Clock, MapPin, AlignLeft, Filter, Calendar as CalendarIcon, List } from 'lucide-react';
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
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [draggingEvent, setDraggingEvent] = useState<CalendarEvent | null>(null);
  const [activeFilters, setActiveFilters] = useState<string[]>(['blue', 'green', 'yellow', 'red', 'purple']);
  
  // Form State
  const [eventTitle, setEventTitle] = useState('');
  const [eventDesc, setEventDesc] = useState('');
  const [eventStart, setEventStart] = useState('09:00');
  const [eventEnd, setEventEnd] = useState('10:00');
  const [eventLocation, setEventLocation] = useState('');
  const [eventColor, setEventColor] = useState('blue');

  const fetchEvents = async () => {
    // Determine fetch range based on view mode
    let start, end;
    if (viewMode === 'month') {
        start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 }).toISOString();
        end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 }).toISOString();
    } else {
        start = startOfWeek(currentDate, { weekStartsOn: 1 }).toISOString();
        end = endOfWeek(currentDate, { weekStartsOn: 1 }).toISOString();
    }

    // 1. Calendar Events
    let calendarData;
    const { data: dataWithProfiles, error: calError } = await supabase
        .from('calendar_events')
        .select('*, profiles(full_name, avatar_url)')
        .lte('start_time', end)
        .gte('end_time', start);

    if (calError && calError.message.includes('relationship')) {
        const { data: dataSimple } = await supabase
            .from('calendar_events')
            .select('*')
            .lte('start_time', end)
            .gte('end_time', start);
        calendarData = dataSimple;
    } else if (calError) {
        console.error('Error fetching calendar events:', calError);
        toast.error(`DB Error: ${calError.message}`);
    } else {
        calendarData = dataWithProfiles;
    }

    // 2. Absences
    const { data: absenceData } = await supabase
        .from('absences')
        .select('*, profiles(full_name, avatar_url)')
        .eq('status', 'approved')
        .or(`start_date.lte.${end},end_date.gte.${start}`);

    // 3. Bookings
    const { data: bookingData } = await supabase
        .from('bookings')
        .select('*, profiles(full_name, avatar_url)')
        .lte('start_time', end)
        .gte('end_time', start);

    // 4. Parcels
    const { data: parcelData } = await supabase
        .from('parcels')
        .select('*')
        .eq('status', 'expected')
        .gte('created_at', start)
        .lte('created_at', end);


    const allEvents: CalendarEvent[] = [];

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

    absenceData?.forEach((a: any) => {
        let d = new Date(a.start_date);
        const endDate = new Date(a.end_date);
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
    
    parcelData?.forEach((p: any) => {
        allEvents.push({
            id: p.id,
            title: `Paket: ${p.carrier}`,
            start_time: p.created_at,
            end_time: p.created_at,
            user_id: p.recipient_id || '',
            color: 'red',
            type: 'parcel'
        });
    });

    setEvents(allEvents.filter(ev => activeFilters.includes(ev.color || 'blue')));
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
  }, [currentDate, viewMode, activeFilters]);

  const handleCreateOrUpdateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);

    try {
        const startDateTime = new Date(selectedDate);
        const [sh, sm] = eventStart.split(':').map(Number);
        startDateTime.setHours(sh, sm);

        const endDateTime = new Date(selectedDate);
        const [eh, em] = eventEnd.split(':').map(Number);
        endDateTime.setHours(eh, em);

        if (editingEvent) {
            const { error } = await supabase.from('calendar_events').update({
                title: eventTitle,
                description: eventDesc,
                start_time: startDateTime.toISOString(),
                end_time: endDateTime.toISOString(),
                location: eventLocation,
                color: eventColor,
            }).eq('id', editingEvent.id);
            if (error) throw error;
            toast.success('Aktualisiert');
        } else {
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
            toast.success('Erstellt');
        }

        setIsModalOpen(false);
        setEditingEvent(null);
        resetForm();
        fetchEvents();
    } catch (error) {
        console.error(error);
        toast.error('Fehler beim Speichern.');
    } finally {
        setSubmitting(false);
    }
  };

  const handleDeleteEvent = async () => {
      if (!editingEvent) return;
      if (!confirm('Wirklich löschen?')) return;
      
      setSubmitting(true);
      try {
          const { error } = await supabase.from('calendar_events').delete().eq('id', editingEvent.id);
          if (error) throw error;
          toast.success('Gelöscht');
          setIsModalOpen(false);
          setEditingEvent(null);
          resetForm();
          fetchEvents();
      } catch (error) {
          console.error(error);
          toast.error('Fehler');
      } finally {
          setSubmitting(false);
      }
  };

  const handleDrop = async (e: React.DragEvent, day: Date, hour: number) => {
      e.preventDefault();
      if (!draggingEvent || !user) return;

      const durationMs = new Date(draggingEvent.end_time).getTime() - new Date(draggingEvent.start_time).getTime();
      const newStart = new Date(day);
      newStart.setHours(hour, 0, 0, 0);
      const newEnd = new Date(newStart.getTime() + durationMs);

      const updatedEvent = { ...draggingEvent, start_time: newStart.toISOString(), end_time: newEnd.toISOString() };
      setEvents(prev => prev.map(ev => ev.id === draggingEvent.id ? updatedEvent : ev));
      setDraggingEvent(null);

      try {
          const { error } = await supabase.from('calendar_events').update({
              start_time: newStart.toISOString(),
              end_time: newEnd.toISOString()
          }).eq('id', draggingEvent.id);
          if (error) throw error;
          toast.success('Verschoben');
      } catch (error) {
          console.error(error);
          toast.error('Fehler');
          fetchEvents();
      }
  };

  const resetForm = () => {
      setEventTitle('');
      setEventDesc('');
      setEventStart('09:00');
      setEventEnd('10:00');
      setEventLocation('');
      setEventColor('blue');
  };

  const openNewEventModal = (date: Date) => {
      setEditingEvent(null);
      setSelectedDate(date);
      resetForm();
      setIsModalOpen(true);
  };

  const openEditModal = (event: CalendarEvent) => {
      if (event.type !== 'event') return;
      setEditingEvent(event);
      setSelectedDate(new Date(event.start_time));
      setEventTitle(event.title);
      setEventDesc(event.description || '');
      setEventStart(format(new Date(event.start_time), 'HH:mm'));
      setEventEnd(format(new Date(event.end_time), 'HH:mm'));
      setEventLocation(event.location || '');
      setEventColor(event.color || 'blue');
      setIsModalOpen(true);
  };

  const toggleFilter = (color: string) => {
      setActiveFilters(prev => 
          prev.includes(color) ? prev.filter(c => c !== color) : [...prev, color]
      );
  };

  const CATEGORIES = [
      { id: 'blue', label: 'Allgemein', color: 'bg-blue-500', text: 'text-blue-600', bg: 'bg-blue-50' },
      { id: 'green', label: 'Urlaub', color: 'bg-green-500', text: 'text-green-600', bg: 'bg-green-50' },
      { id: 'yellow', label: 'Meeting', color: 'bg-yellow-500', text: 'text-yellow-600', bg: 'bg-yellow-50' },
      { id: 'red', label: 'Wichtig', color: 'bg-red-500', text: 'text-red-600', bg: 'bg-red-50' },
      { id: 'purple', label: 'Extern', color: 'bg-purple-500', text: 'text-purple-600', bg: 'bg-purple-50' },
  ];

  const renderHeader = () => {
    return (
      <div className="flex flex-col gap-6 mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                    <button onClick={() => {
                        if (viewMode === 'month') setCurrentDate(subMonths(currentDate, 1));
                        else setCurrentDate(addDays(currentDate, -7));
                    }} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"><ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" /></button>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white capitalize min-w-[180px] text-center">
                        {viewMode === 'month' 
                            ? format(currentDate, 'MMMM yyyy', { locale: de })
                            : `KW ${format(currentDate, 'w')}`
                        }
                    </h2>
                    <button onClick={() => {
                        if (viewMode === 'month') setCurrentDate(addMonths(currentDate, 1));
                        else setCurrentDate(addDays(currentDate, 7));
                    }} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"><ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-300" /></button>
                </div>
                <button onClick={() => setCurrentDate(new Date())} className="px-4 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors hidden sm:block">
                    Heute
                </button>
            </div>

            <div className="flex items-center gap-3">
                <div className="bg-gray-100/80 dark:bg-gray-800/80 p-1 rounded-full flex backdrop-blur-sm">
                    <button 
                        onClick={() => setViewMode('month')}
                        className={cn(
                            "px-4 py-1.5 text-sm font-medium rounded-full transition-all flex items-center gap-2",
                            viewMode === 'month' ? "bg-white dark:bg-gray-700 shadow-sm text-indigo-600 dark:text-indigo-400" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                        )}
                    >
                        <CalendarIcon className="w-4 h-4" />
                        <span className="hidden sm:inline">Monat</span>
                    </button>
                    <button 
                        onClick={() => setViewMode('week')}
                        className={cn(
                            "px-4 py-1.5 text-sm font-medium rounded-full transition-all flex items-center gap-2",
                            viewMode === 'week' ? "bg-white dark:bg-gray-700 shadow-sm text-indigo-600 dark:text-indigo-400" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                        )}
                    >
                        <List className="w-4 h-4" />
                        <span className="hidden sm:inline">Woche</span>
                    </button>
                </div>

                <button
                    onClick={() => openNewEventModal(new Date())}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white p-2 sm:px-4 sm:py-2 rounded-full flex items-center gap-2 shadow-lg shadow-indigo-500/20 transition-all hover:scale-105 active:scale-95"
                >
                    <Plus className="w-5 h-5" /> <span className="hidden sm:inline font-medium">Neuer Termin</span>
                </button>
            </div>
        </div>

        {/* Filter Bar */}
        <div className="flex items-center gap-3 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 hide-scrollbar">
            <div className="p-1.5 bg-gray-50 dark:bg-gray-800 rounded-full text-gray-400">
                <Filter className="w-4 h-4" />
            </div>
            {CATEGORIES.map(cat => (
                <button
                    key={cat.id}
                    onClick={() => toggleFilter(cat.id)}
                    className={cn(
                        "px-4 py-1.5 rounded-full text-xs font-medium flex items-center gap-2 transition-all border shrink-0",
                        activeFilters.includes(cat.id) 
                            ? "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-sm opacity-100"
                            : "bg-transparent border-transparent opacity-40 hover:opacity-70 grayscale"
                    )}
                >
                    <span className={cn("w-2 h-2 rounded-full ring-2 ring-white dark:ring-gray-900 shadow-sm", cat.color)} />
                    {cat.label}
                </button>
            ))}
        </div>
      </div>
    );
  };

  const renderDays = () => {
    const days = [];
    const dateFormat = "EEEE";
    const startDate = startOfWeek(currentDate, { weekStartsOn: 1 });

    for (let i = 0; i < 7; i++) {
      days.push(
        <div key={i} className="text-center text-xs font-semibold text-gray-400 uppercase tracking-wider py-4">
          {format(addDays(startDate, i), dateFormat, { locale: de }).substring(0, 3)}
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

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        const cloneDay = day;
        const formattedDate = format(day, "d");
        const dayEvents = events.filter(e => isSameDay(new Date(e.start_time), day));

        days.push(
          <div
            key={day.toString()}
            className={cn(
                "min-h-[120px] p-2 transition-all relative group border-t border-r border-gray-50 dark:border-gray-800/50 hover:bg-gray-50/50 dark:hover:bg-gray-800/30",
                !isSameMonth(day, monthStart) && "opacity-30 grayscale",
                i === 0 && "border-l", // Left border for first column
                i === 6 && "border-r-0" // No right border for last column
            )}
            onClick={() => setSelectedDate(cloneDay)}
          >
            <div className="flex justify-center mb-2">
                <span className={cn(
                    "text-sm font-medium w-8 h-8 flex items-center justify-center rounded-full transition-all",
                    isToday(day) 
                        ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/30 scale-110" 
                        : "text-gray-700 dark:text-gray-300 group-hover:bg-gray-100 dark:group-hover:bg-gray-700"
                )}>
                    {formattedDate}
                </span>
            </div>
            
            <div className="space-y-1.5">
                {dayEvents.slice(0, 3).map(ev => (
                    <div 
                        key={ev.id} 
                        className={cn(
                            "text-[11px] px-2 py-1 rounded-full cursor-pointer hover:brightness-95 transition-all truncate flex items-center gap-1.5 shadow-sm",
                            ev.color === 'red' ? "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-200" :
                            ev.color === 'green' ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-200" :
                            ev.color === 'yellow' ? "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-200" :
                            ev.color === 'purple' ? "bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-200" :
                            "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200"
                        )}
                        onClick={(e) => { e.stopPropagation(); openEditModal(ev); }}
                    >
                        <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", 
                            ev.color === 'red' ? "bg-red-400" :
                            ev.color === 'green' ? "bg-green-400" :
                            ev.color === 'yellow' ? "bg-yellow-400" :
                            ev.color === 'purple' ? "bg-purple-400" :
                            "bg-blue-400"
                        )} />
                        <span className="truncate font-medium">{ev.title}</span>
                    </div>
                ))}
                {dayEvents.length > 3 && (
                    <div className="text-[10px] text-gray-400 pl-2 font-medium">+ {dayEvents.length - 3} weitere</div>
                )}
            </div>
            
            {/* Hover Plus */}
            <button 
                onClick={(e) => { e.stopPropagation(); openNewEventModal(cloneDay); }}
                className="hidden sm:flex absolute bottom-2 right-2 w-6 h-6 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 opacity-0 group-hover:opacity-100 transition-all hover:scale-110"
            >
                <Plus className="w-3.5 h-3.5" />
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
    return <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">{rows}</div>;
  };

  const renderWeekView = () => {
      const startDate = startOfWeek(currentDate, { weekStartsOn: 1 });
      const days = [];
      
      for (let i = 0; i < 7; i++) {
          const d = addDays(startDate, i);
          days.push(
              <div key={i} className="flex-1 text-center py-4 min-w-[120px] border-b border-gray-100 dark:border-gray-800">
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">{format(d, 'EEE', { locale: de })}</div>
                  <div className={cn(
                      "text-xl font-bold w-10 h-10 flex items-center justify-center rounded-full mx-auto transition-all",
                      isToday(d) ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/30" : "text-gray-900 dark:text-white"
                  )}>
                      {format(d, 'd')}
                  </div>
              </div>
          );
      }

      const hours = Array.from({ length: 16 }, (_, i) => i + 6);
      
      return (
          <div className="flex flex-col h-[calc(100vh-250px)] bg-white dark:bg-gray-900 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
              <div className="overflow-x-auto flex-1 flex flex-col custom-scrollbar">
                  <div className="min-w-[800px] flex flex-col flex-1">
                      <div className="flex sticky top-0 z-30 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-b border-gray-100 dark:border-gray-800">
                          <div className="w-16 flex-shrink-0"></div>
                          {days}
                      </div>

                      <div className="flex-1 relative">
                          <div className="flex relative min-h-[960px]">
                              <div className="w-16 flex-shrink-0 bg-gray-50/50 dark:bg-gray-800/20 z-20 sticky left-0 border-r border-gray-100 dark:border-gray-800">
                                  {hours.map(hour => (
                                      <div key={hour} className="h-[60px] text-xs font-medium text-gray-400 text-right pr-3 pt-3">
                                          {hour}:00
                                      </div>
                                  ))}
                              </div>

                              {Array.from({ length: 7 }).map((_, dayIdx) => {
                                  const currentDay = addDays(startDate, dayIdx);
                                  const dayEvents = events.filter(e => isSameDay(new Date(e.start_time), currentDay));

                                  return (
                                      <div key={dayIdx} className="flex-1 border-r border-gray-50 dark:border-gray-800/50 last:border-r-0 relative group min-w-[120px]">
                                          {hours.map(hour => (
                                              <div 
                                                  key={hour} 
                                                  className="h-[60px] border-b border-gray-50 dark:border-gray-800/30"
                                                  onDragOver={(e) => e.preventDefault()}
                                                  onDrop={(e) => handleDrop(e, currentDay, hour)}
                                              />
                                          ))}

                                          {!draggingEvent && (
                                              <div 
                                                  className="absolute inset-0 z-0"
                                                  onClick={(e) => {
                                                      const rect = e.currentTarget.getBoundingClientRect();
                                                      const y = e.clientY - rect.top + e.currentTarget.scrollTop;
                                                      const hourIndex = Math.floor(y / 60);
                                                      const hour = hours[0] + hourIndex;
                                                      const newDate = new Date(currentDay);
                                                      newDate.setHours(hour, 0, 0, 0);
                                                      setEventStart(`${hour.toString().padStart(2, '0')}:00`);
                                                      setEventEnd(`${(hour + 1).toString().padStart(2, '0')}:00`);
                                                      openNewEventModal(newDate);
                                                  }}
                                              />
                                          )}

                                          {dayEvents.map(ev => {
                                              const start = new Date(ev.start_time);
                                              const end = new Date(ev.end_time);
                                              const startHour = start.getHours() + start.getMinutes() / 60;
                                              const endHour = end.getHours() + end.getMinutes() / 60;
                                              const top = (startHour - 6) * 60;
                                              const height = Math.max((endHour - startHour) * 60, 24);

                                              if (top < 0) return null;

                                              return (
                                                  <div
                                                      key={ev.id}
                                                      draggable={ev.type === 'event'}
                                                      onDragStart={() => setDraggingEvent(ev)}
                                                      onClick={(e) => { e.stopPropagation(); openEditModal(ev); }}
                                                      className={cn(
                                                          "absolute left-1 right-1 rounded-2xl px-3 py-1.5 text-xs cursor-pointer transition-all shadow-sm z-10 overflow-hidden group hover:scale-[1.02] hover:shadow-md hover:z-20 border-l-4",
                                                          draggingEvent?.id === ev.id ? "opacity-50" : "",
                                                          ev.color === 'red' ? "bg-red-50 text-red-700 border-red-400 dark:bg-red-900/30 dark:text-red-200" :
                                                          ev.color === 'green' ? "bg-green-50 text-green-700 border-green-400 dark:bg-green-900/30 dark:text-green-200" :
                                                          ev.color === 'yellow' ? "bg-yellow-50 text-yellow-700 border-yellow-400 dark:bg-yellow-900/30 dark:text-yellow-200" :
                                                          ev.color === 'purple' ? "bg-purple-50 text-purple-700 border-purple-400 dark:bg-purple-900/30 dark:text-purple-200" :
                                                          "bg-blue-50 text-blue-700 border-blue-400 dark:bg-blue-900/30 dark:text-blue-200"
                                                      )}
                                                      style={{ top: `${top}px`, height: `${height}px` }}
                                                  >
                                                      <div className="font-semibold truncate">{ev.title}</div>
                                                      <div className="flex items-center gap-1 opacity-80 text-[10px] mt-0.5">
                                                          <Clock className="w-3 h-3" />
                                                          <span className="truncate">{format(start, 'HH:mm')} - {format(end, 'HH:mm')}</span>
                                                      </div>
                                                  </div>
                                              );
                                          })}
                                      </div>
                                  );
                              })}
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      );
  };

  return (
    <div className="space-y-6">
        {renderHeader()}
        {viewMode === 'month' ? (
            <>
                {renderDays()}
                {renderCells()}
            </>
        ) : (
            renderWeekView()
        )}

        <Modal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            title={editingEvent ? 'Termin Details' : `Termin am ${format(selectedDate, 'dd.MM.yyyy')}`}
        >
            <form onSubmit={handleCreateOrUpdateEvent} className="space-y-5">
                {editingEvent && editingEvent.profiles && (
                    <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl mb-4">
                        {editingEvent.profiles.avatar_url ? (
                            <img src={editingEvent.profiles.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover ring-2 ring-white dark:ring-gray-700" />
                        ) : (
                            <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-sm ring-2 ring-white dark:ring-gray-700">
                                {editingEvent.profiles.full_name?.substring(0, 2).toUpperCase()}
                            </div>
                        )}
                        <div>
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">Erstellt von</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{editingEvent.profiles.full_name || 'Unbekannt'}</p>
                        </div>
                    </div>
                )}
                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Titel</label>
                    <input
                        required
                        type="text"
                        value={eventTitle}
                        onChange={e => setEventTitle(e.target.value)}
                        className="w-full rounded-xl border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                        placeholder="Meeting, Deadline, etc."
                    />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Von</label>
                        <div className="relative">
                            <Clock className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                            <input
                                type="time"
                                value={eventStart}
                                onChange={e => setEventStart(e.target.value)}
                                className="w-full rounded-xl border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Bis</label>
                        <div className="relative">
                            <Clock className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                            <input
                                type="time"
                                value={eventEnd}
                                onChange={e => setEventEnd(e.target.value)}
                                className="w-full rounded-xl border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                            />
                        </div>
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Ort</label>
                    <div className="relative">
                        <MapPin className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            value={eventLocation}
                            onChange={e => setEventLocation(e.target.value)}
                            className="w-full rounded-xl border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                            placeholder="Konferenzraum, Online, etc."
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Beschreibung</label>
                    <div className="relative">
                        <AlignLeft className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                        <textarea
                            rows={3}
                            value={eventDesc}
                            onChange={e => setEventDesc(e.target.value)}
                            className="w-full rounded-xl border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all resize-none"
                            placeholder="Details zum Termin..."
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Kategorie</label>
                    <div className="flex gap-2 flex-wrap">
                        {CATEGORIES.map(cat => (
                            <button
                                key={cat.id}
                                type="button"
                                onClick={() => setEventColor(cat.id)}
                                className={cn(
                                    "px-4 py-2 rounded-xl border text-xs font-medium flex items-center gap-2 transition-all",
                                    eventColor === cat.id 
                                        ? `bg-white border-transparent ring-2 ring-${cat.color.split('-')[1]}-500 shadow-md transform scale-105` 
                                        : "bg-gray-50 dark:bg-gray-800 border-transparent hover:bg-gray-100"
                                )}
                            >
                                <span className={cn("w-2.5 h-2.5 rounded-full", cat.color)} />
                                {cat.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex justify-between mt-8 pt-4 border-t border-gray-100 dark:border-gray-800">
                    {editingEvent ? (
                        <button 
                            type="button" 
                            onClick={handleDeleteEvent} 
                            disabled={submitting}
                            className="px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                        >
                            Löschen
                        </button>
                    ) : <div />}
                    
                    <div className="flex gap-3">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">Abbrechen</button>
                        <button type="submit" disabled={submitting} className="px-6 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-lg shadow-indigo-500/30 transition-all hover:scale-105 active:scale-95">
                            {editingEvent ? 'Speichern' : 'Erstellen'}
                        </button>
                    </div>
                </div>
            </form>
        </Modal>
    </div>
  );
};
