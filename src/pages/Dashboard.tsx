import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { Profile, UserStatus } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import { 
  Briefcase, 
  Home, 
  Coffee, 
  Users, 
  Palmtree, 
  ThermometerSun, 
  LogOut,
  MessageSquare
} from 'lucide-react';
import { cn } from '@/utils/cn';

import { Skeleton } from '@/components/Skeleton';
import { toast } from 'react-hot-toast';

type StatusOption = {
  value: UserStatus['status'];
  label: string;
  icon: any;
  color: string;
};

const STATUS_OPTIONS: StatusOption[] = [
  { value: 'office', label: 'Im Büro', icon: Briefcase, color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
  { value: 'remote', label: 'Home Office', icon: Home, color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  { value: 'break', label: 'Pause', icon: Coffee, color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' },
  { value: 'meeting', label: 'Termin', icon: Users, color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' },
  { value: 'vacation', label: 'Urlaub', icon: Palmtree, color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300' },
  { value: 'sick', label: 'Krank', icon: ThermometerSun, color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
  { value: 'off', label: 'Feierabend', icon: LogOut, color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300' },
];

type UserWithStatus = Profile & {
  current_status?: UserStatus;
};

export const Dashboard = () => {
  const user = useStore((state) => state.user);
  const [colleagues, setColleagues] = useState<UserWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState('');

  const fetchColleagues = async () => {
    // 1. Fetch all profiles
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*');

    if (profilesError) {
      console.error('Error fetching profiles:', profilesError);
      return;
    }

    // 2. Fetch latest status for each user
    // In a real app with many users, we might want a more optimized query or view
    const { data: statuses, error: statusError } = await supabase
      .from('user_status')
      .select('*')
      .order('updated_at', { ascending: false });

    if (statusError) {
      console.error('Error fetching statuses:', statusError);
      return;
    }

    // 3. Merge data
    const merged = profiles.map(profile => {
      // Find the most recent status for this user
      const latestStatus = statuses?.find(s => s.user_id === profile.id);
      return {
        ...profile,
        current_status: latestStatus
      };
    });

    setColleagues(merged);
    setLoading(false);
  };

  useEffect(() => {
    fetchColleagues();

    // Realtime subscription
    const subscription = supabase
      .channel('public:user_status')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_status' },
        () => {
          fetchColleagues(); // Refresh on any change
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleStatusUpdate = async (status: UserStatus['status']) => {
    if (!user) return;

    const { error } = await supabase
      .from('user_status')
      .insert({
        user_id: user.id,
        status,
        message: statusMessage || null,
        updated_at: new Date().toISOString()
      });

    if (error) {
      console.error('Error updating status:', error);
      toast.error('Fehler beim Aktualisieren des Status');
    } else {
      setStatusMessage(''); // Reset message after update
      toast.success('Status aktualisiert');
    }
  };

  if (loading) return <div>Laden...</div>;

  const myStatus = colleagues.find(c => c.id === user?.id)?.current_status;

  return (
    <div className="space-y-8">
      {/* Status Update Section */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Mein Status setzen</h2>
        
        <div className="flex gap-4 mb-4">
          <div className="flex-1 relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <MessageSquare className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Nachricht (optional, z.B. 'Bin um 14 Uhr zurück')"
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md leading-5 bg-white dark:bg-gray-700 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              value={statusMessage}
              onChange={(e) => setStatusMessage(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {STATUS_OPTIONS.map((option) => {
            const Icon = option.icon;
            const isSelected = myStatus?.status === option.value;
            return (
              <button
                key={option.value}
                onClick={() => handleStatusUpdate(option.value)}
                className={cn(
                  "flex flex-col items-center justify-center p-3 rounded-lg border transition-all",
                  isSelected 
                    ? "ring-2 ring-offset-2 ring-blue-500 border-transparent shadow-sm dark:ring-offset-gray-800" 
                    : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700",
                  option.color
                )}
              >
                <Icon className="h-6 w-6 mb-2" />
                <span className="text-xs font-medium">{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Colleagues List */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Anwesenheitsliste</h2>
        </div>
        <ul className="divide-y divide-gray-200 dark:divide-gray-700">
          {colleagues.map((colleague) => {
            const status = colleague.current_status;
            const statusConfig = STATUS_OPTIONS.find(o => o.value === status?.status);
            const StatusIcon = statusConfig?.icon || Users;

            return (
              <li key={colleague.id} className="p-4 sm:p-6 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center space-x-4">
                    <div className="flex-shrink-0">
                      <div className="h-12 w-12 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xl font-bold text-gray-500 dark:text-gray-400 overflow-hidden">
                        {colleague.avatar_url ? (
                          <img src={colleague.avatar_url} alt="" className="h-12 w-12 rounded-full object-cover" />
                        ) : (
                          colleague.full_name?.charAt(0).toUpperCase() || '?'
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {colleague.full_name || colleague.email}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {colleague.roles?.includes('admin') ? 'Administrator' : 'Mitarbeiter'}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto">
                    <div className={cn(
                      "flex items-center px-3 py-1 rounded-full text-sm font-medium mr-4",
                      statusConfig?.color || "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300"
                    )}>
                      <StatusIcon className="h-4 w-4 mr-2" />
                      {statusConfig?.label || 'Unbekannt'}
                    </div>
                    <div className="text-right">
                      {status?.message && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 italic">"{status.message}"</p>
                      )}
                      {status?.updated_at && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                          vor {formatDistanceToNow(new Date(status.updated_at), { locale: de })}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};
