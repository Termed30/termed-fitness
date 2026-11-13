// Home ("Heute"), the training overview and the week planner.
import { S, today, saveDaily, planWeek, rawWeek, nextDay, seasonDaysLeft, doneSessions } from './state.js';
import {
  catalog, byId, weekPlan, setDayPlan, defaultWeekPlan, weekdayIndex, isDone, guidance, minutesLabel, weekGoals,
  planDates, logActivity, weekLoad, pendingWeekQuestion, answerWeek,
} from './activities.js';
import { targetFor } from './parse-training.js';
import { esc, fmtLongDate, fmtNum, isoDate, avg, translateTarget, addDays, fmtShortDate } from './util.js';
import { icon } from './icons.js';
import { go, toast, centerCircle, chips, stepper } from './ui.js';
import { startWorkout, discardWorkout, workoutProgressLabel } from './workout.js';
import { homeMessages, REASONS } from './coach.js';
import { planDayIndex, shakePlan } from './food.js';
import { figurePanel, mountPanels } from './exview.js';
import { readPdf } from './importer.js';
import { habitRowsMeta, dayScore, toggleHabit, levelOf, totalXp, seasonPath, streakLine, checkLevelUp, proteinEaten, ACTIVITY_HABIT, checkNewBadges, checkPerfectDay, XP, roleModel } from './habits.js';
import { stage, animate } from './figure.js';
import { hydratePhotos } from './photos.js';
import { CELEBRATE, FREEKICK, HEADER } from './exercises.js';
import { setPendingImport } from './views.js';

const KIND_SHORT = { warmup: 'Warm-up', warmup2: 'Cardio', plyo: 'Plyos', circuit: 'Zirkel', core: 'Core', finisher: 'Finisher', breathing: 'Atmung', power: 'Power', strength: 'Kraft', complex: 'Komplex', stretch: 'Stretching', main: 'Übungen', speed: 'Speed' };
const KIND_ICON = { workout: 'dumbbell', run: 'activity', football: 'zap', recovery: 'heart-pulse', habit: 'circle-check', rest: 'moon' };
const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const WD_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

export function estimateMin(day, week) {
  let sec = 0;
  for (const s of day.sections) {
    const r = s.rounds[week] || 1;
    const n = s.exercises.filter((e) => !e.altOf).length;
    sec += r * n * (s.kind === 'breathing' || s.kind === 'finisher' ? 300 : 55) + (r - 1) * (s.restSec || 0);
  }
  return Math.round(sec / 300) * 5;
}

function blocksLine(day, week, dark = false) {
  return `<ul class="blocks${dark ? ' dark' : ''}">${day.sections.map((s) => {
    const r = s.rounds[week] || 1;
    return `<li><span>${KIND_SHORT[s.kind] || s.title}</span>${r > 1 ? `<span class="num">${r}×</span>` : ''}</li>`;
  }).join('')}</ul>`;
}

const order = (a) => ({ workout: 0, run: 1, football: 2, recovery: 3, rest: 4, habit: 5 }[a.kind] ?? 9);

function dayItems(i) {
  return (weekPlan()[i] || []).map(byId).filter(Boolean).sort((a, b) => order(a) - order(b));
}

// ---------- Week strip, shared by Home and Training

function weekStrip(sel, { link = 'home' } = {}) {
  const dates = planDates();
  const todayI = weekdayIndex();
  return `<div class="wstrip" role="tablist" aria-label="Diese Woche">${dates.map((d, i) => {
    const items = dayItems(i).filter((a) => a.kind !== 'habit');
    const date = isoDate(d);
    return `<button role="tab" class="wday${i === sel ? ' on' : ''}${i === todayI ? ' today' : ''}" data-day="${i}" data-link="${link}" aria-selected="${i === sel}">
      <span class="wday-name">${WD[i]}</span>
      <span class="wday-date num">${d.getDate()}</span>
      <span class="wday-marks">${items.map((a) => `<i class="${a.kind}${isDone(a, date) ? ' done' : ''}"></i>`).join('') || '<i class="none"></i>'}</span>
    </button>`;
  }).join('')}</div>`;
}

// ---------- Hero for the main activity of a day

function hero(a, date, isToday) {
  const week = planWeek();
  if (!a) {
    return `<article class="hero-card"><div class="hero-top"><span>${isToday ? 'Heute' : 'Geplant'}</span></div><h2>Nichts geplant</h2>
      <p class="hero-text">Trag im Wochenplan ein, was an diesem Tag ansteht.</p>
      <div class="hero-actions"><a class="btn cream grow" href="#/woche">${icon('calendar')} Wochenplan</a></div></article>`;
  }
  const done = isDone(a, date);
  if (a.kind === 'workout') {
    let day = S.plan.days.find((d) => d.id === a.dayId);
    if (a.next && done) {
      // Show the workout that was actually done today, not the one coming next
      const s = S.sessions.filter((x) => x.status === 'done' && x.date === date && (!x.kind || x.kind === 'workout')).pop();
      day = S.plan.days.find((d) => d.id === s?.dayId && s.planId === S.plan.id) || { ...day, title: 'Workout' };
    }
    const active = S.active && S.active.dayId === a.dayId;
    return `
    <article class="hero-card">
      <div class="hero-top"><span>${active ? 'Unterbrochen' : done ? 'Erledigt' : isToday ? 'Heute' : 'Geplant'}</span><span class="num">${active ? esc(workoutProgressLabel()) : `ca. ${estimateMin(day, week)} Min`}</span></div>
      <h2>${esc(day.title)}</h2>
      ${blocksLine(day, week)}
      <p class="hero-text">${esc(guidance(a))}</p>
      <div class="hero-actions">
        ${active ? `<button class="btn cream grow" data-act="resume">${icon('play')} Fortsetzen</button><button class="btn ghost-light" data-act="discard">Verwerfen</button>`
          : done ? `<a class="btn ghost-light grow" href="#/fortschritt">${icon('chart-line')} Ergebnis ansehen</a>`
          : `<button class="btn cream grow" data-act="start" data-day="${day.id}">${icon('play')} Starten</button><a class="btn ghost-light" href="#/training/${day.id}">Übungen</a>`}
      </div>
    </article>`;
  }
  const visual = a.kind === 'run' && a.mode === 'bouts'
    ? `<div class="bouts light">${Array.from({ length: a.spec.sets * 2 }, (_, i) => `<span class="bout${i % 2 ? '' : ' hard'}" style="flex:1"></span>`).join('')}</div>`
    : '';
  const action = a.kind === 'rest'
    ? `<a class="btn cream grow" href="#/einheit/rest">${icon('moon')} Ideen für den Ruhetag</a>`
    : done ? `<span class="hero-done">${icon('circle-check')} Eingetragen</span>`
    : `<a class="btn cream grow" href="#/einheit/${a.id}">${icon(a.kind === 'football' ? 'check' : 'play')} ${a.kind === 'football' ? 'Einheit eintragen' : 'Starten'}</a>`;
  return `
  <article class="hero-card">
    <div class="hero-top"><span>${done ? 'Erledigt' : isToday ? 'Heute' : 'Geplant'}</span><span class="num">${esc(minutesLabel(a))}</span></div>
    <h2>${esc(a.title)}</h2>
    ${visual}
    <p class="hero-text">${esc(guidance(a))}</p>
    <div class="hero-actions">${action}</div>
  </article>`;
}

function itemRow(a, date) {
  const done = isDone(a, date);
  const href = a.kind === 'workout' ? `#/training/${a.dayId}` : `#/einheit/${a.id}`;
  const quick = a.kind === 'habit';
  return `
  <li class="item${done ? ' done' : ''}">
    <span class="item-icon">${icon(KIND_ICON[a.kind] || 'circle-check', 18)}</span>
    <a class="item-main" href="${href}">
      <span class="item-title">${esc(a.title)}</span>
      <span class="item-meta muted small">${esc(minutesLabel(a) || a.note || '')}</span>
    </a>
    ${quick ? `<button class="check-btn${done ? ' on' : ''}" data-act="habit" data-id="${a.id}" aria-label="${esc(a.title)} ${done ? 'erledigt' : 'abhaken'}">${icon('check', 16)}</button>`
      : done ? `<span class="check-btn on" aria-label="erledigt">${icon('check', 16)}</span>` : `<a class="item-go" href="${href}" aria-label="${esc(a.title)} öffnen">${icon('chevron-right', 18)}</a>`}
  </li>`;
}

// ---------- Home

let homeSel = null;

function gameCard() {
  const lv = levelOf(totalXp());
  const path = seasonPath();
  const ti = path.days.findIndex((x) => x.today);
  const from = Math.max(0, ti - 6);
  const strip = path.days.slice(from, from + 21);
  const streaks = streakLine(2);
  return `
  <a class="card game" href="#/fortschritt?saison=1">
    <div class="game-top">
      ${centerCircle({ size: 64, pct: lv.pct, value: String(lv.n), id: 'lv-ring' })}
      <div class="game-text">
        <span class="game-level">${esc(lv.title)}</span>
        <span class="num muted small">${fmtNum(lv.xp)} XP${lv.next ? ` · noch ${fmtNum(lv.to - lv.xp)} bis ${esc(lv.next)}` : ''}</span>
        ${streaks.length ? `<span class="game-streaks small">${icon('flame', 14)} ${streaks.join(' · ')}</span>` : ''}
      </div>
    </div>
    <div class="season-strip" aria-label="Saison-Weg">${strip.map((x) => `<i class="${x.state}${x.today ? ' now' : ''}"></i>`).join('')}</div>
    <span class="muted small">Saison-Weg: ${path.done} gute Tage, noch ${path.left} Tage bis zum Saisonstart</span>
  </a>`;
}

function roleCard() {
  const r = roleModel();
  const idol = S.idols.length ? S.idols[Number(isoDate().replace(/-/g, '')) % S.idols.length] : null;
  return `
  <article class="card role${idol ? ' with-img' : ''}">
    ${idol ? `<img class="role-img" data-photo="${idol.id}" alt="Vorbild">` : ''}
    <span class="coach-mark">Vorbild · Cristiano Ronaldo</span>
    ${r.quote ? `<p class="role-quote">„${esc(r.quote.text)}“</p><span class="muted small">${esc(r.quote.by)}</span>`
      : `<p>${esc(r.text)}</p><span class="muted small">Passt zu deinem Habit: ${esc(r.habit.title)}</span>`}
  </article>`;
}

function habitRow(h, done, st, d) {
  let control = '';
  if (h.input === 'water') control = `<span class="hb-ctl"><span class="num small">${fmtNum((d.waterMl || 0) / 1000, 1)} L</span><button class="btn-icon sm" data-act="water" data-ml="500" aria-label="500 ml dazu">${icon('plus', 16)}</button></span>`;
  else if (h.input === 'sleep') control = `<span class="hb-ctl">${stepper({ name: 'sleepH', value: d.sleepH ?? null, step: 0.5, min: 0, max: 14, unit: 'h', digits: 1 })}</span>`;
  else if (h.input === 'protein') control = `<a class="hb-ctl num small" href="#/essen">${fmtNum(proteinEaten(d))} / ${S.nutrition?.protein || 155} g</a>`;
  return `
  <li class="hb${done ? ' done' : ''}">
    <button class="check-btn${done ? ' on' : ''}" data-act="hb" data-id="${esc(h.id)}" aria-pressed="${done}" aria-label="${esc(h.title)} ${done ? 'erledigt' : 'abhaken'}">${icon('check', 16)}</button>
    <span class="hb-main">
      <span class="hb-title">${esc(h.title)}</span>
      ${st >= 2 ? `<span class="hb-streak small">${icon('flame', 12)} <span class="num">${st}</span> Tage</span>` : ''}
    </span>
    ${control}
  </li>`;
}

function xpPop(el, text) {
  const r = el.getBoundingClientRect();
  const pop = document.createElement('span');
  pop.className = 'xp-pop num';
  pop.textContent = text;
  pop.style.left = `${r.left + r.width / 2}px`;
  pop.style.top = `${r.top + window.scrollY}px`;
  document.body.appendChild(pop);
  setTimeout(() => pop.remove(), 900);
}

const celebrations = [];
function celebrate({ kicker, title, text, seq }) {
  celebrations.push({ kicker, title, text, seq });
  if (celebrations.length === 1) showNext();
}
function showNext() {
  const c = celebrations[0];
  if (!c) return;
  const idol = S.idols.length ? S.idols[Math.floor(Math.random() * S.idols.length)] : null;
  const el = document.createElement('div');
  el.className = 'levelup';
  el.setAttribute('role', 'dialog');
  el.innerHTML = `<div class="levelup-card">
    ${idol ? `<div class="levelup-img"><img data-photo="${idol.id}" data-size="blob" alt="Vorbild"></div>` : `<div class="levelup-fig">${stage()}</div>`}
    <span class="muted small">${esc(c.kicker)}</span>
    <h2>${esc(c.title)}</h2>
    <p class="muted">${esc(c.text)}</p>
    <button class="btn primary">Weiter</button>
  </div>`;
  el.onclick = (e) => {
    if (!e.target.closest('button') && e.target !== el) return;
    el.remove();
    celebrations.shift();
    showNext();
  };
  document.body.appendChild(el);
  if (idol) hydratePhotos(el);
  else animate(el.querySelector('svg'), c.seq, { player: true });
}

export function levelUp(lv) {
  celebrate({ kicker: `Neues Level ${lv.n}`, title: lv.title, text: lv.next ? `Nächste Station: ${lv.next}.` : 'Höchstes Level. Legende.', seq: CELEBRATE });
}

async function checkCelebrations() {
  const lv = await checkLevelUp();
  if (lv) levelUp(lv);
  for (const b of await checkNewBadges()) celebrate({ kicker: 'Neues Abzeichen', title: b.title, text: b.text, seq: FREEKICK });
  if (await checkPerfectDay()) celebrate({ kicker: 'Perfekter Tag', title: 'Alle Habits geschafft', text: `+${XP.perfect} XP extra. Genau so sieht ein Profi-Tag aus.`, seq: HEADER });
}

function phaseCard(over) {
  if (!over) return '';
  const done = doneSessions();
  const first = done[0];
  return `
  <article class="card phase-end">
    <div class="card-head"><h2>${esc(S.plan.title)} geschafft</h2><span class="muted small num">${done.length} Workouts</span></div>
    <p class="small">Lade das nächste PDF von ${esc(S.plan.coach || 'deinem Coach')} hoch. Workouts, Läufe, Wochenplan und Ziele werden neu aufgebaut. Dein Verlauf mit Fotos, Gewichten und Notizen bleibt.</p>
    ${first ? `<p class="muted small">Seit ${esc(new Date(first.finishedAt).toLocaleDateString('de-AT'))} dabei.</p>` : ''}
    <label class="btn primary">${icon('upload')} Nächstes PDF hochladen<input type="file" accept="application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" id="next-pdf" hidden></label>
  </article>`;
}
let weekDraft = null;

function weekQuestion(q) {
  if (!q) return '';
  const prev = Object.values(S.settings.weekAnswers || {}).sort((a, b) => b.at - a.at)[0];
  weekDraft ||= { key: q.key, team: [...(prev?.team || [])], match: prev?.match ?? null };
  return `
  <article class="card weekq">
    <div class="card-head"><h2>${q.next ? 'Deine nächste Woche' : 'Diese Woche'}</h2><span class="muted small num">ab ${fmtShortDate(q.monday)}</span></div>
    <p class="small">Hast du Teamtraining oder ein Spiel? Dann baue ich die Woche darum herum: kein Workout am Tag vor dem Spiel, Recovery am Tag danach.</p>
    <div class="pick-group"><span class="muted small">Teamtraining</span>
      <div class="chips">${WD.map((d, i) => `<button type="button" class="chip${weekDraft.team.includes(i) ? ' on' : ''}" data-wq="team" data-i="${i}" aria-pressed="${weekDraft.team.includes(i)}">${d}</button>`).join('')}</div>
    </div>
    <div class="pick-group"><span class="muted small">Spiel</span>
      <div class="chips">${WD.map((d, i) => `<button type="button" class="chip${weekDraft.match === i ? ' on' : ''}" data-wq="match" data-i="${i}" aria-pressed="${weekDraft.match === i}">${d}</button>`).join('')}</div>
    </div>
    <div class="row">
      <button class="btn secondary" data-act="wq-none">Nichts davon</button>
      <button class="btn primary grow" data-act="wq-save" ${weekDraft.team.length || weekDraft.match != null ? '' : 'disabled'}>${icon('check')} Übernehmen</button>
    </div>
  </article>`;
}

export function renderHome(root) {
  const now = new Date();
  const todayI = weekdayIndex(now);
  const sel = homeSel ?? todayI;
  const date = isoDate(planDates()[sel]);
  const isToday = sel === todayI;
  const items = dayItems(sel);
  const main = S.active ? byId(S.active.dayId) : items.find((a) => a.kind !== 'habit' && !isDone(a, date)) || items.find((a) => a.kind !== 'habit') || null;
  const rest = items.filter((a) => a !== main);
  const d = today();
  const goals = weekGoals();
  const goalPct = goals.length ? avg(goals.map((g) => Math.min(1, g.done / g.target))) : 0;
  const left = seasonDaysLeft();
  const msgs = homeMessages();
  const over = rawWeek() > (S.plan.weeks || 4);
  const n = S.nutrition;
  const foodPlan = n ? shakePlan(n.days[planDayIndex()]?.meals || [], n.kcal || 3000) : null;
  const tomorrow = dayItems((todayI + 1) % 7).filter((a) => a.kind !== 'habit');
  const score = dayScore(isoDate());

  root.innerHTML = `
  <section class="page">
    <header class="page-head">
      <p class="muted">${esc(S.plan.title)} · Woche ${planWeek()} von ${S.plan.weeks}${over ? ' · abgeschlossen' : ''}${left > 0 ? ` · Saisonstart in ${left} Tagen` : ''}</p>
      <h1>${fmtLongDate(now)}</h1>
    </header>

    ${gameCard()}

    ${phaseCard(over)}

    ${weekQuestion(pendingWeekQuestion())}

    ${weekStrip(sel)}

    ${hero(main, date, isToday)}

    ${rest.length ? `<ul class="items">${rest.map((a) => itemRow(a, date)).join('')}</ul>` : ''}
    <div class="row between small">
      ${isToday && tomorrow.length ? `<span class="muted">Morgen: ${tomorrow.map((a) => esc(a.short || a.title)).join(', ')}</span>` : `<span class="muted">${WD_LONG[sel]}</span>`}
      <a class="link" href="#/woche">Woche planen</a>
    </div>

    ${msgs.map((m) => `
    <div class="coach">
      <span class="coach-mark">Coach</span>
      <p>${esc(m.text)}</p>
      ${m.ask === 'reason' ? chips('reason', REASONS, d.reason) : ''}
    </div>`).join('')}

    <div class="section-head"><h2>Diese Woche</h2><span class="num muted small">Belastung ${fmtNum(weekLoad())}</span></div>
    <div class="card week">
      ${centerCircle({ size: 112, pct: goalPct, value: `${Math.round(goalPct * 100)} %`, label: 'Wochenziel' })}
      <ul class="goals">
        ${goals.map((g) => `
        <li>
          <span class="goal-label">${esc(g.label)}</span>
          <span class="goal-bar"><i style="width:${Math.min(100, (g.done / g.target) * 100)}%"></i></span>
          <span class="num${g.done >= g.min ? ' ok' : ''}">${g.done}/${g.min !== g.target ? `${g.min}–${g.target}` : g.target}</span>
        </li>`).join('')}
      </ul>
    </div>

    <div class="section-head" id="habits"><h2>Habits heute</h2><span class="num muted">${score.done} von ${score.total}</span></div>
    <ul class="habits">
      ${habitRowsMeta().map(({ h, done, streak: st }) => habitRow(h, done, st, d)).join('')}
    </ul>
    <a class="link" href="#/mehr?habits=1">Habits verwalten</a>

    ${roleCard()}

    <div class="section-head"><h2>Körper</h2>${d.health ? `<span class="muted small">Health ${esc(d.health.time || '')}</span>` : ''}</div>
    <div class="card checkin">
      <div class="ci-row">
        <span class="ci-label">${icon('activity')} Muskelkater</span>
        ${chips('soreness', [{ value: 0, label: 'Keiner' }, { value: 1, label: 'Leicht' }, { value: 2, label: 'Stark' }], d.soreness)}
      </div>
      <div class="ci-row">
        <span class="ci-label">${icon('scale')} Gewicht</span>
        ${stepper({ name: 'weight', value: d.weight ?? lastWeight(), step: 0.1, min: 30, max: 150, unit: 'kg', digits: 1 })}
      </div>
      ${d.health?.steps || d.health?.rhr ? `<p class="muted small">${d.health.steps ? `${fmtNum(d.health.steps)} Schritte` : ''}${d.health.rhr ? ` · Ruhepuls ${d.health.rhr}` : ''}${d.health.hrv ? ` · HRV ${d.health.hrv}` : ''}</p>` : ''}
    </div>

    ${n ? `
    <a class="card link-card" href="#/essen">
      <span>
        <span class="muted small">Essen heute · Plan-Tag ${n.days[planDayIndex()]?.n}</span>
        <span class="num big">${fmtNum(foodPlan.total.kcal)} kcal · ${fmtNum(foodPlan.total.p)} g Eiweiß</span>
      </span>
      ${icon('chevron-right', 20)}
    </a>` : `<a class="card link-card" href="#/mehr"><span>Ernährungsplan hochladen</span>${icon('chevron-right', 20)}</a>`}
  </section>`;

  hydratePhotos(root);
  checkCelebrations();
  const nextPdf = root.querySelector('#next-pdf');
  if (nextPdf) nextPdf.onchange = async () => {
    const f = nextPdf.files?.[0];
    if (!f) return;
    toast('PDF wird gelesen');
    try {
      setPendingImport(await readPdf(f));
      go('#/mehr');
    } catch (e) {
      toast(e.message || 'Das PDF konnte ich nicht lesen');
      nextPdf.value = '';
    }
  };
  root.onclick = async (ev) => {
    const wq = ev.target.closest('[data-wq]');
    if (wq) {
      const i = Number(wq.dataset.i);
      if (wq.dataset.wq === 'team') weekDraft.team = weekDraft.team.includes(i) ? weekDraft.team.filter((x) => x !== i) : [...weekDraft.team, i].sort();
      else weekDraft.match = weekDraft.match === i ? null : i;
      if (weekDraft.match != null) weekDraft.team = weekDraft.team.filter((x) => x !== weekDraft.match);
      renderHome(root);
      return;
    }
    const wqAct = ev.target.closest('[data-act="wq-save"],[data-act="wq-none"]');
    if (wqAct) {
      const q = pendingWeekQuestion();
      const none = wqAct.dataset.act === 'wq-none';
      await answerWeek(q.key, none ? {} : { team: weekDraft.team, match: weekDraft.match });
      weekDraft = null;
      toast(none ? 'Alles klar, die Woche bleibt wie geplant' : 'Woche angepasst');
      renderHome(root);
      return;
    }
    const dayBtn = ev.target.closest('.wday');
    if (dayBtn) { homeSel = Number(dayBtn.dataset.day); renderHome(root); return; }
    const chip = ev.target.closest('.chips .chip');
    if (chip) {
      const name = chip.closest('.chips').dataset.chips;
      if (name === 'reason') d.reason = chip.dataset.value;
      if (name === 'soreness') d.soreness = Number(chip.dataset.value);
      await saveDaily();
      renderHome(root);
      return;
    }
    const sb = ev.target.closest('[data-step-dir]');
    if (sb) {
      const wrap = sb.closest('[data-stepper]');
      const name = wrap.dataset.stepper;
      const step = Number(wrap.dataset.step);
      const dir = Number(sb.dataset.stepDir);
      const cur = d[name] ?? (name === 'sleepH' ? 7.5 - step * dir : lastWeight() ?? S.settings.weightKg ?? 70);
      d[name] = Math.round(Math.min(Number(wrap.dataset.max), Math.max(Number(wrap.dataset.min), cur + step * dir)) * 10) / 10;
      await saveDaily();
      wrap.querySelector('output').innerHTML = `${fmtNum(d[name], 1)}<small> ${name === 'sleepH' ? 'h' : 'kg'}</small>`;
      return;
    }
    const el = ev.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    if (act === 'hb') {
      const on = await toggleHabit(el.dataset.id);
      if (on) xpPop(el, '+10 XP');
      const y = window.scrollY;
      setTimeout(() => { renderHome(root); window.scrollTo(0, y); }, on ? 350 : 0);
      return;
    }
    if (act === 'start') await startWorkout(el.dataset.day);
    else if (act === 'resume') go('#/workout');
    else if (act === 'discard') {
      if (confirm('Unterbrochenes Workout verwerfen? Die Einträge dazu gehen verloren.')) { await discardWorkout(); renderHome(root); }
    } else if (act === 'habit') {
      const a = byId(el.dataset.id);
      const hid = ACTIVITY_HABIT[a.id];
      if (hid) { const on = await toggleHabit(hid, date); if (on) xpPop(el, '+10 XP'); }
      else if (!isDone(a, date)) { await logActivity(a, { minutes: 15, date }); toast(`${a.title} abgehakt`); }
      renderHome(root);
    } else if (act === 'water') {
      d.waterMl = (d.waterMl || 0) + Number(el.dataset.ml);
      await saveDaily();
      renderHome(root);
    } else if (act === 'creatine') {
      d.creatine = el.checked;
      await saveDaily();
    }
  };
}

function lastWeight() {
  const days = Object.values(S.daily).filter((x) => x.weight).sort((a, b) => (a.date < b.date ? -1 : 1));
  return days.length ? days[days.length - 1].weight : null;
}

function pitchMini() {
  const side = (n) => {
    const s = [[8, 8, 92, 8], [92, 8, 92, 62], [92, 62, 8, 62], [8, 62, 8, 8]];
    return `<svg class="pitch" viewBox="0 0 100 70" aria-hidden="true"><rect x="8" y="8" width="84" height="54" class="pt-field"/><line x1="50" y1="8" x2="50" y2="62" class="pt-mark"/><circle cx="50" cy="35" r="9" class="pt-mark"/>${s.map((l, i) => `<line x1="${l[0]}" y1="${l[1]}" x2="${l[2]}" y2="${l[3]}" class="${i >= 4 - n ? 'pt-sprint' : 'pt-jog'}"/>`).join('')}</svg>`;
  };
  return `<div class="pitch-rep compact">${[1, 2, 3, 4].map(side).join('')}</div>`;
}

// ---------- Training overview

export function renderTraining(root, params = {}) {
  const week = Number(params.w) || planWeek();
  const weekOpts = Array.from({ length: S.plan.weeks }, (_, i) => ({ value: i + 1, label: `Woche ${i + 1}` }));
  const all = catalog();
  const group = (g) => all.filter((a) => a.group === g);
  const goals = Object.fromEntries(weekGoals().map((g) => [g.key, g]));
  const goalText = (k) => (goals[k] ? `${goals[k].done} von ${goals[k].min !== goals[k].target ? `${goals[k].min}–${goals[k].target}` : goals[k].target} diese Woche` : '');
  const nd = nextDay();

  const card = (a, extra = '') => `
    <article class="card act-card">
      <div class="card-head"><h3>${esc(a.title)}</h3><span class="num muted">${esc(minutesLabel(a))}</span></div>
      ${extra}
      <p class="small muted">${esc(guidance(a))}</p>
      <div class="row"><a class="btn ${a.kind === 'habit' ? 'secondary' : 'primary'} grow" href="#/einheit/${a.id}">${icon(a.kind === 'football' || a.kind === 'habit' ? 'check' : 'play')} ${a.kind === 'football' ? 'Eintragen' : a.kind === 'habit' ? 'Abhaken' : 'Starten'}</a></div>
    </article>`;

  root.innerHTML = `
  <section class="page">
    <header class="page-head">
      <h1>Training</h1>
      <p class="muted">${esc(S.plan.title)}${S.plan.coach ? ` · ${esc(S.plan.coach)}` : ''} · Woche ${planWeek()}</p>
    </header>

    <div class="card plan-card">
      <div class="card-head"><h2>Wochenplan</h2><a class="link" href="#/woche">Bearbeiten</a></div>
      <ol class="plan-list">${weekPlan().map((ids, i) => `
        <li class="${i === weekdayIndex() ? 'today' : ''}">
          <span class="plan-day">${WD[i]}</span>
          <span class="plan-items">${dayItems(i).map((a) => `<span class="tag ${a.kind}${isDone(a, isoDate(planDates()[i])) ? ' done' : ''}">${esc(a.short || a.title)}</span>`).join('') || '<span class="muted small">frei</span>'}</span>
        </li>`).join('')}</ol>
    </div>

    <nav class="jump" aria-label="Bereiche">
      <a href="#t-kraft" data-jump="t-kraft">Kraft</a><a href="#t-lauf" data-jump="t-lauf">Laufen</a><a href="#t-fuss" data-jump="t-fuss">Fußball</a><a href="#t-erh" data-jump="t-erh">Erholung</a>
    </nav>

    <div class="section-head" id="t-kraft"><h2>Krafttraining</h2><span class="muted small">${goalText('workout')}</span></div>
    <div class="scroll-x">${chips('week', weekOpts, week)}</div>
    ${S.plan.days.map((day) => {
      const count = day.sections.reduce((n, s) => n + s.exercises.filter((e) => !e.altOf).length, 0);
      const isNext = nd?.id === day.id;
      return `
      <article class="card day-card">
        <div class="card-head"><h3>${esc(day.title)}${isNext ? ' <span class="pill">Als Nächstes</span>' : ''}</h3><span class="num muted">${count} Übungen · ca. ${estimateMin(day, week)} Min</span></div>
        ${blocksLine(day, week, true)}
        <div class="row">
          <a class="btn secondary" href="#/training/${day.id}?w=${week}">${icon('list-checks')} Übungen</a>
          <button class="btn primary grow" data-act="start" data-day="${day.id}">${icon('play')} Starten</button>
        </div>
      </article>`;
    }).join('')}

    <div class="section-head" id="t-lauf"><h2>Laufen</h2><span class="muted small">${goalText('fitness')}</span></div>
    ${group('run').map((a) => card(a, a.mode === 'bouts'
      ? `<div class="bouts">${Array.from({ length: a.spec.sets * 2 }, (_, i) => `<span class="bout${i % 2 ? '' : ' hard'}" style="flex:1"></span>`).join('')}</div><p class="small">Hart ${esc(a.spec.hard.pace)}, Laufband ${esc(a.spec.hard.tread)} · locker ${esc(a.spec.easy.pace)}, ${esc(a.spec.easy.tread)}</p>`
      : a.mode === 'pitch' ? pitchMini() + '<p class="small">Pro Runde: 3 Seiten joggen und 1 sprinten, dann 2 und 2, dann 1 und 3, dann alle 4 sprinten. Ohne Pause, so viele Runden wie möglich.</p>' : '')).join('')}

    <div class="section-head" id="t-fuss"><h2>Fußball</h2><span class="muted small">${goalText('football')}</span></div>
    <div class="grid-2">${group('football').map((a) => card(a)).join('')}</div>

    <div class="section-head" id="t-erh"><h2>Erholung und Ruhetag</h2><span class="muted small">${goalText('recovery')}</span></div>
    ${group('recovery').map((a) => card(a)).join('')}
    <div class="grid-2">${group('habit').map((a) => card(a)).join('')}</div>

    ${S.plan.schedule.length ? `
    <details class="card"><summary>Beispielwoche aus dem PDF</summary>
    <ul class="schedule">${S.plan.schedule.map((s) => `<li><span class="sched-day">${esc(s.day)}</span><span lang="en">${s.items.map(esc).join(' · ')}</span></li>`).join('')}</ul></details>` : ''}
  </section>`;

  root.onclick = async (ev) => {
    const chip = ev.target.closest('[data-chips="week"] .chip');
    if (chip) { go(`#/training?w=${chip.dataset.value}`); return; }
    const j = ev.target.closest('[data-jump]');
    if (j) { ev.preventDefault(); document.getElementById(j.dataset.jump)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    const el = ev.target.closest('[data-act="start"]');
    if (el) {
      if (S.active && !confirm('Ein anderes Workout ist unterbrochen. Trotzdem neu starten?')) return;
      await startWorkout(el.dataset.day);
    }
  };
}

// ---------- Training day detail with figures

export function renderTrainingDay(root, dayId, params = {}) {
  const day = S.plan.days.find((d) => d.id === dayId);
  if (!day) { go('#/training'); return; }
  const week = Number(params.w) || planWeek();
  const weekOpts = Array.from({ length: S.plan.weeks }, (_, i) => ({ value: i + 1, label: `Woche ${i + 1}` }));
  root.innerHTML = `
  <section class="page">
    <header class="page-head">
      <a class="back" href="#/training?w=${week}">${icon('chevron-left')} Training</a>
      <h1>${esc(day.title)}</h1>
      <p class="muted">ca. ${estimateMin(day, week)} Min · ${day.sections.length} Blöcke</p>
    </header>
    <div class="scroll-x">${chips('week', weekOpts, week)}</div>
    ${day.sections.map((s) => `
    <div class="section-head">
      <h2>${esc(s.title)}</h2>
      <span class="num muted">${(s.rounds[week] || 1) > 1 ? `${s.rounds[week]} Runden` : '1 Durchgang'}${s.restSec && (s.rounds[week] || 1) > 1 ? ` · ${s.restSec} Sek. Pause` : ''}</span>
    </div>
    <ol class="card ex-list">
      ${s.exercises.map((e) => `
      <li data-exname="${esc(e.name)}">
        <button class="ex-head" data-act="open" aria-expanded="false">
          <span class="ex-name">${e.altOf ? '<span class="muted">oder </span>' : ''}${esc(e.name)}</span>
          <span class="num">${esc(translateTarget(targetFor(e, week)))}</span>
        </button>
        <div class="ex-body" hidden></div>
      </li>`).join('')}
    </ol>`).join('')}
    <div class="row"><button class="btn primary grow" data-act="start">${icon('play')} ${esc(day.title)} starten</button></div>
  </section>`;
  root.onclick = async (ev) => {
    const chip = ev.target.closest('[data-chips="week"] .chip');
    if (chip) { go(`#/training/${dayId}?w=${chip.dataset.value}`); return; }
    const el = ev.target.closest('[data-act]');
    if (!el) return;
    if (el.dataset.act === 'open') {
      const li = el.closest('li');
      const body = li.querySelector('.ex-body');
      const open = body.hidden;
      body.hidden = !open;
      el.setAttribute('aria-expanded', String(open));
      if (open && !body.innerHTML) {
        const ex = day.sections.flatMap((s) => s.exercises).find((x) => x.name === li.dataset.exname);
        body.innerHTML = figurePanel(ex, { id: `fx-${ex.id}`, compact: true });
        mountPanels(li);
      }
    }
    if (el.dataset.act === 'start') {
      if (S.active && !confirm('Ein anderes Workout ist unterbrochen. Trotzdem neu starten?')) return;
      await startWorkout(dayId);
    }
  };
}

// ---------- Week planner

let openDay = null;

export function renderWeekEdit(root) {
  if (openDay == null) openDay = weekdayIndex();
  const all = catalog();
  const groups = [
    ['Krafttraining', all.filter((a) => a.group === 'strength')],
    ['Laufen', all.filter((a) => a.group === 'run')],
    ['Fußball', all.filter((a) => a.group === 'football')],
    ['Erholung', all.filter((a) => a.group === 'recovery' || a.group === 'rest')],
    ['Jeden Tag möglich', all.filter((a) => a.group === 'habit')],
  ];
  const plan = weekPlan();
  const count = (kind) => plan.flat().map(byId).filter((a) => a?.kind === kind).length;
  const warn = [];
  if (count('workout') < 3) warn.push('Dein Plan sieht 3 Ganzkörper-Workouts pro Woche vor.');
  plan.forEach((ids, i) => {
    const kinds = ids.map(byId).filter(Boolean);
    if (kinds.some((a) => a.id === 'match') && (plan[(i + 6) % 7] || []).some((id) => byId(id)?.kind === 'workout' || id === 'fs1')) warn.push(`Am Tag vor dem Spiel (${WD_LONG[(i + 6) % 7]}) lieber kein Workout und keinen Sprintlauf.`);
    if (kinds.filter((a) => a.kind === 'workout').length > 1) warn.push(`${WD_LONG[i]}: zwei Workouts an einem Tag sind zu viel.`);
  });
  if (!plan.some((ids) => ids.includes('rest'))) warn.push('Mindestens ein Ruhetag pro Woche hilft dir, dich zu erholen.');

  root.innerHTML = `
  <section class="page">
    <header class="page-head">
      <a class="back" href="#/training">${icon('chevron-left')} Training</a>
      <h1>Wochenplan</h1>
      <p class="muted">Tippe an, was an welchem Tag ansteht. Gilt jede Woche, bis du es änderst.</p>
    </header>
    ${warn.length ? `<div class="coach"><span class="coach-mark">Coach</span>${warn.map((w) => `<p>${esc(w)}</p>`).join('')}</div>` : ''}
    ${plan.map((ids, i) => `
    <article class="card day-plan${i === weekdayIndex() ? ' today' : ''}${i === openDay ? ' open' : ''}">
      <button class="day-plan-head" data-open="${i}" aria-expanded="${i === openDay}">
        <span class="day-plan-name">${WD_LONG[i]}</span>
        <span class="plan-items">${dayItems(i).map((a) => `<span class="tag ${a.kind}">${esc(a.short || a.title)}</span>`).join('') || '<span class="muted small">frei</span>'}</span>
        ${icon('chevron-down', 18)}
      </button>
      ${i !== openDay ? '' : groups.map(([label, list]) => `
        <div class="pick-group"><span class="muted small">${label}</span>
          <div class="chips">${list.map((a) => `<button type="button" class="chip${ids.includes(a.id) ? ' on' : ''}" data-day="${i}" data-id="${a.id}" aria-pressed="${ids.includes(a.id)}">${esc(a.short || a.title)}</button>`).join('')}</div>
        </div>`).join('')}
    </article>`).join('')}
    <button class="link" data-act="reset">Vorschlag wiederherstellen</button>
  </section>`;

  root.onclick = async (ev) => {
    const head = ev.target.closest('[data-open]');
    if (head) {
      const i = Number(head.dataset.open);
      openDay = openDay === i ? -1 : i;
      renderWeekEdit(root);
      return;
    }
    const c = ev.target.closest('.chip[data-id]');
    if (c) {
      const i = Number(c.dataset.day);
      const id = c.dataset.id;
      let ids = [...weekPlan()[i]];
      if (ids.includes(id)) ids = ids.filter((x) => x !== id);
      else {
        if (id === 'rest') ids = ids.filter((x) => !['workout', 'run', 'football'].includes(byId(x)?.kind));
        else if (['workout', 'run', 'football'].includes(byId(id).kind)) ids = ids.filter((x) => x !== 'rest');
        ids.push(id);
      }
      await setDayPlan(i, ids);
      const y = window.scrollY;
      renderWeekEdit(root);
      window.scrollTo(0, y);
      return;
    }
    if (ev.target.closest('[data-act="reset"]')) {
      S.settings.weekPlan = defaultWeekPlan();
      if (S.settings.weekOverride) delete S.settings.weekOverride[isoDate(planDates()[0])];
      await setDayPlan(0, S.settings.weekPlan[0]);
      renderWeekEdit(root);
      toast('Vorschlag wiederhergestellt');
    }
  };
}

export { addDays };
