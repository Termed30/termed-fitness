import fs from 'node:fs';
import { extractDocx } from '../js/docx-text.js';
import { parseTraining, targetFor } from '../js/parse-training.js';
const { lines } = await extractDocx(new Uint8Array(fs.readFileSync(process.argv[2])));
const plan = parseTraining(lines);
console.log(plan.title, plan.coach, JSON.stringify(plan.stats));
for (const d of plan.days) { console.log('##', d.id, d.title, d.subtitle || '', '|', d.sections.map((s) => `${s.kind}:${s.exercises.length}/${JSON.stringify(s.rounds[1])}`).join(' ')); }
for (const d of plan.days) for (const s of d.sections) if (s.kind === 'stretch') console.log(d.id, s.heading, s.exercises.map((e) => `${e.name} [${targetFor(e, 1)}] ${e.video ? 'V' : '-'}`).join(' ; '));
console.log('EXTRAS', plan.extras.map((x) => x.id + ':' + x.title).join(' | '));
