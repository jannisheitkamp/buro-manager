export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  roles: string[];
  address?: string | null;
  is_approved?: boolean;
  created_at: string;
};

export type Parcel = {
  id: string;
  recipient_id: string;
  created_by: string;
  carrier: string | null;
  location: string;
  status: 'pending' | 'collected' | 'expected';
  collected_at: string | null;
  created_at: string;
  profiles?: Profile; // Recipient profile
};

export type Callback = {
  id: string;
  created_at: string;
  created_by: string;
  customer_name: string;
  phone: string | null;
  topic: string | null;
  priority: 'normal' | 'high';
  status: 'open' | 'in_progress' | 'done';
  assigned_to: string | null;
  completed_at: string | null;
  completed_by: string | null;
  creator?: Profile;
  assignee?: Profile;
  completer?: Profile;
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

export type Poll = {
  id: string;
  created_by: string;
  question: string;
  is_active: boolean;
  created_at: string;
  profiles?: Profile;
  options?: PollOption[];
  votes?: PollVote[];
};

export type PollOption = {
  id: string;
  poll_id: string;
  text: string;
};

export type PollVote = {
  id: string;
  poll_id: string;
  option_id: string;
  user_id: string;
  created_at: string;
};
