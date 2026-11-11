// Shared UI pieces: toast, navigation, the center circle and small controls.
import { esc } from './util.js';
import { icon } from './icons.js';

export function go(route) {
  if (location.hash === route) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = route;
}

let toastTimer = null;
export function toast(text) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// The signature: a center circle with the halfway line through it.
// pct fills the circle like a progress arc.
export function centerCircle({ size = 168, pct = 0, value = '', label = '', id = '' } = {}) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, pct));
  return `
  <div class="cc" style="--cc-size:${size}px" ${id ? `id="${id}"` : ''}>
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <line class="cc-line" x1="-40" y1="60" x2="14" y2="60" />
      <line class="cc-line" x1="106" y1="60" x2="160" y2="60" />
      <circle class="cc-track" cx="60" cy="60" r="${r}" />
      <circle class="cc-arc" cx="60" cy="60" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}" transform="rotate(-90 60 60)" />
      ${value === '' ? '<circle class="cc-spot" cx="60" cy="60" r="1.6" />' : ''}
    </svg>
    <div class="cc-text">
      <span class="cc-value">${esc(value)}</span>
      ${label ? `<span class="cc-label">${esc(label)}</span>` : ''}
    </div>
  </div>`;
}

export function setCircle(el, pct) {
  const arc = el?.querySelector('.cc-arc');
  if (!arc) return;
  const c = 2 * Math.PI * 46;
  arc.setAttribute('stroke-dashoffset', String(c * (1 - Math.max(0, Math.min(1, pct)))));
}

export function stepper({ name, value, step = 1, min = 0, max = 999, unit = '', digits = 0 }) {
  const v = value == null ? '' : Number(value).toFixed(digits).replace('.', ',');
  return `
  <div class="stepper" data-stepper="${name}" data-step="${step}" data-min="${min}" data-max="${max}" data-digits="${digits}">
    <button type="button" class="btn-icon" data-step-dir="-1" aria-label="Weniger">${icon('minus')}</button>
    <output class="num">${v === '' ? '–' : v}${unit ? `<small> ${esc(unit)}</small>` : ''}</output>
    <button type="button" class="btn-icon" data-step-dir="1" aria-label="Mehr">${icon('plus')}</button>
  </div>`;
}

export function chips(name, options, selected) {
  return `<div class="chips" role="radiogroup" data-chips="${name}">${options
    .map(
      (o) =>
        `<button type="button" role="radio" class="chip${String(o.value) === String(selected) ? ' on' : ''}" aria-checked="${String(o.value) === String(selected)}" data-value="${esc(o.value)}">${esc(o.label)}</button>`,
    )
    .join('')}</div>`;
}

// Wake lock keeps the screen on during a workout.
let wakeLock = null;
export async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch (e) { /* not supported */ }
}

let audio = null;
export function beep(times = 1, freq = 880) {
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    for (let i = 0; i < times; i++) {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.frequency.value = freq;
      o.connect(g);
      g.connect(audio.destination);
      const t = audio.currentTime + i * 0.28;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.start(t);
      o.stop(t + 0.22);
    }
  } catch (e) { /* no audio */ }
  try { navigator.vibrate?.(times > 1 ? [120, 80, 120] : 120); } catch (e) { /* no vibration */ }
}

export function unlockAudio() {
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
  } catch (e) { /* ignore */ }
}
