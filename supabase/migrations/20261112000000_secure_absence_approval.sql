-- Abwesenheiten: Genehmigen nur durch Admins und Vorgesetzte
--
-- 1. Mitarbeiter können eigene Anträge nur ändern, solange sie offen sind, und sie dabei nicht selbst genehmigen.
-- 2. Neue Anträge sind offen. Ausnahme: Krankmeldung, Seminar und Berufsschule (die App trägt sie direkt als genehmigt ein).
-- 3. Admins dürfen alle Abwesenheiten bearbeiten (bisher fehlte diese Regel, "Genehmigen" lief bei Admins ins Leere).
-- Vorgesetzte behalten ihre bestehende Regel "Supervisors can update supervisee absences".

drop policy if exists "Users can update own pending absences" on public.absences;
create policy "Users can update own pending absences" on public.absences
  for update to authenticated
  using (auth.uid() = user_id and status = 'pending')
  with check (auth.uid() = user_id and status = 'pending');

drop policy if exists "Users can request absences" on public.absences;
create policy "Users can request absences" on public.absences
  for insert to authenticated
  with check (auth.uid() = user_id and (status = 'pending' or type in ('sick_leave', 'seminar', 'school')));

drop policy if exists "Admins can update absences" on public.absences;
create policy "Admins can update absences" on public.absences
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());
