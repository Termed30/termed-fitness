// Habit tracker and the game around it: points (XP), levels, streaks, badges and
// the season path. Everything is computed from the stored days and sessions, so the
// score can never drift from what was really done.
import { S, today, saveDaily, saveSettings } from './state.js';
import { isoDate, parseIso, addDays, daysBetween, esc, fmtNum } from './util.js';
import { SHAKES } from './food.js';

// ---- Habit catalog. auto(day, date) returns true/false when the app knows it already.
const proteinEaten = (d) => {
  const n = S.nutrition;
  if (!n || !d?.meals) return 0;
  return Object.entries(d.meals).reduce((sum, [key, on]) => {
    if (!on) return sum;
    if (key.startsWith('shake:')) return sum + (SHAKES[key.slice(6)]?.p || 0);
    const [di, mi] = key.split(':').map(Number);
    return sum + (n.days[di]?.meals[mi]?.p || 0);
  }, 0);
};
const sessionOn = (date, pred) => S.sessions.some((s) => s.status === 'done' && s.date === date && pred(s));
const isWorkout = (s) => !s.kind || s.kind === 'workout';

export const HABITS = [
  { id: 'creatine', title: 'Kreatin 5 g', icon: 'pill', group: 'Plan', auto: (d) => !!d?.creatine, input: 'creatine' },
  { id: 'water', title: 'Wasser 3 L', icon: 'droplet', group: 'Plan', auto: (d) => (d?.waterMl || 0) >= 3000, input: 'water' },
  { id: 'protein', title: 'Eiweiß-Ziel', icon: 'egg', group: 'Plan', auto: (d) => proteinEaten(d) >= (S.nutrition?.protein || 150) * 0.95, input: 'protein' },
  { id: 'sleep', title: '7 bis 9 h Schlaf', icon: 'moon', group: 'Plan', auto: (d) => (d?.sleepH || 0) >= 7, input: 'sleep' },
  { id: 'ball', title: 'Ballarbeit', icon: 'circle-check', group: 'Training' },
  { id: 'stretch', title: 'Dehnen oder Stretching', icon: 'activity', group: 'Training', auto: (d, date) => sessionOn(date, (s) => s.activityId === 'stretch' || s.activityId === 'tv') || undefined },
  { id: 'photo', title: 'Foto nach dem Workout', icon: 'camera', group: 'Training', auto: (d, date) => (S.photos.some((p) => p.date === date) ? true : undefined), onlyTrainingDays: true },
  { id: 'breath', title: 'Atemübung', icon: 'wind', group: 'Kopf', auto: (d, date) => (sessionOn(date, isWorkout) ? true : undefined) },
  { id: 'meditate', title: 'Meditieren, 10 Minuten', icon: 'leaf', group: 'Kopf' },
  { id: 'read', title: '10 Seiten lesen', icon: 'book-open', group: 'Kopf' },
  { id: 'goal', title: 'Zielsatz am Morgen lesen', icon: 'target', group: 'Kopf' },
  { id: 'phone', title: 'Kein Handy 30 Min vor dem Schlafen', icon: 'smartphone', group: 'Kopf' },
  { id: 'mealprep', title: 'Meal Prep', icon: 'chef-hat', group: 'Plan', days: [2, 6] },
  { id: 'noporn', title: 'Keine Pornos', icon: 'shield-check', group: 'Disziplin' },
  { id: 'nofap', title: 'Kein Masturbieren', icon: 'shield-check', group: 'Disziplin' },
];

export function habitList() {
  const off = new Set(S.settings.habitsOff || []);
  const own = (S.settings.habitsOwn || []).map((h) => ({ ...h, icon: 'star', group: 'Eigene', own: true }));
  return [...HABITS, ...own].filter((h) => !off.has(h.id));
}

const wdIndex = (date) => (parseIso(date).getDay() + 6) % 7;

function activeOn(h, date) {
  if (h.days && !h.days.includes(wdIndex(date))) return false;
  if (h.onlyTrainingDays && !sessionOn(date, isWorkout)) return false;
  return true;
}

// true / false for a habit on a date. Manual ticks win over automatic values.
export function habitDone(h, date) {
  const d = S.daily[date];
  if (h.input === 'creatine') return !!d?.creatine;
  const manual = d?.habits?.[h.id];
  if (manual != null) return manual;
  const a = h.auto ? h.auto(d, date) : undefined;
  return !!a;
}

export function dayScore(date) {
  const list = habitList().filter((h) => activeOn(h, date));
  const done = list.filter((h) => habitDone(h, date)).length;
  return { done, total: list.length, pct: list.length ? done / list.length : 0, list };
}

export async function toggleHabit(id, date = isoDate()) {
  const d = today(date);
  d.habits ||= {};
  const h = habitList().find((x) => x.id === id) || HABITS.find((x) => x.id === id);
  const next = !habitDone(h, date);
  if (h.input === 'creatine') { d.creatine = next; delete d.habits[id]; } else d.habits[id] = next;
  await saveDaily(date);
  return next;
}

// ---- Streaks

export function streak(h, upTo = isoDate()) {
  let cur = 0;
  let date = upTo;
  // An open today does not break the streak yet
  if (!habitDone(h, date)) date = isoDate(addDays(parseIso(date), -1));
  for (let i = 0; i < 400; i++) {
    if (!activeOn(h, date)) { date = isoDate(addDays(parseIso(date), -1)); continue; }
    if (!habitDone(h, date)) break;
    cur++;
    date = isoDate(addDays(parseIso(date), -1));
  }
  return cur;
}

export function bestStreak(h) {
  const dates = allDates();
  let best = 0;
  let run = 0;
  for (const date of dates) {
    if (!activeOn(h, date)) continue;
    if (habitDone(h, date)) { run++; best = Math.max(best, run); } else run = 0;
  }
  return best;
}

function allDates() {
  const first = gameStart();
  const out = [];
  for (let d = parseIso(first); isoDate(d) <= isoDate(); d = addDays(d, 1)) out.push(isoDate(d));
  return out;
}

export function gameStart() {
  const candidates = [isoDate(), S.settings.planStart, ...Object.keys(S.daily), ...S.sessions.map((s) => s.date)].filter(Boolean).sort();
  return S.settings.gameStart || candidates[0] || isoDate();
}

// ---- Points and levels

export const XP = { habit: 10, perfect: 30, workout: 50, run: 40, football: 40, recovery: 20, streak7: 50, streak30: 200 };

// Levels as stations of a career
export const LEVELS = [
  { xp: 0, title: 'Jugendakademie' },
  { xp: 400, title: 'Profivertrag' },
  { xp: 1200, title: 'Debüt' },
  { xp: 2500, title: 'Stammspieler' },
  { xp: 4500, title: 'Torjäger' },
  { xp: 7000, title: 'Kapitän' },
  { xp: 10000, title: 'Champions-League-Sieger' },
  { xp: 14000, title: 'Weltfußballer' },
  { xp: 19000, title: 'Legende' },
];

export function totalXp() {
  let xp = 0;
  const hs = habitList();
  for (const date of allDates()) {
    const sc = dayScore(date);
    xp += sc.done * XP.habit;
    if (sc.total && sc.done === sc.total) xp += XP.perfect;
  }
  for (const s of S.sessions) {
    if (s.status !== 'done') continue;
    const k = s.kind || 'workout';
    if (k === 'habit') continue;
    xp += XP[k] || 0;
  }
  // Streak milestones: every full 7 days in a row, and every 30
  for (const h of hs) {
    let run = 0;
    for (const date of allDates()) {
      if (!activeOn(h, date)) continue;
      if (habitDone(h, date)) {
        run++;
        if (run % 30 === 0) xp += XP.streak30;
        else if (run % 7 === 0) xp += XP.streak7;
      } else run = 0;
    }
  }
  return xp;
}

export function levelOf(xp) {
  let i = 0;
  while (i < LEVELS.length - 1 && xp >= LEVELS[i + 1].xp) i++;
  const cur = LEVELS[i];
  const next = LEVELS[i + 1];
  return { n: i + 1, title: cur.title, xp, from: cur.xp, to: next?.xp ?? null, next: next?.title ?? null, pct: next ? (xp - cur.xp) / (next.xp - cur.xp) : 1 };
}

// Shows a level-up only once per level
export async function checkLevelUp() {
  const lv = levelOf(totalXp());
  const seen = S.settings.levelSeen || 1;
  if (lv.n > seen) {
    S.settings.levelSeen = lv.n;
    await saveSettings();
    return lv;
  }
  if (!S.settings.levelSeen) { S.settings.levelSeen = lv.n; await saveSettings(); }
  return null;
}

// ---- Badges

export function badges() {
  const workouts = S.sessions.filter((s) => s.status === 'done' && isWorkout(s)).length;
  const runs = S.sessions.filter((s) => s.status === 'done' && s.kind === 'run').length;
  const recov = S.sessions.filter((s) => s.status === 'done' && s.kind === 'recovery').length;
  const dates = allDates();
  const perfectDays = dates.filter((d) => { const sc = dayScore(d); return sc.total && sc.done === sc.total; }).length;
  let goodRun = 0;
  let goodBest = 0;
  for (const d of dates) { if (dayScore(d).pct >= 0.8) { goodRun++; goodBest = Math.max(goodBest, goodRun); } else goodRun = 0; }
  const best = Math.max(0, ...habitList().map(bestStreak));
  const creatine = HABITS.find((h) => h.id === 'creatine');
  const list = [
    { id: 'first', title: 'Anpfiff', text: 'Erstes Workout', got: workouts >= 1, icon: 'play' },
    { id: 'w10', title: 'Zehnerkette', text: '10 Workouts', got: workouts >= 10, icon: 'dumbbell' },
    { id: 'w25', title: 'Dauerbrenner', text: '25 Workouts', got: workouts >= 25, icon: 'flame' },
    { id: 'perfect', title: 'Zu null', text: 'Ein perfekter Tag, alle Habits', got: perfectDays >= 1, icon: 'star' },
    { id: 'week', title: 'Englische Woche', text: '7 Tage am Stück mit 80 % der Habits', got: goodBest >= 7, icon: 'calendar' },
    { id: 's7', title: 'Serie 7', text: 'Ein Habit 7 Tage am Stück', got: best >= 7, icon: 'zap' },
    { id: 's30', title: 'Serie 30', text: 'Ein Habit 30 Tage am Stück', got: best >= 30, icon: 'trophy' },
    { id: 'crea', title: 'Kreatinspeicher voll', text: '28 Tage Kreatin am Stück', got: bestStreak(creatine) >= 28, icon: 'pill' },
    { id: 'runs', title: 'Laufmaschine', text: '10 Laufeinheiten', got: runs >= 10, icon: 'activity' },
    { id: 'recov', title: 'Regenerationsprofi', text: '10 Recovery- oder Stretching-Einheiten', got: recov >= 10, icon: 'heart-pulse' },
    { id: 'phase', title: 'Phase geschafft', text: 'Eine Trainingsphase abgeschlossen', got: (S.settings.phases || []).length >= 1, icon: 'medal' },
  ];
  return list;
}

// ---- Season path: one field per day from the start until the season begins

export function seasonPath() {
  const start = parseIso(gameStart());
  const end = S.settings.seasonStart ? parseIso(S.settings.seasonStart) : addDays(start, 90);
  const total = Math.max(1, daysBetween(start, end));
  const t = isoDate();
  const out = [];
  for (let i = 0; i <= total; i++) {
    const date = isoDate(addDays(start, i));
    const past = date < t;
    const sc = date <= t ? dayScore(date) : null;
    const trained = date <= t && S.sessions.some((s) => s.status === 'done' && s.date === date && s.kind !== 'habit');
    const state = date > t ? 'future' : sc.total && sc.done === sc.total ? 'perfect' : sc.pct >= 0.6 || trained ? 'good' : past ? 'miss' : 'today';
    out.push({ date, state, today: date === t, trained, pct: sc?.pct ?? 0, last: i === total });
  }
  const done = out.filter((x) => x.state === 'good' || x.state === 'perfect').length;
  return { days: out, done, left: Math.max(0, daysBetween(new Date(), end)), total };
}

// ---- Small render helpers shared by the screens

export function habitRowsMeta(date = isoDate()) {
  return habitList().filter((h) => activeOn(h, date)).map((h) => ({ h, done: habitDone(h, date), streak: streak(h, date) }));
}

export function streakLine(max = 3) {
  return habitList()
    .map((h) => ({ h, n: streak(h) }))
    .filter((x) => x.n >= 2)
    .sort((a, b) => b.n - a.n)
    .slice(0, max)
    .map((x) => `${esc(x.h.title.replace(/,.*$/, ''))} <span class="num">${fmtNum(x.n)}</span>`);
}

export async function addOwnHabit(title) {
  S.settings.habitsOwn ||= [];
  const id = `own-${Date.now().toString(36)}`;
  S.settings.habitsOwn.push({ id, title: title.trim().slice(0, 48) });
  await saveSettings();
}

export async function setHabitActive(id, on) {
  const off = new Set(S.settings.habitsOff || []);
  if (on) off.delete(id); else off.add(id);
  S.settings.habitsOff = [...off];
  await saveSettings();
}

export async function removeOwnHabit(id) {
  S.settings.habitsOwn = (S.settings.habitsOwn || []).filter((h) => h.id !== id);
  await saveSettings();
}

export const allHabitsForSettings = () => [...HABITS, ...(S.settings.habitsOwn || []).map((h) => ({ ...h, own: true, icon: 'star' }))];
export { proteinEaten };

// The week plan's habit items map onto these habits
export const ACTIVITY_HABIT = { ball: 'ball', tv: 'stretch' };

// New badges since the last look. The first call only remembers what is already there.
export async function checkNewBadges() {
  const got = badges().filter((b) => b.got);
  if (!Array.isArray(S.settings.badgesSeen)) {
    S.settings.badgesSeen = got.map((b) => b.id);
    await saveSettings();
    return [];
  }
  const fresh = got.filter((b) => !S.settings.badgesSeen.includes(b.id));
  if (fresh.length) {
    S.settings.badgesSeen.push(...fresh.map((b) => b.id));
    await saveSettings();
  }
  return fresh;
}

// True once per day, when every habit of the day is done
export async function checkPerfectDay(date = isoDate()) {
  const sc = dayScore(date);
  const d = today(date);
  if (sc.total && sc.done === sc.total && !d.perfectShown) {
    d.perfectShown = true;
    await saveDaily(date);
    return true;
  }
  return false;
}

// Role model card: public facts about Cristiano Ronaldo's routine, matched to an open habit
const ROLE = {
  sleep: 'Ronaldo hat mit dem Schlafcoach Nick Littlehales zusammengearbeitet. Feste Schlafzeiten gehören für ihn zum Training wie der Platz.',
  water: 'Bei der EM 2021 schob Ronaldo in einer Pressekonferenz zwei Cola-Flaschen zur Seite und hielt eine Flasche Wasser hoch.',
  protein: 'Ronaldo trinkt keinen Alkohol und setzt auf viel Fisch, mageres Fleisch und Gemüse, verteilt auf mehrere Mahlzeiten am Tag.',
  stretch: 'Zu Ronaldos Erholung gehören laut Berichten Eisbäder und eine Kältekammer nach harten Einheiten. Erholung ist bei ihm Pflicht, keine Kür.',
  ball: 'Frühere Mitspieler bei Manchester United erzählen, dass Ronaldo nach dem Mannschaftstraining oft allein weiter Freistöße geübt hat.',
  goal: 'Ronaldo debütierte mit 17 für Sporting Lissabon. Noch mit 40 spielte er auf Profiniveau, weil er seine Routine jeden Tag durchzieht.',
};
const QUOTE = { text: 'Talent ohne harte Arbeit ist nichts.', by: 'Cristiano Ronaldo' };

export function roleModel(date = isoDate()) {
  const open = habitRowsMeta(date).filter((x) => !x.done && ROLE[x.h.id]);
  const n = Number(date.replace(/-/g, '')) % 7;
  if (n === 6 || !open.length) return { quote: QUOTE };
  const pick = open[n % open.length];
  return { habit: pick.h, text: ROLE[pick.h.id] };
}
