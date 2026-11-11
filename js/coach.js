// Rule based coach: reads the logged data and says one or two useful things.
import { S, today, daysSinceLastWorkout, seasonDaysLeft, rawWeek, doneSessions, weekRange, sessionsInRange } from './state.js';
import { weekGoals, weekPlan, weekdayIndex, byId } from './activities.js';
import { isoDate, addDays, fmtNum, avg } from './util.js';

export const REASONS = [
  { value: 'team', label: 'Teamtraining' },
  { value: 'tired', label: 'Müde' },
  { value: 'pain', label: 'Schmerzen' },
  { value: 'time', label: 'Keine Zeit' },
  { value: 'sick', label: 'Krank' },
];

const REASON_REPLY = {
  team: 'Teamtraining zählt als Belastung. Heute die Recovery-Routine und TV-Stretches, morgen wieder ein Workout.',
  tired: 'Dann heute kürzer: Warm-up und Zirkel, den Finisher lässt du weg. Und heute Abend acht Stunden Schlaf einplanen.',
  pain: 'Bei Schmerzen nicht durchziehen. Schreib deinem Coach, wo es weh tut, und mach heute nur Mobility.',
  time: 'Dann 20 Minuten: Warm-up und eine Runde Zirkel. Eine kurze Einheit hält die Routine am Leben.',
  sick: 'Gesund werden geht vor. Viel trinken, viel schlafen, mit Fieber kein Training.',
};

const LINES = [
  'Konstanz schlägt Motivation. Eine Einheit nach der anderen.',
  'Die Saison startet nicht im Februar, sie startet mit dem Training heute.',
  'Saubere Technik zuerst, dann Tempo. So hältst du die Runden bis zum Schluss.',
  'Die 7-11-Atmung nach dem Training nicht vergessen. Damit erholst du dich schneller.',
  'Eiweiß in jede Mahlzeit, 20 bis 30 Gramm. Daraus werden die Muskeln.',
  'Schlaf ist Training, das du im Bett machst. Sieben bis neun Stunden.',
];

function sleepLastNight() {
  const d = S.daily[isoDate()];
  return d?.sleepH ?? null;
}

// Messages for the home screen. Each: {text, ask?}
export function homeMessages() {
  if (!S.plan) return [];
  const out = [];
  const d = today();
  const hour = new Date().getHours();

  const weeks = S.plan.weeks || 4;
  if (rawWeek() === weeks && (new Date().getDay() + 6) % 7 >= 3) {
    out.push({ text: `Letzte Woche von ${S.plan.title}. Frag ${S.plan.coach || 'deinen Coach'} nach der nächsten Phase, dann lädst du das PDF hier hoch.` });
  }
  if (rawWeek() > weeks) {
    out.push({ text: `${S.plan.title} ist durch. Lade die nächste Phase hoch, sobald dein Coach sie schickt. Bis dahin wiederholst du Woche 4.` });
  }

  if (S.active) {
    out.push({ text: 'Du hast ein Workout unterbrochen. Mach weiter, solange du noch warm bist, sonst starte es morgen neu.' });
  }

  const gap = daysSinceLastWorkout();
  if (gap != null && gap >= 3 && !S.active) {
    if (d.reason) out.push({ text: REASON_REPLY[d.reason] });
    else out.push({ text: `Seit ${gap} Tagen kein Workout. Was ist los?`, ask: 'reason' });
  } else if (gap == null && doneSessions().length === 0) {
    out.push({ text: 'Erstes Workout steht an. Schau dir bei jeder Übung kurz das Video an, Woche 1 ist zum Lernen der Bewegungen da.' });
  }

  // Football context: yesterday's match, today's team training
  const yesterday = isoDate(addDays(new Date(), -1));
  const matchYesterday = S.sessions.some((s) => s.status === 'done' && s.kind === 'football' && s.date === yesterday && (s.activityId === 'match' || s.data?.type === 'match'));
  const todayPlan = (weekPlan()[weekdayIndex()] || []).map(byId).filter(Boolean);
  if (matchYesterday) out.push({ text: 'Gestern war Spiel. Heute Recovery-Routine und viel trinken, das Workout verschiebst du auf morgen.' });
  else if (todayPlan.some((a) => a.kind === 'football') && todayPlan.some((a) => a.kind === 'workout')) {
    out.push({ text: 'Heute Workout und Teamtraining. Mach das Workout mit mehreren Stunden Abstand, sonst lass die Plyos weg.' });
  }

  const sleep = sleepLastNight();
  if (sleep != null) {
    if (sleep < 6.5) out.push({ text: `Nur ${fmtNum(sleep, 1)} Stunden Schlaf. Heute Technik vor Tempo, den Finisher kannst du auslassen. Heute Abend früher ins Bett.` });
    else if (sleep >= 8) out.push({ text: `${fmtNum(sleep, 1)} Stunden Schlaf, das ist die beste Vorbereitung. Heute darf es hart werden.` });
  } else if (hour >= 7 && hour < 12) {
    out.push({ text: 'Wie lange hast du geschlafen? Trag es unten ein, dann kann ich das Training danach einstellen.' });
  }

  const last = doneSessions().slice(-1)[0];
  if (last && last.rpe >= 9 && gap != null && gap <= 1) {
    out.push({ text: `Das letzte Workout war RPE ${last.rpe}. Heute mehr Erholung: Recovery-Routine, Wasser, Eiweiß.` });
  }

  // Missed reps this week vs last week
  const { start, end } = weekRange();
  const thisW = sessionsInRange(start, end);
  const lastW = sessionsInRange(addDays(start, -7), start);
  const missed = (arr) => arr.reduce((n, s) => n + (s.summary?.missed || 0), 0);
  if (thisW.length && lastW.length) {
    const diff = missed(lastW) - missed(thisW);
    if (diff > 0) out.push({ text: `Diese Woche ${diff} Wiederholungen weniger ausgelassen als letzte Woche. Genau so sieht Fortschritt aus.` });
  }

  // Week goals late in the week
  const wd = (new Date().getDay() + 6) % 7; // 0 = Monday
  if (wd >= 4) {
    const open = weekGoals().filter((g) => g.done < g.min);
    if (open.length) {
      const g = open[0];
      out.push({ text: `Noch ${g.min - g.done} × ${g.label} bis zum Wochenziel. Das Wochenende ist dafür da.` });
    }
  }

  const n = S.nutrition;
  if (n && hour >= 15 && (d.waterMl || 0) < 1500) {
    out.push({ text: `Erst ${fmtNum((d.waterMl || 0) / 1000, 1)} Liter getrunken. Ziel sind ${n.waterL ? `${n.waterL[0]} bis ${n.waterL[1]}` : '3 bis 4'} Liter.` });
  }
  if (hour >= 18 && !d.creatine) {
    out.push({ text: `Kreatin heute noch nicht eingetragen. ${S.nutrition?.creatineG || 5} Gramm, am besten in den Shake.` });
  }

  if (out.length < 2) {
    const left = seasonDaysLeft();
    const i = new Date().getDate() % LINES.length;
    out.push({ text: left != null && left > 0 && i % 2 === 0 ? `Noch ${left} Tage bis zum Saisonstart. ${LINES[i]}` : LINES[i] });
  }
  return out.slice(0, 2);
}

// Feedback right after a workout
export function afterWorkout(session) {
  const out = [];
  const sum = session.summary;
  const pct = sum.total ? Math.round((sum.full / sum.total) * 100) : 0;
  const same = doneSessions().filter((s) => s.dayId === session.dayId && s.id !== session.id);
  const prev = same[same.length - 1];

  if (pct >= 95) out.push(`${pct} Prozent voll geschafft. Stark.`);
  else if (pct >= 75) out.push(`${pct} Prozent voll geschafft, ${sum.missed} Wiederholungen haben gefehlt. Nächstes Mal holst du dir die zurück.`);
  else out.push(`${pct} Prozent voll geschafft. Kein Problem in dieser Phase. Bleib bei den Werten dieser Woche, bis sie sitzen.`);

  if (prev?.summary) {
    const d = prev.summary.missed - sum.missed;
    if (d > 0) out.push(`Im Vergleich zum letzten Mal ${d} Wiederholungen weniger ausgelassen.`);
    if (prev.rpe && session.rpe && session.rpe < prev.rpe) out.push(`Und es hat sich leichter angefühlt (RPE ${session.rpe} statt ${prev.rpe}). Dein Körper passt sich an.`);
  }

  const heavier = [];
  const seenKg = new Set();
  for (const e of Object.values(session.entries)) {
    if (e.kg == null || seenKg.has(e.exId)) continue;
    seenKg.add(e.exId);
    const before = previousKg(e.name, session.id);
    if (before != null && e.kg > before) heavier.push(`${e.name}: ${fmtNum(e.kg, e.kg % 1 ? 1 : 0)} statt ${fmtNum(before, before % 1 ? 1 : 0)} kg`);
  }
  if (heavier.length) out.push(`Mehr Gewicht als letztes Mal. ${heavier.slice(0, 2).join('. ')}.`);

  const maxed = Object.values(session.entries).filter((e) => e.reps != null);
  for (const e of maxed.slice(0, 2)) {
    const before = previousReps(e.name, session.id);
    if (before != null && e.reps > before) out.push(`${e.name}: ${e.reps} statt ${before} Wiederholungen.`);
  }

  if (session.rpe >= 9) out.push('Das war am Limit. Jetzt Shake mit Eiweiß und Kohlenhydraten, innerhalb einer Stunde.');
  else out.push('Jetzt Eiweiß und Kohlenhydrate innerhalb einer Stunde, zum Beispiel der Shake aus deinem Essensplan.');

  if (/schmerz|weh|zieht|leiste|groin|pain/i.test(session.note || '')) {
    out.push('Du hast Schmerzen notiert. Schreib deinem Coach heute noch, wo genau und bei welcher Übung.');
  }
  if (!session.photoId) out.push('Beim nächsten Mal das Foto nicht vergessen, sonst fehlt dir der Vergleich.');
  return out;
}

function previousKg(name, excludeId) {
  for (let i = S.sessions.length - 1; i >= 0; i--) {
    const s = S.sessions[i];
    if (s.id === excludeId) continue;
    const v = Object.values(s.entries || {}).filter((e) => e.name === name && e.kg != null).map((e) => e.kg);
    if (v.length) return Math.max(...v);
  }
  return null;
}

function previousReps(name, excludeId) {
  for (let i = S.sessions.length - 1; i >= 0; i--) {
    const s = S.sessions[i];
    if (s.id === excludeId) continue;
    const v = Object.values(s.entries || {}).filter((e) => e.name === name && e.reps != null);
    if (v.length) return v[v.length - 1].reps;
  }
  return null;
}

export function weeklyRpe(start, end) {
  return avg(sessionsInRange(start, end).map((s) => s.rpe));
}
