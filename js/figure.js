// Exercise figure: a jointed figure drawn like chalk on the pitch.
// Poses use absolute angles in degrees, so motion between them stays natural.
//   Limbs: 0 = pointing down, 90 = forward (to the right), 180 = up, -90 = backward.
//   Torso: 0 = upright, 90 = leaning fully forward, -90 = lying back (head to the left).

const L = { torso: 34, neck: 5, head: 7.5, thigh: 25, shin: 25, upper: 17, fore: 16, foot: 8 };
const GROUND = 112;
const rad = (d) => (d * Math.PI) / 180;
const dir = (a, len) => [Math.sin(rad(a)) * len, Math.cos(rad(a)) * len];

export const DEFAULT = {
  x: 100, t: 0, h: 0, lift: 0,
  l1: [0, 0], l2: [0, 0], a1: [8, 12], a2: [-8, -4], f1: 90, f2: 90,
  anchor: null, props: [],
};

function solve(p) {
  const pose = { ...DEFAULT, ...p };
  const hip = [pose.x, 60];
  const sh = [hip[0] + Math.sin(rad(pose.t)) * L.torso, hip[1] - Math.cos(rad(pose.t)) * L.torso];
  const hd = [sh[0] + Math.sin(rad(pose.t + pose.h)) * (L.neck + L.head), sh[1] - Math.cos(rad(pose.t + pose.h)) * (L.neck + L.head)];
  const limb = (from, [a, b], l1, l2) => {
    const d1 = dir(a, l1);
    const mid = [from[0] + d1[0], from[1] + d1[1]];
    const d2 = dir(b, l2);
    return [mid, [mid[0] + d2[0], mid[1] + d2[1]]];
  };
  const [k1, an1] = limb(hip, pose.l1, L.thigh, L.shin);
  const [k2, an2] = limb(hip, pose.l2, L.thigh, L.shin);
  const [e1, w1] = limb(sh, pose.a1, L.upper, L.fore);
  const [e2, w2] = limb(sh, pose.a2, L.upper, L.fore);
  const ft = (ankle, a) => { const d = dir(a, L.foot); return [ankle[0] + d[0], ankle[1] + d[1]]; };
  const t1 = ft(an1, pose.f1);
  const t2 = ft(an2, pose.f2);
  const pts = { hip, sh, hd, k1, an1, t1, k2, an2, t2, e1, w1, e2, w2 };

  // Place the figure: on the ground by default, or hanging from the hands.
  let dy;
  if (pose.anchor === 'hands') {
    dy = (pose.anchorY ?? 24) - Math.min(w1[1], w2[1]);
  } else {
    const contact = [an1, an2, t1, t2, k1, k2, w1, w2, e1, e2, hip, sh, [hd[0], hd[1] + L.head]];
    dy = GROUND - Math.max(...contact.map((q) => q[1])) - pose.lift - (pose.base || 0);
  }
  for (const k of Object.keys(pts)) pts[k] = [pts[k][0], pts[k][1] + dy];
  return { pts, pose };
}

const f = (n) => n.toFixed(1);
const line = (a, b, cls) => `<line class="${cls}" x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}"/>`;
const path = (ps, cls) => `<polyline class="${cls}" points="${ps.map((q) => `${f(q[0])},${f(q[1])}`).join(' ')}"/>`;

function drawProps({ pts, pose }) {
  const out = [];
  for (const pr of pose.props || []) {
    const type = typeof pr === 'string' ? pr : pr.type;
    if (type === 'bench') {
      // Block under a joint, from that joint down to the ground
      const at = pts[pr.at] || pts.an2;
      const top = at[1] + (pr.gap ?? 3);
      const w = pr.w || 26;
      out.push(`<rect class="fx-prop" x="${f(at[0] - w / 2)}" y="${f(top)}" width="${w}" height="${f(Math.max(4, GROUND - top))}" rx="2"/>`);
    } else if (type === 'box') {
      out.push(`<rect class="fx-prop" x="${pr.x}" y="${GROUND - pr.h}" width="${pr.w || 30}" height="${pr.h}" rx="2"/>`);
    } else if (type === 'bar') {
      const y = Math.min(pts.w1[1], pts.w2[1]) - 1.5;
      const w = pr.short ? 10 : 22;
      out.push(`<line class="fx-prop-line" x1="${f(pts.w1[0] - w)}" y1="${f(y)}" x2="${f(pts.w1[0] + w)}" y2="${f(y)}"/>`);
      if (pr.short) out.push(`<line class="fx-prop-line" x1="${f(pts.w1[0] - 8)}" y1="${f(y)}" x2="${f(pts.w1[0] - 8)}" y2="${GROUND}"/>`);
    } else if (type === 'db') {
      for (const w of pr.hands === 1 ? [pts.w1] : [pts.w1, pts.w2]) {
        out.push(`<rect class="fx-weight" x="${f(w[0] - 5)}" y="${f(w[1] - 2.5)}" width="10" height="5" rx="1.5"/>`);
      }
    } else if (type === 'plate') {
      const m = [(pts.hip[0] + pts.sh[0]) / 2, (pts.hip[1] + pts.sh[1]) / 2];
      out.push(`<rect class="fx-weight" x="${f(m[0] - 8)}" y="${f(m[1] - 7)}" width="16" height="4" rx="1.5"/>`);
    } else if (type === 'line') {
      out.push(`<line class="fx-prop-line" x1="${pr.x}" y1="${GROUND - 1}" x2="${pr.x}" y2="${GROUND + 5}"/>`);
      out.push(`<line class="fx-mark" x1="${pr.x - 14}" y1="${GROUND + 2}" x2="${pr.x + 14}" y2="${GROUND + 2}"/>`);
    } else if (type === 'rope') {
      const lowY = GROUND + (pr.low ?? 2);
      out.push(`<path class="fx-rope" d="M${f(pts.w1[0])},${f(pts.w1[1])} Q${f(pts.hip[0] + (pr.dx || 0))},${f(lowY + (pr.sag || 18))} ${f(pts.w2[0])},${f(pts.w2[1])}"/>`);
    } else if (type === 'ropes') {
      const end = 190;
      out.push(`<path class="fx-rope" d="M${f(pts.w1[0])},${f(pts.w1[1])} Q${f((pts.w1[0] + end) / 2)},${f(pts.w1[1] + (pr.wave || 10))} ${end},${GROUND - 2}"/>`);
    } else if (type === 'ball') {
      out.push(`<circle class="fx-ball" cx="${f(pts.hip[0] + (pr.dx || 30))}" cy="${GROUND - 5}" r="5"/>`);
    } else if (type === 'band') {
      out.push(`<path class="fx-rope" d="M${f(pts.k1[0])},${f(pts.k1[1])} L${f(pts.k2[0])},${f(pts.k2[1])}"/>`);
    }
  }
  return out.join('');
}

export function figureSvg(p) {
  return figureSvgPlain(p);
}

function figureSvgPlain(p) {
  const s = solve(p);
  const { pts } = s;
  const far = [
    path([pts.hip, pts.k2, pts.an2, pts.t2], 'fx-far'),
    path([pts.sh, pts.e2, pts.w2], 'fx-far'),
  ];
  const near = [
    line(pts.hip, pts.sh, 'fx-torso'),
    path([pts.hip, pts.k1, pts.an1, pts.t1], 'fx-limb'),
    path([pts.sh, pts.e1, pts.w1], 'fx-limb'),
    `<circle class="fx-head" cx="${f(pts.hd[0])}" cy="${f(pts.hd[1])}" r="${L.head}"/>`,
  ];
  return drawProps(s) + far.join('') + near.join('');
}

// Illustrated player for celebrations: jersey with number 7, shorts, socks, boots
const lerp = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
const seg = (a, b, w, color, cap = 'round') => `<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" stroke="${color}" stroke-width="${w}" stroke-linecap="${cap}"/>`;

function playerLimbs(pts, side) {
  const hip = pts.hip; const sh = pts.sh;
  const k = pts[`k${side}`]; const an = pts[`an${side}`]; const t = pts[`t${side}`];
  const e = pts[`e${side}`]; const w = pts[`w${side}`];
  const leg = [
    seg(hip, k, 7.5, 'var(--pl-skin)'),
    seg(lerp(k, an, 0.35), an, 7, 'var(--pl-sock)'),
    seg(an, t, 5.5, 'var(--pl-boot)'),
    seg(hip, lerp(hip, k, 0.5), 12, 'var(--pl-shorts)'),
  ].join('');
  const arm = [
    seg(sh, e, 6, 'var(--pl-skin)'),
    seg(e, w, 5.5, 'var(--pl-skin)'),
    seg(sh, lerp(sh, e, 0.45), 8.5, 'var(--pl-shirt)'),
  ].join('');
  return { leg, arm };
}

export function playerSvg(p) {
  const s = solve(p);
  const { pts, pose } = s;
  const far = playerLimbs(pts, 2);
  const near = playerLimbs(pts, 1);
  const mid = lerp(pts.hip, pts.sh, 0.5);
  const neck = lerp(pts.sh, pts.hd, 0.45);
  const shadowX = (pts.an1[0] + pts.an2[0]) / 2;
  const lift = Math.max(0, GROUND - Math.max(pts.an1[1], pts.an2[1], pts.t1[1], pts.t2[1]));
  // Hair sits on the side of the head that points away from the torso
  const dir = [pts.hd[0] - pts.sh[0], pts.hd[1] - pts.sh[1]];
  const len = Math.hypot(dir[0], dir[1]) || 1;
  const hair = [pts.hd[0] + (dir[0] / len) * 2, pts.hd[1] + (dir[1] / len) * 2];
  return `
    <ellipse cx="${f(shadowX)}" cy="${GROUND + 1}" rx="${f(Math.max(8, 18 - lift * 0.4))}" ry="2.2" class="pl-shadow"/>
    ${drawProps(s)}
    <g class="pl-far">${far.leg}${far.arm}</g>
    ${seg(pts.hip, pts.sh, 16, 'var(--pl-shirt)')}
    ${seg(pts.hip, lerp(pts.hip, pts.sh, 0.12), 15, 'var(--pl-shorts)', 'butt')}
    <text x="${f(mid[0])}" y="${f(mid[1])}" class="pl-num" transform="rotate(${f(pose.t)} ${f(mid[0])} ${f(mid[1])})">7</text>
    ${near.leg}
    ${seg(pts.sh, neck, 5, 'var(--pl-skin)')}
    <circle cx="${f(hair[0])}" cy="${f(hair[1])}" r="${L.head + 0.6}" fill="var(--pl-hair)"/>
    <circle cx="${f(pts.hd[0])}" cy="${f(pts.hd[1])}" r="${L.head - 0.4}" fill="var(--pl-skin)"/>
    ${near.arm}`;
}

// ---- Animation between poses

const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);

function mix(a, b, k) {
  const A = { ...DEFAULT, ...a };
  const B = { ...DEFAULT, ...b };
  const out = { props: k < 0.5 ? A.props : B.props, anchor: A.anchor || B.anchor };
  if (A.anchorY != null || B.anchorY != null) out.anchorY = (A.anchorY ?? 24) + ((B.anchorY ?? 24) - (A.anchorY ?? 24)) * k;
  for (const key of ['x', 't', 'h', 'lift', 'f1', 'f2', 'base']) out[key] = (A[key] || 0) + ((B[key] || 0) - (A[key] || 0)) * k;
  for (const key of ['l1', 'l2', 'a1', 'a2']) out[key] = [A[key][0] + (B[key][0] - A[key][0]) * k, A[key][1] + (B[key][1] - A[key][1]) * k];
  return out;
}

const running = new WeakMap();

// seq: [{pose, hold}] ; plays forward through the list and loops
export function animate(svg, seq, { move = 650, onFrame, player = false } = {}) {
  stop(svg);
  const g = svg.querySelector('.fx-fig');
  const figureSvg = player ? playerSvg : figureSvgPlain;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduce || seq.length < 2) {
    g.innerHTML = figureSvg(seq[0].pose);
    return;
  }
  g.innerHTML = figureSvg(seq[0].pose); // first frame right away, even before the first animation frame
  const spans = [];
  let total = 0;
  seq.forEach((s, i) => {
    const hold = s.hold ?? 450;
    spans.push({ from: i, start: total, hold, move: s.move ?? move });
    total += hold + (s.move ?? move);
  });
  let start = null;
  let lastPhase = -1;
  const tick = (now) => {
    if (!svg.isConnected) { stop(svg); return; }
    start ??= now;
    const tt = (now - start) % total;
    const sp = spans.find((x) => tt >= x.start && tt < x.start + x.hold + x.move) || spans[0];
    const into = tt - sp.start;
    const next = (sp.from + 1) % seq.length;
    const k = into <= sp.hold ? 0 : ease((into - sp.hold) / sp.move);
    g.innerHTML = figureSvg(k === 0 ? seq[sp.from].pose : mix(seq[sp.from].pose, seq[next].pose, k));
    const phase = k < 0.5 ? sp.from : next;
    if (phase !== lastPhase) { lastPhase = phase; onFrame?.(phase); }
    running.set(svg, requestAnimationFrame(tick));
  };
  running.set(svg, requestAnimationFrame(tick));
}

export function stop(svg) {
  const id = running.get(svg);
  if (id) cancelAnimationFrame(id);
  running.delete(svg);
}

export function stage(extra = '') {
  return `<svg class="fx" viewBox="16 -18 168 140" role="img" aria-label="Bewegungsablauf">
    <line class="fx-ground" x1="0" y1="${GROUND}" x2="200" y2="${GROUND}"/>
    <g class="fx-fig"></g>${extra}
  </svg>`;
}
