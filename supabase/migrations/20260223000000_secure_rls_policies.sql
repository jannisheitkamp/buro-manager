-- Secure RLS Policies (Remove public/anon access)

-- 1. Profiles
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Profiles are viewable by authenticated users" 
ON public.profiles FOR SELECT 
TO authenticated 
USING (true);

-- 2. User Status
DROP POLICY IF EXISTS "Status is viewable by everyone" ON public.user_status;
CREATE POLICY "Status is viewable by authenticated users" 
ON public.user_status FOR SELECT 
TO authenticated 
USING (true);

-- 3. Bookings
DROP POLICY IF EXISTS "Bookings are viewable by everyone" ON public.bookings;
CREATE POLICY "Bookings are viewable by authenticated users" 
ON public.bookings FOR SELECT 
TO authenticated 
USING (true);

-- 4. Absences
DROP POLICY IF EXISTS "Absences are viewable by everyone" ON public.absences;
CREATE POLICY "Absences are viewable by authenticated users" 
ON public.absences FOR SELECT 
TO authenticated 
USING (true);

-- 5. Posts
DROP POLICY IF EXISTS "Posts are viewable by everyone" ON public.posts;
CREATE POLICY "Posts are viewable by authenticated users" 
ON public.posts FOR SELECT 
TO authenticated 
USING (true);

-- 6. Callbacks
DROP POLICY IF EXISTS "Everyone can view callbacks" ON public.callbacks;
CREATE POLICY "Callbacks are viewable by authenticated users" 
ON public.callbacks FOR SELECT 
TO authenticated 
USING (true);

-- Secure Callbacks Update/Delete (was strict true for everyone)
DROP POLICY IF EXISTS "Authenticated users can update callbacks" ON public.callbacks;
CREATE POLICY "Authenticated users can update callbacks" 
ON public.callbacks FOR UPDATE 
TO authenticated 
USING (true); -- Keep team-wide edit for now, but restrict to authenticated

DROP POLICY IF EXISTS "Authenticated users can delete callbacks" ON public.callbacks;
CREATE POLICY "Authenticated users can delete callbacks" 
ON public.callbacks FOR DELETE 
TO authenticated 
USING (true); -- Keep team-wide delete for now, but restrict to authenticated

-- 7. Parcels
DROP POLICY IF EXISTS "Everyone can view parcels" ON public.parcels;
CREATE POLICY "Parcels are viewable by authenticated users" 
ON public.parcels FOR SELECT 
TO authenticated 
USING (true);

-- 8. Phone Calls
-- Drop insecure policies from previous migrations
DROP POLICY IF EXISTS "Public Insert" ON public.phone_calls;
DROP POLICY IF EXISTS "Public Select" ON public.phone_calls;
DROP POLICY IF EXISTS "Phone calls insertable by everyone" ON public.phone_calls;
DROP POLICY IF EXISTS "Phone calls viewable by everyone" ON public.phone_calls;
DROP POLICY IF EXISTS "Users can view all calls" ON public.phone_calls;

-- Create strict policies (Authenticated only)
CREATE POLICY "Phone calls viewable by authenticated users" 
ON public.phone_calls FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Phone calls insertable by authenticated users" 
ON public.phone_calls FOR INSERT 
TO authenticated 
WITH CHECK (true);

CREATE POLICY "Phone calls updatable by authenticated users" 
ON public.phone_calls FOR UPDATE 
TO authenticated 
USING (true);

CREATE POLICY "Phone calls deletable by authenticated users" 
ON public.phone_calls FOR DELETE 
TO authenticated 
USING (true);

-- 9. Polls
DROP POLICY IF EXISTS "Everyone can view polls" ON public.polls;
CREATE POLICY "Polls viewable by authenticated users" 
ON public.polls FOR SELECT 
TO authenticated 
USING (true);

DROP POLICY IF EXISTS "Everyone can view options" ON public.poll_options;
CREATE POLICY "Poll_options viewable by authenticated users" 
ON public.poll_options FOR SELECT 
TO authenticated 
USING (true);

DROP POLICY IF EXISTS "Everyone can view votes" ON public.poll_votes;
CREATE POLICY "Poll_votes viewable by authenticated users" 
ON public.poll_votes FOR SELECT 
TO authenticated 
USING (true);

-- 10. Calendar Events
DROP POLICY IF EXISTS "Team calendar" ON public.calendar_events;
CREATE POLICY "Calendar events viewable by authenticated users" 
ON public.calendar_events FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Calendar events insertable by authenticated users" 
ON public.calendar_events FOR INSERT 
TO authenticated 
WITH CHECK (true);

CREATE POLICY "Calendar events updatable by authenticated users" 
ON public.calendar_events FOR UPDATE 
TO authenticated 
USING (true);

CREATE POLICY "Calendar events deletable by authenticated users" 
ON public.calendar_events FOR DELETE 
TO authenticated 
USING (true);

-- 11. Board Messages
DROP POLICY IF EXISTS "Read board" ON public.board_messages;
CREATE POLICY "Board messages viewable by authenticated users" 
ON public.board_messages FOR SELECT 
TO authenticated 
USING (true);
