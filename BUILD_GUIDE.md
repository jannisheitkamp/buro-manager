# Anleitung: Mac App erstellen (.dmg) 🍎

Hier erfährst du, wie du aus deinem Code eine installierbare Mac-App machst.

## Voraussetzungen
*   Du bist auf einem Mac.
*   Du hast `npm install` bereits ausgeführt.

## Schritt-für-Schritt

### 1. Icon prüfen
Ich habe bereits ein Platzhalter-Icon (`public/icon.png`) für dich erstellt (es ist das gleiche wie das Favicon).
*   *Optional:* Wenn du ein eigenes Logo willst, ersetze einfach die Datei `public/icon.png` mit deinem eigenen Bild (am besten PNG, 512x512 Pixel).

### 2. Build starten
Öffne das Terminal im Projektordner und führe aus:

```bash
npm run electron:build
```

**Was passiert jetzt?**
1.  Der Code wird optimiert (`vite build`).
2.  Electron verpackt alles.
3.  Die `.dmg` Datei wird signiert (bzw. unsigniert erstellt, da wir kein Apple Developer Zertifikat hinterlegt haben - das reicht für den Eigenbedarf).

### 3. App installieren
Wenn der Befehl fertig ist (dauert ca. 1-3 Minuten):
1.  Öffne den Finder.
2.  Gehe in den Ordner: `Buro Manager` -> `dist`.
3.  Dort liegt die Datei: `Büro Manager-1.0.0.dmg`.
4.  Doppelklick darauf -> Ziehe die App in den "Programme"-Ordner.

### 4. App starten
Da die App nicht von Apple signiert ist (das kostet $99/Jahr), musst du sie beim **ersten Start** evtl. so öffnen:
1.  Rechtsklick auf die App.
2.  "Öffnen" wählen.
3.  Bestätigen.

Danach startet sie ganz normal per Doppelklick.

Viel Erfolg! 🚀
