import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Profile } from '@/types';
import { Mail, Shield, User, Edit, CheckCircle, Clock}de-react';
import { useStore } from '@/store/useStore';
import { Modal } from '@/components/Modal';
import { toast } from 'react-hot-toast';
import { cn } from '@/utils/cn';

const ROLES = [
  'admin',
  'employee',
  'gruppe_vaupel',
  'gruppe_kalies',
  'selbststaendig',
  'tim',
  'morris',
  'vaupel',
  'jannis',
  'flori',
  'marcio',
  'lucas',
];

export const Directory = () => {
  const { profile: currentUserProfile } = useStore();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [view, setView] = useState<'all' | 'pending'>('all');

  const fetchProfiles = async () => {
    setLoading(true); // Ensure loading state is shown on refresh
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('full_name', { ascending: true });

      if (error) throw error;
      setProfiles(data || []);
    } catch (error) {
      console.error('Error fetching directory:', error);
      toast.error('Fehler beim Laden der Mitarbeiter.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  const handleEditRole = (profile: Profile) => {
    setEditingProfile(profile);
    setSelectedRoles(profile.roles || []);
  };

  const saveRoles = async () => {
    if (!editingProfile) return;

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ roles: selectedRoles })
        .eq('id', editingProfile.id);

      if (error) throw error;

      setEditingProfile(null);
      fetchProfiles();
      toast.success('Rollen erfolgreich gespeichert.');
    } catch (error) {
      console.error('Error updating roles:', error);
      toast.error('Fehler beim Speichern der Rollen.');
    }
  };

  const approveUser = async (id: string) => {
      if(!confirm('Nutzer freischalten?')) return;
      try {
          const { error } = await supabase.from('profiles').update({ is_approved: true }).eq('id', id);
          if (error) throw error;
          toast.success('Nutzer freigeschaltet!');
          fetchProfiles();
      } catch (err) {
          console.error(err);
          toast.error('Fehler beim Freischalten.');
      }
  };

  const toggleRole = (role: string) => {
    setSelectedRoles(prev => 
      prev.includes(role) 
        ? prev.filter(r => r !== role)
        : [...prev, role]
    );
  };

  const formatRole = (role: string) => {
    return role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  if (loading) return <div className="p-8 text-center">Laden...</div>;

  const pendingCount = profiles.filter(p => !p.is_approved).length;
  
  // Filter logic
  const filteredProfiles = profiles.filter(p => {
      if (view === 'pending') return !p.is_approved;
      return true; // Show all (or maybe approved only? usually 'all' implies everyone)
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <User className="w-8 h-8" />
            Mitarbeiter-Verzeichnis
        </h1>
        
        <div className="flex items-center gap-2">
            <button 
                onClick={fetchProfiles} 
                className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                title="Aktualisieren"
            >
                <RefreshCcw className={cn("w-5 h-5", loading && "animate-spin")} />
            </button>

            {currentUserProfile?.roles?.includes('admin') && (
                <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
                    <button
                        onClick={() => setView('all')}
                        className={cn(
                            "px-4 py-2 text-sm font-medium rounded-md transition-all",
                            view === 'all' ? "bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-400 hover:text-gray-900"
                        )}
                    >
                        Alle
                    </button>
                    <button
                        onClick={() => setView('pending')}
                        className={cn(
                            "px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2",
                            view === 'pending' ? "bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-400 hover:text-gray-900"
                        )}
                    >
                        Warten auf Freigabe
                        {pendingCount > 0 && (
                            <span className="bg-red-500 text-white text-[10px] px-1.5 rounded-full">{pendingCount}</span>
                        )}
                    </button>
                </div>
            )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredProfiles.length === 0 ? (
            <div className="col-span-full text-center py-12 text-gray-400">
                Keine Mitarbeiter gefunden.
            </div>
        ) : filteredProfiles.map((profile) => (
          <div key={profile.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 flex flex-col items-center text-center relative group">
             
             {/* Status Badge */}
             {!profile.is_approved && (
                 <div className="absolute top-2 left-2 bg-yellow-100 text-yellow-800 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                     <Clock className="w-3 h-3" /> WARTEND
                 </div>
             )}

             {currentUserProfile?.roles?.includes('admin') && (
                <div className="absolute top-2 right-2 flex gap-1">
                    {!profile.is_approved && (
                        <button 
                            onClick={() => approveUser(profile.id)}
                            className="p-2 text-green-500 hover:text-green-700 hover:bg-green-50 rounded-full transition-all"
                            title="Benutzer freischalten"
                        >
                            <CheckCircle className="w-4 h-4" />
                        </button>
                    )}
                    <button 
                        onClick={() => handleEditRole(profile)}
                        className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-gray-50 rounded-full transition-all"
                        title="Rolle bearbeiten"
                    >
                        <Edit className="w-4 h-4" />
                    </button>
                </div>
            )}

            <img
              src={profile.avatar_url || `https://ui-avatars.com/api/?name=${profile.full_name || 'User'}&background=random`}
              alt={profile.full_name || ''}
              className={cn(
                  "w-24 h-24 rounded-full mb-4 shadow-sm object-cover",
                  !profile.is_approved && "grayscale opacity-70"
              )}
            />
            
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
              {profile.full_name || 'Unbekannt'}
            </h3>
            
            <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 mb-4">
              <Mail className="w-3 h-3" />
              <a href={`mailto:${profile.email}`} className="hover:text-indigo-600 transition-colors">
                {profile.email}
              </a>
            </div>

            <div className="mt-auto flex flex-wrap gap-1 justify-center">
                {profile.roles?.map(role => (
                    <span key={role} className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        role === 'admin' 
                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' 
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                    }`}>
                        {role === 'admin' && <Shield className="w-3 h-3" />}
                        {formatRole(role)}
                    </span>
                ))}
            </div>
          </div>
        ))}
      </div>

      <Modal
        isOpen={!!editingProfile}
        onClose={() => setEditingProfile(null)}
        title="Rollen bearbeiten"
      >
        <div className="space-y-4">
            <p className="text-sm text-gray-500">
                Rollen für <strong>{editingProfile?.full_name}</strong> ändern:
            </p>
            <div className="space-y-2 max-h-60 overflow-y-auto p-2 border rounded-md dark:border-gray-700">
                {ROLES.map(role => (
                    <label key={role} className="flex items-center gap-2 cursor-pointer p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded">
                        <input 
                            type="checkbox" 
                            checked={selectedRoles.includes(role)}
                            onChange={() => toggleRole(role)}
                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                            {formatRole(role)}
                        </span>
                    </label>
                ))}
            </div>
            <div className="flex justify-end gap-3 mt-6">
                <button
                    onClick={() => setEditingProfile(null)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                >
                    Abbrechen
                </button>
                <button
                    onClick={saveRoles}
                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition-colors"
                >
                    Speichern
                </button>
            </div>
        </div>
      </Modal>
    </div>
  );
};
