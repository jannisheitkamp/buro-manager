import { motion } from 'framer-motion';
import { Euro, TrendingUp } from 'lucide-react';

const formatCurrency = (amount: number | null | undefined) => {
  if (amount === null || amount === undefined || isNaN(amount)) return '0,00 €';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
};

type Props = {
    totalCommission: number;
    totalLifeValues: number;
    totalLiability: number;
    onOpenLiabilityModal: () => void;
};

export const ProductionStats = ({ totalCommission, totalLifeValues, totalLiability, onOpenLiabilityModal }: Props) => {
    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
                <p className="text-3xl font-black text-indigo-600 dark:text-indigo-400 mt-2">{formatCurrency(totalCommission)}</p>
            </motion.div>

            <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl p-6 border border-white/20 shadow-xl relative overflow-hidden group"
            >
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <TrendingUp className="w-24 h-24 text-emerald-500" />
                </div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Lebenswerte (Gesamt)</p>
                <p className="text-3xl font-black text-emerald-500 dark:text-emerald-400 mt-2">
                    {new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(totalLifeValues)}
                </p>
            </motion.div>

            <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl p-6 border border-white/20 shadow-xl relative overflow-hidden group cursor-pointer hover:bg-orange-50 dark:hover:bg-orange-900/10"
            onClick={onOpenLiabilityModal}
            >
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <TrendingUp className="w-24 h-24 text-orange-500" />
                </div>
                <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Haftungsreserve (Total)</p>
                    <span className="text-xs bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 px-2 py-1 rounded-lg font-semibold group-hover:scale-105 transition-transform">
                        Details ansehen
                    </span>
                </div>
                <p className="text-3xl font-black text-orange-500 dark:text-orange-400 mt-2">{formatCurrency(totalLiability)}</p>
            </motion.div>
        </div>
    );
};
