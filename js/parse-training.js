// Turns the text lines of a RicFit training PDF into a structured plan.
// The PDF layout: Day N -> Part 1..5 -> numbered exercises with Reps/Time,
// week specific values ("Weeks 1 & 2: ...") and a "Video:" link each.

const WEEKDAYS = {
  monday: 'Montag', tuesday: 'Dienstag', wednesday: 'Mittwoch', thursday: 'Donnerstag',
  friday: 'Freitag', saturday: 'Samstag', sunday: 'Sonntag',
};

const NOISE = [
  /^RicFit LLC\.?$/i, /^\d{1,2}$/, /^_{5,}$/, /^RicFit LLC\. Confidential/i,
  /^Please note that this document/i, /^disclosure of the contents/i,
  /^and intellectual property rights/i, /^© \[?\d{4}/,
];

const LABEL_ONLY = /^(Cueing|Reps|Time|Times|Reps\/Sets|Sets|Distance|Finisher|Working Sets|General Cues\/Tips)\s*:?$/i;
const WEEK_LINE = /^Weeks?\s*(\d)(?:\s*(?:&|and|-|,|\+)\s*(\d))?\s*:\s*(.+)$/i;
const NUMBERED = /^(\d{1,2})([a-z])?\.\s*(\S.*)$/;
const LABEL = /^(Reps\/Sets|Reps|Times|Time|Sets|Distance)\s*:\s*(.*)$/i;
// Log tables and filler from later phases ("Week 1:", "Set 1: 3", "Workout Finished")
const SKIP = [/^Week\s*\d+\s*:\s*$/i, /^Set\s*\d+\s*:/i, /^Please Input How You Felt/i, /^You.re Improving/i, /^Workout Finished/i, /^Now, we move into recovery/i];
const URL_RE = /(https?:\/\/[^\s]+)/i;

export function clean(text) {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseVideo(url) {
  if (!url) return null;
  url = url.replace(/[).,;]+$/, '');
  let m = url.match(/vimeo\.com\/(?:manage\/videos\/|video\/)?(\d+)(?:\/([0-9a-f]{6,}))?/i);
  if (m) return { provider: 'vimeo', id: m[1], hash: m[2] || null, url };
  m = url.match(/(?:youtube\.com\/watch\?[^#]*v=|youtu\.be\/)([\w-]{11})/i);
  if (m) {
    const t = url.match(/[?&]t=(\d+)/);
    return { provider: 'youtube', id: m[1], start: t ? Number(t[1]) : 0, url };
  }
  return { provider: 'link', url };
}

function weeksOf(a, b) {
  const from = Number(a);
  const to = b ? Number(b) : from;
  const out = [];
  for (let w = Math.min(from, to); w <= Math.max(from, to); w++) out.push(w);
  return out;
}

function kindFrom(text) {
  const t = text.toLowerCase();
  if (/shift|relax|breath/.test(t)) return 'breathing';
  if (/corrective|stretch|mobility/.test(t)) return 'stretch';
  if (/core/.test(t)) return 'core';
  if (/finisher|conditioning/.test(t)) return 'finisher';
  if (/plyo/.test(t)) return 'plyo';
  if (/power/.test(t)) return 'power';
  if (/strength|accessor/.test(t)) return 'strength';
  if (/complex/.test(t)) return 'complex';
  if (/warm ?up|movement prep|activation|osteoarticular/.test(t)) return 'warmup';
  if (/speed|agility|sprint/.test(t)) return 'speed';
  return null;
}

const KIND_TITLE = {
  warmup: 'Warm-up',
  warmup2: 'Warm-up Abschluss',
  plyo: 'Plyometrie',
  circuit: 'Zirkel',
  core: 'Core-Finisher',
  finisher: 'Cardio-Finisher',
  breathing: 'Atmung',
  power: 'Power',
  strength: 'Krafttraining',
  complex: 'Komplex',
  stretch: 'Stretching',
  speed: 'Schnelligkeit',
  main: 'Übungen',
  unknown: 'Block',
};

const GOAL_KEYS = [
  { key: 'workout', re: /total body workout/i, label: 'Ganzkörper-Workouts' },
  { key: 'fitness', re: /fitness session/i, label: 'Fitness-Einheiten' },
  { key: 'ball', re: /ball work/i, label: 'Ballarbeit' },
  { key: 'recovery', re: /recovery/i, label: 'Recovery-Sessions' },
  { key: 'tv', re: /tv stretch/i, label: 'TV-Stretches' },
];

function openParen(s) {
  return (s.match(/\(/g) || []).length > (s.match(/\)/g) || []).length;
}

export function parseTraining(rawLines) {
  const plan = {
    kind: 'training',
    version: 1,
    title: 'Trainingsplan',
    phase: null,
    coach: null,
    client: null,
    motto: null,
    weeks: 4,
    preSession: '',
    schedule: [],
    weeklyGoals: [],
    days: [],
    extras: [],
    extrasIntro: [],
  };

  let mode = 'intro';
  let day = null;
  let sec = null;
  let ex = null;
  let pendingAlt = false;
  let schedEntry = null;
  let goal = null;
  let inGoals = false;
  let preSessionOpen = false;
  let expectClient = false;
  let extra = null;
  let lastExtraHeading = null;

  const newSection = (n, kind, title) => {
    sec = {
      id: `${day.id}s${day.sections.length + 1}`,
      n,
      kind: kind || 'unknown',
      title: title || null,
      rounds: {},
      restSec: null,
      notes: [],
      exercises: [],
    };
    day.sections.push(sec);
    ex = null;
    pendingAlt = false;
  };

  const newExercise = (name) => {
    name = clean(name).replace(/:$/, '').replace(/\sJ\)/, ')').trim();
    ex = {
      id: `${sec.id}e${sec.exercises.length + 1}`,
      name,
      target: { base: null, w: {} },
      targetNote: null,
      details: [],
      cues: [],
      video: null,
      altOf: null,
    };
    if (pendingAlt && sec.exercises.length) {
      ex.altOf = sec.exercises[sec.exercises.length - 1].id;
      pendingAlt = false;
    }
    sec.exercises.push(ex);
  };

  for (const raw of rawLines) {
    const t = clean(typeof raw === 'string' ? raw : raw.text);
    if (!t || NOISE.some((r) => r.test(t)) || SKIP.some((r) => r.test(t))) continue;

    // ----- Global switches
    const dayM = t.match(/^Day\s*(\d+)\b/i);
    if (dayM && t.length < 40) {
      mode = 'day';
      inGoals = false;
      preSessionOpen = false;
      const n = Number(dayM[1]);
      day = { id: `d${n}`, n, title: `Workout ${n}`, sections: [] };
      plan.days.push(day);
      sec = null;
      ex = null;
      continue;
    }
    if (/^(Alternative )?Fitness Sessions?:?$/i.test(t) || (mode === 'day' && /^(Alternative )?Fitness Session\s*\d+:?$/i.test(t)) || /^Recovery Days:?$/i.test(t) || /^Cardio Sessions:?$/i.test(t)) {
      mode = 'extras';
      extra = null;
      if (/^Recovery Days/i.test(t)) lastExtraHeading = t;
      if (!/Fitness Session\s*\d/i.test(t)) continue;
    }

    // ----- Intro pages: title, client, schedule, weekly goals
    if (mode === 'intro') {
      const phaseM = t.match(/^Phase\s*(\d+)$/i);
      if (phaseM) { plan.phase = Number(phaseM[1]); plan.title = `Phase ${phaseM[1]}`; continue; }
      const byM = t.match(/^By\s+(.+)$/);
      if (byM && !plan.coach) { plan.coach = byM[1]; continue; }
      if (/^Client:?$/i.test(t)) { expectClient = true; continue; }
      if (expectClient) { plan.client = t; expectClient = false; continue; }
      if (!plan.motto && /^"/.test(t) && plan.days.length === 0 && !plan.client) {
        plan.motto = t; continue;
      }
      if (plan.motto && plan.motto.split('"').length < 3 && !plan.client) {
        plan.motto += ' ' + t; continue;
      }

      const wd = t.match(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday):?$/i);
      if (wd) {
        schedEntry = { day: WEEKDAYS[wd[1].toLowerCase()], items: [] };
        plan.schedule.push(schedEntry);
        continue;
      }
      if (schedEntry && /^The most important/i.test(t)) { schedEntry = null; continue; }
      if (schedEntry) { schedEntry.items.push(t.replace(/^-\s*/, '')); continue; }

      if (/Goals for the Week/i.test(t)) { inGoals = true; continue; }
      if (inGoals) {
        if (/^Listen to your body/i.test(t)) { inGoals = false; goal = null; continue; }
        const gm = t.match(NUMBERED);
        if (gm) {
          goal = { text: gm[3] };
          plan.weeklyGoals.push(goal);
        } else if (goal && !/^-/.test(t)) {
          goal.text += ' ' + t;
        }
        continue;
      }
      if (/^Before every session/i.test(t)) { plan.preSession = t; preSessionOpen = true; continue; }
      if (preSessionOpen) { plan.preSession += ' ' + t; continue; }
      continue;
    }

    // ----- Extras: fitness sessions and recovery
    if (mode === 'extras') {
      const fsM = t.match(/^(?:Alternative )?Fitness Session\s*(\d+):?$/i);
      const urlM = t.match(URL_RE);
      if (fsM) {
        extra = { id: `fs${fsM[1]}`, type: 'fitness', title: `Fitness Session ${fsM[1]}`, lines: [], video: null };
        plan.extras.push(extra);
        continue;
      }
      if (/^Active Recovery/i.test(t)) { lastExtraHeading = t; extra = null; continue; }
      if (/^Full Follow Along Recovery/i.test(t) || (lastExtraHeading && NUMBERED.test(t))) {
        const name = clean(t.replace(NUMBERED, '$3')).replace(/:$/, '');
        extra = {
          id: `rc${plan.extras.filter((e) => e.type === 'recovery').length + 1}`,
          type: 'recovery',
          title: name,
          lines: [],
          video: null,
        };
        plan.extras.push(extra);
        continue;
      }
      if (urlM) {
        const v = parseVideo(urlM[1]);
        if (extra && !extra.video) extra.video = v;
        continue;
      }
      if (/^You Can Also Include/i.test(t)) continue;
      if (extra) extra.lines.push(t);
      else plan.extrasIntro.push(t);
      continue;
    }

    // ----- Day mode
    if (!day) continue;

    const workoutM = t.match(/^Workout\s*(\d+):?$/i);
    if (workoutM) { day.title = `Workout ${workoutM[1]}`; continue; }
    if (!sec && !day.subtitle && t.length < 32 && !/[:.!]$/.test(t) && /^[A-Z]/.test(t) && !NUMBERED.test(t) && !kindFrom(t)) {
      day.subtitle = t;
      continue;
    }

    const partM = t.match(/\bPart\s*(\d)\b/i);
    if (partM && t.length < 40) {
      const kind = kindFrom(t);
      newSection(Number(partM[1]), kind, null);
      continue;
    }

    let headKind = t.length < 48 && (/:$/.test(t) || /^complex\s*\d+\s*:/i.test(t)) && !NUMBERED.test(t) && !LABEL.test(t) && !/^https?:/i.test(t) ? kindFrom(t) : null;
    if (headKind && sec && sec.kind === headKind && ['stretch', 'breathing'].includes(headKind) && !/^(stretching|corrective exercises|the (post cardio )?shift|mobility)\b/i.test(t)) {
      if (!(sec.kind === 'breathing' && sec.exercises.length === 0 && !/\d/.test(t))) { newExercise(t); continue; }
      headKind = null;
    }
    if (headKind && !(sec && sec.exercises.length === 0 && (sec.kind === 'unknown' || sec.kind === headKind))) {
      newSection(sec ? sec.n + 1 : 1, headKind, null);
      sec.heading = t.replace(/:$/, '');
      if (/optional/i.test(t)) sec.optional = true;
      continue;
    }

    if (/^(After all Warmup Exercises are Done|Do these after the Dynamic Warmup)/i.test(t)) {
      newSection(sec ? sec.n : 1, 'warmup2', null);
      sec.rounds = { 1: 1, 2: 1, 3: 1, 4: 1 };
      continue;
    }

    if (/^(main )?work:?$/i.test(t) && day) { newSection(sec ? sec.n + 1 : 1, 'main', null); continue; }
    if (!sec && (NUMBERED.test(t) || /\bTotal Rounds\b/i.test(t))) newSection(1, 'main', null);
    if (!sec) continue;

    if (/^Working Sets:?$/i.test(t)) {
      if (sec.kind === 'plyo') newSection(sec.n, 'circuit', null);
      continue;
    }

    if (sec.kind === 'unknown' && t.length < 40 && /:$/.test(t) && kindFrom(t)) {
      sec.kind = kindFrom(t);
      continue;
    }
    if (!ex && /:$/.test(t) && t.length < 40 && kindFrom(t) === sec.kind) {
      if (sec.kind === 'breathing' && /\d/.test(t)) newExercise(t);
      continue;
    }

    // Video link
    const videoM = t.match(/^Video:\s*(\S+)/i) || (t.match(/^https?:\/\//) ? [null, t] : null);
    if (videoM) {
      if (ex && !ex.video) ex.video = parseVideo(videoM[1]);
      continue;
    }

    // Rounds / sets for the block, given before the first exercise
    if (!ex) {
      const wm = t.match(WEEK_LINE);
      const rm = (wm ? wm[3] : t).match(/(\d+)(?:\s*-\s*\d+)?\s*(?:total\s+|working\s+)?(rounds?|sets?)\b/i);
      if (wm && rm) {
        for (const w of weeksOf(wm[1], wm[2])) sec.rounds[w] = Number(rm[1]);
        const rest = wm[3].replace(rm[0], '').replace(/total|of the circuit|in circuit like fashion|\(|\)/gi, '').trim();
        if (rest.length > 12) sec.notes.push(clean(wm[3].replace(/^.*?\(/, '').replace(/\)$/, '')));
        continue;
      }
      if (!wm && rm && (t.length < 60 || /^\d/.test(t))) {
        for (let w = 1; w <= 4; w++) sec.rounds[w] = Number(rm[1]);
        continue;
      }
    }

    if (/^If you don'?t have ropes/i.test(t) || /^If you don'?t have .*do these:?$/i.test(t)) {
      pendingAlt = true;
      continue;
    }

    if (LABEL_ONLY.test(t)) continue;

    // Numbered exercise
    const nm = t.match(NUMBERED);
    if (nm && !/^\d+\.\d/.test(t)) {
      newExercise(nm[3]);
      if (nm[2]) ex.tag = `${nm[1]}${nm[2]}`;
      continue;
    }

    // Unnumbered exercise in blocks that do not number their exercises
    const isCue = /^[-•*]/.test(t) && !/^\*\*/.test(t);
    const instruction = /^(rest|after|before|complete|do |take|try|make|you |this |that |if |please|note|go |the goal|keep|focus|remember|each |all |work$|superset|no rest)/i.test(t) || /rest in between|\bno rest\b/i.test(t) || /^\d+\s*(seconds?|minutes?)\s+rest/i.test(t);
    if (!instruction && !isCue && (!ex || ex.video || pendingAlt) && /^[A-Z0-9]/.test(t) && (t.length < 48 || /\(/.test(t)) && !/[.!]$/.test(t) && !WEEK_LINE.test(t)) {
      newExercise(t);
      continue;
    }

    // Rest time hint
    const restM = t.match(/rest\s+(one|\d+)(?:\s*-\s*(\d+))?\s*(minutes?|min|seconds?|sec)/i) || (() => { const r = t.match(/^(\d+)(?:\s*-\s*(\d+))?\s*(minutes?|seconds?)\s+rest/i); return r ? [r[0], r[1], r[2], r[3]] : null; })();
    if (restM) {
      const a = restM[1] === 'one' ? 1 : Number(restM[1]);
      const v = restM[2] ? (a + Number(restM[2])) / 2 : a;
      sec.restSec = Math.round(/min/i.test(restM[3]) ? v * 60 : v);
    }

    if (!ex) {
      sec.notes.push(t.replace(/^[-•]\s*/, ''));
      continue;
    }

    // Label with value: Reps: 12 / Time: 45 Seconds
    const lm = t.match(LABEL);
    if (lm) {
      const v = lm[2].trim();
      if (v && v.startsWith('(')) ex.targetNote = v.replace(/^\(|\)$/g, '');
      else if (v) ex.target.base = v;
      continue;
    }

    const wm = t.match(WEEK_LINE);
    if (wm) {
      for (const w of weeksOf(wm[1], wm[2])) ex.target.w[w] = wm[3].trim();
      continue;
    }

    if (ex.video) {
      // Text after the video belongs to the block (rest advice etc.)
      sec.notes.push(t.replace(/^\*+/, ''));
      continue;
    }

    if (openParen(ex.name) && !ex.cues.length && !ex.details.length) {
      ex.name = clean(ex.name + ' ' + t);
      continue;
    }

    if (isCue) {
      ex.cues.push(t.replace(/^[-•*]\s*/, ''));
      continue;
    }

    // Lines like "10 Seconds Work" or "Set Timer for 5 Minutes"
    if (/^(\d|Repeat|Set Timer)/i.test(t) && /(seconds?|minutes?|repeat|total|reps?|times?)\b/i.test(t) && t.length < 60) {
      ex.details.push(t);
      continue;
    }

    // Continuation of the previous cue line
    if (ex.cues.length) {
      if (/^[a-z(]/.test(t)) ex.cues[ex.cues.length - 1] += ' ' + t;
      else ex.cues.push(t);
    } else {
      ex.details.push(t);
    }
  }

  // Post-processing: names, titles, default rounds, goals
  for (const d of plan.days) {
    for (const s of d.sections) for (const e of s.exercises) splitName(e);
    d.sections = d.sections.filter((s) => s.exercises.length);
    for (const s of d.sections) {
      if (s.kind === 'unknown') s.kind = s.n === 1 ? 'warmup' : s.n === 2 ? 'plyo' : 'circuit';
      s.title = KIND_TITLE[s.kind];
      for (let w = 1; w <= 4; w++) {
        if (!s.rounds[w]) s.rounds[w] = s.rounds[w - 1] || (['finisher', 'breathing', 'warmup2'].includes(s.kind) ? 1 : 1);
      }
      if (!s.restSec) s.restSec = { circuit: 60, core: 45, plyo: 45, power: 120, strength: 90, complex: 90, speed: 90 }[s.kind] || 0;
      for (const e of s.exercises) {
        if (!e.target.base && !Object.keys(e.target.w).length && e.details.length) {
          e.target.base = e.details.join(', ');
          e.details = [];
        }
      }
    }
  }

  plan.weeklyGoals = plan.weeklyGoals.map((g) => {
    const text = clean(g.text);
    const def = GOAL_KEYS.find((k) => k.re.test(text));
    const nums = (text.match(/(\d+)(?:\s*-\s*(\d+))?/) || []);
    const target = nums[2] ? Number(nums[2]) : nums[1] ? Number(nums[1]) : null;
    return def && target
      ? { key: def.key, label: def.label, target, min: nums[2] ? Number(nums[1]) : target, text }
      : { key: null, label: null, target: null, text };
  });

  const exCount = plan.days.reduce((n, d) => n + d.sections.reduce((m, s) => m + s.exercises.length, 0), 0);
  const vidCount = plan.days.reduce((n, d) => n + d.sections.reduce((m, s) => m + s.exercises.filter((e) => e.video).length, 0), 0);
  plan.stats = { days: plan.days.length, exercises: exCount, videos: vidCount };
  return plan;
}

function splitName(e) {
  e.name = e.name.replace(/\sJ\)/, ')');
  const dash = e.name.match(/^(.+?\))\s*-\s*(.+)$/);
  if (dash) { e.name = dash[1]; e.nameNote = dash[2]; }
  const m = e.name.match(/^(.+?)\s*\(([^)]{22,})\)\s*$/);
  if (m) { e.name = m[1]; e.nameNote = m[2]; }
}

export function targetFor(ex, week) {
  return ex.target.w[week] || ex.target.base || ex.details.join(', ') || '';
}

export const SECTION_TITLES = KIND_TITLE;
