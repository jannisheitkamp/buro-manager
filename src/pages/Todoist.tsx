
import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    CheckCircle2, 
    Circle, 
    Plus, 
    Loader2, 
    AlertCircle, 
    Calendar as CalendarIcon, 
    Inbox,
    CalendarDays,
    Hash,
    ChevronDown,
    ChevronRight,
    Menu
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { cn } from '@/utils/cn';
import { format, isToday, isTomorrow, isPast, isSameDay, addDays, startOfDay } from 'date-fns';
import { de } from 'date-fns/locale';

interface TodoistTask {
    id: string;
    content: string;
    description: string;
    is_completed: boolean;
    due?: {
        date: string;
        string: string;
        lang: string;
        is_recurring: boolean;
    };
    priority: number; // 4 = high (red), 1 = normal (grey)
    project_id: string;
    url: string;
}

interface TodoistProject {
    id: string;
    name: string;
    color: string;
    is_favorite: boolean;
    view_style: 'list' | 'board';
}

type ViewType = 'inbox' | 'today' | 'upcoming' | string; // string = project_id

export const Todoist = () => {
    const { profile } = useStore();
    const [tasks, setTasks] = useState<TodoistTask[]>([]);
    const [projects, setProjects] = useState<TodoistProject[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentView, setCurrentView] = useState<ViewType>('inbox');
    const [newTaskContent, setNewTaskContent] = useState('');
    const [newTaskDescription, setNewTaskDescription] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [projectsExpanded, setProjectsExpanded] = useState(true);

    useEffect(() => {
        if (profile?.todoist_api_key) {
            Promise.all([fetchTasks(), fetchProjects()]).finally(() => setLoading(false));
        } else {
            setLoading(false);
        }
    }, [profile, currentView]);

    const fetchProjects = async () => {
        if (!profile?.todoist_api_key) return;
        try {
            const res = await fetch('https://api.todoist.com/rest/v2/projects', {
                headers: { Authorization: `Bearer ${profile.todoist_api_key}` }
            });
            if (res.ok) setProjects(await res.json());
        } catch (e) {
            console.error(e);
        }
    };

    const fetchTasks = async () => {
        if (!profile?.todoist_api_key) return;
        setLoading(true);
        try {
            let url = 'https://api.todoist.com/rest/v2/tasks';
            
            if (currentView === 'today') {
                url += '?filter=today|overdue';
            } else if (currentView === 'upcoming') {
                url += '?filter=today|overdue|next 7 days';
            } else if (currentView === 'inbox') {
                // For inbox, we want tasks without a project (or in inbox project)
                // Actually, best is to get project_id for inbox first, or filter by project_id in client
                // But Todoist API allows filtering by project_id directly
                // We need to find the Inbox project ID first usually, or use filter '#Inbox'
                url += '?filter=%23Inbox'; // URL encoded #Inbox
            } else {
                url += `?project_id=${currentView}`;
            }

            const res = await fetch(url, {
                headers: { Authorization: `Bearer ${profile.todoist_api_key}` }
            });
            
            if (!res.ok) throw new Error('Failed to fetch');
            const data = await res.json();
            
            // Sort by due date, then priority
            const sorted = data.sort((a: TodoistTask, b: TodoistTask) => {
                // First due date
                if (a.due?.date && b.due?.date) return new Date(a.due.date).getTime() - new Date(b.due.date).getTime();
                if (a.due?.date) return -1;
                if (b.due?.date) return 1;
                // Then priority (descending)
                return b.priority - a.priority;
            });
            
            setTasks(sorted);
        } catch (error) {
            console.error(error);
            toast.error('Fehler beim Laden der Aufgaben');
        } finally {
            setLoading(false);
        }
    };

    const handleComplete = async (taskId: string) => {
        if (!profile?.todoist_api_key) return;
        
        const taskToComplete = tasks.find(t => t.id === taskId);
        setTasks(prev => prev.filter(t => t.id !== taskId));
        toast.success('Aufgabe erledigt');

        try {
            await fetch(`https://api.todoist.com/rest/v2/tasks/${taskId}/close`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${profile.todoist_api_key}` }
            });
        } catch (error) {
            console.error(error);
            toast.error('Fehler beim Abschließen');
            if (taskToComplete) setTasks(prev => [...prev, taskToComplete]);
        }
    };

    const handleAddTask = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTaskContent.trim() || !profile?.todoist_api_key) return;

        setIsAdding(true);
        try {
            const payload: any = { 
                content: newTaskContent,
                description: newTaskDescription 
            };
            
            // Smart date parsing logic
            const contentLower = newTaskContent.toLowerCase();
            
            // Default due string based on view
            if (currentView === 'today') {
                payload.due_string = 'today';
            }

            // Keyword detection
            if (contentLower.includes('heute')) {
                payload.due_string = 'today';
                payload.content = payload.content.replace(/(^|\s)heute(\s|$)/i, ' ').trim();
            } else if (contentLower.includes('morgen')) {
                payload.due_string = 'tomorrow';
                payload.content = payload.content.replace(/(^|\s)morgen(\s|$)/i, ' ').trim();
            } else if (contentLower.includes('übermorgen')) {
                payload.due_string = 'in 2 days';
                payload.content = payload.content.replace(/(^|\s)übermorgen(\s|$)/i, ' ').trim();
            } else if (contentLower.includes('nächste woche')) {
                payload.due_string = 'next monday';
                payload.content = payload.content.replace(/(^|\s)nächste woche(\s|$)/i, ' ').trim();
            } else if (contentLower.includes('wochenende')) {
                payload.due_string = 'next saturday';
                payload.content = payload.content.replace(/(^|\s)wochenende(\s|$)/i, ' ').trim();
            } else {
                 // Try to find specific date formats (dd.mm or dd.mm.yyyy)
                 const dateMatch = payload.content.match(/(\d{1,2}\.\d{1,2}(\.\d{4})?)/);
                 if (dateMatch) {
                     payload.due_string = dateMatch[0];
                     payload.content = payload.content.replace(dateMatch[0], '').trim();
                 }
                 
                 // Try to find time formats (HH:MM)
                 const timeMatch = payload.content.match(/(\d{1,2}:\d{2})/);
                 if (timeMatch) {
                     // If we already have a due_string, append time, otherwise just set time (which defaults to today)
                     payload.due_string = payload.due_string ? `${payload.due_string} at ${timeMatch[0]}` : `today at ${timeMatch[0]}`;
                     payload.content = payload.content.replace(timeMatch[0], '').trim();
                 }
            }

            // Project context
            if (currentView !== 'inbox' && currentView !== 'today' && currentView !== 'upcoming') {
                payload.project_id = currentView;
            }

            const res = await fetch('https://api.todoist.com/rest/v2/tasks', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${profile.todoist_api_key}`
                },
                body: JSON.stringify(payload)
            });
            
            if (!res.ok) throw new Error('Failed to create');
            
            const newTask = await res.json();
            setTasks(prev => [...prev, newTask]);
            setNewTaskContent('');
            setNewTaskDescription('');
            toast.success('Aufgabe erstellt');
            
            // If view is today/upcoming and task has date, re-fetch or add to list
            // Current optimistic update just adds to list, which is fine
        } catch (error) {
            console.error(error);
            toast.error('Fehler beim Erstellen');
        } finally {
            setIsAdding(false);
        }
    };

    // Helper to get priority color ring
    const getPriorityStyle = (priority: number) => {
        switch (priority) {
            case 4: return 'border-red-500 text-red-500 bg-red-50 dark:bg-red-900/20';
            case 3: return 'border-orange-500 text-orange-500 bg-orange-50 dark:bg-orange-900/20';
            case 2: return 'border-blue-500 text-blue-500 bg-blue-50 dark:bg-blue-900/20';
            default: return 'border-gray-300 text-gray-500 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700';
        }
    };

    // Group tasks for "Upcoming" view
    const getGroupedTasks = () => {
        if (currentView !== 'upcoming') return { 'all': tasks };

        const groups: Record<string, TodoistTask[]> = {};
        
        tasks.forEach(task => {
            let key = 'No Date';
            if (task.due?.date) {
                const date = new Date(task.due.date);
                if (isToday(date)) key = 'Heute';
                else if (isTomorrow(date)) key = 'Morgen';
                else if (isPast(date) && !isToday(date)) key = 'Überfällig';
                else key = format(date, 'EEEE, d. MMM', { locale: de });
            }
            if (!groups[key]) groups[key] = [];
            groups[key].push(task);
        });

        // Sort keys: Overdue first, then Today, Tomorrow, then dates
        // This is a simple implementation, ideally we sort by date value
        return groups;
    };

    const groupedTasks = getGroupedTasks();
    const sortedGroupKeys = Object.keys(groupedTasks).sort((a, b) => {
        if (a === 'Überfällig') return -1;
        if (b === 'Überfällig') return 1;
        if (a === 'Heute') return -1;
        if (b === 'Heute') return 1;
        if (a === 'Morgen') return -1;
        if (b === 'Morgen') return 1;
        return 0; // Keep insertion order for others (roughly sorted by API)
    });

    if (!profile?.todoist_api_key) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
                <div className="bg-red-100 dark:bg-red-900/20 p-6 rounded-full mb-6">
                    <AlertCircle className="w-12 h-12 text-red-600 dark:text-red-400" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Kein API Key gefunden</h2>
                <p className="text-gray-500 dark:text-gray-400 max-w-md mb-8">
                    Bitte hinterlege deinen Todoist API Token in deinem Profil.
                </p>
                <a href="/profile" className="bg-red-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-red-700 transition-all">
                    Zum Profil
                </a>
            </div>
        );
    }

    return (
        <div className="flex h-[calc(100vh-4rem)] -m-4 md:-m-8 lg:-m-12">
            {/* Sidebar */}
            <div className={cn(
                "w-64 bg-gray-50/50 dark:bg-gray-900/50 border-r border-gray-200 dark:border-gray-800 flex-shrink-0 transition-all duration-300 overflow-y-auto",
                !isSidebarOpen && "-ml-64"
            )}>
                <div className="p-4 space-y-1">
                    <button 
                        onClick={() => setCurrentView('inbox')}
                        className={cn(
                            "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                            currentView === 'inbox' ? "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400" : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                        )}
                    >
                        <Inbox className="w-5 h-5" /> Eingang
                    </button>
                    <button 
                        onClick={() => setCurrentView('today')}
                        className={cn(
                            "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                            currentView === 'today' ? "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400" : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                        )}
                    >
                        <CalendarIcon className="w-5 h-5" /> Heute
                    </button>
                    <button 
                        onClick={() => setCurrentView('upcoming')}
                        className={cn(
                            "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                            currentView === 'upcoming' ? "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400" : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                        )}
                    >
                        <CalendarDays className="w-5 h-5" /> Demnächst
                    </button>
                </div>

                <div className="mt-4 px-4">
                    <button 
                        onClick={() => setProjectsExpanded(!projectsExpanded)}
                        className="flex items-center justify-between w-full text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 hover:text-gray-700"
                    >
                        Projekte
                        {projectsExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                    
                    <AnimatePresence>
                        {projectsExpanded && (
                            <motion.div 
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="space-y-0.5"
                            >
                                {projects.map(p => (
                                    <button
                                        key={p.id}
                                        onClick={() => setCurrentView(p.id)}
                                        className={cn(
                                            "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors truncate",
                                            currentView === p.id ? "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400" : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                                        )}
                                    >
                                        <Hash className="w-4 h-4 opacity-50 flex-shrink-0" />
                                        <span className="truncate">{p.name}</span>
                                    </button>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-gray-900">
                <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-4 sticky top-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md z-10">
                    <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
                        <Menu className="w-5 h-5 text-gray-500" />
                    </button>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                        {currentView === 'today' ? 'Heute' : 
                         currentView === 'upcoming' ? 'Demnächst' : 
                         currentView === 'inbox' ? 'Eingang' : 
                         projects.find(p => p.id === currentView)?.name || 'Aufgaben'}
                    </h2>
                </div>

                <div className="flex-1 overflow-y-auto p-4 md:p-8 max-w-4xl mx-auto w-full">
                    {/* Add Task */}
                    <form onSubmit={handleAddTask} className={cn(
                        "mb-6 transition-all border rounded-xl p-0 overflow-hidden",
                        newTaskContent ? "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-sm ring-1 ring-gray-200 dark:ring-gray-700" : "border-transparent"
                    )}>
                        <div className="relative p-3">
                            <div className="flex items-start gap-3">
                                <Plus className={cn("w-5 h-5 text-red-500 mt-1 transition-all duration-200", newTaskContent ? "opacity-0 w-0 -ml-2" : "opacity-100")} />
                                <div className="flex-1 space-y-2">
                                    <input
                                        type="text"
                                        value={newTaskContent}
                                        onChange={e => setNewTaskContent(e.target.value)}
                                        placeholder="Aufgabe hinzufügen"
                                        className={cn(
                                            "w-full bg-transparent border-none p-0 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-0 transition-all",
                                            newTaskContent ? "font-bold text-base" : "text-base"
                                        )}
                                    />
                                    {newTaskContent && (
                                        <textarea
                                            value={newTaskDescription}
                                            onChange={e => setNewTaskDescription(e.target.value)}
                                            placeholder="Beschreibung"
                                            rows={2}
                                            className="w-full bg-transparent border-none p-0 text-sm text-gray-500 dark:text-gray-400 placeholder-gray-400 focus:ring-0 resize-none animate-in fade-in slide-in-from-top-1"
                                        />
                                    )}
                                </div>
                            </div>
                        </div>
                        
                        {newTaskContent && (
                            <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-2 animate-in fade-in">
                                <button 
                                    type="button" 
                                    onClick={() => { setNewTaskContent(''); setNewTaskDescription(''); }}
                                    className="px-3 py-1.5 text-sm font-bold text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                >
                                    Abbrechen
                                </button>
                                <button 
                                    type="submit" 
                                    disabled={isAdding}
                                    className="px-3 py-1.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50 transition-colors shadow-sm"
                                >
                                    Aufgabe hinzufügen
                                </button>
                            </div>
                        )}
                    </form>

                    {/* Tasks */}
                    {loading ? (
                        <div className="flex justify-center py-12">
                            <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
                        </div>
                    ) : tasks.length === 0 ? (
                        <div className="text-center py-12">
                            <img src="https://todoist.b-cdn.net/assets/images/416fb2246b976451e1f74378f457788e.png" alt="Empty" className="w-48 mx-auto mb-4 opacity-80" />
                            <p className="text-gray-500">Alles erledigt! Genieß deinen Tag.</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {currentView === 'upcoming' ? (
                                sortedGroupKeys.map(group => (
                                    <div key={group}>
                                        <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-2 pb-1 border-b border-gray-100 dark:border-gray-800 sticky top-0 bg-white dark:bg-gray-900 py-2 z-10">
                                            {group} <span className="text-gray-400 font-normal ml-1">{groupedTasks[group].length}</span>
                                        </h3>
                                        <div className="space-y-1">
                                            {groupedTasks[group].map(task => (
                                                <TaskItem key={task.id} task={task} onComplete={handleComplete} />
                                            ))}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="space-y-1">
                                    {tasks.map(task => (
                                        <TaskItem key={task.id} task={task} onComplete={handleComplete} />
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const TaskItem = ({ task, onComplete }: { task: TodoistTask; onComplete: (id: string) => void }) => {
    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="group flex items-start gap-3 py-2 border-b border-gray-50 dark:border-gray-800/50 last:border-0 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 rounded-lg px-2 -mx-2 transition-colors"
        >
            <button
                onClick={() => onComplete(task.id)}
                className={cn(
                    "mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all flex-shrink-0",
                    task.priority === 4 ? "border-red-500 hover:bg-red-50" :
                    task.priority === 3 ? "border-orange-500 hover:bg-orange-50" :
                    task.priority === 2 ? "border-blue-500 hover:bg-blue-50" :
                    "border-gray-300 hover:bg-gray-100 dark:border-gray-500"
                )}
            >
                <span className="sr-only">Complete</span>
            </button>
            
            <div className="flex-1 min-w-0">
                <div className="text-sm text-gray-800 dark:text-gray-200 leading-snug break-words">
                    {task.content}
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                    {task.description && (
                        <span className="text-xs text-gray-500 line-clamp-1">{task.description}</span>
                    )}
                    {task.due && (
                        <span className={cn(
                            "text-xs flex items-center gap-1",
                            new Date(task.due.date) < new Date() && !isToday(new Date(task.due.date)) ? "text-red-500" : 
                            isToday(new Date(task.due.date)) ? "text-green-600" : "text-gray-400"
                        )}>
                            <CalendarIcon className="w-3 h-3" />
                            {task.due.string || format(new Date(task.due.date), 'dd. MMM', { locale: de })}
                        </span>
                    )}
                </div>
            </div>
        </motion.div>
    );
};
