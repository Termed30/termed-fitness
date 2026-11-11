// Helpers: dates, formatting, target translation and timer parsing.

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const pad = (n) => String(n).padStart(2, '0');

export function isoDate(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseIso(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function daysBetween(a, b) {
  const A = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const B = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((B - A) / 86400000);
}

export function mondayOf(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const wd = (x.getDay() + 6) % 7;
  return addDays(x, -wd);
}

const WD = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const WD_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MON = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

export const fmtLongDate = (d) => `${WD[d.getDay()]}, ${d.getDate()}. ${MON[d.getMonth()]}`;
export const fmtShortDate = (d) => `${d.getDate()}.${d.getMonth() + 1}.`;
export const fmtDayShort = (d) => `${WD_SHORT[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.`;
export const weekdayName = (d) => WD[d.getDay()];

export const fmtNum = (n, digits = 0) =>
  n == null || Number.isNaN(n) ? '–' : Number(n).toLocaleString('de-AT', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function fmtClock(sec) {
  sec = Math.max(0, Math.round(sec));
  return `${Math.floor(sec / 60)}:${pad(sec % 60)}`;
}

export function fmtDuration(ms) {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} Min`;
  return `${Math.floor(min / 60)} h ${pad(min % 60)} Min`;
}

export const parseDecimal = (v) => {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

// ---- Targets ("50 Seconds Each Leg" -> "50 Sek. pro Bein")

const TR = [
  [/MAXIMUM NUMBER OF REPS/gi, 'Max. Wiederholungen'],
  [/(\d+)\s*Reps? Short of Failure/gi, '$1 Wdh. vor dem Muskelversagen'],
  [/(\d+)\s*Reps? Short of Max/gi, '$1 Wdh. unter deinem Maximum'],
  [/with Proper Technique!?/gi, 'mit sauberer Technik'],
  [/as fast as you can( with each leg)?\.?/gi, (m, a) => (a ? 'so schnell du kannst, pro Bein' : 'so schnell du kannst')],
  [/Repeat for a Total of (\d+) Reps/gi, '$1 Durchgänge'],
  [/Repeat a Total of (\d+) Reps/gi, '$1 Durchgänge'],
  [/Repeat (\d+) Times/gi, '$1 Durchgänge'],
  [/Set Timer for (\d+) Minutes?/gi, '$1 Min'],
  [/(\d+)\s*Seconds? Work/gi, '$1 Sek. Arbeit'],
  [/(\d+)\s*Seconds? Rest/gi, '$1 Sek. Pause'],
  [/(\d+)\s*Seconds? On/gi, '$1 Sek. Arbeit'],
  [/(\d+)\s*Seconds? Off/gi, '$1 Sek. Pause'],
  [/(\d+)\s*Seconds? to Get Rhythm/gi, '$1 Sek. Rhythmus finden'],
  [/(\d+)\s*Seconds? with Explosiveness/gi, '$1 Sek. explosiv'],
  [/(\d+)\s*Seconds? of Walking/gi, '$1 Sek. gehen'],
  [/(\d+)\s*Second HOLD at Each Position/gi, '$1 Sek. halten pro Position'],
  [/(\d+) reps per side, (\d+) second HOLD at the top\.?/gi, '$1 Wdh. pro Seite, oben $2 Sek. halten'],
  [/Minutes?/g, 'Min'],
  [/Seconds?/g, 'Sek.'],
  [/\bReps?\b/gi, 'Wdh.'],
  [/\bPushups?\b/g, 'Liegestütze'],
  [/\bTotal Flows\b/g, 'Flows'],
  [/Each Leg|each leg|Per Leg|per leg/g, 'pro Bein'],
  [/Each Side|each side|per side/g, 'pro Seite'],
  [/Each Foot/g, 'pro Fuß'],
  [/\bTotal\b/g, 'gesamt'],
  [/\bin (\d+) Sek\./g, 'in $1 Sek.'],
  [/explode as high as you can-land softly/gi, 'so hoch wie möglich, weich landen'],
  [/land, reset, jump as far as you can/gi, 'landen, neu ansetzen, so weit wie möglich'],
];

export function translateTarget(s) {
  if (!s) return '';
  let out = s;
  for (const [re, rep] of TR) out = out.replace(re, rep);
  return out.replace(/\s+/g, ' ').replace(/\s,/g, ',').trim();
}

export function isMaxTarget(s) {
  return /maximum|short of (max|failure)/i.test(s || '');
}

export function sidesOf(s) {
  return /each (leg|side|foot)|per (leg|side)|with each leg/i.test(s || '') ? 2 : 1;
}

// Seconds for timed targets. Returns null for rep based targets.
export function durationOf(s) {
  if (!s) return null;
  if (/reps|pushups|flows/i.test(s) && !/in \d+\s*seconds/i.test(s)) return null;
  let total = 0;
  let found = false;
  const re = /(\d+)\s*(minutes?|min|seconds?|sec)\b/gi;
  let m;
  while ((m = re.exec(s))) {
    found = true;
    total += /^m/i.test(m[2]) ? Number(m[1]) * 60 : Number(m[1]);
  }
  return found ? total : null;
}

// Work/rest interval protocols like "10 Seconds Work, 10 Seconds Rest, 12 Reps"
export function intervalOf(text) {
  if (!text) return null;
  const w = text.match(/(\d+)\s*Seconds?\s*(Work|On)/i);
  const r = text.match(/(\d+)\s*Seconds?\s*(Rest|Off)/i);
  const n = text.match(/Repeat(?: for)?(?: a)? Total of (\d+)|Repeat (\d+) Times/i);
  if (!w || !r) return null;
  return { work: Number(w[1]), rest: Number(r[1]), rounds: n ? Number(n[1] || n[2]) : 8 };
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function vimeoEmbed(v, autoplay = true) {
  if (!v) return null;
  if (v.provider === 'vimeo') {
    const h = v.hash ? `h=${v.hash}&` : '';
    return `https://player.vimeo.com/video/${v.id}?${h}playsinline=1&dnt=1&title=0&byline=0&portrait=0${autoplay ? '&autoplay=1' : ''}`;
  }
  if (v.provider === 'youtube') {
    return `https://www.youtube-nocookie.com/embed/${v.id}?playsinline=1&rel=0${v.start ? `&start=${v.start}` : ''}${autoplay ? '&autoplay=1' : ''}`;
  }
  return null;
}

export function sum(arr, f = (x) => x) {
  return arr.reduce((a, x) => a + (f(x) || 0), 0);
}

export function avg(arr) {
  const v = arr.filter((x) => x != null && !Number.isNaN(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
