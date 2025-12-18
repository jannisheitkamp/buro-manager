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

  if (loading) return <div className="p-8 text-center">Laden...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <BarChart2 className="w-8 h-8" />
          Umfragen
        </h1>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-3 sm:py-2 rounded-lg flex items-center justify-center gap-2 transition-colors touch-manipulation shadow-sm"
        >
          <Plus className="w-5 h-5 sm:w-4 sm:h-4" />
          Neue Umfrage
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {polls.map((poll) => {
          const totalVotes = poll.votes?.length || 0;
          const userVote = poll.votes?.find(v => v.user_id === user?.id);
          const isOwner = poll.created_by === user?.id;

          return (
            <div key={poll.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 flex flex-col">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-2 mb-2">
                   <img 
                     src={poll.profiles?.avatar_url || `https://ui-avatars.com/api/?name=${poll.profiles?.full_name || 'User'}`}
                     className="w-6 h-6 rounded-full"
                     alt=""
                   />
                   <span className="text-xs text-gray-500 dark:text-gray-400">
                     {poll.profiles?.full_name} • {format(new Date(poll.created_at), 'dd.MM.', { locale: de })}
                   </span>
                </div>
                {(isOwner || isAdmin) && (
                  <button 
                    onClick={() => setDeletePollId(poll.id)}
                    className="text-gray-400 hover:text-red-500 transition-colors p-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                {poll.question}
              </h3>

              <div className="space-y-3 flex-1">
                {poll.options?.map((option) => {
                  const voteCount = poll.votes?.filter(v => v.option_id === option.id).length || 0;
                  const percentage = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
                  const isSelected = userVote?.option_id === option.id;

                  return (
                    <button
                      key={option.id}
                      onClick={() => handleVote(poll.id, option.id)}
                      className={cn(
                        "w-full relative group overflow-hidden rounded-lg border text-left transition-all p-3",
                        isSelected 
                          ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20" 
                          : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                      )}
                    >
                      {/* Progress Bar Background */}
                      <div 
                        className={cn(
                          "absolute inset-y-0 left-0 transition-all duration-500 ease-out opacity-20",
                          isSelected ? "bg-indigo-500" : "bg-gray-200 dark:bg-gray-600"
                        )}
                        style={{ width: `${percentage}%` }}
                      />
                      
                      <div className="relative flex justify-between items-center z-10">
                        <span className={cn(
                          "text-sm font-medium",
                          isSelected ? "text-indigo-700 dark:text-indigo-300" : "text-gray-700 dark:text-gray-300"
                        )}>
                          {option.text}
                        </span>
                        <div className="flex items-center gap-2">
                           {isSelected && <CheckCircle2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />}
                           <span className="text-xs text-gray-500 dark:text-gray-400 font-semibold">
                             {percentage}%
                           </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 flex justify-between">
                <span>{totalVotes} {totalVotes === 1 ? 'Stimme' : 'Stimmen'}</span>
                <span>{poll.is_active ? 'Aktiv' : 'Beendet'}</span>
              </div>
            </div>
          );
        })}
      </div>

      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Neue Umfrage erstellen"
      >
        <form onSubmit={handleCreatePoll} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Frage
            </label>
            <input
              type="text"
              required
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Was wollen wir essen?"
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Antwortmöglichkeiten
            </label>
            <div className="space-y-2">
              {options.map((opt, idx) => (
                <div key={idx} className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={opt}
                    onChange={(e) => handleOptionChange(idx, e.target.value)}
                    placeholder={`Option ${idx + 1}`}
                    className="flex-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveOption(idx)}
                      className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={handleAddOption}
              className="mt-2 text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Option hinzufügen
            </button>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition-colors disabled:opacity-50"
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
