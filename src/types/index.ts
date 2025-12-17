export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  roles: string[];
  address?: string | null;
  created_at: string;
};

export type UserStatus = {
  id: string;
  user_id: string;
  status: 'office' | 'remote' | 'break' | 'meeting' | 'vacation' | 'sick' | 'off';
  message: string | null;
  updated_at: string;
  profiles?: Profile; // Joined profile data
};

export type Booking = {
  id: string;
  resource_name: string;
  user_id: string;
  start_time: string;
  end_time: string;
  title: string;
  created_at: string;
  profiles?: Profile;
};

export type Absence = {
  id: string;
  user_id: string;
  type: 'vacation' | 'sick_leave' | 'other';
  start_date: string;
  end_date: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  profiles?: Profile;
};

export type Post = {
  id: string;
  user_id: string;
  title: string;
  content: string;
  type: 'announcement' | 'task';
  created_at: string;
  profiles?: Profile;
};
