import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { formatDistanceToNow, format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Package, Plus, Check, Truck, Trash2, ExternalLink, MapPin } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { Modal } from '@/components/Modal';
import { ConfirmModal } from '@/components/ConfirmModal';
import { Avatar, Badge, Button, EmptyState, Field, PageHeader, Segmented } from '@/components/ui';
import { cn } from '@/utils/cn';

type ParcelRow = {
  id: string;
  created_at: string;
  recipient_id: string;
  created_by: string;
  carrier: string | null;
  location: string;
  status: 'pending' | 'collected' | 'expected';
  collected_at: string | null;
  tracking_number: string | null;
  recipient?: { id: string; full_name: string | null; avatar_url: string | null } | null;
};

type Person = { id: string; full_name: string | null };

const CARRIERS = ['DHL', 'DPD', 'Hermes', 'UPS', 'GLS', 'Amazon', 'Post'];
const LOCATIONS = ['Empfang', 'Büro', 'Lager', 'Küche'];

const trackingLink = (carrier: string | null, number: string | null) => {
  if (!number) return null;
  const n = encodeURIComponent(number);
  const c = (carrier || '').toLowerCase();
  if (c.includes('dhl')) return `https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode=${n}`;
  if (c.includes('ups')) return `https://www.ups.com/track?tracknum=${n}`;
  if (c.includes('dpd')) return `https://tracking.dpd.de/status/de_DE/parcel/${n}`;
  if (c.includes('gls')) return `https://gls-group.eu/DE/de/paketverfolgung?match=${n}`;
  if (c.includes('hermes')) return `https://www.myhermes.de/empfangen/sendungsverfolgung/sendungsinformation#${n}`;
  return `https://t.17track.net/de#nums=${n}`;
};

const COLLECTED_DAYS = 14;

export const Parcels = () => {
  const user = useStore((s) => s.user);
  const isAdmin = useStore((s) => !!s.profile?.roles?.includes('admin'));
  const [searchParams, setSearchParams] = useSearchParams();
  const [parcels, setParcels] = useState<ParcelRow[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'mine'>('all');
  const timer = useRef<ReturnType<typeof setTimeout>>();

  // Formular
  const [recipientId, setRecipientId] = useState('');
  const [carrier, setCarrier] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [location, setLocation] = useState('Empfang');
  const [status, setStatus] = useState<'pending' | 'expected'>('pending');

  const fetchParcels = useCallback(async () => {
    const since = new Date(Date.now() - COLLECTED_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('parcels')
      .select('*, recipient:recipient_id(id, full_name, avatar_url)')
      .or(`status.neq.collected,collected_at.gte.${since}`)
      .order('created_at', { ascending: false });
    if (error) toast.error('Pakete konnten nicht geladen werden.');
    else setParcels((data as unknown as ParcelRow[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchParcels();
    supabase
      .from('profiles')
      .select('id, full_name, is_approved')
      .order('full_name')
      .then(({ data }) => setPeople((data || []).filter((p) => p.is_approved !== false)));

    const channel = supabase
      .channel('parcels-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parcels' }, () => {
        clearTimeout(timer.current);
        timer.current = setTimeout(fetchParcels, 400);
      })
      .subscribe();
    return () => {
      clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [fetchParcels]);

  // "?new=1" aus der Übersicht öffnet direkt das Formular
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setIsModalOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const resetForm = () => {
    setRecipientId('');
    setCarrier('');
    setTrackingNumber('');
    setLocation('Empfang');
    setStatus('pending');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    const { error } = await supabase.from('parcels').insert({
      recipient_id: recipientId,
      created_by: user.id,
      carrier: carrier.trim() || null,
      tracking_number: trackingNumber.trim() || null,
      location: status === 'expected' ? 'Unterwegs' : location,
      status,
    });
    setSubmitting(false);
    if (error) {
      toast.error('Paket konnte nicht gespeichert werden.');
      return;
    }
    toast.success(status === 'expected' ? 'Paket angekündigt' : 'Paket erfasst');
    setIsModalOpen(false);
    resetForm();
    fetchParcels();
  };

  const update = async (id: string, values: Partial<ParcelRow>, message: string) => {
    const { error } = await supabase.from('parcels').update(values).eq('id', id);
    if (error) toast.error('Änderung konnte nicht gespeichert werden.');
    else {
      toast.success(message);
      fetchParcels();
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from('parcels').delete().eq('id', deleteId);
    if (error) toast.error('Eintrag konnte nicht gelöscht werden.');
    else {
      toast.success('Eintrag gelöscht');
      fetchParcels();
    }
    setDeleteId(null);
  };

  const visible = parcels.filter((p) => filter === 'all' || p.recipient_id === user?.id);
  const ready = visible.filter((p) => p.status === 'pending');
  const expected = visible.filter((p) => p.status === 'expected');
  const collected = visible.filter((p) => p.status === 'collected');
  const mineCount = parcels.filter((p) => p.recipient_id === user?.id && p.status === 'pending').length;

  const Row = ({ p }: { p: ParcelRow }) => {
    const mine = p.recipient_id === user?.id;
    const link = trackingLink(p.carrier, p.tracking_number);
    const canDelete = isAdmin || p.created_by === user?.id;
    return (
      <li className="group flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar name={p.recipient?.full_name} src={p.recipient?.avatar_url} size="sm" />
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium text-gray-900 dark:text-white">{p.recipient?.full_name || 'Unbekannt'}</span>
              {mine && p.status !== 'collected' && <Badge tone="warning">Für dich</Badge>}
            </p>
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-gray-500">
              <span>{p.carrier || 'Ohne Zusteller'}</span>
              {p.status === 'pending' && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {p.location}
                </span>
              )}
              <span>
                {p.status === 'collected' && p.collected_at
                  ? `abgeholt ${format(new Date(p.collected_at), 'dd.MM. HH:mm')}`
                  : formatDistanceToNow(new Date(p.created_at), { locale: de, addSuffix: true })}
              </span>
              {link && (
                <a href={link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 font-medium text-brand-700 hover:underline dark:text-brand-300">
                  Sendung verfolgen <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 self-end sm:self-auto">
          {p.status === 'expected' && (
            <button type="button" onClick={() => update(p.id, { status: 'pending', location: 'Empfang', created_at: new Date().toISOString() }, 'Paket ist angekommen')} className="btn-secondary btn-sm">
              <Package className="h-3.5 w-3.5" /> Ist angekommen
            </button>
          )}
          {p.status === 'pending' && (
            <button type="button" onClick={() => update(p.id, { status: 'collected', collected_at: new Date().toISOString() }, 'Als abgeholt markiert')} className={mine ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}>
              <Check className="h-3.5 w-3.5" /> Abgeholt
            </button>
          )}
          {canDelete && (
            <button type="button" onClick={() => setDeleteId(p.id)} className="btn-icon p-1.5 opacity-60 hover:!text-red-600 group-hover:opacity-100" aria-label="Eintrag löschen" title="Löschen">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </li>
    );
  };

  const Section = ({ title, items, empty, muted }: { title: string; items: ParcelRow[]; empty?: string; muted?: boolean }) =>
    items.length === 0 && !empty ? null : (
      <section className={cn('card overflow-hidden', muted && 'opacity-80')}>
        <h2 className="flex items-center justify-between border-b border-gray-100 px-5 py-3 text-sm font-semibold text-gray-900 dark:border-gray-700 dark:text-white sm:px-6">
          {title}
          <span className="tabular text-xs font-normal text-gray-500">{items.length}</span>
        </h2>
        {items.length === 0 ? (
          <p className="px-6 py-6 text-sm text-gray-500">{empty}</p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700/70">
            {items.map((p) => (
              <Row key={p.id} p={p} />
            ))}
          </ul>
        )}
      </section>
    );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pakete"
        description="Was im Büro angekommen ist, was noch unterwegs ist und wer es abholen muss."
        actions={
          <Button icon={Plus} onClick={() => setIsModalOpen(true)}>
            Paket erfassen
          </Button>
        }
      >
        <Segmented
          value={filter}
          onChange={(v) => setFilter(v as 'all' | 'mine')}
          options={[
            { value: 'all', label: 'Alle' },
            { value: 'mine', label: 'Für mich', count: mineCount },
          ]}
        />
      </PageHeader>

      {loading ? (
        <p className="py-16 text-center text-sm text-gray-500">Pakete werden geladen</p>
      ) : ready.length + expected.length + collected.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Package}
            title={filter === 'mine' ? 'Keine Pakete für dich' : 'Keine Pakete im Büro'}
            description="Kommt eine Lieferung an, erfasse sie hier. Die Empfängerin oder der Empfänger wird benachrichtigt."
            action={<Button icon={Plus} onClick={() => setIsModalOpen(true)}>Paket erfassen</Button>}
          />
        </div>
      ) : (
        <div className="space-y-6">
          <Section title="Liegt zur Abholung bereit" items={ready} empty="Gerade liegt nichts zur Abholung bereit." />
          <Section title="Angekündigt" items={expected} />
          <Section title={`Abgeholt (letzte ${COLLECTED_DAYS} Tage)`} items={collected} muted />
        </div>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Paket erfassen"
        footer={
          <>
            <button type="button" onClick={() => setIsModalOpen(false)} className="btn-secondary">
              Abbrechen
            </button>
            <Button type="submit" form="parcel-form" loading={submitting}>
              {status === 'expected' ? 'Paket ankündigen' : 'Paket erfassen'}
            </Button>
          </>
        }
      >
        <form id="parcel-form" onSubmit={handleCreate} className="space-y-4">
          <Segmented
            value={status}
            onChange={(v) => setStatus(v as 'pending' | 'expected')}
            options={[
              { value: 'pending', label: 'Ist angekommen', icon: Package },
              { value: 'expected', label: 'Wird erwartet', icon: Truck },
            ]}
          />
          <Field label="Für wen?" htmlFor="parcel-recipient">
            <select id="parcel-recipient" required value={recipientId} onChange={(e) => setRecipientId(e.target.value)} className="input">
              <option value="" disabled>
                Person auswählen
              </option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                  {p.id === user?.id ? ' (ich)' : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Zusteller" htmlFor="parcel-carrier">
            <input id="parcel-carrier" list="carriers" value={carrier} onChange={(e) => setCarrier(e.target.value)} className="input" placeholder="z. B. DHL" />
            <datalist id="carriers">
              {CARRIERS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Sendungsnummer" htmlFor="parcel-tracking" hint="Optional. Damit lässt sich die Sendung direkt verfolgen.">
            <input id="parcel-tracking" value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} className="input font-mono" />
          </Field>
          {status === 'pending' && (
            <Field label="Wo liegt es?" htmlFor="parcel-location">
              <input id="parcel-location" list="locations" value={location} onChange={(e) => setLocation(e.target.value)} className="input" />
              <datalist id="locations">
                {LOCATIONS.map((l) => (
                  <option key={l} value={l} />
                ))}
              </datalist>
            </Field>
          )}
        </form>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Eintrag löschen?"
        message="Der Paketeintrag wird entfernt."
        confirmText="Löschen"
        isDestructive
      />
    </div>
  );
};
