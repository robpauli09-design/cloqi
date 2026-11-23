import 'server-only';
import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

let cachedKey: Buffer | null = null;

/** 32-byte key for AES-256-GCM. Production requires CLOQI_ENCRYPTION_KEY; dev generates one under .data/. */
function encryptionKey(): Buffer {
  if (cachedKey) return cachedKey;
  const env = process.env.CLOQI_ENCRYPTION_KEY;
  if (env) {
    const key = Buffer.from(env, 'base64');
    if (key.length !== 32) throw new Error('CLOQI_ENCRYPTION_KEY muss 32 Byte (base64) lang sein.');
    cachedKey = key;
    return key;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('CLOQI_ENCRYPTION_KEY ist in Produktion Pflicht.');
  }
  const file = path.join(process.cwd(), '.data', 'dev-encryption.key');
  if (!existsSync(file)) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, randomBytes(32).toString('base64'), { mode: 0o600 });
  }
  cachedKey = Buffer.from(readFileSync(file, 'utf8').trim(), 'base64');
  return cachedKey;
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), enc.toString('base64url')].join('.');
}

export function decrypt(payload: string): string {
  const [v, iv, tag, data] = payload.split('.');
  if (v !== 'v1') throw new Error('Unbekanntes Verschlüsselungsformat');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}

export function randomToken(bytes = 32): string { return randomBytes(bytes).toString('base64url'); }

export function sha256(input: string): string { return createHash('sha256').update(input).digest('hex'); }

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password.normalize('NFKC'), salt, 64, SCRYPT_OPTS);
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, saltB64, hashB64] = stored.split('$');
  if (alg !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64url');
  const actual = await scryptAsync(password.normalize('NFKC'), Buffer.from(saltB64, 'base64url'), expected.length, SCRYPT_OPTS);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
