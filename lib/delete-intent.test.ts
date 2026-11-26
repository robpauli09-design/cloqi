import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wantsDelete } from './delete-intent.ts';

test('everyday ways of cancelling count as asking to delete', () => {
  for (const m of [
    'Lösch den Termin morgen', 'Heute kein sport', 'Plane mir bis Samstag nichts ein zum lernen', 'Das Training fällt aus',
    'sag das Treffen ab', 'mach mir den Freitag frei', 'ich will heute nicht lernen', 'streich den Lernblock', 'Ja lösche die lerneinträge',
  ]) assert.equal(wantsDelete(m), true, m);
});

test('negations and unrelated messages do not', () => {
  for (const m of [
    'Nein', 'nicht löschen', 'Bitte nichts entfernen', 'lösch das bitte nicht', "don't delete it", 'Freie Zeit diese Woche',
    'Was steht morgen an?', 'Ich habe nichts geplant, schlag mir was vor', 'Trag mir Training am Dienstag ein',
  ]) assert.equal(wantsDelete(m), false, m);
});
