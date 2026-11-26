import { Fragment, useState } from 'react';
import { differenceInYears, format } from 'date-fns';
import { Briefcase, Building2, Cake, FileDown, FileText, FileX2, GitMerge, Mail, MapPin, Pencil, Phone, Plus, Users } from 'lucide-react';
import { Button } from '@/components/ui';
import { StatusPill, Tag } from '@/components/ui/hero';
import { ContractDocuments } from '@/components/ContractDocuments';
import { CustomerHistory } from './CustomerHistory';
import { CustomerUpdatePanel } from './CustomerUpdatePanel';
import { CancellationModal } from './CancellationModal';
import { exportCustomerPdf } from './customerPdf';
import { CATEGORY_COLORS } from '@/lib/chartTheme';
import { cn } from '@/utils/cn';
import { day, eur0, eur2, fullName, lifestyleText, product, type Customer, type CustomerRow, type Existing } from './shared';

/** Aufgeklappte Kundenakte: Stammdaten, Rückrufe, Verträge und Bestandsverträge */
export function CustomerDetail({
  row: r,
  household,
  canEdit,
  isAdmin,
  names,
  onReload,
  onOpen,
  onEdit,
  onExisting,
  onCallback,
  onMerge,
}: {
  row: CustomerRow;
  household: Customer[];
  canEdit: boolean;
  isAdmin: boolean;
  /** Personen-ID → Name, für Notizen und Rückrufe */
  names: Map<string, string>;
  /** Kundendaten neu laden, z. B. nach übernommenem Daten-Update */
  onReload: () => void;
  onOpen: (id: string) => void;
  onEdit: (c: Customer) => void;
  onExisting: (c: Customer, x: Existing | null) => void;
  onCallback: (c: Customer) => void;
  onMerge: (c: Customer) => void;
}) {
  const c = r.customer;
  const [openDocs, setOpenDocs] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  // Neu laden der Historie, wenn ein Daten-Update eine Notiz anlegt
  const [historyKey, setHistoryKey] = useState(0);
  const [cancelFor, setCancelFor] = useState<Existing | null>(null);
  const pdf = async () => {
    setPdfBusy(true);
    try {
      await exportCustomerPdf(r, names);
    } finally {
      setPdfBusy(false);
    }
  };
  return (
<div className="animate-fade-in space-y-4 border-t border-gray-100 bg-gray-50/60 px-4 py-4 dark:border-gray-700 dark:bg-gray-900/30 sm:px-6">
  {/* Stammdaten */}
  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
    <dl className="grid flex-1 grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      {c.customer_type === 'company' ? (
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 shrink-0 text-gray-400" />
          <dt className="sr-only">Firma</dt>
          <dd className="text-gray-700 dark:text-gray-200">
            {[c.industry, c.employees != null ? `${c.employees} Mitarbeiter` : null].filter(Boolean).join(' · ') || 'Firma'}
            {c.contact_person && <span className="text-gray-500"> · Ansprechpartner {c.contact_person}</span>}
          </dd>
        </div>
      ) : (
      <div className="flex items-center gap-2">
        <Cake className="h-4 w-4 shrink-0 text-gray-400" />
        <dt className="sr-only">Geburtstag</dt>
        <dd className="text-gray-700 dark:text-gray-200">{c.birth_date ? `${format(day(c.birth_date), 'dd.MM.yyyy')} (${differenceInYears(new Date(), day(c.birth_date))} Jahre)` : <span className="text-gray-400">kein Geburtstag</span>}</dd>
      </div>
      )}
      <div className="flex items-center gap-2">
        <Phone className="h-4 w-4 shrink-0 text-gray-400" />
        <dt className="sr-only">Telefon</dt>
        <dd>{c.phone ? <a href={`tel:${c.phone.replace(/\s/g, '')}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">{c.phone}</a> : <span className="text-gray-400">keine Nummer</span>}</dd>
      </div>
      <div className="flex items-center gap-2">
        <Mail className="h-4 w-4 shrink-0 text-gray-400" />
        <dt className="sr-only">E-Mail</dt>
        <dd className="min-w-0 truncate">{c.email ? <a href={`mailto:${c.email}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">{c.email}</a> : <span className="text-gray-400">keine E-Mail</span>}</dd>
      </div>
      <div className="flex items-center gap-2">
        <MapPin className="h-4 w-4 shrink-0 text-gray-400" />
        <dt className="sr-only">Adresse</dt>
        <dd className="text-gray-700 dark:text-gray-200">{c.address || <span className="text-gray-400">keine Adresse</span>}</dd>
      </div>
      {c.household && (
        <div className="flex items-start gap-2 sm:col-span-2">
          <Users className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
          <dt className="sr-only">Haushalt</dt>
          <dd className="text-gray-700 dark:text-gray-200">
            Haushalt {c.household}
            {household.length > 0 && (
              <span className="text-gray-500">
                {' · '}
                {household.map((h, i) => (
                  <span key={h.id}>
                    {i > 0 && ', '}
                    <button type="button" onClick={() => onOpen(h.id)} className="font-medium text-brand-700 hover:underline dark:text-brand-300">{fullName(h)}</button>
                  </span>
                ))}
              </span>
            )}
          </dd>
        </div>
      )}
      {c.customer_type !== 'company' && lifestyleText(c) && (
        <div className="flex items-start gap-2 sm:col-span-2">
          <Briefcase className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
          <dt className="sr-only">Lebenslage</dt>
          <dd className="text-gray-700 dark:text-gray-200">{lifestyleText(c)}</dd>
        </div>
      )}
      {c.notes && <p className="whitespace-pre-line text-gray-600 dark:text-gray-300 sm:col-span-2">{c.notes}</p>}
    </dl>
    <div className="flex flex-wrap gap-1.5">
      {canEdit && <Button size="sm" variant="secondary" icon={Pencil} onClick={() => onEdit(c)}>Bearbeiten</Button>}
      {canEdit && <Button size="sm" variant="secondary" icon={Plus} onClick={() => onExisting(c, null)}>Bestandsvertrag</Button>}
      <Button size="sm" variant="secondary" icon={Phone} onClick={() => onCallback(c)}>Rückruf</Button>
      <Button size="sm" variant="secondary" icon={FileDown} loading={pdfBusy} onClick={pdf}>PDF</Button>
      {isAdmin && <Button size="sm" variant="ghost" icon={GitMerge} onClick={() => onMerge(c)}>Zusammenführen</Button>}
    </div>
  </div>

  {/* Offene Rückrufe */}
  {r.callbacks.length > 0 && (
    <div className="rounded-lg border border-sky-200 bg-sky-50/60 px-3 py-2 text-sm dark:border-sky-800 dark:bg-sky-900/20">
      <p className="text-xs font-semibold text-sky-800 dark:text-sky-200">Offene Rückrufe</p>
      <ul className="mt-1 space-y-0.5">
        {r.callbacks.map((cb) => (
          <li key={cb.id} className="flex items-center gap-2 text-gray-700 dark:text-gray-200">
            {cb.priority === 'high' && <StatusPill tone="red">dringend</StatusPill>}
            {cb.topic || 'Rückruf'}
            <span className="text-xs text-gray-500">seit {format(new Date(cb.created_at), 'dd.MM.')}</span>
          </li>
        ))}
      </ul>
    </div>
  )}

  <CustomerUpdatePanel customer={c} canEdit={canEdit} onApplied={() => { setHistoryKey((k) => k + 1); onReload(); }} />

  <CustomerHistory key={historyKey} customerId={c.id} names={names} isAdmin={isAdmin} />

  {/* Verträge */}
  {r.entries.length > 0 && (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-500 [&>th]:pb-2 [&>th]:font-medium">
            <th>Vertrag</th>
            <th>Schein-Nr.</th>
            <th>Beginn</th>
            <th>Status</th>
            <th className="text-right">Provision</th>
            <th className="w-10"><span className="sr-only">Dokumente</span></th>
          </tr>
        </thead>
        <tbody>
          {r.entries.map((e) => (
            <Fragment key={e.id}>
              <tr className={cn('[&>td]:py-1.5', e.status === 'cancelled' && 'opacity-60')}>
                <td><Tag color={CATEGORY_COLORS[e.category] || '#9AA39C'}>{product(e)}</Tag></td>
                <td className="font-mono text-xs text-gray-600 dark:text-gray-300">{e.policy_number || '–'}</td>
                <td className="text-gray-600 dark:text-gray-300">{e.start_date ? format(day(e.start_date), 'dd.MM.yy') : '–'}</td>
                <td>
                  <StatusPill tone={e.status === 'policed' ? 'emerald' : e.status === 'cancelled' ? 'red' : 'sky'}>
                    {e.status === 'policed' ? 'Policiert' : e.status === 'cancelled' ? `Storniert${e.cancelled_at ? ` ${format(day(e.cancelled_at), 'dd.MM.yy')}` : ''}` : 'Eingereicht'}
                  </StatusPill>
                </td>
                <td className="tabular text-right font-medium text-gray-900 dark:text-white">{eur0.format(Number(e.commission_amount || 0))}</td>
                <td className="text-right">
                  <button
                    type="button"
                    onClick={() => setOpenDocs(openDocs === e.id ? null : e.id)}
                    aria-expanded={openDocs === e.id}
                    className={cn('btn-icon p-1.5', openDocs === e.id && 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300')}
                    title="Dokumente"
                    aria-label="Dokumente"
                  >
                    <FileText className="h-4 w-4" />
                  </button>
                </td>
              </tr>
              {openDocs === e.id && (
                <tr>
                  <td colSpan={6} className="pb-3 pt-1">
                    <ContractDocuments entryId={e.id} />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )}

  {/* Bestandsverträge */}
  {r.existing.length > 0 && (
    <div className="overflow-x-auto">
      <p className="mb-1.5 text-xs font-semibold text-gray-500">Bestandsverträge <span className="font-normal">(zählen nicht zur Produktion)</span></p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-500 [&>th]:pb-2 [&>th]:font-medium">
            <th>Vertrag</th>
            <th>Gesellschaft</th>
            <th>Schein-Nr.</th>
            <th>Beginn</th>
            <th>Ablauf</th>
            <th>Fällig</th>
            <th className="text-right">Beitrag</th>
            <th className="w-20"><span className="sr-only">Kündigen und bearbeiten</span></th>
          </tr>
        </thead>
        <tbody>
          {r.existing.map((x) => (
            <tr key={x.id} className="[&>td]:py-1.5">
              <td><Tag color={CATEGORY_COLORS[x.category] || '#9AA39C'}>{x.sub_category}</Tag></td>
              <td className="text-gray-700 dark:text-gray-200">{x.insurer || '–'}</td>
              <td className="font-mono text-xs text-gray-600 dark:text-gray-300">{x.policy_number || '–'}</td>
              <td className="text-gray-600 dark:text-gray-300">{x.start_date ? format(day(x.start_date), 'dd.MM.yy') : '–'}</td>
              <td className="text-gray-600 dark:text-gray-300">{x.end_date ? format(day(x.end_date), 'dd.MM.yy') : '–'}</td>
              <td className="text-gray-600 dark:text-gray-300">{x.main_due ? format(day(x.main_due), 'dd.MM.') : '–'}</td>
              <td className="tabular text-right text-gray-700 dark:text-gray-200">{x.premium != null ? eur2.format(Number(x.premium)) : '–'}</td>
              <td className="text-right">
                {canEdit && (
                  <span className="inline-flex">
                    <button type="button" onClick={() => setCancelFor(x)} className="btn-icon p-1.5" title="Kündigung erstellen" aria-label={`${x.sub_category} kündigen`}>
                      <FileX2 className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => onExisting(c, x)} className="btn-icon p-1.5" title="Bestandsvertrag bearbeiten" aria-label={`${x.sub_category} bearbeiten`}>
                      <Pencil className="h-4 w-4" />
                    </button>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )}
  <CancellationModal target={cancelFor ? { customer: c, contract: cancelFor } : null} onClose={() => setCancelFor(null)} onDone={() => setHistoryKey((k) => k + 1)} />
</div>
  );
}
