# Technical Architecture Document - Büro Manager

## 1. Technology Stack
- **Frontend:** React (Vite), TypeScript
- **Styling:** Tailwind CSS, Lucide React (Icons), shadcn/ui (components)
- **State Management:** Zustand
- **Backend / Database:** Supabase
    - **Auth:** Supabase Auth (Email/Password)
    - **Database:** PostgreSQL
    - **Realtime:** Supabase Realtime (for status updates)
    - **Storage:** Supabase Storage (for avatars, optional)

## 2. Database Schema

### 2.1. Tables

#### `profiles` (Public profile data)
- `id` (uuid, references auth.users, PK)
- `email` (text)
- `full_name` (text)
- `avatar_url` (text)
- `role` (text: 'admin', 'employee')
- `created_at` (timestamp)

#### `user_status` (Current status of users)
- `id` (uuid, PK)
- `user_id` (uuid, references profiles.id)
- `status` (text: 'office', 'remote', 'break', 'meeting', 'vacation', 'sick', 'off')
- `message` (text, nullable)
- `updated_at` (timestamp)

#### `bookings` (Resource reservations)
- `id` (uuid, PK)
- `resource_name` (text)
- `user_id` (uuid, references profiles.id)
- `start_time` (timestamp)
- `end_time` (timestamp)
- `title` (text)
- `created_at` (timestamp)

#### `absences` (Vacations and planned leaves)
- `id` (uuid, PK)
- `user_id` (uuid, references profiles.id)
- `type` (text: 'vacation', 'sick_leave', 'other')
- `start_date` (date)
- `end_date` (date)
- `status` (text: 'pending', 'approved', 'rejected')
- `created_at` (timestamp)

#### `posts` (Bulletin board)
- `id` (uuid, PK)
- `user_id` (uuid, references profiles.id)
- `title` (text)
- `content` (text)
- `type` (text: 'announcement', 'task')
- `created_at` (timestamp)

### 2.2. Row Level Security (RLS) Policies
- **profiles:**
    - Read: Public (Authenticated)
    - Update: Users can update their own profile.
- **user_status:**
    - Read: Public (Authenticated)
    - Insert/Update: Users can update their own status.
- **bookings:**
    - Read: Public (Authenticated)
    - Insert/Update/Delete: Users can manage their own bookings. Admins can manage all.
- **absences:**
    - Read: Public (Authenticated)
    - Insert: Users can request for themselves.
    - Update: Users can cancel own pending requests. Admins can approve/reject.
- **posts:**
    - Read: Public (Authenticated)
    - Insert: Authenticated users.
    - Update/Delete: Author or Admin.

## 3. API & Data Access
- Use Supabase JavaScript Client (`@supabase/supabase-js`) for all database interactions.
- Use `useSubscription` (or Supabase's `on` method) for listening to realtime changes in `user_status`.

## 4. Frontend Architecture
- **Router:** `react-router-dom`
- **Store:** `zustand` for global state (user session, current status).
- **Layout:** MainLayout with Sidebar/Navbar.
- **Pages:**
    - `/` (Dashboard - Attendance Board)
    - `/calendar` (Absences)
    - `/bookings` (Rooms)
    - `/board` (Bulletin Board)
    - `/directory` (Employee List)
    - `/profile` (Settings)
    - `/login` (Auth)

## 5. Security
- All database access is protected by RLS.
- Environment variables for Supabase URL and Key.
