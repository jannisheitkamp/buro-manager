import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Profile } from '@/types';
import { Mail, Shield, User, Edit } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { Modal } from '@/components/Modal';
import { toast } from 'react-hot-toast';

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
];

export const Directory = () => {
  const { profile: currentUserProfile } = useStore();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);

  const fetchProfiles = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('full_name', { ascending: true });

      if (error) throw error;
      setProfiles(data || []);
    } catch (error) {
      console.error('Error fetching directory:', error);
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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
        <User className="w-8 h-8" />
        Mitarbeiter-Verzeichnis
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {profiles.map((profile) => (
          <div key={profile.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 flex flex-col items-center text-center relative group">
             {currentUserProfile?.roles?.includes('admin') && (
                <button 
                    onClick={() => handleEditRole(profile)}
                    className="absolute top-2 right-2 p-2 text-gray-400 hover:text-indigo-600 transition-all"
                    title="Rolle bearbeiten"
                >
                    <Edit className="w-4 h-4" />
                </button>
            )}

            <img
              src={profile.avatar_url || `https://ui-avatars.com/api/?name=${profile.full_name || 'User'}&background=random`}
              alt={profile.full_name || ''}
              className="w-24 h-24 rounded-full mb-4 shadow-sm object-cover"
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
