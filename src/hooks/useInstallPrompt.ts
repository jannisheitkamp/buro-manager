import { useEffect, useState } from 'react';

// Chrome/Edge/Android melden „App installierbar“ einmal kurz nach dem Laden.
// Darum hören wir schon beim Import mit, nicht erst, wenn die Profilseite offen ist.
type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

let deferred: PromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as PromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

export type InstallState = 'installed' | 'available' | 'ios' | 'manual';

const detect = (): InstallState => {
  if (typeof window === 'undefined') return 'manual';
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return 'installed';
  if (deferred) return 'available';
  // iPhone/iPad: nur über „Teilen → Zum Home-Bildschirm“ in Safari
  if (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  return 'manual';
};

/** Büro Manager als App installieren (kostenlos, ohne App Store) */
export function useInstallPrompt() {
  const [state, setState] = useState<InstallState>(detect);
  useEffect(() => {
    const update = () => setState(detect());
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, []);

  const install = async () => {
    if (!deferred) return false;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    notify();
    return outcome === 'accepted';
  };

  return { state, install };
}
