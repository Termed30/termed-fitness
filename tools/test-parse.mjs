import fs from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractPdf } from '../js/pdf-text.js';
import { parseTraining, targetFor } from '../js/parse-training.js';
const data = new Uint8Array(fs.readFileSync(process.argv[2]));
const { lines } = await extractPdf(pdfjs, data);
if (process.argv[3]==='lines') { console.log(lines.map(l=>l.text).join('\n')); process.exit(); }
const plan = parseTraining(lines);
console.log(JSON.stringify({title:plan.title, coach:plan.coach, client:plan.client, motto:plan.motto, pre:plan.preSession, stats:plan.stats, goals:plan.weeklyGoals, schedule:plan.schedule}, null, 1));
for (const d of plan.days) { console.log('\n##', d.id, d.title);
  for (const s of d.sections) { console.log(' --', s.n, s.kind, s.title, 'rounds', JSON.stringify(s.rounds), 'rest', s.restSec, '| notes:', s.notes.length);
    for (const e of s.exercises) console.log('    ', e.id, e.altOf?'(ALT)':'', e.name, '|', targetFor(e,1), '||', targetFor(e,4), e.targetNote?'['+e.targetNote+']':'', '| cues', e.cues.length, e.video? e.video.provider+':'+e.video.id+(e.video.hash?'/'+e.video.hash:'') : 'NO VIDEO');
  }}
console.log('\nEXTRAS'); for (const x of plan.extras) console.log(x.id, x.type, x.title, x.video?.provider, x.lines.length);
