import { motion } from 'framer-motion';
import { BarChartIcon, PieChart as PieChartIcon } from 'lucide-react';
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
    Legend,
    AreaChart,
    Area
} from 'recharts';
import { cn } from '@/utils/cn';

const formatCurrency = (amount: number | null | undefined) => {
    if (amount === null || amount === undefined || isNaN(amount)) return '0,00 €';
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
};

type Props = {
    chartMode: 'revenue' | 'life_values';
    setChartMode: (mode: 'revenue' | 'life_values') => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    monthlyData: any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    categoryData: any[];
    totalCommission: number;
};

const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#6366f1'];

export const ProductionCharts = ({ chartMode, setChartMode, monthlyData, categoryData, totalCommission }: Props) => {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Bar Chart / Area Chart */}
            <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.45 }}
                className="lg:col-span-2 bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl p-6 border border-white/20 shadow-xl"
            >
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className={cn("p-2 rounded-lg", chartMode === 'revenue' ? "bg-indigo-100 dark:bg-indigo-900/30" : "bg-emerald-100 dark:bg-emerald-900/30")}>
                            <BarChartIcon className={cn("w-5 h-5", chartMode === 'revenue' ? "text-indigo-600 dark:text-indigo-400" : "text-emerald-600 dark:text-emerald-400")} />
                        </div>
                        <h3 className="font-bold text-gray-900 dark:text-white">
                            {chartMode === 'revenue' ? 'Umsatzentwicklung (6 Monate)' : 'Lebenswerte Entwicklung'}
                        </h3>
                    </div>
                    <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                        <button
                            onClick={() => setChartMode('revenue')}
                            className={cn(
                                "px-3 py-1 rounded-md text-xs font-medium transition-all",
                                chartMode === 'revenue' ? "bg-white dark:bg-gray-600 text-indigo-600 shadow-sm" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                            )}
                        >
                            Umsatz
                        </button>
                        <button
                            onClick={() => setChartMode('life_values')}
                            className={cn(
                                "px-3 py-1 rounded-md text-xs font-medium transition-all",
                                chartMode === 'life_values' ? "bg-white dark:bg-gray-600 text-emerald-600 shadow-sm" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                            )}
                        >
                            Lebenswerte
                        </button>
                    </div>
                </div>
                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        {chartMode === 'revenue' ? (
                            <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                                <XAxis 
                                    dataKey="name" 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fill: '#9ca3af', fontSize: 12 }}
                                    dy={10}
                                />
                                <YAxis 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fill: '#9ca3af', fontSize: 12 }}
                                    tickFormatter={(val) => `${val / 1000}k`}
                                />
                                <Tooltip 
                                    cursor={{ fill: 'rgba(79, 70, 229, 0.05)' }}
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
                                    formatter={(value: number) => [formatCurrency(value), 'Umsatz']}
                                />
                                <Bar 
                                    dataKey="value" 
                                    fill="url(#colorRevenue)" 
                                    radius={[6, 6, 6, 6]}
                                    barSize={32}
                                />
                                <defs>
                                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#4f46e5" stopOpacity={1} />
                                        <stop offset="100%" stopColor="#818cf8" stopOpacity={0.8} />
                                    </linearGradient>
                                </defs>
                            </BarChart>
                        ) : (
                            <AreaChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorLifeValues" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                                <XAxis 
                                    dataKey="name" 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fill: '#9ca3af', fontSize: 12 }}
                                    dy={10}
                                />
                                <YAxis 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{ fill: '#9ca3af', fontSize: 12 }}
                                    tickFormatter={(val) => `${val / 1000}k`}
                                />
                                <Tooltip 
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
                                    formatter={(value: number) => [new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(value), 'Lebenswerte']}
                                />
                                <Area 
                                    type="monotone" 
                                    dataKey="lifeValues" 
                                    stroke="#10b981" 
                                    strokeWidth={3}
                                    fillOpacity={1} 
                                    fill="url(#colorLifeValues)" 
                                />
                            </AreaChart>
                        )}
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
                        <PieChartIcon className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
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
    );
};