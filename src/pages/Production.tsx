import { useEffect, useState } from 'react';
import { openStoredFile } from '@/lib/storage';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { useLocation } from 'react-router-dom';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Menu as MenuRoot, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { Plus, Search, FileText, Trash2, Download, Pencil, FileDown, Trophy, LayoutGrid, Sparkles, Loader2, UploadCloud, FileSpreadsheet, ChevronDown, CalendarRange, Hourglass, ListChecks } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Modal } from '@/components/Modal';
import { ConfirmModal } from '@/components/ConfirmModal';
import { Avatar, Badge, Button, EmptyState, Field, PageHeader, Segmented } from '@/components/ui';
import { toast } from 'react-hot-toast';
import { useDropzone } from 'react-dropzone';
import { LiabilityTrackerModal } from '@/components/LiabilityTrackerModal';
import { ProductionStats } from '@/components/Production/ProductionStats';
import { ProductionCharts } from '@/components/Production/ProductionCharts';
import { extractPdfText } from '@/utils/extractPdfText';
import { parseContractFromText } from '@/utils/pdfParser';
import { INSURANCE_TYPES } from '@/utils/constants';
import { CATEGORY_COLORS } from '@/lib/chartTheme';
import { correctedMonthlyLv, computedMonthlyLv, fetchLvSnapshots, sumUntil, type LvSnapshot } from '@/lib/lifeValues';

const formatCurrency = (amount: number | null | undefined) => {
  if (amount === null || amount === undefined || isNaN(amount)) return '0,00 €';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
};

const PAYMENT_LABEL: Record<string, string> = {
  monthly: 'monatlich',
  quarterly: 'vierteljährlich',
  half_yearly: 'halbjährlich',
  yearly: 'jährlich',
  one_time: 'einmalig',
};

const STATUS_META: Record<string, { label: string; tone: 'info' | 'success' | 'danger' }> = {
  submitted: { label: 'Eingereicht', tone: 'info' },
  policed: { label: 'Policiert', tone: 'success' },
  cancelled: { label: 'Storniert', tone: 'danger' },
};

const categoryLabel = (id: string) => INSURANCE_TYPES.find((t) => t.id === id)?.label || id;

export const Production = () => {
  const { user, profile } = useStore();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyOpenCommission, setOnlyOpenCommission] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportMonth, setReportMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [reportScope, setReportScope] = useState<'me' | 'team'>('me');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'personal' | 'leaderboard'>('personal');
  const [boardPeriod, setBoardPeriod] = useState<'month' | 'year' | 'all'>('month');
  const thisYear = new Date().getFullYear();
  // Angezeigtes Jahr (auch Vorjahre); 'all' = alle Jahre
  const [selectedYear, setSelectedYear] = useState<number | 'all'>(thisYear);
  // Lebenswerte-Stand laut Monatsliste (für angezeigtes und aktuelles Jahr)
  const [lvSnapshots, setLvSnapshots] = useState<LvSnapshot[]>([]);
  const [lvModalOpen, setLvModalOpen] = useState(false);
  const [lvMonth, setLvMonth] = useState(() => format(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1), 'yyyy-MM'));
  const [lvValue, setLvValue] = useState('');
  const [lvUserId, setLvUserId] = useState<string>('');
  const [lvSaving, setLvSaving] = useState(false);
  const [chartMode, setChartMode] = useState<'revenue' | 'life_values'>('revenue'); // New: Toggle Charts
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isLiabilityModalOpen, setIsLiabilityModalOpen] = useState(false);

  const openProductionDoc = (pathOrUrl: string) => {
      if (!pathOrUrl) return;
      if (/^https?:\/\//.test(pathOrUrl) && !pathOrUrl.includes('/storage/v1/object/')) {
          window.open(pathOrUrl, '_blank', 'noopener,noreferrer');
          return;
      }
      openStoredFile('production_docs', pathOrUrl);
  };

  // Dropzone for PDF Analysis
  const onDrop = async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (file) {
          setSelectedFile(file);
          // Automatically trigger AI analysis when file is dropped
          setTimeout(() => {
              // We pass the file directly to avoid stale state issues in handleAIAnalysis
              handleAIAnalysisWithFile(file);
          }, 100);
      }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
      onDrop,
      accept: {
          'application/pdf': ['.pdf']
      },
      multiple: false,
      noClick: true,
      noKeyboard: true
  });

  const handleAIAnalysisWithFile = async (fileToAnalyze: File) => {
      setIsAnalyzing(true);
      
      try {
          const isPdf =
              fileToAnalyze.type.toLowerCase().includes('pdf') ||
              fileToAnalyze.name.toLowerCase().endsWith('.pdf');

          if (isPdf) {
              let extractedText = '';
              try {
                  extractedText = await extractPdfText(fileToAnalyze, 3);
              } catch (e: unknown) {
                console.error('PDF Extraction Error Full:', e);
                const msg = e instanceof Error ? e.message : String(e) || 'Unbekannter Fehler';
                toast.error(`PDF konnte nicht gelesen werden: ${msg}`);
                  return;
              }
              if (!extractedText || extractedText.length < 50) {
                  toast.error('PDF scheint ein Scan zu sein (kein Text). Ohne OCR kann ich daraus nichts lesen.');
                  return;
              }

              const parsed = parseContractFromText(extractedText);
              const hasAny =
                  Boolean(parsed.customer_name) ||
                  Boolean(parsed.customer_firstname) ||
                  Boolean(parsed.policy_number) ||
                  Boolean(parsed.net_premium) ||
                  Boolean(parsed.start_date) ||
                  Boolean(parsed.sub_category);

              if (!hasAny) {
                  toast.error('KI hat das Dokument analysiert, konnte aber keine eindeutigen Daten extrahieren.');
                  return;
              }

              toast.success('Daten aus PDF-Text extrahiert und vorbefüllt.');
              if (parsed.customer_name) setCustomerName(parsed.customer_name);
              if (parsed.customer_firstname) setCustomerFirstname(parsed.customer_firstname);
              if (parsed.policy_number) setPolicyNumber(parsed.policy_number);
              if (parsed.start_date) setStartDate(parsed.start_date);
              if (parsed.category) setCategory(parsed.category);
              if (parsed.sub_category) setSubCategory(parsed.sub_category);
              if (parsed.net_premium !== undefined) setNetPremium(parsed.net_premium);
              if (parsed.payment_method) setPaymentMethod(parsed.payment_method);
              return;
          }

          // ... (Rest of edge function fallback logic can remain if needed)
      } catch (error) {
          console.error('AI Analysis Error:', error);
          toast.error(`Fehler bei der KI-Analyse: ${(error as Error)?.message}`);
      } finally {
          setIsAnalyzing(false);
      }
  };

  const handleAIAnalysis = async () => {
      if (!selectedFile) return;
      await handleAIAnalysisWithFile(selectedFile);
  };

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
  const [submissionDate, setSubmissionDate] = useState(format(new Date(), 'yyyy-MM-dd'));
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
  const [valuationSum, setValuationSum] = useState(0); // AP-Summe
  const [commissionAmount, setCommissionAmount] = useState(0);
  const [lifeValues, setLifeValues] = useState(0); // New: Lebenswerte
  const [lifeValueFactor, setLifeValueFactor] = useState<number>(0); // New: Factor for Lebenswerte
  // Von Hand gesetzter Faktor (null = automatisch nach Sparte). Bleibt beim Bearbeiten erhalten.
  const [manualLvFactor, setManualLvFactor] = useState<number | null>(null);

  const [profiles, setProfiles] = useState<{id: string; full_name: string; agency_number?: string; monthly_goal?: number | null; yearly_goal?: number | null; is_approved?: boolean}[]>([]); // For "Managed By" dropdown

  useEffect(() => {
      const loadProfiles = async () => {
          const { data } = await supabase.from('profiles').select('id, full_name, agency_number, monthly_goal, yearly_goal, is_approved');
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


    // 2. Determine Rate and Calculate Commission
    let valSum = 0;
    let comm = 0;
    let rate = 0;

    // Get rate from loaded user settings (or default if not loaded yet)
    rate = userRates[subCategory] || 0;

    // NEW RULE: Provisionsberechnung und Lebenswert berechnung wird immer auf maximal 35 Jahre berechnet, EGAL welche Sparte
    const cappedDuration = Math.min(duration, 35);

    if (subCategory === 'Leben' || subCategory === 'BU') {
        valSum = grossYearly * cappedDuration;
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
        // Bei Sach-Verträgen (laufende Courtage) wird die Provision auf den Zahlweise-Beitrag (netP) gerechnet
        comm = netP * (rate / 100);
    }
    
    // 3. Calculate Life Values (Lebenswerte)
    let lvFactor = 0;
    let lv = 0;

    // Logic for Lebenswerte Factor
    if (subCategory === 'Leben' || subCategory === 'BU') {
        lvFactor = 1.147;
    } else if (category === 'car') {
        lvFactor = 1;
    } else if (category === 'property' || category === 'legal' || category === 'other') {
        // "bei den anderen Sach geschichten bei 20"
        lvFactor = 20;
    }
    // Ein von Hand eingetragener Faktor geht vor (sonst würde er bei jeder Änderung überschrieben)
    if (manualLvFactor !== null) lvFactor = manualLvFactor;
    // Basis: Leben/BU die Bewertungssumme, sonst der Jahres-Nettobeitrag
    lv = (subCategory === 'Leben' || subCategory === 'BU' ? valSum : netYearly) * lvFactor;

    setCommissionRate(rate);
    setValuationSum(valSum);
    setCommissionAmount(comm);
    setLifeValueFactor(lvFactor);
    setLifeValues(lv);

  }, [netPremium, grossPremium, duration, paymentMethod, subCategory, userRates, category, manualLvFactor]); 
  
  // Update Category when SubCategory changes (reverse lookup if needed, or just handle in UI)
  useEffect(() => {
      const parent = INSURANCE_TYPES.find(t => t.subcategories.includes(subCategory));
      if (parent && parent.id !== category) {
          setCategory(parent.id);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const loadLvSnapshots = async () => {
    const years = Array.from(new Set([thisYear, typeof selectedYear === 'number' ? selectedYear : thisYear, Number(lvMonth.slice(0, 4))]));
    const lists = await Promise.all(years.map((y) => fetchLvSnapshots(y)));
    setLvSnapshots(lists.flat());
  };

  useEffect(() => {
    loadLvSnapshots();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear, lvMonth]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);

    try {
        let finalDocumentUrl = documentUrl;

        // Upload file if selected
        if (selectedFile) {
            try {
                const fileExt = selectedFile.name.split('.').pop();
                const safeExt = fileExt ? fileExt : 'bin';
                const fileName = `${user.id}/${crypto.randomUUID()}.${safeExt}`;

                const { error: uploadError } = await supabase.storage
                    .from('production_docs')
                    .upload(fileName, selectedFile, { upsert: true });

                if (uploadError) {
                    toast.error(`Dokument Upload fehlgeschlagen: ${uploadError.message}`);
                } else {
                    finalDocumentUrl = fileName;
                }
            } catch (e) {
                const msg = (e as Error)?.message || 'Unbekannter Fehler';
                toast.error(`Dokument Upload fehlgeschlagen: ${msg}`);
            }
        }

        const basePayload = {
            managed_by: managedBy || closedBy || user.id, // Can be another user
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
            gross_premium: Number(grossPremium),
            commission_rate: Number(commissionRate),
            valuation_sum: valuationSum,
            commission_amount: commissionAmount,
            liability_rate: liabilityActive ? Number(liabilityRate) : 0,
            status,
            notes,
            life_values: lifeValues,
            life_value_factor: lifeValueFactor,
            document_url: finalDocumentUrl
        };

        if (editingId) {
            // Update everything including user_id if changed
            const { error } = await supabase
                .from('production_entries')
                .update(basePayload)
                .eq('id', editingId);
            if (error) {
                if (error.message?.toLowerCase().includes('document_url') && error.message?.toLowerCase().includes('column')) {
                    toast.error('Dokumente sind in der DB noch nicht aktiviert. Bitte SQL Migration ausführen.');
                    const { error: retryError } = await supabase
                        .from('production_entries')
                        .update({ ...basePayload, document_url: undefined })
                        .eq('id', editingId);
                    if (retryError) throw retryError;
                } else {
                    throw error;
                }
            }
            toast.success('Vertrag aktualisiert!');
        } else {
            const { error } = await supabase
                .from('production_entries')
                .insert({ ...basePayload, user_id: user.id });

            if (error) {
                if (error.message?.toLowerCase().includes('document_url') && error.message?.toLowerCase().includes('column')) {
                    toast.error('Dokumente sind in der DB noch nicht aktiviert. Bitte SQL Migration ausführen.');
                    const { error: retryError } = await supabase
                        .from('production_entries')
                        .insert({ ...basePayload, document_url: undefined, user_id: user.id });
                    if (retryError) throw retryError;
                } else if (error.message?.toLowerCase().includes('row-level security')) {
                    throw new Error('Keine Berechtigung (RLS): Du kannst nur Verträge für deinen User speichern.');
                } else {
                    throw error;
                }
            }
            toast.success('Vertrag erfasst!');
        }

        setIsModalOpen(false);
        resetForm();
        fetchEntries();
    } catch (err) {
        console.error(err);
        const msg = (err as Error)?.message || 'Unbekannter Fehler';
        toast.error(`Fehler beim Speichern: ${msg}`);
    } finally {
        setSubmitting(false);
    }
  };

  const resetForm = () => {
      setEditingId(null);
      setCustomerName('');
      setCustomerFirstname('');
      setPolicyNumber('');
      setSubmissionDate(format(new Date(), 'yyyy-MM-dd'));
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
      setLifeValues(0);
      setLifeValueFactor(0);
      setManualLvFactor(null);
      setSelectedFile(null);
      setDocumentUrl(null);
      // Reset category to defaults if needed
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      setLifeValues(entry.life_values || 0);
      setLifeValueFactor(entry.life_value_factor || 0);
      // Gespeicherten Faktor übernehmen, damit eine frühere Handeingabe nicht verloren geht
      setManualLvFactor(entry.life_value_factor ?? null);
      setDocumentUrl(entry.document_url || null);
      setSelectedFile(null);
      
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

  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleDelete = (id: string) => setDeleteId(id);

  const confirmDelete = async () => {
      if (!deleteId) return;
      const doc = entries.find((e) => e.id === deleteId)?.document_url;
      const { error } = await supabase.from('production_entries').delete().eq('id', deleteId);
      if (error) toast.error('Vertrag konnte nicht gelöscht werden.');
      else {
          if (doc && !doc.startsWith('http')) await supabase.storage.from('production_docs').remove([doc]);
          toast.success('Vertrag gelöscht');
          fetchEntries();
      }
      setDeleteId(null);
  };

  // Filter entries based on viewMode
  const filteredEntries = entries.filter(e => {
      if (viewMode === 'personal' && e.user_id !== user?.id) return false;
      if (selectedYear !== 'all' && !String(e.submission_date || '').startsWith(`${selectedYear}-`)) return false;
      if (filterCategory !== 'all' && e.category !== filterCategory) return false;
      if (onlyOpenCommission && !(e.status === 'policed' && !e.commission_received_date)) return false;
      const search = searchQuery.toLowerCase();
      return (
          e.customer_name?.toLowerCase().includes(search) ||
          e.customer_firstname?.toLowerCase().includes(search) ||
          e.policy_number?.toLowerCase().includes(search) ||
          e.sub_category?.toLowerCase().includes(search) ||
          e.insurance_company?.toLowerCase().includes(search) ||
          e.notes?.toLowerCase().includes(search) ||
          e.manager?.full_name?.toLowerCase().includes(search)
      );
  });

  // Stornierte Verträge zählen nicht in Summen, Diagramme und Rangliste
  const activeEntries = filteredEntries.filter(e => e.status !== 'cancelled');
  const cancelledCount = filteredEntries.length - activeEntries.length;
  const totalCommission = activeEntries.reduce((acc, curr) => acc + Number(curr.commission_amount || 0), 0);
  const totalLifeValues = activeEntries.reduce((acc, curr) => acc + Number(curr.life_values || 0), 0);
  const totalLiability = activeEntries.reduce((acc, curr) => acc + (Number(curr.commission_amount || 0) * Number(curr.liability_rate || 0) / 100), 0);

  // Lebenswerte mit Monatslisten-Korrektur: nur sinnvoll für die eigene Gesamtsumme eines Jahres (ohne Filter)
  const canCorrectLv = viewMode === 'personal' && selectedYear !== 'all' && filterCategory === 'all' && !searchQuery && !onlyOpenCommission && !!user;
  const myCorrectedLv = canCorrectLv ? correctedMonthlyLv(entries, lvSnapshots, user!.id, selectedYear as number) : null;
  const myComputedLv = canCorrectLv ? computedMonthlyLv(entries, user!.id, selectedYear as number) : null;
  const shownLifeValues = myCorrectedLv ? sumUntil(myCorrectedLv) : totalLifeValues;
  const lvCorrection = myCorrectedLv && myComputedLv ? sumUntil(myCorrectedLv) - sumUntil(myComputedLv) : 0;
  const yearOptions = Array.from(new Set([thisYear, ...entries.map(e => Number(String(e.submission_date || '').slice(0, 4))).filter(Boolean)])).sort((a, b) => b - a);

  // --- LEADERBOARD CALCULATION ---
  // Zeitraum wählbar; Zielerreichung nach Lebenswerten gegen das eigene Monats- bzw. Jahresziel
  const getLeaderboardData = () => {
      const prefix = boardPeriod === 'month' ? format(new Date(), 'yyyy-MM') : boardPeriod === 'year' ? format(new Date(), 'yyyy') : '';
      const userTotals: Record<string, { name: string; avatar: string; amount: number; lv: number; count: number }> = {};

      entries.filter(e => e.status !== 'cancelled' && String(e.submission_date || '').startsWith(prefix)).forEach(e => {
          const userId = e.user_id;
          if (!userTotals[userId]) {
              userTotals[userId] = {
                  name: e.profiles?.full_name || 'Unbekannt',
                  avatar: e.profiles?.avatar_url,
                  amount: 0,
                  lv: 0,
                  count: 0
              };
          }
          userTotals[userId].amount += Number(e.commission_amount || 0);
          userTotals[userId].lv += Number(e.life_values || 0);
          userTotals[userId].count += 1;
      });

      return Object.entries(userTotals)
        .map(([id, data]) => {
            const p = profiles.find(pr => pr.id === id);
            const monthly = Number(p?.monthly_goal) || 0;
            // Lebenswerte nach Monatsliste korrigiert (Monat bzw. Jahr bis heute)
            if (boardPeriod !== 'all') {
                const corrected = correctedMonthlyLv(entries, lvSnapshots, id, thisYear);
                data.lv = boardPeriod === 'month' ? corrected[new Date().getMonth()] : sumUntil(corrected);
            }
            const goal = boardPeriod === 'month' ? monthly : boardPeriod === 'year' ? Number(p?.yearly_goal) || monthly * 12 : 0;
            return { id, ...data, goal, goalPct: goal ? Math.round((data.lv / goal) * 100) : null };
        })
        .sort((a, b) => b.amount - a.amount);
  };

  const leaderboardData = getLeaderboardData();

  // --- CHART DATA PREPARATION ---
  
  // 1. Monthly Data (Last 6 Months)
  const getMonthlyData = () => {
      // Immer vom 1. des Monats aus rechnen, sonst springt setMonth am 29.–31. über kurze Monate
      const now = new Date();
      const months = selectedYear !== 'all' && selectedYear !== thisYear
          ? Array.from({ length: 12 }, (_, i) => new Date(selectedYear, i, 1))
          : Array.from({ length: 6 }, (_, i) => new Date(now.getFullYear(), now.getMonth() - (5 - i), 1));

      return months.map(date => {
          const monthKey = format(date, 'yyyy-MM');
          const monthLabel = format(date, 'MMM', { locale: de });
          
          const rows = activeEntries.filter(e => String(e.submission_date || '').startsWith(monthKey));
          const total = rows.reduce((acc, curr) => acc + Number(curr.commission_amount || 0), 0);
          let totalLifeValues = rows.reduce((acc, curr) => acc + Number(curr.life_values || 0), 0);
          if (myCorrectedLv && date.getFullYear() === selectedYear) totalLifeValues = myCorrectedLv[date.getMonth()];

          return { name: monthLabel, value: total, lifeValues: totalLifeValues };
      });
  };
  
  const monthlyData = getMonthlyData();

  // 2. Category Distribution
  const getCategoryData = () => {
      const data: Record<string, number> = {};
      activeEntries.forEach(e => {
          data[e.category] = (data[e.category] || 0) + Number(e.commission_amount || 0);
      });

      return Object.entries(data)
        .map(([id, value]) => ({ id, name: categoryLabel(id), value }))
        .sort((a, b) => b.value - a.value); // Sort by highest value
  };

  const categoryData = getCategoryData();


  const handleExport = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const exportEntries = entries.filter((e: any) => {
          if (e.user_id !== user?.id) return false;
          if (filterCategory !== 'all' && e.category !== filterCategory) return false;
          const search = searchQuery.toLowerCase();
          return (
              e.customer_name?.toLowerCase().includes(search) ||
              e.policy_number?.toLowerCase().includes(search)
          );
      });

      if (exportEntries.length === 0) {
          toast.error('Keine eigenen Verträge in dieser Auswahl.');
          return;
      }
      
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
          'Faktor (LW)',
          'Lebenswerte',
          'Satz', 
          'Provision',
          'Betreuer'
      ];

      // Text für CSV: Anführungszeichen verdoppeln, Formel-Anfänge entschärfen (Excel würde sie ausführen)
      const csvText = (val: string | null | undefined) => {
          const v = String(val ?? '');
          return `"${(/^[=+\-@\t\r]/.test(v) ? "'" + v : v).replace(/"/g, '""')}"`;
      };

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
          ...exportEntries.map(e => {
              // Find manager name if possible (not joined in current select, need to check fetch)
              // We fetched profiles(full_name) for user_id. We might need managed_by join too.
              // For now, let's just use what we have or skip name if not joined.
              // We only joined `profiles` on `user_id`.
              // We should update fetchEntries to join `managed_by` as well.
              return [
                  statusMap[e.status] || e.status,
                  format(new Date(e.submission_date), 'dd.MM.yyyy'),
                  e.policing_date ? format(new Date(e.policing_date), 'dd.MM.yyyy') : '',
                  csvText(e.customer_name),
                  csvText(e.customer_firstname),
                  csvText(e.policy_number),
                  catMap[e.category] || e.category,
                  csvText(e.sub_category),
                  payMap[e.payment_method] || e.payment_method,
                  fmtNum(e.gross_premium),
                  fmtNum(e.net_premium),
                  fmtNum(e.valuation_sum),
                  fmtNum(e.life_value_factor),
                  fmtNum(e.life_values),
                  fmtNum(e.commission_rate),
                  fmtNum(e.commission_amount),
                  csvText(e.manager?.full_name)
              ].join(';');
          })
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `Produktion_Export_Personal_${format(new Date(), 'yyyy-MM-dd')}.csv`;
      link.click();
  };

  // Provision noch nicht eingegangen: policierte eigene Verträge ohne Eingangsdatum
  const openCommission = entries.filter(e => e.user_id === user?.id && e.status === 'policed' && !e.commission_received_date);
  const openCommissionSum = openCommission.reduce((a, e) => a + Number(e.commission_amount || 0), 0);

  const markCommissionReceived = async (id: string) => {
      const { error } = await supabase.from('production_entries').update({ commission_received_date: format(new Date(), 'yyyy-MM-dd') }).eq('id', id);
      if (error) toast.error('Konnte nicht gespeichert werden.');
      else {
          toast.success('Provision als erhalten markiert');
          fetchEntries();
      }
  };

  // --- Lebenswerte-Stand laut Monatsliste ---
  const lvTargetUser = lvUserId || user?.id || '';
  const lvYear = Number(lvMonth.slice(0, 4));
  const lvMonthIdx = Number(lvMonth.slice(5, 7)) - 1;
  const lvAppValue = lvTargetUser ? sumUntil(correctedMonthlyLv(entries, lvSnapshots.filter(sn => sn.month !== `${lvMonth}-01`), lvTargetUser, lvYear), lvMonthIdx) : 0;
  const lvExisting = lvSnapshots.filter(sn => sn.user_id === lvTargetUser && sn.month.startsWith(`${lvYear}-`)).sort((a, b) => a.month.localeCompare(b.month));

  const saveLvSnapshot = async () => {
      const value = Number(lvValue.replace(/\./g, '').replace(',', '.'));
      if (!lvTargetUser || !lvMonth || !Number.isFinite(value) || value < 0) {
          toast.error('Bitte Monat und einen gültigen Stand eingeben.');
          return;
      }
      setLvSaving(true);
      const { error } = await supabase.from('production_lv_snapshots').upsert({
          user_id: lvTargetUser,
          month: `${lvMonth}-01`,
          ytd_lv: value,
          updated_by: user?.id,
          updated_at: new Date().toISOString(),
      });
      setLvSaving(false);
      if (error) {
          toast.error('Stand konnte nicht gespeichert werden.');
          return;
      }
      toast.success('Lebenswerte-Stand gespeichert');
      setLvValue('');
      loadLvSnapshots();
  };

  const deleteLvSnapshot = async (snap: LvSnapshot) => {
      const { error } = await supabase.from('production_lv_snapshots').delete().eq('user_id', snap.user_id).eq('month', snap.month);
      if (error) toast.error('Stand konnte nicht gelöscht werden.');
      else loadLvSnapshots();
  };

  const handleMonthlyReport = async () => {
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
      const [y, m] = reportMonth.split('-').map(Number);
      const snaps = await fetchLvSnapshots(y);
      const monthDate = new Date(y, m - 1, 1);
      const monthLabel = format(monthDate, 'MMMM yyyy', { locale: de });
      const inMonth = entries.filter(e => String(e.submission_date || '').startsWith(reportMonth));
      const scope = profile?.roles?.includes('admin') ? reportScope : 'me';
      const scoped = scope === 'me' ? inMonth.filter(e => e.user_id === user?.id) : inMonth;
      const num = (v: number) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(v);

      const doc = new jsPDF();
      doc.setFontSize(18);
      doc.text(`Monatsbericht ${monthLabel}`, 14, 20);
      doc.setFontSize(10);
      doc.setTextColor(110);
      doc.text(`${scope === 'me' ? (profile?.full_name || '') : 'Ganzes Team'} · erstellt am ${format(new Date(), 'dd.MM.yyyy')}`, 14, 27);
      doc.setTextColor(0);

      // Übersicht je Person
      const people = scope === 'me' ? profiles.filter(p => p.id === user?.id) : profiles.filter(p => p.is_approved !== false);
      const rows = people
          .map(p => {
              const own = scoped.filter(e => e.user_id === p.id);
              const active = own.filter(e => e.status !== 'cancelled');
              const lv = correctedMonthlyLv(entries, snaps, p.id, y)[m - 1];
              const comm = active.reduce((a, e) => a + Number(e.commission_amount || 0), 0);
              const goal = Number(p.monthly_goal) || 0;
              return { name: p.full_name, count: active.length, cancelled: own.length - active.length, lv, comm, goal, pct: goal ? Math.round((lv / goal) * 100) : null };
          })
          .filter(r => scope === 'me' || r.count > 0 || r.cancelled > 0)
          .sort((a, b) => b.lv - a.lv);

      if (rows.length === 0) {
          toast.error(`Keine Verträge im ${monthLabel}.`);
          return;
      }

      autoTable(doc, {
          startY: 34,
          head: [['Person', 'Verträge', 'Storno', 'Lebenswerte', 'Ziel', 'Erreicht', 'Provision']],
          body: rows.map(r => [r.name, r.count, r.cancelled || '–', num(r.lv), r.goal ? num(r.goal) : '–', r.pct !== null ? `${r.pct} %` : '–', formatCurrency(r.comm)]),
          foot: rows.length > 1 ? [['Summe', rows.reduce((a, r) => a + r.count, 0), rows.reduce((a, r) => a + r.cancelled, 0) || '–', num(rows.reduce((a, r) => a + r.lv, 0)), '', '', formatCurrency(rows.reduce((a, r) => a + r.comm, 0))]] : undefined,
          theme: 'grid',
          headStyles: { fillColor: [20, 106, 104] },
          footStyles: { fillColor: [236, 238, 234], textColor: [0, 0, 0], fontStyle: 'bold' },
          columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
      });

      // Sparten
      const byCat: Record<string, { count: number; comm: number; lv: number }> = {};
      scoped.filter(e => e.status !== 'cancelled').forEach(e => {
          const k = categoryLabel(e.category);
          byCat[k] = byCat[k] || { count: 0, comm: 0, lv: 0 };
          byCat[k].count++;
          byCat[k].comm += Number(e.commission_amount || 0);
          byCat[k].lv += Number(e.life_values || 0);
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let y2 = ((doc as any).lastAutoTable?.finalY || 40) + 10;
      doc.setFontSize(12);
      doc.text('Nach Sparte', 14, y2);
      autoTable(doc, {
          startY: y2 + 3,
          head: [['Sparte', 'Verträge', 'Lebenswerte', 'Provision']],
          body: Object.entries(byCat).sort((a, b) => b[1].comm - a[1].comm).map(([k, v]) => [k, v.count, num(v.lv), formatCurrency(v.comm)]),
          theme: 'grid',
          headStyles: { fillColor: [20, 106, 104] },
          columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
      });

      // Einzelne Verträge nur im persönlichen Bericht
      if (scope === 'me') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          y2 = ((doc as any).lastAutoTable?.finalY || 60) + 10;
          doc.setFontSize(12);
          doc.text('Verträge', 14, y2);
          autoTable(doc, {
              startY: y2 + 3,
              head: [['Eingereicht', 'Kunde', 'Tarif', 'Status', 'Lebenswerte', 'Provision']],
              body: scoped.map(e => [format(new Date(e.submission_date), 'dd.MM.'), `${e.customer_name}${e.customer_firstname ? ', ' + e.customer_firstname : ''}`, e.sub_category || categoryLabel(e.category), STATUS_META[e.status]?.label || e.status, num(Number(e.life_values || 0)), formatCurrency(e.commission_amount)]),
              theme: 'grid',
              headStyles: { fillColor: [20, 106, 104] },
              columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right' } },
          });
      }

      doc.save(`Monatsbericht_${reportMonth}${scope === 'me' ? '' : '_Team'}.pdf`);
      setReportOpen(false);
  };

  const handleExportPDF = async () => {
      // Filter entries for export: ALWAYS restrict to current user
      const exportEntries = entries.filter(e => {
          // 1. Strict ownership check
          if (e.user_id !== user?.id) return false;
          
          // 2. Respect active filters
          if (filterCategory !== 'all' && e.category !== filterCategory) return false;
          const search = searchQuery.toLowerCase();
          return (
              e.customer_name?.toLowerCase().includes(search) ||
              e.policy_number?.toLowerCase().includes(search)
          );
      });

      if (exportEntries.length === 0) {
          toast.error('Keine eigenen Einträge gefunden.');
          return;
      }
      
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
      const doc = new jsPDF();
      
      // Recalculate totals for the PDF based on exportEntries
      const exportActive = exportEntries.filter(e => e.status !== 'cancelled');
      const exportTotalCommission = exportActive.reduce((acc, curr) => acc + (curr.commission_amount || 0), 0);
      const exportTotalLifeValues = exportActive.reduce((acc, curr) => acc + (curr.life_values || 0), 0);
      const exportTotalLiability = exportActive.reduce((acc, curr) => acc + ((curr.commission_amount || 0) * (curr.liability_rate || 0) / 100), 0);
      
      doc.setFontSize(18);
      doc.text('Produktionsnachweis (Persönlich)', 14, 20);
      
      doc.setFontSize(10);
      doc.text(`Erstellt: ${new Date().toLocaleDateString('de-DE')}`, 14, 28);
      doc.text(`Sparte: ${filterCategory === 'all' ? 'Alle' : categoryLabel(filterCategory)}`, 14, 33);
      doc.text(`Mitarbeiter: ${profile?.full_name || user?.email || ''}`, 14, 38);

      const tableData = exportEntries.map(e => [
          format(new Date(e.submission_date), 'dd.MM.yy'),
          e.policing_date ? format(new Date(e.policing_date), 'dd.MM.yy') : '-',
          `${e.customer_name}, ${e.customer_firstname}`,
          e.sub_category || e.category,
          e.status === 'policed' ? 'Policiert' : (e.status === 'cancelled' ? 'Storno' : 'Offen'),
          formatCurrency(e.valuation_sum),
          new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(e.life_values || 0),
          formatCurrency(e.commission_amount)
      ]);

      autoTable(doc, {
          startY: 45,
          head: [['Eingereicht', 'Policiert', 'Kunde', 'Sparte', 'Status', 'Bewertung', 'Lebenswerte', 'Provision']],
          body: tableData,
          foot: [['', '', '', '', 'Summe ohne Storno:', '', new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(exportTotalLifeValues), formatCurrency(exportTotalCommission)]],
          theme: 'grid',
          headStyles: { fillColor: [20, 106, 104] },
          footStyles: { fillColor: [243, 244, 246], textColor: [0, 0, 0], fontStyle: 'bold' } // Gray 100
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const finalY = (doc as any).lastAutoTable.finalY || 45;
      
      doc.text(`Haftungsreserve (Total): ${formatCurrency(exportTotalLiability)}`, 14, finalY + 10);
      
      doc.save(`Produktion_Personal_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  const filterOptions = [
      { value: 'all', label: 'Alle' },
      ...INSURANCE_TYPES.map(t => ({ value: t.id, label: t.label, count: (viewMode === 'personal' ? entries.filter(e => e.user_id === user?.id) : entries).filter(e => e.category === t.id).length })),
  ];

  return (
    <div className="space-y-6">
        <PageHeader
            title="Produktion"
            description="Verträge erfassen, Provision und Lebenswerte im Blick behalten."
            actions={
                <>
                    <Segmented
                        value={viewMode}
                        onChange={(v) => setViewMode(v as 'personal' | 'leaderboard')}
                        options={[
                            { value: 'personal', label: 'Meine', icon: LayoutGrid },
                            { value: 'leaderboard', label: 'Rangliste', icon: Trophy },
                        ]}
                    />
                    <select
                        aria-label="Jahr"
                        value={String(selectedYear)}
                        onChange={(e) => setSelectedYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                        className="input w-auto py-2"
                    >
                        {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                        <option value="all">Alle Jahre</option>
                    </select>
                    <button type="button" className="btn-secondary" onClick={() => { setLvUserId(user?.id || ''); setLvModalOpen(true); }}>
                        <ListChecks className="h-4 w-4" /> LW-Stand
                    </button>
                    <MenuRoot as="div" className="relative">
                        <MenuButton className="btn-secondary">
                            <FileDown className="h-4 w-4" /> Export <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                        </MenuButton>
                        <MenuItems anchor={{ to: 'bottom end', gap: 6 }} className="z-50 w-56 animate-pop-in rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl focus:outline-none dark:border-gray-700 dark:bg-gray-800">
                            <MenuItem>
                                <button type="button" onClick={handleExportPDF} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-gray-700 data-[focus]:bg-gray-100 dark:text-gray-200 dark:data-[focus]:bg-gray-700">
                                    <FileText className="h-4 w-4" /> Nachweis als PDF
                                </button>
                            </MenuItem>
                            <MenuItem>
                                <button type="button" onClick={handleExport} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-gray-700 data-[focus]:bg-gray-100 dark:text-gray-200 dark:data-[focus]:bg-gray-700">
                                    <FileSpreadsheet className="h-4 w-4" /> Tabelle für Excel
                                </button>
                            </MenuItem>
                            <MenuItem>
                                <button type="button" onClick={() => setReportOpen(true)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-gray-700 data-[focus]:bg-gray-100 dark:text-gray-200 dark:data-[focus]:bg-gray-700">
                                    <CalendarRange className="h-4 w-4" /> Monatsbericht
                                </button>
                            </MenuItem>
                        </MenuItems>
                    </MenuRoot>
                    <Button icon={Plus} onClick={() => { resetForm(); setIsModalOpen(true); }}>
                        Vertrag erfassen
                    </Button>
                </>
            }
        />

        {viewMode === 'leaderboard' ? (
            <div className="card overflow-hidden">
                <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 dark:border-gray-700 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                    <div>
                        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Rangliste nach Provision</h2>
                        <p className="text-sm text-gray-500">Eingereichte und policierte Verträge, ohne Stornos. Balken = Lebenswerte im Verhältnis zum eigenen Ziel.</p>
                    </div>
                    <div className="flex shrink-0 gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-800" role="group" aria-label="Zeitraum">
                        {([['month', 'Monat'], ['year', 'Jahr'], ['all', 'Gesamt']] as const).map(([v, label]) => (
                            <button
                                key={v}
                                type="button"
                                onClick={() => setBoardPeriod(v)}
                                aria-pressed={boardPeriod === v}
                                className={cn('rounded-lg px-3 py-1 text-xs font-medium', boardPeriod === v ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white' : 'text-gray-500 hover:text-gray-900 dark:hover:text-white')}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
                {leaderboardData.length === 0 ? (
                    <EmptyState icon={Trophy} title="Noch keine Verträge erfasst" />
                ) : (
                    <ol className="divide-y divide-gray-100 dark:divide-gray-700/70">
                        {leaderboardData.map((data, index) => (
                            <li key={data.id} className={cn('flex items-center gap-4 px-5 py-3.5 sm:px-6', data.id === user?.id && 'bg-brand-50/50 dark:bg-brand-900/20')}>
                                <span className={cn('tabular w-8 font-display text-xl font-semibold', index === 0 ? 'text-amber-500' : 'text-gray-300 dark:text-gray-600')}>{index + 1}</span>
                                <Avatar name={data.name} src={data.avatar} size="md" />
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{data.name}{data.id === user?.id && <span className="font-normal text-gray-400"> (du)</span>}</p>
                                    <p className="text-xs text-gray-500">
                                        {data.count} {data.count === 1 ? 'Vertrag' : 'Verträge'} · {new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(data.lv)} LW
                                        {data.goalPct !== null && <> · <span className={cn(data.goalPct >= 100 && 'font-semibold text-emerald-700 dark:text-emerald-400')}>{data.goalPct} % vom Ziel</span></>}
                                    </p>
                                </div>
                                <span className="tabular hidden text-sm font-semibold text-gray-900 dark:text-white sm:block">{formatCurrency(data.amount)}</span>
                                <div className="hidden w-40 sm:block">
                                    <div className="h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                                        <div
                                            className={cn('h-full rounded-full', data.goalPct !== null && data.goalPct >= 100 ? 'bg-emerald-500' : 'bg-brand-600 dark:bg-brand-400')}
                                            style={{ width: `${data.goalPct !== null ? Math.min(data.goalPct, 100) : leaderboardData[0].amount ? (data.amount / leaderboardData[0].amount) * 100 : 0}%` }}
                                        />
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ol>
                )}
            </div>
        ) : (
            <>
                <ProductionStats
                    totalCommission={totalCommission}
                    totalLifeValues={shownLifeValues}
                    lifeValuesNote={lvCorrection ? `inkl. Korrektur ${lvCorrection > 0 ? '+' : ''}${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(lvCorrection)} laut Liste` : undefined}
                    totalLiability={totalLiability}
                    contractCount={activeEntries.length}
                    cancelledCount={cancelledCount}
                    onOpenLiabilityModal={() => setIsLiabilityModalOpen(true)}
                />

                <ProductionCharts chartMode={chartMode} setChartMode={setChartMode} monthlyData={monthlyData} categoryData={categoryData} title={selectedYear !== 'all' && selectedYear !== thisYear ? `Monate ${selectedYear}` : undefined} />

                <div className="card overflow-hidden">
                    <div className="flex flex-col gap-3 border-b border-gray-100 p-4 dark:border-gray-700 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                        <div className="flex flex-wrap items-center gap-2">
                            <Segmented size="sm" value={filterCategory} onChange={setFilterCategory} options={filterOptions} />
                            {viewMode === 'personal' && (
                                <button
                                    type="button"
                                    aria-pressed={onlyOpenCommission}
                                    onClick={() => setOnlyOpenCommission(v => !v)}
                                    className={cn('inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors', onlyOpenCommission ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200' : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700/50')}
                                    title="Policierte Verträge, deren Provision noch nicht eingegangen ist"
                                >
                                    <Hourglass className="h-3.5 w-3.5" />
                                    Provision offen
                                    {openCommission.length > 0 && <span className="tabular">· {openCommission.length} · {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(openCommissionSum)}</span>}
                                </button>
                            )}
                        </div>
                        <div className="relative w-full sm:w-64">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                            <input type="search" placeholder="Kunde, Schein-Nr., Notiz" aria-label="Verträge durchsuchen" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="input pl-9" />
                        </div>
                    </div>

                    {loading ? (
                        <p className="px-6 py-12 text-center text-sm text-gray-500">Verträge werden geladen</p>
                    ) : filteredEntries.length === 0 ? (
                        <EmptyState
                            icon={FileText}
                            title={searchQuery || filterCategory !== 'all' ? 'Keine Verträge in dieser Auswahl' : 'Noch keine Verträge erfasst'}
                            description={searchQuery || filterCategory !== 'all' ? 'Ändere Filter oder Suche.' : 'Erfasse deinen ersten Vertrag, dann erscheinen hier Provision und Lebenswerte.'}
                            action={!searchQuery && filterCategory === 'all' ? <Button icon={Plus} onClick={() => { resetForm(); setIsModalOpen(true); }}>Vertrag erfassen</Button> : undefined}
                        />
                    ) : (
                        <>
                            <div className="hidden overflow-x-auto md:block">
                                <table className="table-base">
                                    <thead>
                                        <tr>
                                            <th>Kunde</th>
                                            <th>Sparte</th>
                                            <th>Status</th>
                                            <th>Betreuung</th>
                                            <th className="text-right">Beitrag</th>
                                            <th className="text-right">Bewertung</th>
                                            <th className="text-right">Lebenswerte</th>
                                            <th className="text-right">Provision</th>
                                            <th className="w-20"><span className="sr-only">Aktionen</span></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredEntries.map(entry => {
                                            const st = STATUS_META[entry.status] || STATUS_META.submitted;
                                            const cancelled = entry.status === 'cancelled';
                                            return (
                                                <tr key={entry.id} className={cn('group', cancelled && 'text-gray-400 [&_td]:line-through [&_td]:decoration-gray-300')}>
                                                    <td>
                                                        <button type="button" onClick={() => handleEdit(entry)} className="text-left">
                                                            <span className="block font-medium text-gray-900 hover:text-brand-700 dark:text-white dark:hover:text-brand-300">{entry.customer_name}{entry.customer_firstname ? `, ${entry.customer_firstname}` : ''}</span>
                                                        </button>
                                                        <span className="flex items-center gap-1.5 text-xs text-gray-500">
                                                            <span className="font-mono">{entry.policy_number || 'ohne Nr.'}</span>
                                                            <span>· {format(new Date(entry.submission_date), 'dd.MM.yy')}</span>
                                                            {entry.document_url && (
                                                                <button type="button" onClick={() => openProductionDoc(entry.document_url)} className="rounded p-0.5 text-brand-600 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-900/40" title="Dokument öffnen" aria-label="Dokument öffnen">
                                                                    <FileText className="h-3.5 w-3.5" />
                                                                </button>
                                                            )}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <span className="flex items-center gap-2">
                                                            <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: CATEGORY_COLORS[entry.category] }} />
                                                            <span className="text-gray-700 dark:text-gray-300">{entry.sub_category || categoryLabel(entry.category)}</span>
                                                        </span>
                                                    </td>
                                                    <td className="!no-underline"><Badge tone={st.tone}>{st.label}</Badge></td>
                                                    <td>
                                                        <span className="block text-gray-700 dark:text-gray-300">{entry.manager?.full_name || '–'}</span>
                                                        {entry.profiles?.full_name && entry.profiles.full_name !== entry.manager?.full_name && <span className="text-xs text-gray-500">von {entry.profiles.full_name}</span>}
                                                    </td>
                                                    <td className="tabular text-right">
                                                        <span className="block text-gray-700 dark:text-gray-300">{formatCurrency(entry.gross_premium || 0)}</span>
                                                        <span className="text-xs text-gray-500">{PAYMENT_LABEL[entry.payment_method] || entry.payment_method}</span>
                                                    </td>
                                                    <td className="tabular text-right text-gray-700 dark:text-gray-300">{formatCurrency(entry.valuation_sum || 0)}</td>
                                                    <td className="tabular text-right font-medium text-brand-700 dark:text-brand-300">{new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(entry.life_values || 0)}</td>
                                                    <td className="tabular text-right">
                                                        <span className="block font-semibold text-gray-900 dark:text-white">{formatCurrency(entry.commission_amount || 0)}</span>
                                                        {entry.status === 'policed' && entry.user_id === user?.id && (entry.commission_received_date ? (
                                                            <span className="text-2xs text-emerald-700 dark:text-emerald-400">erhalten {format(new Date(entry.commission_received_date), 'dd.MM.')}</span>
                                                        ) : (
                                                            <button type="button" onClick={() => markCommissionReceived(entry.id)} className="text-2xs font-medium text-amber-700 hover:underline dark:text-amber-300" title="Provision als erhalten markieren">
                                                                offen · erhalten?
                                                            </button>
                                                        ))}
                                                    </td>
                                                    <td>
                                                        <div className="flex justify-end gap-0.5 opacity-60 transition-opacity group-hover:opacity-100 [&_*]:no-underline">
                                                            <button type="button" onClick={() => handleEdit(entry)} className="btn-icon p-1.5" title="Bearbeiten" aria-label="Bearbeiten"><Pencil className="h-4 w-4" /></button>
                                                            <button type="button" onClick={() => handleDelete(entry.id)} className="btn-icon p-1.5 hover:!text-red-600" title="Löschen" aria-label="Löschen"><Trash2 className="h-4 w-4" /></button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            <ul className="divide-y divide-gray-100 dark:divide-gray-700/70 md:hidden">
                                {filteredEntries.map(entry => {
                                    const st = STATUS_META[entry.status] || STATUS_META.submitted;
                                    return (
                                        <li key={entry.id}>
                                            <button type="button" onClick={() => handleEdit(entry)} className="flex w-full items-start gap-3 px-4 py-3.5 text-left">
                                                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-sm" style={{ background: CATEGORY_COLORS[entry.category] }} />
                                                <span className="min-w-0 flex-1">
                                                    <span className="block truncate text-sm font-medium text-gray-900 dark:text-white">{entry.customer_name}{entry.customer_firstname ? `, ${entry.customer_firstname}` : ''}</span>
                                                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                                                        <Badge tone={st.tone}>{st.label}</Badge>
                                                        {entry.sub_category || categoryLabel(entry.category)} · {format(new Date(entry.submission_date), 'dd.MM.yy')}
                                                    </span>
                                                </span>
                                                <span className="text-right">
                                                    <span className={cn('tabular block text-sm font-semibold', entry.status === 'cancelled' ? 'text-gray-400 line-through' : 'text-gray-900 dark:text-white')}>{formatCurrency(entry.commission_amount || 0)}</span>
                                                    <span className="tabular block text-xs text-brand-700 dark:text-brand-300">{new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(entry.life_values || 0)} LW</span>
                                                </span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </>
                    )}
                </div>
            </>
        )}

        <Modal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            title={editingId ? 'Vertrag bearbeiten' : 'Vertrag erfassen'}
            description={editingId ? undefined : 'Tipp: Antrag als PDF hier hineinziehen, dann werden die Felder vorausgefüllt.'}
            size="full"
            footer={
                <>
                    <button type="button" onClick={() => setIsModalOpen(false)} className="btn-secondary">Abbrechen</button>
                    <Button type="submit" form="production-form" loading={submitting}>
                        {editingId ? 'Änderungen speichern' : 'Vertrag speichern'}
                    </Button>
                </>
            }
        >
            <div {...getRootProps()} className={cn('relative rounded-xl outline-none', isDragActive && 'ring-2 ring-inset ring-brand-500/50')}>
                <input {...getInputProps()} />
                {(isDragActive || isAnalyzing) && (
                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-brand-400 bg-white/90 dark:bg-gray-800/90">
                        {isAnalyzing ? <Loader2 className="mb-2 h-8 w-8 animate-spin text-brand-600" /> : <UploadCloud className="mb-2 h-8 w-8 text-brand-600" />}
                        <p className="text-sm font-medium text-brand-800 dark:text-brand-200">{isAnalyzing ? 'PDF wird ausgelesen' : 'PDF loslassen zum Auslesen'}</p>
                    </div>
                )}

                <form id="production-form" onSubmit={handleSubmit} className="grid grid-cols-1 gap-8 lg:grid-cols-5">
                    {/* Linke Seite: Eingaben */}
                    <div className="space-y-6 lg:col-span-3">
                        <fieldset>
                            <legend className="field-label">Sparte</legend>
                            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                                {INSURANCE_TYPES.map(c => (
                                    <button
                                        key={c.id}
                                        type="button"
                                        onClick={() => { setCategory(c.id); setSubCategory(c.subcategories[0]); }}
                                        aria-pressed={category === c.id}
                                        className={cn(
                                            'flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-xs font-medium transition-colors',
                                            category === c.id
                                                ? 'border-brand-500 bg-brand-50 text-brand-800 dark:border-brand-400 dark:bg-brand-900/40 dark:text-brand-100'
                                                : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700/50'
                                        )}
                                    >
                                        <span className="h-1.5 w-6 rounded-full" style={{ background: CATEGORY_COLORS[c.id] }} />
                                        {c.label}
                                    </button>
                                ))}
                            </div>
                        </fieldset>

                        <div className="grid grid-cols-2 gap-4">
                            <Field label="Nachname" htmlFor="pf-name"><input id="pf-name" required type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} className="input" /></Field>
                            <Field label="Vorname" htmlFor="pf-first"><input id="pf-first" type="text" value={customerFirstname} onChange={e => setCustomerFirstname(e.target.value)} className="input" /></Field>
                            <Field label="Versicherungsschein-Nr." htmlFor="pf-policy"><input id="pf-policy" type="text" value={policyNumber} onChange={e => setPolicyNumber(e.target.value)} className="input font-mono" /></Field>
                            <Field label="Status" htmlFor="pf-status">
                                <select id="pf-status" value={status} onChange={(e) => setStatus(e.target.value as 'submitted' | 'policed' | 'cancelled')} className="input">
                                    <option value="submitted">Eingereicht</option>
                                    <option value="policed">Policiert</option>
                                    <option value="cancelled">Storniert</option>
                                </select>
                            </Field>
                        </div>

                        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                            <Field label="Tarif" htmlFor="pf-sub">
                                <select id="pf-sub" value={subCategory} onChange={e => setSubCategory(e.target.value)} className="input">
                                    {INSURANCE_TYPES.find(c => c.id === category)?.subcategories.map(sc => <option key={sc} value={sc}>{sc}</option>)}
                                </select>
                            </Field>
                            <Field label="Zahlweise" htmlFor="pf-pay">
                                <select id="pf-pay" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="input">
                                    <option value="monthly">Monatlich</option>
                                    <option value="quarterly">Vierteljährlich</option>
                                    <option value="half_yearly">Halbjährlich</option>
                                    <option value="yearly">Jährlich</option>
                                    <option value="one_time">Einmalbeitrag</option>
                                </select>
                            </Field>
                            <Field label="Laufzeit in Jahren" htmlFor="pf-dur" hint={duration > 35 ? 'Berechnet wird mit höchstens 35 Jahren.' : undefined}>
                                <input id="pf-dur" type="number" min={1} value={duration} onChange={e => setDuration(Number(e.target.value))} className="input tabular" />
                            </Field>
                            <Field label="Beitrag netto" htmlFor="pf-net">
                                <div className="relative">
                                    <input id="pf-net" type="number" step="0.01" inputMode="decimal" value={netPremium} onChange={e => setNetPremium(e.target.value ? Number(e.target.value) : '')} className="input tabular pr-8" />
                                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">€</span>
                                </div>
                            </Field>
                            <Field label="Beitrag brutto" htmlFor="pf-gross">
                                <div className="relative">
                                    <input id="pf-gross" type="number" step="0.01" inputMode="decimal" value={grossPremium} onChange={e => setGrossPremium(e.target.value ? Number(e.target.value) : '')} className="input tabular pr-8" />
                                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">€</span>
                                </div>
                            </Field>
                            <Field label="Eingereicht am" htmlFor="pf-sub-date"><input id="pf-sub-date" type="date" required value={submissionDate} onChange={e => setSubmissionDate(e.target.value)} className="input" /></Field>
                        </div>

                        <details className="group rounded-lg border border-gray-200 dark:border-gray-700" open={!!(startDate || policingDate || commissionReceivedDate || notes)}>
                            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-200">
                                Weitere Angaben
                                <ChevronDown className="h-4 w-4 text-gray-400 transition-transform group-open:rotate-180" />
                            </summary>
                            <div className="grid grid-cols-1 gap-4 border-t border-gray-100 p-4 dark:border-gray-700 sm:grid-cols-2">
                                <Field label="Betreuung" htmlFor="pf-managed">
                                    <select id="pf-managed" value={managedBy} onChange={e => setManagedBy(e.target.value)} className="input">
                                        <option value="">Ich selbst</option>
                                        {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}{p.agency_number ? ` (${p.agency_number})` : ''}</option>)}
                                    </select>
                                </Field>
                                <Field label="Abschluss von" htmlFor="pf-closed">
                                    <select id="pf-closed" value={closedBy} onChange={e => setClosedBy(e.target.value)} className="input">
                                        <option value="">Ich selbst</option>
                                        {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}{p.agency_number ? ` (${p.agency_number})` : ''}</option>)}
                                    </select>
                                </Field>
                                <Field label="Vertragsbeginn" htmlFor="pf-start"><input id="pf-start" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="input" /></Field>
                                <Field label="Policiert am" htmlFor="pf-policed"><input id="pf-policed" type="date" value={policingDate} onChange={e => setPolicingDate(e.target.value)} className="input" /></Field>
                                <Field label="Provision erhalten am" htmlFor="pf-received"><input id="pf-received" type="date" value={commissionReceivedDate} onChange={e => setCommissionReceivedDate(e.target.value)} className="input" /></Field>
                                <Field label="Dokument (Antrag, Protokoll)" htmlFor="pf-file">
                                    <div className="flex items-center gap-2">
                                        <input id="pf-file" type="file" onChange={e => setSelectedFile(e.target.files?.[0] || null)} className="block w-full text-xs text-gray-500 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-gray-700 hover:file:bg-gray-200 dark:file:bg-gray-700 dark:file:text-gray-200" />
                                        {documentUrl && !selectedFile && (
                                            <button type="button" onClick={() => openProductionDoc(documentUrl)} className="btn-ghost btn-sm shrink-0"><Download className="h-3.5 w-3.5" /> Öffnen</button>
                                        )}
                                    </div>
                                    {selectedFile && (
                                        <button type="button" onClick={handleAIAnalysis} disabled={isAnalyzing} className="btn-secondary btn-sm mt-2">
                                            {isAnalyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                                            Felder aus PDF füllen
                                        </button>
                                    )}
                                </Field>
                                <Field label="Bemerkungen" htmlFor="pf-notes" className="sm:col-span-2">
                                    <textarea id="pf-notes" value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="input resize-none" />
                                </Field>
                            </div>
                        </details>
                    </div>

                    {/* Rechte Seite: Berechnung */}
                    <aside className="lg:col-span-2">
                        <div className="sticky top-0 space-y-4 rounded-xl border border-brand-100 bg-brand-50/50 p-5 dark:border-brand-900 dark:bg-brand-950/30">
                            <h3 className="text-sm font-semibold text-brand-900 dark:text-brand-100">Berechnung</h3>
                            <div>
                                <p className="text-xs text-gray-500">Provision</p>
                                <p className="tabular font-display text-3xl font-semibold text-gray-900 dark:text-white">{formatCurrency(commissionAmount)}</p>
                            </div>
                            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-brand-100 pt-4 text-sm dark:border-brand-900">
                                <div>
                                    <dt className="text-xs text-gray-500">{category === 'life' ? 'Satz (Promille)' : ['KV Voll', 'KV Zusatz'].includes(subCategory) ? 'Monatsbeiträge' : 'Satz (Prozent)'}</dt>
                                    <dd className="tabular font-medium text-gray-900 dark:text-white">{commissionRate || 0}</dd>
                                </div>
                                <div>
                                    <dt className="text-xs text-gray-500">Bewertungssumme</dt>
                                    <dd className="tabular font-medium text-gray-900 dark:text-white">{formatCurrency(valuationSum)}</dd>
                                </div>
                                <div>
                                    <dt className="text-xs text-gray-500"><label htmlFor="pf-lvf">Faktor Lebenswerte</label></dt>
                                    <dd>
                                        <input
                                            id="pf-lvf"
                                            type="number"
                                            step="0.001"
                                            value={lifeValueFactor}
                                            onChange={(e) => {
                                                setManualLvFactor(Number(e.target.value));
                                            }}
                                            className="input tabular mt-0.5 py-1"
                                        />
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-xs text-gray-500">Lebenswerte</dt>
                                    <dd className="tabular pt-1.5 font-semibold text-brand-700 dark:text-brand-300">{new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(lifeValues)}</dd>
                                </div>
                            </dl>
                            <div className="flex items-center justify-between gap-3 border-t border-brand-100 pt-4 dark:border-brand-900">
                                <label htmlFor="liabilityCheck" className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                                    <input type="checkbox" id="liabilityCheck" checked={liabilityActive} onChange={e => setLiabilityActive(e.target.checked)} className="h-4 w-4 rounded" />
                                    Stornohaftung einbehalten
                                </label>
                                {liabilityActive && (
                                    <div className="flex items-center gap-1">
                                        <input type="number" aria-label="Haftung in Prozent" value={liabilityRate} onChange={e => setLiabilityRate(Number(e.target.value))} className="input tabular w-16 py-1 text-center" />
                                        <span className="text-sm text-gray-500">%</span>
                                    </div>
                                )}
                            </div>
                            {liabilityActive && commissionAmount > 0 && (
                                <p className="text-xs text-gray-500">Einbehalt: {formatCurrency(commissionAmount * liabilityRate / 100)}, Auszahlung: {formatCurrency(commissionAmount * (1 - liabilityRate / 100))}</p>
                            )}
                        </div>
                    </aside>
                </form>
            </div>
        </Modal>

        <Modal
            isOpen={reportOpen}
            onClose={() => setReportOpen(false)}
            title="Monatsbericht"
            description="PDF mit Verträgen, Lebenswerten, Zielerreichung und Provision. Stornos zählen nicht mit."
            size="sm"
            footer={
                <>
                    <button type="button" onClick={() => setReportOpen(false)} className="btn-secondary">Abbrechen</button>
                    <Button icon={FileDown} onClick={handleMonthlyReport}>PDF erstellen</Button>
                </>
            }
        >
            <div className="space-y-4">
                <Field label="Monat" htmlFor="report-month">
                    <input id="report-month" type="month" value={reportMonth} max={format(new Date(), 'yyyy-MM')} onChange={e => setReportMonth(e.target.value)} className="input" />
                </Field>
                {profile?.roles?.includes('admin') && (
                    <Segmented
                        value={reportScope}
                        onChange={(v) => setReportScope(v as 'me' | 'team')}
                        options={[{ value: 'me', label: 'Nur meine Verträge' }, { value: 'team', label: 'Ganzes Team' }]}
                    />
                )}
                {reportScope === 'team' && <p className="text-xs text-gray-500">Übersicht je Person ohne einzelne Kundendaten.</p>}
            </div>
        </Modal>

        <Modal
            isOpen={lvModalOpen}
            onClose={() => setLvModalOpen(false)}
            title="Lebenswerte-Stand laut Liste"
            description="Trag am Monatsende den Jahresstand aus der offiziellen Liste ein (Januar bis Ende des Monats). Die App rechnet ab dann mit diesem Wert, damit Ziele und Rangliste stimmen."
            size="sm"
            footer={
                <>
                    <button type="button" onClick={() => setLvModalOpen(false)} className="btn-secondary">Schließen</button>
                    <Button icon={ListChecks} loading={lvSaving} onClick={saveLvSnapshot}>Speichern</Button>
                </>
            }
        >
            <div className="space-y-4">
                {profile?.roles?.includes('admin') && (
                    <Field label="Person" htmlFor="lv-user">
                        <select id="lv-user" value={lvTargetUser} onChange={e => setLvUserId(e.target.value)} className="input">
                            {profiles.filter(p => p.is_approved !== false).map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                        </select>
                    </Field>
                )}
                <Field label="Stand Ende" htmlFor="lv-month">
                    <input id="lv-month" type="month" value={lvMonth} max={format(new Date(), 'yyyy-MM')} onChange={e => setLvMonth(e.target.value)} className="input" />
                </Field>
                <Field label="Lebenswerte laut Liste (Jahressumme)" htmlFor="lv-value">
                    <input id="lv-value" inputMode="decimal" value={lvValue} onChange={e => setLvValue(e.target.value)} placeholder="z. B. 150000" className="input tabular" />
                </Field>
                <p className="text-xs text-gray-500">
                    In der App bis Ende {lvMonth ? format(new Date(lvYear, lvMonthIdx, 1), 'MMMM yyyy', { locale: de }) : ''}: <span className="tabular font-medium text-gray-700 dark:text-gray-300">{new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(lvAppValue)} LW</span>
                    {lvValue && Number.isFinite(Number(lvValue.replace(/\./g, '').replace(',', '.'))) && (
                        <> · Korrektur <span className="tabular font-medium">{(() => { const d = Number(lvValue.replace(/\./g, '').replace(',', '.')) - lvAppValue; return `${d > 0 ? '+' : ''}${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(d)}`; })()}</span></>
                    )}
                </p>
                {lvExisting.length > 0 && (
                    <div>
                        <p className="mb-1.5 text-xs font-medium text-gray-500">Eingetragen {lvYear}</p>
                        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100 text-sm dark:divide-gray-700 dark:border-gray-700">
                            {lvExisting.map(sn => (
                                <li key={sn.month} className="flex items-center justify-between px-3 py-2">
                                    <span>Ende {format(new Date(Number(sn.month.slice(0, 4)), Number(sn.month.slice(5, 7)) - 1, 1), 'MMMM', { locale: de })}</span>
                                    <span className="flex items-center gap-2">
                                        <span className="tabular font-medium">{new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(sn.ytd_lv)} LW</span>
                                        <button type="button" onClick={() => deleteLvSnapshot(sn)} className="btn-icon p-1 hover:!text-red-600" aria-label="Stand löschen" title="Löschen"><Trash2 className="h-3.5 w-3.5" /></button>
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </Modal>

        <ConfirmModal
            isOpen={!!deleteId}
            onClose={() => setDeleteId(null)}
            onConfirm={confirmDelete}
            title="Vertrag löschen?"
            message="Der Vertrag wird endgültig entfernt und zählt nicht mehr in Provision und Lebenswerte. Das lässt sich nicht rückgängig machen."
            confirmText="Löschen"
            isDestructive
        />

        <LiabilityTrackerModal 
            isOpen={isLiabilityModalOpen} 
            onClose={() => setIsLiabilityModalOpen(false)} 
            entries={filteredEntries} 
        />
    </div>
  );
};
