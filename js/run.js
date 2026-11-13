// Guided sessions outside the gym workouts: runs, football, recovery, habits.
import { planWeek } from './state.js';
import { byId, guidance, minutesLabel, logActivity, catalog } from './activities.js';
import { esc, fmtClock, vimeoEmbed, isoDate } from './util.js';
import { icon } from './icons.js';
import { go, toast, centerCircle, setCircle, chips, keepAwake, beep, unlockAudio } from './ui.js';

const RPE_TEXT = {
  1: 'Sehr leicht', 2: 'Leicht', 3: 'Locker', 4: 'Moderat', 5: 'Etwas fordernd',
  6: 'Fordernd', 7: 'Hart', 8: 'Sehr hart', 9: 'Fast am Maximum', 10: 'Maximum',
};

let run = null; // {id, startedAt, reps, paused, pausedAt, offset, phaseIdx, mode, place}
let ticker = null;

// ---- Pitch drawing: a small pitch where sprinted sides are solid, jogged sides dashed
function pitch(sprints, { size = 'sm', active = false } = {}) {
  // sides in running order: top byline, right sideline, bottom byline, left sideline
  const sides = [
    [8, 8, 92, 8], [92, 8, 92, 62], [92, 62, 8, 62], [8, 62, 8, 8],
  ];
  const lines = sides.map((s, i) => {
    const sprint = i >= 4 - sprints;
    return `<line x1="${s[0]}" y1="${s[1]}" x2="${s[2]}" y2="${s[3]}" class="${sprint ? 'pt-sprint' : 'pt-jog'}"/>`;
  }).join('');
  return `<svg class="pitch ${size}${active ? ' on' : ''}" viewBox="0 0 100 70" aria-hidden="true">
    <rect x="8" y="8" width="84" height="54" class="pt-field"/>
    <line x1="50" y1="8" x2="50" y2="62" class="pt-mark"/><circle cx="50" cy="35" r="9" class="pt-mark"/>
    ${lines}
  </svg>`;
}

function phasesOf(a) {
  const sp = a.spec;
  const out = [];
  for (let i = 1; i <= sp.sets; i++) {
    out.push({ label: `Hart ${i}/${sp.sets}`, hard: true, secs: sp.hard.min * 60 });
    out.push({ label: `Locker ${i}/${sp.sets}`, hard: false, secs: sp.easy.min * 60 });
  }
  return out;
}

// ---------- Screens

function intro(a) {
  const week = planWeek();
  let body = '';
  if (a.mode === 'pitch') {
    const min = a.spec.minutes[week];
    body = `
      <div class="pitch-rep">
        ${[1, 2, 3, 4].map((n) => `<figure>${pitch(n)}<figcaption>${4 - n ? `${4 - n} locker, ` : ''}${n} Sprint</figcaption></figure>`).join('')}
      </div>
      <p class="muted small">Eine Runde besteht aus diesen vier Teilen hintereinander, ohne Pause. Gestrichelt ist locker joggen, durchgezogen ist sprinten. Grundlinie, Seitenlinie, Grundlinie, Seitenlinie sind die vier Seiten.</p>
      <dl class="p-facts"><div><dt>Woche ${week}</dt><dd class="num">${min} Min</dd></div><div><dt>Pause</dt><dd class="num">keine</dd></div></dl>
      <p class="small">Ziel: so viele Runden wie möglich. Tippe nach jeder Runde auf „Runde fertig“.</p>`;
  } else if (a.mode === 'bouts') {
    const sp = a.spec;
    body = `
      <div class="bouts">
        ${phasesOf(a).map((p) => `<span class="bout${p.hard ? ' hard' : ''}" style="flex:${p.secs}"></span>`).join('')}
      </div>
      <dl class="p-facts">
        <div><dt>Hart, ${sp.hard.min} Min</dt><dd class="num">${esc(sp.hard.pace)}</dd><dd class="muted small">Laufband ${esc(sp.hard.tread)}</dd></div>
        <div><dt>Locker, ${sp.easy.min} Min</dt><dd class="num">${esc(sp.easy.pace)}</dd><dd class="muted small">Laufband ${esc(sp.easy.tread)}</dd></div>
      </dl>
      <p class="muted small">${sp.sets}× hart und locker im Wechsel, ${sp.sets * (sp.hard.min + sp.easy.min)} Minuten. Nicht stehen bleiben, das Joggen ist deine Pause. Das harte Tempo fühlt sich hart an, aber du weißt, dass es dich fit macht.</p>`;
  } else if (a.kind === 'recovery' && a.video) {
    const src = vimeoEmbed(a.video, false);
    body = `<div class="video" data-video="${esc(src)}"><button type="button" class="video-play" data-act="video"><span class="video-icon">${icon('play', 22)}</span><span>Video laden</span></button></div>
      <a class="video-out" href="${esc(a.video.url)}" target="_blank" rel="noopener">${icon('external-link', 14)} In YouTube öffnen</a>`;
  } else if (a.kind === 'rest') {
    const options = catalog().filter((x) => x.kind === 'recovery');
    body = `<ul class="pick">${options.map((o) => `<li><a class="pick-row" href="#/einheit/${o.id}"><span><strong>${esc(o.title)}</strong><span class="muted small">${esc(minutesLabel(o))}</span></span>${icon('chevron-right')}</a></li>`).join('')}</ul>`;
  }
  const startable = a.kind === 'run';
  return `
  <div class="player run">
    <header class="p-top"><button class="btn-icon ghost" data-act="close" aria-label="Schließen">${icon('x', 20)}</button><span class="grow"></span><span class="num muted">${esc(minutesLabel(a))}</span></header>
    <div class="p-body">
      <p class="p-kicker">${{ run: 'Laufen', football: 'Fußball', recovery: 'Erholung', rest: 'Ruhetag', habit: 'Gewohnheit' }[a.kind]}</p>
      <h1 class="p-title">${esc(a.title)}</h1>
      <p class="p-hint">${icon('info')} ${esc(guidance(a))}</p>
      ${body}
    </div>
    <footer class="p-actions">
      <div class="row">
        ${startable ? '<button class="btn secondary" data-act="log-only">Nur eintragen</button>' : ''}
        ${startable ? `<button class="btn primary grow" data-act="start">${icon('play')} Starten</button>`
          : a.kind === 'rest' ? '<button class="btn primary grow" data-act="close">Okay</button>'
          : `<button class="btn primary grow" data-act="log-only">${icon('check')} ${a.kind === 'football' ? 'Einheit eintragen' : 'Erledigt'}</button>`}
      </div>
    </footer>
  </div>`;
}

function running(a) {
  if (a.mode === 'pitch') {
    return `
    <div class="player run">
      <header class="p-top"><button class="btn-icon ghost" data-act="stop" aria-label="Beenden">${icon('x', 20)}</button><span class="grow"></span><span class="num muted" id="r-total"></span></header>
      <div class="p-body p-center">
        <p class="p-kicker">${esc(a.title)}</p>
        ${centerCircle({ size: 220, pct: 0, value: fmtClock(a.spec.minutes[planWeek()] * 60), label: 'Restzeit', id: 't-ring' })}
        <div class="rep-count"><span class="num" id="r-reps">${run.reps}</span><span class="muted">Runden</span></div>
        <div class="pitch-rep compact">${[1, 2, 3, 4].map((n) => pitch(n)).join('')}</div>
      </div>
      <footer class="p-actions">
        <div class="row">
          <button class="btn secondary" data-act="pause" id="r-pause">${icon('pause')} Pause</button>
          <button class="btn primary grow" data-act="rep">${icon('plus')} Runde fertig</button>
        </div>
      </footer>
    </div>`;
  }
  if (a.mode === 'bouts') {
    return `
    <div class="player run">
      <header class="p-top"><button class="btn-icon ghost" data-act="stop" aria-label="Beenden">${icon('x', 20)}</button><div class="bouts thin" id="r-bouts">${phasesOf(a).map((p, i) => `<span class="bout${p.hard ? ' hard' : ''}" data-i="${i}" style="flex:${p.secs}"><i></i></span>`).join('')}</div></header>
      <div class="p-body p-center">
        <p class="p-kicker" id="r-phase"></p>
        ${centerCircle({ size: 232, pct: 0, value: fmtClock(phasesOf(a)[0].secs), id: 't-ring' })}
        <p class="pace" id="r-pace"></p>
        <p class="muted" id="r-next"></p>
      </div>
      <footer class="p-actions">
        <div class="row">
          <button class="btn secondary" data-act="pause" id="r-pause">${icon('pause')} Pause</button>
          <button class="btn secondary grow" data-act="skip">${icon('skip-forward')} Nächster Abschnitt</button>
        </div>
      </footer>
    </div>`;
  }
  return `
  <div class="player run">
    <header class="p-top"><button class="btn-icon ghost" data-act="stop" aria-label="Beenden">${icon('x', 20)}</button></header>
    <div class="p-body p-center">
      <p class="p-kicker">${esc(a.title)} · ${esc(minutesLabel(a))}</p>
      ${centerCircle({ size: 232, pct: 0, value: '0:00', label: 'Zeit', id: 't-ring' })}
      <p class="muted">${esc(guidance(a))}</p>
    </div>
    <footer class="p-actions"><div class="row">
      <button class="btn secondary" data-act="pause" id="r-pause">${icon('pause')} Pause</button>
      <button class="btn primary grow" data-act="stop">${icon('check')} Fertig</button>
    </div></footer>
  </div>`;
}

function finishForm(a, minutes) {
  const rpeOpts = Array.from({ length: 10 }, (_, i) => ({ value: i + 1, label: String(i + 1) }));
  const football = a.kind === 'football';
  return `
  <div class="player run">
    <header class="p-top"><button class="btn-icon ghost" data-act="close" aria-label="Abbrechen">${icon('x', 20)}</button></header>
    <div class="p-body">
      <p class="p-kicker">Eintragen</p>
      <h1 class="p-title">${esc(a.title)}</h1>
      ${football ? `<p class="p-hint">${icon('info')} ${esc(guidance(a))}</p>` : ''}
      ${football ? `<div class="field"><span>Art</span>${chips('ftype', [{ value: 'training', label: 'Teamtraining' }, { value: 'match', label: 'Spiel' }, { value: 'solo', label: 'Allein, fußballspezifisch' }], a.match ? 'match' : 'training')}</div>` : ''}
      <label class="field inline"><span>Dauer in Minuten</span><input class="num" id="f-min" type="number" inputmode="numeric" min="0" max="300" value="${minutes ?? ''}"></label>
      ${a.mode === 'pitch' ? `<label class="field inline"><span>Geschaffte Runden</span><input class="num" id="f-reps" type="number" inputmode="numeric" min="0" max="50" value="${run?.reps ?? ''}"></label>` : ''}
      ${a.kind === 'run' && a.mode !== 'pitch' ? '<label class="field inline"><span>Strecke in km <small class="muted">optional</small></span><input class="num" id="f-km" inputmode="decimal" placeholder="–"></label>' : ''}
      <div class="field"><span>Wie anstrengend? <small class="muted" id="rpe-text">RPE 1 bis 10</small></span>${chips('rpe', rpeOpts, null)}</div>
      <label class="field"><span>Notiz</span><textarea id="f-note" rows="2" placeholder="${football ? 'z. B. viele Sprints, Abschlusstraining' : 'Wie lief es?'}"></textarea></label>
    </div>
    <footer class="p-actions"><div class="row"><button class="btn primary grow" data-act="save">${icon('check')} Speichern</button></div></footer>
  </div>`;
}

// ---------- Timer loop

function elapsed() {
  if (!run) return 0;
  const now = run.paused ? run.pausedAt : Date.now();
  return (now - run.startedAt - run.offset) / 1000;
}

function tick(a) {
  if (!run || run.paused) return;
  const t = elapsed();
  const ring = document.getElementById('t-ring');
  const val = ring?.querySelector('.cc-value');
  if (a.mode === 'pitch') {
    const total = a.spec.minutes[planWeek()] * 60;
    const left = total - t;
    if (val) val.textContent = fmtClock(Math.max(0, Math.ceil(left)));
    setCircle(ring, t / total);
    if (left <= 0 && !run.ended) { run.ended = true; beep(3); stopTicker(); render(a, 'finish'); }
  } else if (a.mode === 'bouts') {
    const ph = phasesOf(a);
    let acc = 0;
    let idx = ph.length - 1;
    for (let i = 0; i < ph.length; i++) { if (t < acc + ph[i].secs) { idx = i; break; } acc += ph[i].secs; }
    if (idx !== run.phaseIdx) {
      if (run.phaseIdx != null) beep(ph[idx].hard ? 2 : 1, ph[idx].hard ? 880 : 520);
      run.phaseIdx = idx;
      const p = ph[idx];
      document.getElementById('r-phase').textContent = p.label;
      document.getElementById('r-pace').innerHTML = p.hard
        ? `<strong>${esc(a.spec.hard.pace)}</strong> <span class="muted">· Laufband ${esc(a.spec.hard.tread)}</span>`
        : `<strong>${esc(a.spec.easy.pace)}</strong> <span class="muted">· Laufband ${esc(a.spec.easy.tread)}</span>`;
      const nx = ph[idx + 1];
      document.getElementById('r-next').textContent = nx ? `Danach: ${nx.hard ? 'hart' : 'locker'}` : 'Letzter Abschnitt';
      document.querySelector('.player.run')?.classList.toggle('hard', p.hard);
    }
    const p = ph[idx];
    const into = t - acc;
    if (val) val.textContent = fmtClock(Math.max(0, Math.ceil(p.secs - into)));
    setCircle(ring, into / p.secs);
    document.querySelectorAll('#r-bouts .bout').forEach((b, i) => {
      b.querySelector('i').style.transform = `scaleX(${i < idx ? 1 : i === idx ? Math.min(1, into / p.secs) : 0})`;
    });
    const total = ph.reduce((n, x) => n + x.secs, 0);
    if (t >= total && !run.ended) { run.ended = true; beep(3); stopTicker(); render(a, 'finish'); }
  } else {
    if (val) val.textContent = fmtClock(t);
    const goal = (a.minutes?.[0] || 30) * 60;
    setCircle(ring, Math.min(1, t / goal));
  }
}

function stopTicker() { if (ticker) clearInterval(ticker); ticker = null; }

// Called by the router when the session screen is left. A running session keeps its
// start time, so coming back shows the right clock.
export function leaveActivity() {
  stopTicker();
}

// ---------- Render + events

function render(a, screen) {
  const root = document.getElementById('view');
  stopTicker();
  if (screen === 'run') {
    root.innerHTML = running(a);
    keepAwake(true);
    ticker = setInterval(() => tick(a), 250);
    tick(a);
  } else if (screen === 'finish') {
    keepAwake(false);
    const min = run ? Math.max(1, Math.round(elapsed() / 60)) : a.kind === 'football' ? 90 : a.minutes?.[0] ?? (a.mode === 'bouts' ? a.spec.sets * (a.spec.hard.min + a.spec.easy.min) : a.mode === 'pitch' ? a.spec.minutes[planWeek()] : a.kind === 'recovery' ? 20 : null);
    root.innerHTML = finishForm(a, min);
  } else {
    root.innerHTML = intro(a);
  }
  bind(root, a, screen);
  window.scrollTo(0, 0);
}

function bind(root, a, screen) {
  root.onclick = async (ev) => {
    const chip = ev.target.closest('.chips .chip');
    if (chip) {
      const g = chip.closest('.chips');
      g.querySelectorAll('.chip').forEach((c) => { c.classList.toggle('on', c === chip); c.setAttribute('aria-checked', String(c === chip)); });
      if (g.dataset.chips === 'rpe') document.getElementById('rpe-text').textContent = RPE_TEXT[chip.dataset.value];
      return;
    }
    const el = ev.target.closest('[data-act]');
    if (!el) return;
    unlockAudio();
    switch (el.dataset.act) {
      case 'close':
        run = null; stopTicker(); keepAwake(false);
        history.length > 1 ? history.back() : go('#/heute');
        break;
      case 'video': {
        const box = el.closest('.video');
        box.innerHTML = `<iframe src="${esc(box.dataset.video)}&autoplay=1" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen title="Video"></iframe>`;
        break;
      }
      case 'start':
        run = { id: a.id, startedAt: Date.now(), offset: 0, reps: 0, paused: false, phaseIdx: null };
        render(a, 'run');
        break;
      case 'log-only':
        run = null;
        if (a.kind === 'habit') {
          const { toggleHabit, habitDone, HABITS, ACTIVITY_HABIT } = await import('./habits.js');
          const h = HABITS.find((x) => x.id === ACTIVITY_HABIT[a.id]);
          if (h && !habitDone(h, isoDate())) await toggleHabit(h.id);
          toast(`${a.title} abgehakt`);
          go('#/heute');
          break;
        }
        render(a, 'finish');
        break;
      case 'rep':
        run.reps += 1;
        document.getElementById('r-reps').textContent = run.reps;
        beep(1, 660);
        break;
      case 'pause':
        if (run.paused) { run.offset += Date.now() - run.pausedAt; run.paused = false; el.innerHTML = `${icon('pause')} Pause`; }
        else { run.paused = true; run.pausedAt = Date.now(); el.innerHTML = `${icon('play')} Weiter`; }
        break;
      case 'skip': {
        const ph = phasesOf(a);
        const t = elapsed();
        let acc = 0;
        for (const p of ph) { acc += p.secs; if (t < acc) break; }
        run.offset -= (acc - t) * 1000;
        break;
      }
      case 'stop':
        render(a, 'finish');
        break;
      case 'save': {
        const rpe = root.querySelector('[data-chips="rpe"] .chip.on')?.dataset.value;
        if (!rpe) { toast('Bitte noch die Anstrengung von 1 bis 10 wählen'); return; }
        const minutes = Number(root.querySelector('#f-min').value) || null;
        const extra = {};
        const reps = root.querySelector('#f-reps');
        if (reps && reps.value !== '') extra.reps = Number(reps.value);
        const km = root.querySelector('#f-km');
        if (km && km.value) extra.km = Number(km.value.replace(',', '.'));
        const ftype = root.querySelector('[data-chips="ftype"] .chip.on')?.dataset.value;
        if (ftype) extra.type = ftype;
        const target = ftype === 'match' ? byId('match') : a;
        await logActivity(target, { minutes, rpe: Number(rpe), note: root.querySelector('#f-note').value, extra, startedAt: run?.startedAt });
        run = null;
        toast(`${target.title} gespeichert`);
        go('#/heute');
        break;
      }
      default:
    }
  };
  void screen;
}

export function renderActivity(root, id) {
  const a = byId(id);
  if (!a) { go('#/training'); return; }
  if (a.kind === 'workout') { go(`#/training/${a.dayId}`); return; }
  if (a.mode === 'routine') { import('./workout.js').then((w) => w.startWorkout('stretch')); return; }
  if (run && run.id === id) render(a, 'run');
  else render(a, a.kind === 'football' ? 'finish' : 'intro');
  void root;
}
