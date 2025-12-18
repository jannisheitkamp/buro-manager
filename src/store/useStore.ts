import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { Profile } from '@/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type User = any;

export interface StoreState {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setUser: (user: any) => void;
  setLoading: (loading: boolean) => void;
  setProfile: (profile: Profile | null) => void;
  fetchProfile: () => Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  signOut: () => Promise<any>;
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
      .single();

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
