import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShieldAlert, Info } from 'lucide-react';
import { format, addMonths } from 'date-fns';
import { de } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';

interface LiabilityTrackerModalProps {
    isOpen: boolean;
    onClose: () => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    entries: any[];
}

export const LiabilityTrackerModal: React.FC<LiabilityTrackerModalProps> = ({ isOpen, onClose, entries }) => {
    
    const { chartData, totalLiability, next12MonthsRelease } = useMemo(() => {
        const dataMap: Record<string, number> = {};
        let total = 0;
        let next12 = 0;
        
        const now = new Date();
        const twelveMonthsLater = addMonths(now, 12);

        entries.forEach(entry => {
            const liabilityRate = entry.liability_rate || 0;
            const comm = entry.commission_amount || 0;
            if (liabilityRate <= 0 || comm <= 0) return;

            const startDateStr = entry.policing_date || entry.start_date || entry.submission_date;
            if (!startDateStr) return;
            
            const startDate = new Date(startDateStr);
            const totalLiabilityAmount = comm * (liabilityRate / 100);
            const monthlyRelease = totalLiabilityAmount / 60; // 5 years = 60 months

            // Distribute liability over 60 months starting from startDate
            for (let i = 0; i < 60; i++) {
                const releaseDate = addMonths(startDate, i);
                
                // Only track future liability
                if (releaseDate >= now) {
                    const monthKey = format(releaseDate, 'yyyy-MM');
                    dataMap[monthKey] = (dataMap[monthKey] || 0) + monthlyRelease;
                    total += monthlyRelease;
                    
                    if (releaseDate < twelveMonthsLater) {
                        next12 += monthlyRelease;
                    }
                }
            }
        });

        // Convert map to array and sort
        const sortedKeys = Object.keys(dataMap).sort();
        const data = sortedKeys.slice(0, 36).map(key => ({ // Show max next 3 years in chart to avoid overcrowding
            name: format(new Date(key + '-01'), 'MMM yy', { locale: de }),
            value: dataMap[key]
        }));

        return { chartData: data, totalLiability: total, next12MonthsRelease: next12 };
    }, [entries]);

    if (!isOpen) return null;

    const formatCurrency = (val: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(val);

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" 
                />
                
                <motion.div 
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="relative w-full max-w-4xl bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-700 overflow-hidden flex flex-col max-h-[90vh]"
                >
                    <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-700">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-xl">
                                <ShieldAlert className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Storno-Haftungs-Tracker</h2>
                                <p className="text-sm text-gray-500">Auslaufende Haftungsreserve (5-Jahres-Frist)</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
                            <X className="w-6 h-6 text-gray-500" />
                        </button>
                    </div>

                    <div className="p-6 overflow-y-auto space-y-8">
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-orange-50 dark:bg-orange-900/10 p-5 rounded-2xl border border-orange-100 dark:border-orange-900/30">
                                <p className="text-xs font-bold text-orange-600/70 uppercase tracking-wider mb-1">Offene Haftung (Gesamt)</p>
                                <p className="text-3xl font-black text-orange-600 dark:text-orange-500">{formatCurrency(totalLiability)}</p>
                            </div>
                            <div className="bg-emerald-50 dark:bg-emerald-900/10 p-5 rounded-2xl border border-emerald-100 dark:border-emerald-900/30">
                                <p className="text-xs font-bold text-emerald-600/70 uppercase tracking-wider mb-1">Wird in 12 Monaten frei</p>
                                <p className="text-3xl font-black text-emerald-600 dark:text-emerald-500">{formatCurrency(next12MonthsRelease)}</p>
                            </div>
                        </div>

                        <div className="bg-gray-50/50 dark:bg-gray-900/20 p-6 rounded-2xl border border-gray-100 dark:border-gray-700/50">
                            <div className="flex items-center gap-2 mb-6">
                                <Info className="w-4 h-4 text-gray-400" />
                                <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300">Freiwerdende Haftungsreserve pro Monat (Nächste 3 Jahre)</h3>
                            </div>
                            
                            <div className="h-[300px] w-full">
                                {chartData.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                                            <XAxis 
                                                dataKey="name" 
                                                axisLine={false} 
                                                tickLine={false} 
                                                tick={{ fill: '#9CA3AF', fontSize: 10 }} 
                                                dy={10}
                                                angle={-45}
                                                textAnchor="end"
                                            />
                                            <YAxis 
                                                axisLine={false} 
                                                tickLine={false} 
                                                tick={{ fill: '#9CA3AF', fontSize: 10 }}
                                                tickFormatter={(val) => `€${val}`}
                                            />
                                            <Tooltip 
                                                cursor={{ fill: '#FFF7ED', opacity: 0.5 }}
                                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
                                                formatter={(value: number) => [formatCurrency(value), 'Wird frei']}
                                            />
                                            <Bar 
                                                dataKey="value" 
                                                fill="#F97316" 
                                                radius={[4, 4, 0, 0]} 
                                            >
                                                {chartData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill="#F97316" fillOpacity={0.8} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                                        Keine offenen Haftungsreserven gefunden.
                                    </div>
                                )}
                            </div>
                        </div>

                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};