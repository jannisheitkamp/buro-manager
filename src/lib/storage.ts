import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';

/**
 * Akzeptiert einen Speicherpfad oder eine alte öffentliche URL und liefert den Pfad im Bucket.
 * Alte Einträge speicherten die komplette öffentliche Adresse.
 */
export const toStoragePath = (bucket: string, pathOrUrl: string) => {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const i = pathOrUrl.indexOf(marker);
  return i >= 0 ? decodeURIComponent(pathOrUrl.slice(i + marker.length).split('?')[0]) : pathOrUrl;
};

/** Erzeugt einen kurz gültigen Link (Standard 10 Minuten) – funktioniert für öffentliche und private Buckets. */
export const getSignedUrl = async (bucket: string, pathOrUrl: string, seconds = 600) => {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(toStoragePath(bucket, pathOrUrl), seconds);
  if (error || !data?.signedUrl) throw error || new Error('Kein Link erhalten');
  return data.signedUrl;
};

/** Öffnet eine Datei aus dem Speicher in einem neuen Tab. */
export const openStoredFile = async (bucket: string, pathOrUrl: string) => {
  // Fenster sofort öffnen, sonst blockt Safari das Pop-up nach dem await
  // (mit "noopener" liefert window.open kein Fenster zurück, daher opener manuell kappen)
  const win = window.open('', '_blank');
  if (win) win.opener = null;
  try {
    const url = await getSignedUrl(bucket, pathOrUrl);
    if (win) win.location.href = url;
    else window.location.href = url;
  } catch {
    win?.close();
    toast.error('Datei konnte nicht geöffnet werden.');
  }
};
