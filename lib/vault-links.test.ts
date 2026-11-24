import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractLinks, linkEdges, queryStems, resolveLink, scoreNote, stem } from './vault-links.ts';

test('wiki links resolve like Obsidian', () => {
  assert.deepEqual(extractLinks('Siehe [[mathe]], [[wiki/Mathematik/Brüche.md|Brüche]] und [[log#heute]].'), ['mathe', 'wiki/Mathematik/Brüche.md', 'log']);
  const paths = ['user.md', 'wiki/mathe.md', 'wiki/Mathematik/Brüche.md'];
  assert.equal(resolveLink('mathe', paths), 'wiki/mathe.md');
  assert.equal(resolveLink('Brüche', paths), 'wiki/Mathematik/Brüche.md');
  assert.equal(resolveLink('gibtsnicht', paths), null);
  const edges = linkEdges([{ path: 'user.md', content: '[[mathe]] [[mathe]] [[user]]' }, { path: 'wiki/mathe.md', content: '[[Brüche]]' }, { path: 'wiki/Mathematik/Brüche.md', content: '' }]);
  assert.deepEqual(edges, [{ from: 'user.md', to: 'wiki/mathe.md' }, { from: 'wiki/mathe.md', to: 'wiki/Mathematik/Brüche.md' }]);
});

test('German search: Bruch finds Brüche and Bruchrechnung', () => {
  assert.equal(stem('Brüche'), 'bruch');
  assert.equal(stem('Prüfungen'), 'prufung');
  const s = queryStems('Bruch');
  assert.ok(scoreNote(s, 'wiki/Mathematik/Brüche - Übungstest.md', 'Kürze 12/18') > 0);
  assert.ok(scoreNote(s, 'wiki/mathe.md', 'Die Bruchrechnung fällt mir schwer') > 0);
  assert.equal(scoreNote(s, 'wiki/englisch.md', 'Vokabeln Unit 4'), 0);
  // "pruefung" (ae/oe/ue spelling) finds "Prüfung"
  assert.ok(scoreNote(queryStems('pruefung'), 'x.md', 'Die Prüfung ist am Freitag') > 0);
});
