# Büro Manager 🏢

Ein modernes, webbasiertes Büro-Management-System für Versicherungsmakler und Agenturen. Entwickelt mit React, Tailwind CSS, Supabase und TypeScript.

![Status](https://img.shields.io/badge/Status-Production%20Ready-green)
![Tech](https://img.shields.io/badge/Tech-React%20%7C%20Supabase%20%7C%20Tailwind-blue)

## 🚀 Features

*   **Dashboard:** Echtzeit-Überblick über Aufgaben, Team-Status und Umsatz-Trends.
*   **Produktion & Umsatz:** Erfassung von Anträgen, automatische Berechnung von Provisionseinheiten (EH) und interaktive Diagramme.
*   **Kalender:** Team-Kalender mit Drag & Drop, Wochenansicht und Kategorien.
*   **Rückruf-Manager:** Aufgabenverwaltung für Telefonate mit Priorisierung.
*   **Logistik:** Tracking von Paketen im Büro.
*   **Verzeichnis:** Mitarbeiter-Liste mit Live-Status (Im Büro, Home Office, Krank...) und Visitenkarten.
*   **Schwarzes Brett:** Interne News und Ankündigungen.
*   **Notification Center:** Benachrichtigungen über neue Pakete, Aufgaben oder News.
*   **Command Palette (`Cmd+K`):** Blitzschnelle Navigation und Suche nach Kollegen.
*   **Mobile Optimized:** Vollständig responsive Design mit Glassmorphism-Look.

## � Tech Stack

*   **Frontend:** React (Vite), TypeScript
*   **Styling:** Tailwind CSS, Framer Motion (Animationen)
*   **Icons:** Lucide React
*   **Charts:** Recharts
*   **Backend:** Supabase (PostgreSQL, Auth, Realtime, RLS)
*   **Deployment:** Vercel (empfohlen)

## 📦 Installation & Setup

### 1. Repository klonen
```bash
git clone https://github.com/jannisheitkamp/buro-manager.git
cd buro-manager
npm install
```

### 2. Environment Variables
Erstelle eine `.env` Datei im Hauptverzeichnis:

```env
VITE_SUPABASE_URL=deine_supabase_url
VITE_SUPABASE_ANON_KEY=dein_supabase_anon_key
```

### 3. Datenbank Setup (Supabase)
Gehe in dein Supabase Dashboard -> SQL Editor und führe das Skript unter `supabase/migrations/20240107_init_full_schema.sql` aus.
Dies erstellt:
*   Alle Tabellen (`profiles`, `production_entries`, etc.)
*   Row Level Security (RLS) Policies für Datenschutz
*   Trigger und Relationen

### 4. Starten
```bash
npm run dev
```
Die App läuft unter `http://localhost:5173`.

## 🔒 Sicherheit & Datenschutz

*   **RLS (Row Level Security):** Alle Daten sind auf Datenbank-Ebene geschützt. Nutzer sehen nur Daten, für die sie berechtigt sind.
*   **Auth:** Authentifizierung läuft über Supabase Auth.
*   **Provisionen:** Provisionssätze sind privat und nur vom jeweiligen Nutzer einsehbar.

## 📱 Deployment

Das Projekt ist optimiert für **Vercel**:
1.  Repo mit Vercel verbinden.
2.  Environment Variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) in Vercel eintragen.
3.  Deploy klicken.

---

Built with ❤️ by Jannis & Trae AI.
