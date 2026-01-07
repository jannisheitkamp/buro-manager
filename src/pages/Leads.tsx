import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, MoreHorizontal, ArrowRight, ArrowLeft, Trash2, DollarSign, User, FileText, CheckCircle2 } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { toast } from 'react-hot-toast';
import { cn } from '@/utils/cn';
import { format } from 'date-fns';

type Lead = {
    id: string;
    customer_name: string;
    status: 'new' | 'contacted' | 'proposal' | 'closed';
    value: number;
    notes: string;
    created_at: string;
};

const COLUMNS = [
    { id: 'new', label: 'Neu', color: 'bg-blue-50 text-blue-700 border-blue-200' },
    { id: 'contacted', label: 'Terminiert', color: 'bg-amber-50 text-amber-700 border-amber-200' },
    { id: 'proposal', label: 'Angebot', color: 'bg-purple-50 text-purple-700 border-purple-200' },
    { id: 'closed', label: 'Abschluss', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
];

export const Leads = () => {
    const { user } = useStore();
    const [leads, setLeads] = useState<Lead[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const [formData, setFormData] = useState({
        customer_name: '',
        value: '',
        notes: '',
        status: 'new'
    });

    const fetchLeads = async () => {
        const { data, error } = await supabase
            .from('leads')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) {
            console.error(error);
            toast.error('Fehler beim Laden');
        } else {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            setLeads(data as any || []);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchLeads();
        
        const sub = supabase.channel('leads')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, fetchLeads)
            .subscribe();
            
        return () => { sub.unsubscribe(); };
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        setSubmitting(true);

        try {
            const { error } = await supabase.from('leads').insert({
                user_id: user.id,
                customer_name: formData.customer_name,
                value: Number(formData.value) || 0,
                notes: formData.notes,
                status: formData.status
            });

            if (error) throw error;
            toast.success('Lead erstellt');
            setIsModalOpen(false);
            setFormData({ customer_name: '', value: '', notes: '', status: 'new' });
        } catch (error) {
            console.error(error);
            toast.error('Fehler beim Speichern');
        } finally {
            setSubmitting(false);
        }
    };

    const updateStatus = async (id: string, newStatus: string) => {
        const { error } = await supabase.from('leads').update({ status: newStatus }).eq('id', id);
        if (error) {
            toast.error('Fehler beim Verschieben');
        } else {
            // Optimistic update
            setLeads(leads.map(l => l.id === id ? { ...l, status: newStatus as any } : l));
        }
    };

    const deleteLead = async (id: string) => {
        if (!confirm('Lead wirklich löschen?')) return;
        const { error } = await supabase.from('leads').delete().eq('id', id);
        if (error) toast.error('Fehler beim Löschen');
        else toast.success('Lead gelöscht');
    };

    const getColumnLeads = (status: string) => leads.filter(l => l.status === status);

    const totalValue = leads.reduce((acc, curr) => acc + (curr.value || 0), 0);

    return (
        <div className="max-w-[1600px] mx-auto space-y-8 h-[calc(100vh-100px)] flex flex-col pb-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 flex-shrink-0">
                <div>
                    <motion.h1 
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="text-3xl font-black text-gray-900 dark:text-white flex items-center gap-3"
                    >
                        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                            <User className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                        </div>
                        Lead Pipeline
                    </motion.h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-2 ml-1">Verwalte deine offenen Verkaufschancen.</p>
                </div>

                <div className="flex items-center gap-4">
                    <div className="hidden md:block text-right mr-4">
                        <p className="text-xs font-bold text-gray-400 uppercase">Pipeline Wert</p>
                        <p className="text-2xl font-black text-gray-900 dark:text-white">
                            {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(totalValue)}
                        </p>
                    </div>
                    <motion.button
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        onClick={() => setIsModalOpen(true)}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-2xl flex items-center gap-2 shadow-lg shadow-blue-500/30 transition-all hover:scale-105"
                    >
                        <Plus className="w-5 h-5" /> Neuer Lead
                    </motion.button>
                </div>
            </div>

            {/* Kanban Board */}
            <div className="flex-1 overflow-x-auto overflow-y-hidden pb-4">
                <div className="flex gap-6 h-full min-w-[1000px] px-1">
                    {COLUMNS.map((col) => {
                        const colLeads = getColumnLeads(col.id);
                        const colValue = colLeads.reduce((acc, curr) => acc + (curr.value || 0), 0);

                        return (
                            <div key={col.id} className="flex-1 flex flex-col min-w-[280px] bg-gray-50/50 dark:bg-gray-800/20 rounded-3xl border border-gray-100 dark:border-gray-700/50 flex-shrink-0">
                                {/* Column Header */}
                                <div className={`p-4 rounded-t-3xl border-b border-gray-100 dark:border-gray-700/50 flex items-center justify-between ${col.color.split(' ')[0]} bg-opacity-50`}>
                                    <div>
                                        <h3 className={`font-bold ${col.color.split(' ')[1]}`}>{col.label}</h3>
                                        <p className="text-xs opacity-70 font-medium">{colLeads.length} Leads • {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(colValue)}</p>
                                    </div>
                                    <div className={`w-2 h-2 rounded-full ${col.color.replace('text', 'bg').split(' ')[1]}`} />
                                </div>

                                {/* Cards Container */}
                                <div className="p-3 flex-1 overflow-y-auto space-y-3 custom-scrollbar">
                                    <AnimatePresence>
                                        {colLeads.map((lead) => (
                                            <motion.div
                                                key={lead.id}
                                                layoutId={lead.id}
                                                initial={{ opacity: 0, y: 20 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, scale: 0.9 }}
                                                className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 group hover:shadow-md transition-all cursor-grab active:cursor-grabbing"
                                            >
                                                <div className="flex justify-between items-start mb-2">
                                                    <h4 className="font-bold text-gray-900 dark:text-white line-clamp-1">{lead.customer_name}</h4>
                                                    <button onClick={() => deleteLead(lead.id)} className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                                
                                                {lead.value > 0 && (
                                                    <div className="flex items-center gap-1 text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                                        <DollarSign className="w-3.5 h-3.5 text-gray-400" />
                                                        {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(lead.value)}
                                                    </div>
                                                )}
                                                
                                                {lead.notes && (
                                                    <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-3 bg-gray-50 dark:bg-gray-900/50 p-2 rounded-lg">
                                                        {lead.notes}
                                                    </p>
                                                )}

                                                <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-50 dark:border-gray-700">
                                                    <span className="text-[10px] text-gray-400">
                                                        {format(new Date(lead.created_at), 'dd.MM.')}
                                                    </span>
                                                    
                                                    <div className="flex gap-1">
                                                        {col.id !== 'new' && (
                                                            <button 
                                                                onClick={() => updateStatus(lead.id, COLUMNS[COLUMNS.findIndex(c => c.id === col.id) - 1].id)}
                                                                className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-400 transition-colors"
                                                                title="Zurück"
                                                            >
                                                                <ArrowLeft className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                        {col.id !== 'closed' && (
                                                            <button 
                                                                onClick={() => updateStatus(lead.id, COLUMNS[COLUMNS.findIndex(c => c.id === col.id) + 1].id)}
                                                                className="p-1.5 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg text-indigo-500 transition-colors"
                                                                title="Weiter"
                                                            >
                                                                <ArrowRight className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                        {col.id === 'closed' && (
                                                            <div className="p-1.5 text-emerald-500">
                                                                <CheckCircle2 className="w-4 h-4" />
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                    {colLeads.length === 0 && (
                                        <div className="h-24 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl flex items-center justify-center text-gray-400 text-sm">
                                            Leer
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title="Neuer Lead"
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Kunde / Name</label>
                        <input required type="text" value={formData.customer_name} onChange={e => setFormData({...formData, customer_name: e.target.value})} className="w-full rounded-xl border-gray-200 bg-gray-50 px-4 py-2" placeholder="Max Mustermann" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Geschätzter Wert (€)</label>
                        <input type="number" value={formData.value} onChange={e => setFormData({...formData, value: e.target.value})} className="w-full rounded-xl border-gray-200 bg-gray-50 px-4 py-2" placeholder="0.00" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Notizen</label>
                        <textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} className="w-full rounded-xl border-gray-200 bg-gray-50 px-4 py-2 h-24" placeholder="Interessiert an BU..." />
                    </div>
                    <div className="flex justify-end gap-2 pt-4">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded-xl">Abbrechen</button>
                        <button type="submit" disabled={submitting} className="px-6 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-500/30">Speichern</button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};
