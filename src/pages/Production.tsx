import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { useLocation } from 'react-router-dom';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { TrendingUp, Plus, Search, Filter, Euro, FileText, Trash2, Download, Pencil, FileDown, PieChart, BarChart as BarChartIcon, Medal, Trophy, LayoutGrid, List } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Modal } from '@/components/Modal';
import { toast } from 'react-hot-toast';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';

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
  const [viewMode, setViewMode] = useState<'personal' | 'leaderboard'>('personal');

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

  const location = useLocation();

  // --- User Rates State ---
  const [userRates, setUserRates] = useState<Record<string, number>>({});

  // Check for prefill data from navigation (e.g. from Leads)
  useEffect(() => {
    if (location.state?.prefill) {
        const { customer_name, customer_firstname, valuation_sum } = location.state.prefill;
        if (customer_name) setCustomerName(customer_name);
        if (customer_firstname) setCustomerFirstname(customer_firstname);
        // Note: valuation_sum from Lead is likely just "value", we might map it to netPremium or valuationSum depending on logic.
        // For simplicity let's map it to Net Premium for now as a starting point, or just leave it for user to fill.
        // Actually, let's map it to Net Premium (Monthly) if reasonable, or just set it as a hint.
        if (valuation_sum) setNetPremium(valuation_sum); 
        
        setIsModalOpen(true);
        // Clear state to prevent reopening on refresh
        window.history.replaceState({}, document.title);
    }
  }, [location]);

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
  const [managedBy, setManagedBy] = useState<string>(''); 
  const [closedBy, setClosedBy] = useState<string>(''); // New: Explicit closer selection
  const [status, setStatus] = useState<'submitted' | 'policed' | 'cancelled'>('submitted');
  
  // Contract Data
  const [startDate, setStartDate] = useState('');
  const [policingDate, setPolicingDate] = useState(''); // New
  const [commissionReceivedDate, setCommissionReceivedDate] = useState(''); // New
  const [duration, setDuration] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState('monthly'); // monthly = 12
  const [notes, setNotes] = useState(''); // New
  
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

  const [profiles, setProfiles] = useState<any[]>([]); // For "Managed By" dropdown

  useEffect(() => {
      const loadProfiles = async () => {
          const { data } = await supabase.from('profiles').select('id, full_name, agency_number');
          if (data) setProfiles(data);
      };
      loadProfiles();
  }, []);

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
        .select(`
            *,
            profiles:user_id (full_name, avatar_url, agency_number),
            manager:managed_by (full_name, agency_number)
        `)
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
            user_id: closedBy || user.id, // Use selected closer OR current user
            managed_by: managedBy || closedBy || user.id, // Default to closer/self if empty
            submission_date: submissionDate,
            policy_number: policyNumber,
            customer_name: customerName,
            customer_firstname: customerFirstname,
            category,
            sub_category: subCategory,
            start_date: startDate || null,
            policing_date: policingDate || null,
            commission_received_date: commissionReceivedDate || null,
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
            status,
            notes
        };

        if (editingId) {
            // Update everything including user_id if changed
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
      setManagedBy(user?.id || '');
      setClosedBy(user?.id || '');
      setStatus('submitted');
      setStartDate('');
      setPolicingDate('');
      setCommissionReceivedDate('');
      setNetPremium('');
      setGrossPremium('');
      setDuration(1);
      setPaymentMethod('monthly');
      setLiabilityRate(10);
      setLiabilityActive(true);
      setNotes('');
      // Reset category to defaults if needed
  };

  const handleEdit = (entry: any) => {
      setEditingId(entry.id);
      setSubmissionDate(entry.submission_date);
      setPolicyNumber(entry.policy_number || '');
      setCustomerName(entry.customer_name || '');
      setCustomerFirstname(entry.customer_firstname || '');
      setManagedBy(entry.managed_by || entry.user_id);
      setClosedBy(entry.user_id);
      setStatus(entry.status || 'submitted');
      setCategory(entry.category);
      setSubCategory(entry.sub_category);
      setStartDate(entry.start_date || '');
      setPolicingDate(entry.policing_date || '');
      setCommissionReceivedDate(entry.commission_received_date || '');
      setPaymentMethod(entry.payment_method);
      setDuration(entry.duration || 1);
      setNetPremium(entry.net_premium || '');
      setGrossPremium(entry.gross_premium || '');
      setNotes(entry.notes || '');
      
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
      toast((t) => (
          <div className="flex flex-col gap-2">
              <span className="font-semibold">Wirklich löschen?</span>
              <div className="flex gap-2">
                  <button 
                      onClick={async () => {
                          toast.dismiss(t.id);
                          const { error } = await supabase.from('production_entries').delete().eq('id', id);
                          if(!error) {
                              toast.success('Gelöscht');
                              fetchEntries();
                          } else {
                              toast.error('Fehler beim Löschen');
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

  // Filter entries based on viewMode
  const filteredEntries = entries.filter(e => {
      if (viewMode === 'personal' && e.user_id !== user?.id) return false;
      if (filterCategory !== 'all' && e.category !== filterCategory) return false;
      const search = searchQuery.toLowerCase();
      return (
          e.customer_name?.toLowerCase().includes(search) ||
          e.policy_number?.toLowerCase().includes(search)
      );
  });

  const totalCommission = filteredEntries.reduce((acc, curr) => acc + (curr.commission_amount || 0), 0);
  const totalLiability = filteredEntries.reduce((acc, curr) => acc + ((curr.commission_amount || 0) * (curr.liability_rate || 0) / 100), 0);

  // --- LEADERBOARD CALCULATION ---
  const getLeaderboardData = () => {
      const userTotals: Record<string, { name: string; avatar: string; amount: number; count: number }> = {};
      
      entries.forEach(e => {
          const userId = e.user_id;
          if (!userTotals[userId]) {
              userTotals[userId] = {
                  name: e.profiles?.full_name || 'Unbekannt',
                  avatar: e.profiles?.avatar_url,
                  amount: 0,
                  count: 0
              };
          }
          userTotals[userId].amount += (e.commission_amount || 0);
          userTotals[userId].count += 1;
      });

      return Object.entries(userTotals)
        .map(([id, data]) => ({ id, ...data }))
        .sort((a, b) => b.amount - a.amount);
  };

  const leaderboardData = getLeaderboardData();

  // --- CHART DATA PREPARATION ---
  
  // 1. Monthly Data (Last 6 Months)
  const getMonthlyData = () => {
      const last6Months = Array.from({ length: 6 }, (_, i) => {
          const d = new Date();
          d.setMonth(d.getMonth() - (5 - i));
          return d;
      });

      return last6Months.map(date => {
          const monthKey = format(date, 'yyyy-MM');
          const monthLabel = format(date, 'MMM', { locale: de });
          
          const total = filteredEntries
            .filter(e => e.submission_date.startsWith(monthKey))
            .reduce((acc, curr) => acc + (curr.commission_amount || 0), 0);
            
          return { name: monthLabel, value: total };
      });
  };
  
  const monthlyData = getMonthlyData();

  // 2. Category Distribution
  const getCategoryData = () => {
      const data: Record<string, number> = {};
      filteredEntries.forEach(e => {
          const label = INSURANCE_TYPES.find(t => t.id === e.category)?.label || e.category;
          data[label] = (data[label] || 0) + (e.commission_amount || 0);
      });

      return Object.entries(data)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value); // Sort by highest value
  };

  const categoryData = getCategoryData();
  const COLORS = ['#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

  const handleExport = () => {
      if (filteredEntries.length === 0) return;
      
      const headers = [
          'Status',
          'Einreichung',
          'Policierung',
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
          'Provision',
          'Betreuer'
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
      const statusMap: Record<string, string> = {
          'submitted': 'Eingereicht', 'policed': 'Policiert', 'cancelled': 'Storniert'
      };

      const csvContent = [
          '\uFEFF' + headers.join(';'), // Add BOM for Excel
          ...filteredEntries.map(e => {
              // Find manager name if possible (not joined in current select, need to check fetch)
              // We fetched profiles(full_name) for user_id. We might need managed_by join too.
              // For now, let's just use what we have or skip name if not joined.
              // We only joined `profiles` on `user_id`.
              // We should update fetchEntries to join `managed_by` as well.
              return [
                  statusMap[e.status] || e.status,
                  format(new Date(e.submission_date), 'dd.MM.yyyy'),
                  e.policing_date ? format(new Date(e.policing_date), 'dd.MM.yyyy') : '',
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
                  fmtNum(e.commission_amount),
                  `"${e.manager?.full_name || ''}"`
              ].join(';');
          })
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
          format(new Date(e.submission_date), 'dd.MM.yy'),
          e.policing_date ? format(new Date(e.policing_date), 'dd.MM.yy') : '-',
          `${e.customer_name}, ${e.customer_firstname}`,
          e.sub_category || e.category,
          e.status === 'policed' ? 'Policiert' : (e.status === 'cancelled' ? 'Storno' : 'Offen'),
          formatCurrency(e.valuation_sum),
          formatCurrency(e.commission_amount)
      ]);

      autoTable(doc, {
          startY: 40,
          head: [['Eingereicht', 'Policiert', 'Kunde', 'Sparte', 'Status', 'Bewertung', 'Provision']],
          body: tableData,
          foot: [['', '', '', '', 'Summe:', '', formatCurrency(totalCommission)]],
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
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
                <motion.h1 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 flex items-center gap-3"
                >
                    Produktion & Umsatz
                </motion.h1>
                <motion.p 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 }}
                  className="text-lg text-gray-500 dark:text-gray-400 mt-2 font-medium"
                >
                    Erfasse deine eingereichten Verträge und behalte die Provision im Blick.
                </motion.p>
            </div>
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="flex items-center gap-3"
            >
                <div className="bg-gray-100 dark:bg-gray-800 p-1 rounded-2xl flex items-center mr-2">
                    <button
                        onClick={() => setViewMode('personal')}
                        className={cn(
                            "px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2",
                            viewMode === 'personal' 
                                ? "bg-white dark:bg-gray-700 shadow-sm text-indigo-600 dark:text-indigo-400" 
                                : "text-gray-500 dark:text-gray-400 hover:text-gray-700"
                        )}
                    >
                        <LayoutGrid className="w-4 h-4" /> Meine
                    </button>
                    <button
                        onClick={() => setViewMode('leaderboard')}
                        className={cn(
                            "px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2",
                            viewMode === 'leaderboard' 
                                ? "bg-white dark:bg-gray-700 shadow-sm text-indigo-600 dark:text-indigo-400" 
                                : "text-gray-500 dark:text-gray-400 hover:text-gray-700"
                        )}
                    >
                        <Trophy className="w-4 h-4" /> Rangliste
                    </button>
                </div>

                <button 
                    onClick={handleExportPDF}
                    className="p-3 bg-white dark:bg-gray-800 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 transition-all"
                    title="Als PDF Exportieren"
                >
                    <FileDown className="w-5 h-5" />
                </button>
                <button
                    onClick={() => {
                        resetForm();
                        setIsModalOpen(true);
                    }}
                    className="group relative px-6 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-semibold rounded-2xl shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:scale-[1.02] transition-all flex items-center gap-2 overflow-hidden"
                >
                    <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                    <Plus className="w-5 h-5 relative z-10" /> 
                    <span className="relative z-10">Neuer Vertrag</span>
                </button>
            </motion.div>
        </div>

        {viewMode === 'leaderboard' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {leaderboardData.map((data, index) => (
                    <motion.div
                        key={data.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className={cn(
                            "relative overflow-hidden rounded-3xl p-6 border shadow-xl flex flex-col items-center text-center",
                            index === 0 ? "bg-gradient-to-br from-yellow-50 to-amber-100 border-amber-200 dark:from-yellow-900/20 dark:to-amber-900/20 dark:border-amber-700/50" :
                            index === 1 ? "bg-gradient-to-br from-gray-50 to-slate-100 border-slate-200 dark:from-gray-800 dark:to-slate-800 dark:border-gray-700" :
                            index === 2 ? "bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200 dark:from-orange-900/20 dark:to-orange-900/20 dark:border-orange-700/50" :
                            "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700"
                        )}
                    >
                        {index < 3 && (
                            <div className="absolute top-0 right-0 p-4">
                                <Medal className={cn(
                                    "w-8 h-8",
                                    index === 0 ? "text-yellow-500" :
                                    index === 1 ? "text-slate-400" :
                                    "text-orange-500"
                                )} />
                            </div>
                        )}
                        <div className="relative mb-4">
                            <img 
                                src={data.avatar || `https://ui-avatars.com/api/?name=${data.name}&background=random`} 
                                alt={data.name}
                                className={cn(
                                    "w-20 h-20 rounded-full object-cover shadow-lg ring-4",
                                    index === 0 ? "ring-yellow-400" :
                                    index === 1 ? "ring-slate-300" :
                                    index === 2 ? "ring-orange-300" :
                                    "ring-gray-100 dark:ring-gray-700"
                                )} 
                            />
                            <div className="absolute -bottom-2 -right-2 bg-gray-900 text-white w-8 h-8 flex items-center justify-center rounded-full font-bold text-sm shadow-md">
                                #{index + 1}
                            </div>
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{data.name}</h3>

                    </motion.div>
                ))}
            </div>
        ) : (
            <>
                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl p-6 border border-white/20 shadow-xl relative overflow-hidden group"
                    >
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <Euro className="w-24 h-24 text-indigo-600" />
                        </div>
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Gesamtprovision (Liste)</p>
                        <p className="text-4xl font-black text-indigo-600 dark:text-indigo-400 mt-2">{formatCurrency(totalCommission)}</p>
                    </motion.div>

                    <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl p-6 border border-white/20 shadow-xl relative overflow-hidden group"
                    >
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <TrendingUp className="w-24 h-24 text-orange-500" />
                        </div>
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Haftungsreserve (Total)</p>
                        <p className="text-4xl font-black text-orange-500 dark:text-orange-400 mt-2">{formatCurrency(totalLiability)}</p>
                    </motion.div>
                </div>

                {/* Charts Section */}
                {filteredEntries.length > 0 && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Bar Chart: Monthly Revenue */}
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.45 }}
                            className="lg:col-span-2 bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl p-6 border border-white/20 shadow-xl"
                        >
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                                    <BarChartIcon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                                </div>
                                <h3 className="font-bold text-gray-900 dark:text-white">Umsatzentwicklung (letzte 6 Monate)</h3>
                            </div>
                            <div className="h-[300px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                                        <XAxis 
                                            dataKey="name" 
                                            axisLine={false} 
                                            tickLine={false} 
                                            tick={{ fill: '#9CA3AF', fontSize: 12 }} 
                                            dy={10}
                                        />
                                        <YAxis 
                                            axisLine={false} 
                                            tickLine={false} 
                                            tick={{ fill: '#9CA3AF', fontSize: 12 }}
                                            tickFormatter={(val) => `€${val}`}
                                        />
                                        <Tooltip 
                                            cursor={{ fill: '#EEF2FF', opacity: 0.5 }}
                                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
                                            formatter={(value: number) => [formatCurrency(value), 'Umsatz']}
                                        />
                                        <Bar 
                                            dataKey="value" 
                                            fill="#6366f1" 
                                            radius={[6, 6, 0, 0]} 
                                            barSize={40}
                                            animationDuration={1500}
                                        >
                                            {monthlyData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.value > 0 ? '#6366f1' : '#e5e7eb'} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </motion.div>

                        {/* Pie Chart: Categories */}
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.5 }}
                            className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl p-6 border border-white/20 shadow-xl"
                        >
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                                    <PieChart className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                                </div>
                                <h3 className="font-bold text-gray-900 dark:text-white">Verteilung nach Sparte</h3>
                            </div>
                            <div className="h-[300px] w-full relative">
                                <ResponsiveContainer width="100%" height="100%">
                                    <RechartsPieChart>
                                        <Pie
                                            data={categoryData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={80}
                                            paddingAngle={5}
                                            dataKey="value"
                                        >
                                            {categoryData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip 
                                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
                                            formatter={(value: number) => formatCurrency(value)}
                                        />
                                        <Legend 
                                            verticalAlign="bottom" 
                                            height={36} 
                                            iconType="circle"
                                            formatter={(value) => <span className="text-xs font-medium text-gray-500 ml-1">{value}</span>}
                                        />
                                    </RechartsPieChart>
                                </ResponsiveContainer>
                                {/* Center Text */}
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none pb-8">
                                    <div className="text-center">
                                        <span className="text-xs text-gray-400 font-medium">Gesamt</span>
                                        <div className="text-lg font-bold text-gray-900 dark:text-white">
                                            {formatCurrency(totalCommission)}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}

                {/* Filters & Table */}
                <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="bg-white/60 dark:bg-gray-800/60 backdrop-blur-xl rounded-3xl border border-white/20 shadow-xl overflow-hidden"
                >
                    <div className="p-6 border-b border-gray-100 dark:border-gray-700/50 flex flex-col sm:flex-row gap-4 justify-between items-center bg-white/40 dark:bg-gray-900/40">
                        <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0 w-full sm:w-auto scrollbar-hide">
                            {['all', 'life', 'property', 'health', 'legal', 'car'].map(cat => (
                                <button
                                    key={cat}
                                    onClick={() => setFilterCategory(cat)}
                                    className={cn(
                                        "px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all",
                                        filterCategory === cat 
                                            ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/30 scale-105" 
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
                        <div className="relative w-full sm:w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input 
                                type="text" 
                                placeholder="Suchen..." 
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 rounded-xl border-none bg-white/50 dark:bg-gray-800/50 focus:bg-white dark:focus:bg-gray-800 focus:ring-2 focus:ring-indigo-500/20 transition-all text-sm"
                            />
                        </div>
                    </div>

                    <div className="overflow-x-auto hidden md:block">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50/50 dark:bg-gray-900/20">
                                <tr>
                                    <th className="px-6 py-4 font-semibold text-gray-900 dark:text-white">Status</th>
                                    <th className="px-6 py-4 font-semibold text-gray-900 dark:text-white">Kunde</th>
                                    <th className="px-6 py-4 font-semibold text-gray-900 dark:text-white">Betreuer</th>
                                    <th className="px-6 py-4 font-semibold text-gray-900 dark:text-white">Sparte</th>
                                    <th className="px-6 py-4 font-semibold text-gray-900 dark:text-white">Beitrag</th>
                                    <th className="px-6 py-4 font-semibold text-gray-900 dark:text-white">Bewertung</th>
                                    <th className="px-6 py-4 font-semibold text-gray-900 dark:text-white text-right">Provision</th>
                                    <th className="px-6 py-4 font-semibold text-gray-900 dark:text-white text-right">Aktion</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                                {loading ? (
                                    <tr><td colSpan={7} className="px-6 py-12 text-center text-gray-500">Lade Daten...</td></tr>
                                ) : filteredEntries.length === 0 ? (
                                    <tr><td colSpan={7} className="px-6 py-12 text-center text-gray-500">Keine Verträge gefunden.</td></tr>
                                ) : (
                                    filteredEntries.map(entry => (
                                        <tr key={entry.id} className="hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 transition-colors group">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex flex-col gap-1">
                                                    <span className={cn(
                                                        "inline-flex items-center px-2 py-0.5 rounded text-xs font-bold w-fit",
                                                        entry.status === 'policed' ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                                                        entry.status === 'cancelled' ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                                                        "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                                                    )}>
                                                        {entry.status === 'policed' ? 'Policiert' : entry.status === 'cancelled' ? 'Storniert' : 'Eingereicht'}
                                                    </span>
                                                    <span className="text-[10px] text-gray-400">
                                                        {format(new Date(entry.submission_date), 'dd.MM.yy')}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-gray-900 dark:text-white">{entry.customer_name}, {entry.customer_firstname}</div>
                                                <div className="text-xs text-gray-500 font-mono mt-0.5">{entry.policy_number || '-'}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-sm text-gray-900 dark:text-white">{entry.manager?.full_name || '-'}</div>
                                                {entry.profiles?.full_name && entry.profiles.full_name !== entry.manager?.full_name && (
                                                    <div className="text-xs text-gray-400 mt-0.5">Von: {entry.profiles.full_name}</div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={cn(
                                                    "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border",
                                                    entry.category === 'life' ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800" :
                                                    entry.category === 'property' ? "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-800" :
                                                    entry.category === 'health' ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800" :
                                                    "bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700"
                                                )}>
                                                    {entry.category === 'life' ? 'Leben' : 
                                                    entry.category === 'property' ? 'Sach' : 
                                                    entry.category === 'health' ? 'Kranken' : entry.category}
                                                </span>
                                                {entry.sub_category && <div className="text-xs text-gray-500 mt-1 pl-1">{entry.sub_category}</div>}
                                            </td>
                                            <td className="px-6 py-4 text-gray-600 dark:text-gray-300">
                                                <div className="font-medium">{formatCurrency(entry.gross_premium || 0)}</div>
                                                <div className="text-xs text-gray-400">{entry.payment_method}</div>
                                            </td>
                                            <td className="px-6 py-4 text-gray-600 dark:text-gray-300">
                                                <div className="text-xs text-gray-400 mb-0.5">Satz: {entry.commission_rate} {entry.category === 'life' ? '‰' : (entry.category === 'health' && !entry.sub_category?.includes('reise') ? 'MB' : '%')}</div>
                                                <div className="font-medium">{formatCurrency(entry.valuation_sum || 0)}</div>
                                            </td>
                                            <td className="px-6 py-4 text-right font-black text-indigo-600 dark:text-indigo-400">
                                                {formatCurrency(entry.commission_amount || 0)}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button 
                                                        onClick={() => handleEdit(entry)}
                                                        className="p-2 text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-all"
                                                        title="Bearbeiten"
                                                    >
                                                        <Pencil className="w-4 h-4" />
                                                    </button>
                                                    <button 
                                                        onClick={() => handleDelete(entry.id)}
                                                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                                                        title="Löschen"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile Card View */}
                    <div className="md:hidden space-y-4 p-4">
                        {loading ? (
                             <div className="text-center py-10 text-gray-500">Lade Daten...</div>
                        ) : filteredEntries.length === 0 ? (
                             <div className="text-center py-10 text-gray-500">Keine Verträge gefunden.</div>
                        ) : (
                            filteredEntries.map(entry => (
                                <div key={entry.id} onClick={() => handleEdit(entry)} className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 active:scale-[0.98] transition-transform relative">
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="max-w-[60%]">
                                            <h3 className="font-bold text-gray-900 dark:text-white truncate">{entry.customer_name}, {entry.customer_firstname}</h3>
                                            <p className="text-xs text-gray-500 font-mono truncate">{entry.policy_number || 'Keine Schein-Nr.'}</p>
                                            <p className="text-xs text-indigo-500 mt-1 truncate">Betreuer: {entry.manager?.full_name || '-'}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-lg font-black text-indigo-600 dark:text-indigo-400">{formatCurrency(entry.commission_amount || 0)}</p>
                                            <p className="text-[10px] text-gray-400">{format(new Date(entry.submission_date), 'dd.MM.yy')}</p>
                                        </div>
                                    </div>
                                    
                                    <div className="flex flex-wrap items-center gap-2 mb-3">
                                        <span className={cn(
                                            "inline-flex items-center px-2 py-1 rounded-lg text-xs font-bold border",
                                            entry.category === 'life' ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800" :
                                            entry.category === 'property' ? "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-800" :
                                            entry.category === 'health' ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800" :
                                            "bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700"
                                        )}>
                                            {entry.category === 'life' ? 'Leben' : 
                                            entry.category === 'property' ? 'Sach' : 
                                            entry.category === 'health' ? 'Kranken' : entry.category}
                                        </span>
                                        {entry.sub_category && (
                                            <span className="text-xs text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-lg truncate max-w-[150px]">
                                                {entry.sub_category}
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex justify-between items-end border-t border-gray-100 dark:border-gray-700 pt-3">
                                        <div>
                                            <p className="text-xs text-gray-400">Bewertung</p>
                                            <p className="text-sm font-bold text-gray-700 dark:text-gray-300">{formatCurrency(entry.valuation_sum || 0)}</p>
                                        </div>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleDelete(entry.id); }}
                                            className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors z-10"
                                        >
                                            <Trash2 className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </motion.div>
            </>
        )}

        {/* New Entry Modal */}
        <Modal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            title={editingId ? "Vertrag bearbeiten" : "Neuen Vertrag erfassen"}
            size="2xl"
        >
            <form onSubmit={handleSubmit} className="space-y-8">
                
                {/* 1. Category Selection */}
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                    {INSURANCE_TYPES.map(c => (
                        <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                                setCategory(c.id);
                                setSubCategory(c.subcategories[0]);
                            }}
                            className={cn(
                                "flex flex-col items-center justify-center p-3 rounded-2xl border transition-all hover:scale-105 active:scale-95",
                                category === c.id 
                                    ? "border-indigo-500 bg-indigo-50/50 text-indigo-700 ring-2 ring-indigo-500 ring-offset-2 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-500 dark:ring-offset-gray-800" 
                                    : "border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700 dark:text-gray-300"
                            )}
                        >
                            <span className="text-2xl mb-2">{c.icon}</span>
                            <span className="text-xs font-semibold">{c.label}</span>
                        </button>
                    ))}
                </div>

                {/* 2. Customer & Basic Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                        {/* Row 1: Names */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Nachname</label>
                                <input required type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} className="w-full rounded-xl border-transparent bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 px-4 py-2.5 text-sm transition-all" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Vorname</label>
                                <input type="text" value={customerFirstname} onChange={e => setCustomerFirstname(e.target.value)} className="w-full rounded-xl border-transparent bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 px-4 py-2.5 text-sm transition-all" />
                            </div>
                        </div>

                        {/* Row 2: Policy No & Status */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Versicherungsschein-Nr.</label>
                                <input type="text" value={policyNumber} onChange={e => setPolicyNumber(e.target.value)} className="w-full rounded-xl border-transparent bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 px-4 py-2.5 text-sm transition-all" />
                            </div>
                             <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Status</label>
                                <select 
                                    value={status} 
                                    onChange={(e) => setStatus(e.target.value as any)} 
                                    className={cn(
                                        "w-full rounded-xl border-transparent px-3 py-2.5 text-sm shadow-sm transition-all focus:ring-2 focus:ring-indigo-500/20",
                                        status === 'submitted' ? "bg-blue-50 text-blue-700" :
                                        status === 'policed' ? "bg-green-50 text-green-700" :
                                        "bg-red-50 text-red-700"
                                    )}
                                >
                                    <option value="submitted">Eingereicht</option>
                                    <option value="policed">Policiert</option>
                                    <option value="cancelled">Storniert</option>
                                </select>
                            </div>
                        </div>

                        {/* Row 3: Management & Dates */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Betreuung von</label>
                                <div className="relative">
                                    <select 
                                        value={managedBy} 
                                        onChange={e => setManagedBy(e.target.value)} 
                                        className="w-full appearance-none rounded-xl border-transparent bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 px-4 py-2.5 text-sm transition-all pr-8"
                                    >
                                        <option value="">Bitte wählen...</option>
                                        {profiles.map(p => (
                                            <option key={p.id} value={p.id}>
                                                {p.full_name} {p.agency_number ? `(${p.agency_number})` : ''}
                                            </option>
                                        ))}
                                    </select>
                                    <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
                                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                    </div>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Einreichungsdatum</label>
                                <input type="date" value={submissionDate} onChange={e => setSubmissionDate(e.target.value)} className="w-full rounded-xl border-transparent bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 px-4 py-2.5 text-sm transition-all" />
                            </div>
                        </div>
                        
                        {/* Row 4: Extra Dates */}
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                             <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Vertragsbeginn</label>
                                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full rounded-xl border-transparent bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 px-4 py-2.5 text-sm transition-all" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Policierungsdatum</label>
                                <input type="date" value={policingDate} onChange={e => setPolicingDate(e.target.value)} className="w-full rounded-xl border-transparent bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 px-4 py-2.5 text-sm transition-all" />
                            </div>
                        </div>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                             <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Provisionserhalt</label>
                                <input type="date" value={commissionReceivedDate} onChange={e => setCommissionReceivedDate(e.target.value)} className="w-full rounded-xl border-transparent bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 px-4 py-2.5 text-sm transition-all" />
                            </div>
                             <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Abschluss von</label>
                                <div className="relative">
                                    <select 
                                        value={closedBy} 
                                        onChange={e => setClosedBy(e.target.value)} 
                                        className="w-full appearance-none rounded-xl border-transparent bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 px-4 py-2.5 text-sm transition-all pr-8"
                                    >
                                        <option value="">Bitte wählen...</option>
                                        {profiles.map(p => (
                                            <option key={p.id} value={p.id}>
                                                {p.full_name} {p.agency_number ? `(${p.agency_number})` : ''}
                                            </option>
                                        ))}
                                    </select>
                                    <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
                                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 3. Contract Details (Dynamic) */}
                    <div className="bg-gray-50/50 dark:bg-gray-800/50 p-6 rounded-3xl space-y-4 border border-gray-100 dark:border-gray-700 h-fit">
                        <h3 className="font-bold text-gray-900 dark:text-white text-sm flex items-center gap-2 mb-2">
                            <FileText className="w-4 h-4 text-indigo-500" /> Vertragsdaten
                        </h3>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1.5">Sparte / Tarif</label>
                                <select 
                                    value={subCategory} 
                                    onChange={e => setSubCategory(e.target.value)} 
                                    className="w-full rounded-xl border-transparent bg-white focus:ring-2 focus:ring-indigo-500/20 px-3 py-2.5 text-sm shadow-sm" 
                                >
                                    {INSURANCE_TYPES.find(c => c.id === category)?.subcategories.map(sc => (
                                        <option key={sc} value={sc}>{sc}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1.5">Zahlweise</label>
                                <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="w-full rounded-xl border-transparent bg-white focus:ring-2 focus:ring-indigo-500/20 px-3 py-2.5 text-sm shadow-sm">
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
                                <label className="block text-xs font-medium text-gray-500 mb-1.5">Beitrag Netto</label>
                                <div className="relative">
                                    <input type="number" step="0.01" value={netPremium} onChange={e => setNetPremium(e.target.value ? Number(e.target.value) : '')} className="w-full rounded-xl border-transparent bg-white pl-8 px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 shadow-sm" />
                                    <span className="absolute left-3 top-2.5 text-gray-400 text-xs">€</span>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1.5">Beitrag Brutto</label>
                                <div className="relative">
                                    <input type="number" step="0.01" value={grossPremium} onChange={e => setGrossPremium(e.target.value ? Number(e.target.value) : '')} className="w-full rounded-xl border-transparent bg-white pl-8 px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 shadow-sm" />
                                    <span className="absolute left-3 top-2.5 text-gray-400 text-xs">€</span>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1.5">Laufzeit (J)</label>
                                <input type="number" value={duration} onChange={e => setDuration(Number(e.target.value))} className="w-full rounded-xl border-transparent bg-white px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 shadow-sm" />
                            </div>
                        </div>

                         {/* Notes Area */}
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1.5">Bemerkungen</label>
                            <textarea 
                                value={notes} 
                                onChange={e => setNotes(e.target.value)} 
                                rows={3}
                                className="w-full rounded-xl border-transparent bg-white px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 shadow-sm resize-none"
                                placeholder="Wichtige Hinweise..."
                            />
                        </div>
                    </div>
                </div>

                {/* 4. Calculation Preview */}
                <div className="bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-900/20 dark:to-violet-900/20 p-6 rounded-3xl space-y-4 border border-indigo-100 dark:border-indigo-800/30">
                    <h3 className="font-bold text-indigo-900 dark:text-indigo-300 text-sm flex items-center gap-2">
                        <Euro className="w-4 h-4" /> Provision (Vorschau)
                    </h3>
                    
                    <div className="grid grid-cols-3 gap-6">
                        <div className="bg-white/50 dark:bg-gray-800/50 p-3 rounded-2xl">
                            <label className="block text-xs font-medium text-indigo-400 mb-1">
                                {category === 'life' ? 'Promille' : (['KV Voll', 'KV Zusatz'].includes(subCategory) ? 'MB-Faktor' : 'Prozent')}
                            </label>
                            <input 
                                type="number" 
                                step="0.1" 
                                value={commissionRate} 
                                readOnly
                                className="w-full bg-transparent border-none p-0 text-xl font-black text-indigo-700 dark:text-indigo-300 focus:ring-0" 
                            />
                        </div>
                        <div className="bg-white/50 dark:bg-gray-800/50 p-3 rounded-2xl">
                            <label className="block text-xs font-medium text-indigo-400 mb-1">
                                {category === 'life' ? 'Bewertungssumme' : (['KV Voll', 'KV Zusatz'].includes(subCategory) ? 'Monatsbeitrag' : 'Jahresbeitrag')}
                            </label>
                            <div className="text-xl font-bold text-indigo-900 dark:text-indigo-200">
                                {formatCurrency(valuationSum)}
                            </div>
                        </div>
                        <div className="bg-white/80 dark:bg-gray-800/80 p-3 rounded-2xl shadow-sm ring-1 ring-indigo-100 dark:ring-indigo-700/50">
                            <label className="block text-xs font-bold text-indigo-600 dark:text-indigo-400 mb-1">PROVISION</label>
                            <div className="text-2xl font-black text-green-600 dark:text-green-400">
                                {formatCurrency(commissionAmount)}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 pt-4 border-t border-indigo-200/50 dark:border-indigo-700/30">
                         <div className="flex items-center gap-3 bg-white/50 dark:bg-gray-800/50 px-4 py-2 rounded-xl">
                             <input 
                                 type="checkbox" 
                                 id="liabilityCheck"
                                 checked={liabilityActive}
                                 onChange={e => setLiabilityActive(e.target.checked)}
                                 className="rounded-lg border-gray-300 text-indigo-600 focus:ring-indigo-500 w-5 h-5"
                             />
                             <label htmlFor="liabilityCheck" className="text-sm text-gray-700 dark:text-gray-300 font-medium cursor-pointer">Stornohaftung einbehalten</label>
                         </div>
                         {liabilityActive && (
                             <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-4">
                                 <input 
                                     type="number" 
                                     value={liabilityRate} 
                                     onChange={e => setLiabilityRate(Number(e.target.value))} 
                                     className="w-20 rounded-xl border-transparent bg-white dark:bg-gray-800 focus:ring-2 focus:ring-indigo-500/20 px-3 py-2 text-sm font-bold text-center" 
                                 />
                                 <span className="text-sm font-bold text-indigo-400">%</span>
                             </div>
                         )}
                    </div>
                </div>

                <div className="flex justify-end gap-3 pt-4">
                    <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">Abbrechen</button>
                    <button type="submit" disabled={submitting} className="px-6 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-lg shadow-indigo-500/30 transition-all hover:scale-[1.02]">
                        {editingId ? 'Änderungen speichern' : 'Vertrag einreichen'}
                    </button>
                </div>
            </form>
        </Modal>
    </div>
  );
};
