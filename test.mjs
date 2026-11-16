import { readFileSync } from 'node:fs';
import { parse } from './parse.js';
import { marked } from '../markdown-render-speed-02-kit/baselines/vendor/marked/marked.esm.js';
const cases = JSON.parse(readFileSync('../markdown-render-speed-02-kit/practice/input/cases.json','utf8'));
const exp = JSON.parse(readFileSync('../markdown-render-speed-02-kit/practice/reference/expected.json','utf8'));
const map = new Map(exp.cases.map(c=>[c.id, c.html]));
let ok=0, identical=0; const bad=[];
for(const c of cases){
  let got;
  try { got = parse(c.markdown); } catch(e) { got = 'ERROR: '+e.message; }
  if(got===map.get(c.id)) ok++; else bad.push(c.id);
  if(got===marked.parse(c.markdown)) identical++;
}
console.log(`passed: ${ok}/720, identical-to-marked: ${identical}/720`, bad.length ? 'first mismatches: '+bad.slice(0,10).join(', ') : '');
if(bad.length){
  const c = cases.find(x=>x.id===bad[0]);
  let got; try{ got=parse(c.markdown);}catch(e){got='ERR '+e.message;}
  const want = map.get(c.id);
  let i=0; while(i<want.length && i<got.length && want[i]===got[i]) i++;
  console.log('case', bad[0], 'first diff at', i);
  console.log('WANT:', JSON.stringify(want.slice(Math.max(0,i-60), i+80)));
  console.log('GOT :', JSON.stringify(got.slice(Math.max(0,i-60), i+80)));
}
