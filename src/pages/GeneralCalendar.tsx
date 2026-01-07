import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { format, startOfWeek, addDays, startOfMonth, endOfMonth, endOfWeek, isSameMonth, isSameDay, addMonths, subMonths, isToday } from 'date-fns';
import { de } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus, Clock, MapPin, AlignLeft, Filter } from 'lucide-react';
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

    // 1. Calendar Events: Try with profiles first, fallback without if relationship error
    let calendarData;
    const { data: dataWithProfiles, error: calError } = await supabase
        .from('calendar_events')
        .select('*, profiles(full_name, avatar_url)')
        .lte('start_time', end)
        .gte('end_time', start);

    if (calError && calError.message.includes('relationship')) {
        console.warn('Relationship error, fetching without profiles:', calError);
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
        let d = new Date(a.start_date);
        const endDate = new Date(a.end_date);
        
        // Safety check
        if (d > endDate) return;

        // For week view, we might need to handle multi-day events differently,
        // but splitting them into daily chunks works for both views visually.
        while (d <= endDate) {
            allEvents.push({
                id: `${a.id}-${d.toISOString()}`,
                title: `Urlaub: ${a.profiles?.full_name}`,
                start_time: d.toISOString(),
                end_time: d.toISOString(), // Full day
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
        // Combine selectedDate with time
        const startDateTime = new Date(selectedDate);
        const [sh, sm] = eventStart.split(':').map(Number);
        startDateTime.setHours(sh, sm);

        const endDateTime = new Date(selectedDate);
        const [eh, em] = eventEnd.split(':').map(Number);
        endDateTime.setHours(eh, em);

        if (editingEvent) {
            // UPDATE
            const { error } = await supabase.from('calendar_events').update({
                title: eventTitle,
                description: eventDesc,
                start_time: startDateTime.toISOString(),
                end_time: endDateTime.toISOString(),
                location: eventLocation,
                color: eventColor,
            }).eq('id', editingEvent.id);

            if (error) throw error;
            toast.success('Termin aktualisiert!');
        } else {
            // CREATE
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
      if (!confirm('Termin wirklich löschen?')) return;
      
      setSubmitting(true);
      try {
          const { error } = await supabase.from('calendar_events').delete().eq('id', editingEvent.id);
          if (error) throw error;
          toast.success('Termin gelöscht');
          setIsModalOpen(false);
          setEditingEvent(null);
          resetForm();
          fetchEvents();
      } catch (error) {
          console.error(error);
          toast.error('Fehler beim Löschen');
      } finally {
          setSubmitting(false);
      }
  };

  const handleDrop = async (e: React.DragEvent, day: Date, hour: number) => {
      e.preventDefault();
      if (!draggingEvent || !user) return;

      // Calculate new times
      const durationMs = new Date(draggingEvent.end_time).getTime() - new Date(draggingEvent.start_time).getTime();
      const newStart = new Date(day);
      newStart.setHours(hour, 0, 0, 0);
      
      const newEnd = new Date(newStart.getTime() + durationMs);

      // Optimistic update
      const updatedEvent = { ...draggingEvent, start_time: newStart.toISOString(), end_time: newEnd.toISOString() };
      setEvents(prev => prev.map(ev => ev.id === draggingEvent.id ? updatedEvent : ev));
      setDraggingEvent(null);

      try {
          const { error } = await supabase.from('calendar_events').update({
              start_time: newStart.toISOString(),
              end_time: newEnd.toISOString()
          }).eq('id', draggingEvent.id);

          if (error) throw error;
          toast.success('Termin verschoben');
      } catch (error) {
          console.error(error);
          toast.error('Fehler beim Verschieben');
          fetchEvents(); // Revert
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
      if (event.type !== 'event') return; // Only edit own calendar events
      
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
          prev.includes(color) 
              ? prev.filter(c => c !== color) 
              : [...prev, color]
      );
  };

  const CATEGORIES = [
      { id: 'blue', label: 'Allgemein', color: 'bg-blue-500' },
      { id: 'green', label: 'Urlaub', color: 'bg-green-500' },
      { id: 'yellow', label: 'Meeting', color: 'bg-yellow-500' },
      { id: 'red', label: 'Wichtig', color: 'bg-red-500' },
      { id: 'purple', label: 'Extern', color: 'bg-purple-500' },
  ];

  const renderHeader = () => {
    return (
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
                <div className="flex items-center justify-between w-full sm:w-auto gap-4">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white capitalize min-w-[140px] md:min-w-[200px]">
                        {viewMode === 'month' 
                            ? format(currentDate, 'MMMM yyyy', { locale: de })
                            : `KW ${format(currentDate, 'w')}`
                        }
                    </h2>
                    <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1 shrink-0">
                        <button onClick={() => {
                            if (viewMode === 'month') setCurrentDate(subMonths(currentDate, 1));
                            else setCurrentDate(addDays(currentDate, -7));
                        }} className="p-1 hover:bg-white dark:hover:bg-gray-700 rounded-md transition-colors"><ChevronLeft className="w-5 h-5" /></button>
                        <button onClick={() => setCurrentDate(new Date())} className="px-3 text-sm font-medium hover:bg-white dark:hover:bg-gray-700 rounded-md transition-colors">Heute</button>
                        <button onClick={() => {
                            if (viewMode === 'month') setCurrentDate(addMonths(currentDate, 1));
                            else setCurrentDate(addDays(currentDate, 7));
                        }} className="p-1 hover:bg-white dark:hover:bg-gray-700 rounded-md transition-colors"><ChevronRight className="w-5 h-5" /></button>
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-between sm:justify-end gap-2 w-full md:w-auto">
                <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                    <button 
                        onClick={() => setViewMode('month')}
                        className={cn(
                            "px-3 py-1 text-sm font-medium rounded-md transition-all",
                            viewMode === 'month' ? "bg-white dark:bg-gray-700 shadow-sm text-indigo-600 dark:text-indigo-400" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                        )}
                    >
                        Monat
                    </button>
                    <button 
                        onClick={() => setViewMode('week')}
                        className={cn(
                            "px-3 py-1 text-sm font-medium rounded-md transition-all",
                            viewMode === 'week' ? "bg-white dark:bg-gray-700 shadow-sm text-indigo-600 dark:text-indigo-400" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                        )}
                    >
                        Woche
                    </button>
                </div>

                <button
                    onClick={() => openNewEventModal(new Date())}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm transition-colors shrink-0"
                >
                    <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Termin</span>
                </button>
            </div>
        </div>

        {/* Filter Bar - Horizontal Scroll on Mobile */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap md:pb-0 hide-scrollbar">
            <Filter className="w-4 h-4 text-gray-400 shrink-0" />
            {CATEGORIES.map(cat => (
                <button
                    key={cat.id}
                    onClick={() => toggleFilter(cat.id)}
                    className={cn(
                        "px-3 py-1 rounded-full text-xs font-medium flex items-center gap-2 transition-all border shrink-0 whitespace-nowrap",
                        activeFilters.includes(cat.id) 
                            ? "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-sm opacity-100"
                            : "bg-transparent border-transparent opacity-50 hover:opacity-70"
                    )}
                >
                    <span className={cn("w-2 h-2 rounded-full", cat.color)} />
                    {cat.label}
                </button>
            ))}
        </div>
      </div>
    );
  };

  const renderDays = () => {
    const days = [];
    const dateFormat = "EEE";
    const startDate = startOfWeek(currentDate, { weekStartsOn: 1 });

    for (let i = 0; i < 7; i++) {
      days.push(
        <div key={i} className="text-center text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400 py-2">
          {format(addDays(startDate, i), dateFormat, { locale: de })}
        </div>
      );
    }
    return <div className="grid grid-cols-7 mb-2 border-b border-gray-100 dark:border-gray-800 pb-2">{days}</div>;
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
                "min-h-[80px] sm:min-h-[100px] border-r border-b border-gray-100 dark:border-gray-700/50 p-1 sm:p-2 transition-colors relative group",
                !isSameMonth(day, monthStart) ? "bg-gray-50/50 dark:bg-gray-800/30 text-gray-400" : "bg-white dark:bg-gray-800",
                isSameDay(day, selectedDate) ? "ring-2 ring-inset ring-indigo-500 z-10" : "",
                isToday(day) ? "bg-indigo-50/30 dark:bg-indigo-900/10" : ""
            )}
            onClick={() => setSelectedDate(cloneDay)}
          >
            <span className={cn(
                "text-xs sm:text-sm font-medium w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded-full mb-1",
                isToday(day) ? "bg-indigo-600 text-white" : "text-gray-700 dark:text-gray-300"
            )}>
                {formattedDate}
            </span>
            
            <div className="space-y-1">
                {dayEvents.slice(0, 4).map(ev => (
                    <div 
                        key={ev.id} 
                        className={cn(
                            "text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.5 rounded truncate border-l-2 cursor-pointer hover:opacity-80 flex items-center gap-1",
                            ev.color === 'red' ? "bg-red-100 text-red-700 border-red-500 dark:bg-red-900/30 dark:text-red-200" :
                            ev.color === 'green' ? "bg-green-100 text-green-700 border-green-500 dark:bg-green-900/30 dark:text-green-200" :
                            ev.color === 'yellow' ? "bg-yellow-100 text-yellow-700 border-yellow-500 dark:bg-yellow-900/30 dark:text-yellow-200" :
                            ev.color === 'purple' ? "bg-purple-100 text-purple-700 border-purple-500 dark:bg-purple-900/30 dark:text-purple-200" :
                            "bg-blue-100 text-blue-700 border-blue-500 dark:bg-blue-900/30 dark:text-blue-200"
                        )}
                        title={ev.title}
                        onClick={(e) => { e.stopPropagation(); openEditModal(ev); }}
                    >
                        <span className="truncate">{ev.title}</span>
                    </div>
                ))}
                {dayEvents.length > 4 && (
                    <div className="text-[10px] text-gray-400 pl-1">+ {dayEvents.length - 4} weitere</div>
                )}
            </div>
            
            {/* Quick add button on hover (desktop only) */}
            <button 
                onClick={(e) => { e.stopPropagation(); openNewEventModal(cloneDay); }}
                className="hidden sm:block absolute bottom-1 right-1 p-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 opacity-0 group-hover:opacity-100 transition-all"
            >
                <Plus className="w-3 h-3" />
            </button>
          </div>
        );
        day = addDays(day, 1);
      }
      rows.push(
        <div key={day.toString()} className="grid grid-cols-7 border-l border-t border-gray-100 dark:border-gray-700/50">
          {days}
        </div>
      );
      days = [];
    }
    return <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">{rows}</div>;
  };

  const renderWeekView = () => {
      const startDate = startOfWeek(currentDate, { weekStartsOn: 1 });
      const days = [];
      
      // Header: Mon 06, Tue 07, ...
      for (let i = 0; i < 7; i++) {
          const d = addDays(startDate, i);
          days.push(
              <div key={i} className={cn(
                  "flex-1 text-center py-3 border-b border-r border-gray-200 dark:border-gray-700 last:border-r-0 min-w-[100px]",
                  isToday(d) ? "bg-indigo-50/50 dark:bg-indigo-900/20" : ""
              )}>
                  <div className="text-xs text-gray-500 uppercase font-semibold">{format(d, 'EEE', { locale: de })}</div>
                  <div className={cn(
                      "text-xl font-bold mt-1 w-8 h-8 flex items-center justify-center rounded-full mx-auto",
                      isToday(d) ? "bg-indigo-600 text-white" : "text-gray-900 dark:text-white"
                  )}>
                      {format(d, 'd')}
                  </div>
              </div>
          );
      }

      // Time Grid
      const hours = Array.from({ length: 16 }, (_, i) => i + 6); // 06:00 to 21:00
      
      return (
          <div className="flex flex-col h-[calc(100vh-250px)] overflow-hidden border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900">
              {/* Scrollable Container for both Header and Body (Mobile Horizontal Scroll) */}
              <div className="overflow-x-auto flex-1 flex flex-col custom-scrollbar">
                  <div className="min-w-[800px] flex flex-col flex-1">
                      
                      {/* Header Row */}
                      <div className="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 sticky top-0 z-30">
                          <div className="w-16 border-r border-gray-200 dark:border-gray-700 flex-shrink-0"></div>
                          {days}
                      </div>

                      {/* Content */}
                      <div className="flex-1 relative">
                          <div className="flex relative min-h-[960px]"> {/* 16 hours * 60px height */}
                              {/* Time Column */}
                              <div className="w-16 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 z-20 sticky left-0">
                                  {hours.map(hour => (
                                      <div key={hour} className="h-[60px] text-xs text-gray-400 text-right pr-2 pt-2 border-b border-gray-100 dark:border-gray-800">
                                          {hour}:00
                                      </div>
                                  ))}
                              </div>

                              {/* Day Columns */}
                              {Array.from({ length: 7 }).map((_, dayIdx) => {
                                  const currentDay = addDays(startDate, dayIdx);
                                  const dayEvents = events.filter(e => isSameDay(new Date(e.start_time), currentDay));

                                  return (
                                      <div key={dayIdx} className="flex-1 border-r border-gray-100 dark:border-gray-800 last:border-r-0 relative group min-w-[100px]">
                                          {/* Grid Lines (Drop Zones) */}
                                          {hours.map(hour => (
                                              <div 
                                                  key={hour} 
                                                  className="h-[60px] border-b border-gray-50 dark:border-gray-800/50 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
                                                  onDragOver={(e) => e.preventDefault()}
                                                  onDrop={(e) => handleDrop(e, currentDay, hour)}
                                              />
                                          ))}

                                          {/* Click to add event (overlay) - only if NOT dragging */}
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
                                                      
                                                      // Update default time in form
                                                      setEventStart(`${hour.toString().padStart(2, '0')}:00`);
                                                      setEventEnd(`${(hour + 1).toString().padStart(2, '0')}:00`);
                                                      openNewEventModal(newDate);
                                                  }}
                                              />
                                          )}

                                          {/* Events */}
                                          {dayEvents.map(ev => {
                                              const start = new Date(ev.start_time);
                                              const end = new Date(ev.end_time);
                                              const startHour = start.getHours() + start.getMinutes() / 60;
                                              const endHour = end.getHours() + end.getMinutes() / 60;
                                              
                                              // Calculate position relative to start of grid (06:00)
                                              const top = (startHour - 6) * 60;
                                              const height = Math.max((endHour - startHour) * 60, 20); // Min height 20px

                                              if (top < 0) return null; // Skip events before 6am for now

                                              return (
                                                  <div
                                                      key={ev.id}
                                                      draggable={ev.type === 'event'}
                                                      onDragStart={() => setDraggingEvent(ev)}
                                                      onClick={(e) => { e.stopPropagation(); openEditModal(ev); }}
                                                      className={cn(
                                                          "absolute left-1 right-1 rounded px-2 py-1 text-xs border-l-4 cursor-pointer hover:brightness-95 hover:scale-[1.02] transition-all shadow-sm z-10 overflow-hidden",
                                                          draggingEvent?.id === ev.id ? "opacity-50" : "",
                                                          ev.color === 'red' ? "bg-red-100 text-red-700 border-red-500 dark:bg-red-900/40 dark:text-red-100" :
                                                          ev.color === 'green' ? "bg-green-100 text-green-700 border-green-500 dark:bg-green-900/40 dark:text-green-100" :
                                                          ev.color === 'yellow' ? "bg-yellow-100 text-yellow-700 border-yellow-500 dark:bg-yellow-900/40 dark:text-yellow-100" :
                                                          ev.color === 'purple' ? "bg-purple-100 text-purple-700 border-purple-500 dark:bg-purple-900/40 dark:text-purple-100" :
                                                          "bg-blue-100 text-blue-700 border-blue-500 dark:bg-blue-900/40 dark:text-blue-100"
                                                      )}
                                                      style={{ top: `${top}px`, height: `${height}px` }}
                                                      title={`${ev.title} (${format(start, 'HH:mm')} - ${format(end, 'HH:mm')})`}
                                                  >
                                                      <div className="font-semibold truncate">{ev.title}</div>
                                                      <div className="opacity-80 truncate text-[10px]">
                                                          {format(start, 'HH:mm')} - {format(end, 'HH:mm')}
                                                      </div>
                                                      {ev.location && <div className="truncate opacity-70 text-[10px] mt-0.5 hidden sm:block">{ev.location}</div>}
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
    <div className="space-y-4 sm:space-y-6">
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
            <form onSubmit={handleCreateOrUpdateEvent} className="space-y-4">
                {editingEvent && editingEvent.profiles && (
                    <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg mb-4">
                        {editingEvent.profiles.avatar_url ? (
                            <img src={editingEvent.profiles.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                        ) : (
                            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xs">
                                {editingEvent.profiles.full_name?.substring(0, 2).toUpperCase()}
                            </div>
                        )}
                        <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">Erstellt von</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{editingEvent.profiles.full_name || 'Unbekannt'}</p>
                        </div>
                    </div>
                )}
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
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Kategorie</label>
                    <div className="flex gap-3 flex-wrap">
                        {CATEGORIES.map(cat => (
                            <button
                                key={cat.id}
                                type="button"
                                onClick={() => setEventColor(cat.id)}
                                className={cn(
                                    "px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-2 transition-all",
                                    eventColor === cat.id 
                                        ? "bg-indigo-50 border-indigo-500 ring-1 ring-indigo-500 dark:bg-indigo-900/30 dark:border-indigo-400" 
                                        : "bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600"
                                )}
                            >
                                <span className={cn("w-2 h-2 rounded-full", cat.color)} />
                                {cat.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex justify-between mt-6">
                    {editingEvent ? (
                        <button 
                            type="button" 
                            onClick={handleDeleteEvent} 
                            disabled={submitting}
                            className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md border border-red-200 transition-colors"
                        >
                            Löschen
                        </button>
                    ) : <div />}
                    
                    <div className="flex gap-3">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-md transition-colors">Abbrechen</button>
                        <button type="submit" disabled={submitting} className="px-4 py-2 text-sm text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition-colors">
                            {editingEvent ? 'Speichern' : 'Erstellen'}
                        </button>
                    </div>
                </div>
            </form>
        </Modal>
    </div>
  );
};
