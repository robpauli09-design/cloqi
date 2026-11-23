import { getUser, updateUser } from '@/lib/repo';
import { appUser, body, json, withUser } from '@/lib/mobile-api';
import { GENDER_LABELS, mascotFor, USER_TYPE_LABELS, type Gender, type UserType } from '@/lib/types';
import { InputError } from '@/lib/validate';

export const GET = withUser(async user => json(appUser(user)));

/** Profile / onboarding from the app. Same rules as the website (mascot follows gender). */
export const PATCH = withUser(async (user, req) => {
  const b = await body(req);
  const name = b.name === undefined ? user.name : String(b.name).trim().slice(0, 40);
  if (b.name !== undefined && !name) throw new InputError('Name fehlt.');
  const g = String(b.gender ?? '');
  const gender = g in GENDER_LABELS ? g as Gender : user.gender;
  if (b.onboarded === true && !gender) throw new InputError('Bitte wähle dein Geschlecht.');
  const t = String(b.userType ?? '');
  const chosen = b.mascot === 'clea' ? 'clea' : b.mascot === 'cloki' ? 'cloki' : user.prefs.mascot;
  await updateUser(user.id, {
    name, gender,
    userType: t in USER_TYPE_LABELS ? t as UserType : user.userType,
    ...(b.onboarded === true ? { onboarded: true } : {}),
    prefs: { ...user.prefs, mascot: mascotFor(gender, chosen) },
  });
  return json(appUser((await getUser(user.id))!));
});
