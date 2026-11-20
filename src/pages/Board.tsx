import { useEffect, useState } from 'react';
import { Avatar } from '@/components/ui';
import { PageHeader, Button, EmptyState } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { PROFILE_PUBLIC } from '@/lib/profiles';
import { Post } from '@/types';
import { useStore } from '@/store/useStore';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { Plus, Trash2, Pin, CheckSquare, MessageSquare } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { ConfirmModal } from '@/components/ConfirmModal';
import { cn } from '@/utils/cn';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { HeroPanel, StatusPill } from '@/components/ui/hero';

export const Board = () => {
  const { user, profile } = useStore();
  const [posts, setPosts] = useState<Post[]>([]);
  // const [loading, setLoading] = useState(true);
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
        .select(`*, profiles(${PROFILE_PUBLIC})`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPosts(data || []);
    } catch (error) {
      console.error('Error fetching posts:', error);
    } finally {
      // setLoading(false);
    }
  };

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    const debouncedFetch = () => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            fetchPosts();
        }, 500);
    };

    fetchPosts();

    const subscription = supabase
      .channel('board')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, debouncedFetch)
      .subscribe();

    return () => {
      clearTimeout(timeoutId);
      supabase.removeChannel(subscription);
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

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'task': return 'Aufgabe';
      case 'announcement': default: return 'Ankündigung';
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Schwarzes Brett"
        description="Ankündigungen und Aufgaben für das ganze Team."
        actions={<Button icon={Plus} onClick={() => setIsModalOpen(true)}>Beitrag schreiben</Button>}
      />

      {posts[0] && (
        <HeroPanel aria-label="Neuester Beitrag">
          <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm text-brand-200">
                {posts[0].type === 'task' ? <CheckSquare className="h-4 w-4 text-amber-300" /> : <Pin className="h-4 w-4 text-amber-300" />}
                Neueste {posts[0].type === 'task' ? 'Aufgabe' : 'Ankündigung'}, {format(parseISO(posts[0].created_at), "d. MMMM 'um' HH:mm", { locale: de })}
              </p>
              <h2 className="mt-3 font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{posts[0].title}</h2>
              <p className="mt-3 line-clamp-3 max-w-3xl whitespace-pre-wrap text-[15px] leading-relaxed text-brand-50/90">{posts[0].content}</p>
            </div>
            <div className="flex items-center gap-3">
              <Avatar name={posts[0].profiles?.full_name} src={posts[0].profiles?.avatar_url} size="lg" className="ring-2 ring-amber-300/80" />
              <span>
                <span className="block text-sm font-semibold">{posts[0].profiles?.full_name}</span>
                <span className="block text-xs text-brand-200">{posts.length} {posts.length === 1 ? 'Beitrag' : 'Beiträge'} am Brett</span>
              </span>
            </div>
          </div>
        </HeroPanel>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <AnimatePresence>
            {posts.length === 0 ? (
            <div className="card col-span-full">
                <EmptyState icon={MessageSquare} title="Noch nichts am Brett" description="Schreib eine Ankündigung oder Aufgabe, dann sieht sie das ganze Team." action={<Button icon={Plus} onClick={() => setIsModalOpen(true)}>Beitrag schreiben</Button>} />
            </div>
            ) : (
            posts.map((post, index) => {
                const isOwn = post.user_id === user?.id;
                const isAdmin = profile?.roles?.includes('admin');
                
                return (
                <motion.div 
                    key={post.id} 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    layout
                    className="card group relative flex h-full flex-col overflow-hidden p-6 transition-all hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md dark:hover:border-gray-600"
                >
                    <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: post.type === 'task' ? '#10B981' : '#F2A541' }} />
                    <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <StatusPill tone={post.type === 'task' ? 'emerald' : 'amber'}>{getTypeLabel(post.type)}</StatusPill>
                            <span className="text-xs text-gray-500">
                                {format(parseISO(post.created_at), 'dd. MMM, HH:mm', { locale: de })}
                            </span>
                        </div>
                        {(isOwn || isAdmin) && (
                            <button
                            onClick={() => setDeleteId(post.id)}
                            className="text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                            title="Löschen"
                            >
                            <Trash2 className="w-5 h-5" />
                            </button>
                        )}
                    </div>

                    <h3 className="mb-3 line-clamp-2 font-display text-xl font-semibold leading-tight text-gray-900 dark:text-white">
                    {post.title}
                    </h3>
                    
                    <p className="text-gray-600 dark:text-gray-300 text-sm whitespace-pre-wrap flex-grow mb-8 line-clamp-6 leading-relaxed">
                    {post.content}
                    </p>

                    <div className="flex items-center gap-3 pt-4 border-t border-gray-100 dark:border-gray-700 mt-auto">
                        <Avatar name={post.profiles?.full_name} src={post.profiles?.avatar_url} size="md" className="w-10 h-10 rounded-full shadow-sm ring-2 ring-white dark:ring-gray-700" />
                        <div>
                            <span className="text-sm font-bold text-gray-700 dark:text-gray-200 block">
                                {post.profiles?.full_name}
                            </span>
                            <span className="text-xs text-gray-400">Verfasser</span>
                        </div>
                    </div>
                </motion.div>
                );
            })
            )}
        </AnimatePresence>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Neuer Eintrag"
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-2">
              Typ
            </label>
            <div className="grid grid-cols-2 gap-4">
                <button
                    type="button"
                    onClick={() => setFormData({ ...formData, type: 'announcement' })}
                    className={cn(
                        "flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border transition-all",
                        formData.type === 'announcement' 
                            ? "border-indigo-500 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-500 ring-offset-2 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-500 dark:ring-offset-gray-800" 
                            : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300"
                    )}
                >
                    <Pin className="w-6 h-6" />
                    <span className="font-semibold text-sm">Ankündigung</span>
                </button>
                <button
                    type="button"
                    onClick={() => setFormData({ ...formData, type: 'task' })}
                    className={cn(
                        "flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border transition-all",
                        formData.type === 'task' 
                            ? "border-green-500 bg-green-50 text-green-700 ring-2 ring-green-500 ring-offset-2 dark:bg-green-900/30 dark:text-green-300 dark:border-green-500 dark:ring-offset-gray-800" 
                            : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300"
                    )}
                >
                    <CheckSquare className="w-6 h-6" />
                    <span className="font-semibold text-sm">Aufgabe</span>
                </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">
              Titel
            </label>
            <input
              type="text"
              required
              placeholder="Worum geht es?"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full rounded-xl border-transparent bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 px-4 py-3 text-sm transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">
              Inhalt
            </label>
            <textarea
              required
              rows={6}
              placeholder="Details..."
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              className="w-full rounded-xl border-transparent bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 px-4 py-3 text-sm transition-all resize-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-6 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm transition-all hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
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
