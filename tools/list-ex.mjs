import fs from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractPdf } from '../js/pdf-text.js';
import { parseTraining, targetFor } from '../js/parse-training.js';
const { lines } = await extractPdf(pdfjs, new Uint8Array(fs.readFileSync('../_private/training.pdf')));
const plan = parseTraining(lines); const seen = new Map();
for (const d of plan.days) for (const s of d.sections) for (const e of s.exercises) { const k=e.name; if(!seen.has(k)) seen.set(k,{s:s.kind,t:targetFor(e,1),c:e.cues.join(' / ').slice(0,260)}); }
for (const [k,v] of seen) console.log(`${k} [${v.s}] ${v.t} :: ${v.c}`);
console.log(seen.size);
