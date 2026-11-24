// Is an IP address safe to contact from the server? (SSRF guard for lib/web.ts – no server-only imports so it can be unit-tested.)
import { isIP } from 'node:net';

function v4Parts(ip: string): number[] | null {
  const p = ip.split('.');
  if (p.length !== 4 || p.some(x => !/^\d{1,3}$/.test(x) || Number(x) > 255)) return null;
  return p.map(Number);
}
function v4Blocked([a, b, c]: number[]): boolean {
  return a === 0 || a === 10 || a === 127 || a >= 224                       // this net, private, loopback, multicast/reserved
    || (a === 100 && b >= 64 && b <= 127)                                    // carrier-grade NAT
    || (a === 169 && b === 254)                                              // link-local / cloud metadata
    || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)         // private
    || (a === 192 && b === 0 && (c === 0 || c === 2)) || (a === 198 && (b === 18 || b === 19)) // IETF, test, benchmarking
    || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113);           // documentation
}
/** "::ffff:7f00:1" → [0,0,0,0,0,0xffff,0x7f00,1]; null if not valid IPv6. */
function v6Hextets(ip: string): number[] | null {
  let s = ip.toLowerCase().split('%')[0];
  // dotted IPv4 tail (::ffff:1.2.3.4 / ::1.2.3.4) → two hextets
  const tail = s.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (tail) {
    const v4 = v4Parts(tail[2]);
    if (!v4) return null;
    s = `${tail[1]}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const rest = halves.length === 2 ? (halves[1] ? halves[1].split(':') : []) : [];
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const all = [...head, ...Array(fill).fill('0'), ...rest];
  if (all.length !== 8 || all.some(h => !/^[0-9a-f]{1,4}$/.test(h))) return null;
  return all.map(h => parseInt(h, 16));
}
/** true = must not be contacted. Anything that isn't clearly a public address is blocked. */
export function blockedIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) { const p = v4Parts(ip); return !p || v4Blocked(p); }
  if (kind !== 6) return true;
  const h = v6Hextets(ip);
  if (!h) return true;
  const embedded = (hi: number, lo: number) => v4Blocked([hi >> 8, hi & 255, lo >> 8, lo & 255]);
  const zero5 = h.slice(0, 5).every(x => x === 0);
  if (zero5 && (h[5] === 0xffff || h[5] === 0)) {                  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d), incl. :: and ::1
    return h[5] === 0 && h[6] === 0 && h[7] <= 1 ? true : embedded(h[6], h[7]);
  }
  if (h[0] === 0x64 && h[1] === 0xff9b) return embedded(h[6], h[7]); // NAT64
  if (h[0] === 0x2002) return embedded(h[1], h[2]);                // 6to4
  if ((h[0] & 0xfe00) === 0xfc00) return true;                     // unique local fc00::/7
  if ((h[0] & 0xffc0) === 0xfe80) return true;                     // link-local fe80::/10
  if ((h[0] & 0xff00) === 0xff00) return true;                     // multicast
  if (h[0] === 0x2001 && h[1] === 0x0db8) return true;             // documentation
  if (h[0] === 0x0100 && h[1] === 0 && h[2] === 0 && h[3] === 0) return true; // discard prefix
  return (h[0] & 0xe000) !== 0x2000;                               // only global unicast 2000::/3
}

