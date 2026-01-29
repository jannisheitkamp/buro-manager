
import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Circle, Plus, ExternalLink, Loader2, AlertCircle, Calendar as CalendarIcon, Flag } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { cn } from '@/utils/cn';
import { format } from 'date-fns';
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
    url: string;
}

export const Todoist = () => {
    const { profile } = useStore();
    const [tasks, setTasks] = useState<TodoistTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [newTaskContent, setNewTaskContent] = useState('');
    const [isAdding, setIsAdding] = useState(false);

    useEffect(() => {
        if (profile?.todoist_api_key) {
            fetchTasks();
        } else {
            setLoading(false);
        }
    }, [profile]);

    const fetchTasks = async () => {
        if (!profile?.todoist_api_key) return;
        try {
            const res = await fetch('https://api.todoist.com/rest/v2/tasks', {
                headers: {
                    Authorization: `Bearer ${profile.todoist_api_key}`
                }
            });
            if (!res.ok) throw new Error('Failed to fetch');
            const data = await res.json();
            setTasks(data);
        } catch (error) {
            console.error(error);
            toast.error('Fehler beim Laden der Aufgaben');
        } finally {
            setLoading(false);
        }
    };

    const handleComplete = async (taskId: string) => {
        if (!profile?.todoist_api_key) return;
        
        // Optimistic update
        setTasks(prev => prev.filter(t => t.id !== taskId));
        toast.success('Aufgabe erledigt');

        try {
            const res = await fetch(`https://api.todoist.com/rest/v2/tasks/${taskId}/close`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${profile.todoist_api_key}`
                }
            });
            if (!res.ok) throw new Error('Failed to close');
        } catch (error) {
            console.error(error);
            toast.error('Fehler beim Abschließen');
            fetchTasks(); // Revert
        }
    };

    const handleAddTask = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTaskContent.trim() || !profile?.todoist_api_key) return;

        setIsAdding(true);
        try {
            const res = await fetch('https://api.todoist.com/rest/v2/tasks', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${profile.todoist_api_key}`
                },
                body: JSON.stringify({
                    content: newTaskContent
                })
            });
            
            if (!res.ok) throw new Error('Failed to create');
            
            const newTask = await res.json();
            setTasks(prev => [...prev, newTask]);
            setNewTaskContent('');
            toast.success('Aufgabe erstellt');
        } catch (error) {
            console.error(error);
            toast.error('Fehler beim Erstellen');
        } finally {
            setIsAdding(false);
        }
    };

    const getPriorityColor = (priority: number) => {
        switch (priority) {
            case 4: return 'text-red-500 bg-red-50 dark:bg-red-900/20';
            case 3: return 'text-orange-500 bg-orange-50 dark:bg-orange-900/20';
            case 2: return 'text-blue-500 bg-blue-50 dark:bg-blue-900/20';
            default: return 'text-gray-500 bg-gray-50 dark:bg-gray-800';
        }
    };

    if (!profile?.todoist_api_key) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
                <div className="bg-red-100 dark:bg-red-900/20 p-6 rounded-full mb-6">
                    <AlertCircle className="w-12 h-12 text-red-600 dark:text-red-400" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Kein API Key gefunden</h2>
                <p className="text-gray-500 dark:text-gray-400 max-w-md mb-8">
                    Bitte hinterlege deinen Todoist API Token in deinem Profil, um deine Aufgaben hier zu sehen.
                </p>
                <a 
                    href="/profile" 
                    className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-indigo-500/30 hover:bg-indigo-700 transition-all"
                >
                    Zum Profil
                </a>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto p-4 md:p-8">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 dark:text-white flex items-center gap-3">
                        <img src="https://upload.wikimedia.org/wikipedia/commons/6/6e/Todoist_Logo.svg" alt="Todoist" className="w-8 h-8" />
                        Meine Aufgaben
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-2 font-medium">
                        Synchronisiert mit deinem Todoist Konto.
                    </p>
                </div>
                <a 
                    href="https://todoist.com/app" 
                    target="_blank" 
                    rel="noreferrer"
                    className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-indigo-600 transition-colors"
                >
                    In Todoist öffnen <ExternalLink className="w-4 h-4" />
                </a>
            </div>

            {/* Add Task Input */}
            <form onSubmit={handleAddTask} className="mb-8 relative group">
                <input
                    type="text"
                    value={newTaskContent}
                    onChange={e => setNewTaskContent(e.target.value)}
                    placeholder="Neue Aufgabe hinzufügen..."
                    className="w-full bg-white dark:bg-gray-800 border-none rounded-2xl py-4 pl-12 pr-4 shadow-sm focus:ring-2 focus:ring-red-500/50 transition-all text-lg"
                />
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-red-500">
                    {isAdding ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                </div>
                <button 
                    type="submit"
                    disabled={!newTaskContent.trim() || isAdding}
                    className="absolute right-3 top-1/2 -translate-y-1/2 bg-red-500 text-white px-4 py-1.5 rounded-lg text-sm font-bold opacity-0 group-focus-within:opacity-100 transition-all disabled:opacity-0 hover:bg-red-600"
                >
                    Hinzufügen
                </button>
            </form>

            {/* Task List */}
            {loading ? (
                <div className="flex flex-col items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 text-red-500 animate-spin mb-4" />
                    <p className="text-gray-500">Lade Aufgaben...</p>
                </div>
            ) : tasks.length === 0 ? (
                <div className="text-center py-12 bg-white/50 dark:bg-gray-800/50 rounded-3xl border border-dashed border-gray-200 dark:border-gray-700">
                    <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">Alles erledigt!</h3>
                    <p className="text-gray-500">Du hast keine offenen Aufgaben.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    <AnimatePresence mode="popLayout">
                        {tasks.map((task) => (
                            <motion.div
                                key={task.id}
                                layout
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="group bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition-all flex items-start gap-4"
                            >
                                <button
                                    onClick={() => handleComplete(task.id)}
                                    className="mt-1 text-gray-400 hover:text-green-500 transition-colors"
                                >
                                    <Circle className="w-6 h-6" />
                                </button>
                                
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-4">
                                        <p className="text-gray-900 dark:text-white font-medium text-lg leading-snug">
                                            {task.content}
                                        </p>
                                        {task.priority > 1 && (
                                            <span className={cn(
                                                "shrink-0 px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1",
                                                getPriorityColor(task.priority)
                                            )}>
                                                <Flag className="w-3 h-3" /> P{5 - task.priority}
                                            </span>
                                        )}
                                    </div>
                                    
                                    {(task.description || task.due) && (
                                        <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-gray-500">
                                            {task.due && (
                                                <div className={cn(
                                                    "flex items-center gap-1.5",
                                                    new Date(task.due.date) < new Date() && "text-red-500 font-medium"
                                                )}>
                                                    <CalendarIcon className="w-3.5 h-3.5" />
                                                    {task.due.string || format(new Date(task.due.date), 'dd. MMM', { locale: de })}
                                                </div>
                                            )}
                                            {task.description && (
                                                <p className="line-clamp-1">{task.description}</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            )}
        </div>
    );
};
