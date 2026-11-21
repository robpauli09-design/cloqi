# Lokaler Datenimport

Der geführte Import ist für JuliaSommer und SarahBerger unter **Daten importieren** und **Prozesse → Daten importieren** erreichbar. Sarahs Bereich bleibt Verpackung. Mitarbeiterkonten erhalten keinen Importzugriff. Das sind die bestehenden lokalen Prototyp-Rollen, keine Sicherheitsgrenze für echte Mehrbenutzerdaten.

## Ablauf

1. Bereich und Prozessname festlegen.
2. Dateien auswählen oder hineinziehen. Alternativ einen Exportplan für Microsoft 365, Datenbanken oder REST/OData vorbereiten. „Ich weiß es nicht“ fragt nach ERP, CRM und Dokumentenablage.
3. Automatisch vorgeschlagene Spaltenzuordnung und Zeilen prüfen. Vorgangs-ID, Aktivität und Zeitpunkt sind bei Tabellen Pflicht. Fehlerhafte Zeilen werden nur nach ausdrücklicher Auswahl ausgelassen. Identische Ereignisse werden innerhalb des Imports zusammengeführt.
4. Freigaben, Ausnahmen, Alltagshindernisse und Zielzeiten als Kontext ergänzen.
5. Vorschau mit Ereigniszahlen, Varianten, häufigstem Ablauf, Zeitabständen und Datenbereitschaft prüfen und ausdrücklich lokal speichern.

Gespeicherte Importe erscheinen unter Prozesse, enthaltene Dokumente zusätzlich unter Wissen. Die Originaldateien werden nicht aufbewahrt, nur normalisierte Ereignisse, extrahierter Dokumenttext, Herkunft und bestätigter Kontext. Ein erneuter Import wird als eigener Datensatz gespeichert. Ein synthetischer Testimport kann lokal vorhanden sein.

## Unterstützte Dateien

- CSV: UTF-8, Komma/Semikolon/Tab, Anführungszeichen und mehrzeilige Zellen.
- XLSX: sichtbare Tabellenblätter, erste nicht leere Zeile als Kopfzeile; Datumszellen werden normalisiert. Formeln werden nicht ausgeführt. Alte XLS-Dateien vorher als XLSX/CSV speichern.
- JSON: flache Liste von Objekten. Keine verschachtelten Objekte.
- PDF: extrahierbarer Text, maximal 100 Seiten; keine OCR für Scans, keine verschlüsselten Dokumente ohne zugänglichen Text.
- DOCX und TXT: Text als Unternehmenswissen, keine automatische Erfindung von Ereignissen aus Dokumenten.

Grenzen: 8 MB pro Datei, 10 Dateien/Tabellenblätter, insgesamt 10.000 Ereigniszeilen, 80 Spalten pro Tabelle, 200.000 Zeichen pro Dokument. Office-Archive werden vor dem Entpacken anhand ihres Verzeichnisses auf 40 MB und 3.000 Einträge begrenzt. Das ersetzt keine gehärtete Sandbox für untrusted Enterprise-Dokumente.

Datumsfelder: ISO mit Offset wird nach UTC normalisiert. Ohne Offset wird UTC angenommen und in der Zuordnung offengelegt. Tag/Monat-Reihenfolge ist wählbar; ungültige Kalendertage werden zurückgewiesen. Kosten erwarten EUR, entweder Punkt als Dezimaltrennzeichen oder deutsche Komma-/Tausendernotation.

## Daten und Grenzen

Die Verarbeitung geschieht im Browser. Keine Importdaten werden an den KI-Server, Supabase oder andere Server übertragen. IndexedDB `cloqi-imports` speichert pro Prototyp-Benutzer. Browserdaten löschen entfernt die Importe; andere Geräte erhalten sie nicht. Die Quelldateien bleiben bis zur Bestätigung nur im Arbeitsspeicher. Nicht gespeicherte Entwürfe gehen beim Verlassen/Neuladen verloren.

Optionale Pseudonymisierung ersetzt ausschließlich die zugeordnete Personen-/Rollenspalte durch importlokale IDs. Sie anonymisiert keine Dokumente, Vorgangs-IDs oder Freitexte.

Automapping nutzt feste deutsche/englische Spaltennamen, kein LLM. Prozessvarianten entstehen aus je Vorgang zeitlich sortierten Ereignissen. Zeitabstände sind keine nachgewiesenen Wartezeiten, Arbeitszeiten oder Ursachen. Datenbereitschaft ist der gleich gewichtete Mittelwert aus sechs offengelegten Informationsbereichen; sie behauptet keine vollständige Abdeckung der realen Betriebsprozesse. Rollen, Systeme und Kosten verwenden tatsächliche Feldfüllraten.

Ein produktiver Local Data Gateway, OAuth-Connectoren, SQL-Abfragen, REST/OData-Abrufe, SharePoint-Synchronisierung, OCR, BPMN, ein vollständiger objektzentrierter Knowledge Graph und lokale LLM-Optimierung sind **noch nicht implementiert**. Die Quellkarten erstellen einen Exportplan; sie fragen keine Zugangsdaten ab und stellen keine Verbindung her. Der vorhandene KI-Chat erhält die importierten Unternehmensdaten nicht automatisch.

## Technischer Aufbau und Prüfung

- `src/imports/model.ts`: gemeinsames Importmodell, Erkennung, Normalisierung und Kennzahlen.
- `src/imports/parsers.ts`: dynamisch geladene Datei-Parser; Tabellen und Dokumente werden unterschiedlich eingelesen und danach einheitlich übergeben.
- `src/imports/store.ts`: explizite Speicherung mit Fehlerbehandlung in IndexedDB.
- `src/imports/ImportFlow.tsx`: fünf Schritte, Vorschau und Bibliothek; `imports.css`: responsive CLOQI-Gestaltung.
- `test/imports.test.ts`: CSV-Sonderfälle, Mapping, Dubletten, ungültige Datumswerte, Varianten, Rollen und echte XLSX-/DOCX-Dateien. Synthetische Fixtures unter `test/fixtures/imports` enthalten keine Kundendaten.

Parser-Grundlagen: [ExcelJS](https://github.com/exceljs/exceljs), [Mammoth](https://github.com/mwilliamson/mammoth.js), [PDF.js](https://mozilla.github.io/pdf.js/getting_started/). Die Parser werden erst beim jeweiligen Dateiimport geladen; ihre größeren separaten Bundles sind im Build sichtbar.
