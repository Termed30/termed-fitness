// In-memory state, loaded from IndexedDB at start, plus derived values.
import { db } from './db.js';
import { isoDate, parseIso, daysBetween, mondayOf, addDays } from './util.js';

export const S = {
  settings: null,
  plan: null,
  nutrition: null,
  sessions: [],
  daily: {},
  photos: [], // metadata only: {id, date, sessionId, week}
  active: null, // workout in progress
  stretchLib: null, // stretches taken over from another plan
};

const DEFAULT_SETTINGS = {
  name: '',
  weightKg: null,
  planStart: null,
  seasonStart: '2027-02-01',
  reminderTime: '17:30',
  checkinTime: '21:00',
  creatineTime: '08:00',
  shakeChoice: 'auto',
};

export async function loadState() {
  S.settings = { ...DEFAULT_SETTINGS, ...((await db.get('kv', 'settings')) || {}) };
  S.plan = (await db.get('kv', 'plan')) || null;
  S.nutrition = (await db.get('kv', 'nutrition')) || null;
  S.active = (await db.get('kv', 'active')) || null;
  S.stretchLib = (await db.get('kv', 'stretches')) || null;
  S.sessions = ((await db.all('sessions')) || []).sort((a, b) => a.startedAt - b.startedAt);
  S.daily = Object.fromEntries(((await db.all('daily')) || []).map((d) => [d.date, d]));
  const photos = (await db.all('photos')) || [];
  S.photos = photos.map(({ blob, thumb, ...meta }) => meta).sort((a, b) => a.takenAt - b.takenAt);
}

export const saveSettings = () => db.put('kv', S.settings, 'settings');
export const savePlan = () => db.put('kv', S.plan, 'plan');
export const saveNutrition = () => db.put('kv', S.nutrition, 'nutrition');
export const saveStretchLib = () => db.put('kv', S.stretchLib, 'stretches');
export async function saveActive() {
  if (S.active) await db.put('kv', S.active, 'active');
  else await db.del('kv', 'active');
}
export async function saveSession(s) {
  const i = S.sessions.findIndex((x) => x.id === s.id);
  if (i >= 0) S.sessions[i] = s;
  else S.sessions.push(s);
  await db.put('sessions', s);
}

export function today(date = isoDate()) {
  if (!S.daily[date]) S.daily[date] = { date, waterMl: 0, creatine: false, goals: {}, meals: {} };
  const d = S.daily[date];
  d.goals ||= {};
  d.meals ||= {};
  return d;
}
export const saveDaily = (date = isoDate()) => db.put('daily', today(date));

// ---- Derived

export function planStartDate() {
  return S.settings.planStart ? parseIso(S.settings.planStart) : mondayOf();
}

// 1-based week of the plan for a date. Values above plan.weeks mean the phase is over.
export function rawWeek(date = new Date()) {
  return Math.floor(daysBetween(planStartDate(), date) / 7) + 1;
}

export function planWeek(date = new Date()) {
  const w = rawWeek(date);
  const max = S.plan?.weeks || 4;
  return Math.min(Math.max(w, 1), max);
}

const isWorkout = (s) => !s.kind || s.kind === 'workout';

export function doneSessions() {
  return S.sessions.filter((s) => s.status === 'done' && isWorkout(s) && s.planId === S.plan?.id);
}

export function nextDay() {
  if (!S.plan) return null;
  const done = doneSessions();
  if (!done.length) return S.plan.days[0];
  const last = done[done.length - 1];
  const i = S.plan.days.findIndex((d) => d.id === last.dayId);
  return S.plan.days[(i + 1) % S.plan.days.length];
}

export function weekRange(date = new Date()) {
  const start = mondayOf(date);
  return { start, end: addDays(start, 7) };
}

export function sessionsInRange(start, end, all = false) {
  return S.sessions.filter((s) => s.status === 'done' && (all || isWorkout(s)) && s.finishedAt >= start.getTime() && s.finishedAt < end.getTime());
}

export function daysSinceLastWorkout() {
  const done = doneSessions();
  if (!done.length) return null;
  return daysBetween(new Date(done[done.length - 1].finishedAt), new Date());
}

export function seasonDaysLeft() {
  if (!S.settings.seasonStart) return null;
  return daysBetween(new Date(), parseIso(S.settings.seasonStart));
}
