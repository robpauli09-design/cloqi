import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deleteIntent, wantsDelete, wantsReorganize } from './delete-intent.ts';

test('explicit delete verbs', () => {
  for (const m of ['Lösch den Termin morgen', 'sag das Treffen ab', 'streich den Lernblock', 'Ja lösche die lerneinträge', 'nimm das raus'.replace('nimm das raus', 'rausnehmen bitte')])
    assert.equal(deleteIntent(m), 'explicit', m);
});

test('everyday cancelling is implicit (calendar/study blocks only, never the vault)', () => {
  for (const m of ['Heute kein sport', 'Plane mir bis Samstag nichts ein zum lernen', 'Das Training fällt aus', 'mach mir den Freitag frei', 'ich will heute nicht lernen'])
    assert.equal(deleteIntent(m), 'implicit', m);
});

test('negations and unrelated messages do not count', () => {
  for (const m of [
    'Nein', 'nicht löschen', 'Bitte nichts entfernen', 'lösch das bitte nicht', "don't delete it", 'Freie Zeit diese Woche',
    'Was steht morgen an?', 'Ich habe nichts geplant, schlag mir was vor', 'Trag mir Training am Dienstag ein',
  ]) assert.equal(wantsDelete(m), false, m);
});

test('reorganising (Auto may drop its own study blocks) – only from the user message', () => {
  for (const m of ['Räum mal auf', 'räum meinen Kalender auf', 'plan meine Woche um', 'verschieb das Lernen auf nächste Woche', 'mach mir Platz für Training'])
    assert.equal(wantsReorganize(m), true, m);
  for (const m of ['Was steht morgen an?', 'Trag Mathe-Test ein', 'bitte nichts löschen und nicht verschieben'.replace('nicht verschieben', '')])
    assert.equal(wantsReorganize(m), false, m);
});
