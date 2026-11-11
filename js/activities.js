// Everything that can go into a training week: workouts, runs, football,
// recovery and the small daily habits. Built from the imported plan.
import { S, saveSettings, saveSession, weekRange, planWeek, nextDay } from './state.js';
import { uid, isoDate, addDays, mondayOf, sum } from './util.js';

const nums = (s) => (String(s).match(/\d+(?:[.,]\d+)?/g) || []).map((x) => Number(x.replace(',', '.')));

// Pitch intervals: duration per week from "Weeks 1 & 2: 10 Minutes"
function runOneSpec(x) {
  const w = {};
  for (const l of x?.lines || []) {
    const m = l.match(/^Weeks?\s*(\d)(?:\s*&\s*(\d))?:\s*(\d+)\s*Minutes?/i);
    if (m) for (const k of [m[1], m[2]].filter(Boolean)) w[k] = Number(m[3]);
  }
  return { minutes: { 1: w[1] || 10, 2: w[2] || w[1] || 10, 3: w[3] || 12, 4: w[4] || w[3] || 12 } };
}

// 4 minute bouts: sets, hard and easy pace, treadmill speeds
function runTwoSpec(x) {
  const lines = x?.lines || [];
  const text = lines.join('\n');
  const sets = Number((text.match(/(\d+)\s*sets/i) || [])[1]) || 4;
  const mins = lines.filter((l) => /^\d+\s*minutes?$/i.test(l.trim())).map((l) => nums(l)[0]);
  const outside = lines.filter((l) => /^Outside:/i.test(l)).map((l) => { const m = l.match(/(\d+)\s*-\s*(\d+)\s*%/); return m ? `${m[1]}–${m[2]} % Tempo` : null; });
  const tread = lines.filter((l) => /^Treadmill Speed/i.test(l)).map((l) => {
    const k = (l.match(/(\d+(?:\.\d+)?)\s*km\/h/gi) || []).map((s) => s.replace(/\s*km\/h/i, '').replace('.', ','));
    return k.length >= 2 ? `${k[0]}–${k[1]} km/h` : null;
  });
  return {
    sets,
    hard: { min: mins[0] || 4, pace: outside[0] || '80–85 % Tempo', tread: tread[0] || '15,2–18,0 km/h' },
    easy: { min: mins[1] || 4, pace: outside[1] || '50–60 % Tempo', tread: tread[1] || '9,0–10,4 km/h' },
  };
}

// All stretches of the current plan plus the ones taken over from another plan, once each
export function stretchExercises() {
  const seen = new Set();
  const out = [];
  const add = (e) => { const k = e.name.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push(e); } };
  for (const d of S.plan?.days || []) for (const s of d.sections) if (s.kind === 'stretch') s.exercises.forEach(add);
  for (const e of S.stretchLib?.exercises || []) add(e);
  return out;
}

export function stretchDay() {
  const ex = stretchExercises();
  if (!ex.length) return null;
  return {
    id: 'stretch', title: 'Stretching', routine: true,
    sections: [{ id: 'stretch-s1', n: 1, kind: 'stretch', title: 'Stretching', rounds: { 1: 1, 2: 1, 3: 1, 4: 1 }, restSec: 0, notes: [], exercises: ex }],
  };
}

export function findDay(id) {
  return S.plan?.days.find((d) => d.id === id) || (id === 'stretch' ? stretchDay() : null);
}

// The catalog. kind decides how the activity is started and logged.
export function catalog() {
  const out = [];
  const p = S.plan;
  if (!p) return out;
  for (const d of p.days) {
    out.push({ id: d.id, kind: 'workout', group: 'strength', title: d.subtitle ? `${d.title} · ${d.subtitle}` : d.title, short: d.title.replace('Workout ', 'W'), dayId: d.id });
  }
  // Plans with many workouts: the week says "next workout" and the order decides which one
  const nd = nextDay();
  if (nd) out.push({ id: 'next', kind: 'workout', group: 'strength', title: `Nächstes Workout: ${nd.title}${nd.subtitle ? ` · ${nd.subtitle}` : ''}`, short: 'Workout', dayId: nd.id, next: true });
  const fs1 = p.extras.find((x) => x.id === 'fs1');
  const fs2 = p.extras.find((x) => x.id === 'fs2');
  if (fs1) out.push({ id: 'fs1', kind: 'run', group: 'run', title: 'Lauf 1: Platz-Intervalle', short: 'Lauf 1', mode: 'pitch', spec: runOneSpec(fs1), src: fs1 });
  if (fs2) out.push({ id: 'fs2', kind: 'run', group: 'run', title: 'Lauf 2: 4-Minuten-Intervalle', short: 'Lauf 2', mode: 'bouts', spec: runTwoSpec(fs2), src: fs2 });
  out.push({ id: 'jog', kind: 'run', group: 'run', title: 'Lockerer Lauf', short: 'Joggen', mode: 'free', minutes: [30, 45] });
  out.push({ id: 'football', kind: 'football', group: 'football', title: 'Fußballtraining', short: 'Fußball' });
  out.push({ id: 'match', kind: 'football', group: 'football', title: 'Spiel', short: 'Spiel', match: true });
  for (const x of p.extras.filter((e) => e.type === 'recovery')) {
    const title = x.title.replace(/\s*\(MOST IMPORTANT\)/i, '');
    const de = {
      'Full Follow Along Recovery Routine': 'Recovery-Routine zum Mitmachen',
      'Low Intensity Steady State Cardio': 'Spaziergang, locker',
      'Full 40 Minute Mobility Routine': 'Mobility, 40 Minuten',
      'Morning Mobility Routine': 'Morgen-Mobility',
    }[title] || title;
    const range = nums(x.lines.join(' ')).length >= 2 && /minutes/i.test(x.lines.join(' ')) ? nums(x.lines.join(' ')).slice(-2) : null;
    out.push({
      id: x.id, kind: 'recovery', group: 'recovery', title: de, en: title, short: de.split(',')[0].replace('Recovery-Routine zum Mitmachen', 'Recovery'),
      video: x.video, mode: x.video ? 'video' : 'free', minutes: range || (/40 Minute/.test(title) ? [40, 40] : null), important: /MOST IMPORTANT/i.test(x.title),
    });
  }
  const st = stretchExercises();
  if (st.length) out.push({ id: 'stretch', kind: 'recovery', group: 'recovery', title: 'Stretching', short: 'Stretching', mode: 'routine', minutes: [Math.max(10, Math.round(st.length * 1.5)), Math.max(15, st.length * 2)], count: st.length });
  out.push({ id: 'ball', kind: 'habit', group: 'habit', title: 'Ballarbeit', short: 'Ball', note: 'In der RicFit-App' });
  out.push({ id: 'tv', kind: 'habit', group: 'habit', title: 'TV-Stretches', short: 'TV-Stretch', note: 'Am Abend, eigenes Dokument vom Coach' });
  out.push({ id: 'rest', kind: 'rest', group: 'rest', title: 'Ruhetag', short: 'Ruhe' });
  return out;
}

export const byId = (id) => catalog().find((a) => a.id === id);

// When and how, in the coach's words where the plan says it
export function guidance(a) {
  switch (a.kind) {
    case 'workout': return 'Vorher 5 bis 10 Minuten Rad oder Laufband. Zwischen den Übungen im Zirkel keine Pause.';
    case 'run':
      if (a.mode === 'pitch') return 'Auf dem Platz, jede Seite ist ein Abschnitt. Vorher ein Warm-up aus Teil 1 eines Workouts, danach auslaufen. Gib alles.';
      if (a.mode === 'bouts') return 'Rein aerob. Draußen auf weichem Boden, am besten Rasen, nicht auf Asphalt. Wenn nur Beton oder Laufband geht, dann Laufband.';
      return 'Ruhig und locker, du kannst dich dabei noch unterhalten.';
    case 'football': return a.match ? 'Am Tag danach Recovery-Routine statt Workout.' : 'Zählt als harte Einheit. Am selben Tag höchstens ein kurzes Workout und keine Plyos davor.';
    case 'recovery': return a.important ? 'Laut deinem Plan das Wichtigste: mindestens 3× pro Woche.' : 'Gut für trainingsfreie Tage, bringt den Kreislauf in Schwung.';
    case 'habit': return a.note;
    case 'rest': return 'Kein Training. Schlafen, essen, trinken. Gerne Spaziergang oder Mobility.';
    default: return '';
  }
}

export function minutesLabel(a) {
  if (a.kind === 'run' && a.mode === 'pitch') return `${a.spec.minutes[planWeek()]} Min`;
  if (a.kind === 'run' && a.mode === 'bouts') return `${a.spec.sets * (a.spec.hard.min + a.spec.easy.min)} Min`;
  if (a.minutes) return a.minutes[0] === a.minutes[1] ? `${a.minutes[0]} Min` : `${a.minutes[0]}–${a.minutes[1]} Min`;
  if (a.kind === 'football') return a.match ? '90 Min' : 'ca. 90 Min';
  return '';
}

// ---- Week plan: settings.weekPlan[0..6], Monday first

// Default week from the sample schedule in the plan, without team training.
// Team training and matches are asked every Sunday for the coming week.
export function defaultWeekPlan() {
  const has = (id) => !!byId(id);
  const w = (...ids) => ids.filter(has);
  if ((S.plan?.days.length || 0) > 3) {
    return [
      ['next', 'ball', 'tv'],
      [...w('fs2'), 'tv'],
      ['next', 'ball', 'tv'],
      [...w('fs1'), 'ball', 'tv'],
      ['next', 'ball', 'tv'],
      ['next'],
      ['rest', ...w('stretch', 'rc1')],
    ];
  }
  return [
    [...w('d1'), 'ball', 'tv'],
    [...w('fs2'), 'tv'],
    [...w('d2'), 'ball', 'tv'],
    [...w('fs1'), 'ball', 'tv'],
    ['jog', 'ball', 'tv'],
    [...w('d3')],
    ['rest', ...w('rc1')],
  ];
}

const weekKey = (date = new Date()) => isoDate(mondayOf(date));

// The plan for the week of date: a week-specific version if the Sunday check-in made one
export function weekPlan(date = new Date()) {
  if (!Array.isArray(S.settings.weekPlan) || S.settings.weekPlan.length !== 7) S.settings.weekPlan = defaultWeekPlan();
  const o = S.settings.weekOverride?.[weekKey(date)];
  return Array.isArray(o) && o.length === 7 ? o : S.settings.weekPlan;
}

export async function setDayPlan(i, ids, date = new Date()) {
  const key = weekKey(date);
  if (S.settings.weekOverride?.[key]) S.settings.weekOverride[key][i] = ids;
  else weekPlan(date)[i] = ids;
  await saveSettings();
}

// ---- Sunday check-in: team training and matches for the coming week

export function pendingWeekQuestion(now = new Date()) {
  if (!S.plan) return null;
  const wd = weekdayIndex(now);
  const target = wd === 6 ? addDays(mondayOf(now), 7) : wd <= 1 ? mondayOf(now) : null;
  if (!target) return null;
  const key = isoDate(target);
  if (S.settings.weekAnswers?.[key]) return null;
  return { key, monday: target, next: wd === 6 };
}

export async function answerWeek(key, { team = [], match = null }) {
  S.settings.weekAnswers ||= {};
  S.settings.weekAnswers[key] = { team, match, at: Date.now() };
  weekPlan(); // makes sure the template exists
  const base = S.settings.weekPlan.map((ids) => [...ids]);
  const strip = (ids) => ids.filter((id) => id !== 'football' && id !== 'match');
  let plan = base.map(strip);
  for (const i of team) {
    // Team training replaces the run of that day (the plan makes runs depend on team training)
    plan[i] = plan[i].filter((id) => id !== 'rest' && byId(id)?.kind !== 'run');
    plan[i].unshift('football');
  }
  if (match != null) {
    plan[match] = ['match'];
    // The day before a match: no workout and no sprint run, mobility instead
    const prev = (match + 6) % 7;
    if (plan[prev].some((id) => byId(id)?.kind === 'workout' || id === 'fs1')) {
      plan[prev] = plan[prev].filter((id) => byId(id)?.kind !== 'workout' && id !== 'fs1');
      if (has('rc4')) plan[prev].push('rc4');
    }
    // The day after: recovery
    const next = (match + 1) % 7;
    if (!plan[next].some((id) => byId(id)?.kind === 'football')) plan[next] = ['rest', ...(has('rc1') ? ['rc1'] : [])];
  }
  S.settings.weekOverride ||= {};
  S.settings.weekOverride[key] = plan;
  await saveSettings();
  return plan;
}

const has = (id) => !!byId(id);

export function teamDaysThisWeek(date = new Date()) {
  return weekPlan(date).filter((ids) => ids.includes('football') || ids.includes('match')).length;
}

export const weekdayIndex = (d = new Date()) => (d.getDay() + 6) % 7;

// ---- Logging for everything that is not a workout

export function sessionsOf(date, kinds) {
  return S.sessions.filter((s) => s.status === 'done' && s.date === date && (!kinds || kinds.includes(s.kind || 'workout')));
}

export function isDone(activity, date = isoDate()) {
  if (activity.next) return S.sessions.some((s) => s.status === 'done' && s.date === date && (!s.kind || s.kind === 'workout'));
  return S.sessions.some((s) => s.status === 'done' && s.date === date && (s.activityId || s.dayId) === activity.id);
}

export async function logActivity(activity, data = {}) {
  const now = Date.now();
  const session = {
    id: uid(),
    kind: activity.kind,
    activityId: activity.id,
    planId: S.plan?.id,
    title: activity.title,
    date: data.date || isoDate(),
    week: planWeek(),
    startedAt: data.startedAt || now - (data.minutes || 0) * 60000,
    finishedAt: now,
    minutes: data.minutes ?? null,
    rpe: data.rpe ?? null,
    note: data.note || '',
    data: data.extra || {},
    status: 'done',
  };
  await saveSession(session);
  return session;
}

// Session load = minutes × RPE, the standard way coaches compare weeks
export function loadOf(s) {
  const min = s.minutes ?? (s.finishedAt && s.startedAt ? Math.round((s.finishedAt - s.startedAt) / 60000) : 0);
  return s.rpe ? min * s.rpe : 0;
}

export function weekLoad(date = new Date()) {
  const { start, end } = weekRange(date);
  return sum(S.sessions.filter((s) => s.status === 'done' && s.finishedAt >= start.getTime() && s.finishedAt < end.getTime()), loadOf);
}

// Counts per goal key for the week of date
export function goalCounts(date = new Date()) {
  const { start, end } = weekRange(date);
  const ss = S.sessions.filter((s) => s.status === 'done' && s.finishedAt >= start.getTime() && s.finishedAt < end.getTime());
  const c = { workout: 0, fitness: 0, ball: 0, recovery: 0, tv: 0, football: 0 };
  for (const s of ss) {
    const k = s.kind || 'workout';
    if (k === 'workout') c.workout++;
    else if (k === 'run' && (s.activityId === 'fs1' || s.activityId === 'fs2')) c.fitness++;
    else if (k === 'football') c.football++;
    else if (k === 'recovery' && s.activityId === 'rc1') c.recovery++;
    else if (k === 'recovery' && s.activityId === 'stretch') c.tv++;
    else if (k === 'habit') c[s.activityId] = (c[s.activityId] || 0) + 1;
  }
  return c;
}

export function planDates(date = new Date()) {
  const m = mondayOf(date);
  return Array.from({ length: 7 }, (_, i) => addDays(m, i));
}

// Weekly goals from the plan, plus football 3 to 4 times a week
export function weekGoals(date = new Date()) {
  if (!S.plan) return [];
  const c = goalCounts(date);
  const { start, end } = weekRange(date);
  for (let d = new Date(start); d < end; d = addDays(d, 1)) {
    const day = S.daily[isoDate(d)];
    for (const [k, v] of Object.entries(day?.goals || {})) c[k] = (c[k] || 0) + v;
  }
  const label = { fitness: 'Laufeinheiten', recovery: 'Recovery-Routine' };
  const goals = S.plan.weeklyGoals.filter((g) => g.key).map((g) => ({ ...g, label: label[g.key] || g.label, done: c[g.key] || 0 }));
  const team = teamDaysThisWeek(date);
  if (team || c.football) goals.splice(1, 0, { key: 'football', label: 'Fußball', target: Math.max(team, 1), min: Math.max(team, 1), done: c.football || 0 });
  return goals;
}
