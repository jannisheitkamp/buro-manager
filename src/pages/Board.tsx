import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Post } from '@/types';
import { useStore } from '@/store/useStore';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { Plus, Trash2, Pin, CheckSquare, MessageSquare } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { ConfirmModal } from '@/components/ConfirmModal';
import { cn } from '@/utils/cn';

import { toast } from 'react-hot-toast';

export const Board = () => {
  const { user, profile } = useStore();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    type: 'announcement' as 'announcement' | 'task',
  });

  const fetchPosts = async () => {
    try {
      const { data, error } = await supabase
        .from('posts')
        .select('*, profiles(*)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPosts(data || []);
    } catch (error) {
      console.error('Error fetching posts:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPosts();

    const subscription = supabase
      .channel('posts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => {
        fetchPosts();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleDelete = async () => {
    if (!deleteId) return;

    try {
      const { error } = await supabase.from('posts').delete().eq('id', deleteId);
      if (error) throw error;
      toast.success('Eintrag gelöscht.');
      fetchPosts();
    } catch (error) {
      console.error('Error deleting post:', error);
      toast.error('Fehler beim Löschen des Eintrags.');
    } finally {
      setDeleteId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSubmitting(true);
    try {
      const { error } = await supabase.from('posts').insert({
        user_id: user.id,
        title: formData.title,
        content: formData.content,
        type: formData.type,
      });

      if (error) throw error;

      setIsModalOpen(false);
      setFormData({ title: '', content: '', type: 'announcement' });
      fetchPosts();
      toast.success('Eintrag erfolgreich erstellt.');
    } catch (error) {
      console.error('Error creating post:', error);
      toast.error('Fehler beim Erstellen des Eintrags.');
    } finally {
      setSubmitting(false);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'task': return <CheckSquare className="w-5 h-5 text-green-500" />;
      case 'announcement': default: return <Pin className="w-5 h-5 text-indigo-500" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'task': return 'Aufgabe';
      case 'announcement': default: return 'Ankündigung';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <MessageSquare className="w-8 h-8" />
          Schwarzes Brett
        </h1>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Eintrag erstellen
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {posts.length === 0 ? (
           <div className="col-span-full text-center py-12 text-gray-500">
             Noch keine Einträge auf dem schwarzen Brett.
           </div>
        ) : (
          posts.map((post) => {
            const isOwn = post.user_id === user?.id;
            const isAdmin = profile?.roles?.includes('admin');
            
            return (
              <div key={post.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 flex flex-col h-full relative group transition-all hover:shadow-md">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className={cn("p-2 rounded-lg bg-gray-50 dark:bg-gray-700")}>
                        {getTypeIcon(post.type)}
                    </div>
                    <div>
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 block">
                            {getTypeLabel(post.type)}
                        </span>
                        <span className="text-xs text-gray-400">
                            {format(parseISO(post.created_at), 'dd. MMM, HH:mm', { locale: de })}
                        </span>
                    </div>
                  </div>
                  {(isOwn || isAdmin) && (
                    <button
                      onClick={() => setDeleteId(post.id)}
                      className="text-gray-400 hover:text-red-500 transition-colors p-2"
                      title="Löschen"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  )}
                </div>

                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 line-clamp-2">
                  {post.title}
                </h3>
                
                <p className="text-gray-600 dark:text-gray-300 text-sm whitespace-pre-wrap flex-grow mb-6 line-clamp-6">
                  {post.content}
                </p>

                <div className="flex items-center gap-3 pt-4 border-t border-gray-100 dark:border-gray-700 mt-auto">
                   <img
                    src={post.profiles?.avatar_url || `https://ui-avatars.com/api/?name=${post.profiles?.full_name || 'User'}&background=random`}
                    alt={post.profiles?.full_name || ''}
                    className="w-8 h-8 rounded-full"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {post.profiles?.full_name}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Neuer Eintrag"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Typ
            </label>
            <div className="grid grid-cols-2 gap-3">
                <button
                    type="button"
                    onClick={() => setFormData({ ...formData, type: 'announcement' })}
                    className={cn(
                        "flex items-center justify-center gap-2 p-3 rounded-lg border text-sm font-medium transition-all",
                        formData.type === 'announcement' 
                            ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300" 
                            : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
                    )}
                >
                    <Pin className="w-4 h-4" />
                    Ankündigung
                </button>
                <button
                    type="button"
                    onClick={() => setFormData({ ...formData, type: 'task' })}
                    className={cn(
                        "flex items-center justify-center gap-2 p-3 rounded-lg border text-sm font-medium transition-all",
                        formData.type === 'task' 
                            ? "border-green-500 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300" 
                            : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
                    )}
                >
                    <CheckSquare className="w-4 h-4" />
                    Aufgabe
                </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Titel
            </label>
            <input
              type="text"
              required
              placeholder="Worum geht es?"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Inhalt
            </label>
            <textarea
              required
              rows={4}
              placeholder="Details..."
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition-colors disabled:opacity-50"
            >
              {submitting ? 'Wird erstellt...' : 'Erstellen'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Eintrag löschen"
        message="Sind Sie sicher, dass Sie diesen Eintrag löschen möchten?"
        confirmText="Löschen"
        isDestructive
      />
    </div>
  );
};
