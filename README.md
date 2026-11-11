# Termed Fitness

Web-App fürs Handy. Sie macht aus den Trainings- und Ernährungsplänen von RicFit (PDF oder Word) einen interaktiven Plan. Auf dem iPhone in Safari öffnen, dann Teilen und „Zum Home-Bildschirm“. Danach startet sie ohne Browserleiste wie eine normale App.

## Was die App macht

- Liest Trainingspläne von Phase 1 bis Phase 8 auf dem Handy ein: Tage, Blöcke, Werte für Woche 1 bis 4 und die Vimeo-Links.
- Führt Übung für Übung durchs Workout, mit animierter Grafik, deutscher Anleitung, Video, Timer und Pausen zwischen den Runden.
- Bei jeder Übung trägst du die geschafften Wiederholungen ein, bei Übungen mit Gewicht auch die Kilo. Die App zeigt den Wert vom letzten Mal.
- Nach dem Workout gibst du die Anstrengung (RPE 1 bis 10) an, schreibst eine Notiz und machst ein Foto. Unter „Fortschritt“ vergleichst du das erste und das neueste Foto.
- Laufeinheiten, Fußball, Recovery und Stretching sind eigene Einheiten. Im Wochenplan legst du fest, was an welchem Tag ansteht. Jeden Sonntag fragt die App nach Teamtraining und Spiel.
- Ernährung aus dem PDF: Mahlzeiten pro Tag, Shakes bis zum Kalorienziel, Wasser, Kreatin, Einkaufsliste.
- Für die nächste Phase lädst du einfach das neue Dokument hoch. Workouts, Wochenplan und Ziele werden neu aufgebaut, der Verlauf bleibt.
- Apple Health kommt über einen Kurzbefehl dazu (Schlaf, Schritte, Ruhepuls), Erinnerungen über den Kalender.

## Datenschutz

Die Pläne sind vertraulich und gehören RicFit LLC. Sie liegen nicht in diesem Repository. Die App liest sie auf dem Gerät ein und speichert alles in IndexedDB auf diesem Handy. Es gehen keine Daten an einen Server, nur die Videos laden von Vimeo oder YouTube.

## Lokal starten

```bash
python3 -m http.server 5180 --bind 127.0.0.1
```

Dann http://127.0.0.1:5180 öffnen. Liegen `training.pdf` und `nutrition.pdf` im Ordner `_private/` (steht in `.gitignore`), lädt der Link „Test-PDFs aus _private laden“ beide direkt.

Tests:

```bash
cd tools && npm install && node --test run-tests.mjs
```

Die Tests mit echten Plänen laufen nur, wenn die Dateien in `_private/` liegen.

## Aufbau

Kein Build-Schritt, nur ES-Module. `js/parse-training.js` und `js/parse-nutrition.js` machen aus dem Text den Plan, `js/docx-text.js` liest Word-Dateien, `js/workout.js` ist der Workout-Modus, `js/run.js` die Läufe und übrigen Einheiten. PDF.js, Schriften und Icons liegen in `vendor/` und `js/icons.js`, damit die App auch offline läuft.
