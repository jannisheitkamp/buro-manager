import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { Sparkles, Shield, Heart, Car, Home, Gavel } from 'lucide-react';
import { AuthShell } from '@/components/AuthShell';
import { Button } from '@/components/ui';
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

          toast.success('Provisionssätze gespeichert');
          navigate('/', { replace: true });
      } catch (err) {
          console.error(err);
          toast.error('Fehler beim Speichern.');
      } finally {
          setLoading(false);
      }
  };

  return (
    <AuthShell
      wide
      title="Willkommen im Büro Manager"
      description="Hinterlege einmal deine Provisionssätze. Damit rechnet die Produktion Provision und Lebenswerte automatisch aus. Die Standardwerte sind schon eingetragen, du kannst sie später im Profil ändern."
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          saveSettings();
        }}
        className="space-y-6"
      >
        {INSURANCE_TYPES.map((type) => {
          const TypeIcon = type.icon;
          return (
            <fieldset key={type.id}>
              <legend className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
                <TypeIcon className="h-4 w-4 text-gray-400" />
                {type.label}
                <span className="font-normal text-gray-400">· {type.unit}</span>
              </legend>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {type.subcategories.map((sub) => (
                  <label key={sub} className="block">
                    <span className="field-label">{sub}</span>
                    <input
                      type="number"
                      step="0.1"
                      min={0}
                      inputMode="decimal"
                      value={rates[sub] ?? ''}
                      onChange={(e) => handleRateChange(sub, e.target.value)}
                      className="input tabular"
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          );
        })}
        <div className="flex justify-end border-t border-gray-100 pt-5 dark:border-gray-700">
          <Button type="submit" loading={loading}>
            Sätze speichern und loslegen
          </Button>
        </div>
      </form>
    </AuthShell>
  );
};
