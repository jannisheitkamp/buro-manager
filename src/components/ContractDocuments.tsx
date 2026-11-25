import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, Loader2, Trash2, Upload } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { DOC_KINDS, kindLabel, uploadContractDocument, openContractDocument, type DocKind } from '@/lib/contractDocuments';
import { useStore } from '@/store/useStore';
import { cn } from '@/utils/cn';

export type ContractDocument = {
  id: string;
  entry_id: string;
  file_path: string;
  file_name: string;
  kind: DocKind;
  uploaded_by: string;
  created_at: string;
};

/** Dokumente eines Vertrags: ansehen, hochladen, löschen */
export const ContractDocuments = ({ entryId, compact = false }: { entryId: string; compact?: boolean }) => {
  const { user, profile } = useStore();
  const isAdmin = profile?.roles?.includes('admin');
  const [docs, setDocs] = useState<ContractDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<DocKind>('police');
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('contract_documents').select('*').eq('entry_id', entryId).order('created_at');
    setDocs((data as ContractDocument[]) || []);
    setLoading(false);
  }, [entryId]);

  useEffect(() => {
    load();
  }, [load]);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length || !user) return;
    setUploading(true);
    try {
      for (const f of Array.from(files)) await uploadContractDocument(entryId, user.id, f, kind);
      toast.success(files.length === 1 ? 'Dokument hochgeladen' : `${files.length} Dokumente hochgeladen`);
      load();
    } catch (e) {
      toast.error(`Upload fehlgeschlagen: ${(e as Error).message}`);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = async (d: ContractDocument) => {
    const { error } = await supabase.from('contract_documents').delete().eq('id', d.id);
    if (error) return toast.error('Dokument konnte nicht gelöscht werden.');
    if (!d.file_path.startsWith('http')) await supabase.storage.from('production_docs').remove([d.file_path]);
    setDocs((prev) => prev.filter((x) => x.id !== d.id));
  };

  return (
    <div className="space-y-2">
      {loading ? (
        <p className="text-xs text-gray-400">Dokumente werden geladen…</p>
      ) : docs.length === 0 ? (
        !compact && <p className="text-xs text-gray-500">Noch keine Dokumente an diesem Vertrag.</p>
      ) : (
        <ul className={cn('flex flex-wrap gap-1.5')}>
          {docs.map((d) => (
            <li key={d.id} className="group inline-flex items-center rounded-lg border border-gray-200 bg-white text-xs dark:border-gray-700 dark:bg-gray-800">
              <button type="button" onClick={() => openContractDocument(d.file_path)} className="inline-flex items-center gap-1.5 py-1 pl-2 pr-1.5 hover:text-brand-700 dark:hover:text-brand-300" title={d.file_name}>
                <FileText className="h-3.5 w-3.5 text-brand-600 dark:text-brand-300" />
                <span className="font-semibold">{kindLabel(d.kind)}</span>
                <span className="max-w-[10rem] truncate text-gray-500">{d.file_name}</span>
              </button>
              {(d.uploaded_by === user?.id || isAdmin) && (
                <button type="button" onClick={() => remove(d)} className="rounded-r-lg px-1.5 py-1 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30" aria-label={`${kindLabel(d.kind)} löschen`}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <select value={kind} onChange={(e) => setKind(e.target.value as DocKind)} className="input h-8 w-auto py-0 text-xs" aria-label="Art des Dokuments">
          {DOC_KINDS.map((k) => (
            <option key={k.value} value={k.value}>{k.label}</option>
          ))}
        </select>
        <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} className="btn-secondary btn-sm">
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          Hochladen
        </button>
        <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
      </div>
    </div>
  );
};
