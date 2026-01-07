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
import { motion, AnimatePresence } from 'framer-motion';

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
        .select('*, profiles(*)')
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
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
            <motion.h1 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 flex items-center gap-3"
            >
              <MessageSquare className="w-8 h-8 text-gray-800 dark:text-gray-200" />
              Schwarzes Brett
            </motion.h1>
            <motion.p 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
                className="text-lg text-gray-500 dark:text-gray-400 mt-2 font-medium"
            >
                Neuigkeiten und Aufgaben für das Team.
            </motion.p>
        </div>
        <motion.button
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          onClick={() => setIsModalOpen(true)}
          className="group relative px-6 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-semibold rounded-2xl shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:scale-[1.02] transition-all flex items-center gap-2 overflow-hidden"
        >
          <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
          <Plus className="w-5 h-5 relative z-10" />
          <span className="relative z-10">Eintrag erstellen</span>
        </motion.button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <AnimatePresence>
            {posts.length === 0 ? (
            <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="col-span-full text-center py-20"
            >
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-800 mb-4">
                    <MessageSquare className="w-10 h-10 text-gray-400" />
                </div>
                <p className="text-xl text-gray-500 font-medium">Noch keine Einträge auf dem schwarzen Brett.</p>
            </motion.div>
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
                    className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl p-6 border border-white/20 shadow-xl flex flex-col h-full relative group hover:shadow-2xl hover:shadow-indigo-500/10 transition-all hover:-translate-y-1"
                >
                    <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className={cn(
                                "p-3 rounded-2xl shadow-inner",
                                post.type === 'task' ? "bg-green-100 dark:bg-green-900/30" : "bg-indigo-100 dark:bg-indigo-900/30"
                            )}>
                                {getTypeIcon(post.type)}
                            </div>
                            <div>
                                <span className={cn(
                                    "text-xs font-bold uppercase tracking-wider",
                                    post.type === 'task' ? "text-green-600 dark:text-green-400" : "text-indigo-600 dark:text-indigo-400"
                                )}>
                                    {getTypeLabel(post.type)}
                                </span>
                                <span className="text-xs text-gray-400 block font-medium">
                                    {format(parseISO(post.created_at), 'dd. MMM, HH:mm', { locale: de })}
                                </span>
                            </div>
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

                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3 line-clamp-2 leading-tight">
                    {post.title}
                    </h3>
                    
                    <p className="text-gray-600 dark:text-gray-300 text-sm whitespace-pre-wrap flex-grow mb-8 line-clamp-6 leading-relaxed">
                    {post.content}
                    </p>

                    <div className="flex items-center gap-3 pt-4 border-t border-gray-100 dark:border-gray-700/50 mt-auto">
                        <img
                            src={post.profiles?.avatar_url || `https://ui-avatars.com/api/?name=${post.profiles?.full_name || 'User'}&background=random`}
                            alt={post.profiles?.full_name || ''}
                            className="w-10 h-10 rounded-full shadow-sm ring-2 ring-white dark:ring-gray-700"
                        />
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
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Typ
            </label>
            <div className="grid grid-cols-2 gap-4">
                <button
                    type="button"
                    onClick={() => setFormData({ ...formData, type: 'announcement' })}
                    className={cn(
                        "flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border transition-all hover:scale-105 active:scale-95",
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
                        "flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border transition-all hover:scale-105 active:scale-95",
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
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
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
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
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
              className="px-6 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-lg shadow-indigo-500/30 transition-all hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
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
