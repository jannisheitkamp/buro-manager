import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { Poll } from '@/types';
import { Plus, BarChart2, Trash2, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Modal } from '@/components/Modal';
import { toast } from 'react-hot-toast';
import { cn } from '@/utils/cn';
import { ConfirmModal } from '@/components/ConfirmModal';
import { motion, AnimatePresence } from 'framer-motion';

export const Polls = () => {
  const { user, profile } = useStore();
  const [polls, setPolls] = useState<Poll[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [deletePollId, setDeletePollId] = useState<string | null>(null);

  // Create Form State
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [creating, setCreating] = useState(false);

  const fetchPolls = async () => {
    try {
      const { data: pollsData, error: pollsError } = await supabase
        .from('polls')
        .select(`
          *,
          profiles(*),
          options:poll_options(*),
          votes:poll_votes(*)
        `)
        .order('created_at', { ascending: false });

      if (pollsError) throw pollsError;
      setPolls(pollsData || []);
    } catch (error) {
      console.error('Error fetching polls:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPolls();

    const channel = supabase
      .channel('polls_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'polls' }, fetchPolls)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_votes' }, fetchPolls)
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, []);

  const handleAddOption = () => {
    setOptions([...options, '']);
  };

  const handleOptionChange = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  };

  const handleRemoveOption = (index: number) => {
    if (options.length <= 2) return;
    const newOptions = options.filter((_, i) => i !== index);
    setOptions(newOptions);
  };

  const handleCreatePoll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    const validOptions = options.filter(o => o.trim() !== '');
    if (validOptions.length < 2) {
      toast.error('Bitte mindestens 2 Antwortmöglichkeiten angeben.');
      return;
    }

    setCreating(true);
    try {
      // 1. Create Poll
      const { data: poll, error: pollError } = await supabase
        .from('polls')
        .insert({
          question,
          created_by: user.id
        })
        .select()
        .single();

      if (pollError) throw pollError;

      // 2. Create Options
      const optionsData = validOptions.map(text => ({
        poll_id: poll.id,
        text
      }));

      const { error: optionsError } = await supabase
        .from('poll_options')
        .insert(optionsData);

      if (optionsError) throw optionsError;

      toast.success('Umfrage erstellt!');
      setIsCreateModalOpen(false);
      setQuestion('');
      setOptions(['', '']);
      fetchPolls();
    } catch (error) {
      console.error('Error creating poll:', error);
      toast.error('Fehler beim Erstellen.');
    } finally {
      setCreating(false);
    }
  };

  const handleVote = async (pollId: string, optionId: string) => {
    if (!user) return;

    try {
      // Check if already voted
      const existingVote = polls.find(p => p.id === pollId)?.votes?.find(v => v.user_id === user.id);

      if (existingVote) {
        if (existingVote.option_id === optionId) {
          // Clicked same option -> remove vote (toggle)
           await supabase.from('poll_votes').delete().eq('id', existingVote.id);
        } else {
          // Clicked different option -> update vote
          await supabase.from('poll_votes').delete().eq('id', existingVote.id);
          await supabase.from('poll_votes').insert({ poll_id: pollId, option_id: optionId, user_id: user.id });
        }
      } else {
        // New vote
        await supabase.from('poll_votes').insert({ poll_id: pollId, option_id: optionId, user_id: user.id });
      }
      
      // Realtime will update UI
    } catch (error) {
      console.error('Error voting:', error);
      toast.error('Fehler beim Abstimmen.');
    }
  };

  const handleDeletePoll = async () => {
    if (!deletePollId) return;
    try {
      await supabase.from('polls').delete().eq('id', deletePollId);
      toast.success('Umfrage gelöscht.');
      setDeletePollId(null);
      fetchPolls(); // Should happen via realtime but good to be safe
    } catch (error) {
      console.error('Error deleting poll:', error);
      toast.error('Fehler beim Löschen.');
    }
  };

  const isAdmin = profile?.roles?.includes('admin');

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
            <motion.h1 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 flex items-center gap-3"
            >
              <BarChart2 className="w-8 h-8 text-indigo-600" />
              Umfragen
            </motion.h1>
            <motion.p 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
                className="text-lg text-gray-500 dark:text-gray-400 mt-2 font-medium"
            >
                Stimme ab und entscheide mit.
            </motion.p>
        </div>
        <motion.button
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          onClick={() => setIsCreateModalOpen(true)}
          className="group relative px-6 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-semibold rounded-2xl shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:scale-[1.02] transition-all flex items-center gap-2 overflow-hidden"
        >
          <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
          <Plus className="w-5 h-5 relative z-10" />
          <span className="relative z-10">Neue Umfrage</span>
        </motion.button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <AnimatePresence>
            {loading ? (
                <div className="col-span-full py-20 text-center text-gray-400">Lade Umfragen...</div>
            ) : polls.length === 0 ? (
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="col-span-full text-center py-20"
                >
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-800 mb-4">
                        <BarChart2 className="w-10 h-10 text-gray-400" />
                    </div>
                    <p className="text-xl text-gray-500 font-medium">Noch keine Umfragen vorhanden.</p>
                </motion.div>
            ) : (
                polls.map((poll, index) => {
                const totalVotes = poll.votes?.length || 0;
                const userVote = poll.votes?.find(v => v.user_id === user?.id);
                const isOwner = poll.created_by === user?.id;

                return (
                    <motion.div 
                        key={poll.id} 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl p-6 border border-white/20 shadow-xl flex flex-col group relative overflow-hidden"
                    >
                        {/* Decorative background element */}
                        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />

                        <div className="flex justify-between items-start mb-6 relative z-10">
                            <div className="flex items-center gap-3">
                                <img 
                                    src={poll.profiles?.avatar_url || `https://ui-avatars.com/api/?name=${poll.profiles?.full_name || 'User'}`}
                                    className="w-10 h-10 rounded-full shadow-sm ring-2 ring-white dark:ring-gray-700"
                                    alt=""
                                />
                                <div>
                                    <span className="text-sm font-bold text-gray-700 dark:text-gray-200 block">
                                        {poll.profiles?.full_name}
                                    </span>
                                    <span className="text-xs text-gray-400">
                                        {format(new Date(poll.created_at), 'dd. MMM', { locale: de })}
                                    </span>
                                </div>
                            </div>
                            {(isOwner || isAdmin) && (
                                <button 
                                    onClick={() => setDeletePollId(poll.id)}
                                    className="text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                                    title="Löschen"
                                >
                                    <Trash2 className="w-5 h-5" />
                                </button>
                            )}
                        </div>

                        <h3 className="text-xl font-black text-gray-900 dark:text-white mb-6 leading-tight relative z-10">
                            {poll.question}
                        </h3>

                        <div className="space-y-3 flex-1 relative z-10">
                            {poll.options?.map((option) => {
                            const voteCount = poll.votes?.filter(v => v.option_id === option.id).length || 0;
                            const percentage = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
                            const isSelected = userVote?.option_id === option.id;

                            return (
                                <button
                                key={option.id}
                                onClick={() => handleVote(poll.id, option.id)}
                                className={cn(
                                    "w-full relative overflow-hidden rounded-xl border text-left transition-all p-3 group/opt",
                                    isSelected 
                                    ? "border-indigo-500 ring-1 ring-indigo-500 ring-offset-1 dark:ring-offset-gray-800" 
                                    : "border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700"
                                )}
                                >
                                {/* Progress Bar Background */}
                                <div 
                                    className={cn(
                                    "absolute inset-y-0 left-0 transition-all duration-700 ease-out opacity-20",
                                    isSelected ? "bg-indigo-600" : "bg-gray-200 dark:bg-gray-600 group-hover/opt:bg-indigo-200 dark:group-hover/opt:bg-indigo-900"
                                    )}
                                    style={{ width: `${percentage}%` }}
                                />
                                
                                <div className="relative flex justify-between items-center z-10">
                                    <span className={cn(
                                    "text-sm font-medium transition-colors",
                                    isSelected ? "text-indigo-700 dark:text-indigo-300" : "text-gray-700 dark:text-gray-300"
                                    )}>
                                    {option.text}
                                    </span>
                                    <div className="flex items-center gap-2">
                                        {isSelected && <CheckCircle2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />}
                                        <span className="text-xs font-bold text-gray-500 dark:text-gray-400 bg-white/50 dark:bg-gray-800/50 px-2 py-0.5 rounded-md">
                                            {percentage}%
                                        </span>
                                    </div>
                                </div>
                                </button>
                            );
                            })}
                        </div>

                        <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-700/50 flex justify-between items-center text-xs font-medium text-gray-500 dark:text-gray-400 relative z-10">
                            <span className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-lg">
                                {totalVotes} {totalVotes === 1 ? 'Stimme' : 'Stimmen'}
                            </span>
                            <span className={cn(
                                "px-2 py-1 rounded-lg",
                                poll.is_active ? "text-green-600 bg-green-50 dark:bg-green-900/20" : "text-red-500 bg-red-50"
                            )}>
                                {poll.is_active ? 'Aktiv' : 'Beendet'}
                            </span>
                        </div>
                    </motion.div>
                );
                })
            )}
        </AnimatePresence>
      </div>

      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Neue Umfrage erstellen"
      >
        <form onSubmit={handleCreatePoll} className="space-y-6">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Frage
            </label>
            <input
              type="text"
              required
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Was wollen wir essen?"
              className="w-full rounded-xl border-transparent bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 px-4 py-3 text-sm transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Antwortmöglichkeiten
            </label>
            <div className="space-y-3">
              {options.map((opt, idx) => (
                <div key={idx} className="flex gap-2 group">
                  <input
                    type="text"
                    required
                    value={opt}
                    onChange={(e) => handleOptionChange(idx, e.target.value)}
                    placeholder={`Option ${idx + 1}`}
                    className="flex-1 rounded-xl border-transparent bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 px-4 py-2.5 text-sm transition-all"
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveOption(idx)}
                      className="p-2.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={handleAddOption}
              className="mt-3 text-sm text-indigo-600 hover:text-indigo-700 font-bold flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-indigo-50 transition-colors"
            >
              <Plus className="w-4 h-4" /> Option hinzufügen
            </button>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(false)}
              className="px-6 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={creating}
              className="px-6 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-lg shadow-indigo-500/30 transition-all hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
            >
              {creating ? 'Erstelle...' : 'Erstellen'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={!!deletePollId}
        onClose={() => setDeletePollId(null)}
        onConfirm={handleDeletePoll}
        title="Umfrage löschen"
        message="Sind Sie sicher?"
        confirmText="Löschen"
        isDestructive
      />
    </div>
  );
};
