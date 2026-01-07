import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Profile, UserStatus } from '@/types';
import { Mail, Shield, User, Edit, CheckCircle, Clock, RefreshCcw, Briefcase, Home, Coffee, Users, Palmtree, ThermometerSun, LogOut, Copy, X, Phone } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { Modal } from '@/components/Modal';
import { toast } from 'react-hot-toast';
import { cn } from '@/utils/cn';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';

// Roles configuration
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

const STATUS_ICONS = {
    'office': Briefcase,
    'remote': Home,
    'break': Coffee,
    'meeting': Users,
    'vacation': Palmtree,
    'sick': ThermometerSun,
    'off': LogOut
};

const STATUS_COLORS = {
    'office': 'text-emerald-600 bg-emerald-100',
    'remote': 'text-blue-600 bg-blue-100',
    'break': 'text-amber-600 bg-amber-100',
    'meeting': 'text-purple-600 bg-purple-100',
    'vacation': 'text-indigo-600 bg-indigo-100',
    'sick': 'text-red-600 bg-red-100',
    'off': 'text-gray-500 bg-gray-100'
};

const STATUS_LABELS: Record<string, string> = {
    'office': 'Im Büro',
    'remote': 'Home Office',
    'break': 'Pause',
    'meeting': 'Im Termin',
    'vacation': 'Urlaub',
    'sick': 'Krank',
    'off': 'Feierabend'
};

export const Directory = () => {
  const { profile: currentUserProfile } = useStore();
  const [profiles, setProfiles] = useState<(Profile & { status?: UserStatus })[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [view, setView] = useState<'all' | 'pending'>('all');
  const [selectedUser, setSelectedUser] = useState<(Profile & { status?: UserStatus }) | null>(null);

  const fetchProfiles = async () => {
    setLoading(true); 
    try {
      const [profilesRes, statusRes] = await Promise.all([
          supabase.from('profiles').select('*').order('full_name', { ascending: true }),
          supabase.from('user_status').select('*').order('updated_at', { ascending: false })
      ]);

      if (profilesRes.error) throw profilesRes.error;
      
      const profilesData = profilesRes.data || [];
      const statusData = statusRes.data || [];

      // Merge status
      const merged = profilesData.map(p => ({
          ...p,
          status: statusData.find(s => s.user_id === p.id)
      }));

      setProfiles(merged);
    } catch (error) {
      console.error('Error fetching directory:', error);
      toast.error('Fehler beim Laden der Mitarbeiter.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfiles();
    
    // Subscribe to status changes
    const sub = supabase.channel('directory_status')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'user_status' }, fetchProfiles)
        .subscribe();

    return () => { sub.unsubscribe(); };
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

  const pendingCount = profiles.filter(p => !p.is_approved).length;
  
  const filteredProfiles = profiles.filter(p => {
      if (view === 'pending') return !p.is_approved;
      return true; 
  });

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <motion.h1 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 flex items-center gap-3"
        >
            <User className="w-8 h-8 text-indigo-600" />
            Mitarbeiter
        </motion.h1>
        
        <div className="flex items-center gap-3">
            <motion.button 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={fetchProfiles} 
                className="p-3 bg-white dark:bg-gray-800 text-gray-500 hover:text-indigo-600 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 transition-all"
                title="Aktualisieren"
            >
                <RefreshCcw className={cn("w-5 h-5", loading && "animate-spin")} />
            </motion.button>

            {currentUserProfile?.roles?.includes('admin') && (
                <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1 }}
                    className="flex bg-white/50 dark:bg-gray-800/50 backdrop-blur-md p-1.5 rounded-2xl border border-gray-100 dark:border-gray-700"
                >
                    <button
                        onClick={() => setView('all')}
                        className={cn(
                            "px-4 py-2 text-sm font-bold rounded-xl transition-all",
                            view === 'all' 
                                ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-lg shadow-gray-200/50 dark:shadow-none" 
                                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                        )}
                    >
                        Alle
                    </button>
                    <button
                        onClick={() => setView('pending')}
                        className={cn(
                            "px-4 py-2 text-sm font-bold rounded-xl transition-all flex items-center gap-2",
                            view === 'pending' 
                                ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-lg shadow-gray-200/50 dark:shadow-none" 
                                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                        )}
                    >
                        Freigabe
                        {pendingCount > 0 && (
                            <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{pendingCount}</span>
                        )}
                    </button>
                </motion.div>
            )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        <AnimatePresence>
            {loading ? (
                <div className="col-span-full py-20 text-center text-gray-400">Lade Mitarbeiter...</div>
            ) : filteredProfiles.length === 0 ? (
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="col-span-full text-center py-20"
                >
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-800 mb-4">
                        <User className="w-10 h-10 text-gray-400" />
                    </div>
                    <p className="text-xl text-gray-500 font-medium">Keine Mitarbeiter gefunden.</p>
                </motion.div>
            ) : (
                filteredProfiles.map((profile, index) => {
                    const statusKey = profile.status?.status || 'off';
                    const StatusIcon = STATUS_ICONS[statusKey as keyof typeof STATUS_ICONS] || LogOut;
                    const statusColor = STATUS_COLORS[statusKey as keyof typeof STATUS_COLORS] || STATUS_COLORS['off'];

                    return (
                        <motion.div 
                            key={profile.id} 
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.05 }}
                            layout
                            onClick={() => setSelectedUser(profile)}
                            className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 dark:border-gray-700 p-6 flex flex-col items-center text-center relative group hover:-translate-y-1 transition-all duration-300 cursor-pointer"
                        >
                            
                            {/* Status Dot */}
                            <div className={cn(
                                "absolute top-4 left-4 w-3 h-3 rounded-full ring-2 ring-white dark:ring-gray-800",
                                statusKey === 'off' ? 'bg-gray-300' : 'bg-green-500 animate-pulse'
                            )} title={STATUS_LABELS[statusKey]} />

                            {currentUserProfile?.roles?.includes('admin') && (
                                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                                    {!profile.is_approved && (
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); approveUser(profile.id); }}
                                            className="p-2 text-green-500 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-xl transition-all"
                                            title="Benutzer freischalten"
                                        >
                                            <CheckCircle className="w-5 h-5" />
                                        </button>
                                    )}
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); handleEditRole(profile); }}
                                        className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-xl transition-all"
                                        title="Rolle bearbeiten"
                                    >
                                        <Edit className="w-5 h-5" />
                                    </button>
                                </div>
                            )}

                            <div className="relative mb-4">
                                <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500 to-violet-500 rounded-full blur-lg opacity-20 group-hover:opacity-40 transition-opacity" />
                                <img
                                    src={profile.avatar_url || `https://ui-avatars.com/api/?name=${profile.full_name || 'User'}&background=random`}
                                    alt={profile.full_name || ''}
                                    className={cn(
                                        "w-28 h-28 rounded-full shadow-lg object-cover ring-4 ring-white dark:ring-gray-700 relative z-10",
                                        !profile.is_approved && "grayscale opacity-70"
                                    )}
                                />
                                {/* Status Icon Badge */}
                                <div className={cn(
                                    "absolute bottom-0 right-0 z-20 p-1.5 rounded-full shadow-md border-2 border-white dark:border-gray-800",
                                    statusColor
                                )}>
                                    <StatusIcon className="w-4 h-4" />
                                </div>
                            </div>
                            
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
                                {profile.full_name || 'Unbekannt'}
                            </h3>
                            
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 line-clamp-1">
                                {profile.email}
                            </p>

                            <div className="mt-auto flex flex-wrap gap-1.5 justify-center w-full">
                                {profile.roles?.slice(0, 3).map(role => (
                                    <span key={role} className={cn(
                                        "inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold border shadow-sm",
                                        role === 'admin' 
                                            ? "bg-purple-50 text-purple-700 border-purple-100 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-800" 
                                            : "bg-gray-50 text-gray-600 border-gray-100 dark:bg-gray-700/50 dark:text-gray-300 dark:border-gray-600"
                                    )}>
                                        {role === 'admin' && <Shield className="w-3 h-3" />}
                                        {formatRole(role)}
                                    </span>
                                ))}
                                {(profile.roles?.length || 0) > 3 && (
                                    <span className="text-xs text-gray-400 font-medium px-1">+{profile.roles!.length - 3}</span>
                                )}
                            </div>
                        </motion.div>
                    );
                })
            )}
        </AnimatePresence>
      </div>

      {/* Detail Modal (Visitenkarte) */}
      <AnimatePresence>
          {selectedUser && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                  <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setSelectedUser(null)}
                      className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                  />
                  <motion.div 
                      initial={{ opacity: 0, scale: 0.9, y: 20 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: 20 }}
                      className="relative w-full max-w-md bg-white dark:bg-gray-800 rounded-3xl shadow-2xl overflow-hidden"
                  >
                      {/* Header Background */}
                      <div className="h-32 bg-gradient-to-r from-indigo-500 to-purple-600 relative">
                          <button 
                              onClick={() => setSelectedUser(null)}
                              className="absolute top-4 right-4 p-2 bg-black/20 hover:bg-black/40 text-white rounded-full transition-colors"
                          >
                              <X className="w-5 h-5" />
                          </button>
                      </div>

                      {/* Avatar */}
                      <div className="flex justify-center -mt-16 relative z-10">
                          <img 
                              src={selectedUser.avatar_url || `https://ui-avatars.com/api/?name=${selectedUser.full_name}&background=random`} 
                              className="w-32 h-32 rounded-full border-4 border-white dark:border-gray-800 shadow-lg object-cover bg-white"
                          />
                      </div>

                      <div className="p-6 text-center space-y-6">
                          <div>
                              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{selectedUser.full_name}</h2>
                              <div className="flex items-center justify-center gap-2 mt-2">
                                  {(() => {
                                      const s = selectedUser.status?.status || 'off';
                                      const I = STATUS_ICONS[s as keyof typeof STATUS_ICONS];
                                      return (
                                          <span className={cn(
                                              "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold",
                                              STATUS_COLORS[s as keyof typeof STATUS_COLORS]
                                          )}>
                                              <I className="w-3.5 h-3.5" />
                                              {STATUS_LABELS[s]}
                                              {selectedUser.status?.message && ` - ${selectedUser.status.message}`}
                                          </span>
                                      );
                                  })()}
                              </div>
                          </div>

                          <div className="flex justify-center gap-4">
                              <a 
                                  href={`mailto:${selectedUser.email}`}
                                  className="flex-1 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 py-3 rounded-2xl font-bold text-sm hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors flex items-center justify-center gap-2"
                              >
                                  <Mail className="w-4 h-4" />
                                  E-Mail
                              </a>
                              {selectedUser.phone && (
                                <a 
                                    href={`tel:${selectedUser.phone}`}
                                    className="flex-1 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 py-3 rounded-2xl font-bold text-sm hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors flex items-center justify-center gap-2"
                                >
                                    <Phone className="w-4 h-4" />
                                    Anruf
                                </a>
                              )}
                              <button 
                                  onClick={() => {
                                      navigator.clipboard.writeText(selectedUser.email || '');
                                      toast.success('E-Mail kopiert');
                                  }}
                                  className="p-3 bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-2xl hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                              >
                                  <Copy className="w-5 h-5" />
                              </button>
                          </div>

                          <div className="text-left space-y-3">
                              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Informationen</h3>
                              <div className="bg-gray-50 dark:bg-gray-700/30 rounded-2xl p-4 space-y-3">
                                  <div className="flex justify-between items-center text-sm">
                                      <span className="text-gray-500">Status-Update</span>
                                      <span className="font-medium text-gray-900 dark:text-white">
                                          {selectedUser.status?.updated_at 
                                              ? format(new Date(selectedUser.status.updated_at), 'HH:mm') + ' Uhr'
                                              : '-'}
                                      </span>
                                  </div>
                                  <div className="flex justify-between items-center text-sm">
                                      <span className="text-gray-500">Rollen</span>
                                      <span className="font-medium text-gray-900 dark:text-white text-right max-w-[200px] truncate">
                                          {selectedUser.roles?.map(formatRole).join(', ') || '-'}
                                      </span>
                                  </div>
                              </div>
                          </div>
                      </div>
                  </motion.div>
              </div>
          )}
      </AnimatePresence>

      {/* Edit Modal (Admin only) */}
      <Modal
        isOpen={!!editingProfile}
        onClose={() => setEditingProfile(null)}
        title="Rollen bearbeiten"
      >
        <div className="space-y-6">
            <div className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700">
                <img 
                    src={editingProfile?.avatar_url || `https://ui-avatars.com/api/?name=${editingProfile?.full_name}`} 
                    className="w-12 h-12 rounded-full"
                />
                <div>
                    <p className="font-bold text-gray-900 dark:text-white">{editingProfile?.full_name}</p>
                    <p className="text-xs text-gray-500">{editingProfile?.email}</p>
                </div>
            </div>

            <div className="space-y-2 max-h-[400px] overflow-y-auto p-1">
                {ROLES.map(role => (
                    <label 
                        key={role} 
                        className={cn(
                            "flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer",
                            selectedRoles.includes(role) 
                                ? "bg-indigo-50 border-indigo-200 dark:bg-indigo-900/20 dark:border-indigo-800" 
                                : "border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                        )}
                    >
                        <span className={cn(
                            "text-sm font-medium flex items-center gap-2",
                            selectedRoles.includes(role) ? "text-indigo-700 dark:text-indigo-300" : "text-gray-700 dark:text-gray-300"
                        )}>
                            {role === 'admin' && <Shield className="w-4 h-4" />}
                            {formatRole(role)}
                        </span>
                        
                        <div className={cn(
                            "w-5 h-5 rounded-full border flex items-center justify-center transition-colors",
                            selectedRoles.includes(role)
                                ? "bg-indigo-600 border-indigo-600"
                                : "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                        )}>
                            {selectedRoles.includes(role) && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                        </div>

                        <input 
                            type="checkbox" 
                            className="hidden"
                            checked={selectedRoles.includes(role)}
                            onChange={() => toggleRole(role)}
                        />
                    </label>
                ))}
            </div>

            <div className="flex justify-end gap-3 pt-2">
                <button
                    onClick={() => setEditingProfile(null)}
                    className="px-6 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
                >
                    Abbrechen
                </button>
                <button
                    onClick={saveRoles}
                    className="px-6 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-lg shadow-indigo-500/30 transition-all hover:scale-[1.02]"
                >
                    Speichern
                </button>
            </div>
        </div>
      </Modal>
    </div>
  );
};
