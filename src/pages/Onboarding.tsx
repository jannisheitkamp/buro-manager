import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Check, Sparkles, Shield, Heart, Car, Home, Gavel, Save } from 'lucide-react';
import { toast } from 'react-hot-toast';

// Default config structure
const INSURANCE_TYPES = [
    { id: 'life', label: 'Leben & Vorsorge', icon: Sparkles, subcategories: ['Leben', 'BU'], unit: 'Promille (‰)', color: 'from-amber-400 to-orange-500' },
    { id: 'health', label: 'Krankenversicherung', icon: Heart, subcategories: ['KV Voll', 'KV Zusatz', 'Reise-KV'], unit: 'MB / %', color: 'from-rose-400 to-red-500' },
    { id: 'property', label: 'Sachversicherung', icon: Home, subcategories: ['PHV', 'HR', 'UNF', 'Sach'], unit: 'Prozent (%)', color: 'from-emerald-400 to-green-500' },
    { id: 'car', label: 'KFZ', icon: Car, subcategories: ['KFZ'], unit: 'Prozent (%)', color: 'from-blue-400 to-indigo-500' },
    { id: 'legal', label: 'Rechtsschutz', icon: Gavel, subcategories: ['Rechtsschutz'], unit: 'Prozent (%)', color: 'from-purple-400 to-violet-500' },
    { id: 'other', label: 'Sonstige', icon: Shield, subcategories: ['Sonstige'], unit: 'Prozent (%)', color: 'from-gray-400 to-gray-500' },
];

export const Onboarding = () => {
  const { user } = useStore();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [rates, setRates] = useState<Record<string, number>>({});

  useEffect(() => {
    const defaults: Record<string, number> = {
        'Leben': 8.0, 'BU': 8.0,
        'KV Voll': 3.0, 'KV Zusatz': 3.0, 'Reise-KV': 10.0,
        'PHV': 7.5, 'HR': 7.5, 'UNF': 7.5, 'Sach': 7.5,
        'KFZ': 3.0,
        'Rechtsschutz': 5.0,
        'Sonstige': 5.0
    };
    
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
          await saveSettings();
      }
  };

  const saveSettings = async () => {
      if (!user) return;
      setLoading(true);
      
      try {
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
    <div className="min-h-screen bg-[#F3F4F6] dark:bg-gray-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
        {/* Background Gradients */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <motion.div 
            animate={{ 
                background: `radial-gradient(circle at 80% 20%, ${currentType.id === 'life' ? '#FCD34D' : currentType.id === 'health' ? '#FDA4AF' : '#818CF8'}10 0%, transparent 50%)` 
            }}
            className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full blur-3xl transition-colors duration-1000" 
          />
          <div className="absolute bottom-[-10%] left-[-5%] w-[500px] h-[500px] bg-gray-200/50 dark:bg-gray-800/50 rounded-full blur-3xl" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="sm:mx-auto sm:w-full sm:max-w-xl relative z-10"
      >
        <div className="text-center mb-8">
            <motion.div 
                key={currentType.id}
                initial={{ scale: 0.8, rotate: -10 }}
                animate={{ scale: 1, rotate: 0 }}
                className={`mx-auto h-20 w-20 bg-gradient-to-br ${currentType.color} rounded-3xl shadow-xl flex items-center justify-center mb-6 text-white`}
            >
                <Icon className="h-10 w-10" />
            </motion.div>
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                Provisions-Setup
            </h2>
            <p className="mt-2 text-gray-500 dark:text-gray-400">
                Schritt {step + 1} von {INSURANCE_TYPES.length}
            </p>
        </div>

        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl shadow-2xl rounded-3xl border border-white/20 dark:border-gray-700/50 relative overflow-hidden">
            
            {/* Progress Bar */}
            <div className="h-1.5 w-full bg-gray-100 dark:bg-gray-700/50">
                <motion.div 
                    className={`h-full bg-gradient-to-r ${currentType.color}`}
                    initial={{ width: `${((step) / INSURANCE_TYPES.length) * 100}%` }}
                    animate={{ width: `${((step + 1) / INSURANCE_TYPES.length) * 100}%` }}
                    transition={{ duration: 0.5, ease: "easeInOut" }}
                />
            </div>

            <div className="p-8 sm:p-10">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={step}
                        initial={{ opacity: 0, x: 50 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -50 }}
                        transition={{ duration: 0.3 }}
                    >
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">{currentType.label}</h3>
                                <p className="text-sm text-gray-500 mt-1">Einheit: <span className="font-semibold text-gray-700 dark:text-gray-300">{currentType.unit}</span></p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            {currentType.subcategories.map(sub => (
                                <div key={sub} className="group">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                        {sub} {sub === 'KV Voll' || sub === 'KV Zusatz' ? '(MB)' : ''}
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            step="0.1"
                                            value={rates[sub] || ''}
                                            onChange={e => handleRateChange(sub, e.target.value)}
                                            className="block w-full rounded-2xl border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 pl-5 pr-12 py-4 text-lg font-semibold focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all focus:bg-white dark:focus:bg-gray-800"
                                            placeholder="0.0"
                                        />
                                        <div className="absolute inset-y-0 right-0 flex items-center pr-5 pointer-events-none">
                                            <span className="text-gray-400 font-medium">
                                                {currentType.id === 'life' ? '‰' : (sub.includes('KV') && !sub.includes('Reise') ? 'MB' : '%')}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                </AnimatePresence>

                <div className="mt-10 flex justify-between items-center gap-4 pt-8 border-t border-gray-100 dark:border-gray-700">
                    <button
                        type="button"
                        onClick={() => step > 0 && setStep(step - 1)}
                        disabled={step === 0}
                        className={`px-6 py-3 rounded-2xl font-medium transition-all ${
                            step === 0 
                                ? 'text-gray-300 cursor-not-allowed' 
                                : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                        }`}
                    >
                        Zurück
                    </button>
                    
                    <button
                        type="button"
                        onClick={handleNext}
                        disabled={loading}
                        className={`flex items-center gap-2 px-8 py-3 rounded-2xl text-white font-bold shadow-lg shadow-indigo-200 dark:shadow-none transition-all hover:scale-105 active:scale-95 bg-gradient-to-r ${currentType.color}`}
                    >
                        {loading ? 'Speichere...' : (step === INSURANCE_TYPES.length - 1 ? 'Fertigstellen' : 'Weiter')}
                        {!loading && (step === INSURANCE_TYPES.length - 1 ? <Check className="w-5 h-5" /> : <ArrowRight className="w-5 h-5" />)}
                    </button>
                </div>
            </div>

        </div>
        
        <div className="mt-8 text-center">
            <button onClick={() => navigate('/')} className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                Überspringen und Standardwerte nutzen
            </button>
        </div>

      </motion.div>
    </div>
  );
};
