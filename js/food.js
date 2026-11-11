// Nutrition: daily meals from the plan, shakes to close the calorie gap,
// water and creatine guidance, shopping list.
import { S, today, saveDaily, saveNutrition, doneSessions } from './state.js';
import { esc, fmtNum, isoDate, sum } from './util.js';
import { icon } from './icons.js';
import { chips } from './ui.js';

// Values per portion, calculated from standard nutrition tables.
export const SHAKES = {
  big: {
    name: 'Aufbau-Shake',
    items: ['300 ml Milch, 3,5 % Fett', '1 Messlöffel Whey, 30 g', '40 g Haferflocken', '1 Banane', '1 EL Erdnussbutter, 15 g'],
    kcal: 657, p: 44, c: 71, f: 24,
    how: 'Alles in den Mixer, 30 Sekunden mixen. Die Haferflocken machen ihn sämig und bringen langsame Kohlenhydrate.',
  },
  energy: {
    name: 'Energie-Shake',
    items: ['300 ml Milch, 3,5 % Fett', '60 g Haferflocken', '1 Banane', '1 EL Honig'],
    kcal: 586, p: 19, c: 94, f: 15,
    how: 'Haferflocken kurz in der Milch quellen lassen, dann mit Banane und Honig mixen. Für Tage, an denen das Eiweiß schon passt.',
  },
  small: {
    name: 'Protein-Shake',
    items: ['300 ml Milch, 3,5 % Fett', '1 Messlöffel Whey, 30 g'],
    kcal: 312, p: 34, c: 17, f: 13,
    how: 'Im Shaker 20 Sekunden schütteln. Ideal direkt nach dem Training.',
  },
};

const RECIPES = [
  { re: /scrambled eggs|omelet/i, t: 'Eier mit einer Prise Salz verquirlen. Bei mittlerer Hitze mit wenig Butter langsam stocken lassen, vom Herd nehmen, solange sie noch leicht feucht sind.' },
  { re: /hard-boiled eggs|boil/i, t: 'Eier 9 Minuten kochen, kalt abschrecken. Gleich mehrere auf Vorrat für die Woche machen.' },
  { re: /chicken/i, t: 'Hähnchen mit Salz, Pfeffer, Knoblauchpulver und Paprika würzen. Bei 200 °C 20 bis 25 Minuten backen oder 6 Minuten pro Seite anbraten.' },
  { re: /turkey breast/i, t: 'Putenbrust wie Hähnchen würzen und 5 bis 6 Minuten pro Seite braten, bis sie innen nicht mehr rosa ist.' },
  { re: /steak|sirloin/i, t: 'Steak trocken tupfen, salzen. In sehr heißer Pfanne 3 bis 4 Minuten pro Seite braten, dann 5 Minuten ruhen lassen.' },
  { re: /salmon/i, t: 'Lachs mit Salz, Pfeffer und Zitrone würzen. Bei 190 °C 15 Minuten backen oder 3 Minuten pro Seite braten.' },
  { re: /ground beef|ground turkey|beef stir-fry|turkey stir-fry/i, t: 'Fleisch mit Zwiebel, Knoblauch und italienischen Kräutern bei mittlerer Hitze 8 bis 10 Minuten anbraten.' },
  { re: /shrimp/i, t: 'Garnelen in Olivenöl mit Knoblauch 2 bis 3 Minuten pro Seite braten, bis sie rosa sind.' },
  { re: /stir-fry/i, t: 'Gemüse in die heiße Pfanne, 3 bis 4 Minuten mitbraten, mit einem Schuss Sojasauce ablöschen und auf den Reis geben.' },
  { re: /burger/i, t: 'Pute zu einem Patty formen, salzen, 4 bis 5 Minuten pro Seite braten. Mit Salat ins Vollkornbrötchen.' },
  { re: /tuna/i, t: 'Thunfisch abtropfen lassen und mit dem Joghurt-Dressing mischen.' },
  { re: /wrap/i, t: 'Wrap kurz in der trockenen Pfanne erwärmen, füllen, fest einrollen.' },
  { re: /quinoa/i, t: 'Quinoa abspülen, mit doppelter Menge Wasser 15 Minuten köcheln, 5 Minuten quellen lassen.' },
  { re: /brown rice|rice/i, t: 'Reis mit doppelter Menge Wasser aufkochen und zugedeckt 20 Minuten leise köcheln lassen. Gleich für 3 bis 4 Tage kochen.' },
  { re: /mashed (sweet )?potato/i, t: 'Kartoffeln schälen, 15 Minuten kochen und mit einem Schuss Milch stampfen.' },
  { re: /sweet potato|roasted potatoes/i, t: 'In Würfel schneiden, mit Olivenöl und Salz mischen, bei 200 °C 20 bis 25 Minuten rösten.' },
  { re: /pasta/i, t: 'Vollkornnudeln nach Packung kochen, nach dem Abgießen etwas Olivenöl dazu, damit nichts klebt.' },
  { re: /overnight oats/i, t: 'Haferflocken, Milch und Proteinpulver am Abend verrühren, über Nacht in den Kühlschrank, morgens Banane drauf.' },
  { re: /oatmeal|oats/i, t: 'Haferflocken mit Mandelmilch 3 bis 4 Minuten köcheln, vom Herd nehmen, Protein einrühren, Banane und Erdnussbutter drauf.' },
  { re: /protein pancakes/i, t: '1 Banane, 2 Eier, 40 g Haferflocken und 1 Messlöffel Protein mixen. Kleine Pancakes 2 Minuten pro Seite backen.' },
  { re: /pancakes/i, t: 'Teig aus Vollkornmehl, Ei und Milch, kleine Pancakes 2 Minuten pro Seite backen.' },
  { re: /greek yogurt|cottage cheese/i, t: 'In eine Schüssel geben, Obst und Honig darüber, die Nüsse zuletzt, damit sie knackig bleiben.' },
  { re: /smoothie/i, t: 'Alles mit 300 ml Milch 30 Sekunden mixen.' },
  { re: /broccoli|carrots|zucchini|bell pepper|asparagus|roasted veg/i, t: 'Gemüse klein schneiden, mit Olivenöl bei 200 °C 15 Minuten rösten.' },
  { re: /spinach|green beans/i, t: 'Kurz 2 bis 3 Minuten dünsten, salzen.' },
  { re: /salad/i, t: 'Salat mit Olivenöl und Balsamico anmachen.' },
  { re: /protein bar/i, t: 'Nichts zu kochen. Achte auf wenig zugesetzten Zucker.' },
];

export function recipeFor(name) {
  const steps = [];
  const used = new Set();
  for (const r of RECIPES) {
    if (r.re.test(name) && !used.has(r.t)) {
      steps.push(r.t);
      used.add(r.t);
    }
    if (steps.length >= 4) break;
  }
  return steps;
}

export function planDayIndex(date = new Date()) {
  const n = S.nutrition?.days?.length || 0;
  if (!n) return 0;
  const wd = (date.getDay() + 6) % 7; // Monday = 0
  return wd % n;
}

// Pick shakes so the day lands close to the calorie target without going far over.
export function shakePlan(meals, target) {
  const base = { kcal: sum(meals, (m) => m.kcal), p: sum(meals, (m) => m.p), c: sum(meals, (m) => m.c), f: sum(meals, (m) => m.f) };
  const options = [[], ['small'], ['big'], ['energy'], ['big', 'small'], ['energy', 'small']];
  const pTarget = S.nutrition?.protein || 150;
  let best = options[0];
  let bestScore = Infinity;
  for (const o of options) {
    const kcal = base.kcal + sum(o, (k) => SHAKES[k].kcal);
    const p = base.p + sum(o, (k) => SHAKES[k].p);
    // Close to the calorie target, not far over it, and protein not far above the plan
    const score = Math.abs(target - kcal) + (kcal > target + 150 ? 400 : 0) + Math.max(0, p - pTarget * 1.4) * 3 + Math.max(0, pTarget - p) * 3;
    if (score < bestScore) { bestScore = score; best = o; }
  }
  const tot = { ...base };
  for (const k of best) for (const x of ['kcal', 'p', 'c', 'f']) tot[x] += SHAKES[k][x];
  return { shakes: best, base, total: tot };
}

export function isTrainingDay(date = isoDate()) {
  return doneSessions().some((s) => s.date === date) || !!S.active;
}

function bar(label, value, min, max, unit) {
  const hi = max || min;
  const pct = Math.min(100, (value / hi) * 100);
  const ok = value >= min * 0.95 && value <= hi * 1.08;
  return `
  <div class="macro">
    <div class="macro-head"><span>${label}</span><span class="num">${fmtNum(value)} <span class="muted">/ ${max && max !== min ? `${fmtNum(min)}–${fmtNum(max)}` : fmtNum(min)} ${unit}</span></span></div>
    <div class="track"><i class="${ok ? 'ok' : ''}" style="width:${pct}%"></i></div>
  </div>`;
}

const SLOT = { Breakfast: 'Frühstück', Lunch: 'Mittagessen', Snack: 'Snack', Dinner: 'Abendessen' };
const TIME = (t) => (t ? t.replace(/(\d+)\s*AM/i, '$1:00').replace(/(\d+)\s*PM/i, (m, h) => `${Number(h) + 12}:00`) : '');

export function renderFood(root, state = {}) {
  const n = S.nutrition;
  if (!n) {
    root.innerHTML = `
    <section class="page">
      <header class="page-head"><h1>Essen</h1></header>
      <div class="empty">
        <p>Lade deinen Ernährungsplan als PDF hoch. Daraus baue ich dir jeden Tag den Essensplan, die Shakes, Wasser und Kreatin.</p>
        <a class="btn primary" href="#/mehr">${icon('upload')} Ernährungsplan hochladen</a>
      </div>
    </section>`;
    return;
  }
  const d = today();
  const idx = state.day ?? planDayIndex();
  const day = n.days[idx];
  const meals = day?.meals || [];
  const target = n.kcal || 3000;
  const plan = shakePlan(meals, target);
  const eaten = d.meals || {};
  // Everything ticked today counts, whichever plan day it came from
  const eatenKcal = Object.entries(eaten).reduce((sumK, [key, on]) => {
    if (!on) return sumK;
    if (key.startsWith('shake:')) return sumK + (SHAKES[key.slice(6)]?.kcal || 0);
    const [di, mi] = key.split(':').map(Number);
    return sumK + (n.days[di]?.meals[mi]?.kcal || 0);
  }, 0);
  const waterGoal = Math.round(((n.waterL ? (n.waterL[0] + n.waterL[1]) / 2 : 3.5) + (isTrainingDay() ? 0.5 : 0)) * 1000);
  const creatine = n.creatineG || 5;
  const dayOpts = n.days.map((x, i) => ({ value: i, label: `Tag ${x.n}` }));

  root.innerHTML = `
  <section class="page">
    <header class="page-head">
      <h1>Essen</h1>
      <p class="muted">Ziel ${fmtNum(target)} kcal · ${n.protein} g Eiweiß</p>
    </header>

    <div class="card">
      <div class="card-head">
        <h2>Heute gegessen</h2>
        <span class="num big">${fmtNum(eatenKcal)}<small class="muted"> / ${fmtNum(target)} kcal</small></span>
      </div>
      <div class="track"><i style="width:${Math.min(100, (eatenKcal / target) * 100)}%"></i></div>
      <p class="muted small">Hak ab, was du gegessen hast. E, KH und F in Gramm</p>
    </div>

    <div class="section-head">
      <h2>Essensplan</h2>
      <span class="muted small">Montag = Tag 1</span>
    </div>
    <div class="scroll-x">${chips('foodday', dayOpts, idx)}</div>

    <div class="card">
      ${bar('Kalorien', plan.total.kcal, target, null, 'kcal')}
      ${bar('Eiweiß', plan.total.p, n.protein, null, 'g')}
      ${n.carbs ? bar('Kohlenhydrate', plan.total.c, n.carbs[0], n.carbs[1], 'g') : ''}
      ${n.fat ? bar('Fett', plan.total.f, n.fat[0], n.fat[1], 'g') : ''}
      <p class="muted small">Plan-Tag ${day?.n} hat ${fmtNum(plan.base.kcal)} kcal. ${plan.shakes.length ? `Mit ${plan.shakes.map((k) => SHAKES[k].name).join(' und ')} kommst du auf ${fmtNum(plan.total.kcal)} kcal.` : ''}</p>
    </div>

    <ul class="meals">
      ${meals.map((m, i) => mealRow(m, `${idx}:${i}`, eaten)).join('')}
      ${plan.shakes.map((k) => shakeRow(k, eaten, creatine)).join('')}
    </ul>

    <div class="section-head"><h2>Wasser</h2><span class="num">${fmtNum(d.waterMl / 1000, 1)} / ${fmtNum(waterGoal / 1000, 1)} L</span></div>
    <div class="card">
      <div class="track"><i style="width:${Math.min(100, (d.waterMl / waterGoal) * 100)}%"></i></div>
      <div class="row wrap">
        <button class="btn secondary" data-act="water" data-ml="250">${icon('droplet')} +250 ml</button>
        <button class="btn secondary" data-act="water" data-ml="500">${icon('droplet')} +500 ml</button>
        <button class="btn-icon ghost" data-act="water" data-ml="-250" aria-label="250 ml abziehen">${icon('minus')}</button>
      </div>
      <ol class="plain small">
        <li><span>Nach dem Aufstehen</span><span class="num">500 ml</span></li>
        <li><span>Zu jeder Mahlzeit</span><span class="num">je 250 ml</span></li>
        <li><span>Vormittag und Nachmittag</span><span class="num">je 500 ml</span></li>
        <li><span>Während dem Training</span><span class="num">500–750 ml</span></li>
        <li><span>Abend</span><span class="num">250 ml</span></li>
      </ol>
      <p class="muted small">${isTrainingDay() ? 'Trainingstag: 0,5 L mehr eingerechnet. ' : ''}Nach harten Einheiten oder bei Hitze ein Elektrolytgetränk.</p>
    </div>

    <div class="section-head"><h2>Kreatin</h2><span class="num">${creatine} g täglich</span></div>
    <div class="card">
      <label class="check">
        <input type="checkbox" data-act="creatine" ${d.creatine ? 'checked' : ''}>
        <span>Heute ${creatine} g Kreatin genommen</span>
      </label>
      <ul class="why">
        <li><strong>Warum ${creatine} g:</strong> Das steht in deinem Plan und entspricht bei ${S.settings.weightKg || n.weightKg || 70} kg etwa 0,07 g pro Kilo. Mehr bringt keinen zusätzlichen Muskelaufbau, die Speicher sind damit nach 3 bis 4 Wochen voll.</li>
        <li><strong>Jeden Tag:</strong> auch an trainingsfreien Tagen. Es wirkt über volle Speicher, nicht über den Zeitpunkt.</li>
        <li><strong>Wann:</strong> am einfachsten nach dem Training in den Shake, sonst zu einer Mahlzeit. Eine Ladephase brauchst du nicht.</li>
        <li><strong>Welches:</strong> Kreatin-Monohydrat, am besten mit Creapure-Siegel.</li>
        <li><strong>Normal:</strong> In den ersten Wochen 1 bis 2 kg mehr auf der Waage. Das ist Wasser im Muskel, kein Fett. Deshalb ist genug trinken wichtig.</li>
        <li><strong>Wichtig:</strong> Bist du unter 18 oder hast du Nierenprobleme, sprich vorher mit deinem Arzt.</li>
      </ul>
    </div>

    ${n.keyFixes?.length ? `
    <div class="section-head"><h2>Die wichtigsten Regeln</h2></div>
    <ul class="card rules" lang="en">${n.keyFixes.map((k) => `<li>${esc(k)}</li>`).join('')}</ul>` : ''}

    ${n.shopping?.length ? `
    <div class="section-head"><h2>Einkaufsliste</h2><button class="link" data-act="shop-reset">Zurücksetzen</button></div>
    <div class="card shop" lang="en">
      ${n.shopping.map((g, gi) => `
        <h3>${esc(SHOP_DE[g.title] || g.title)}</h3>
        <ul>${g.items.map((it, ii) => `<li><label class="check"><input type="checkbox" data-act="shop" data-key="${gi}:${ii}" ${n.shopChecked?.[`${gi}:${ii}`] ? 'checked' : ''}><span>${esc(it)}</span></label></li>`).join('')}</ul>`).join('')}
    </div>` : ''}
  </section>`;

  root.onclick = async (ev) => {
    const chip = ev.target.closest('[data-chips="foodday"] .chip');
    if (chip) { renderFood(root, { day: Number(chip.dataset.value) }); return; }
    const el = ev.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    if (act === 'water') {
      d.waterMl = Math.max(0, (d.waterMl || 0) + Number(el.dataset.ml));
      await saveDaily();
      renderFood(root, { day: idx });
    } else if (act === 'meal') {
      d.meals[el.dataset.key] = el.checked;
      await saveDaily();
      renderFood(root, { day: idx });
    } else if (act === 'creatine') {
      d.creatine = el.checked;
      await saveDaily();
    } else if (act === 'shop') {
      n.shopChecked ||= {};
      n.shopChecked[el.dataset.key] = el.checked;
      await saveNutrition();
    } else if (act === 'shop-reset') {
      n.shopChecked = {};
      await saveNutrition();
      renderFood(root, { day: idx });
    }
  };
}

const SHOP_DE = {
  'Protein Sources': 'Eiweiß',
  Carbohydrates: 'Kohlenhydrate',
  'Healthy Fats': 'Gesunde Fette',
  'Drinks & Miscellaneous': 'Getränke und Sonstiges',
  Staples: 'Gewürze und Basics',
  Optional: 'Optional',
};

function mealRow(m, key, eaten) {
  const steps = recipeFor(m.name);
  return `
  <li class="meal">
    <label class="check">
      <input type="checkbox" data-act="meal" data-key="${key}" ${eaten[key] ? 'checked' : ''}>
      <span class="meal-main">
        <span class="meal-slot">${esc(SLOT[m.slot] || m.slot)}${m.time ? ` <span class="num muted">${TIME(m.time)}</span>` : ''}</span>
        <span class="meal-name" lang="en">${esc(m.name)}</span>
        <span class="num muted small">${m.kcal} kcal · E ${m.p} · KH ${m.c} · F ${m.f}</span>
      </span>
    </label>
    ${steps.length ? `<details><summary>Zubereitung</summary><ol>${steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></details>` : ''}
  </li>`;
}

function shakeRow(k, eaten, creatine) {
  const s = SHAKES[k];
  const key = `shake:${k}`;
  return `
  <li class="meal">
    <label class="check">
      <input type="checkbox" data-act="meal" data-key="${key}" ${eaten[key] ? 'checked' : ''}>
      <span class="meal-main">
        <span class="meal-slot">${esc(s.name)} <span class="muted">· füllt die Lücke</span></span>
        <span class="meal-name">${s.items.join(', ')}, ${creatine} g Kreatin</span>
        <span class="num muted small">${s.kcal} kcal · E ${s.p} · KH ${s.c} · F ${s.f}</span>
      </span>
    </label>
    <details><summary>Zubereitung</summary><ol><li>${esc(s.how)}</li><li>Kreatin einfach mitmixen, es ist geschmacksneutral.</li></ol></details>
  </li>`;
}
