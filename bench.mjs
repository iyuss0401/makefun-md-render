import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { parse } from './parse.js';

const MARKED_ESM = process.env.MARKED_ESM || '../markdown-render-speed-02-kit/baselines/vendor/marked/marked.esm.js';
const { marked } = await import(MARKED_ESM);
const cases = JSON.parse(readFileSync('../markdown-render-speed-02-kit/practice/input/cases.json', 'utf8'));

// correctness: byte-identical to marked on every case
let identical = 0;
for (const c of cases) if (parse(c.markdown) === marked.parse(c.markdown)) identical++;
console.log(`identical: ${identical}/${cases.length}`);

// warmup
for (let i = 0; i < 3; i++) {
  for (const c of cases) { parse(c.markdown); marked.parse(c.markdown); }
}

const BEST_OF = 7;
const ROUNDS = 3;
const time = (fn) => {
  const t0 = performance.now();
  for (const c of cases) fn(c.markdown);
  return performance.now() - t0;
};

const speedups = [];
for (let run = 1; run <= ROUNDS; run++) {
  let bestMine = Infinity, bestMarked = Infinity;
  for (let i = 0; i < BEST_OF; i++) {
    bestMine = Math.min(bestMine, time(parse));
    bestMarked = Math.min(bestMarked, time((s) => marked.parse(s)));
  }
  const speedup = bestMarked / bestMine;
  speedups.push(speedup);
  console.log(
    `run ${run}: mine ${bestMine.toFixed(1)} ms | marked ${bestMarked.toFixed(1)} ms | speedup ${speedup.toFixed(2)}x`,
  );
}
const avg = speedups.reduce((a, b) => a + b, 0) / speedups.length;
console.log(`average speedup (best of ${BEST_OF}, ${ROUNDS} runs): ${avg.toFixed(2)}x`);
console.log(avg >= 1.25 ? 'PASS: >= 1.25x' : 'FAIL: < 1.25x');
