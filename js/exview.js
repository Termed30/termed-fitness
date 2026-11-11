// Shared exercise presentation: animated figure, German steps, video tab,
// and the numbers behind logging (target value, unit, last time).
import { lookup, sequence, needsWeight } from './exercises.js';
import { stage, animate } from './figure.js';
import { S } from './state.js';
import { esc, durationOf, intervalOf, isMaxTarget, vimeoEmbed, sidesOf } from './util.js';
import { icon } from './icons.js';

// What gets logged for an exercise: reps, seconds or rounds.
export function measureOf(ex, target) {
  const all = [target, ...(ex.details || []), ex.target?.base || ''].join(', ');
  const iv = intervalOf(all);
  if (iv) return { unit: 'Durchgänge', value: iv.rounds, step: 1 };
  if (isMaxTarget(target)) {
    const secs = /in (\d+) seconds/i.exec(target);
    return { unit: 'Wdh.', value: null, step: 1, max: true, window: secs ? Number(secs[1]) : null };
  }
  const dist = target.match(/(\d+)(?:\s*-\s*(\d+))?\s*(yards?|meters?|metres?|m)\b/i);
  if (dist) return { unit: /yard/i.test(dist[3]) ? 'Yards' : 'm', value: Number(dist[2] || dist[1]), step: 5 };
  const secs = durationOf(target);
  if (secs) return { unit: 'Sek.', value: secs, step: 5, perSide: sidesOf(target) === 2 };
  const range = target.match(/(\d+)\s*-\s*(\d+)/);
  const n = range ? Number(range[2]) : Number((target.match(/\d+/) || [])[0]);
  if (n) return { unit: 'Wdh.', value: n, step: 1, perSide: sidesOf(target) === 2 };
  return { unit: null, value: null, step: 1 };
}

// Matched by name, so it still works when a new phase numbers the exercises differently
export function lastLog(ex, excludeSessionId) {
  for (let i = S.sessions.length - 1; i >= 0; i--) {
    const s = S.sessions[i];
    if (s.id === excludeSessionId) continue;
    const vals = Object.values(s.entries || {}).filter((e) => e.name === ex.name);
    if (vals.length) {
      const last = vals[vals.length - 1];
      const kg = vals.map((v) => v.kg).filter((v) => v != null);
      const done = vals.map((v) => v.done).filter((v) => v != null);
      return {
        ...last,
        done: done.length ? (last.max ? Math.max(...done) : done[done.length - 1]) : null,
        kg: kg.length ? Math.max(...kg) : null,
        date: s.finishedAt,
        week: s.week,
      };
    }
  }
  return null;
}

export const isWeighted = (ex) => needsWeight(ex.name);

export function figurePanel(ex, { id = 'fx', compact = false } = {}) {
  const entry = lookup(ex.name);
  const seq = sequence(entry);
  const steps = entry?.steps;
  const video = ex.video ? vimeoEmbed(ex.video) : null;
  if (!seq && !video) return '';
  return `
  <section class="exv${compact ? ' compact' : ''}" data-exv="${id}">
    <div class="exv-tabs" role="tablist">
      ${seq ? `<button role="tab" class="exv-tab on" data-tab="move" aria-selected="true">${icon('activity', 16)} Ablauf</button>` : ''}
      ${video ? `<button role="tab" class="exv-tab${seq ? '' : ' on'}" data-tab="video" aria-selected="${!seq}">${icon('play', 16)} Video</button>` : ''}
      ${entry?.view === 'front' ? '<span class="exv-view">Ansicht von vorne</span>' : ''}
    </div>
    ${seq ? `<div class="exv-pane" data-pane="move"><div class="exv-stage" id="${id}">${stage()}</div>
      ${seq.length > 1 ? `<div class="exv-dots" aria-hidden="true">${seq.map((_, i) => `<i data-dot="${i}"></i>`).join('')}</div>` : ''}</div>` : ''}
    ${video ? `<div class="exv-pane" data-pane="video" ${seq ? 'hidden' : ''}>
      <div class="video" data-video="${esc(video)}"><button type="button" class="video-play" data-act="video"><span class="video-icon">${icon('play', 22)}</span><span>Video laden</span></button></div>
      <a class="video-out" href="${esc(ex.video.url)}" target="_blank" rel="noopener">${icon('external-link', 14)} In ${ex.video.provider === 'youtube' ? 'YouTube' : 'Vimeo'} öffnen</a>
    </div>` : ''}
    ${steps ? `<ol class="exv-steps">${steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`
      : ex.cues?.length ? `<details class="p-cues"><summary>Technik vom Coach</summary><ul lang="en">${ex.cues.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></details>` : ''}
  </section>`;
}

// Starts the animation and wires the tabs of every panel inside root.
export function mountPanels(root) {
  root.querySelectorAll('.exv').forEach((panel) => {
    const stageEl = panel.querySelector('.exv-stage');
    const name = panel.closest('[data-exname]')?.dataset.exname || panel.dataset.name;
    if (stageEl && name) {
      const seq = sequence(lookup(name));
      const svg = stageEl.querySelector('svg');
      const dots = panel.querySelectorAll('[data-dot]');
      if (seq) animate(svg, seq, { onFrame: (i) => dots.forEach((d) => d.classList.toggle('on', Number(d.dataset.dot) === i)) });
    }
    panel.querySelectorAll('.exv-tab').forEach((tab) => {
      tab.onclick = () => {
        panel.querySelectorAll('.exv-tab').forEach((t) => { t.classList.toggle('on', t === tab); t.setAttribute('aria-selected', String(t === tab)); });
        panel.querySelectorAll('.exv-pane').forEach((p) => { p.hidden = p.dataset.pane !== tab.dataset.tab; });
      };
    });
    const play = panel.querySelector('[data-act="video"]');
    if (play) play.onclick = (ev) => {
      ev.stopPropagation();
      const box = play.closest('.video');
      box.innerHTML = `<iframe src="${esc(box.dataset.video)}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen title="Übungsvideo"></iframe>`;
    };
  });
}
