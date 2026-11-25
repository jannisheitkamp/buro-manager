// Dokumente zu Verträgen: Arten, Hochladen und Öffnen
import { supabase } from '@/lib/supabase';
import { openStoredFile } from '@/lib/storage';

export type DocKind = 'police' | 'antrag' | 'beratung' | 'sonstiges';

export const DOC_KINDS: { value: DocKind; label: string }[] = [
  { value: 'police', label: 'Police' },
  { value: 'antrag', label: 'Antrag' },
  { value: 'beratung', label: 'Beratungsprotokoll' },
  { value: 'sonstiges', label: 'Sonstiges' },
];
export const kindLabel = (k: DocKind) => DOC_KINDS.find((d) => d.value === k)?.label || k;

/** Datei in den Speicher laden und dem Vertrag zuordnen */
export async function uploadContractDocument(entryId: string, userId: string, file: File, kind: DocKind) {
  const ext = file.name.split('.').pop() || 'bin';
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage.from('production_docs').upload(path, file);
  if (upErr) throw upErr;
  const { error } = await supabase.from('contract_documents').insert({ entry_id: entryId, file_path: path, file_name: file.name, kind, uploaded_by: userId });
  if (error) {
    await supabase.storage.from('production_docs').remove([path]);
    throw error;
  }
}

export const openContractDocument = (pathOrUrl: string) => {
  if (/^https?:\/\//.test(pathOrUrl) && !pathOrUrl.includes('/storage/v1/object/')) {
    window.open(pathOrUrl, '_blank', 'noopener,noreferrer');
    return;
  }
  openStoredFile('production_docs', pathOrUrl);
};
