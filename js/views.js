// Screens: progress, settings, onboarding and the Health sync route.
import {
  S, today, saveDaily, saveSettings, planWeek, doneSessions, sessionsInRange, saveActive, loadState, saveStretchLib,
} from './state.js';
import {
  esc, fmtNum, isoDate, parseIso, addDays, mondayOf, fmtDayShort, parseDecimal, avg, fmtShortDate, fmtDuration, daysBetween,
} from './util.js';
import { icon } from './icons.js';
import { go, toast, centerCircle } from './ui.js';
import { readPdf, applyImport, defaultStart } from './importer.js';
import { savePhoto, hydratePhotos, deletePhoto } from './photos.js';
import { db } from './db.js';
import { weekLoad, goalCounts, weekPlan, byId, stretchExercises } from './activities.js';
import {
  seasonPath, badges, habitList, habitDone, streak, bestStreak, levelOf, totalXp, LEVELS, XP,
  allHabitsForSettings, setHabitActive, addOwnHabit, removeOwnHabit,
} from './habits.js';

const KIND_SHORT = { warmup: 'Warm-up', warmup2: 'Cardio', plyo: 'Plyos', circuit: 'Zirkel', core: 'Core', finisher: 'Finisher', breathing: 'Atmung', power: 'Power', strength: 'Kraft', complex: 'Komplex', stretch: 'Stretching', main: 'Übungen', speed: 'Speed' };

// ---------------- Progress

function weeklyStats(nWeeks = 8) {
  const out = [];
  const start0 = mondayOf();
  for (let i = nWeeks - 1; i >= 0; i--) {
    const start = addDays(start0, -7 * i);
    const end = addDays(start, 7);
    const ss = sessionsInRange(start, end);
    const full = ss.reduce((a, s) => a + (s.summary?.full || 0), 0);
    const total = ss.reduce((a, s) => a + (s.summary?.total || 0), 0);
    const sleep = [];
    for (let d = new Date(start); d < end; d = addDays(d, 1)) {
      const day = S.daily[isoDate(d)];
      if (day?.sleepH != null) sleep.push(day.sleepH);
    }
    out.push({
      start,
      sessions: ss.length,
      pct: total ? full / total : null,
      rpe: avg(ss.map((s) => s.rpe)),
      missed: ss.reduce((a, s) => a + (s.summary?.missed || 0), 0),
      sleep: avg(sleep),
    });
  }
  return out;
}

function mainChart(weeks) {
  const W = 340;
  const H = 180;
  const pl = 28;
  const pb = 24;
  const pt = 12;
  const bw = (W - pl) / weeks.length;
  const y = (v) => pt + (H - pt - pb) * (1 - v);
  const grid = [0, 0.5, 1].map((g) => `<line class="grid" x1="${pl}" x2="${W}" y1="${y(g)}" y2="${y(g)}"/><text class="axis" x="${pl - 6}" y="${y(g) + 4}" text-anchor="end">${Math.round(g * 100)}</text>`).join('');
  const bars = weeks.map((w, i) => {
    const x = pl + i * bw + bw * 0.22;
    const width = bw * 0.56;
    const cur = i === weeks.length - 1;
    const label = `<text class="axis" x="${x + width / 2}" y="${H - 6}" text-anchor="middle">${fmtShortDate(w.start)}</text>`;
    if (w.pct == null) return `<rect class="bar empty" x="${x}" y="${y(0) - 2}" width="${width}" height="2" rx="1"/>${label}`;
    return `<rect class="bar${cur ? ' cur' : ''}" x="${x}" y="${y(w.pct)}" width="${width}" height="${y(0) - y(w.pct)}" rx="3"><title>${Math.round(w.pct * 100)} % voll geschafft</title></rect>${label}`;
  }).join('');
  const pts = weeks.map((w, i) => (w.rpe == null ? null : [pl + i * bw + bw / 2, y(w.rpe / 10)])).filter(Boolean);
  const line = pts.length > 1 ? `<polyline class="rpe-line" points="${pts.map((p) => p.join(',')).join(' ')}"/>` : '';
  const dots = pts.map((p) => `<circle class="rpe-dot" cx="${p[0]}" cy="${p[1]}" r="3"/>`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Voll geschaffte Übungen pro Woche und Anstrengung">${grid}${bars}${line}${dots}</svg>`;
}

// Per exercise: weights and max reps from the first to the latest session
function exerciseProgress() {
  const map = new Map();
  for (const s of doneSessions()) {
    const seen = new Map();
    for (const e of Object.values(s.entries || {})) {
      const val = e.max ? e.done ?? e.reps : null;
      if (e.kg == null && val == null) continue;
      const cur = seen.get(e.name) || { name: e.name, kg: null, reps: null };
      if (e.kg != null) cur.kg = Math.max(cur.kg ?? 0, e.kg);
      if (val != null) cur.reps = Math.max(cur.reps ?? 0, val);
      seen.set(e.name, cur);
    }
    for (const [id, v] of seen) {
      if (!map.has(id)) map.set(id, { name: v.name, first: v, last: v, n: 0 });
      const m = map.get(id);
      m.last = v;
      m.n += 1;
    }
  }
  return [...map.values()];
}

const fmtKgN = (v) => fmtNum(v, v % 1 ? 1 : 0);

function gameSections() {
  const lv = levelOf(totalXp());
  const path = seasonPath();
  const first = parseIso(path.days[0].date);
  const pad = (first.getDay() + 6) % 7;
  const bs = badges();
  const last30 = Array.from({ length: 30 }, (_, i) => isoDate(addDays(new Date(), i - 29)));
  return `
    <div class="section-head" id="saison"><h2>Saison-Weg</h2><span class="num muted small">${path.done} von ${path.total + 1} Tagen gut</span></div>
    <div class="card">
      <p class="small">Jeder Tag ist ein Feld bis zum Saisonstart am ${fmtShortDate(parseIso(S.settings.seasonStart))} Ein Tag zählt als gut, wenn du trainiert oder mindestens 60 % deiner Habits geschafft hast. Bei allen Habits ist er voll.</p>
      <div class="season-grid">${'<i style="visibility:hidden"></i>'.repeat(pad % 7)}${path.days.map((x) => `<i class="${x.last ? 'goal' : x.state}${x.today ? ' now' : ''}" title="${fmtShortDate(parseIso(x.date))}"></i>`).join('')}</div>
      <div class="season-legend small">
        <span><i style="background:var(--accent)"></i>alle Habits</span>
        <span><i style="background:color-mix(in srgb, var(--accent) 55%, transparent)"></i>guter Tag</span>
        <span><i style="border:1px dashed var(--line-2)"></i>verpasst</span>
        <span><i style="border:2px solid var(--accent);border-radius:50%"></i>Saisonstart</span>
      </div>
    </div>

    <div class="section-head"><h2>Level</h2><span class="num muted small">${fmtNum(lv.xp)} XP</span></div>
    <div class="card">
      <ol class="plain small">${LEVELS.map((l, i) => `<li class="${i + 1 === lv.n ? 'ok' : ''}"><span>${i + 1}. ${esc(l.title)}${i + 1 === lv.n ? ' · du' : ''}</span><span class="num">${fmtNum(l.xp)} XP</span></li>`).join('')}</ol>
      <p class="muted small">Punkte: Habit ${XP.habit}, perfekter Tag +${XP.perfect}, Workout ${XP.workout}, Lauf oder Fußball ${XP.run}, Recovery ${XP.recovery}, 7 Tage Serie +${XP.streak7}, 30 Tage +${XP.streak30}.</p>
    </div>

    <div class="section-head"><h2>Abzeichen</h2><span class="num muted small">${bs.filter((b) => b.got).length} von ${bs.length}</span></div>
    <div class="badges">${bs.map((b) => `<div class="badge${b.got ? ' got' : ''}"><span class="badge-icon">${icon(b.got ? b.icon : 'lock', 18)}</span><span class="badge-title">${esc(b.title)}</span><span class="badge-text">${esc(b.text)}</span></div>`).join('')}</div>

    <div class="section-head"><h2>Habits, letzte 30 Tage</h2></div>
    <ul class="card hcal">${habitList().map((h) => `
      <li>
        <span>${esc(h.title)}</span>
        <span class="num muted small">${streak(h)} Tage · Bestwert ${bestStreak(h)}</span>
        <span class="hcal-dots">${last30.map((d) => `<i class="${habitDone(h, d) ? 'on' : ''}"></i>`).join('')}</span>
      </li>`).join('')}</ul>`;
}

const KIND_LABEL = { run: 'Laufen', football: 'Fußball', recovery: 'Erholung', habit: 'Gewohnheit' };

export async function renderProgress(root, params = {}) {
  const weeks = weeklyStats(8);
  const cur = weeks[weeks.length - 1];
  const prev = weeks[weeks.length - 2];
  const total = doneSessions().length;
  const lastDays = Array.from({ length: 7 }, (_, i) => addDays(new Date(), -i)).reverse();
  const sleep7 = avg(lastDays.map((d) => S.daily[isoDate(d)]?.sleepH).filter((x) => x != null));
  const photos = [...S.photos].sort((a, b) => a.takenAt - b.takenAt);
  const first = photos[0];
  const latest = photos[photos.length - 1];
  const prog = exerciseProgress();
  const history = S.sessions.filter((x) => x.status === 'done' && x.kind !== 'habit').sort((x, y) => y.finishedAt - x.finishedAt).slice(0, 15);
  const counts = goalCounts();
  const countsPrev = goalCounts(addDays(new Date(), -7));
  const load = weekLoad();
  const loadPrev = weekLoad(addDays(new Date(), -7));
  const diff = (a, b, digits = 0, unit = '') => (a == null || b == null ? 'keine Daten letzte Woche' : `${a - b > 0 ? '+' : ''}${fmtNum(a - b, digits)}${unit} vs. letzte Woche`);
  const weights = Object.values(S.daily).filter((x) => x.weight).sort((a, b) => (a.date < b.date ? -1 : 1));

  root.innerHTML = `
  <section class="page">
    <header class="page-head"><h1>Fortschritt</h1><p class="muted">${total === 1 ? '1 Workout' : `${total} Workouts`} seit dem Start</p></header>

    <div class="stats">
      <div class="stat"><span class="muted small">Workouts</span><span class="num fig">${cur.sessions}</span><span class="muted small">${diff(cur.sessions, prev.sessions)}</span></div>
      <div class="stat"><span class="muted small">Fußball</span><span class="num fig">${counts.football}</span><span class="muted small">${diff(counts.football, countsPrev.football)}</span></div>
      <div class="stat"><span class="muted small">Laufeinheiten</span><span class="num fig">${counts.fitness}</span><span class="muted small">${diff(counts.fitness, countsPrev.fitness)}</span></div>
      <div class="stat"><span class="muted small">Belastung <small>Min × RPE</small></span><span class="num fig">${fmtNum(load)}</span><span class="muted small">${loadPrev ? diff(load, loadPrev) : 'keine Daten letzte Woche'}</span></div>
      <div class="stat"><span class="muted small">Fehlende Wdh.</span><span class="num fig">${cur.missed}</span><span class="muted small">${prev.sessions ? diff(cur.missed, prev.missed) : 'keine Daten letzte Woche'}</span></div>
      <div class="stat"><span class="muted small">Ø Schlaf 7 Tage</span><span class="num fig">${sleep7 != null ? `${fmtNum(sleep7, 1)} h` : '–'}</span><span class="muted small">Ziel 7 bis 9 h</span></div>
    </div>
    ${loadPrev && load > loadPrev * 1.3 ? '<p class="coach small"><span class="coach-mark">Coach</span>Diese Woche über 30 Prozent mehr Belastung als letzte. Achte auf Schlaf und plane einen lockeren Tag ein.</p>' : ''}

    ${gameSections()}

    <div class="card">
      <div class="card-head"><h2>Voll geschafft pro Woche</h2><span class="muted small">in %</span></div>
      ${mainChart(weeks)}
      <div class="legend small"><span><i class="lg-bar"></i>Übungen voll geschafft</span><span><i class="lg-line"></i>Anstrengung (RPE)</span></div>
    </div>

    <div class="section-head"><h2>Körper</h2><label class="btn secondary sm">${icon('camera')} Foto<input type="file" accept="image/*" capture id="extra-photo" hidden></label></div>
    ${photos.length >= 2 ? `
    <div class="card compare">
      <div class="compare-box" id="compare" style="--pos:50%">
        <img data-photo="${latest.id}" data-size="blob" alt="Neuestes Foto">
        <img class="compare-top" data-photo="${first.id}" data-size="blob" alt="Erstes Foto">
        <span class="compare-tag left num">${fmtShortDate(new Date(first.takenAt))}</span>
        <span class="compare-tag right num">${fmtShortDate(new Date(latest.takenAt))}</span>
      </div>
      <input type="range" min="0" max="100" value="50" id="compare-range" aria-label="Vorher und nachher vergleichen">
      <p class="muted small">${daysBetween(new Date(first.takenAt), new Date(latest.takenAt))} Tage zwischen erstem und neuestem Foto</p>
    </div>` : `<p class="muted card">Nach jedem Workout machst du ein Foto. Ab dem zweiten siehst du hier den Vergleich.</p>`}
    ${photos.length ? `<div class="photo-grid">${[...photos].reverse().map((p) => `<figure><img data-photo="${p.id}" alt="Foto vom ${fmtShortDate(new Date(p.takenAt))}"><figcaption class="num">${fmtDayShort(new Date(p.takenAt))}${p.week ? ` · W${p.week}` : ''}</figcaption><button class="btn-icon sm del" data-act="del-photo" data-id="${p.id}" aria-label="Foto löschen">${icon('trash-2', 14)}</button></figure>`).join('')}</div>` : ''}

    ${weights.length >= 2 ? `<p class="muted small">Gewicht: ${fmtNum(weights[0].weight, 1)} kg am ${fmtShortDate(parseIso(weights[0].date))}, jetzt ${fmtNum(weights[weights.length - 1].weight, 1)} kg. Ziel laut Plan: 0,2 bis 0,5 kg pro Monat.</p>` : ''}

    ${prog.length ? `
    <div class="section-head"><h2>Gewichte und Maximal-Wdh.</h2><span class="muted small">erstes → letztes Mal</span></div>
    <ul class="card ranked">${prog.map((r) => {
      const parts = [];
      if (r.last.kg != null) parts.push(`${fmtKgN(r.first.kg ?? r.last.kg)} → ${fmtKgN(r.last.kg)} kg${r.first.kg != null && r.last.kg > r.first.kg ? ` <span class="ok">+${fmtKgN(r.last.kg - r.first.kg)}</span>` : ''}`);
      if (r.last.reps != null) parts.push(`${r.first.reps ?? r.last.reps} → ${r.last.reps} Wdh.${r.first.reps != null && r.last.reps > r.first.reps ? ` <span class="ok">+${r.last.reps - r.first.reps}</span>` : ''}`);
      return `<li><span lang="en">${esc(r.name)}</span><span class="num">${parts.join(' · ')}</span></li>`;
    }).join('')}</ul>` : ''}

    ${(S.settings.phases || []).length ? `
    <div class="section-head"><h2>Phasen</h2></div>
    <ul class="card ranked">${[...(S.settings.phases || []), { id: S.plan.id, title: S.plan.title, start: S.settings.planStart, current: true }].map((ph) => {
      const n = S.sessions.filter((x) => x.status === 'done' && (!x.kind || x.kind === 'workout') && x.planId === ph.id).length;
      return `<li><span>${esc(ph.title)}${ph.current ? ' <span class="pill">aktuell</span>' : ''}<span class="muted small"> · ab ${ph.start ? fmtShortDate(parseIso(ph.start)) : '–'}</span></span><span class="num">${n === 1 ? '1 Workout' : `${n} Workouts`}</span></li>`;
    }).join('')}</ul>` : ''}

    <div class="section-head"><h2>Schlaf</h2><span class="muted small">letzte 7 Tage</span></div>
    <ul class="card ranked sleep">${lastDays.map((d) => {
      const v = S.daily[isoDate(d)]?.sleepH;
      return `<li><span>${fmtDayShort(d)}</span><span class="sleep-bar"><i style="width:${v ? Math.min(100, (v / 10) * 100) : 0}%" class="${v != null && v < 7 ? 'low' : ''}"></i></span><span class="num">${v != null ? `${fmtNum(v, 1)} h` : '–'}</span></li>`;
    }).join('')}</ul>

    ${history.length ? `
    <div class="section-head"><h2>Verlauf</h2></div>
    <ul class="card history">${history.map((s) => {
      if (s.kind && s.kind !== 'workout') {
        return `<li><span><strong>${esc(s.title)}</strong><span class="muted small">${fmtDayShort(new Date(s.finishedAt))} · ${KIND_LABEL[s.kind] || ''}${s.minutes ? ` · ${s.minutes} Min` : ''}${s.data?.reps != null ? ` · ${s.data.reps} Runden` : ''}${s.data?.km ? ` · ${fmtNum(s.data.km, 1)} km` : ''}</span>${s.note ? `<span class="muted small hist-note">${esc(s.note)}</span>` : ''}</span><span class="num">${s.rpe ? `RPE ${s.rpe}` : ''}</span></li>`;
      }
      const day = S.plan.days.find((x) => x.id === s.dayId);
      const pct = s.summary?.total ? Math.round((s.summary.full / s.summary.total) * 100) : 0;
      return `<li><span><strong>${esc(day?.title || s.dayId)}</strong><span class="muted small">${fmtDayShort(new Date(s.finishedAt))} · Woche ${s.week} · ${fmtDuration(s.finishedAt - s.startedAt)}</span>${s.note ? `<span class="muted small hist-note">${esc(s.note)}</span>` : ''}</span><span class="num">${pct} % · RPE ${s.rpe ?? '–'}</span></li>`;
    }).join('')}</ul>` : ''}
  </section>`;

  hydratePhotos(root);
  const range = root.querySelector('#compare-range');
  if (range) range.oninput = () => root.querySelector('#compare').style.setProperty('--pos', `${range.value}%`);
  const extra = root.querySelector('#extra-photo');
  extra.onchange = async () => {
    if (!extra.files?.[0]) return;
    await savePhoto(extra.files[0], { kind: 'extra', week: planWeek() });
    toast('Foto gespeichert');
    renderProgress(root);
  };
  root.onclick = async (ev) => {
    const el = ev.target.closest('[data-act="del-photo"]');
    if (el && confirm('Dieses Foto löschen?')) {
      await deletePhoto(el.dataset.id);
      renderProgress(root);
    }
  };
}

// ---------------- Settings ("Mehr")

let pendingImport = null;
export function setPendingImport(r) { pendingImport = r; }

export function renderMore(root, params = {}) {
  const p = S.plan;
  const n = S.nutrition;
  const appUrl = location.href.split('#')[0];
  root.innerHTML = `
  <section class="page">
    <header class="page-head"><h1>Mehr</h1><p class="muted">Pläne, Profil, Apple Health, Erinnerungen</p></header>

    <div class="section-head"><h2>Pläne</h2></div>
    <div class="card">
      ${p ? `<div class="kv"><span>Training</span><span>${esc(p.title)} · ${p.stats.days} Tage · ${p.stats.exercises} Übungen · ${p.stats.videos} Videos</span></div>` : ''}
      ${n ? `<div class="kv"><span>Ernährung</span><span>${fmtNum(n.kcal)} kcal · ${n.stats.days} Plan-Tage</span></div>` : ''}
      ${pendingImport ? importPreview(pendingImport) : `
      <label class="btn primary">${icon('upload')} PDF oder Word hochladen<input type="file" accept="application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" id="pdf" hidden></label>
      <p class="muted small">Training oder Ernährung, die App erkennt das selbst. Für eine neue Phase einfach das neue PDF hochladen, dein Verlauf bleibt.</p>`}
    
      <div class="kv"><span>Stretching</span><span>${stretchExercises().length ? `${stretchExercises().length} Stretches${S.stretchLib ? ` · davon ${S.stretchLib.exercises.length} aus ${esc(S.stretchLib.source)}` : ''}` : 'noch keine'}</span></div>
      <label class="btn secondary">${icon('upload')} Stretches aus anderem Plan übernehmen<input type="file" accept="application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" id="stretch-src" hidden></label>
      <p class="muted small">Zum Beispiel aus Phase 5 oder 8. Die Stretches kommen in die Einheit „Stretching“ und bleiben auch, wenn du eine neue Phase hochlädst.</p>
    </div>

    <div class="section-head" id="habit-manage"><h2>Habits</h2><span class="muted small">${habitList().length} aktiv</span></div>
    <div class="card">
      <ul class="plain manage">${allHabitsForSettings().map((h) => {
        const on = !(S.settings.habitsOff || []).includes(h.id);
        return `<li><span>${esc(h.title)} <span class="group">${h.own ? 'eigene' : esc(h.group)}</span></span>
          <span class="row">${h.own ? `<button class="btn-icon sm ghost" data-act="hb-del" data-id="${esc(h.id)}" aria-label="${esc(h.title)} löschen">${icon('trash-2', 16)}</button>` : ''}
          <input type="checkbox" class="switch" data-act="hb-on" data-id="${esc(h.id)}" ${on ? 'checked' : ''} aria-label="${esc(h.title)} aktiv"></span></li>`;
      }).join('')}</ul>
      <div class="row"><input class="grow hb-new" id="hb-new" maxlength="48" placeholder="Eigener Habit, z. B. 10 Minuten Mobility"><button class="btn secondary" data-act="hb-add">${icon('plus')} Dazu</button></div>
    </div>

    <div class="section-head" id="idols"><h2>Vorbild-Bilder</h2><span class="muted small">${S.idols.length} Bilder</span></div>
    <div class="card">
      <p class="small">Wähl Bilder deines Vorbilds aus deiner Fotomediathek, auch Memes, mit mindestens 600 Pixeln an der kürzeren Seite. Die App zeigt sie bei Level-Aufstieg, Abzeichen, perfektem Tag und in der Vorbild-Karte. Sie bleiben nur auf diesem Handy.</p>
      ${S.idols.length ? `<div class="photo-grid">${S.idols.map((p) => `<figure><img data-photo="${p.id}" alt="Vorbild-Bild"><button class="btn-icon sm del" data-act="idol-del" data-id="${p.id}" aria-label="Bild entfernen">${icon('trash-2', 14)}</button></figure>`).join('')}</div>` : ''}
      <label class="btn secondary">${icon('image')} Bilder auswählen<input type="file" accept="image/*" multiple id="idol-add" hidden></label>
    </div>

    <div class="section-head"><h2>Profil</h2></div>
    <div class="card form">
      <label class="field"><span>Vorname</span><input id="s-name" value="${esc(S.settings.name)}" autocomplete="given-name"></label>
      <label class="field"><span>Gewicht in kg</span><input id="s-weight" inputmode="decimal" value="${S.settings.weightKg ? fmtNum(S.settings.weightKg, 1) : ''}"></label>
      <label class="field"><span>Planstart (Montag von Woche 1)</span><input id="s-start" type="date" value="${S.settings.planStart || ''}"></label>
      <label class="field"><span>Saisonstart</span><input id="s-season" type="date" value="${S.settings.seasonStart || ''}"></label>
      <button class="btn secondary" data-act="save-profile">${icon('check')} Speichern</button>
    </div>

    <div class="section-head"><h2>Erinnerungen</h2></div>
    <div class="card form">
      <p class="small">Die App legt dir Termine mit Erinnerung in deinen Kalender: Training an den Plan-Tagen, Kreatin am Morgen, Check-in am Abend. So bekommst du Mitteilungen aufs Handy, auch wenn die App zu ist.</p>
      <div class="grid-3">
        <label class="field"><span>Training</span><input id="r-train" type="time" value="${S.settings.reminderTime}"></label>
        <label class="field"><span>Kreatin</span><input id="r-crea" type="time" value="${S.settings.creatineTime}"></label>
        <label class="field"><span>Check-in</span><input id="r-check" type="time" value="${S.settings.checkinTime}"></label>
      </div>
      <button class="btn secondary" data-act="ics">${icon('calendar')} In den Kalender übernehmen</button>
    </div>

    <div class="section-head"><h2>Apple Health</h2></div>
    <div class="card form health">
      <p class="small">Eine Web-App darf Apple Health nicht direkt lesen. Mit einem Kurzbefehl schickt dein iPhone Schlaf, Schritte und Ruhepuls jeden Morgen automatisch hierher.</p>
      <details>
        <summary>Kurzbefehl einrichten, 5 Minuten</summary>
        <ol>
          <li>App <strong>Kurzbefehle</strong> öffnen, neuen Kurzbefehl anlegen.</li>
          <li>Aktion <strong>Health-Samples suchen</strong>: Typ Schlafanalyse, Startdatum in den letzten 18 Stunden.</li>
          <li>Aktion <strong>Details von Health-Sample abrufen</strong>: Dauer. Danach <strong>Statistik berechnen</strong>: Summe.</li>
          <li>Optional nochmal <strong>Health-Samples suchen</strong> für Schritte (heute, Summe) und Ruhepuls (letzter Wert).</li>
          <li>Aktion <strong>URL</strong> mit dieser Adresse, die Werte als Variablen einsetzen:<code>${esc(appUrl)}#/sync?sleep=SCHLAF&amp;steps=SCHRITTE&amp;rhr=RUHEPULS</code></li>
          <li>Aktion <strong>URLs öffnen</strong>.</li>
          <li>Unter <strong>Automation</strong>: Tageszeit 7:30, täglich, sofort ausführen.</li>
        </ol>
        <p class="muted small">Schlaf darf in Stunden, Minuten oder Sekunden kommen, die App rechnet um. Dazu noch hrv und weight als Werte möglich.</p>
      </details>
      <a class="btn secondary" href="#/sync?sleep=7,5&steps=6400&rhr=56">${icon('heart-pulse')} Mit Beispielwerten testen</a>
    </div>

    <div class="section-head"><h2>Deine Daten</h2></div>
    <div class="card form">
      <p class="small">Alles bleibt auf diesem Handy: Pläne, Einträge und Fotos. Es geht nichts an einen Server. Mach ab und zu eine Sicherung, falls du das Handy wechselst.</p>
      <div class="row wrap">
        <button class="btn secondary" data-act="backup">${icon('download')} Sicherung speichern</button>
        <label class="btn secondary">${icon('upload')} Sicherung laden<input type="file" accept="application/json" id="restore" hidden></label>
      </div>
      <button class="link danger" data-act="wipe">Alle Daten löschen</button>
    </div>
    <p class="muted small center">Daten bleiben lokal · Videos kommen von Vimeo und YouTube</p>
  </section>`;

  const pdf = root.querySelector('#pdf');
  if (pdf) pdf.onchange = async () => {
    const f = pdf.files?.[0];
    if (!f) return;
    toast('PDF wird gelesen');
    try {
      pendingImport = await readPdf(f);
    } catch (e) {
      toast(e.message || 'Das PDF konnte ich nicht lesen');
      pdf.value = '';
      return;
    }
    renderMore(root);
  };
  hydratePhotos(root);
  const idolAdd = root.querySelector('#idol-add');
  if (idolAdd) idolAdd.onchange = async () => {
    const files = [...(idolAdd.files || [])].slice(0, 30);
    if (!files.length) return;
    toast(files.length === 1 ? 'Bild wird geprüft' : `${files.length} Bilder werden geprüft`);
    let saved = 0;
    let small = 0;
    for (const f of files) {
      try {
        // Only sharp pictures: at least 600 px on the shorter side
        const bmp = await createImageBitmap(f);
        const minSide = Math.min(bmp.width, bmp.height);
        bmp.close?.();
        if (minSide < 600) { small++; continue; }
        await savePhoto(f, { kind: 'idol' });
        saved++;
      } catch (e) { small++; }
    }
    toast(small ? `${saved} gespeichert, ${small} zu klein oder unscharf (unter 600 Pixel)` : `${saved} Bilder gespeichert`);
    idolAdd.value = '';
    renderMore(root);
    document.getElementById('idols')?.scrollIntoView({ block: 'start' });
  };
  const stretchSrc = root.querySelector('#stretch-src');
  if (stretchSrc) stretchSrc.onchange = async () => {
    const f = stretchSrc.files?.[0];
    if (!f) return;
    toast('Dokument wird gelesen');
    try {
      const r = await readPdf(f);
      if (r.type !== 'training') throw new Error('Das ist ein Ernährungsplan. Für Stretches brauche ich einen Trainingsplan.');
      const seen = new Set();
      const ex = [];
      for (const d of r.data.days) for (const sec of d.sections) if (sec.kind === 'stretch') for (const e of sec.exercises) {
        const k = e.name.toLowerCase();
        if (!seen.has(k)) { seen.add(k); ex.push({ ...e, id: `lib-${ex.length + 1}` }); }
      }
      if (!ex.length) throw new Error('In diesem Plan habe ich keine Stretches gefunden.');
      S.stretchLib = { source: r.data.title, exercises: ex, importedAt: Date.now() };
      await saveStretchLib();
      toast(`${ex.length} Stretches aus ${r.data.title} übernommen`);
    } catch (e) {
      toast(e.message || 'Das Dokument konnte ich nicht lesen');
    }
    stretchSrc.value = '';
    renderMore(root);
  };
  const restore = root.querySelector('#restore');
  restore.onchange = async () => {
    const f = restore.files?.[0];
    if (!f) return;
    if (!confirm('Sicherung laden? Die aktuellen Daten werden ersetzt.')) return;
    await restoreBackup(f);
    toast('Sicherung geladen');
    go('#/heute');
  };

  root.onclick = async (ev) => {
    const el = ev.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    if (act === 'idol-del') { await deletePhoto(el.dataset.id); renderMore(root); document.getElementById('idols')?.scrollIntoView({ block: 'start' }); return; }
    if (act === 'hb-on') { await setHabitActive(el.dataset.id, el.checked); const c = root.querySelector('#habit-manage .muted'); if (c) c.textContent = `${habitList().length} aktiv`; return; }
    if (act === 'hb-del') { if (confirm('Diesen Habit löschen? Abgehakte Tage bleiben gespeichert.')) { await removeOwnHabit(el.dataset.id); renderMore(root); } return; }
    if (act === 'hb-add') {
      const v = root.querySelector('#hb-new').value.trim();
      if (!v) { toast('Gib dem Habit einen Namen'); return; }
      await addOwnHabit(v);
      toast('Habit dazugekommen');
      renderMore(root);
      document.getElementById('habit-manage')?.scrollIntoView({ block: 'start' });
      return;
    }
    if (act === 'confirm-import') {
      const start = root.querySelector('#imp-start')?.value;
      await applyImport(pendingImport, { planStart: start });
      toast(pendingImport.type === 'training' ? 'Trainingsplan übernommen' : 'Ernährungsplan übernommen');
      pendingImport = null;
      renderMore(root);
    } else if (act === 'cancel-import') {
      pendingImport = null;
      renderMore(root);
    } else if (act === 'save-profile') {
      S.settings.name = root.querySelector('#s-name').value.trim();
      S.settings.weightKg = parseDecimal(root.querySelector('#s-weight').value);
      S.settings.planStart = root.querySelector('#s-start').value || S.settings.planStart;
      S.settings.seasonStart = root.querySelector('#s-season').value || S.settings.seasonStart;
      await saveSettings();
      toast('Gespeichert');
    } else if (act === 'ics') {
      S.settings.reminderTime = root.querySelector('#r-train').value || S.settings.reminderTime;
      S.settings.creatineTime = root.querySelector('#r-crea').value || S.settings.creatineTime;
      S.settings.checkinTime = root.querySelector('#r-check').value || S.settings.checkinTime;
      await saveSettings();
      downloadIcs();
    } else if (act === 'backup') {
      await downloadBackup();
    } else if (act === 'wipe') {
      if (confirm('Wirklich alle Daten löschen? Das kann nicht rückgängig gemacht werden.') && confirm('Auch alle Fotos? Letzte Bestätigung.')) {
        await db.clearAll();
        await loadState();
        go('#/');
      }
    }
  };
}

function importPreview(r) {
  if (r.type === 'training') {
    const d = r.data;
    return `
    <div class="import">
      <h3>${esc(d.title)}${d.coach ? ` von ${esc(d.coach)}` : ''}</h3>
      <p class="num">${d.stats.days} Trainingstage · ${d.stats.exercises} Übungen · ${d.stats.videos} Videos · ${d.weeks} Wochen</p>
      <ul class="plain small">${d.days.map((x) => `<li><span>${esc(x.title)}</span><span>${x.sections.map((s) => KIND_SHORT[s.kind]).join(' · ')}</span></li>`).join('')}</ul>
      ${S.plan && S.plan.id !== d.id ? `<p class="small">${esc(d.title)} ersetzt ${esc(S.plan.title)}. Workouts, Läufe und Wochenplan werden neu aufgebaut, dein Verlauf mit Fotos, Gewichten und Notizen bleibt.</p>` : ''}
      <label class="field"><span>Woche 1 startet am</span><input id="imp-start" type="date" value="${defaultStart()}"></label>
      <div class="row"><button class="btn secondary" data-act="cancel-import">Abbrechen</button><button class="btn primary grow" data-act="confirm-import">${icon('check')} Übernehmen</button></div>
    </div>`;
  }
  const d = r.data;
  return `
  <div class="import">
    <h3>Ernährungsplan</h3>
    <p class="num">${fmtNum(d.kcal)} kcal · ${d.protein} g Eiweiß · ${d.stats.days} Plan-Tage · ${d.stats.meals} Mahlzeiten</p>
    <p class="small muted">Wasser ${d.waterL ? `${d.waterL[0]}–${d.waterL[1]} L` : '–'} · Kreatin ${d.creatineG || '–'} g</p>
    <div class="row"><button class="btn secondary" data-act="cancel-import">Abbrechen</button><button class="btn primary grow" data-act="confirm-import">${icon('check')} Übernehmen</button></div>
  </div>`;
}

// ---------------- Calendar reminders

function icsDate(d, time) {
  const [h, m] = time.split(':').map(Number);
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m);
  const p = (v) => String(v).padStart(2, '0');
  return `${x.getFullYear()}${p(x.getMonth() + 1)}${p(x.getDate())}T${p(x.getHours())}${p(x.getMinutes())}00`;
}

function downloadIcs() {
  const appUrl = location.href.split('#')[0];
  const start = mondayOf();
  const until = S.settings.seasonStart ? parseIso(S.settings.seasonStart) : addDays(start, 120);
  const untilStr = `${icsDate(until, '23:59')}`;
  const BYDAY = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
  const stamp = icsDate(new Date(), '00:00');
  const ev = (uid, dt, rrule, title, desc) => [
    'BEGIN:VEVENT', `UID:${uid}@ricfit-app`, `DTSTAMP:${stamp}`, `DTSTART:${dt}`, `DURATION:PT15M`, rrule, `SUMMARY:${title}`,
    `DESCRIPTION:${desc} ${appUrl}`, `URL:${appUrl}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${title}`, 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT',
  ].join('\r\n');
  // One weekly reminder per weekday with exactly what is planned that day
  const dayEvents = weekPlan().map((ids, i) => {
    const items = ids.map(byId).filter((x) => x && x.kind !== 'rest');
    if (!items.length) return null;
    const title = items.map((x) => x.title).join(' · ');
    return ev(`day${i}`, icsDate(addDays(start, i), S.settings.reminderTime), `RRULE:FREQ=WEEKLY;BYDAY=${BYDAY[i]};UNTIL=${untilStr}`, title, `Heute: ${items.map((x) => x.title).join(', ')}.`);
  }).filter(Boolean);
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ricfit-app//DE', 'CALSCALE:GREGORIAN',
    ...dayEvents,
    ev('creatine', icsDate(start, S.settings.creatineTime), `RRULE:FREQ=DAILY;UNTIL=${untilStr}`, `Kreatin ${S.nutrition?.creatineG || 5} g`, 'Kreatin nehmen und in der App abhaken.'),
    ev('checkin', icsDate(start, S.settings.checkinTime), `RRULE:FREQ=DAILY;UNTIL=${untilStr}`, 'Check-in: Wie war dein Tag', 'Schlaf, Wasser, Muskelkater eintragen. Was ist los heute?'),
    'END:VCALENDAR',
  ].join('\r\n');
  const blob = new Blob([ics], { type: 'text/calendar' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'termed-fitness-erinnerungen.ics';
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast('Kalenderdatei erstellt. Öffnen und Termine hinzufügen');
}

// ---------------- Backup

const blobToDataUrl = (b) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); });
const dataUrlToBlob = async (u) => (await fetch(u)).blob();

async function downloadBackup() {
  toast('Sicherung wird erstellt');
  const photos = await db.all('photos');
  const out = {
    app: 'ricfit-app',
    version: 1,
    exportedAt: new Date().toISOString(),
    kv: { settings: S.settings, plan: S.plan, nutrition: S.nutrition, active: S.active, stretches: S.stretchLib },
    sessions: await db.all('sessions'),
    daily: await db.all('daily'),
    photos: await Promise.all(photos.map(async (p) => ({ ...p, blob: await blobToDataUrl(p.blob), thumb: await blobToDataUrl(p.thumb) }))),
  };
  const file = new File([JSON.stringify(out)], `termed-fitness-sicherung-${isoDate()}.json`, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Termed Fitness Sicherung' }); return; } catch (e) { /* fall back to download */ }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function restoreBackup(f) {
  const data = JSON.parse(await f.text());
  if (data.app !== 'ricfit-app') { toast('Das ist keine Sicherung dieser App'); return; }
  await db.clearAll();
  for (const [k, v] of Object.entries(data.kv || {})) if (v) await db.put('kv', v, k);
  for (const s of data.sessions || []) await db.put('sessions', s);
  for (const d of data.daily || []) await db.put('daily', d);
  for (const p of data.photos || []) await db.put('photos', { ...p, blob: await dataUrlToBlob(p.blob), thumb: await dataUrlToBlob(p.thumb) });
  await loadState();
}

// ---------------- Onboarding

let onb = { training: null, nutrition: null };

export function renderOnboarding(root) {
  const t = onb.training?.data;
  const n = onb.nutrition?.data;
  root.innerHTML = `
  <section class="page onboarding">
    ${centerCircle({ size: 120, pct: t ? (n ? 1 : 0.5) : 0, value: '', id: 'onb-cc' })}
    <h1>Dein Trainingsplan als App</h1>
    <p class="muted">Lade das PDF von deinem Coach hoch. Daraus werden deine Workouts mit Videos, Timer und Tracking. Alles bleibt auf diesem Handy.</p>

    <ol class="onb-steps">
      <li class="${t ? 'done' : ''}">
        <span class="onb-n num">1</span>
        <div>
          <h2>Trainingsplan</h2>
          ${t ? `<p class="num small">${esc(t.title)} · ${t.stats.days} Tage · ${t.stats.exercises} Übungen · ${t.stats.videos} Videos</p>` : '<p class="small muted">PDF mit Day 1, Day 2 und so weiter</p>'}
          <label class="btn ${t ? 'secondary' : 'primary'}">${icon('upload')} ${t ? 'Anderes PDF' : 'Trainings-PDF wählen'}<input type="file" accept="application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" data-kind="training" hidden></label>
        </div>
      </li>
      <li class="${n ? 'done' : ''}">
        <span class="onb-n num">2</span>
        <div>
          <h2>Ernährungsplan <span class="muted small">optional</span></h2>
          ${n ? `<p class="num small">${fmtNum(n.kcal)} kcal · ${n.protein} g Eiweiß · ${n.stats.days} Plan-Tage</p>` : '<p class="small muted">PDF mit Kalorien, Makros und Essensplan</p>'}
          <label class="btn secondary">${icon('upload')} ${n ? 'Anderes PDF' : 'Ernährungs-PDF wählen'}<input type="file" accept="application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" data-kind="nutrition" hidden></label>
        </div>
      </li>
      <li>
        <span class="onb-n num">3</span>
        <div class="form">
          <h2>Termine</h2>
          <label class="field"><span>Woche 1 startet am</span><input id="o-start" type="date" value="${S.settings.planStart || isoDate(mondayOf())}"></label>
          <label class="field"><span>Saisonstart</span><input id="o-season" type="date" value="${S.settings.seasonStart}"></label>
        </div>
      </li>
    </ol>
    <button class="btn primary big" data-act="finish" ${t ? '' : 'disabled'}>Plan starten</button>
    <label class="link center">Neues Handy? Sicherung laden<input type="file" accept="application/json" id="o-restore" hidden></label>
    ${location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? '<button class="link" data-act="dev">Test-PDFs aus _private laden</button>' : ''}
  </section>`;

  const rest = root.querySelector('#o-restore');
  rest.onchange = async () => {
    const f = rest.files?.[0];
    if (!f) return;
    try {
      await restoreBackup(f);
    } catch (e) {
      toast('Die Sicherung konnte ich nicht lesen');
      return;
    }
    if (S.plan) { toast('Sicherung geladen'); go('#/heute'); }
  };
  root.querySelectorAll('input[type=file][data-kind]').forEach((inp) => {
    inp.onchange = async () => {
      const f = inp.files?.[0];
      if (!f) return;
      toast('PDF wird gelesen');
      try {
        const r = await readPdf(f);
        onb[r.type] = r;
        if (r.type !== inp.dataset.kind) toast(r.type === 'training' ? 'Das war der Trainingsplan, passt auch' : 'Das war der Ernährungsplan, passt auch');
      } catch (e) {
        toast(e.message || 'Das PDF konnte ich nicht lesen');
      }
      inp.value = '';
      renderOnboarding(root);
    };
  });
  root.onclick = async (ev) => {
    const el = ev.target.closest('[data-act]');
    if (!el) return;
    if (el.dataset.act === 'finish') {
      const start = root.querySelector('#o-start').value;
      S.settings.seasonStart = root.querySelector('#o-season').value || S.settings.seasonStart;
      await applyImport(onb.training, { planStart: start });
      S.settings.planStart = start;
      if (onb.nutrition) await applyImport(onb.nutrition);
      await saveSettings();
      onb = { training: null, nutrition: null };
      go('#/heute');
    }
    if (el.dataset.act === 'dev') {
      const { devImport } = await import('./importer.js');
      await devImport();
      go('#/heute');
    }
  };
}

// ---------------- Apple Health sync via URL

export async function handleSync(params) {
  const date = params.date || isoDate();
  const d = today(date);
  let sleep = parseDecimal(params.sleep ?? params.sleepmin);
  if (sleep != null) {
    if (sleep > 1440) sleep /= 3600;
    else if (sleep > 24) sleep /= 60;
    d.sleepH = Math.round(sleep * 10) / 10;
  }
  const steps = parseDecimal(params.steps);
  const rhr = parseDecimal(params.rhr);
  const hrv = parseDecimal(params.hrv);
  const weight = parseDecimal(params.weight);
  d.health = {
    ...(d.health || {}),
    ...(steps != null ? { steps: Math.round(steps) } : {}),
    ...(rhr != null ? { rhr: Math.round(rhr) } : {}),
    ...(hrv != null ? { hrv: Math.round(hrv) } : {}),
    time: new Date().toTimeString().slice(0, 5),
  };
  if (weight != null) d.weight = Math.round(weight * 10) / 10;
  await saveDaily(date);
  const parts = [];
  if (d.sleepH != null && sleep != null) parts.push(`Schlaf ${fmtNum(d.sleepH, 1)} h`);
  if (steps != null) parts.push(`${fmtNum(steps)} Schritte`);
  if (rhr != null) parts.push(`Ruhepuls ${Math.round(rhr)}`);
  toast(parts.length ? `Aus Health übernommen: ${parts.join(', ')}` : 'Keine Werte erkannt');
  history.replaceState(null, '', '#/heute');
  go('#/heute');
}

export { saveActive };
