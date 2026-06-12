-- Automatisierte Zuweisung von Badges basierend auf Meilensteinen

CREATE OR REPLACE FUNCTION public.check_and_award_badges()
RETURNS void AS $$
DECLARE
    user_record RECORD;
BEGIN
    -- 1. Badge: "100k Club" (Für über 100.000€ Bewertungssumme gesamt)
    FOR user_record IN 
        SELECT user_id, SUM(valuation_sum) as total_val 
        FROM public.production_entries 
        WHERE status = 'policed'
        GROUP BY user_id
    LOOP
        IF user_record.total_val >= 100000 THEN
            -- Prüfen, ob der Nutzer das Badge bereits hat
            IF NOT EXISTS (SELECT 1 FROM public.user_badges WHERE user_id = user_record.user_id AND badge_name = '100k Club') THEN
                PERFORM public.award_badge(
                    user_record.user_id, 
                    '100k Club', 
                    '🏆', 
                    'yellow', 
                    'Hat insgesamt über 100.000 € Bewertungssumme policiert!'
                );
            END IF;
        END IF;
    END LOOP;

    -- 2. Badge: "Lead-Master" (Für mehr als 50 erfolgreich konvertierte Leads)
    FOR user_record IN 
        SELECT user_id, COUNT(id) as total_leads 
        FROM public.leads 
        WHERE status = 'won'
        GROUP BY user_id
    LOOP
        IF user_record.total_leads >= 50 THEN
            IF NOT EXISTS (SELECT 1 FROM public.user_badges WHERE user_id = user_record.user_id AND badge_name = 'Lead-Master') THEN
                PERFORM public.award_badge(
                    user_record.user_id, 
                    'Lead-Master', 
                    '🎯', 
                    'green', 
                    'Hat erfolgreich 50 Leads in Kunden umgewandelt.'
                );
            END IF;
        END IF;
    END LOOP;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- HINWEIS FÜR SUPABASE:
-- Um diese Funktion automatisch z.B. jede Nacht um 02:00 Uhr auszuführen,
-- kann die pg_cron Extension im Supabase Dashboard aktiviert werden:
-- 
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- SELECT cron.schedule('award_badges_nightly', '0 2 * * *', $$SELECT public.check_and_award_badges();$$);
