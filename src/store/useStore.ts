import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { Profile } from '@/types';
import { User as SupabaseUser } from '@supabase/supabase-js';

export interface StoreState {
  user: SupabaseUser | null;
  profile: Profile | null;
  loading: boolean;
  setUser: (user: SupabaseUser | null) => void;
  setLoading: (loading: boolean) => void;
  setProfile: (profile: Profile | null) => void;
  fetchProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useStore = create<StoreState>((set, get) => ({
  user: null,
  profile: null,
  loading: true,
  setUser: (user) => set({ user }),
  setLoading: (loading) => set({ loading }),
  setProfile: (profile) => set({ profile }),
  fetchProfile: async () => {
    const { user } = get();
    if (!user) return;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle(); // Changed to maybeSingle to prevent errors if profile doesn't exist yet

    if (error) {
      console.error('Error fetching profile:', error);
    } else {
      set({ profile: data });
    }
  },
  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, profile: null });
  },
}));
