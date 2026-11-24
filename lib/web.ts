import 'server-only';
// Read-only web access for CLOQI AI – without a commercial search provider:
//  • web_suchen: Wikipedia's own free search API (German first, English as fallback)
//  • web_lesen:  opens one public web page and returns its plain text in short parts
//
// Safety (SSRF): only http(s) on default ports; every address is parsed numerically (incl. IPv4-mapped,
// IPv4-compatible, NAT64 and 6to4 IPv6 forms) and only global unicast is allowed. The connection is PINNED
// to the address that was checked (custom DNS lookup on the socket) – no DNS rebinding – and every redirect
// goes through the same check. Size and time are limited. Page text is DATA for the AI (see lib/ai.ts).
import { lookup as dnsLookup } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { blockedIp } from './ip';
import { htmlToText } from './text';

const PART = 3000;
const MAX_BYTES = 2_000_000;
const UA = 'CLOQI-Lernassistent/1.0 (+https://cloqi.vercel.app)';

/** DNS lookup for the socket: resolves once, refuses if ANY address is internal, connects only to a checked one. */
const pinnedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { all: true, family: options?.family ?? 0 }, (err, addresses) => {
    if (err) return callback(err, '', 0);
    const list = (addresses as { address: string; family: number }[]) ?? [];
    if (!list.length || list.some(a => blockedIp(a.address))) {
      return callback(Object.assign(new Error('Diese Adresse ist nicht erlaubt.'), { code: 'BLOCKED' }), '', 0);
    }
    if (options?.all) return (callback as unknown as (e: null, a: { address: string; family: number }[]) => void)(null, list);
    callback(null, list[0].address, list[0].family);
  });
};

/** Throws unless the URL is http(s) on a default port with a public host. */
export function checkUrl(raw: string): URL {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { throw new Error('Das ist keine gültige Internetadresse.'); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('Nur http- und https-Adressen.');
  if (u.port && u.port !== '80' && u.port !== '443') throw new Error('Diese Adresse ist nicht erlaubt.');
  if (u.username || u.password) throw new Error('Adressen mit Zugangsdaten sind nicht erlaubt.');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) ? blockedIp(host) : !/\.[a-z]{2,}$/i.test(host) || /(^|\.)(localhost|local|internal|lan|home|corp)$/i.test(host)) {
    throw new Error('Diese Adresse ist nicht erlaubt.');
  }
  return u;
}

// ---------------------------------------------------------------- fetching

interface Got { status: number; location?: string; type: string; body: string }

function getOnce(u: URL): Promise<Got> {
  return new Promise((resolve, reject) => {
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.get(u, {
      lookup: pinnedLookup, timeout: 12000,
      headers: { 'User-Agent': UA, Accept: 'text/html,text/plain,application/json;q=0.8', 'Accept-Encoding': 'identity' },
    }, res => {
      const status = res.statusCode ?? 0;
      const type = String(res.headers['content-type'] ?? '');
      if (status >= 300 && status < 400) { res.resume(); return resolve({ status, location: res.headers.location, type, body: '' }); }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (c: Buffer) => {
        size += c.length;
        if (size > MAX_BYTES) { res.destroy(); return; }
        chunks.push(c);
      });
      res.on('close', () => resolve({ status, type, body: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('Die Seite antwortet nicht.')));
    req.on('error', e => reject((e as { code?: string }).code === 'BLOCKED' ? e : new Error(e.message.includes('nicht erlaubt') ? e.message : 'Diese Seite konnte ich nicht öffnen.')));
  });
}

/** "de.m.wikipedia.org" → "wikipedia.org", "www.bmbwf.gv.at" → "bmbwf.gv.at" (registrable domain, good enough for our sites). */
function site(host: string): string {
  const p = host.toLowerCase().split('.');
  const two = ['gv', 'co', 'ac', 'or', 'com', 'org', 'net', 'edu', 'gov'].includes(p[p.length - 2]) && p.length > 2;
  return p.slice(two ? -3 : -2).join('.');
}

async function fetchPublic(raw: string, opts: { anyRedirect?: boolean } = {}): Promise<{ url: string; type: string; body: string }> {
  let url = checkUrl(raw);
  const home = site(url.hostname);
  for (let hop = 0; hop < 4; hop++) {
    const r = await getOnce(url);
    if (r.location) {
      url = checkUrl(new URL(r.location, url).toString()); // every redirect is checked (and pinned) again
      // pages CLOQI opens on its own may not redirect to another website (open redirects could leak data);
      // links the user sent themselves (e.g. short links) may
      if (!opts.anyRedirect && site(url.hostname) !== home) throw new Error('Die Seite leitet auf eine andere Website weiter – die öffne ich nicht von mir aus. Schick mir den Link direkt.');
      continue;
    }
    if (r.status < 200 || r.status >= 300) throw new Error(`Die Seite antwortet mit Fehler ${r.status}.`);
    if (!/text\/html|text\/plain|application\/json|application\/xhtml/.test(r.type)) {
      throw new Error(r.type.includes('pdf') ? 'PDFs aus dem Internet kann ich noch nicht lesen – lade das PDF im Chat hoch.' : 'Diese Art von Datei kann ich nicht lesen.');
    }
    return { url: url.toString(), type: r.type, body: r.body };
  }
  throw new Error('Zu viele Weiterleitungen.');
}

/** Opens a public page and returns part `part` of its readable text. */
export async function readWebPage(raw: string, part = 1, opts: { anyRedirect?: boolean } = {}) {
  const page = await fetchPublic(raw, opts);
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

// ---------------------------------------------------------------- which pages the AI may open

/** Well-known learning sites the AI may open on its own (query strings are stripped). */
const LEARNING_SITES = [
  'wikipedia.org', 'wikibooks.org', 'wiktionary.org', 'wikiversity.org', 'serlo.org', 'simpleclub.com', 'studyflix.de', 'lernhelfer.de',
  'mathebibel.de', 'mathe-online.at', 'frustfrei-lernen.de', 'duden.de', 'leo.org', 'dict.cc', 'linguee.de', 'britannica.com',
  'khanacademy.org', 'planet-schule.de', 'bpb.de', 'oesterreich.gv.at', 'geogebra.org', 'chemie.de', 'leifiphysik.de',
];

/**
 * Exfiltration guard: a page (or an injected text) must not make the AI send private data to an unknown site.
 * Allowed: URLs found by web_suchen in this turn, URLs the user wrote in this message, and known learning sites
 * (without query string/fragment, so nothing can be appended).
 */
export function allowedWebUrl(raw: string, ctx: { userMessage: string; found: Set<string> }): { url: string; fromUser: boolean } {
  const u = checkUrl(raw);
  const exact = u.toString();
  if (ctx.found.has(exact) || ctx.found.has(raw.trim())) return { url: exact, fromUser: false };
  if (ctx.userMessage.includes(raw.trim()) || ctx.userMessage.includes(exact)) return { url: exact, fromUser: true };
  const host = u.hostname.toLowerCase();
  if (LEARNING_SITES.some(d => host === d || host.endsWith(`.${d}`))) { u.search = ''; u.hash = ''; return { url: u.toString(), fromUser: false }; }
  throw new Error('Diese Seite öffne ich nicht von mir aus. Ich öffne Treffer aus web_suchen, Adressen aus deiner Nachricht und bekannte Lernseiten.');
}
