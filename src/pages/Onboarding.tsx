import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Check, Sparkles, Shield, Heart, Car, Home, Gavel, Save } from 'lucide-react';
import { toast } from 'react-hot-toast';

// Default config structure to iterate over
const INSURANCE_TYPES = [
    { id: 'life', label: 'Leben & Vorsorge', icon: Sparkles, subcategories: ['Leben', 'BU'], unit: 'Promille (‰)' },
    { id: 'health', label: 'Krankenversicherung', icon: Heart, subcategories: ['KV Voll', 'KV Zusatz', 'Reise-KV'], unit: 'MB / %' },
    { id: 'property', label: 'Sachversicherung', icon: Home, subcategories: ['PHV', 'HR', 'UNF', 'Sach'], unit: 'Prozent (%)' },
    { id: 'car', label: 'KFZ', icon: Car, subcategories: ['KFZ'], unit: 'Prozent (%)' },
    { id: 'legal', label: 'Rechtsschutz', icon: Gavel, subcategories: ['Rechtsschutz'], unit: 'Prozent (%)' },
    { id: 'other', label: 'Sonstige', icon: Shield, subcategories: ['Sonstige'], unit: 'Prozent (%)' },
];

export const Onboarding = () => {
  const { user, fetchProfile } = useStore();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  
  // State to hold all rates: { "Leben": 8.0, "BU": 8.0, ... }
  const [rates, setRates] = useState<Record<string, number>>({});

  // Initialize with defaults if empty
  useEffect(() => {
    // Standard defaults
    const defaults: Record<string, number> = {
        'Leben': 8.0, 'BU': 8.0,
        'KV Voll': 3.0, 'KV Zusatz': 3.0, 'Reise-KV': 10.0,
        'PHV': 7.5, 'HR': 7.5, 'UNF': 7.5, 'Sach': 7.5,
        'KFZ': 3.0,
        'Rechtsschutz': 5.0,
        'Sonstige': 5.0
    };
    
    // Check if we already have settings in DB to pre-fill
    const loadSettings = async () => {
        if (!user) return;
        const { data } = await supabase.from('user_commission_settings').select('*').eq('user_id', user.id);
        
        if (data && data.length > 0) {
            const loaded: Record<string, number> = {};
            data.forEach((row: any) => {
                if (row.sub_category) loaded[row.sub_category] = Number(row.rate_value);
            });
            setRates(prev => ({ ...defaults, ...prev, ...loaded }));
        } else {
            setRates(defaults);
        }
    };
    loadSettings();
  }, [user]);

  const handleRateChange = (sub: string, val: string) => {
      setRates(prev => ({ ...prev, [sub]: parseFloat(val) || 0 }));
  };

  const handleNext = async () => {
      if (step < INSURANCE_TYPES.length - 1) {
          setStep(step + 1);
      } else {
          // Finish & Save
          await saveSettings();
      }
  };

  const saveSettings = async () => {
      if (!user) return;
      setLoading(true);
      
      try {
          // Prepare upsert data
          const upsertData = [];
          for (const type of INSURANCE_TYPES) {
              for (const sub of type.subcategories) {
                  upsertData.push({
                      user_id: user.id,
                      category: type.id,
                      sub_category: sub,
                      rate_value: rates[sub]
                  });
              }
          }

          const { error } = await supabase
              .from('user_commission_settings')
              .upsert(upsertData, { onConflict: 'user_id,category,sub_category' });

          if (error) throw error;

          toast.success('Einstellungen gespeichert!');
          // Maybe update a profile flag "onboarding_completed" if we had one, but simple redirect works
          navigate('/');
      } catch (err) {
          console.error(err);
          toast.error('Fehler beim Speichern.');
      } finally {
          setLoading(false);
      }
  };

  const currentType = INSURANCE_TYPES[step];
  const Icon = currentType.icon;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center">
            <div className="mx-auto h-12 w-12 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200 dark:shadow-none">
                <Sparkles className="h-6 w-6 text-white" />
            </div>
            <h2 className="mt-6 text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                Provisions-Setup
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                Schritt {step + 1} von {INSURANCE_TYPES.length}: {currentType.label}
            </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white dark:bg-gray-800 py-8 px-4 shadow-xl rounded-2xl sm:px-10 border border-gray-100 dark:border-gray-700 relative overflow-hidden">
            
            {/* Progress Bar */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gray-100 dark:bg-gray-700">
                <motion.div 
                    className="h-full bg-indigo-600"
                    initial={{ width: 0 }}
                    animate={{ width: `${((step + 1) / INSURANCE_TYPES.length) * 100}%` }}
                />
            </div>

            <AnimatePresence mode="wait">
                <motion.div
                    key={step}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-6 mt-4"
                >
                    <div className="flex items-center gap-4 mb-6">
                        <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg">
                            <Icon className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <div>
                            <h3 className="text-lg font-medium text-gray-900 dark:text-white">{currentType.label}</h3>
                            <p className="text-xs text-gray-500">Einheit: {currentType.unit}</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {currentType.subcategories.map(sub => (
                            <div key={sub}>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    {sub} {sub === 'KV Voll' || sub === 'KV Zusatz' ? '(Monatsbeiträge)' : ''}
                                </label>
                                <div className="relative rounded-md shadow-sm">
                                    <input
                                        type="number"
                                        step="0.1"
                                        value={rates[sub] || ''}
                                        onChange={e => handleRateChange(sub, e.target.value)}
                                        className="block w-full rounded-lg border-gray-300 dark:border-gray-600 pl-4 pr-12 py-3 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm bg-gray-50 dark:bg-gray-900 dark:text-white"
                                        placeholder="0.0"
                                    />
                                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                                        <span className="text-gray-500 sm:text-sm">
                                            {currentType.id === 'life' ? '‰' : (sub.includes('KV') && !sub.includes('Reise') ? 'MB' : '%')}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>
            </AnimatePresence>

            <div className="mt-8 flex justify-between items-center gap-4">
                <button
                    type="button"
                    onClick={() => step > 0 && setStep(step - 1)}
                    disabled={step === 0}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                        step === 0 
                            ? 'text-gray-300 cursor-not-allowed' 
                            : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-700'
                    }`}
                >
                    Zurück
                </button>
                
                <button
                    type="button"
                    onClick={handleNext}
                    disabled={loading}
                    className="flex-1 flex justify-center items-center gap-2 px-4 py-3 border border-transparent text-sm font-medium rounded-xl shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all disabled:opacity-70"
                >
                    {loading ? 'Speichere...' : (step === INSURANCE_TYPES.length - 1 ? 'Fertigstellen' : 'Weiter')}
                    {!loading && (step === INSURANCE_TYPES.length - 1 ? <Check className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />)}
                </button>
            </div>

          </div>
          
          <div className="mt-6 text-center">
              <button onClick={() => navigate('/')} className="text-xs text-gray-400 hover:text-gray-500">
                  Überspringen (Standards nutzen)
              </button>
          </div>

        </div>
      </div>
    </div>
  );
};
