import { ChevronRight } from 'lucide-react';

const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const num = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });

type Props = {
  totalCommission: number;
  totalLifeValues: number;
  /** Hinweis, wenn die Summe per Monatsliste korrigiert wurde */
  lifeValuesNote?: string;
  totalLiability: number;
  contractCount: number;
  cancelledCount: number;
  onOpenLiabilityModal: () => void;
};

export const ProductionStats = ({ totalCommission, totalLifeValues, lifeValuesNote, totalLiability, contractCount, cancelledCount, onOpenLiabilityModal }: Props) => (
  <div className="card grid grid-cols-2 divide-gray-100 dark:divide-gray-700 lg:grid-cols-4 lg:divide-x [&>*]:p-5 [&>*]:sm:px-6">
    <div className="border-b border-r border-gray-100 dark:border-gray-700 lg:border-0">
      <p className="text-xs text-gray-500">Provision</p>
      <p className="tabular mt-1 font-display text-2xl font-semibold text-gray-900 dark:text-white sm:text-[1.75rem]">{eur.format(totalCommission)}</p>
    </div>
    <div className="border-b border-gray-100 dark:border-gray-700 lg:border-0">
      <p className="text-xs text-gray-500">Lebenswerte</p>
      <p className="tabular mt-1 font-display text-2xl font-semibold text-brand-700 dark:text-brand-300 sm:text-[1.75rem]">{num.format(totalLifeValues)}</p>
      {lifeValuesNote && <p className="mt-0.5 text-xs text-gray-500">{lifeValuesNote}</p>}
    </div>
    <div className="border-r border-gray-100 dark:border-gray-700 lg:border-0">
      <p className="text-xs text-gray-500">Verträge</p>
      <p className="tabular mt-1 font-display text-2xl font-semibold text-gray-900 dark:text-white sm:text-[1.75rem]">
        {contractCount}
        {cancelledCount > 0 && <span className="ml-2 align-middle font-sans text-xs font-normal text-gray-500">+ {cancelledCount} storniert</span>}
      </p>
    </div>
    <button type="button" onClick={onOpenLiabilityModal} className="group text-left transition-colors hover:bg-amber-50/60 dark:hover:bg-amber-900/10">
      <p className="flex items-center justify-between text-xs text-gray-500">
        Stornohaftung
        <span className="flex items-center gap-0.5 text-amber-700 dark:text-amber-300">
          Verlauf <ChevronRight className="h-3 w-3" />
        </span>
      </p>
      <p className="tabular mt-1 font-display text-2xl font-semibold text-amber-700 dark:text-amber-300 sm:text-[1.75rem]">{eur.format(totalLiability)}</p>
    </button>
  </div>
);
