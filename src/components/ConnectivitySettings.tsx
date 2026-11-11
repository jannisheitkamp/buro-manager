import { useEffect, useState } from 'react';
import { BellRing, CalendarPlus, Copy, RefreshCw, Smartphone } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { disablePush, enablePush, getPushState, type PushState } from '@/lib/push';
import { Badge, Button, Card, CardHeader } from '@/components/ui';

const FEED_BASE = 'https://snvdxjpoqfniyhtfqkza.supabase.co/functions/v1/calendar-feed';

/** Profil: Push aufs Handy und persönliches Kalender-Abo */
export const ConnectivitySettings = () => {
  const userId = useStore((s) => s.user?.id);
  const [push, setPush] = useState<PushState>('unsupported');
  const [pushBusy, setPushBusy] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [calendarAvailable, setCalendarAvailable] = useState(true);
  const [calBusy, setCalBusy] = useState(false);

  useEffect(() => {
    getPushState().then(setPush).catch(() => setPush('unsupported'));
  }, []);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from('calendar_tokens')
      .select('token')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) setCalendarAvailable(false);
        else setToken(data?.token || null);
      });
  }, [userId]);

  const feedUrl = token ? `${FEED_BASE}?token=${token}` : null;
  const webcalUrl = feedUrl?.replace(/^https:/, 'webcal:');

  const createToken = async (renew = false) => {
    if (!userId) return;
    setCalBusy(true);
    if (renew) await supabase.from('calendar_tokens').delete().eq('user_id', userId);
    const { data, error } = await supabase.from('calendar_tokens').insert({ user_id: userId }).select('token').single();
    setCalBusy(false);
    if (error) toast.error('Link konnte nicht erstellt werden.');
    else {
      setToken(data.token);
      toast.success(renew ? 'Neuer Link erstellt. Der alte funktioniert nicht mehr.' : 'Persönlicher Kalender-Link erstellt');
    }
  };

  const togglePush = async () => {
    if (!userId) return;
    setPushBusy(true);
    try {
      const next = push === 'on' ? await disablePush() : await enablePush(userId);
      setPush(next);
      if (next === 'on') toast.success('Push ist auf diesem Gerät aktiv');
    } catch {
      toast.error('Push konnte nicht eingeschaltet werden.');
    } finally {
      setPushBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:col-span-3 lg:grid-cols-2">
      <Card>
        <CardHeader title="Push aufs Handy" icon={BellRing} description="Rückrufe, Pakete, Tauschanfragen und Urlaubsentscheidungen auch bei geschlossener App." />
        {push === 'unsupported' && <p className="text-sm text-gray-500">Dieser Browser unterstützt keine Push-Nachrichten.</p>}
        {push === 'ios-needs-install' && (
          <p className="flex gap-2 text-sm text-gray-600 dark:text-gray-300">
            <Smartphone className="mt-0.5 h-4 w-4 shrink-0" />
            Auf dem iPhone geht Push nur aus der installierten App: In Safari auf „Teilen“, dann „Zum Home-Bildschirm“. Die App von dort öffnen und hier einschalten.
          </p>
        )}
        {push === 'denied' && <p className="text-sm text-gray-600 dark:text-gray-300">Benachrichtigungen sind blockiert. Erlaube sie in den Einstellungen des Browsers bzw. des iPhones für den Büro Manager.</p>}
        {(push === 'on' || push === 'off') && (
          <div className="flex items-center justify-between gap-3">
            <Badge tone={push === 'on' ? 'success' : 'neutral'}>{push === 'on' ? 'Auf diesem Gerät aktiv' : 'Aus'}</Badge>
            <Button variant={push === 'on' ? 'secondary' : 'primary'} size="sm" loading={pushBusy} onClick={togglePush}>
              {push === 'on' ? 'Ausschalten' : 'Einschalten'}
            </Button>
          </div>
        )}
        <p className="mt-3 text-xs text-gray-500">Gilt pro Gerät. Schalte es auf Handy und Rechner jeweils einmal ein.</p>
      </Card>

      <Card>
        <CardHeader title="Kalender abonnieren" icon={CalendarPlus} description="Team-Termine und Abwesenheiten automatisch im Kalender von iPhone, Outlook oder Google." />
        {!calendarAvailable ? (
          <p className="text-sm text-gray-500">Verfügbar, sobald das Datenbank-Update für Version 2.1 eingespielt ist.</p>
        ) : !feedUrl ? (
          <Button size="sm" icon={CalendarPlus} loading={calBusy} onClick={() => createToken()}>
            Persönlichen Link erstellen
          </Button>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <a href={webcalUrl} className="btn-primary btn-sm">
                <CalendarPlus className="h-3.5 w-3.5" /> Im Kalender öffnen
              </a>
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => {
                  navigator.clipboard.writeText(feedUrl);
                  toast.success('Link kopiert');
                }}
              >
                <Copy className="h-3.5 w-3.5" /> Link kopieren
              </button>
              <button type="button" className="btn-ghost btn-sm" disabled={calBusy} onClick={() => createToken(true)} title="Alten Link ungültig machen">
                <RefreshCw className="h-3.5 w-3.5" /> Neuer Link
              </button>
            </div>
            <p className="text-xs text-gray-500">
              Der Link ist persönlich und geheim. Wer ihn hat, sieht die Team-Termine. Krankmeldungen anderer erscheinen nicht. Outlook: „Kalender hinzufügen“ → „Aus dem Internet“, Link einfügen.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
};
