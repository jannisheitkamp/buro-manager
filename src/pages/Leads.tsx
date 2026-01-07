import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, ArrowRight, ArrowLeft, Trash2, User, Phone, Mail, Clock, Box, FileInput, CheckCircle2, Archive } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { toast } from 'react-hot-toast';
import { cn } from '@/utils/cn';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';

type Lead = {
    id: string;
    customer_name: string;
    phone?: string;
    email?: string;
    availability?: string;
    product?: string;
    status: 'new' | 'contacted' | 'proposal' | 'closed' | 'archived';
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
    const navigate = useNavigate();
    const [leads, setLeads] = useState<Lead[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const [formData, setFormData] = useState({
        customer_name: '',
        phone: '',
        email: '',
        availability: '',
        product: '',
        notes: '',
        status: 'new'
    });

    const [showArchived, setShowArchived] = useState(false);

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

    const [editingId, setEditingId] = useState<string | null>(null);

    const handleEdit = (lead: Lead) => {
        setEditingId(lead.id);
        setFormData({
            customer_name: lead.customer_name,
            phone: lead.phone || '',
            email: lead.email || '',
            availability: lead.availability || '',
            product: lead.product || '',
            notes: lead.notes || '',
            status: lead.status
        });
        setIsModalOpen(true);
    };

    const handleNewLead = () => {
        setEditingId(null);
        setFormData({ customer_name: '', phone: '', email: '', availability: '', product: '', notes: '', status: 'new' });
        setIsModalOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        setSubmitting(true);

        try {
            const payload = {
                user_id: user.id,
                customer_name: formData.customer_name,
                phone: formData.phone,
                email: formData.email,
                availability: formData.availability,
                product: formData.product,
                notes: formData.notes,
                status: formData.status
            };

            if (editingId) {
                const { error } = await supabase.from('leads').update(payload).eq('id', editingId);
                if (error) throw error;
                toast.success('Lead aktualisiert');
            } else {
                const { error } = await supabase.from('leads').insert(payload);
                if (error) throw error;
                toast.success('Lead erstellt');
            }

            setIsModalOpen(false);
            setEditingId(null);
            setFormData({ customer_name: '', phone: '', email: '', availability: '', product: '', notes: '', status: 'new' });
            fetchLeads(); // Refresh list to be sure
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
        toast((t) => (
            <div className="flex flex-col gap-2">
                <span className="font-semibold">Lead wirklich löschen?</span>
                <div className="flex gap-2">
                    <button 
                        onClick={async () => {
                            toast.dismiss(t.id);
                            const { error } = await supabase.from('leads').delete().eq('id', id);
                            if (error) toast.error('Fehler beim Löschen');
                            else {
                                setLeads(prev => prev.filter(l => l.id !== id));
                                toast.success('Lead gelöscht');
                            }
                        }}
                        className="bg-red-500 text-white px-3 py-1 rounded-lg text-sm hover:bg-red-600"
                    >
                        Löschen
                    </button>
                    <button 
                        onClick={() => toast.dismiss(t.id)}
                        className="bg-gray-100 text-gray-700 px-3 py-1 rounded-lg text-sm hover:bg-gray-200"
                    >
                        Abbrechen
                    </button>
                </div>
            </div>
        ), { duration: 5000 });
    };

    const archiveLead = async (id: string) => {
        const { error } = await supabase.from('leads').update({ status: 'archived' }).eq('id', id);
        if (error) {
            toast.error('Fehler beim Archivieren');
        } else {
            // Optimistic update - remove from list as it's no longer in one of the active columns
            setLeads(leads.filter(l => l.id !== id));
            toast.success('Lead archiviert');
        }
    };

    const unarchiveLead = async (id: string) => {
        const { error } = await supabase.from('leads').update({ status: 'new' }).eq('id', id);
        if (error) {
            toast.error('Fehler beim Wiederherstellen');
        } else {
            setLeads(leads.map(l => l.id === id ? { ...l, status: 'new' } : l));
            toast.success('Lead wiederhergestellt');
        }
    };

    const getColumnLeads = (status: string) => leads.filter(l => l.status === status);

    const archivedLeads = leads.filter(l => l.status === 'archived');

    if (showArchived) {
        return (
            <div className="max-w-[1600px] mx-auto space-y-8 h-[calc(100vh-140px)] md:h-[calc(100vh-100px)] flex flex-col pb-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 flex-shrink-0">
                    <div>
                        <h1 className="text-3xl font-black text-gray-900 dark:text-white flex items-center gap-3">
                            <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-xl">
                                <Archive className="w-8 h-8 text-gray-600 dark:text-gray-400" />
                            </div>
                            Archivierte Leads
                        </h1>
                        <p className="text-gray-500 dark:text-gray-400 mt-2 ml-1">Historie deiner abgeschlossenen Leads.</p>
                    </div>
                    <button
                        onClick={() => setShowArchived(false)}
                        className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-6 py-3 rounded-2xl flex items-center gap-2 shadow-sm border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" /> Zurück zur Pipeline
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 overflow-y-auto pb-4 custom-scrollbar">
                    {archivedLeads.length === 0 ? (
                        <div className="col-span-full flex flex-col items-center justify-center h-64 text-gray-400">
                            <Archive className="w-12 h-12 mb-4 opacity-50" />
                            <p>Keine archivierten Leads.</p>
                        </div>
                    ) : (
                        archivedLeads.map(lead => (
                            <div key={lead.id} className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 opacity-75 hover:opacity-100 transition-opacity">
                                <div className="flex justify-between items-start mb-4">
                                    <h3 className="font-bold text-lg text-gray-900 dark:text-white">{lead.customer_name}</h3>
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => unarchiveLead(lead.id)}
                                            className="p-2 text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-xl transition-colors"
                                            title="Wiederherstellen"
                                        >
                                            <ArrowLeft className="w-4 h-4" />
                                        </button>
                                        <button 
                                            onClick={() => deleteLead(lead.id)}
                                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-xl transition-colors"
                                            title="Endgültig löschen"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                                <div className="space-y-2 text-sm text-gray-500 dark:text-gray-400">
                                    {lead.product && <div className="flex items-center gap-2"><Box className="w-4 h-4" /> {lead.product}</div>}
                                    {lead.created_at && <div className="flex items-center gap-2"><Clock className="w-4 h-4" /> Erstellt: {format(new Date(lead.created_at), 'dd.MM.yyyy')}</div>}
                                </div>
                                {lead.notes && (
                                    <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl text-xs italic text-gray-500">
                                        "{lead.notes}"
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>
        );
    }

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
                    <button
                        onClick={() => setShowArchived(true)}
                        className="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-colors"
                    >
                        <Archive className="w-5 h-5" /> Archiv
                    </button>
                    <motion.button
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        onClick={handleNewLead}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-2xl flex items-center gap-2 shadow-lg shadow-blue-500/30 transition-all hover:scale-105"
                    >
                        <Plus className="w-5 h-5" /> Neuer Lead
                    </motion.button>
                </div>
            </div>

            {/* Kanban Board (Scrollable Container) */}
            <div className="flex-1 overflow-x-auto overflow-y-hidden pb-4 -mx-4 px-4 md:mx-0 md:px-0">
                <div className="flex gap-4 md:gap-6 h-full w-max md:min-w-0 md:w-full px-1">
                    {COLUMNS.map((col) => {
                        const colLeads = getColumnLeads(col.id);

                        return (
                            <div 
                                key={col.id} 
                                className="flex flex-col w-[85vw] md:w-auto md:flex-1 bg-gray-50/50 dark:bg-gray-800/20 rounded-3xl border border-gray-100 dark:border-gray-700/50 flex-shrink-0 snap-center"
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    const leadId = e.dataTransfer.getData('leadId');
                                    if (leadId) updateStatus(leadId, col.id);
                                }}
                            >
                                {/* Column Header */}
                                <div className={`p-4 rounded-t-3xl border-b border-gray-100 dark:border-gray-700/50 flex items-center justify-between ${col.color.split(' ')[0]} bg-opacity-50`}>
                                    <div>
                                        <h3 className={`font-bold ${col.color.split(' ')[1]}`}>{col.label}</h3>
                                        <p className="text-xs opacity-70 font-medium">{colLeads.length} Leads</p>
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
                                                draggable
                                                onDragStart={(e) => {
                                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                                    (e as any).dataTransfer.setData('leadId', lead.id);
                                                }}
                                                onClick={() => handleEdit(lead)}
                                                className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 group hover:shadow-md transition-all cursor-grab active:cursor-grabbing hover:ring-2 hover:ring-indigo-500/20 relative"
                                            >
                                                <div className="flex justify-between items-start mb-3">
                                                    <h4 className="font-bold text-gray-900 dark:text-white line-clamp-1 text-base">{lead.customer_name}</h4>
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); deleteLead(lead.id); }} 
                                                        className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 p-1"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                                
                                                <div className="space-y-2 mb-3">
                                                    {lead.product && (
                                                        <div className="flex items-center gap-2 text-xs font-semibold text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 dark:text-indigo-300 px-2 py-1 rounded-lg w-fit">
                                                            <Box className="w-3 h-3" />
                                                            {lead.product}
                                                        </div>
                                                    )}
                                                    
                                                    {(lead.phone || lead.email) && (
                                                        <div className="flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-400">
                                                            {lead.phone && (
                                                                <div className="flex items-center gap-1.5">
                                                                    <Phone className="w-3 h-3" /> {lead.phone}
                                                                </div>
                                                            )}
                                                            {lead.email && (
                                                                <div className="flex items-center gap-1.5">
                                                                    <Mail className="w-3 h-3" /> {lead.email}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}

                                                    {lead.availability && (
                                                        <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-medium">
                                                            <Clock className="w-3 h-3" />
                                                            {lead.availability}
                                                        </div>
                                                    )}
                                                </div>
                                                
                                                {lead.notes && (
                                                    <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-3 bg-gray-50 dark:bg-gray-900/50 p-2 rounded-lg italic">
                                                        "{lead.notes}"
                                                    </p>
                                                )}

                                                <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-50 dark:border-gray-700">
                                                    <span className="text-[10px] text-gray-400">
                                                        {format(new Date(lead.created_at), 'dd.MM.')}
                                                    </span>
                                                    
                                                    <div className="flex gap-1">
                                                        {col.id !== 'new' && (
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); updateStatus(lead.id, COLUMNS[COLUMNS.findIndex(c => c.id === col.id) - 1].id); }}
                                                                className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-400 transition-colors"
                                                                title="Zurück"
                                                            >
                                                                <ArrowLeft className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                        {col.id !== 'closed' && (
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); updateStatus(lead.id, COLUMNS[COLUMNS.findIndex(c => c.id === col.id) + 1].id); }}
                                                                className="p-1.5 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg text-indigo-500 transition-colors"
                                                                title="Weiter"
                                                            >
                                                                <ArrowRight className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                        {col.id === 'closed' && (
                                                            <div className="flex gap-1 items-center">
                                                                <button 
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        navigate('/production', { 
                                                                            state: { 
                                                                                prefill: {
                                                                                    customer_name: lead.customer_name.split(' ').slice(1).join(' '),
                                                                                    customer_firstname: lead.customer_name.split(' ')[0],
                                                                                    sub_category: lead.product,
                                                                                    ...(lead.customer_name.includes(' ') ? {} : { customer_name: lead.customer_name, customer_firstname: '' })
                                                                                } 
                                                                            } 
                                                                        });
                                                                    }} 
                                                                    className="p-1.5 text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors"
                                                                    title="Als Vertrag erfassen"
                                                                >
                                                                    <FileInput className="w-4 h-4" />
                                                                </button>
                                                                <button 
                                                                    onClick={(e) => { e.stopPropagation(); archiveLead(lead.id); }}
                                                                    className="p-1.5 text-emerald-500 flex items-center justify-center bg-emerald-50 hover:bg-emerald-100 rounded-full transition-colors" 
                                                                    title="Lead archivieren (erledigt)"
                                                                >
                                                                    <CheckCircle2 className="w-4 h-4" />
                                                                </button>
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
                onClose={() => {
                    setIsModalOpen(false);
                    // Reset form when closing without saving
                    setEditingId(null);
                    setFormData({ customer_name: '', phone: '', email: '', availability: '', product: '', notes: '', status: 'new' });
                }}
                title={editingId ? "Lead bearbeiten" : "Neuer Lead"}
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Kunde / Name</label>
                        <input required type="text" value={formData.customer_name} onChange={e => setFormData({...formData, customer_name: e.target.value})} className="w-full rounded-xl border-gray-200 bg-gray-50 px-4 py-2" placeholder="Max Mustermann" />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Telefon</label>
                            <input type="tel" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full rounded-xl border-gray-200 bg-gray-50 px-4 py-2" placeholder="0171..." />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">E-Mail</label>
                            <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full rounded-xl border-gray-200 bg-gray-50 px-4 py-2" placeholder="kunde@mail.de" />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                         <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Produkt / Interesse</label>
                            <input type="text" value={formData.product} onChange={e => setFormData({...formData, product: e.target.value})} className="w-full rounded-xl border-gray-200 bg-gray-50 px-4 py-2" placeholder="z.B. KFZ, BU..." />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Erreichbarkeit</label>
                            <input type="text" value={formData.availability} onChange={e => setFormData({...formData, availability: e.target.value})} className="w-full rounded-xl border-gray-200 bg-gray-50 px-4 py-2" placeholder="ab 18 Uhr..." />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Notizen</label>
                        <textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} className="w-full rounded-xl border-gray-200 bg-gray-50 px-4 py-2 h-24" placeholder="Details zum Gespräch..." />
                    </div>
                    <div className="flex justify-end gap-2 pt-4">
                        <button type="button" onClick={() => {
                            setIsModalOpen(false);
                            setEditingId(null);
                            setFormData({ customer_name: '', phone: '', email: '', availability: '', product: '', notes: '', status: 'new' });
                        }} className="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded-xl">Abbrechen</button>
                        <button type="submit" disabled={submitting} className="px-6 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-500/30">Speichern</button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};
