import React, { useEffect, useState } from 'react';
import { openStoredFile } from '@/lib/storage';
import { PageHeader, Button } from '@/components/ui';
import { CountUp, HeroPanel } from '@/components/ui/hero';
import { useStore } from '../store/useStore';
import { supabase } from '@/lib/supabase';
import { sanitizeHtmlToFragment } from '@/utils/sanitizeHtml';
import { PROFILE_COLUMNS } from '@/lib/profiles';
import { Document, Profile } from '../types';
import { Plus, FileText, File, Download, Trash2, Edit2, Users, Check } from 'lucide-react';
import { Modal } from '../components/Modal';
import toast from 'react-hot-toast';
import RichTextEditor from '../components/RichTextEditor';

export function Documents() {
  const { user } = useStore();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [users, setUsers] = useState<Profile[]>([]);
  
  // Form State
  const [title, setTitle] = useState('');
  const [type, setType] = useState<'text' | 'file'>('text');
  const [content, setContent] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [editingDoc, setEditingDoc] = useState<Document | null>(null);

  useEffect(() => {
    fetchDocuments();
    fetchUsers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const fetchDocuments = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('documents')
        .select(`
          *,
          creator:created_by (full_name, avatar_url),
          shares:document_shares (
            user_id,
            profile:user_id (full_name, avatar_url)
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error('Error fetching documents:', error);
      // toast.error('Dokumente konnten nicht geladen werden'); // Suppress toast for now if empty
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .neq('id', user?.id) // Don't list self
        .eq('is_approved', true); // Only approved users

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!title) {
      toast.error('Bitte geben Sie einen Titel ein');
      return;
    }

    setUploading(true);
    let uploadedPath: string | null = null;
    try {
      let filePath = editingDoc?.file_path || null;

      // Handle File Upload
      if (type === 'file' && file) {
        const fileExt = file.name.split('.').pop();
        // Eigener Ordner pro Person (Speicherregel erlaubt nur dort das Hochladen)
        const fileName = `${user.id}/${crypto.randomUUID()}.${fileExt}`;
        const { error: uploadError, data } = await supabase.storage
          .from('documents')
          .upload(fileName, file);

        if (uploadError) throw uploadError;
        filePath = data.path;
        uploadedPath = data.path;
      }

      let docId = editingDoc?.id;

      if (editingDoc) {
        // Update existing document
        const { error: updateError } = await supabase
          .from('documents')
          .update({
            title,
            content: type === 'text' ? content : null,
            file_path: filePath,
            file_type: type,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingDoc.id);

        if (updateError) throw updateError;
        // Ersetzte oder entfernte Datei nicht im Speicher liegen lassen
        if (editingDoc.file_path && editingDoc.file_path !== filePath) {
          await supabase.storage.from('documents').remove([editingDoc.file_path]);
        }
      } else {
        // Create new document
        const { data: newDoc, error: createError } = await supabase
          .from('documents')
          .insert({
            title,
            content: type === 'text' ? content : null,
            file_path: filePath,
            file_type: type,
            created_by: user.id,
          })
          .select()
          .single();

        if (createError) throw createError;
        docId = newDoc.id;
      }

      // Handle Shares (Only if creator)
      // First delete existing shares if editing
      if (editingDoc && editingDoc.created_by === user.id) {
          await supabase.from('document_shares').delete().eq('document_id', editingDoc.id);
      }

      // Only insert shares if we are creating NEW doc OR we are the creator of existing doc
      const canManageShares = !editingDoc || (editingDoc.created_by === user.id);

      if (selectedUsers.length > 0 && docId && canManageShares) {
        const shareData = selectedUsers.map(userId => ({
          document_id: docId,
          user_id: userId
        }));
        
        const { error: shareError } = await supabase.from('document_shares').insert(shareData);
        
        if (shareError) {
            console.error('Share Error:', shareError);
            toast.error('Dokument gespeichert, aber Teilen fehlgeschlagen: ' + shareError.message);
        }
      } else if (editingDoc && editingDoc.created_by === user.id) {
          // If editing (as creator) and no users selected, shares were already cleared above
      }

      toast.success(editingDoc ? 'Dokument aktualisiert' : 'Dokument erstellt');
      handleCloseModal();
      fetchDocuments();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      if (uploadedPath) await supabase.storage.from('documents').remove([uploadedPath]);
      console.error('Error saving document:', error);
      toast.error(`Fehler: ${error.message || 'Speichern fehlgeschlagen'}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (doc: Document) => {
    toast((t) => (
      <div className="flex flex-col gap-2">
        <p className="font-medium">Möchten Sie dieses Dokument wirklich löschen?</p>
        <div className="flex justify-end gap-2">
          <button 
            className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-md dark:bg-gray-700 dark:hover:bg-gray-600"
            onClick={() => toast.dismiss(t.id)}
          >
            Abbrechen
          </button>
          <button 
            className="px-3 py-1 text-sm bg-red-500 text-white hover:bg-red-600 rounded-md"
            onClick={async () => {
              toast.dismiss(t.id);
              try {
                if (doc.file_path) {
                  await supabase.storage.from('documents').remove([doc.file_path]);
                }
                const { error } = await supabase.from('documents').delete().eq('id', doc.id);
                if (error) throw error;
                toast.success('Dokument gelöscht');
                fetchDocuments();
              } catch (error) {
                console.error('Error deleting document:', error);
                toast.error('Fehler beim Löschen');
              }
            }}
          >
            Löschen
          </button>
        </div>
      </div>
    ), { duration: 5000 });
  };

  const handleEdit = (doc: Document) => {
    setEditingDoc(doc);
    setTitle(doc.title);
    setType(doc.file_type);
    setContent(doc.content || '');
    // Pre-select users
    const sharedUserIds = doc.shares?.map(s => s.user_id) || [];
    setSelectedUsers(sharedUserIds);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingDoc(null);
    setTitle('');
    setType('text');
    setContent('');
    setFile(null);
    setSelectedUsers([]);
  };

  const handleDownload = async (doc: Document) => {
    // 1. If it's a file upload, download the file
    if (doc.file_type === 'file' && doc.file_path) {
      await openStoredFile('documents', doc.file_path);
      return;
    }

    // 2. If it's a text document (HTML), convert to PDF
    if (doc.file_type === 'text' && doc.content) {
      try {
        // Dynamically import html2pdf to avoid SSR issues or bundle size
        const html2pdf = (await import('html2pdf.js')).default;
        
        // Create a temporary container for the HTML content
        // Ohne innerHTML aufbauen: Titel als Text, Inhalt als bereinigtes DOM-Fragment
        const element = document.createElement('div');
        element.style.cssText = 'padding: 40px; font-family: sans-serif; color: #000;';
        const heading = document.createElement('h1');
        heading.style.marginBottom = '20px';
        heading.textContent = doc.title || '';
        const body = document.createElement('div');
        body.className = 'prose';
        body.appendChild(sanitizeHtmlToFragment(doc.content));
        element.append(heading, body);
        
        // PDF Options
        const opt = {
          margin:       10,
          filename:     `${doc.title}.pdf`,
          image:        { type: 'jpeg' as const, quality: 0.98 },
          html2canvas:  { scale: 2 },
          jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' as const }
        };

        // Generate PDF
        html2pdf().set(opt).from(element).save();
        toast.success('PDF wird erstellt...');

      } catch (error) {
        console.error('Error generating PDF:', error);
        toast.error('PDF konnte nicht erstellt werden');
      }
    }
  };

  const toggleUserSelection = (userId: string) => {
    setSelectedUsers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  if (loading) return <div className="p-8">Laden...</div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dokumente"
        description="Texte und Dateien anlegen und gezielt mit Kolleginnen und Kollegen teilen."
        actions={<Button icon={Plus} onClick={() => setIsModalOpen(true)}>Dokument anlegen</Button>}
      />

      {(() => {
        const mine = documents.filter(d => d.created_by === user?.id).length;
        const shared = documents.length - mine;
        const latest = [...documents].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
        return (
          <HeroPanel aria-label="Dokumente im Überblick">
            <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-end sm:justify-between sm:p-8">
              <div>
                <p className="text-sm text-brand-200">Für dich sichtbar</p>
                <p className="mt-1.5 font-display font-semibold leading-[0.9] tracking-tight">
                  <CountUp value={documents.length} className="text-7xl sm:text-8xl" />
                  <span className="ml-2 text-3xl text-brand-200 sm:text-4xl">{documents.length === 1 ? 'Dokument' : 'Dokumente'}</span>
                </p>
                {latest && <p className="mt-4 text-sm text-brand-100">Zuletzt: <button type="button" onClick={() => handleDownload(latest)} className="font-semibold text-amber-300 hover:underline">{latest.title}</button></p>}
              </div>
              <dl className="flex gap-8">
                <div><dt className="text-xs text-brand-200">Von dir</dt><dd className="tabular font-display text-3xl font-semibold">{mine}</dd></div>
                <div><dt className="text-xs text-brand-200">Mit dir geteilt</dt><dd className="tabular font-display text-3xl font-semibold text-amber-300">{shared}</dd></div>
              </dl>
            </div>
          </HeroPanel>
        );
      })()}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {documents.map((doc) => (
          <div key={doc.id} className="card group relative overflow-hidden p-5 transition-all hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md dark:hover:border-gray-600">
            <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: doc.file_type === 'file' ? '#5B8DB8' : '#22807C' }} />
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${doc.file_type === 'file' ? 'bg-sky-50 text-sky-600 dark:bg-sky-900/30 dark:text-sky-300' : 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300'}`}>
                  {doc.file_type === 'file' ? <File className="w-6 h-6" /> : <FileText className="w-6 h-6" />}
                </div>
                <div>
                  <h3 className="line-clamp-1 font-display text-base font-semibold text-gray-900 dark:text-white" title={doc.title}>{doc.title}</h3>
                  <p className="text-xs text-gray-500">
                    von {doc.creator?.full_name || 'Unbekannt'}, {new Date(doc.created_at).toLocaleDateString('de-DE')}
                  </p>
                </div>
              </div>
              <div className="flex gap-1">
                  <button 
                    onClick={() => handleDownload(doc)}
                    className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                    title="Download / PDF"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                {(doc.created_by === user?.id || doc.shares?.some(s => s.user_id === user?.id)) && (
                   <button 
                    onClick={() => handleEdit(doc)}
                    className="p-1.5 text-gray-500 hover:text-orange-600 hover:bg-orange-50 rounded-md transition-colors"
                    title="Bearbeiten"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                )}
                {doc.created_by === user?.id && (
                  <button 
                    onClick={() => handleDelete(doc)}
                    className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                    title="Löschen"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {doc.file_type === 'text' && (
              <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-3 mb-4 h-12">
                {doc.content?.replace(/<[^>]*>?/gm, '') || 'Kein Inhalt'}
              </p>
            )}
             {doc.file_type === 'file' && (
              <div className="h-12 mb-4 flex items-center text-sm text-gray-500 italic">
                Datei angehängt
              </div>
            )}

            <div className="border-t border-gray-100 dark:border-gray-700 pt-3 flex items-center justify-between">
              <div className="flex items-center gap-1">
                <Users className="w-4 h-4 text-gray-400" />
                <span className="text-xs text-gray-500">
                  {doc.shares && doc.shares.length > 0 
                    ? `${doc.shares.length} Teilnehmer`
                    : 'Nur ich'}
                </span>
              </div>
              {doc.shares && doc.shares.length > 0 && (
                <div className="flex -space-x-2">
                  {doc.shares.slice(0, 3).map((share) => (
                    <div key={share.id} className="w-6 h-6 rounded-full border-2 border-white dark:border-gray-800 bg-gray-200 overflow-hidden" title={share.profile?.full_name || 'User'}>
                      {share.profile?.avatar_url ? (
                        <img src={share.profile.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gray-300 text-[10px] font-medium text-gray-600">
                          {(share.profile?.full_name || '?').charAt(0)}
                        </div>
                      )}
                    </div>
                  ))}
                  {doc.shares.length > 3 && (
                     <div className="w-6 h-6 rounded-full border-2 border-white dark:border-gray-800 bg-gray-100 flex items-center justify-center text-[10px] text-gray-500">
                       +{doc.shares.length - 3}
                     </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        
        {documents.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center p-12 text-gray-500 bg-white dark:bg-gray-800 rounded-lg border border-dashed border-gray-300 dark:border-gray-700">
            <FileText className="w-12 h-12 mb-4 text-gray-300" />
            <p className="text-lg font-medium">Keine Dokumente</p>
            <p className="text-sm">Erstellen Sie ein neues Dokument oder laden Sie eine Datei hoch.</p>
          </div>
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingDoc ? 'Dokument bearbeiten' : 'Neues Dokument'}
        size="full"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Titel
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-white focus:ring-2 focus:ring-black dark:focus:ring-white outline-none transition-all"
              placeholder="Dokument Titel"
              required
            />
          </div>

          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="type"
                checked={type === 'text'}
                onChange={() => setType('text')}
                className="text-black focus:ring-black"
                disabled={!!editingDoc} // Prevent changing type on edit for simplicity
              />
              <span className="text-gray-700 dark:text-gray-300">Text Dokument</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="type"
                checked={type === 'file'}
                onChange={() => setType('file')}
                className="text-black focus:ring-black"
                disabled={!!editingDoc}
              />
              <span className="text-gray-700 dark:text-gray-300">Datei Upload</span>
            </label>
          </div>

          {type === 'text' ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Inhalt
              </label>
              <div className="h-[500px]">
                <RichTextEditor
                  content={content}
                  onChange={setContent}
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Datei
              </label>
              <input
                type="file"
                onChange={handleFileChange}
                className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-black file:text-white hover:file:bg-gray-800"
              />
              {editingDoc && editingDoc.file_path && (
                <p className="mt-1 text-xs text-gray-500">Aktuelle Datei: {editingDoc.file_path.split('/').pop()}</p>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Teilen mit
            </label>
            <div className="max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg p-2 space-y-1">
              {users.map((u) => (
                <div 
                  key={u.id}
                  onClick={() => toggleUserSelection(u.id)}
                  className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors ${
                    selectedUsers.includes(u.id) 
                      ? 'bg-blue-50 dark:bg-blue-900/20' 
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <div className={`w-5 h-5 rounded border flex items-center justify-center ${
                    selectedUsers.includes(u.id)
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'
                  }`}>
                    {selectedUsers.includes(u.id) && <Check className="w-3 h-3" />}
                  </div>
                  <div className="flex items-center gap-2">
                     <div className="w-6 h-6 rounded-full bg-gray-200 overflow-hidden">
                        {u.avatar_url ? (
                          <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gray-300 text-[10px] font-medium text-gray-600">
                            {(u.full_name || '?').charAt(0)}
                          </div>
                        )}
                      </div>
                      <span className="text-sm text-gray-700 dark:text-gray-300">{u.full_name || u.email}</span>
                  </div>
                </div>
              ))}
              {users.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-2">Keine anderen Benutzer gefunden</p>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={handleCloseModal}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={uploading}
              className="px-4 py-2 text-sm font-medium text-white bg-black hover:bg-gray-800 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? 'Speichern...' : (editingDoc ? 'Speichern' : 'Erstellen')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
