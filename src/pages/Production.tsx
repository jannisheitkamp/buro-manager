import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { TrendingUp, Plus, Search, Filter, Euro, FileText, Trash2, Download, Pencil, FileDown } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Modal } from '@/components/Modal';
import { toast } from 'react-hot-toast';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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
  const [editingId, setEditingId] = useState<string | null>(null);

  // --- Config ---
  // Define insurance types and subcategories
  const INSURANCE_TYPES = [
    { id: 'life', label: 'Leben', icon: '🌱', subcategories: ['Leben', 'BU'] },
    { id: 'health', label: 'Kranken', icon: '🏥', subcategories: ['KV Voll', 'KV Zusatz', 'Reise-KV'] },
    { id: 'property', label: 'Sach', icon: '🏠', subcategories: ['PHV', 'HR', 'UNF', 'Sach'] },
    { id: 'car', label: 'KFZ', icon: '🚗', subcategories: ['KFZ'] },
    { id: 'legal', label: 'Recht', icon: '⚖️', subcategories: ['Rechtsschutz'] },
    { id: 'other', label: 'Sonstige', icon: '📂', subcategories: ['Sonstige'] },
  ];

  // --- User Rates State ---
  const [userRates, setUserRates] = useState<Record<string, number>>({});

  useEffect(() => {
    const loadRates = async () => {
        if (!user) return;
        const { data } = await supabase.from('user_commission_settings').select('*').eq('user_id', user.id);
        
        const rates: Record<string, number> = {};
        // Defaults
        rates['Leben'] = 8.0; rates['BU'] = 8.0;
        rates['KV Voll'] = 3.0; rates['KV Zusatz'] = 3.0; rates['Reise-KV'] = 10.0;
        rates['PHV'] = 7.5; rates['HR'] = 7.5; rates['UNF'] = 7.5; rates['Sach'] = 7.5;
        rates['KFZ'] = 3.0; rates['Rechtsschutz'] = 5.0; rates['Sonstige'] = 5.0;

        // Overwrite with DB values
        if (data) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data.forEach((row: any) => {
                if (row.sub_category) rates[row.sub_category] = Number(row.rate_value);
            });
        }
        setUserRates(rates);
    };
    loadRates();
  }, [user]);

  // --- Form State ---
  const [category, setCategory] = useState('life'); 
  const [subCategory, setSubCategory] = useState(INSURANCE_TYPES[0].subcategories[0]);
  
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
  const [liabilityActive, setLiabilityActive] = useState(true);
  const [liabilityRate, setLiabilityRate] = useState<number>(10);
  
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
    if (paymentMethod === 'one_time') factor = 1;

    const netP = Number(netPremium) || 0;
    const grossP = Number(grossPremium) || 0;
    
    const netYearly = netP * factor;
    const grossYearly = grossP * factor;

    setNetPremiumYearly(netYearly);
    setGrossPremiumYearly(grossYearly);

    // 2. Determine Rate and Calculate Commission
    let valSum = 0;
    let comm = 0;
    let rate = 0;

    // Get rate from loaded user settings (or default if not loaded yet)
    rate = userRates[subCategory] || 0;

    if (subCategory === 'Leben' || subCategory === 'BU') {
        valSum = grossYearly * duration;
        comm = valSum * (rate / 1000);
    } 
    else if (['KV Voll', 'KV Zusatz'].includes(subCategory)) {
        valSum = grossP;
        comm = grossP * rate;
    }
    else if (subCategory === 'Reise-KV') {
        valSum = grossYearly;
        comm = grossYearly * (rate / 100);
    }
    else if (['PHV', 'HR', 'UNF', 'Sach', 'KFZ', 'Rechtsschutz', 'Sonstige'].includes(subCategory)) {
        valSum = netYearly;
        comm = netYearly * (rate / 100);
    }
    
    // Update state only if calculated
    setCommissionRate(rate);
    setValuationSum(valSum);
    setCommissionAmount(comm);

  }, [netPremium, grossPremium, duration, paymentMethod, subCategory, userRates]); 
  
  // Update Category when SubCategory changes (reverse lookup if needed, or just handle in UI)
  useEffect(() => {
      const parent = INSURANCE_TYPES.find(t => t.subcategories.includes(subCategory));
      if (parent && parent.id !== category) {
          setCategory(parent.id);
      }
  }, [subCategory]);


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
        const payload = {
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
            liability_rate: liabilityActive ? Number(liabilityRate) : 0,
            status: 'submitted'
        };

        if (editingId) {
            const { error } = await supabase
                .from('production_entries')
                .update(payload)
                .eq('id', editingId);
            if (error) throw error;
            toast.success('Vertrag aktualisiert!');
        } else {
            const { error } = await supabase
                .from('production_entries')
                .insert(payload);
            if (error) throw error;
            toast.success('Vertrag erfasst!');
        }

        setIsModalOpen(false);
        resetForm();
        fetchEntries();
    } catch (err) {
        console.error(err);
        toast.error('Fehler beim Speichern.');
    } finally {
        setSubmitting(false);
    }
  };

  const resetForm = () => {
      setEditingId(null);
      setCustomerName('');
      setCustomerFirstname('');
      setPolicyNumber('');
      setSubmissionDate(new Date().toISOString().split('T')[0]);
      setNetPremium('');
      setGrossPremium('');
      setDuration(1);
      setPaymentMethod('monthly');
      setLiabilityRate(10);
      setLiabilityActive(true);
      // Reset category to defaults if needed
  };

  const handleEdit = (entry: any) => {
      setEditingId(entry.id);
      setSubmissionDate(entry.submission_date);
      setPolicyNumber(entry.policy_number || '');
      setCustomerName(entry.customer_name || '');
      setCustomerFirstname(entry.customer_firstname || '');
      setCategory(entry.category);
      setSubCategory(entry.sub_category);
      setStartDate(entry.start_date || '');
      setPaymentMethod(entry.payment_method);
      setDuration(entry.duration || 1);
      setNetPremium(entry.net_premium || '');
      setGrossPremium(entry.gross_premium || '');
      
      const lRate = Number(entry.liability_rate);
      if (lRate > 0) {
          setLiabilityRate(lRate);
          setLiabilityActive(true);
      } else {
          setLiabilityRate(10); // Default if user enables it again
          setLiabilityActive(false);
      }

      setIsModalOpen(true);
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
  const totalLiability = filteredEntries.reduce((acc, curr) => acc + ((curr.commission_amount || 0) * (curr.liability_rate || 0) / 100), 0);

  const handleExport = () => {
      if (filteredEntries.length === 0) return;
      
      const headers = [
          'Datum', 
          'Nachname', 
          'Vorname', 
          'Schein-Nr', 
          'Sparte', 
          'Tarif', 
          'Zahlweise', 
          'Beitrag (Brutto)', 
          'Beitrag (Netto)', 
          'Bewertungssumme', 
          'Satz', 
          'Provision'
      ];

      // Helper for German number format (comma as decimal)
      const fmtNum = (val: number | null | undefined) => {
          if (val === null || val === undefined) return '';
          return val.toString().replace('.', ',');
      };

      // Helper maps
      const catMap: Record<string, string> = {
          'life': 'Leben', 'health': 'Kranken', 'property': 'Sach',
          'car': 'KFZ', 'legal': 'Recht', 'other': 'Sonstige'
      };
      const payMap: Record<string, string> = {
          'monthly': 'Monatlich', 'quarterly': 'Vierteljährlich',
          'half_yearly': 'Halbjährlich', 'yearly': 'Jährlich', 'one_time': 'Einmalig'
      };

      const csvContent = [
          '\uFEFF' + headers.join(';'), // Add BOM for Excel
          ...filteredEntries.map(e => [
              format(new Date(e.submission_date), 'dd.MM.yyyy'),
              `"${e.customer_name || ''}"`,
              `"${e.customer_firstname || ''}"`,
              `"${e.policy_number || ''}"`,
              catMap[e.category] || e.category,
              `"${e.sub_category || ''}"`,
              payMap[e.payment_method] || e.payment_method,
              fmtNum(e.gross_premium),
              fmtNum(e.net_premium),
              fmtNum(e.valuation_sum),
              fmtNum(e.commission_rate),
              fmtNum(e.commission_amount)
          ].join(';'))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `Produktion_Export_${format(new Date(), 'yyyy-MM-dd')}.csv`;
      link.click();
  };

  const handleExportPDF = () => {
      if (filteredEntries.length === 0) return;
      const doc = new jsPDF();
      
      doc.setFontSize(18);
      doc.text('Produktionsnachweis', 14, 20);
      
      doc.setFontSize(10);
      doc.text(`Erstellt: ${new Date().toLocaleDateString('de-DE')}`, 14, 28);
      doc.text(`Zeitraum: ${filterCategory === 'all' ? 'Alle' : filterCategory}`, 14, 33);

      const tableData = filteredEntries.map(e => [
          format(new Date(e.submission_date), 'dd.MM.yyyy'),
          `${e.customer_name}, ${e.customer_firstname}`,
          e.sub_category || e.category,
          formatCurrency(e.valuation_sum),
          formatCurrency(e.commission_amount)
      ]);

      autoTable(doc, {
          startY: 40,
          head: [['Datum', 'Kunde', 'Sparte', 'Bewertung', 'Provision']],
          body: tableData,
          foot: [['', '', 'Summe:', '', formatCurrency(totalCommission)]],
          theme: 'grid',
          headStyles: { fillColor: [79, 70, 229] }, // Indigo 600
          footStyles: { fillColor: [243, 244, 246], textColor: [0, 0, 0], fontStyle: 'bold' } // Gray 100
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const finalY = (doc as any).lastAutoTable.finalY || 40;
      
      doc.text(`Haftungsreserve (Total): ${formatCurrency(totalLiability)}`, 14, finalY + 10);
      
      doc.save(`Produktion_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

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
                <div className="px-4 border-r border-gray-100 dark:border-gray-700 hidden sm:block">
                    <p className="text-xs text-gray-500">Haftungsreserve (Total)</p>
                    <p className="text-lg font-bold text-orange-500">{formatCurrency(totalLiability)}</p>
                </div>
                <button 
                    onClick={handleExportPDF}
                    className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Als PDF Exportieren"
                >
                    <FileDown className="w-5 h-5" />
                </button>
                <button 
                    onClick={handleExport}
                    className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Als CSV Exportieren"
                >
                    <Download className="w-5 h-5" />
                </button>
                <button
                    onClick={() => {
                        resetForm();
                        setIsModalOpen(true);
                    }}
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
                                    <td className="px-6 py-4 text-right flex justify-end gap-2">
                                        <button 
                                            onClick={() => handleEdit(entry)}
                                            className="text-gray-400 hover:text-indigo-500 transition-colors"
                                            title="Bearbeiten"
                                        >
                                            <Pencil className="w-4 h-4" />
                                        </button>
                                        <button 
                                            onClick={() => handleDelete(entry.id)}
                                            className="text-gray-400 hover:text-red-500 transition-colors"
                                            title="Löschen"
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
            title={editingId ? "Vertrag bearbeiten" : "Neuen Vertrag erfassen"}
        >
            <form onSubmit={handleSubmit} className="space-y-6">
                
                {/* 1. Category Selection */}
                <div className="grid grid-cols-5 gap-2">
                    {INSURANCE_TYPES.map(c => (
                        <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                                setCategory(c.id);
                                setSubCategory(c.subcategories[0]);
                            }}
                            className={cn(
                                "flex flex-col items-center justify-center p-2 rounded-xl border transition-all",
                                category === c.id 
                                    ? "border-indigo-500 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-500 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-500" 
                                    : "border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700 dark:text-gray-300"
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
                            <select 
                                value={subCategory} 
                                onChange={e => setSubCategory(e.target.value)} 
                                className="w-full rounded-lg border-gray-300 bg-white px-3 py-2 text-sm focus:ring-indigo-500" 
                            >
                                {INSURANCE_TYPES.find(c => c.id === category)?.subcategories.map(sc => (
                                    <option key={sc} value={sc}>{sc}</option>
                                ))}
                            </select>
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
                                {category === 'life' ? 'Promille' : (['KV Voll', 'KV Zusatz'].includes(subCategory) ? 'MB-Faktor' : 'Prozent')}
                            </label>
                            <input 
                                type="number" 
                                step="0.1" 
                                value={commissionRate} 
                                readOnly
                                className="w-full rounded-lg border-indigo-200 bg-gray-50 px-3 py-1.5 text-sm font-bold text-indigo-700 cursor-not-allowed" 
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-indigo-400 mb-1">
                                {category === 'life' ? 'Bewertungssumme' : (['KV Voll', 'KV Zusatz'].includes(subCategory) ? 'Monatsbeitrag' : 'Jahresbeitrag (Netto/Brutto)')}
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

                    <div className="flex items-center gap-4 pt-2 border-t border-indigo-100">
                         <div className="flex items-center gap-2">
                             <input 
                                 type="checkbox" 
                                 id="liabilityCheck"
                                 checked={liabilityActive}
                                 onChange={e => setLiabilityActive(e.target.checked)}
                                 className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                             />
                             <label htmlFor="liabilityCheck" className="text-sm text-gray-700 font-medium">Stornohaftung einbehalten</label>
                         </div>
                         {liabilityActive && (
                             <div className="flex items-center gap-2">
                                 <input 
                                     type="number" 
                                     value={liabilityRate} 
                                     onChange={e => setLiabilityRate(Number(e.target.value))} 
                                     className="w-16 rounded-lg border-gray-300 bg-white px-2 py-1 text-sm focus:ring-indigo-500" 
                                 />
                                 <span className="text-sm text-gray-500">%</span>
                             </div>
                         )}
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
