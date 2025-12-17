# Büro Manager

Eine moderne Office-Management-Anwendung für Teams, entwickelt mit React, TypeScript, Vite, Tailwind CSS und Supabase.

## 🚀 Schnellstart: Veröffentlichung & Installation

Wie du die App online bringst und auf dein Handy lädst, findest du detailliert in der Datei [DEPLOYMENT.md](./DEPLOYMENT.md).

## Funktionen

### 🏠 Dashboard
- **Echtzeit-Statusübersicht**: Sehen Sie auf einen Blick, wer im Büro, im Homeoffice, im Meeting oder abwesend ist.
- **Benutzerdefinierte Status**: Setzen Sie Ihren eigenen Status mit optionalen Nachrichten.
- **Automatische Updates**: Alle Änderungen werden dank Supabase Realtime sofort bei allen Kollegen angezeigt.

### 📅 Kalender & Abwesenheiten
- **Urlaubsanträge**: Beantragen Sie Urlaub, Krankheitstage oder Sonderurlaub.
- **PDF-Export**: Generieren Sie automatisch ausgefüllte Urlaubsanträge als PDF (inkl. Unterschriftsfelder) mit einem Klick.
- **Genehmigungsworkflow**: Admins und berechtigte Personen können Anträge genehmigen oder ablehnen.
- **Übersicht**: Sehen Sie alle genehmigten und ausstehenden Abwesenheiten.

### 📍 Raumbuchung
- **Ressourcenverwaltung**: Buchen Sie Besprechungsräume und andere Ressourcen.
- **Konfliktprüfung**: Das System verhindert automatisch Doppelbuchungen (Server-seitig abgesichert).
- **Kalenderansicht**: Übersichtliche Darstellung aller Buchungen pro Tag.

### 📌 Schwarzes Brett
- **Ankündigungen & Aufgaben**: Posten Sie Neuigkeiten oder Aufgaben für das Team.
- **Typisierung**: Unterscheidung zwischen wichtigen Ankündigungen (blau) und Aufgaben (grün).

### 👥 Mitarbeiter-Verzeichnis
- **Kontaktliste**: Alle Kollegen mit E-Mail und Status auf einen Blick.
- **Rollenverwaltung**: Admins können Benutzerrollen (z.B. Mitarbeiter, Admin, Gruppenleiter) verwalten.

### 👤 Profil
- **Personalisierung**: Ändern Sie Ihren Namen und Ihr Avatar-Bild.
- **Adressdaten**: Hinterlegen Sie Ihre Adresse für die automatische Befüllung von Formularen.

### 📱 Technik & Design
- **Responsive Design**: Optimiert für Desktop, Tablet und Smartphone.
- **Dark Mode**: Vollständige Unterstützung für helles und dunkles Design.
- **Modern UI**: Gebaut mit Tailwind CSS für ein sauberes und konsistentes Aussehen.
- **Sicherheit**: Row Level Security (RLS) in der Datenbank sorgt dafür, dass Daten geschützt sind.
- **PWA Support**: Installierbar als App auf iOS, Android und Desktop.

## Installation & Setup (für Entwickler)

1. **Repository klonen**
2. **Abhängigkeiten installieren**:
   ```bash
   npm install
   ```
3. **Umgebungsvariablen setzen**:
   Erstellen Sie eine `.env` Datei basierend auf Ihren Supabase-Credentials:
   ```env
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```
4. **Entwicklungsserver starten**:
   ```bash
   npm run dev
   ```

## Datenbank-Migrationen

Die Datenbankstruktur wird über Supabase Migrations verwaltet. Alle SQL-Dateien befinden sich im Ordner `supabase/migrations`.
