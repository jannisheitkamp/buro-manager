export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  agency_number?: string | null;
  phone_extension?: string | null; // New
  todoist_api_key?: string | null; // New
  avatar_url: string | null;
  roles: string[];
  address?: string | null;
  is_approved?: boolean;
  phone?: string | null;
  created_at: string;
};

export type Parcel = {
  id: string;
  recipient_id: string;
  created_by: string;
  carrier: string | null;
  tracking_number?: string | null; // New
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
  status: 'office' | 'remote' | 'break' | 'meeting' | 'vacation' | 'sick' | 'off' | 'seminar';
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
  type: 'vacation' | 'sick_leave' | 'other' | 'seminar' | 'school';
  start_date: string;
  end_date: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  profiles?: Profile;
  note?: string; // New: Reason for 'other'
  is_recurring?: boolean; // New: For 'school'
  recurrence_interval?: 'weekly' | 'biweekly' | 'monthly'; // New
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

export type Document = {
  id: string;
  title: string;
  content: string | null;
  file_path: string | null;
  file_type: 'text' | 'file';
  created_by: string;
  created_at: string;
  updated_at: string;
  creator?: Profile;
  shares?: DocumentShare[];
};

export type DocumentShare = {
  id: string;
  document_id: string;
  user_id: string;
  created_at: string;
  profile?: Profile;
};

export type ProductionEntry = {
  id: string;
  user_id: string;
  managed_by: string | null;
  submission_date: string;
  policy_number: string | null;
  customer_name: string;
  customer_firstname: string | null;
  category: string;
  sub_category: string | null;
  start_date: string | null;
  payment_method: string | null;
  duration: number | null;
  net_premium: number | null;
  gross_premium: number | null;
  commission_rate: number | null;
  valuation_sum: number | null;
  commission_amount: number | null;
  liability_rate: number | null;
  status: 'submitted' | 'policed' | 'cancelled';
  policing_date: string | null;
  commission_received_date: string | null;
  notes: string | null;
  created_at: string;
  profiles?: Profile; // The closer (user_id)
  manager?: Profile; // The manager (managed_by)
};
