import 'server-only';
// Read-only web access for CLOQI AI – without a commercial search provider:
//  • web_suchen: Wikipedia's own free search API (German first, English as fallback)
//  • web_lesen:  opens one public web page and returns its plain text in short parts
//
// Safety: only http(s) on the default ports, every address (and every redirect) is resolved first and
// private/internal networks are refused (no access to localhost, cloud metadata, the database …).
// Pages are size-limited; their text is DATA for the AI, never instructions (see lib/ai.ts "untrusted").
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { htmlToText } from './text';

const PART = 3000;
const MAX_BYTES = 2_000_000;
const UA = 'CLOQI-Lernassistent/1.0 (+https://cloqi.vercel.app)';

function privateV4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224 || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
}
function privateIp(ip: string): boolean {
  if (isIP(ip) === 4) return privateV4(ip);
  const v6 = ip.toLowerCase();
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return privateV4(mapped[1]);
  return v6 === '::' || v6 === '::1' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe8') || v6.startsWith('fe9')
    || v6.startsWith('fea') || v6.startsWith('feb') || v6.startsWith('ff') || v6.startsWith('64:ff9b');
}

/** Throws unless the URL is a public http(s) address on a default port. */
export async function checkPublicUrl(raw: string): Promise<URL> {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { throw new Error('Das ist keine gültige Internetadresse.'); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('Nur http- und https-Adressen.');
  if (u.port && u.port !== '80' && u.port !== '443') throw new Error('Diese Adresse ist nicht erlaubt.');
  if (u.username || u.password) throw new Error('Adressen mit Zugangsdaten sind nicht erlaubt.');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (/^(localhost|.*\.local|.*\.internal|.*\.lan)$/i.test(host)) throw new Error('Diese Adresse ist nicht erlaubt.');
  const ips = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => { throw new Error('Diese Seite gibt es nicht.'); })).map(a => a.address);
  if (!ips.length || ips.some(privateIp)) throw new Error('Diese Adresse ist nicht erlaubt.');
  return u;
}

async function fetchPublic(raw: string): Promise<{ url: string; type: string; body: string }> {
  let url = await checkPublicUrl(raw);
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(12000), headers: { 'User-Agent': UA, Accept: 'text/html,text/plain,application/json;q=0.8' } });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = await checkPublicUrl(new URL(res.headers.get('location')!, url).toString()); // every redirect is checked again
      continue;
    }
    if (!res.ok) throw new Error(`Die Seite antwortet mit Fehler ${res.status}.`);
    const type = res.headers.get('content-type') ?? '';
    if (!/text\/html|text\/plain|application\/json|application\/xhtml/.test(type)) {
      throw new Error(type.includes('pdf') ? 'PDFs aus dem Internet kann ich noch nicht lesen – lade das PDF im Chat hoch.' : 'Diese Art von Datei kann ich nicht lesen.');
    }
    // read at most MAX_BYTES
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) { await reader.cancel(); break; }
      chunks.push(value);
    }
    const body = new TextDecoder().decode(Buffer.concat(chunks.map(c => Buffer.from(c))));
    return { url: url.toString(), type, body };
  }
  throw new Error('Zu viele Weiterleitungen.');
}

/** Opens a public page and returns part `part` of its readable text. */
export async function readWebPage(raw: string, part = 1) {
  const page = await fetchPublic(raw);
  const title = page.type.includes('html') ? (page.body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim() : '';
  // keep the main content if the page marks it; drop menus, headers, footers
  const main = page.body.match(/<(main|article)[\s\S]*?<\/\1>/i)?.[0] ?? page.body;
  const text = page.type.includes('html')
    ? htmlToText(main.replace(/<(nav|header|footer|aside|form)[\s\S]*?<\/\1>/gi, ''))
    : page.body.slice(0, 200_000);
  const parts = Math.max(1, Math.ceil(text.length / PART));
  const n = Math.min(Math.max(1, Math.floor(part) || 1), parts);
  return { url: page.url, title: htmlToText(title).slice(0, 200), part: n, parts, text: text.slice((n - 1) * PART, n * PART) || '(keine lesbaren Inhalte)' };
}

/** Wikipedia's free search API – no third-party search engine, no tracking. */
export async function searchWeb(query: string) {
  const q = query.trim().slice(0, 150);
  if (!q) throw new Error('Leere Suche.');
  const run = async (lang: string) => {
    const url = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srlimit=5&format=json&utf8=1&srsearch=${encodeURIComponent(q)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': UA } });
    if (!res.ok) return [];
    const data = await res.json() as { query?: { search?: { title: string; snippet: string }[] } };
    return (data.query?.search ?? []).map(h => ({
      title: h.title, snippet: htmlToText(h.snippet).slice(0, 220),
      url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(h.title.replace(/ /g, '_'))}`,
    }));
  };
  const de = await run('de');
  const results = de.length ? de : await run('en');
  return { results, hint: results.length ? 'Mit web_lesen(url) einen Treffer lesen. Quellen in der Antwort nennen.' : 'Nichts gefunden – anders formulieren oder eine bekannte Lernseite direkt mit web_lesen öffnen.' };
}
