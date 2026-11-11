// Workout player: walks through a day step by step and logs every exercise.
import { S, saveActive, saveSession, planWeek } from './state.js';
import { targetFor } from './parse-training.js';
import {
  esc, uid, translateTarget, sidesOf, durationOf, intervalOf, fmtClock, vimeoEmbed, fmtDuration, isoDate,
} from './util.js';
import { icon } from './icons.js';
import { go, toast, centerCircle, setCircle, chips, keepAwake, beep, unlockAudio } from './ui.js';
import { savePhoto } from './photos.js';
import { afterWorkout } from './coach.js';
import { figurePanel, mountPanels, measureOf, lastLog, isWeighted } from './exview.js';
import { findDay } from './activities.js';

const FEEL = [
  { value: 1, label: 'Leicht' },
  { value: 2, label: 'Gut' },
  { value: 3, label: 'Hart' },
  { value: 4, label: 'Am Limit' },
];

const RPE_TEXT = {
  1: 'Sehr leicht', 2: 'Leicht', 3: 'Locker', 4: 'Moderat', 5: 'Etwas fordernd',
  6: 'Fordernd', 7: 'Hart', 8: 'Sehr hart', 9: 'Fast am Maximum', 10: 'Maximum',
};

export function buildSteps(day, week) {
  const steps = [];
  day.sections.forEach((sec, si) => {
    const rounds = sec.rounds[week] || 1;
    const main = sec.exercises.filter((e) => !e.altOf);
    steps.push({ type: 'section', si });
    for (let r = 1; r <= rounds; r++) {
      for (const e of main) {
        steps.push({ type: sec.kind === 'breathing' ? 'breathing' : 'exercise', si, exId: e.id, round: r, rounds });
      }
      if (r < rounds && sec.restSec) steps.push({ type: 'rest', si, secs: sec.restSec, round: r, rounds });
    }
  });
  steps.push({ type: 'finish' });
  return steps;
}

export async function startWorkout(dayId) {
  const day = findDay(dayId);
  if (!day) return;
  const week = planWeek();
  S.active = {
    id: uid(),
    planId: S.plan.id,
    dayId,
    week,
    startedAt: Date.now(),
    idx: 0,
    steps: buildSteps(day, week),
    entries: {},
    skipped: {},
    alt: {},
    finish: { rpe: null, energy: null, note: '', photoId: null },
    routine: day.routine ? day : null,
  };
  await saveActive();
  go('#/workout');
}

export async function discardWorkout() {
  S.active = null;
  await saveActive();
}

// ---------- Timer engine

let timer = null;

function stopTimer() {
  if (timer?.handle) clearInterval(timer.handle);
  timer = null;
}

// Called by the router when the workout screen is left
export function leaveWorkout() {
  stopTimer();
}

function runTimer(phases, { onDone, ring } = {}) {
  stopTimer();
  unlockAudio();
  timer = { phases, i: 0, endsAt: Date.now() + phases[0].secs * 1000, paused: false, remaining: 0, onDone, ring };
  timer.handle = setInterval(tick, 200);
  tick();
}

function tick() {
  if (!timer || timer.paused) return;
  const ph = timer.phases[timer.i];
  let left = (timer.endsAt - Date.now()) / 1000;
  if (left <= 0) {
    if (timer.i < timer.phases.length - 1) {
      timer.i += 1;
      beep(1, timer.phases[timer.i].rest ? 520 : 880);
      timer.endsAt = Date.now() + timer.phases[timer.i].secs * 1000;
      left = timer.phases[timer.i].secs;
    } else {
      beep(2);
      const done = timer.onDone;
      paintTimer(0, ph, 1);
      stopTimer();
      done?.();
      return;
    }
  }
  const cur = timer.phases[timer.i];
  paintTimer(left, cur, 1 - left / cur.secs);
}

function paintTimer(left, phase, frac) {
  const breathing = !!document.getElementById('breath');
  const ringVal = document.querySelector('#t-ring .cc-value');
  const label = document.getElementById('t-label');
  if (ringVal && !breathing) ringVal.textContent = fmtClock(Math.ceil(left));
  if (label && phase) label.textContent = breathing ? `${phase.label} ${Math.ceil(left)}` : phase.label;
  const ring = document.getElementById('t-ring');
  if (ring) setCircle(ring, frac);
  const btn = document.getElementById('t-toggle');
  if (btn && timer) btn.innerHTML = timer.paused ? `${icon('play')} Weiter` : `${icon('pause')} Pause`;
}

function toggleTimer() {
  if (!timer) return;
  if (timer.paused) {
    timer.paused = false;
    timer.endsAt = Date.now() + timer.remaining * 1000;
  } else {
    timer.paused = true;
    timer.remaining = Math.max(0, (timer.endsAt - Date.now()) / 1000);
  }
  paintTimer(timer.paused ? timer.remaining : (timer.endsAt - Date.now()) / 1000, timer.phases[timer.i], 0);
}

function phasesFor(ex, week) {
  const target = targetFor(ex, week);
  const all = [target, ...(ex.details || []), ex.target.base || ''].join(', ');
  const iv = intervalOf(all);
  if (iv) {
    const out = [];
    for (let i = 1; i <= iv.rounds; i++) {
      out.push({ label: `Arbeit ${i}/${iv.rounds}`, secs: iv.work });
      if (i < iv.rounds) out.push({ label: 'Pause', secs: iv.rest, rest: true });
    }
    return out;
  }
  if (/maximum/i.test(target) && /in \d+ seconds/i.test(target)) {
    return [{ label: 'So viele wie möglich', secs: durationOf(target.match(/in (\d+ seconds)/i)[1]) }];
  }
  const secs = durationOf(target);
  if (!secs) return null;
  if (sidesOf(target) === 2) {
    const side = /foot/i.test(target) ? 'Fuß' : /side/i.test(target) ? 'Seite' : 'Bein';
    return [
      { label: `${side} 1`, secs },
      { label: 'Wechseln', secs: 5, rest: true },
      { label: `${side} 2`, secs },
    ];
  }
  return [{ label: 'Zeit läuft', secs }];
}

// ---------- Rendering

const current = () => S.active.steps[S.active.idx];
const dayOf = () => S.active.routine || S.plan.days.find((d) => d.id === S.active.dayId);
const secOf = (si) => dayOf().sections[si];
const exById = (sec, id) => sec.exercises.find((e) => e.id === id);
const entryKey = (st) => `${st.exId}#${st.round}`;

function progressBar() {
  const day = dayOf();
  const segs = day.sections.map((sec, si) => {
    const idxs = S.active.steps.map((s, i) => (s.si === si ? i : -1)).filter((i) => i >= 0);
    const first = idxs[0];
    const last = idxs[idxs.length - 1];
    const fill = S.active.idx > last ? 1 : S.active.idx < first ? 0 : (S.active.idx - first + 1) / idxs.length;
    return `<span class="seg${S.active.skipped[si] ? ' off' : ''}" style="flex:${idxs.length}"><i style="transform:scaleX(${fill})"></i></span>`;
  });
  const exSteps = S.active.steps.filter((s) => s.type === 'exercise' || s.type === 'breathing');
  const doneN = exSteps.filter((s) => S.active.entries[entryKey(s)]).length;
  return `
  <header class="p-top">
    <button class="btn-icon ghost" data-act="pause" aria-label="Pausieren">${icon('x', 20)}</button>
    <div class="p-prog" aria-label="Fortschritt">${segs.join('')}</div>
    <span class="num muted">${doneN}/${exSteps.length}</span>
  </header>`;
}

function videoBox(v, key) {
  if (!v) return '';
  const src = vimeoEmbed(v);
  if (!src) return `<a class="btn secondary" href="${esc(v.url)}" target="_blank" rel="noopener">${icon('external-link')} Video öffnen</a>`;
  return `
  <div class="video" data-video="${esc(src)}" data-key="${esc(key)}">
    <button type="button" class="video-play" data-act="video">
      <span class="video-icon">${icon('play', 22)}</span>
      <span>Video ansehen</span>
    </button>
  </div>
  <a class="video-out" href="${esc(v.url)}" target="_blank" rel="noopener">${icon('external-link', 14)} In ${v.provider === 'youtube' ? 'YouTube' : 'Vimeo'} öffnen</a>`;
}

function renderSection(st) {
  const sec = secOf(st.si);
  const day = dayOf();
  const w = S.active.week;
  const rounds = sec.rounds[w] || 1;
  const exCount = sec.exercises.filter((e) => !e.altOf).length;
  const first = st.si === 0;
  const optional = sec.kind === 'finisher' || !!sec.optional;
  const notes = sec.notes.filter((n) => n.length > 8).slice(0, 4);
  return `
  <div class="player">
    ${progressBar()}
    <div class="p-body p-section">
      <p class="p-kicker">Block ${st.si + 1} von ${day.sections.length}</p>
      <h1 class="p-title">${esc(sec.title)}</h1>
      <dl class="p-facts">
        <div><dt>Übungen</dt><dd class="num">${exCount}</dd></div>
        <div><dt>Runden</dt><dd class="num">${rounds}</dd></div>
        ${sec.restSec && rounds > 1 ? `<div><dt>Pause nach Runde</dt><dd class="num">${sec.restSec} Sek.</dd></div>` : ''}
      </dl>
      ${first && S.plan.preSession ? `<p class="p-hint">${icon('info')} Vorher 5–10 Minuten Rad oder Laufband zum Aufwärmen</p>` : ''}
      ${sec.kind === 'circuit' ? `<p class="p-hint">${icon('info')} Zwischen den Übungen keine Pause, Puls hoch halten</p>` : ''}
      ${optional ? `<p class="p-hint">${icon('info')} Nur machen, wenn du noch Power hast und die Extra-Fitness brauchst</p>` : ''}
      ${notes.length ? `<details class="p-cues"><summary>Hinweise von ${esc(S.plan.coach || 'deinem Coach')}</summary><ul>${notes.map((n) => `<li lang="en">${esc(n)}</li>`).join('')}</ul></details>` : ''}
      <ol class="p-list">${sec.exercises.filter((e) => !e.altOf).map((e) => `<li><span>${esc(e.name)}</span><span class="num muted">${esc(translateTarget(targetFor(e, w)))}</span></li>`).join('')}</ol>
    </div>
    <footer class="p-actions">
      <div class="row">
        ${optional ? '<button class="btn secondary" data-act="skip-section">Heute auslassen</button>' : ''}
        <button class="btn primary grow" data-act="next">${icon('play')} ${sec.kind === 'breathing' ? 'Atmung starten' : 'Los'}</button>
      </div>
    </footer>
  </div>`;
}

function logStepper(id, value, { step = 1, digits = 0, unit = '', label = '', min = 0, max = 999 } = {}) {
  const shown = value == null ? '' : Number(value).toFixed(digits).replace('.', ',');
  return `
  <div class="logbox">
    <span class="logbox-label">${esc(label)}<span class="muted small">${esc(unit)}</span></span>
    <div class="stepper big" data-stepper="${id}" data-step="${step}" data-min="${min}" data-max="${max}" data-digits="${digits}">
      <button type="button" class="btn-icon" data-step-dir="-1" aria-label="${esc(label)} weniger">${icon('minus')}</button>
      <output class="num" id="${id}" data-value="${value ?? ''}">${shown || '–'}</output>
      <button type="button" class="btn-icon" data-step-dir="1" aria-label="${esc(label)} mehr">${icon('plus')}</button>
    </div>
  </div>`;
}

function currentExercise(st) {
  const sec = secOf(st.si);
  const base = exById(sec, st.exId);
  const alt = sec.exercises.find((e) => e.altOf === base.id);
  const useAlt = !!(alt && S.active.alt[base.id]);
  return { sec, base, alt, useAlt, ex: useAlt ? alt : base };
}

function renderExercise(st) {
  const { sec, base, alt, useAlt, ex } = currentExercise(st);
  const w = S.active.week;
  const target = targetFor(ex, w);
  const prev = S.active.entries[entryKey(st)];
  const phases = phasesFor(ex, w);
  const m = measureOf(ex, target);
  const last = lastLog(ex, S.active.id);
  const weighted = isWeighted(ex) || (['strength', 'complex', 'power'].includes(sec.kind) && !/jump|bound|hop|plank|skip|sprint|pass|throw|carry|stretch/i.test(ex.name));
  const details = (ex.details || []).filter((d) => !target.includes(d));
  const sameDone = Object.values(S.active.entries).filter((e) => e.exId === ex.id && e.done != null);
  const doneVal = prev?.done ?? (m.max ? sameDone[sameDone.length - 1]?.done ?? last?.done ?? null : m.value);
  const sameSession = Object.values(S.active.entries).filter((e) => e.exId === ex.id && e.kg != null);
  const kgVal = prev?.kg ?? sameSession[sameSession.length - 1]?.kg ?? last?.kg ?? null;
  const lastText = last
    ? [last.done != null ? `${last.done} ${last.unit || m.unit || ''}`.trim() : null, last.kg != null ? `${fmtKg(last.kg)} kg` : null].filter(Boolean).join(' · ')
    : '';

  return `
  <div class="player" data-exname="${esc(ex.name)}">
    ${progressBar()}
    <div class="p-body">
      <p class="p-kicker">${esc(sec.title)}${st.rounds > 1 ? ` · Runde ${st.round} von ${st.rounds}` : ''}</p>
      <h1 class="p-name">${esc(ex.name)}</h1>
      <div class="p-target">
        <span class="num">${esc(translateTarget(target) || 'Nach Video')}</span>
        ${ex.targetNote ? `<span class="muted">${esc(translateTarget(ex.targetNote))}</span>` : ''}
        ${details.length ? `<span class="muted">${esc(details.map(translateTarget).join(' · '))}</span>` : ''}
        ${ex.nameNote ? `<span class="muted" lang="en">${esc(ex.nameNote)}</span>` : ''}
      </div>
      ${alt ? `<button class="chip toggle${useAlt ? ' on' : ''}" data-act="alt" data-ex="${base.id}">${useAlt ? `Doch ${esc(base.name.replace(/\s*\(.*\)/, ''))}` : `Keine Ropes da: ${esc(alt.name)}`}</button>` : ''}
      ${figurePanel(ex, { id: 'fx-main' })}
      ${phases ? `
      <div class="timer">
        ${centerCircle({ size: 124, pct: 0, value: fmtClock(phases[0].secs), id: 't-ring' })}
        <div class="timer-side">
          <span id="t-label" class="muted">${esc(phases[0].label)}</span>
          <button class="btn secondary" id="t-toggle" data-act="timer">${icon('timer')} Timer starten</button>
        </div>
      </div>` : ''}
    </div>
    <footer class="p-actions">
      <div class="logrow">
        ${m.unit ? logStepper('done', doneVal, { step: m.step, unit: `${m.unit}${m.perSide ? ' pro Seite' : ''}`, label: m.max ? 'Geschafft, max.' : 'Geschafft' }) : ''}
        ${weighted ? logStepper('kg', kgVal, { step: 0.5, digits: 1, unit: 'kg', label: 'Gewicht', max: 300 }) : ''}
      </div>
      ${lastText ? `<p class="lastlog muted small">${icon('rotate-ccw', 14)} Letztes Mal ${esc(lastText)}${last.week ? `, Woche ${last.week}` : ''}</p>` : ''}
      <div class="feel">${chips('feel', FEEL, prev?.feel)}</div>
      <div class="row" id="main-actions">
        ${S.active.idx > 0 ? `<button class="btn-icon ghost" data-act="back" aria-label="Zurück">${icon('chevron-left', 20)}</button>` : ''}
        <button class="btn secondary" data-act="skip-ex">Auslassen</button>
        <button class="btn primary grow" data-act="done">${icon('check')} Fertig, weiter</button>
      </div>
    </footer>
  </div>`;
}

const fmtKg = (v) => Number(v).toFixed(1).replace('.0', '').replace('.', ',');

function nextExerciseName(fromIdx) {
  for (let i = fromIdx + 1; i < S.active.steps.length; i++) {
    const s = S.active.steps[i];
    if (s.type === 'exercise' || s.type === 'breathing') return exById(secOf(s.si), s.exId).name;
  }
  return null;
}

function renderRest(st) {
  const sec = secOf(st.si);
  const next = nextExerciseName(S.active.idx);
  return `
  <div class="player">
    ${progressBar()}
    <div class="p-body p-center">
      <p class="p-kicker">${esc(sec.title)} · Runde ${st.round} von ${st.rounds} geschafft</p>
      ${centerCircle({ size: 220, pct: 0, value: fmtClock(st.secs), label: 'Pause', id: 't-ring' })}
      ${next ? `<p class="muted">Als Nächstes: <strong>${esc(next)}</strong></p>` : ''}
      <p class="p-hint">Nutze die Pause, damit die nächste Runde technisch sauber wird</p>
    </div>
    <footer class="p-actions">
      <div class="row">
        <button class="btn secondary" data-act="rest-plus">+15 Sek.</button>
        <button class="btn primary grow" data-act="next">${icon('skip-forward')} Weiter</button>
      </div>
    </footer>
  </div>`;
}

function renderBreathing(st) {
  const sec = secOf(st.si);
  const ex = exById(sec, st.exId);
  const total = durationOf(targetFor(ex, S.active.week)) || 300;
  return `
  <div class="player">
    ${progressBar()}
    <div class="p-body p-center">
      <p class="p-kicker">${esc(sec.title)} · direkt nach dem Training</p>
      <h1 class="p-name">${esc(ex.name)}</h1>
      <div class="breath" id="breath" data-total="${total}">
        ${centerCircle({ size: 232, pct: 0, value: '', id: 't-ring' })}
        <div class="breath-text"><span id="t-label">Bereit</span><span id="t-clock" class="num">${fmtClock(total)}</span></div>
      </div>
      <p class="muted">${/7-11/.test(ex.name) ? '7 Sekunden durch die Nase einatmen, 11 Sekunden ausatmen. Nur der Bauch hebt sich.' : 'Langsam durch die Nase in den Bauch atmen. Der Kreis gibt den Rhythmus vor: 7 Sekunden ein, 11 Sekunden aus.'}</p>
      ${videoBox(ex.video, ex.id)}
    </div>
    <footer class="p-actions">
      <div class="row">
        <button class="btn secondary" id="t-toggle" data-act="breath">${icon('play')} Starten</button>
        <button class="btn primary grow" data-act="done">${icon('check')} Fertig</button>
      </div>
    </footer>
  </div>`;
}

function summaryOf(a) {
  const entries = Object.values(a.entries);
  const full = entries.filter((e) => e.status === 'full').length;
  const partial = entries.filter((e) => e.status === 'partial').length;
  const skipped = entries.filter((e) => e.status === 'skipped').length;
  const missed = entries.reduce((n, e) => n + (e.missed || 0), 0);
  return { full, partial, skipped, missed, total: entries.length };
}

function renderFinish() {
  const a = S.active;
  const sum = summaryOf(a);
  const f = a.finish;
  const day = dayOf();
  const rpeOpts = Array.from({ length: 10 }, (_, i) => ({ value: i + 1, label: String(i + 1) }));
  return `
  <div class="player">
    ${progressBar()}
    <div class="p-body">
      <p class="p-kicker">Woche ${a.week} · ${fmtDuration(Date.now() - a.startedAt)}</p>
      <h1 class="p-title">${esc(day.title)} geschafft</h1>
      <dl class="p-facts">
        <div><dt>Voll geschafft</dt><dd class="num">${sum.full}</dd></div>
        <div><dt>Nicht komplett</dt><dd class="num">${sum.partial}</dd></div>
        <div><dt>Fehlende Wdh.</dt><dd class="num">${sum.missed}</dd></div>
        ${sum.skipped ? `<div><dt>Ausgelassen</dt><dd class="num">${sum.skipped}</dd></div>` : ''}
      </dl>
      <div class="field">
        <span>Wie anstrengend war das Workout? <small class="muted" id="rpe-text">${f.rpe ? RPE_TEXT[f.rpe] : 'RPE 1 bis 10'}</small></span>
        ${chips('rpe', rpeOpts, f.rpe)}
      </div>
      <div class="field">
        <span>Wie fühlst du dich jetzt?</span>
        ${chips('energy', [{ value: 1, label: 'Platt' }, { value: 2, label: 'Müde' }, { value: 3, label: 'Gut' }, { value: 4, label: 'Stark' }], f.energy)}
      </div>
      <label class="field">
        <span>Notiz <small class="muted">Schmerzen, Technik, was auffiel</small></span>
        <textarea id="note" rows="3" placeholder="z. B. Copenhagen links zieht in der Leiste">${esc(f.note)}</textarea>
      </label>
      ${a.routine ? '' : `<div class="field photo-field">
        <span>Foto nach dem Workout <small class="muted">für deinen Verlauf</small></span>
        <label class="photo-drop${f.photoId ? ' has' : ''}">
          <input type="file" accept="image/*" capture id="photo" hidden>
          ${f.photoId ? `<img data-photo="${f.photoId}" alt="Dein Foto von heute">` : `<span class="photo-cta">${icon('camera', 22)}<span>Foto aufnehmen</span></span>`}
        </label>
      </div>`}
    </div>
    <footer class="p-actions">
      <div class="row">
        ${a.routine
          ? `<button class="btn primary grow" data-act="save-nophoto">${icon('check')} Speichern</button>`
          : `<button class="btn primary grow" data-act="save" ${f.rpe && f.photoId ? '' : 'disabled'}>${icon('check')} Workout speichern</button>`}
      </div>
      ${!f.photoId && !a.routine ? '<button class="link" data-act="save-nophoto">Heute ohne Foto speichern</button>' : ''}
    </footer>
  </div>`;
}

function renderDone(session) {
  const msg = session.kind === 'recovery'
    ? ['Stretching erledigt. Das zählt für deine TV-Stretches diese Woche.', 'Viel trinken, das hält die Faszien geschmeidig.']
    : afterWorkout(session);
  return `
  <div class="player">
    <div class="p-body p-center">
      ${centerCircle({ size: 200, pct: session.summary.total ? session.summary.full / session.summary.total : 1, value: `${Math.round((session.summary.full / Math.max(1, session.summary.total)) * 100)} %`, label: 'voll geschafft' })}
      <h1 class="p-title">Gespeichert</h1>
      <div class="coach dark">
        <span class="coach-mark">Coach</span>
        ${msg.map((m) => `<p>${esc(m)}</p>`).join('')}
      </div>
    </div>
    <footer class="p-actions">
      <div class="row"><button class="btn primary grow" data-act="home">Zur Übersicht</button></div>
    </footer>
  </div>`;
}


let lastSaved = null;

export function renderPlayer(root) {
  stopTimer();
  if (S.active) lastSaved = null; // a new workout always wins over the last summary
  if (lastSaved) {
    root.innerHTML = renderDone(lastSaved);
    bind(root);
    return;
  }
  if (!S.active) { go('#/heute'); return; }
  keepAwake(true);
  const st = current();
  const html = { section: renderSection, exercise: renderExercise, rest: renderRest, breathing: renderBreathing, finish: renderFinish }[st.type](st);
  root.innerHTML = html;
  bind(root);
  mountPanels(root);
  if (st.type === 'rest') runTimer([{ label: 'Pause', secs: st.secs }], { onDone: () => advance() });
  if (st.type === 'finish') import('./photos.js').then((m) => m.hydratePhotos(root));
  root.scrollTop = 0;
  window.scrollTo(0, 0);
}

async function advance(delta = 1) {
  stopTimer();
  const a = S.active;
  a.idx = Math.max(0, Math.min(a.steps.length - 1, a.idx + delta));
  // Skip over sections the athlete chose to leave out
  while (a.steps[a.idx].si != null && a.skipped[a.steps[a.idx].si] && a.steps[a.idx].type !== 'section') {
    a.idx = Math.max(0, Math.min(a.steps.length - 1, a.idx + (delta < 0 ? -1 : 1)));
    if (a.idx === 0 || a.idx === a.steps.length - 1) break;
  }
  await saveActive();
  renderPlayer(document.getElementById('view'));
}

function record(status) {
  const st = current();
  const { sec, ex } = currentExercise(st);
  const target = targetFor(ex, S.active.week);
  const m = measureOf(ex, target);
  const feelBtn = document.querySelector('[data-chips="feel"] .chip.on');
  const read = (id) => {
    const v = document.getElementById(id)?.dataset.value;
    return v === undefined || v === '' ? null : Number(v);
  };
  const done = status === 'skipped' ? 0 : read('done');
  const kg = read('kg');
  let st2 = status;
  let missed = status === 'skipped' && m.unit === 'Wdh.' && m.value ? m.value : 0;
  if (status !== 'skipped' && m.value && done != null && done < m.value) {
    st2 = 'partial';
    missed = m.unit === 'Sek.' ? 0 : m.value - done;
  }
  S.active.entries[entryKey(st)] = {
    exId: ex.id,
    name: ex.name,
    sec: sec.kind,
    round: st.round,
    status: st2,
    target,
    goal: m.value,
    unit: m.unit,
    done,
    max: !!m.max,
    reps: m.max ? done : null,
    missed,
    short: m.unit === 'Sek.' && m.value && done != null ? Math.max(0, m.value - done) : 0,
    kg,
    feel: feelBtn ? Number(feelBtn.dataset.value) : null,
  };
}

async function finishSave(withPhoto) {
  const a = S.active;
  const note = document.getElementById('note')?.value || '';
  a.finish.note = note;
  if (!a.finish.rpe) { toast('Bitte noch die Anstrengung von 1 bis 10 wählen'); return; }
  if (withPhoto && !a.finish.photoId) { toast('Mach noch dein Foto'); return; }
  const session = {
    id: a.id,
    planId: a.planId,
    dayId: a.dayId,
    week: a.week,
    startedAt: a.startedAt,
    finishedAt: Date.now(),
    date: isoDate(),
    entries: a.entries,
    skipped: a.skipped,
    rpe: a.finish.rpe,
    energy: a.finish.energy,
    note,
    photoId: a.finish.photoId,
    status: 'done',
    kind: a.routine ? 'recovery' : 'workout',
    activityId: a.routine ? a.dayId : undefined,
    title: a.routine ? a.routine.title : undefined,
    summary: summaryOf(a),
  };
  await saveSession(session);
  S.active = null;
  await saveActive();
  keepAwake(false);
  lastSaved = session;
  renderPlayer(document.getElementById('view'));
}

function bind(root) {
  root.onclick = async (ev) => {
    const chip = ev.target.closest('.chips .chip');
    if (chip) {
      const group = chip.closest('.chips');
      group.querySelectorAll('.chip').forEach((c) => { c.classList.toggle('on', c === chip); c.setAttribute('aria-checked', String(c === chip)); });
      const name = group.dataset.chips;
      if (name === 'rpe' || name === 'energy') {
        S.active.finish[name] = Number(chip.dataset.value);
        S.active.finish.note = document.getElementById('note')?.value || '';
        if (name === 'rpe') document.getElementById('rpe-text').textContent = RPE_TEXT[chip.dataset.value];
        const save = root.querySelector('[data-act="save"]');
        if (save) save.disabled = !(S.active.finish.rpe && S.active.finish.photoId);
        await saveActive();
      }
      return;
    }
    const stepBtn = ev.target.closest('[data-step-dir]');
    if (stepBtn) {
      const wrap = stepBtn.closest('[data-stepper]');
      const out = wrap.querySelector('output');
      const step = Number(wrap.dataset.step) || 1;
      const digits = Number(wrap.dataset.digits) || 0;
      const cur = out.dataset.value === '' || out.dataset.value == null ? (Number(stepBtn.dataset.stepDir) > 0 ? 0 : step) : Number(out.dataset.value);
      const v = Math.round(Math.max(Number(wrap.dataset.min) || 0, Math.min(Number(wrap.dataset.max) || 999, cur + step * Number(stepBtn.dataset.stepDir))) * 10) / 10;
      out.dataset.value = String(v);
      out.textContent = v.toFixed(digits).replace('.', ',');
      return;
    }
    const el = ev.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    unlockAudio();
    switch (act) {
      case 'pause':
        stopTimer();
        keepAwake(false);
        await saveActive();
        toast('Pausiert. Du machst später genau hier weiter');
        go('#/heute');
        break;
      case 'next':
        await advance(1);
        break;
      case 'back':
        await advance(-1);
        break;
      case 'skip-section': {
        const st = current();
        S.active.skipped[st.si] = true;
        let i = S.active.idx + 1;
        while (i < S.active.steps.length - 1 && S.active.steps[i].si === st.si) i++;
        S.active.idx = i;
        await saveActive();
        renderPlayer(root);
        break;
      }
      case 'video': {
        const box = el.closest('.video');
        box.innerHTML = `<iframe src="${esc(box.dataset.video)}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen title="Übungsvideo"></iframe>`;
        break;
      }
      case 'timer': {
        if (timer) { toggleTimer(); break; }
        const st = current();
        const sec = secOf(st.si);
        const base = exById(sec, st.exId);
        const alt = sec.exercises.find((e) => e.altOf === base.id);
        const ex = alt && S.active.alt[base.id] ? alt : base;
        const phases = phasesFor(ex, S.active.week);
        runTimer(phases, {
          onDone: () => {
            const b = document.getElementById('t-toggle');
            if (b) { b.innerHTML = `${icon('rotate-ccw')} Nochmal`; b.dataset.act = 'timer-reset'; }
            document.querySelector('[data-act="done"]')?.focus();
          },
        });
        break;
      }
      case 'timer-reset':
        renderPlayer(root);
        break;
      case 'alt': {
        const id = el.dataset.ex;
        S.active.alt[id] = !S.active.alt[id];
        await saveActive();
        renderPlayer(root);
        break;
      }
      case 'done': {
        const st = current();
        if (st.type === 'breathing') {
          S.active.entries[entryKey(st)] = { exId: st.exId, name: '7-11 Breathing', sec: 'breathing', round: 1, status: 'full', missed: 0 };
        } else {
          record('full');
        }
        await advance(1);
        break;
      }
      case 'skip-ex':
        record('skipped');
        await advance(1);
        break;
      case 'rest-plus':
        if (timer) timer.endsAt += 15000;
        break;
      case 'breath':
        startBreathing(el);
        break;
      case 'save':
        await finishSave(true);
        break;
      case 'save-nophoto':
        if (!S.active.finish.rpe) { toast('Bitte noch die Anstrengung von 1 bis 10 wählen'); break; }
        await finishSave(false);
        break;
      case 'home':
        lastSaved = null;
        go('#/heute');
        break;
      default:
    }
  };

  const photo = root.querySelector('#photo');
  if (photo) {
    photo.onchange = async () => {
      const file = photo.files?.[0];
      if (!file) return;
      S.active.finish.note = document.getElementById('note')?.value || '';
      toast('Foto wird gespeichert');
      const id = await savePhoto(file, { sessionId: S.active.id, week: S.active.week, dayId: S.active.dayId, kind: 'workout' });
      S.active.finish.photoId = id;
      await saveActive();
      renderPlayer(root);
    };
  }
}

// 7-11 breathing: the center circle grows for 7 s and shrinks for 11 s.
function startBreathing(btn) {
  if (timer) { toggleTimer(); return; }
  const box = document.getElementById('breath');
  const total = Number(box.dataset.total) || 300;
  const cycles = Math.max(1, Math.round(total / 18));
  const phases = [];
  for (let i = 0; i < cycles; i++) {
    phases.push({ label: 'Einatmen', secs: 7, cls: 'in' });
    phases.push({ label: 'Ausatmen', secs: 11, cls: 'out', rest: true });
  }
  const endAt = Date.now() + cycles * 18000;
  runTimer(phases, {
    onDone: () => {
      box.className = 'breath';
      const l = document.getElementById('t-label');
      if (l) l.textContent = 'Fertig';
    },
  });
  // Drive the circle and the total clock separately from the phase timer
  const iv = setInterval(() => {
    if (!timer) { clearInterval(iv); return; }
    const ph = timer.phases[timer.i];
    box.className = `breath ${ph.cls}`;
    const clock = document.getElementById('t-clock');
    if (clock && !timer.paused) clock.textContent = fmtClock(Math.ceil((endAt - Date.now()) / 1000));
  }, 250);
  btn.innerHTML = `${icon('pause')} Pause`;
}

export function workoutProgressLabel() {
  if (!S.active) return null;
  const exSteps = S.active.steps.filter((s) => s.type === 'exercise' || s.type === 'breathing');
  const done = exSteps.filter((s) => S.active.entries[`${s.exId}#${s.round}`]).length;
  return `${done} von ${exSteps.length} Übungen`;
}
