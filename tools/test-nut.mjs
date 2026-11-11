import fs from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractPdf } from '../js/pdf-text.js';
import { parseNutrition } from '../js/parse-nutrition.js';
const { lines } = await extractPdf(pdfjs, new Uint8Array(fs.readFileSync(process.argv[2])));
const n = parseNutrition(lines);
const {days, shopping, ...rest} = n; console.log(JSON.stringify(rest,null,1));
for (const d of days) { console.log('Day', d.n, d.meals.reduce((a,m)=>a+(m.kcal||0),0)); for (const m of d.meals) console.log('  ', m.slot, m.time, '|', m.name, '|', m.kcal, m.p, m.c, m.f); }
for (const g of shopping) console.log(g.title, g.items.length, g.items.slice(0,4));
