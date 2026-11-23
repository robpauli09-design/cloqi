import { createEventFor } from '@/lib/event-input';
import { body, json, withUser } from '@/lib/mobile-api';
import { eventForm } from '@/lib/mobile-form';

/**
 * New event from the app. Uses exactly the website's form rules:
 * { title, date, start, end, allDay?, category, location?, description?, reminder?, repeat? }
 */
export const POST = withUser(async (user, req) => json({ ok: true, message: await createEventFor(user, eventForm(await body(req))) }));
