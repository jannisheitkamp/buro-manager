import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { TrendingUp, Plus, Search, Filter, Euro, FileText, Trash2 } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Modal } from '@/components/Modal';
import { toast } from 'react-hot-toast';

// Helper to format currency safely
const formatCurrency = (amount: number | null | undefined) => {
  if (amount === null || amount === undefined || isNaN(amount)) return '0,00 €';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
};

export const Production = () => {
  const { user } = useStore();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // --- Form State ---
  const [category, setCategory] = useState('life'); // life, property, health, legal, car
  const [subCategory, setSubCategory] = useState('');
  
  // Basic Info
  const [policyNumber, setPolicyNumber] = useState('');
  const [submissionDate, setSubmissionDate] = useState(new Date().toISOString().split('T')[0]);
  const [customerName, setCustomerName] = useState('');
  const [customerFirstname, setCustomerFirstname] = useState('');
  
  // Contract Data
  const [startDate, setStartDate] = useState('');
  const [duration, setDuration] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState('monthly'); // monthly = 12
  
  // Money
  const [netPremium, setNetPremium] = useState<number | ''>(''); // e.g. 50.00
  const [grossPremium, setGrossPremium] = useState<number | ''>('');
  
  // Commission Logic
  const [commissionRate, setCommissionRate] = useState<number | ''>(''); // e.g. 8.0 (Promille) or 7.5 (Percent)
  
  // Calculated Fields (derived)
  const [netPremiumYearly, setNetPremiumYearly] = useState(0);
  const [grossPremiumYearly, setGrossPremiumYearly] = useState(0);
  const [valuationSum, setValuationSum] = useState(0); // AP-Summe
  const [commissionAmount, setCommissionAmount] = useState(0);

  // --- Auto-Calculation Effect ---
  useEffect(() => {
    // 1. Calculate Yearly Premiums
    let factor = 12;
    if (paymentMethod === 'quarterly') factor = 4;
    if (paymentMethod === 'half_yearly') factor = 2;
    if (paymentMethod === 'yearly') factor = 1;
    if (paymentMethod === 'one_time') factor = 1; // Special case

    const netP = Number(netPremium) || 0;
    const grossP = Number(grossPremium) || 0;
    
    const netYearly = netP * factor;
    const grossYearly = grossP * factor;

    setNetPremiumYearly(netYearly);
    setGrossPremiumYearly(grossYearly);

    // 2. Calculate Valuation Sum & Commission based on Category
    let valSum = 0;
    let comm = 0;
    const rate = Number(commissionRate);

    if (!isNaN(rate)) {
        if (category === 'life') {
            // AP Summe = Jahresbrutto * Laufzeit
            // Provision = AP Summe * Promille
            valSum = grossYearly * duration;
            comm = valSum * (rate / 1000); // Promille!
        } 
        else if (category === 'property' || category === 'legal' || category === 'car') {
            // Sach/Recht/KFZ: Provision = Jahresnetto * Prozent
            valSum = netYearly; // In Property often just the yearly net is the base
            comm = netYearly * (rate / 100); // Percent!
        }
        else if (category === 'health') {
            if (subCategory && subCategory.toLowerCase().includes('reise')) {
                 // Reise: Jahresbrutto * 10%
                 valSum = grossYearly;
                 comm = grossYearly * (rate / 100);
            } else {
                 // Normal KV: Monatsbrutto * Faktor (z.B. 3 MB)
                 // Here rate is the Factor (e.g. 3)
                 valSum = grossP; // Base is monthly gross
                 comm = grossP * rate; 
            }
        }
    }

    setValuationSum(valSum);
    setCommissionAmount(comm);

  }, [netPremium, grossPremium, duration, paymentMethod, category, subCategory, commissionRate]);

  // --- Presets for Rates ---
  useEffect(() => {
    if (category === 'life') setCommissionRate(8.0); // 8 Promille
    if (category === 'property') setCommissionRate(7.5); // 7.5%
    if (category === 'legal') setCommissionRate(5.0); // 5%
    if (category === 'car') setCommissionRate(3.0); // 3%
    if (category === 'health') {
        if (subCategory.toLowerCase().includes('reise')) setCommissionRate(10.0);
        else setCommissionRate(3.0); // 3 MB
    }
  }, [category, subCategory]);


  const fetchEntries = async () => {
    setLoading(true);
    const { data, error } = await supabase
        .from('production_entries')
        .select('*')
        .order('created_at', { ascending: false });
    
    if (error) {
        console.error(error);
        toast.error('Fehler beim Laden.');
    } else {
        setEntries(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchEntries();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);

    try {
        const { error } = await supabase.from('production_entries').insert({
            user_id: user.id,
            submission_date: submissionDate,
            policy_number: policyNumber,
            customer_name: customerName,
            customer_firstname: customerFirstname,
            category,
            sub_category: subCategory,
            start_date: startDate || null,
            payment_method: paymentMethod,
            duration,
            net_premium: Number(netPremium),
            net_premium_yearly: netPremiumYearly,
            gross_premium: Number(grossPremium),
            gross_premium_yearly: grossPremiumYearly,
            commission_rate: Number(commissionRate),
            valuation_sum: valuationSum,
            commission_amount: commissionAmount,
            status: 'submitted'
        });

        if (error) throw error;
        toast.success('Vertrag erfasst!');
        setIsModalOpen(false);
        // Reset (simplified)
        setCustomerName('');
        setNetPremium('');
        setGrossPremium('');
        fetchEntries();
    } catch (err) {
        console.error(err);
        toast.error('Fehler beim Speichern.');
    } finally {
        setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
      if(!confirm('Wirklich löschen?')) return;
      const { error } = await supabase.from('production_entries').delete().eq('id', id);
      if(!error) {
          toast.success('Gelöscht');
          fetchEntries();
      }
  };

  const filteredEntries = entries.filter(e => {
      if (filterCategory !== 'all' && e.category !== filterCategory) return false;
      const search = searchQuery.toLowerCase();
      return (
          e.customer_name?.toLowerCase().includes(search) ||
          e.policy_number?.toLowerCase().includes(search)
      );
  });

  const totalCommission = filteredEntries.reduce((acc, curr) => acc + (curr.commission_amount || 0), 0);

  return (
    <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <TrendingUp className="w-8 h-8 text-indigo-600" />
                    Produktion & Umsatz
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Erfasse deine eingereichten Verträge und behalte die Provision im Blick.
                </p>
            </div>
            
            <div className="flex items-center gap-4 bg-white dark:bg-gray-800 p-2 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="px-4 border-r border-gray-100 dark:border-gray-700">
                    <p className="text-xs text-gray-500">Provision (Liste)</p>
                    <p className="text-lg font-bold text-indigo-600">{formatCurrency(totalCommission)}</p>
                </div>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
                >
                    <Plus className="w-4 h-4" /> Neuer Vertrag
                </button>
            </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                <input 
                    type="text" 
                    placeholder="Suchen nach Name oder Schein-Nr..." 
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="pl-9 w-full rounded-xl border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0">
                {['all', 'life', 'property', 'health', 'legal', 'car'].map(cat => (
                    <button
                        key={cat}
                        onClick={() => setFilterCategory(cat)}
                        className={cn(
                            "px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors",
                            filterCategory === cat 
                                ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300" 
                                : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                        )}
                    >
                        {cat === 'all' ? 'Alle' : 
                         cat === 'life' ? 'Leben' :
                         cat === 'property' ? 'Sach' :
                         cat === 'health' ? 'Kranken' :
                         cat === 'legal' ? 'Recht' : 'KFZ'}
                    </button>
                ))}
            </div>
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-700">
                        <tr>
                            <th className="px-6 py-4 font-semibold text-gray-900 dark:text-white">Datum</th>
                            <th className="px-6 py-4 font-semibold text-gray-900 dark:text-white">Kunde</th>
                            <th className="px-6 py-4 font-semibold text-gray-900 dark:text-white">Sparte</th>
                            <th className="px-6 py-4 font-semibold text-gray-900 dark:text-white">Beitrag</th>
                            <th className="px-6 py-4 font-semibold text-gray-900 dark:text-white">Bewertung</th>
                            <th className="px-6 py-4 font-semibold text-gray-900 dark:text-white text-right">Provision</th>
                            <th className="px-6 py-4 font-semibold text-gray-900 dark:text-white text-right">Aktion</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                        {loading ? (
                            <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-500">Lade Daten...</td></tr>
                        ) : filteredEntries.length === 0 ? (
                            <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-500">Keine Verträge gefunden.</td></tr>
                        ) : (
                            filteredEntries.map(entry => (
                                <tr key={entry.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                    <td className="px-6 py-4 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                                        {format(new Date(entry.submission_date), 'dd.MM.yyyy')}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="font-medium text-gray-900 dark:text-white">{entry.customer_name}, {entry.customer_firstname}</div>
                                        <div className="text-xs text-gray-500">{entry.policy_number || '-'}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={cn(
                                            "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                                            entry.category === 'life' ? "bg-blue-100 text-blue-800" :
                                            entry.category === 'property' ? "bg-orange-100 text-orange-800" :
                                            entry.category === 'health' ? "bg-red-100 text-red-800" :
                                            "bg-gray-100 text-gray-800"
                                        )}>
                                            {entry.category === 'life' ? 'Leben' : 
                                             entry.category === 'property' ? 'Sach' : 
                                             entry.category === 'health' ? 'Kranken' : entry.category}
                                        </span>
                                        {entry.sub_category && <div className="text-xs text-gray-500 mt-1">{entry.sub_category}</div>}
                                    </td>
                                    <td className="px-6 py-4 text-gray-600 dark:text-gray-300">
                                        {formatCurrency(entry.gross_premium || 0)} <span className="text-xs text-gray-400">({entry.payment_method})</span>
                                    </td>
                                    <td className="px-6 py-4 text-gray-600 dark:text-gray-300">
                                        <div className="text-xs">Satz: {entry.commission_rate} {entry.category === 'life' ? '‰' : (entry.category === 'health' && !entry.sub_category?.includes('reise') ? 'MB' : '%')}</div>
                                        <div>Summe: {formatCurrency(entry.valuation_sum || 0)}</div>
                                    </td>
                                    <td className="px-6 py-4 text-right font-bold text-indigo-600 dark:text-indigo-400">
                                        {formatCurrency(entry.commission_amount || 0)}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button 
                                            onClick={() => handleDelete(entry.id)}
                                            className="text-gray-400 hover:text-red-500 transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>

        {/* New Entry Modal */}
        <Modal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            title="Neuen Vertrag erfassen"
        >
            <form onSubmit={handleSubmit} className="space-y-6">
                
                {/* 1. Category Selection */}
                <div className="grid grid-cols-5 gap-2">
                    {[
                        { id: 'life', label: 'Leben', icon: '🌱' },
                        { id: 'property', label: 'Sach', icon: '🏠' },
                        { id: 'health', label: 'Kranken', icon: '🏥' },
                        { id: 'legal', label: 'Recht', icon: '⚖️' },
                        { id: 'car', label: 'KFZ', icon: '🚗' },
                    ].map(c => (
                        <button
                            key={c.id}
                            type="button"
                            onClick={() => setCategory(c.id)}
                            className={cn(
                                "flex flex-col items-center justify-center p-2 rounded-xl border transition-all",
                                category === c.id 
                                    ? "border-indigo-500 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-500" 
                                    : "border-gray-200 hover:bg-gray-50"
                            )}
                        >
                            <span className="text-xl mb-1">{c.icon}</span>
                            <span className="text-xs font-medium">{c.label}</span>
                        </button>
                    ))}
                </div>

                {/* 2. Customer & Basic Info */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Nachname</label>
                        <input required type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} className="w-full rounded-lg border-gray-300 bg-gray-50 px-3 py-2 text-sm focus:ring-indigo-500" />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Vorname</label>
                        <input type="text" value={customerFirstname} onChange={e => setCustomerFirstname(e.target.value)} className="w-full rounded-lg border-gray-300 bg-gray-50 px-3 py-2 text-sm focus:ring-indigo-500" />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Versicherungsschein-Nr.</label>
                        <input type="text" value={policyNumber} onChange={e => setPolicyNumber(e.target.value)} className="w-full rounded-lg border-gray-300 bg-gray-50 px-3 py-2 text-sm focus:ring-indigo-500" />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Einreichungsdatum</label>
                        <input type="date" value={submissionDate} onChange={e => setSubmissionDate(e.target.value)} className="w-full rounded-lg border-gray-300 bg-gray-50 px-3 py-2 text-sm focus:ring-indigo-500" />
                    </div>
                </div>

                {/* 3. Contract Details (Dynamic) */}
                <div className="bg-gray-50 p-4 rounded-xl space-y-4">
                    <h3 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
                        <FileText className="w-4 h-4" /> Vertragsdaten
                    </h3>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Sparte / Tarif</label>
                            <input 
                                type="text" 
                                list="subCategories"
                                placeholder={category === 'health' ? 'z.B. Reise-KV' : 'z.B. Privathaftpflicht'}
                                value={subCategory} 
                                onChange={e => setSubCategory(e.target.value)} 
                                className="w-full rounded-lg border-gray-300 bg-white px-3 py-2 text-sm focus:ring-indigo-500" 
                            />
                            <datalist id="subCategories">
                                <option value="Privathaftpflicht" />
                                <option value="Unfall" />
                                <option value="Hausrat" />
                                <option value="Wohngebäude" />
                                <option value="Reise-KV" />
                                <option value="Zahnzusatz" />
                            </datalist>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Zahlweise</label>
                            <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="w-full rounded-lg border-gray-300 bg-white px-3 py-2 text-sm focus:ring-indigo-500">
                                <option value="monthly">Monatlich</option>
                                <option value="quarterly">Vierteljährlich</option>
                                <option value="half_yearly">Halbjährlich</option>
                                <option value="yearly">Jährlich</option>
                                <option value="one_time">Einmalbeitrag</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Beitrag Netto</label>
                            <div className="relative">
                                <input type="number" step="0.01" value={netPremium} onChange={e => setNetPremium(e.target.value ? Number(e.target.value) : '')} className="w-full rounded-lg border-gray-300 bg-white pl-8 px-3 py-2 text-sm focus:ring-indigo-500" />
                                <span className="absolute left-3 top-2 text-gray-400 text-xs">€</span>
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Beitrag Brutto</label>
                            <div className="relative">
                                <input type="number" step="0.01" value={grossPremium} onChange={e => setGrossPremium(e.target.value ? Number(e.target.value) : '')} className="w-full rounded-lg border-gray-300 bg-white pl-8 px-3 py-2 text-sm focus:ring-indigo-500" />
                                <span className="absolute left-3 top-2 text-gray-400 text-xs">€</span>
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Laufzeit (Jahre)</label>
                            <input type="number" value={duration} onChange={e => setDuration(Number(e.target.value))} className="w-full rounded-lg border-gray-300 bg-white px-3 py-2 text-sm focus:ring-indigo-500" />
                        </div>
                    </div>
                </div>

                {/* 4. Calculation Preview */}
                <div className="bg-indigo-50 p-4 rounded-xl space-y-3 border border-indigo-100">
                    <h3 className="font-semibold text-indigo-900 text-sm flex items-center gap-2">
                        <Euro className="w-4 h-4" /> Provision (Vorschau)
                    </h3>
                    
                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-indigo-400 mb-1">
                                {category === 'life' ? 'Promille' : (category === 'health' && !subCategory.includes('Reise') ? 'MB-Faktor' : 'Prozent')}
                            </label>
                            <input 
                                type="number" 
                                step="0.1" 
                                value={commissionRate} 
                                onChange={e => setCommissionRate(e.target.value ? Number(e.target.value) : '')}
                                className="w-full rounded-lg border-indigo-200 bg-white px-3 py-1.5 text-sm focus:ring-indigo-500 font-bold text-indigo-700" 
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-indigo-400 mb-1">
                                {category === 'life' ? 'Bewertungssumme' : 'Basis (Jahresbeitrag)'}
                            </label>
                            <div className="text-sm font-medium text-indigo-900 py-2">
                                {formatCurrency(valuationSum)}
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-indigo-400 mb-1">Provision</label>
                            <div className="text-lg font-bold text-green-600 py-1">
                                {formatCurrency(commissionAmount)}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                    <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Abbrechen</button>
                    <button type="submit" disabled={submitting} className="px-4 py-2 text-sm text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-md">
                        Vertrag speichern
                    </button>
                </div>
            </form>
        </Modal>
    </div>
  );
};
