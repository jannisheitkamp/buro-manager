import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { Profile } from '@/types';
import { User as SupabaseUser } from '@supabase/supabase-js';

export interface SchoolHoliday {
  start: string;
  end: string;
  name: string;
}

export interface StoreState {
  user: SupabaseUser | null;
  profile: Profile | null;
  schoolHolidays: SchoolHoliday[];
  loading: boolean;
  setUser: (user: SupabaseUser | null) => void;
  setLoading: (loading: boolean) => void;
  setProfile: (profile: Profile | null) => void;
  fetchProfile: () => Promise<void>;
  fetchSchoolHolidays: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useStore = create<StoreState>((set, get) => ({
  user: null,
  profile: null,
  schoolHolidays: [],
  loading: true,
  setUser: (user) => set({ user }),
  setLoading: (loading) => set({ loading }),
  setProfile: (profile) => set({ profile }),
  fetchSchoolHolidays: async () => {
    try {
      const currentYear = new Date().getFullYear();
      const response = await fetch(`https://openholidaysapi.org/SchoolHolidays?countryIsoCode=DE&languageIsoCode=DE&validFrom=${currentYear - 1}-01-01&validTo=${currentYear + 1}-12-31&subdivisionCode=DE-NW`);
      
      if (response.ok) {
          const data = await response.json();
          // Map to match our internal format
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const mappedHolidays = data.map((h: any) => ({
              start: h.startDate,
              end: h.endDate,
              name: h.name?.[0]?.text || 'Schulferien'
          }));
          set({ schoolHolidays: mappedHolidays });
      }
    } catch (error) {
      console.error('Error fetching school holidays:', error);
    }
  },
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
