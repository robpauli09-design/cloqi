import { CATEGORIES, type Category } from './types';
import { isValidDate, isValidTime } from './time';

export class InputError extends Error {}

export function text(form: FormData, key: string, opts: { max?: number; required?: boolean; label?: string } = {}): string {
  const v = String(form.get(key) ?? '').trim();
  if (opts.required && !v) throw new InputError(`${opts.label ?? key} fehlt.`);
  if (v.length > (opts.max ?? 200)) throw new InputError(`${opts.label ?? key} ist zu lang.`);
  return v;
}

export function optionalText(form: FormData, key: string, max = 500): string | null {
  const v = text(form, key, { max });
  return v || null;
}

export function int(form: FormData, key: string, min: number, max: number, fallback?: number): number {
  const raw = form.get(key);
  const n = raw === null || raw === '' ? fallback : Number(raw);
  if (n === undefined || !Number.isFinite(n) || n < min || n > max) throw new InputError(`Ungültiger Wert für ${key}.`);
  return Math.round(n);
}

export function date(form: FormData, key: string, label = 'Datum'): string {
  const v = text(form, key, { required: true, label });
  if (!isValidDate(v)) throw new InputError(`${label} ist ungültig.`);
  return v;
}

export function time(form: FormData, key: string, label = 'Uhrzeit'): string {
  const v = text(form, key, { required: true, label });
  if (!isValidTime(v)) throw new InputError(`${label} ist ungültig.`);
  return v;
}

export function category(form: FormData, key = 'category'): Category {
  const v = String(form.get(key) ?? '');
  if (!CATEGORIES.includes(v as Category)) throw new InputError('Ungültige Kategorie.');
  return v as Category;
}

export function email(v: string): string {
  const e = v.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) || e.length > 200) throw new InputError('Bitte gib eine gültige E-Mail-Adresse ein.');
  return e;
}

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

export function fail(e: unknown): ActionResult {
  if (e instanceof InputError) return { ok: false, error: e.message };
  if (e instanceof Error && /NEXT_REDIRECT/.test(e.message)) throw e;
  console.error(e);
  return { ok: false, error: e instanceof Error && e.message ? e.message : 'Etwas ist schiefgelaufen.' };
}
