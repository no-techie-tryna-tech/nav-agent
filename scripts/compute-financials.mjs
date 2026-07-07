#!/usr/bin/env node
// Deterministic financial + market-sizing math for the memo pipeline.
// Reuses the exact same calculation module as the web app (memo-agent/js/calc.js)
// so both modes always agree.
//
// Usage:
//   node scripts/compute-financials.mjs financials <agent2-output.json>
//   node scripts/compute-financials.mjs market <agent3-output.json> [samPct] [somPct] [growthPct] [years]

import { readFileSync } from 'node:fs';
import { computeFinancials, computeMarketSizing, defaultAssumptionsFromStep3 } from '../memo-agent/js/calc.js';

const [, , command, file, ...rest] = process.argv;

function usage() {
  console.error('Usage:');
  console.error('  compute-financials.mjs financials <agent2-output.json>');
  console.error('  compute-financials.mjs market <agent3-output.json> [samPct] [somPct] [growthPct] [years]');
  process.exit(1);
}

if (!command || !file) usage();

const input = JSON.parse(readFileSync(file, 'utf8'));

if (command === 'financials') {
  console.log(JSON.stringify(computeFinancials(input), null, 2));
} else if (command === 'market') {
  const defaults = defaultAssumptionsFromStep3(input);
  const assumptions = {
    samPct: rest[0] !== undefined ? Number(rest[0]) : defaults.samPct,
    somPct: rest[1] !== undefined ? Number(rest[1]) : defaults.somPct,
    growthPct: rest[2] !== undefined ? Number(rest[2]) : defaults.growthPct,
    years: rest[3] !== undefined ? Number(rest[3]) : defaults.years
  };
  console.log(JSON.stringify({ assumptions, result: computeMarketSizing(input, assumptions) }, null, 2));
} else {
  usage();
}
