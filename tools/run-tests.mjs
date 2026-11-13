// Logic tests. Run: cd tools && node --test run-tests.mjs
// The PDF tests need _private/training.pdf and _private/nutrition.pdf (not in git).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractPdf } from '../js/pdf-text.js';
import { parseTraining, targetFor, parseVideo } from '../js/parse-training.js';
import { parseNutrition } from '../js/parse-nutrition.js';
import { translateTarget, durationOf, intervalOf, sidesOf, isMaxTarget, parseDecimal, vimeoEmbed, isoDate, mondayOf } from '../js/util.js';
import { buildSteps } from '../js/workout.js';
import { shakePlan, recipeFor, SHAKES } from '../js/food.js';
import { S } from '../js/state.js';

const TRAINING = new URL('../_private/training.pdf', import.meta.url);
const NUTRITION = new URL('../_private/nutrition.pdf', import.meta.url);
const have = fs.existsSync(TRAINING) && fs.existsSync(NUTRITION);

async function lines(url) {
  return (await extractPdf(pdfjs, new Uint8Array(fs.readFileSync(url)))).lines;
}

let plan = null;
let nut = null;
if (have) {
  plan = parseTraining(await lines(TRAINING));
  nut = parseNutrition(await lines(NUTRITION));
}

test('training: title, coach, client', { skip: !have }, () => {
  assert.equal(plan.title, 'Phase 1');
  assert.equal(plan.coach, 'Eric Friedlander');
  assert.ok(plan.client && plan.client.length > 3);
  assert.match(plan.preSession, /bike ride/);
});

test('training: 3 days, 104 exercises, every exercise has a video', { skip: !have }, () => {
  assert.equal(plan.days.length, 3);
  assert.equal(plan.stats.exercises, 104);
  assert.equal(plan.stats.videos, 104);
  for (const d of plan.days) for (const s of d.sections) for (const e of s.exercises) {
    assert.ok(e.video, `${e.id} ${e.name} without video`);
    assert.ok(e.name.length > 2 && e.name.length < 60, `odd name ${e.id}: ${e.name}`);
    assert.ok(targetFor(e, 1), `${e.id} ${e.name} without target`);
  }
});

test('training: block order is the same on every day', { skip: !have }, () => {
  for (const d of plan.days) {
    assert.deepEqual(d.sections.map((s) => s.kind), ['warmup', 'warmup2', 'plyo', 'circuit', 'core', 'finisher', 'breathing'], d.id);
  }
});

test('training: rounds per week', { skip: !have }, () => {
  const d1 = plan.days[0];
  const byKind = Object.fromEntries(d1.sections.map((s) => [s.kind, s.rounds]));
  assert.deepEqual(byKind.warmup, { 1: 2, 2: 2, 3: 2, 4: 2 });
  assert.deepEqual(byKind.plyo, { 1: 2, 2: 2, 3: 3, 4: 3 });
  assert.deepEqual(byKind.circuit, { 1: 2, 2: 3, 3: 3, 4: 4 });
  assert.deepEqual(byKind.core, { 1: 3, 2: 3, 3: 4, 4: 4 });
  assert.equal(d1.sections.find((s) => s.kind === 'circuit').restSec, 60);
});

test('training: week specific targets', { skip: !have }, () => {
  const ex = plan.days[0].sections.find((s) => s.kind === 'circuit').exercises[0];
  assert.equal(ex.name, 'Heel Elevated Iso Lunge');
  assert.equal(targetFor(ex, 1), '50 Seconds Each Leg');
  assert.equal(targetFor(ex, 2), '50 Seconds Each Leg');
  assert.equal(targetFor(ex, 3), '60 Seconds Each Leg');
  assert.equal(targetFor(ex, 4), '60 Seconds Each Leg');
  const jump = plan.days[0].sections.find((s) => s.kind === 'warmup2').exercises[0];
  assert.equal(jump.name, 'Jump rope');
  assert.equal(targetFor(jump, 3), '3 Minutes, 30 Seconds');
});

test('training: finisher alternative and breathing', { skip: !have }, () => {
  for (const d of plan.days) {
    const fin = d.sections.find((s) => s.kind === 'finisher');
    assert.equal(fin.exercises.length, 2);
    assert.equal(fin.exercises[1].altOf, fin.exercises[0].id);
    assert.deepEqual(intervalOf([targetFor(fin.exercises[0], 1), ...fin.exercises[0].details].join(', ')), { work: 10, rest: 10, rounds: 12 });
    assert.deepEqual(intervalOf([targetFor(fin.exercises[1], 1), ...fin.exercises[1].details].join(', ')), { work: 20, rest: 30, rounds: 8 });
    assert.deepEqual(intervalOf([targetFor(fin.exercises[1], 4), ...fin.exercises[1].details].join(', ')), { work: 20, rest: 30, rounds: 10 });
    const br = d.sections.find((s) => s.kind === 'breathing').exercises[0];
    assert.equal(br.name, '7-11 Breathing');
    assert.equal(durationOf(targetFor(br, 1)), 300);
  }
});

test('training: schedule, goals, extras', { skip: !have }, () => {
  assert.equal(plan.schedule.length, 7);
  assert.deepEqual(plan.weeklyGoals.filter((g) => g.key).map((g) => [g.key, g.min, g.target]), [
    ['workout', 3, 3], ['fitness', 0, 2], ['ball', 2, 2], ['recovery', 2, 2], ['tv', 4, 4],
  ]);
  assert.equal(plan.extras.filter((x) => x.type === 'fitness').length, 2);
  assert.ok(plan.extras.filter((x) => x.type === 'recovery').every((x) => x.title.length > 3));
  assert.equal(plan.extras.find((x) => x.id === 'rc1').video.provider, 'youtube');
});

test('training: ids are stable when parsed twice', { skip: !have }, async () => {
  const again = parseTraining(await lines(TRAINING));
  assert.deepEqual(again.days.map((d) => d.sections.map((s) => s.exercises.map((e) => e.id))), plan.days.map((d) => d.sections.map((s) => s.exercises.map((e) => e.id))));
});

test('nutrition: targets', { skip: !have }, () => {
  assert.equal(nut.kcal, 3200);
  assert.equal(nut.protein, 155);
  assert.deepEqual(nut.carbs, [350, 420]);
  assert.deepEqual(nut.fat, [90, 100]);
  assert.deepEqual(nut.waterL, [3, 4]);
  assert.equal(nut.creatineG, 5);
  assert.equal(nut.weightKg, 70);
});

test('nutrition: 7 days with 4 complete meals each', { skip: !have }, () => {
  assert.equal(nut.days.length, 7);
  for (const d of nut.days) {
    assert.equal(d.meals.length, 4, `day ${d.n}`);
    for (const m of d.meals) {
      assert.ok(m.name.length > 5, `day ${d.n} ${m.slot}`);
      for (const k of ['kcal', 'p', 'c', 'f']) assert.ok(Number.isFinite(m[k]), `day ${d.n} ${m.slot} ${k}`);
    }
  }
  assert.equal(nut.shopping.length, 6);
});

test('nutrition: shakes bring every plan day near the target', { skip: !have }, () => {
  S.nutrition = nut;
  for (const d of nut.days) {
    const r = shakePlan(d.meals, nut.kcal);
    assert.ok(Math.abs(r.total.kcal - nut.kcal) <= 250, `day ${d.n}: ${r.total.kcal}`);
    assert.ok(r.total.p >= nut.protein, `day ${d.n} protein ${r.total.p}`);
  }
  S.nutrition = null;
});

test('nutrition: every meal gets cooking steps', { skip: !have }, () => {
  for (const d of nut.days) for (const m of d.meals) assert.ok(recipeFor(m.name).length >= 1, `no recipe: ${m.name}`);
});

test('shake values add up', () => {
  for (const s of Object.values(SHAKES)) {
    const calc = s.p * 4 + s.c * 4 + s.f * 9;
    assert.ok(Math.abs(calc - s.kcal) / s.kcal < 0.08, `${s.name}: ${calc} vs ${s.kcal}`);
  }
});

test('workout steps: week 1 and week 4', { skip: !have }, () => {
  for (const d of plan.days) {
    for (const w of [1, 4]) {
      const steps = buildSteps(d, w);
      assert.equal(steps[0].type, 'section');
      assert.equal(steps[steps.length - 1].type, 'finish');
      const exSteps = steps.filter((s) => s.type === 'exercise' || s.type === 'breathing');
      const expected = d.sections.reduce((n, s) => n + (s.rounds[w] || 1) * s.exercises.filter((e) => !e.altOf).length, 0);
      assert.equal(exSteps.length, expected, `${d.id} w${w}`);
      const keys = new Set(exSteps.map((s) => `${s.exId}#${s.round}`));
      assert.equal(keys.size, exSteps.length, 'step keys unique');
      const rests = steps.filter((s) => s.type === 'rest');
      for (const r of rests) assert.ok(r.secs > 0);
    }
  }
});

test('targets: translation and timers', () => {
  assert.equal(translateTarget('50 Seconds Each Leg'), '50 Sek. pro Bein');
  assert.equal(translateTarget('MAXIMUM NUMBER OF REPS in 30 Seconds'), 'Max. Wiederholungen in 30 Sek.');
  assert.equal(translateTarget('2 Reps Short of Failure'), '2 Wdh. vor dem Muskelversagen');
  assert.equal(translateTarget('Repeat 8 Times'), '8 Durchgänge');
  assert.equal(durationOf('3 Minutes, 30 Seconds'), 210);
  assert.equal(durationOf('1 Minute Each Foot'), 60);
  assert.equal(durationOf('12 Pushups'), null);
  assert.equal(durationOf('MAXIMUM NUMBER OF REPS in 30 Seconds'), 30);
  assert.equal(durationOf('20 Reps (40 Total)'), null);
  assert.equal(sidesOf('50 Seconds Each Leg'), 2);
  assert.equal(sidesOf('45 Seconds'), 1);
  assert.ok(isMaxTarget('2 Reps Short of Max'));
  assert.ok(!isMaxTarget('12 Reps'));
});

test('translations leave no English unit words behind', { skip: !have }, () => {
  const left = [];
  for (const d of plan.days) for (const s of d.sections) for (const e of s.exercises) for (const w of [1, 2, 3, 4]) {
    const t = translateTarget(targetFor(e, w));
    if (/\b(Seconds?|Minutes?|Reps?|Each|Total)\b/.test(t)) left.push(`${e.name}: ${t}`);
  }
  assert.deepEqual([...new Set(left)], []);
});

test('helpers: decimals, video links, dates', () => {
  assert.equal(parseDecimal('7,5'), 7.5);
  assert.equal(parseDecimal(''), null);
  assert.equal(parseDecimal('abc'), null);
  const v = parseVideo('https://vimeo.com/111111111/abcdef1234?share=copy');
  assert.deepEqual([v.provider, v.id, v.hash], ['vimeo', '111111111', 'abcdef1234']);
  assert.match(vimeoEmbed(v), /player\.vimeo\.com\/video\/111111111\?h=abcdef1234/);
  const y = parseVideo('https://www.youtube.com/watch?v=NeQZeVaPErw&t=2s');
  assert.deepEqual([y.provider, y.id, y.start], ['youtube', 'NeQZeVaPErw', 2]);
  assert.equal(parseVideo('https://vimeo.com/222222222?share=copy').hash, null);
  assert.equal(isoDate(mondayOf(new Date(2026, 10, 11))), '2026-11-09');
  assert.equal(isoDate(mondayOf(new Date(2026, 10, 15))), '2026-11-09');
  assert.equal(isoDate(mondayOf(new Date(2026, 10, 16))), '2026-11-16');
});

// ---- Added with figures, logging and activities
import { LIB, lookup, sequence, needsWeight, P } from '../js/exercises.js';
import { measureOf } from '../js/exview.js';
import { catalog, defaultWeekPlan, weekGoals, pendingWeekQuestion, answerWeek, weekPlan } from '../js/activities.js';

test('every exercise in the plan has a figure and German steps', { skip: !have }, () => {
  const missing = [];
  for (const d of plan.days) for (const s of d.sections) for (const e of s.exercises) {
    const entry = lookup(e.name);
    if (!entry || entry.generic || !entry.steps?.length) missing.push(e.name);
    else for (const item of sequence(entry)) assert.ok(item.pose, `${e.name}: unknown pose`);
  }
  assert.deepEqual([...new Set(missing)], []);
});

test('library poses all exist', () => {
  for (const [k, e] of Object.entries(LIB)) {
    for (const s of e.seq) {
      const name = typeof s === 'string' ? s : Array.isArray(s) ? s[0] : null;
      if (name) assert.ok(P[name], `${k}: pose ${name} missing`);
    }
  }
});

test('weights only where equipment is needed', { skip: !have }, () => {
  const weighted = new Set();
  for (const d of plan.days) for (const s of d.sections) for (const e of s.exercises) if (needsWeight(e.name)) weighted.add(e.name);
  assert.deepEqual([...weighted].sort(), ['DB Standing Shoulder Press', 'Dumbbell Lateral Raises', "Overhead Farmer's Walks", 'Weighted Pushups', 'Weighted V']);
});

test('logging measure per exercise', { skip: !have }, () => {
  const find = (n) => plan.days.flatMap((d) => d.sections.flatMap((s) => s.exercises)).find((e) => e.name === n);
  assert.deepEqual(measureOf(find('Eccentric Pushups'), '12 Pushups'), { unit: 'Wdh.', value: 12, step: 1, perSide: false });
  assert.equal(measureOf(find('Heel Elevated Iso Lunge'), '50 Seconds Each Leg').unit, 'Sek.');
  assert.equal(measureOf(find('Heel Elevated Iso Lunge'), '50 Seconds Each Leg').perSide, true);
  assert.equal(measureOf(find('Lateral Bounds'), '5-6 Each Leg').value, 6);
  assert.equal(measureOf(find('Hands Off Explosive Pushups'), 'MAXIMUM NUMBER OF REPS in 30 Seconds').max, true);
  const br = find('Battle Ropes (Alternating Pattern)');
  assert.deepEqual(measureOf(br, targetFor(br, 1)), { unit: 'Durchgänge', value: 12, step: 1 });
});

test('activities: runs parsed from the plan, default week is complete', { skip: !have }, () => {
  S.plan = plan;
  S.settings = { weekPlan: null };
  S.sessions = [];
  S.daily = {};
  const c = catalog();
  const fs1 = c.find((a) => a.id === 'fs1');
  const fs2 = c.find((a) => a.id === 'fs2');
  assert.deepEqual(fs1.spec.minutes, { 1: 10, 2: 10, 3: 12, 4: 12 });
  assert.equal(fs2.spec.sets, 4);
  assert.equal(fs2.spec.hard.min, 4);
  assert.equal(fs2.spec.hard.tread, '15,2–18,0 km/h');
  assert.equal(fs2.spec.easy.tread, '9–10,4 km/h');
  assert.equal(c.filter((a) => a.kind === 'recovery').length, 4);
  const wk = defaultWeekPlan();
  assert.equal(wk.length, 7);
  const flat = wk.flat();
  assert.equal(flat.filter((id) => ['d1', 'd2', 'd3'].includes(id)).length, 3);
  assert.equal(flat.filter((id) => id === 'football').length, 0);
  assert.ok(flat.includes('fs1') && flat.includes('fs2'));
  assert.ok(flat.includes('rest'));
  for (const id of flat) assert.ok(c.find((a) => a.id === id), `unknown activity ${id}`);
  const goals = weekGoals();
  assert.deepEqual(goals.map((g) => g.key), ['workout', 'fitness', 'ball', 'recovery', 'tv']);
  S.plan = null;
});

test('sunday check-in builds the week around team training and a match', { skip: !have }, async () => {
  S.plan = plan;
  S.settings = { weekPlan: null };
  S.sessions = [];
  S.daily = {};
  const sunday = new Date(2026, 10, 15);
  const q = pendingWeekQuestion(sunday);
  assert.equal(q.key, '2026-11-16');
  assert.equal(pendingWeekQuestion(new Date(2026, 10, 12)), null);
  assert.equal(pendingWeekQuestion(new Date(2026, 10, 16)).key, '2026-11-16');
  // saveSettings needs IndexedDB, so stub it for node
  globalThis.indexedDB = undefined;
  try { await answerWeek(q.key, { team: [1, 3], match: 5 }); } catch (e) { /* no IndexedDB in node */ }
  const wk = weekPlan(new Date(2026, 10, 18));
  assert.ok(wk[1].includes('football') && wk[3].includes('football'));
  assert.deepEqual(wk[5], ['match']);
  assert.ok(!wk[1].includes('fs2') && !wk[3].includes('fs1'), 'no run on team training days');
  assert.ok(!wk[4].some((id) => ['d1', 'd2', 'd3', 'fs1'].includes(id)), 'no workout the day before the match');
  assert.ok(wk[6].includes('rest'));
  assert.equal(pendingWeekQuestion(sunday), null);
  const goals = weekGoals(new Date(2026, 10, 18));
  assert.equal(goals.find((g) => g.key === 'football').target, 3);
  S.plan = null;
});

// ---- Later phases (Phase 5 as PDF, Phase 8 as Word). Files live in _private and are not in git.
import { extractDocx } from '../js/docx-text.js';
const P5 = new URL('../_private/phase5.pdf', import.meta.url);
const P8 = new URL('../_private/phase8.docx', import.meta.url);

test('phase 5 (PDF) is read with all blocks', { skip: !fs.existsSync(P5) }, async () => {
  const p = parseTraining(await lines(P5));
  assert.equal(p.title, 'Phase 5');
  assert.equal(p.days.length, 4);
  assert.ok(p.stats.exercises >= 100, `${p.stats.exercises} exercises`);
  const kinds = new Set(p.days.flatMap((d) => d.sections.map((s) => s.kind)));
  for (const k of ['warmup', 'plyo', 'power', 'strength', 'complex', 'breathing', 'stretch']) assert.ok(kinds.has(k), `missing ${k}`);
  const d1 = p.days[0];
  assert.equal(d1.subtitle, 'Lower Body');
  assert.deepEqual(d1.sections.find((s) => s.kind === 'power').rounds, { 1: 3, 2: 3, 3: 4, 4: 4 });
  for (const d of p.days) for (const s of d.sections) for (const e of s.exercises) assert.ok(!/superset|rest in between|^the goal/i.test(e.name), `junk exercise ${e.name}`);
});

test('phase 8 (Word) is read, including stretches', { skip: !fs.existsSync(P8) }, async () => {
  const { lines: l } = await extractDocx(new Uint8Array(fs.readFileSync(P8)));
  const p = parseTraining(l);
  assert.equal(p.title, 'Phase 8');
  assert.equal(p.days.length, 8);
  assert.equal(p.stats.exercises, p.stats.videos);
  assert.ok(p.days.every((d) => d.sections.length > 0), 'every day has blocks');
  const stretches = p.days.flatMap((d) => d.sections.filter((s) => s.kind === 'stretch').flatMap((s) => s.exercises.map((e) => e.name)));
  assert.ok(stretches.includes('90-90 Stretch'));
  assert.ok(stretches.includes('Swiss Ball Pec Stretch'));
  assert.ok(p.extras.some((x) => x.type === 'fitness'));
});

// ---- Habits and game
import { HABITS, habitDone, streak, bestStreak, totalXp, levelOf, badges, seasonPath, dayScore, LEVELS } from '../js/habits.js';

test('habits: streaks, points, levels, badges, season path', () => {
  const t = new Date();
  const iso = (n) => { const d = new Date(t.getFullYear(), t.getMonth(), t.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  S.plan = null;
  S.nutrition = { protein: 155, days: [] };
  S.photos = [];
  S.sessions = [];
  S.settings = { planStart: iso(9), seasonStart: iso(-30), habitsOff: [], habitsOwn: [] };
  S.daily = {};
  // 8 days of creatine in a row up to yesterday, reading only yesterday, today nothing yet
  for (let i = 1; i <= 8; i++) S.daily[iso(i)] = { date: iso(i), creatine: true, waterMl: 3200, sleepH: 8, habits: { read: i === 1 } };
  const crea = HABITS.find((h) => h.id === 'creatine');
  const read = HABITS.find((h) => h.id === 'read');
  assert.equal(habitDone(crea, iso(1)), true);
  assert.equal(streak(crea), 8, 'open today does not break the streak');
  assert.equal(streak(read), 1);
  assert.equal(bestStreak(crea), 8);
  // Manual tick wins, and water from the input counts automatically
  assert.equal(habitDone(HABITS.find((h) => h.id === 'water'), iso(2)), true);
  const xp = totalXp();
  // 8 days x (creatine, water, sleep) = 24 habits, 1 read, +3 streak-7 bonuses (creatine, water, sleep)
  assert.equal(xp, 25 * 10 + 3 * 50);
  const lv = levelOf(xp);
  assert.equal(lv.title, LEVELS[1].title, '400 XP is exactly level 2');
  assert.equal(levelOf(2600).title, 'Stammspieler');
  assert.equal(levelOf(999999).next, null);
  const b = Object.fromEntries(badges().map((x) => [x.id, x.got]));
  assert.equal(b.s7, true);
  assert.equal(b.first, false);
  const path = seasonPath();
  assert.equal(path.days.length, 9 + 30 + 1);
  assert.ok(path.days.find((d) => d.today));
  assert.equal(path.days[path.days.length - 1].state, 'future');
  // Meal prep only on Wednesday and Sunday
  const mp = dayScore(iso(0)).list.some((h) => h.id === 'mealprep');
  assert.equal(mp, [2, 6].includes((t.getDay() + 6) % 7));
});
