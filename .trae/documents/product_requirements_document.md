# Product Requirements Document (PRD) - Büro Manager

## 1. Introduction
The "Büro Manager" is a web-based application designed for small teams (approx. 10 people) to manage daily office operations. The primary focus is on real-time attendance tracking, allowing employees to easily signal their current status (e.g., In Office, Remote, In a Meeting). Additional features include resource booking, absence management, and internal communication.

## 2. Target Audience
- **Primary Users:** Employees of the office.
- **Admin Users:** Office managers or designated admins who manage settings and approvals.

## 3. Core Features

### 3.1. Real-time Attendance Dashboard (Priority: High)
- **Status Updates:** Users can set their status with a single click.
    - Status Options:
        - 🟢 Im Büro (In Office)
        - 🏠 Home Office / Remote
        - 🟡 Termin (Meeting/Appointment)
        - 🔴 Feierabend (Off Work)
        - 🌴 Urlaub (Vacation)
        - 🤒 Krank (Sick)
- **Overview:** A dashboard showing the current status of all employees in real-time.
- **Status Message:** Option to add a short note (e.g., "Back at 14:00").
- **History:** (Optional) View past attendance logs.

### 3.2. Absence Management (Priority: Medium)
- **Calendar View:** Visual overview of who is away and when.
- **Request System:** Employees can request vacation or other planned absences.
- **Approval Workflow:** Admins or managers can approve/reject requests.

### 3.3. Meeting Room & Resource Booking (Priority: Medium)
- **Resource List:** Meeting rooms, shared desks, or equipment.
- **Booking Calendar:** View availability and book resources.
- **Conflict Prevention:** Prevent double bookings.

### 3.4. Bulletin Board / Schwarzes Brett (Priority: Low)
- **Announcements:** Admins can post office news.
- **Tasks:** Shared office tasks (e.g., "Kitchen Duty").
- **Comments:** Simple interaction on posts.

### 3.5. Employee Directory (Priority: Low)
- **Contact Info:** Phone numbers, emails, and roles.
- **Birthday List:** Upcoming birthdays.

## 4. User Roles & Permissions
- **Employee:**
    - Can update own status.
    - Can book resources.
    - Can request absences.
    - Can view dashboard and directory.
- **Admin:**
    - All Employee permissions.
    - Can manage users (add/remove).
    - Can manage resources (add/edit rooms).
    - Can approve absence requests.

## 5. Non-Functional Requirements
- **Real-time:** Status updates should reflect immediately on other users' screens.
- **Mobile Friendly:** The UI must be responsive for mobile usage.
- **Simplicity:** Minimal clicks to perform frequent actions (like changing status).
- **Language:** German (as requested).

## 6. UI/UX Guidelines
- **Theme:** Clean, professional, modern.
- **Color Coding:** Use colors to represent status (Green for available, Red for unavailable, etc.).
- **Navigation:** Simple sidebar or top bar navigation.
