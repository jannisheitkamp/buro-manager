import { Briefcase, Home, Coffee, Users, Palmtree, ThermometerSun, LogOut, GraduationCap, type LucideIcon } from 'lucide-react';
import type { UserStatus } from '@/types';

export type StatusType = UserStatus['status'];

export interface StatusConfig {
  value: StatusType;
  label: string;
  icon: LucideIcon;
  /** Farbe des Punkts neben dem Avatar */
  dot: string;
  /** Farbe für Auswahl-Chips */
  tone: string;
  /** Zählt als erreichbar */
  available: boolean;
}

export const STATUS_CONFIG: StatusConfig[] = [
  { value: 'office', label: 'Im Büro', icon: Briefcase, dot: 'bg-emerald-500', tone: 'bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200 dark:ring-emerald-800', available: true },
  { value: 'remote', label: 'Home Office', icon: Home, dot: 'bg-sky-500', tone: 'bg-sky-50 text-sky-800 ring-sky-200 dark:bg-sky-900/40 dark:text-sky-200 dark:ring-sky-800', available: true },
  { value: 'meeting', label: 'Im Termin', icon: Users, dot: 'bg-violet-500', tone: 'bg-brand-50 text-brand-800 ring-brand-200 dark:bg-brand-900/50 dark:text-brand-200 dark:ring-brand-800', available: true },
  { value: 'break', label: 'Pause', icon: Coffee, dot: 'bg-amber-400', tone: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:ring-amber-800', available: false },
  { value: 'seminar', label: 'Seminar', icon: GraduationCap, dot: 'bg-indigo-400', tone: 'bg-brand-50 text-brand-800 ring-brand-200 dark:bg-brand-900/50 dark:text-brand-200 dark:ring-brand-800', available: false },
  { value: 'vacation', label: 'Urlaub', icon: Palmtree, dot: 'bg-gray-400', tone: 'bg-gray-100 text-gray-700 ring-gray-200 dark:bg-gray-700/60 dark:text-gray-200 dark:ring-gray-600', available: false },
  { value: 'sick', label: 'Krank', icon: ThermometerSun, dot: 'bg-red-500', tone: 'bg-red-50 text-red-800 ring-red-200 dark:bg-red-900/40 dark:text-red-200 dark:ring-red-800', available: false },
  { value: 'off', label: 'Feierabend', icon: LogOut, dot: 'bg-gray-300 dark:bg-gray-600', tone: 'bg-gray-100 text-gray-700 ring-gray-200 dark:bg-gray-700/60 dark:text-gray-200 dark:ring-gray-600', available: false },
];

export const getStatusConfig = (status?: string | null) => STATUS_CONFIG.find((s) => s.value === status);

/** Ein Status von gestern oder älter gilt nicht mehr als aktuell */
export const isStatusFresh = (updatedAt?: string | null) => {
  if (!updatedAt) return false;
  const d = new Date(updatedAt);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
};
