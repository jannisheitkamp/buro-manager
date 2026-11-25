import { useEffect, useMemo, useState } from 'react';
import { ContractDocuments, DOC_KINDS, uploadContractDocument, type DocKind } from '@/components/ContractDocuments';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { useLocation } from 'react-router-dom';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Menu as MenuRoot, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { Plus, Search, FileText, Trash2, Pencil, FileDown, Trophy, LayoutGrid, Sparkles, Loader2, UploadCloud, FileSpreadsheet, ChevronDown, CalendarRange, Hourglass, ListChecks, X, CalendarClock, Check, Percent } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Modal } from '@/components/Modal';
import { ConfirmModal } from '@/components/ConfirmModal';
import { Avatar, Button, EmptyState, Field, PageHeader, Segmented } from '@/components/ui';
import { toast } from 'react-hot-toast';
import { useDropzone } from 'react-dropzone';
import { ProductionHero, type HeroMonth } from '@/components/Production/ProductionHero';
import { CourtagePanel } from '@/components/Production/CourtagePanel';
import { CategoryTiles } from '@/components/Production/CategoryTiles';
import { CANCEL_REASONS, stornoStats } from '@/lib/storno';
import { courtageInstallments, isCourtage, summarizeCourtage, type CourtagePayout } from '@/lib/courtage';
import { AREAS, areaLabel, calcCommission, methodOf, productByName, useProducts } from '@/lib/products';
import { ProductPicker } from '@/components/ProductPicker';
import { CommissionRates } from '@/components/Production/CommissionRates';
import { Leaderboard } from '@/components/Production/Leaderboard';
import { extractPdfText } from '@/utils/extractPdfText';
import { parseContractFromText } from '@/utils/pdfParser';
import { CATEGORY_COLORS } from '@/lib/chartTheme';
import { correctedMonthlyLv, computedMonthlyLv, fetchLvSnapshots, sumUntil, type LvSnapshot } from '@/lib/lifeValues';
import { exportMonthlyReport, exportProductionCsv, exportProductionPdf } from '@/lib/productionExport';

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

const STATUS_PILL: Record<string, string> = {
  submitted: 'bg-sky-50 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  policed: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  cancelled: 'bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

const nf0 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });

const categoryLabel = areaLabel;

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
  const [viewMode, setViewMode] = useState<'personal' | 'leaderboard' | 'rates'>(() => (new URLSearchParams(window.location.search).get('tab') === 'rates' ? 'rates' : 'personal'));
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
  const [onlyCourtage, setOnlyCourtage] = useState(false);
  const [markingCourtage, setMarkingCourtage] = useState(false);
  const [courtagePayouts, setCourtagePayouts] = useState<CourtagePayout[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [newDocKind, setNewDocKind] = useState<DocKind>('antrag');
  const [docCounts, setDocCounts] = useState<Map<string, number>>(new Map());
  const [isAnalyzing, setIsAnalyzing] = useState(false);


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

  // Sätze: Team-Standard aus dem Produktkatalog, eigene Abweichungen aus user_commission_settings
  const { products } = useProducts();
  const [myRates, setMyRates] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!user) return;
    supabase.from('user_commission_settings').select('sub_category, rate_value').eq('user_id', user.id).then(({ data }) => {
        const mine: Record<string, number> = {};
        (data || []).forEach((row: { sub_category: string | null; rate_value: number }) => { if (row.sub_category) mine[row.sub_category] = Number(row.rate_value); });
        setMyRates(mine);
    });
  }, [user]);
  useEffect(() => {
    const rates: Record<string, number> = {};
    products.forEach((p) => { rates[p.name] = p.default_rate; });
    setUserRates({ ...rates, ...myRates });
  }, [products, myRates]);

  // --- Form State ---
  const [category, setCategory] = useState('life'); 
  const [subCategory, setSubCategory] = useState('Leben');
  // Anlage-, Bauspar- oder Darlehenssumme (Rechenart „Prozent der Vertragssumme“)
  const [contractSum, setContractSum] = useState<number | ''>('');
  
  // Basic Info
  const [policyNumber, setPolicyNumber] = useState('');
  const [submissionDate, setSubmissionDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [customerName, setCustomerName] = useState('');
  const [customerFirstname, setCustomerFirstname] = useState('');
  const [managedBy, setManagedBy] = useState<string>(''); 
  const [closedBy, setClosedBy] = useState<string>(''); // New: Explicit closer selection
  const [status, setStatus] = useState<'submitted' | 'policed' | 'cancelled'>('submitted');
  const [cancelledAt, setCancelledAt] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [cancelNote, setCancelNote] = useState('');
  
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
    

    // 2. Satz und Rechenart aus dem Produktkatalog
    const product = productByName(subCategory);
    const method = product?.calc_method || 'courtage_rate';
    const rate = userRates[subCategory] ?? product?.default_rate ?? 0;
    // Ein von Hand eingetragener Faktor geht vor (sonst würde er bei jeder Änderung überschrieben)
    const lvFactor = manualLvFactor !== null ? manualLvFactor : product?.lv_factor ?? 0;
    // Provision und Lebenswerte werden höchstens auf 35 Jahre gerechnet (in calcCommission)
    const result = calcCommission(method, {
        rate, net: netP, gross: grossP, factor, duration, installments: courtageInstallments(startDate, paymentMethod),
        contractSum: Number(contractSum) || 0, lvFactor,
    });

    setCommissionRate(rate);
    setValuationSum(result.valuation);
    setCommissionAmount(result.commission);
    setLifeValueFactor(lvFactor);
    setLifeValues(result.lifeValues);

  }, [netPremium, grossPremium, duration, paymentMethod, subCategory, userRates, manualLvFactor, startDate, contractSum, products]); 
  
  const formMethod = productByName(subCategory)?.calc_method || 'courtage_rate';
  // Meistgenutzte eigene Produkte als Favoriten in der Auswahl
  const favoriteProducts = useMemo(() => {
      const counts = new Map<string, number>();
      entries.filter(e => e.user_id === user?.id && e.sub_category).forEach(e => counts.set(e.sub_category, (counts.get(e.sub_category) || 0) + 1));
      return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
  }, [entries, user?.id]);
  const formIsCourtage = formMethod === 'courtage_rate';
  const courtageRates = courtageInstallments(startDate, paymentMethod);

  // Update Category when SubCategory changes (reverse lookup if needed, or just handle in UI)
  useEffect(() => {
      const parent = productByName(subCategory);
      if (parent && parent.area !== category) {
          setCategory(parent.area);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subCategory, products]);


  const fetchEntries = async () => {
    setLoading(true);
    const { data, error } = await supabase
        .from('production_entries')
        .select(`
            *,
            profiles:user_id (full_name, avatar_url, agency_number),
            manager:managed_by (full_name, avatar_url, agency_number)
        `)
        .order('created_at', { ascending: false });
    
    if (error) {
        console.error(error);
        toast.error('Fehler beim Laden.');
    } else {
        setEntries(data || []);
    }
    const { data: payouts } = await supabase.from('courtage_payouts').select('entry_id, year, received_date');
    setCourtagePayouts(payouts || []);
    const { data: docs } = await supabase.from('contract_documents').select('entry_id');
    const counts = new Map<string, number>();
    (docs || []).forEach((d: { entry_id: string }) => counts.set(d.entry_id, (counts.get(d.entry_id) || 0) + 1));
    setDocCounts(counts);
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
            liability_rate: 0, // Stornohaftung wird nicht mehr einbehalten
            status,
            cancelled_at: status === 'cancelled' ? (cancelledAt || format(new Date(), 'yyyy-MM-dd')) : null,
            cancel_reason: status === 'cancelled' ? (cancelReason || null) : null,
            cancel_note: status === 'cancelled' ? (cancelNote.trim() || null) : null,
            notes,
            life_values: lifeValues,
            life_value_factor: lifeValueFactor,
        };

        if (editingId) {
            // Update everything including user_id if changed
            const { error } = await supabase
                .from('production_entries')
                .update(basePayload)
                .eq('id', editingId);
            if (error) throw error;
            toast.success('Vertrag aktualisiert!');
        } else {
            const { data: created, error } = await supabase
                .from('production_entries')
                .insert({ ...basePayload, user_id: user.id })
                .select('id')
                .single();

            if (error) {
                if (error.message?.toLowerCase().includes('row-level security')) {
                    throw new Error('Keine Berechtigung (RLS): Du kannst nur Verträge für deinen User speichern.');
                }
                throw error;
            }
            if (selectedFile && created?.id) {
                try {
                    await uploadContractDocument(created.id, user.id, selectedFile, newDocKind);
                } catch (e) {
                    toast.error(`Dokument Upload fehlgeschlagen: ${(e as Error)?.message || 'Unbekannter Fehler'}`);
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
      setCancelledAt('');
      setCancelReason('');
      setCancelNote('');
      setStartDate('');
      setPolicingDate('');
      setCommissionReceivedDate('');
      setNetPremium('');
      setGrossPremium('');
      setContractSum('');
      setDuration(1);
      setPaymentMethod('monthly');
      setNotes('');
      // Lebenswerte und Faktor berechnet der Effekt neu; hier auf 0 setzen würde den Faktor bis zur nächsten Eingabe auf 0 lassen
      setManualLvFactor(null);
      setSelectedFile(null);
      setNewDocKind('antrag');
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
      setCancelledAt(entry.cancelled_at || '');
      setCancelReason(entry.cancel_reason || '');
      setCancelNote(entry.cancel_note || '');
      setCategory(entry.category);
      setSubCategory(entry.sub_category);
      setStartDate(entry.start_date || '');
      setPolicingDate(entry.policing_date || '');
      setCommissionReceivedDate(entry.commission_received_date || '');
      setPaymentMethod(entry.payment_method);
      setDuration(entry.duration || 1);
      setNetPremium(entry.net_premium || '');
      setGrossPremium(entry.gross_premium || '');
      setContractSum(productByName(entry.sub_category)?.calc_method === 'percent_sum' ? Number(entry.valuation_sum) || '' : '');
      setNotes(entry.notes || '');
      setLifeValues(entry.life_values || 0);
      setLifeValueFactor(entry.life_value_factor || 0);
      // Gespeicherten Faktor übernehmen, damit eine frühere Handeingabe nicht verloren geht
      setManualLvFactor(entry.life_value_factor ?? null);
      setSelectedFile(null);
      

      setIsModalOpen(true);
  };

  // Vorschläge für den Kundennamen: alle bekannten Kunden aus den Verträgen
  const customerOptions = useMemo(() => {
      const map = new Map<string, { label: string; last: string; first: string }>();
      entries.forEach((e: { customer_name?: string | null; customer_firstname?: string | null }) => {
          const last = (e.customer_name || '').trim();
          if (!last) return;
          const first = (e.customer_firstname || '').trim();
          const label = first ? `${last}, ${first}` : last;
          if (!map.has(label.toLowerCase())) map.set(label.toLowerCase(), { label, last, first });
      });
      return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'de'));
  }, [entries]);

  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleDelete = (id: string) => setDeleteId(id);

  const confirmDelete = async () => {
      if (!deleteId) return;
      const { data: docs } = await supabase.from('contract_documents').select('file_path').eq('entry_id', deleteId);
      const files = (docs || []).map((d: { file_path: string }) => d.file_path).filter((f: string) => !f.startsWith('http'));
      const { error } = await supabase.from('production_entries').delete().eq('id', deleteId);
      if (error) toast.error('Vertrag konnte nicht gelöscht werden.');
      else {
          if (files.length) await supabase.storage.from('production_docs').remove(files);
          toast.success('Vertrag gelöscht');
          fetchEntries();
      }
      setDeleteId(null);
  };

  // Sach-Courtage: eigene Sachverträge, die im gewählten Jahr Raten haben (auch Folgejahre, bis zum Storno)
  const courtageYearSel = selectedYear === 'all' ? thisYear : selectedYear;
  const courtageEntries = entries.filter(e => e.user_id === user?.id && isCourtage(e.sub_category));
  const courtageSummary = summarizeCourtage(courtageEntries, courtagePayouts, courtageYearSel);
  const courtageOpenIds = new Set(courtageSummary.openIds);
  const courtagePaidIds = new Set(courtagePayouts.filter(p => p.year === courtageYearSel).map(p => p.entry_id));

  const markAllCourtageReceived = async () => {
      const ids = courtageSummary.openIds;
      if (ids.length === 0) return;
      setMarkingCourtage(true);
      const { error } = await supabase.from('courtage_payouts').insert(ids.map(id => ({ entry_id: id, year: courtageYearSel, received_date: `${courtageYearSel}-12-31` })));
      setMarkingCourtage(false);
      if (error) toast.error('Konnte nicht gespeichert werden.');
      else {
          toast.success(`Courtage ${courtageYearSel} als erhalten markiert`);
          fetchEntries();
      }
  };

  // Alle Filter außer der Sparte (die Sparten-Kacheln zeigen diese Auswahl)
  const baseEntries = entries.filter(e => {
      if (viewMode === 'personal' && e.user_id !== user?.id) return false;
      if (onlyCourtage) {
          if (!courtageOpenIds.has(e.id)) return false;
      } else if (selectedYear !== 'all' && !String(e.submission_date || '').startsWith(`${selectedYear}-`)) return false;
      if (onlyOpenCommission && !(e.status === 'policed' && !e.commission_received_date && !isCourtage(e.sub_category))) return false;
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
  const filteredEntries = baseEntries
      .filter(e => filterCategory === 'all' || e.category === filterCategory)
      .sort((a, b) => String(b.submission_date).localeCompare(String(a.submission_date)) || String(b.created_at).localeCompare(String(a.created_at)));

  // Vertragsliste nach Einreichungsmonat gruppiert
  const entryGroups = filteredEntries.reduce<{ key: string; label: string; count: number; commission: number; lifeValues: number; entries: typeof filteredEntries }[]>((groups, e) => {
      const key = String(e.submission_date || '').slice(0, 7);
      let g = groups[groups.length - 1];
      if (!g || g.key !== key) {
          g = { key, label: key ? format(new Date(`${key}-01T00:00:00`), 'MMMM yyyy', { locale: de }) : 'Ohne Datum', count: 0, commission: 0, lifeValues: 0, entries: [] };
          groups.push(g);
      }
      g.entries.push(e);
      g.count++;
      if (e.status !== 'cancelled') {
          g.commission += Number(e.commission_amount || 0);
          g.lifeValues += Number(e.life_values || 0);
      }
      return groups;
  }, []);

  // Storno-Auswertung: eigene Verträge des gewählten Jahres (nach Einreichung)
  const stornoInfo = stornoStats(
      entries.filter(e => e.user_id === user?.id && (selectedYear === 'all' || String(e.submission_date || '').startsWith(`${selectedYear}-`))),
      AREAS.map(t => t.id),
  );

  // Bereiche mit Verträgen; die sechs klassischen Sparten bleiben immer sichtbar
  const categoryTiles = AREAS.map(t => {
      const rows = baseEntries.filter(e => e.category === t.id && e.status !== 'cancelled');
      return { id: t.id, label: t.label, amount: rows.reduce((a, e) => a + Number(e.commission_amount || 0), 0), count: rows.length };
  }).filter(t => t.count > 0 || ['life', 'health', 'property', 'car', 'legal', 'other'].includes(t.id) || t.id === filterCategory);

  // Stornierte Verträge zählen nicht in Summen, Diagramme und Rangliste
  const activeEntries = filteredEntries.filter(e => e.status !== 'cancelled');
  const cancelledCount = filteredEntries.length - activeEntries.length;
  const totalCommission = activeEntries.reduce((acc, curr) => acc + Number(curr.commission_amount || 0), 0);
  const totalLifeValues = activeEntries.reduce((acc, curr) => acc + Number(curr.life_values || 0), 0);

  // Lebenswerte mit Monatslisten-Korrektur: nur sinnvoll für die eigene Gesamtsumme eines Jahres (ohne Filter)
  const canCorrectLv = viewMode === 'personal' && selectedYear !== 'all' && filterCategory === 'all' && !searchQuery && !onlyOpenCommission && !!user;
  const myCorrectedLv = canCorrectLv ? correctedMonthlyLv(entries, lvSnapshots, user!.id, selectedYear as number) : null;
  const myComputedLv = canCorrectLv ? computedMonthlyLv(entries, user!.id, selectedYear as number) : null;
  const shownLifeValues = myCorrectedLv ? sumUntil(myCorrectedLv) : totalLifeValues;
  const lvCorrection = myCorrectedLv && myComputedLv ? sumUntil(myCorrectedLv) - sumUntil(myComputedLv) : 0;
  const yearOptions = Array.from(new Set([thisYear, ...entries.map(e => Number(String(e.submission_date || '').slice(0, 4))).filter(Boolean)])).sort((a, b) => b - a);

  // --- LEADERBOARD CALCULATION ---

  // Monatsverlauf für den Kopfbereich: ganzes gewähltes Jahr, bei "Alle Jahre" die letzten 12 Monate
  const heroMonths: HeroMonth[] = (() => {
      const now = new Date();
      const months = selectedYear !== 'all'
          ? Array.from({ length: 12 }, (_, i) => new Date(selectedYear, i, 1))
          : Array.from({ length: 12 }, (_, i) => new Date(now.getFullYear(), now.getMonth() - (11 - i), 1));
      return months.map(date => {
          const key = format(date, 'yyyy-MM');
          const rows = activeEntries.filter(e => String(e.submission_date || '').startsWith(key));
          let lifeValues = rows.reduce((acc, e) => acc + Number(e.life_values || 0), 0);
          if (myCorrectedLv && date.getFullYear() === selectedYear) lifeValues = myCorrectedLv[date.getMonth()];
          return {
              key,
              label: format(date, 'MMM', { locale: de }).replace('.', ''),
              commission: rows.reduce((acc, e) => acc + Number(e.commission_amount || 0), 0),
              lifeValues,
              current: key === format(now, 'yyyy-MM'),
              future: date > now,
          };
      });
  })();

  // Wo man beim Jahresziel laut Kalender heute stehen müsste
  const goalExpected = selectedYear === thisYear
      ? (Date.now() - new Date(thisYear, 0, 1).getTime()) / (new Date(thisYear + 1, 0, 1).getTime() - new Date(thisYear, 0, 1).getTime())
      : selectedYear !== 'all' && selectedYear < thisYear ? 1 : null;

  // Hochrechnung bis Jahresende (laufendes Jahr, frühestens ab einem Monat Laufzeit sinnvoll)
  const forecast = selectedYear === thisYear && goalExpected !== null
      ? (() => {
          const share = Math.max(goalExpected, 1 / 12);
          return { commission: totalCommission / share, lifeValues: shownLifeValues / share, remainingMonths: 12 - new Date().getMonth() };
      })()
      : null;

  // Jahresziel Lebenswerte (eigenes Profil), nur für ein einzelnes Jahr
  const myGoalProfile = profiles.find(p => p.id === user?.id);
  const lifeValuesGoal = viewMode === 'personal' && selectedYear !== 'all' && !searchQuery && filterCategory === 'all' && !onlyCourtage && !onlyOpenCommission
      ? Number(myGoalProfile?.yearly_goal) || (Number(myGoalProfile?.monthly_goal) || 0) * 12
      : 0;

  // Eigene Verträge in der aktuellen Auswahl (Sparte, Suche) für die Exporte
  const ownForExport = () => {
      const search = searchQuery.toLowerCase();
      return entries.filter(e =>
          e.user_id === user?.id &&
          (filterCategory === 'all' || e.category === filterCategory) &&
          (e.customer_name?.toLowerCase().includes(search) || e.policy_number?.toLowerCase().includes(search))
      );
  };

  const handleExport = () => {
      const list = ownForExport();
      if (list.length === 0) return toast.error('Keine eigenen Verträge in dieser Auswahl.');
      exportProductionCsv(list);
  };

  // Provision noch nicht eingegangen: policierte eigene Verträge ohne Eingangsdatum
  const openCommission = entries.filter(e => e.user_id === user?.id && e.status === 'policed' && !e.commission_received_date && !isCourtage(e.sub_category));

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
      const y = Number(reportMonth.slice(0, 4));
      const ok = await exportMonthlyReport({
          entries,
          snapshots: await fetchLvSnapshots(y),
          month: reportMonth,
          scope: profile?.roles?.includes('admin') ? reportScope : 'me',
          userId: user?.id,
          userName: profile?.full_name || '',
          people: profiles,
      });
      if (!ok) return toast.error(`Keine Verträge im ${format(new Date(y, Number(reportMonth.slice(5, 7)) - 1, 1), 'MMMM yyyy', { locale: de })}.`);
      setReportOpen(false);
  };

  const handleExportPDF = async () => {
      const list = ownForExport();
      if (list.length === 0) return toast.error('Keine eigenen Einträge gefunden.');
      await exportProductionPdf(list, { person: profile?.full_name || user?.email || '', category: filterCategory });
  };

  return (
    <div className="space-y-6">
        <PageHeader
            title="Produktion"
            description="Verträge erfassen, Provision und Lebenswerte im Blick behalten."
            actions={
                <>
                    <Segmented
                        value={viewMode}
                        onChange={(v) => setViewMode(v as 'personal' | 'leaderboard' | 'rates')}
                        options={[
                            { value: 'personal', label: 'Meine', icon: LayoutGrid },
                            { value: 'leaderboard', label: 'Rangliste', icon: Trophy },
                            { value: 'rates', label: 'Provisionssätze', icon: Percent },
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

        {viewMode === 'rates' ? (
            <CommissionRates myRates={myRates} onSaved={(name, value) => setMyRates((m) => { const n = { ...m }; if (value === null) delete n[name]; else n[name] = value; return n; })} />
        ) : viewMode === 'leaderboard' ? (
            <Leaderboard entries={entries} profiles={profiles} snapshots={lvSnapshots} year={thisYear} userId={user?.id} />
        ) : (
            <>
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
                    <ProductionHero
                        periodLabel={selectedYear === 'all' ? 'gesamt' : String(selectedYear)}
                        totalCommission={totalCommission}
                        totalLifeValues={shownLifeValues}
                        lifeValuesGoal={lifeValuesGoal}
                        goalExpected={goalExpected}
                        lifeValuesNote={lvCorrection ? `inkl. Korrektur ${lvCorrection > 0 ? '+' : ''}${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(lvCorrection)} laut Liste` : undefined}
                        months={heroMonths}
                        contractCount={activeEntries.length}
                        cancelledCount={cancelledCount}
                        forecast={forecast}
                    />
                    <CourtagePanel
                        year={courtageYearSel}
                        summary={courtageSummary}
                        active={onlyCourtage}
                        onToggleContracts={() => { setOnlyCourtage(v => !v); setFilterCategory('all'); setOnlyOpenCommission(false); }}
                        onMarkAllReceived={markAllCourtageReceived}
                        marking={markingCourtage}
                        loading={loading}
                    />
                </div>

                <CategoryTiles tiles={categoryTiles} value={filterCategory} onChange={(id) => { setFilterCategory(id); setOnlyCourtage(false); }} />

                <section aria-labelledby="contracts-title" className="card overflow-clip">
                    <div className="flex flex-col gap-3 border-b border-gray-100 px-4 py-4 dark:border-gray-700 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                            <h2 id="contracts-title" className="text-base font-semibold text-gray-900 dark:text-white">
                                Verträge
                                <span className="tabular ml-2 text-sm font-normal text-gray-400">{filteredEntries.length}</span>
                            </h2>
                            {onlyCourtage && (
                                <button type="button" onClick={() => setOnlyCourtage(false)} className="chip bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-200">
                                    Offene Courtage {courtageYearSel} <X className="h-3 w-3" />
                                </button>
                            )}
                            {filterCategory !== 'all' && (
                                <button type="button" onClick={() => setFilterCategory('all')} className="chip bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200">
                                    {categoryLabel(filterCategory)} <X className="h-3 w-3" />
                                </button>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                aria-pressed={onlyOpenCommission}
                                onClick={() => { setOnlyOpenCommission(v => !v); setOnlyCourtage(false); }}
                                className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors', onlyOpenCommission ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200' : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700/50')}
                                title="Policierte Verträge, deren Provision noch nicht eingegangen ist"
                            >
                                <Hourglass className="h-3.5 w-3.5" />
                                Provision offen
                                {openCommission.length > 0 && <span className="tabular rounded bg-white/70 px-1 dark:bg-black/20">{openCommission.length}</span>}
                            </button>
                            <div className="relative w-full sm:w-64">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                                <input type="search" placeholder="Kunde, Schein-Nr., Notiz" aria-label="Verträge durchsuchen" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="input pl-9" />
                            </div>
                        </div>
                    </div>

                    {loading ? (
                        <p className="px-6 py-12 text-center text-sm text-gray-500">Verträge werden geladen</p>
                    ) : filteredEntries.length === 0 ? (
                        <EmptyState
                            icon={FileText}
                            title={searchQuery || filterCategory !== 'all' || onlyCourtage || onlyOpenCommission ? 'Keine Verträge in dieser Auswahl' : 'Noch keine Verträge erfasst'}
                            description={searchQuery || filterCategory !== 'all' || onlyCourtage || onlyOpenCommission ? 'Ändere Filter oder Suche.' : 'Erfasse deinen ersten Vertrag, dann erscheinen hier Provision und Lebenswerte.'}
                            action={!searchQuery && filterCategory === 'all' && !onlyCourtage && !onlyOpenCommission ? <Button icon={Plus} onClick={() => { resetForm(); setIsModalOpen(true); }}>Vertrag erfassen</Button> : undefined}
                        />
                    ) : (
                        <>
                            <div className="hidden lg:block">
                                <table className="w-full text-left text-sm">
                                    <thead>
                                        <tr className="text-xs text-gray-500 dark:text-gray-400 [&>th]:border-b [&>th]:border-gray-200 [&>th]:px-4 [&>th]:py-2.5 [&>th]:font-medium dark:[&>th]:border-gray-700">
                                            <th className="!pl-6">Kunde</th>
                                            <th>Status</th>
                                            <th>Betreuung</th>
                                            <th className="text-right">Beitrag</th>
                                            <th className="text-right">Lebenswerte</th>
                                            <th className="text-right">Provision</th>
                                            <th className="w-20"><span className="sr-only">Aktionen</span></th>
                                        </tr>
                                    </thead>
                                    {entryGroups.map(group => (
                                        <tbody key={group.key}>
                                            <tr>
                                                <th colSpan={3} scope="colgroup" className="sticky top-14 z-10 border-b border-gray-200 bg-gray-50 px-4 py-2.5 text-left !pl-6 dark:border-gray-700 dark:bg-gray-900">
                                                    <span className="font-display text-base font-semibold text-gray-900 dark:text-white">{group.label}</span>
                                                    <span className="tabular ml-2 text-xs font-normal text-gray-500">{group.count} {group.count === 1 ? 'Vertrag' : 'Verträge'}</span>
                                                </th>
                                                <th className="sticky top-14 z-10 border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900"><span className="sr-only">Beitrag</span></th>
                                                <th className="tabular sticky top-14 z-10 border-b border-gray-200 bg-gray-50 px-4 text-right text-xs font-medium text-brand-700 dark:border-gray-700 dark:bg-gray-900 dark:text-brand-300">{nf0.format(group.lifeValues)} LW</th>
                                                <th className="tabular sticky top-14 z-10 border-b border-gray-200 bg-gray-50 px-4 text-right font-display text-base font-semibold text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-white">{formatCurrency(group.commission)}</th>
                                                <th className="sticky top-14 z-10 border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900"><span className="sr-only">Aktionen</span></th>
                                            </tr>
                                            {group.entries.map(entry => {
                                                const st = STATUS_META[entry.status] || STATUS_META.submitted;
                                                const cancelled = entry.status === 'cancelled';
                                                const courtage = isCourtage(entry.sub_category);
                                                const color = CATEGORY_COLORS[entry.category] || '#9AA39C';
                                                const managerName = entry.manager?.full_name || entry.profiles?.full_name;
                                                return (
                                                    <tr key={entry.id} className={cn('group transition-colors hover:bg-brand-50/40 dark:hover:bg-white/[0.03] [&>td]:border-b [&>td]:border-gray-100 [&>td]:px-4 [&>td]:py-3.5 dark:[&>td]:border-gray-700/60', cancelled && 'opacity-55')}>
                                                        <td className="relative !pl-6">
                                                            <span aria-hidden className="absolute inset-y-2.5 left-0 w-1 rounded-r transition-all group-hover:inset-y-1.5 group-hover:w-1.5" style={{ background: color }} />
                                                            <button type="button" onClick={() => handleEdit(entry)} className={cn('text-left text-[15px] font-semibold text-gray-900 hover:text-brand-700 dark:text-white dark:hover:text-brand-300', cancelled && 'line-through decoration-gray-400')}>
                                                                {entry.customer_name}{entry.customer_firstname ? `, ${entry.customer_firstname}` : ''}
                                                            </button>
                                                            <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                                                                <span className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 font-medium text-gray-800 dark:text-gray-100" style={{ background: `${color}26` }}>
                                                                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                                                                    {entry.sub_category || categoryLabel(entry.category)}
                                                                </span>
                                                                <span className="font-mono">{entry.policy_number || 'ohne Nr.'}</span>
                                                                <span>{format(new Date(entry.submission_date), 'dd.MM.yy')}</span>
                                                                {(docCounts.get(entry.id) || 0) > 0 && (
                                                                    <button type="button" onClick={() => handleEdit(entry)} className="inline-flex items-center gap-0.5 rounded p-0.5 text-brand-600 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-900/40" title="Dokumente ansehen" aria-label={`${docCounts.get(entry.id)} Dokumente ansehen`}>
                                                                        <FileText className="h-3.5 w-3.5" />
                                                                        {(docCounts.get(entry.id) || 0) > 1 && <span className="tabular text-2xs font-semibold">{docCounts.get(entry.id)}</span>}
                                                                    </button>
                                                                )}
                                                            </span>
                                                        </td>
                                                        <td>
                                                            <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', STATUS_PILL[entry.status] || STATUS_PILL.submitted)}>
                                                                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                                                                {st.label}
                                                            </span>
                                                            {cancelled && (entry.cancelled_at || entry.cancel_reason) && (
                                                                <span className="mt-1 block max-w-[11rem] truncate text-2xs text-gray-500" title={entry.cancel_note || undefined}>
                                                                    {entry.cancelled_at ? `am ${format(new Date(entry.cancelled_at), 'dd.MM.yy')}` : ''}{entry.cancelled_at && entry.cancel_reason ? ', ' : ''}{entry.cancel_reason || ''}
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td>
                                                            {managerName ? (
                                                                <span className="flex items-center gap-2.5">
                                                                    <Avatar name={managerName} src={entry.manager?.avatar_url || (!entry.manager ? entry.profiles?.avatar_url : null)} size="sm" />
                                                                    <span className="min-w-0">
                                                                        <span className="block truncate text-gray-800 dark:text-gray-200">{managerName}</span>
                                                                        {entry.profiles?.full_name && entry.profiles.full_name !== managerName && <span className="block truncate text-xs text-gray-500">von {entry.profiles.full_name}</span>}
                                                                    </span>
                                                                </span>
                                                            ) : <span className="text-gray-400">–</span>}
                                                        </td>
                                                        <td className="tabular text-right text-gray-500 dark:text-gray-400">
                                                            <span className="block text-gray-700 dark:text-gray-300">{formatCurrency(entry.gross_premium || 0)}</span>
                                                            <span className="text-xs">{PAYMENT_LABEL[entry.payment_method] || entry.payment_method}</span>
                                                        </td>
                                                        <td className="tabular text-right font-medium text-brand-700 dark:text-brand-300">{nf0.format(entry.life_values || 0)}</td>
                                                        <td className="text-right">
                                                            <span className={cn('tabular block font-display text-lg font-semibold leading-tight text-gray-900 dark:text-white', cancelled && 'line-through decoration-gray-400')}>{formatCurrency(entry.commission_amount || 0)}</span>
                                                            {courtage ? (
                                                                courtageOpenIds.has(entry.id) ? (
                                                                    <span className="mt-1 inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-2xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                                                                        <CalendarClock className="h-3 w-3" /> Courtage zum 31.12.
                                                                    </span>
                                                                ) : courtagePaidIds.has(entry.id) ? (
                                                                    <span className="mt-1 inline-flex items-center gap-1 text-2xs font-medium text-emerald-700 dark:text-emerald-400"><Check className="h-3 w-3" /> Courtage {courtageYearSel} erhalten</span>
                                                                ) : null
                                                            ) : entry.status === 'policed' && entry.user_id === user?.id && (entry.commission_received_date ? (
                                                                <span className="mt-1 inline-flex items-center gap-1 text-2xs font-medium text-emerald-700 dark:text-emerald-400"><Check className="h-3 w-3" /> erhalten {format(new Date(entry.commission_received_date), 'dd.MM.')}</span>
                                                            ) : (
                                                                <button type="button" onClick={() => markCommissionReceived(entry.id)} className="mt-1 inline-flex items-center gap-1 rounded-md border border-amber-300 px-1.5 py-0.5 text-2xs font-medium text-amber-800 transition-colors hover:bg-amber-50 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900/30" title="Provision als erhalten markieren">
                                                                    <Hourglass className="h-3 w-3" /> Offen, erhalten?
                                                                </button>
                                                            ))}
                                                        </td>
                                                        <td>
                                                            <div className="flex justify-end gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                                                                <button type="button" onClick={() => handleEdit(entry)} className="btn-icon p-1.5" title="Bearbeiten" aria-label="Bearbeiten"><Pencil className="h-4 w-4" /></button>
                                                                <button type="button" onClick={() => handleDelete(entry.id)} className="btn-icon p-1.5 hover:!text-red-600" title="Löschen" aria-label="Löschen"><Trash2 className="h-4 w-4" /></button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    ))}
                                </table>
                            </div>

                            <div className="lg:hidden">
                                {entryGroups.map(group => (
                                    <div key={group.key}>
                                        <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-10 flex items-baseline justify-between border-b border-gray-200 bg-gray-50 px-4 py-2.5 dark:border-gray-700 dark:bg-gray-900">
                                            <span className="font-display text-base font-semibold text-gray-900 dark:text-white">{group.label}</span>
                                            <span className="tabular font-display text-base font-semibold text-gray-900 dark:text-white">{formatCurrency(group.commission)}</span>
                                        </div>
                                        <ul className="divide-y divide-gray-100 dark:divide-gray-700/70">
                                            {group.entries.map(entry => {
                                                const st = STATUS_META[entry.status] || STATUS_META.submitted;
                                                const color = CATEGORY_COLORS[entry.category] || '#9AA39C';
                                                const cancelled = entry.status === 'cancelled';
                                                return (
                                                    <li key={entry.id} className={cn(cancelled && 'opacity-55')}>
                                                        <button type="button" onClick={() => handleEdit(entry)} className="relative flex w-full items-start gap-3 py-3.5 pl-5 pr-4 text-left">
                                                            <span aria-hidden className="absolute inset-y-3 left-0 w-1 rounded-r" style={{ background: color }} />
                                                            <span className="min-w-0 flex-1">
                                                                <span className={cn('block truncate text-[15px] font-semibold text-gray-900 dark:text-white', cancelled && 'line-through')}>{entry.customer_name}{entry.customer_firstname ? `, ${entry.customer_firstname}` : ''}</span>
                                                                <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                                                                    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium', STATUS_PILL[entry.status] || STATUS_PILL.submitted)}>
                                                                        <span className="h-1.5 w-1.5 rounded-full bg-current" />{st.label}
                                                                    </span>
                                                                    <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-gray-800 dark:text-gray-100" style={{ background: `${color}26` }}>
                                                                        {entry.sub_category || categoryLabel(entry.category)}
                                                                    </span>
                                                                    {format(new Date(entry.submission_date), 'dd.MM.')}
                                                                </span>
                                                            </span>
                                                            <span className="text-right">
                                                                <span className={cn('tabular block font-display text-base font-semibold text-gray-900 dark:text-white', cancelled && 'line-through')}>{formatCurrency(entry.commission_amount || 0)}</span>
                                                                <span className="tabular block text-xs font-medium text-brand-700 dark:text-brand-300">{nf0.format(entry.life_values || 0)} LW</span>
                                                            </span>
                                                        </button>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </section>

                {stornoInfo.cancelled > 0 && (
                    <section aria-labelledby="storno-title" className="card card-pad">
                        <div className="flex flex-wrap items-baseline justify-between gap-3">
                            <h2 id="storno-title" className="font-display text-lg font-semibold text-gray-900 dark:text-white">Stornos {selectedYear === 'all' ? 'gesamt' : selectedYear}</h2>
                            <p className="text-sm text-gray-500">
                                <span className="tabular font-display text-2xl font-semibold text-red-600 dark:text-red-400">{stornoInfo.rate.toLocaleString('de-DE', { maximumFractionDigits: 1 })} %</span>
                                <span className="ml-2">{stornoInfo.cancelled} von {stornoInfo.total} Verträgen</span>
                            </p>
                        </div>
                        <div className="mt-5 grid gap-8 md:grid-cols-2">
                            <div>
                                <h3 className="mb-3 text-xs font-medium text-gray-500">Quote nach Sparte</h3>
                                <ul className="space-y-3">
                                    {stornoInfo.byCategory.map(c => (
                                        <li key={c.id}>
                                            <div className="flex items-baseline justify-between text-sm">
                                                <span className="flex items-center gap-2 text-gray-700 dark:text-gray-200"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: CATEGORY_COLORS[c.id] }} />{categoryLabel(c.id)}</span>
                                                <span className="tabular text-gray-500"><span className="font-semibold text-gray-900 dark:text-white">{Math.round(c.rate)} %</span> · {c.cancelled}/{c.total}</span>
                                            </div>
                                            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                                                <div className="h-full rounded-full bg-red-500/80" style={{ width: `${c.rate}%` }} />
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            <div>
                                <h3 className="mb-3 text-xs font-medium text-gray-500">Gründe</h3>
                                <ul className="space-y-2">
                                    {stornoInfo.byReason.map(r => (
                                        <li key={r.reason} className="flex items-center justify-between gap-3 text-sm">
                                            <span className="text-gray-700 dark:text-gray-200">{r.reason}</span>
                                            <span className="tabular rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-300">{r.count}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    </section>
                )}
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
                        <Field label="Versicherung / Produkt" htmlFor="pf-product" hint={`${categoryLabel(category)} · ${methodOf(formMethod).label}`}>
                            <ProductPicker id="pf-product" value={subCategory} favorites={favoriteProducts} onChange={(p) => { setSubCategory(p.name); setCategory(p.area); setManualLvFactor(null); }} />
                        </Field>

                        <div className="grid grid-cols-2 gap-4">
                            <Field label="Nachname" htmlFor="pf-name" hint={!editingId ? 'Bestehende Kunden werden vorgeschlagen' : undefined}>
                                <input id="pf-name" required type="text" list="pf-customers" autoComplete="off" value={customerName} onChange={e => {
                                    const v = e.target.value;
                                    const match = customerOptions.find(o => o.label === v);
                                    if (match) { setCustomerName(match.last); setCustomerFirstname(match.first); }
                                    else setCustomerName(v);
                                }} className="input" />
                                <datalist id="pf-customers">
                                    {customerOptions.map(o => <option key={o.label} value={o.label} />)}
                                </datalist>
                            </Field>
                            <Field label="Vorname" htmlFor="pf-first"><input id="pf-first" type="text" value={customerFirstname} onChange={e => setCustomerFirstname(e.target.value)} className="input" /></Field>
                            <Field label="Versicherungsschein-Nr." htmlFor="pf-policy"><input id="pf-policy" type="text" value={policyNumber} onChange={e => setPolicyNumber(e.target.value)} className="input font-mono" /></Field>
                            <Field label="Status" htmlFor="pf-status">
                                <select id="pf-status" value={status} onChange={(e) => { const v = e.target.value as 'submitted' | 'policed' | 'cancelled'; setStatus(v); if (v === 'cancelled' && !cancelledAt) setCancelledAt(format(new Date(), 'yyyy-MM-dd')); }} className="input">
                                    <option value="submitted">Eingereicht</option>
                                    <option value="policed">Policiert</option>
                                    <option value="cancelled">Storniert</option>
                                </select>
                            </Field>
                        </div>

                        {status === 'cancelled' && (
                            <div className="grid grid-cols-1 gap-4 rounded-xl border border-red-200 bg-red-50/50 p-4 dark:border-red-900/50 dark:bg-red-950/20 sm:grid-cols-3">
                                <Field label="Storniert am" htmlFor="pf-cancel-date">
                                    <input id="pf-cancel-date" type="date" value={cancelledAt} onChange={e => setCancelledAt(e.target.value)} className="input" />
                                </Field>
                                <Field label="Grund" htmlFor="pf-cancel-reason">
                                    <select id="pf-cancel-reason" value={cancelReason} onChange={e => setCancelReason(e.target.value)} className="input">
                                        <option value="">Bitte wählen</option>
                                        {CANCEL_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                                    </select>
                                </Field>
                                <Field label="Notiz" htmlFor="pf-cancel-note">
                                    <input id="pf-cancel-note" type="text" value={cancelNote} onChange={e => setCancelNote(e.target.value)} placeholder="optional" className="input" />
                                </Field>
                                {formIsCourtage && <p className="text-xs text-gray-500 sm:col-span-3">Ab dem Stornomonat zählt keine Courtage mehr.</p>}
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                            {formMethod === 'percent_sum' && (
                                <Field label="Vertragssumme" htmlFor="pf-sum" hint="Anlage-, Bauspar- oder Darlehenssumme">
                                    <div className="relative">
                                        <input id="pf-sum" type="number" step="0.01" inputMode="decimal" value={contractSum} onChange={e => setContractSum(e.target.value ? Number(e.target.value) : '')} className="input tabular pr-8" />
                                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">€</span>
                                    </div>
                                </Field>
                            )}
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
                                {editingId ? (
                                    <Field label="Dokumente" className="sm:col-span-2">
                                        <ContractDocuments entryId={editingId} />
                                    </Field>
                                ) : (
                                <Field label="Dokument (Police, Antrag, Protokoll)" htmlFor="pf-file" className="sm:col-span-2">
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                        <select value={newDocKind} onChange={e => setNewDocKind(e.target.value as DocKind)} className="input sm:w-48" aria-label="Art des Dokuments">
                                            {DOC_KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
                                        </select>
                                        <input id="pf-file" type="file" onChange={e => setSelectedFile(e.target.files?.[0] || null)} className="block w-full text-xs text-gray-500 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-gray-700 hover:file:bg-gray-200 dark:file:bg-gray-700 dark:file:text-gray-200" />
                                    </div>
                                    {selectedFile && (
                                        <button type="button" onClick={handleAIAnalysis} disabled={isAnalyzing} className="btn-secondary btn-sm mt-2">
                                            {isAnalyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                                            Felder aus PDF füllen
                                        </button>
                                    )}
                                </Field>
                                )}
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
                                {formIsCourtage && (
                                    <p className="mt-1 text-xs text-gray-500">
                                        {courtageRates} {courtageRates === 1 ? 'Rate' : 'Raten'} à {formatCurrency((Number(netPremium) || 0) * (Number(commissionRate) || 0) / 100)}, Auszahlung zum 31.12.
                                        {!startDate && paymentMethod !== 'one_time' && ' Ohne Vertragsbeginn wird das ganze Jahr gerechnet.'}
                                    </p>
                                )}
                            </div>
                            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-brand-100 pt-4 text-sm dark:border-brand-900">
                                <div>
                                    <dt className="text-xs text-gray-500">{formMethod === 'promille_sum' ? 'Satz (Promille)' : formMethod === 'monthly_multiple' ? 'Monatsbeiträge' : formMethod === 'fixed' ? 'Fester Betrag (€)' : 'Satz (Prozent)'}</dt>
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

    </div>
  );
};
