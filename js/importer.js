// Reads an uploaded PDF on the device and turns it into a training or nutrition plan.
import { extractPdf } from './pdf-text.js';
import { extractDocx } from './docx-text.js';
import { parseTraining } from './parse-training.js';
import { parseNutrition } from './parse-nutrition.js';
import { S, savePlan, saveNutrition, saveSettings } from './state.js';
import { isoDate, mondayOf, addDays, parseIso } from './util.js';
import { defaultWeekPlan, answerWeek } from './activities.js';

let pdfjs = null;
async function loadPdfjs() {
  if (pdfjs) return pdfjs;
  pdfjs = await import('../vendor/pdfjs/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  return pdfjs;
}

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// Returns {type, data, stats} without saving, so the user can confirm first.
export async function readPdf(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const isDocx = /\.docx$/i.test(file.name) || (buf[0] === 0x50 && buf[1] === 0x4b);
  let lines;
  try {
    if (isDocx) ({ lines } = await extractDocx(buf));
    else ({ lines } = await extractPdf(await loadPdfjs(), buf));
  } catch (e) {
    if (isDocx) throw new Error('Die Word-Datei konnte ich nicht lesen. Speichere sie als .docx oder PDF und versuch es noch einmal.');
    if (/password/i.test(e?.name || e?.message || '')) throw new Error('Das PDF ist mit einem Passwort geschützt. Bitte eine Version ohne Passwort hochladen.');
    throw new Error('Die Datei ist kein lesbares PDF. Bitte das Original-PDF vom Coach nehmen.');
  }
  if (!lines.length) throw new Error('Im PDF steht kein lesbarer Text, vielleicht ist es nur ein Scan.');
  const text = lines.map((l) => l.text).join('\n');
  if (/Caloric Target|Meal Plan|Macronutrient/i.test(text)) {
    const data = parseNutrition(lines);
    if (!data.kcal && !data.days.length) throw new Error('Im PDF habe ich keine Kalorien und keinen Essensplan gefunden.');
    data.fileName = file.name;
    data.importedAt = Date.now();
    return { type: 'nutrition', data };
  }
  const data = parseTraining(lines);
  if (!data.days.length) throw new Error('Im Dokument habe ich keine Trainingstage gefunden. Erwartet werden Abschnitte wie "Day 1" mit nummerierten Übungen.');
  data.id = `p${data.phase ?? 'x'}-${hash(text.slice(0, 4000))}`;
  data.fileName = file.name;
  data.importedAt = Date.now();
  return { type: 'training', data };
}

export async function applyImport(result, { planStart } = {}) {
  if (result.type === 'training') {
    const isNew = !S.plan || S.plan.id !== result.data.id;
    // First plan: this week. Next phase: this week until Wednesday, otherwise next Monday
    const start = planStart || (S.plan ? defaultStart() : isoDate(mondayOf()));
    if (isNew && S.plan) {
      // Keep the finished phase in the history
      S.settings.phases ||= [];
      if (!S.settings.phases.some((ph) => ph.id === S.plan.id)) {
        S.settings.phases.push({ id: S.plan.id, title: S.plan.title, coach: S.plan.coach, start: S.settings.planStart, end: isoDate(addDays(parseIso(start), -1)) });
      }
    }
    S.plan = result.data;
    await savePlan();
    if (isNew || !S.settings.planStart) S.settings.planStart = start;
    if (isNew) await rebuildWeeks();
    if (!S.settings.name && result.data.client) S.settings.name = result.data.client.split(' ')[0];
  } else {
    const keep = S.nutrition?.shopChecked;
    S.nutrition = result.data;
    if (keep) S.nutrition.shopChecked = keep;
    await saveNutrition();
    if (!S.settings.weightKg && result.data.weightKg) S.settings.weightKg = result.data.weightKg;
  }
  await saveSettings();
}

// Monday of this week, or next Monday from Thursday on
export function defaultStart(now = new Date()) {
  const wd = (now.getDay() + 6) % 7;
  return isoDate(wd >= 3 ? addDays(mondayOf(now), 7) : mondayOf(now));
}

// A new phase can bring other workouts and runs: rebuild the week template and
// apply the Sunday answers again for the weeks still ahead.
async function rebuildWeeks() {
  S.settings.weekPlan = defaultWeekPlan();
  const thisMonday = isoDate(mondayOf());
  const answers = S.settings.weekAnswers || {};
  S.settings.weekOverride = {};
  for (const [key, a] of Object.entries(answers)) {
    if (key >= thisMonday) await answerWeek(key, { team: a.team || [], match: a.match ?? null });
  }
}

// Local testing only: loads the PDFs from the ignored _private folder.
export async function devImport() {
  for (const name of ['training.pdf', 'nutrition.pdf']) {
    const res = await fetch(`_private/${name}`);
    if (!res.ok) continue;
    const blob = await res.blob();
    const file = new File([blob], name, { type: 'application/pdf' });
    await applyImport(await readPdf(file));
  }
}
