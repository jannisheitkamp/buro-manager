import React, { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { supabase } from '../lib/supabase';
import { Document, Profile } from '../types';
import { Plus, FileText, File, Download, Trash2, Edit2, Users, X, Check } from 'lucide-react';
import { Modal } from '../components/Modal';
import toast from 'react-hot-toast';

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
  }, [user]);

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
        .select('*')
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
    try {
      let filePath = editingDoc?.file_path || null;

      // Handle File Upload
      if (type === 'file' && file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const { error: uploadError, data } = await supabase.storage
          .from('documents')
          .upload(fileName, file);

        if (uploadError) throw uploadError;
        filePath = data.path;
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

      // Handle Shares
      // First delete existing shares if editing (simplest approach, though crude)
      if (editingDoc) {
        await supabase.from('document_shares').delete().eq('document_id', editingDoc.id);
      }

      if (selectedUsers.length > 0 && docId) {
        const shareData = selectedUsers.map(userId => ({
          document_id: docId,
          user_id: userId
        }));
        const { error: shareError } = await supabase.from('document_shares').insert(shareData);
        if (shareError) throw shareError;
      }

      toast.success(editingDoc ? 'Dokument aktualisiert' : 'Dokument erstellt');
      handleCloseModal();
      fetchDocuments();
    } catch (error) {
      console.error('Error saving document:', error);
      toast.error('Fehler beim Speichern');
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
    if (!doc.file_path) return;
    try {
      const { data, error } = await supabase.storage
        .from('documents')
        .createSignedUrl(doc.file_path, 60); // 60 seconds valid

      if (error) throw error;
      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank');
      }
    } catch (error) {
      console.error('Error downloading file:', error);
      toast.error('Download fehlgeschlagen');
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
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dokumente</h1>
          <p className="text-gray-500 dark:text-gray-400">Verwalten und teilen Sie Dokumente mit Ihrem Team</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Neues Dokument
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {documents.map((doc) => (
          <div key={doc.id} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 p-4 hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${doc.file_type === 'file' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400' : 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400'}`}>
                  {doc.file_type === 'file' ? <File className="w-6 h-6" /> : <FileText className="w-6 h-6" />}
                </div>
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-white line-clamp-1" title={doc.title}>{doc.title}</h3>
                  <p className="text-xs text-gray-500">
                    von {doc.creator?.full_name || 'Unbekannt'} • {new Date(doc.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex gap-1">
                {doc.file_type === 'file' && (
                  <button 
                    onClick={() => handleDownload(doc)}
                    className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                    title="Download"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                )}
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
                {doc.content}
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
        size="lg"
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
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={6}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-gray-900 dark:text-white focus:ring-2 focus:ring-black dark:focus:ring-white outline-none transition-all resize-none"
                placeholder="Schreiben Sie hier..."
              />
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
