-- Interne Prüffunktionen nur für angemeldete Nutzer (werden in den Dokument-Policies gebraucht).
-- Funktionen sind in Postgres standardmäßig für PUBLIC ausführbar, daher dort entziehen.
revoke execute on function public.check_is_document_creator(uuid) from public, anon;
revoke execute on function public.check_is_document_shared(uuid) from public, anon;
revoke execute on function public.is_document_creator(uuid, uuid) from public, anon;

grant execute on function public.check_is_document_creator(uuid) to authenticated;
grant execute on function public.check_is_document_shared(uuid) to authenticated;
grant execute on function public.is_document_creator(uuid, uuid) to authenticated;
