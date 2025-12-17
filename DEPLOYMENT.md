# Veröffentlichung und Installation

Um die App für alle Kollegen verfügbar zu machen, müssen wir sie "hosten" (ins Internet stellen) und als App installierbar machen.

## Schritt 1: Veröffentlichung (Hosting)

Der einfachste Weg ist **Vercel** (kostenlos und schnell).

1.  Erstelle einen Account auf [vercel.com](https://vercel.com).
2.  Installiere die Vercel CLI (optional) oder lade den Code auf GitHub hoch.
    *   *Empfohlen:* Lade diesen Ordner auf GitHub hoch.
    *   Verbinde Vercel mit deinem GitHub-Account und wähle das Repository aus.
3.  **Wichtig:** Setze die Umgebungsvariablen in Vercel!
    *   Gehe in Vercel auf **Settings** > **Environment Variables**.
    *   Füge die gleichen Werte hinzu, die in deiner `.env` Datei stehen:
        *   `VITE_SUPABASE_URL`: (Dein Wert)
        *   `VITE_SUPABASE_ANON_KEY`: (Dein Wert)
4.  Klicke auf **Deploy**.

Nach kurzer Zeit erhältst du eine URL (z.B. `https://buro-manager.vercel.app`). Diese kannst du an dein Team schicken.

## Schritt 2: Installation auf dem Handy (App)

Dank der PWA-Technologie (Progressive Web App) kann die Webseite wie eine echte App installiert werden.

### iPhone (iOS)
1.  Öffne die URL in **Safari**.
2.  Tippe unten auf den **Teilen-Button** (Viereck mit Pfeil nach oben).
3.  Scrolle nach unten und wähle **"Zum Home-Bildschirm"**.
4.  Tippe auf "Hinzufügen".
5.  Die App erscheint nun als Icon auf deinem Home-Screen.

### Android (Chrome)
1.  Öffne die URL in **Chrome**.
2.  Tippe oben rechts auf die **drei Punkte**.
3.  Wähle **"App installieren"** oder **"Zum Startbildschirm hinzufügen"**.
4.  Bestätige mit "Installieren".

## Schritt 3: Installation auf dem PC/Mac

1.  Öffne die URL in **Chrome** oder **Edge**.
2.  In der Adressleiste erscheint rechts ein kleines **Monitor/Download-Symbol**.
3.  Klicke darauf und wähle **"Installieren"**.
4.  Die App öffnet sich in einem eigenen Fenster und kann wie ein normales Programm gestartet werden (auch über Spotlight/Startmenü).
