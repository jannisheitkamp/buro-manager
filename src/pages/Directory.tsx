import { useEffect, useState } from 'react';
import { Avatar, PageHeader, IconButton, Segmented, EmptyState } from '@/components/ui';
import { CountUp, HeroPanel } from '@/components/ui/hero';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { PROFILE_COLUMNS } from '@/lib/profiles';
import { Profile, UserStatus } from '@/types';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Mail, Shield, User, Edit, CheckCircle, Clock, RefreshCcw, Briefcase, Home, Coffee, Users, Palmtree, ThermometerSun, LogOut, Copy, X, Phone } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { Modal } from '@/components/Modal';
import { toast } from 'react-hot-toast';
import { cn } from '@/utils/cn';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';

// Feste Rollen; Gruppen (gruppe_...) legt der Admin selbst an
const BASE_ROLES = ['admin', 'employee', 'selbststaendig'];
const ROLE_LABELS: Record<string, string> = { admin: 'Admin', employee: 'Mitarbeiter', selbststaendig: 'Selbstständig' };
const slugGroup = (name: string) =>
  'gruppe_' + name.trim().toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

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
  const [selectedSupervisors, setSelectedSupervisors] = useState<string[]>([]);
  const [newGroup, setNewGroup] = useState('');
  const [view, setView] = useState<'all' | 'pending'>('all');
  const [selectedUser, setSelectedUser] = useState<(Profile & { status?: UserStatus }) | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Aus der Suche (?user=<id>) direkt die Karte der Person öffnen
  useEffect(() => {
      const id = searchParams.get('user');
      if (!id || profiles.length === 0) return;
      const match = profiles.find(p => p.id === id);
      if (match) setSelectedUser(match);
      setSearchParams({}, { replace: true });
  }, [searchParams, profiles, setSearchParams]);

  const fetchProfiles = async () => {
    setLoading(true); 
    try {
      const [profilesRes, statusRes] = await Promise.all([
          supabase.from('profiles').select(PROFILE_COLUMNS).order('full_name', { ascending: true }),
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
    let timeoutId: NodeJS.Timeout;
    const debouncedFetch = () => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            fetchProfiles();
        }, 500);
    };

    fetchProfiles();
    
    // Subscribe to status changes
    const sub = supabase.channel('directory_status')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'user_status' }, debouncedFetch)
        .subscribe();

    return () => { 
        clearTimeout(timeoutId);
        supabase.removeChannel(sub); 
    };
  }, []);

  const handleEditRole = (profile: Profile) => {
    setEditingProfile(profile);
    setSelectedRoles(profile.roles || []);
    setSelectedSupervisors(profile.supervisor_ids || []);
    setNewGroup('');
  };

  const saveRoles = async () => {
    if (!editingProfile) return;

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ roles: selectedRoles, supervisor_ids: selectedSupervisors })
        .eq('id', editingProfile.id);

      if (error) throw error;

      setEditingProfile(null);
      fetchProfiles();
      toast.success('Gespeichert.');
    } catch (error) {
      console.error('Error updating roles:', error);
      toast.error('Fehler beim Speichern der Rollen.');
    }
  };

  const approveUser = async (id: string) => {
      toast((t) => (
          <div className="flex flex-col gap-3 min-w-[200px]">
              <p className="font-bold text-gray-900 dark:text-white">Nutzer freischalten?</p>
              <div className="flex gap-2">
                  <button 
                      onClick={async () => {
                          toast.dismiss(t.id);
                          try {
                              const { error } = await supabase.from('profiles').update({ is_approved: true }).eq('id', id);
                              if (error) throw error;
                              toast.success('Nutzer freigeschaltet!');
                              fetchProfiles();
                          } catch (err) {
                              console.error(err);
                              toast.error('Fehler beim Freischalten.');
                          }
                      }}
                      className="flex-1 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-bold transition-colors"
                  >
                      Ja, freigeben
                  </button>
                  <button 
                      onClick={() => toast.dismiss(t.id)}
                      className="flex-1 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-bold transition-colors"
                  >
                      Abbrechen
                  </button>
              </div>
          </div>
      ), { duration: 5000, position: 'top-center' });
  };

  const toggleRole = (role: string) => {
    setSelectedRoles(prev => 
      prev.includes(role) 
        ? prev.filter(r => r !== role)
        : [...prev, role]
    );
  };

  const formatRole = (role: string) =>
    ROLE_LABELS[role] || role.replace(/^gruppe_/, 'Gruppe ').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  const groupRoles = Array.from(new Set([...profiles.flatMap(p => p.roles || []), ...selectedRoles].filter(r => r.startsWith('gruppe_')))).sort();
  const roleOptions = [...BASE_ROLES, ...groupRoles];

  const addGroup = () => {
    const slug = slugGroup(newGroup);
    if (slug === 'gruppe_') return;
    setSelectedRoles(prev => (prev.includes(slug) ? prev : [...prev, slug]));
    setNewGroup('');
  };

  const toggleSupervisor = (id: string) =>
    setSelectedSupervisors(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

  const pendingCount = profiles.filter(p => !p.is_approved).length;
  
  const filteredProfiles = profiles.filter(p => {
      if (view === 'pending') return !p.is_approved;
      return true; 
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Verzeichnis"
        description="Alle Kolleginnen und Kollegen mit Durchwahl und aktuellem Status."
        actions={
          <>
            <IconButton icon={RefreshCcw} label="Aktualisieren" onClick={fetchProfiles} className={cn(loading && '[&>svg]:animate-spin')} />
            {currentUserProfile?.roles?.includes('admin') && (
              <Segmented
                value={view}
                onChange={(v) => setView(v as typeof view)}
                options={[{ value: 'all', label: 'Alle' }, { value: 'pending', label: 'Freigabe', count: pendingCount }]}
              />
            )}
          </>
        }
      />

      {(() => {
        const approved = profiles.filter(p => p.is_approved);
        const fresh = (p: typeof profiles[number]) => !!p.status?.updated_at && Date.now() - new Date(p.status.updated_at).getTime() < 14 * 3600 * 1000;
        const here = approved.filter(p => fresh(p) && p.status?.status && !['off', 'vacation', 'sick'].includes(p.status.status));
        return (
          <HeroPanel aria-label="Team im Überblick">
            <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
              <div>
                <p className="text-sm text-brand-200">Gerade erreichbar</p>
                <p className="mt-1.5 font-display font-semibold leading-[0.9] tracking-tight">
                  <CountUp value={here.length} className="text-7xl text-emerald-300 sm:text-8xl" />
                  <span className="ml-2 text-3xl text-brand-200 sm:text-4xl">von {approved.length}</span>
                </p>
              </div>
              {here.length > 0 && (
                <ul className="flex flex-wrap items-center gap-3">
                  {here.slice(0, 8).map(p => (
                    <li key={p.id}>
                      <button type="button" onClick={() => setSelectedUser(p)} className="flex items-center gap-2.5 rounded-2xl bg-white/5 py-1.5 pl-1.5 pr-3.5 ring-1 ring-white/10 transition-colors hover:bg-white/10">
                        <span className="relative">
                          <Avatar name={p.full_name} src={p.avatar_url} size="xs" />
                          <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-brand-900" />
                        </span>
                        <span className="text-left">
                          <span className="block text-sm font-semibold leading-tight">{p.full_name?.split(' ')[0]}</span>
                          <span className="block text-2xs text-brand-200">{STATUS_LABELS[p.status!.status] || p.status!.status}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </HeroPanel>
        );
      })()}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        <AnimatePresence>
            {loading ? (
                <div className="col-span-full py-20 text-center text-gray-400">Lade Mitarbeiter...</div>
            ) : filteredProfiles.length === 0 ? (
                <div className="card col-span-full"><EmptyState icon={User} title={view === 'pending' ? 'Niemand wartet auf Freigabe' : 'Noch niemand im Verzeichnis'} /></div>
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
                            className="card group relative flex cursor-pointer flex-col items-center p-6 text-center transition-all duration-300 hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md dark:hover:border-gray-600"
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
                                <div className="absolute inset-0 rounded-full bg-amber-300 opacity-0 blur-xl transition-opacity group-hover:opacity-40" />
                                <Avatar name={profile.full_name} src={profile.avatar_url} size="xl" className={cn(
                                        "w-28 h-28 rounded-full shadow-sm object-cover ring-4 ring-white dark:ring-gray-700 relative z-10",
                                        !profile.is_approved && "grayscale opacity-70"
                                    )} />
                                {/* Status Icon Badge */}
                                <div className={cn(
                                    "absolute bottom-0 right-0 z-20 p-1.5 rounded-full shadow-md border-2 border-white dark:border-gray-800",
                                    statusColor
                                )}>
                                    <StatusIcon className="w-4 h-4" />
                                </div>
                            </div>
                            
                            <h3 className="mb-1 font-display text-xl font-semibold text-gray-900 dark:text-white">
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
                                            ? "bg-brand-50 text-brand-700 border-brand-100 dark:bg-brand-900/40 dark:text-brand-200 dark:border-brand-800" 
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
                      className="absolute inset-0 bg-black/50"
                  />
                  <motion.div 
                      initial={{ opacity: 0, scale: 0.9, y: 20 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: 20 }}
                      className="relative w-full max-w-md bg-white dark:bg-gray-800 rounded-3xl shadow-sm overflow-hidden"
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
                          <Avatar name={selectedUser.full_name} src={selectedUser.avatar_url} size="xl" className="w-32 h-32 rounded-full border-4 border-white dark:border-gray-800 shadow-sm object-cover bg-white" />
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
                              <h3 className="text-xs font-bold text-gray-400 ">Informationen</h3>
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
        title="Rollen & Vorgesetzte"
      >
        <div className="space-y-6">
            <div className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">
                <Avatar name={editingProfile?.full_name} src={editingProfile?.avatar_url} size="md" className="w-12 h-12 rounded-full" />
                <div>
                    <p className="font-bold text-gray-900 dark:text-white">{editingProfile?.full_name}</p>
                    <p className="text-xs text-gray-500">{editingProfile?.email}</p>
                </div>
            </div>

            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Rollen & Gruppen</p>
            <div className="space-y-2 max-h-[400px] overflow-y-auto p-1 -mt-4">
                {roleOptions.map(role => (
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

            <div className="flex gap-2 -mt-2">
                <input
                    value={newGroup}
                    onChange={e => setNewGroup(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addGroup(); } }}
                    placeholder="Neue Gruppe, z. B. Team Nord"
                    className="flex-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                />
                <button onClick={addGroup} disabled={!newGroup.trim()} className="px-4 py-2 rounded-xl text-sm font-semibold bg-gray-100 dark:bg-gray-700 disabled:opacity-50">
                    Hinzufügen
                </button>
            </div>

            <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Vorgesetzte</p>
                <p className="text-xs text-gray-500 mt-1 mb-2">Dürfen Abwesenheiten dieser Person genehmigen und bekommen ihre Anträge.</p>
                <div className="flex flex-wrap gap-2">
                    {profiles.filter(p => p.id !== editingProfile?.id).map(p => {
                        const on = selectedSupervisors.includes(p.id);
                        return (
                            <button
                                key={p.id}
                                type="button"
                                onClick={() => toggleSupervisor(p.id)}
                                aria-pressed={on}
                                className={cn(
                                    "flex items-center gap-2 rounded-full border pl-1 pr-3 py-1 text-sm transition-colors",
                                    on ? "bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/20 dark:border-indigo-800 dark:text-indigo-300"
                                       : "border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                                )}
                            >
                                <Avatar name={p.full_name} src={p.avatar_url} size="xs" />
                                {p.full_name?.split(' ')[0] || p.email}
                                {on && <CheckCircle className="w-3.5 h-3.5" />}
                            </button>
                        );
                    })}
                </div>
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
                    className="px-6 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm transition-all hover:scale-[1.02]"
                >
                    Speichern
                </button>
            </div>
        </div>
      </Modal>
    </div>
  );
};
