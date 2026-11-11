// Turns the text of a RicFit nutrition PDF into targets, meal days and a shopping list.

const NOISE = [
  /^RicFit LLC\. Confidential/i, /^Please note that this document/i, /^disclosure of the contents/i,
  /^and intellectual property rights/i, /^© \[?\d{4}/,
];

function strip(t) {
  return t
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

const num = (s) => Number(String(s).replace(/[,.](?=\d{3}\b)/g, '').replace(',', '.'));

export function parseNutrition(rawLines) {
  const lines = rawLines
    .map((l) => (typeof l === 'string' ? l : l.text))
    .filter((t) => !NOISE.some((r) => r.test(t)))
    .map(strip)
    .filter(Boolean);
  const all = lines.join('\n');

  const out = {
    kind: 'nutrition',
    version: 1,
    kcal: null,
    protein: null,
    carbs: null,
    fat: null,
    waterL: null,
    creatineG: null,
    mealsPerDay: null,
    supplements: [],
    keyFixes: [],
    days: [],
    shopping: [],
  };

  let m = all.match(/Caloric Target:\s*([\d.,]+)\s*kcal/i);
  if (m) out.kcal = num(m[1]);
  m = all.match(/Protein:[^\n]*?(\d+)\s*g per day/i);
  if (m) out.protein = Number(m[1]);
  m = all.match(/Protein:\s*([\d.,]+)\s*g per kg/i);
  if (m) out.proteinPerKg = num(m[1]);
  m = all.match(/Carbs:[\s\S]*?(\d+)\s*-\s*(\d+)\s*g per day/i);
  if (m) out.carbs = [Number(m[1]), Number(m[2])];
  m = all.match(/Fats:[\s\S]*?(\d+)\s*-\s*(\d+)\s*g per day/i);
  if (m) out.fat = [Number(m[1]), Number(m[2])];
  m = all.match(/Hydration:\s*([\d.,]+)\s*-\s*([\d.,]+)\s*L/i);
  if (m) out.waterL = [num(m[1]), num(m[2])];
  m = all.match(/creatine[^\n]*?\((\d+)\s*g\s*\/\s*day\)/i) || all.match(/Creatine Monohydrate:\s*(\d+)\s*g/i);
  if (m) out.creatineG = Number(m[1]);
  m = all.match(/Meal Frequency:\s*(\d+)\s*-\s*(\d+)\s*meals/i);
  if (m) out.mealsPerDay = [Number(m[1]), Number(m[2])];
  m = all.match(/Omega-3:\s*([^\n]+)/i);
  if (m) out.supplements.push({ name: 'Omega-3', dose: m[1].trim() });
  if (/Multivitamin/i.test(all)) out.supplements.push({ name: 'Multivitamin', dose: 'täglich' });

  // Weight from protein target: 2.2 g/kg -> 155 g
  if (out.protein && out.proteinPerKg) out.weightKg = Math.round(out.protein / out.proteinPerKg);

  // Meal plan days
  let inPlan = false;
  let day = null;
  let meal = null;
  for (const t of lines) {
    if (/Day Meal Plan/i.test(t)) { inPlan = true; continue; }
    if (!inPlan) continue;
    if (/^Final Notes/i.test(t)) break;
    const dm = t.match(/^Day\s*(\d+)$/i);
    if (dm) {
      day = { n: Number(dm[1]), meals: [] };
      out.days.push(day);
      meal = null;
      continue;
    }
    if (!day) continue;
    const sm = t.match(/^(Breakfast|Lunch|Snack|Dinner|Pre-Workout|Post-Workout)\s*(?:\(([^)]+)\))?\s*:?\s*(.*)$/i);
    if (sm) {
      meal = { slot: sm[1], time: sm[2] || null, name: sm[3] || '', kcal: null, p: null, c: null, f: null, why: '' };
      day.meals.push(meal);
      continue;
    }
    if (!meal) continue;
    const mm = t.match(/^Meal:\s*(.+)$/i);
    if (mm) { meal.name = mm[1]; meal._open = 'name'; continue; }
    const mac = t.match(/Macros:\s*(\d+)\s*kcal\s*\|\s*(\d+)\s*g protein\s*\|\s*(\d+)\s*g carbs\s*\|\s*(\d+)\s*g fats?/i);
    if (mac) {
      Object.assign(meal, { kcal: +mac[1], p: +mac[2], c: +mac[3], f: +mac[4] });
      meal._open = null;
      continue;
    }
    const why = t.match(/^Why\?\s*(.+)$/i);
    if (why) { meal.why = why[1]; meal._open = 'why'; continue; }
    if (meal._open === 'name') meal.name += ' ' + t;
    else if (meal._open === 'why') meal.why += ' ' + t;
  }
  for (const d of out.days) for (const ml of d.meals) delete ml._open;

  // Key fixes
  const kf = all.match(/Key Fixes:([\s\S]*?)The Standard is High/i);
  if (kf) out.keyFixes = kf[1].split('\n').map((s) => s.trim()).filter((s) => s.length > 3);
  // Join wrapped lines (a line starting lowercase continues the previous one)
  out.keyFixes = out.keyFixes.reduce((acc, s) => {
    if (acc.length && /^[a-z(]/.test(s)) acc[acc.length - 1] += ' ' + s;
    else acc.push(s);
    return acc;
  }, []);

  // Shopping list
  let inShop = false;
  let group = null;
  for (const t of lines) {
    if (/Grocery Shopping List/i.test(t)) { inShop = true; continue; }
    if (!inShop) continue;
    if (/^Budget Tip/i.test(t)) break;
    if (/^\w+, here's your|^on track|^broken it down|^This will cover|^friendly, simple/i.test(t)) continue;
    const g = t.match(/^(Protein Sources|Carbohydrates|Healthy Fats|Drinks & Miscellaneous|Staples|Optional)/i);
    if (g) {
      group = { title: g[1], items: [] };
      out.shopping.push(group);
      continue;
    }
    if (!group) continue;
    if (/^(Whole grains|Vegetables|Fruits|Starchy Carbs):?/i.test(t)) continue;
    const item = t.replace(/^[•\-]\s*/, '').trim();
    if (!item) continue;
    if (/^\(|^[a-z]/.test(item) && group.items.length) group.items[group.items.length - 1] += ' ' + item;
    else group.items.push(item);
  }

  out.stats = { days: out.days.length, meals: out.days.reduce((n, d) => n + d.meals.length, 0) };
  return out;
}
