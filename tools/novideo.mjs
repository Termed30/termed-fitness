import fs from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractPdf } from '../js/pdf-text.js';
import { extractDocx } from '../js/docx-text.js';
import { parseTraining, targetFor } from '../js/parse-training.js';
const f = process.argv[2];
const { lines } = f.endsWith('.docx') ? await extractDocx(new Uint8Array(fs.readFileSync(f))) : await extractPdf(pdfjs, new Uint8Array(fs.readFileSync(f)));
const plan = parseTraining(lines);
for (const d of plan.days) for (const s of d.sections) for (const e of s.exercises) if (!e.video || e.video.provider === 'link') console.log(d.id, s.kind, '|', e.name, '|', targetFor(e, 1).slice(0, 60), '|', e.video?.url || '-');
