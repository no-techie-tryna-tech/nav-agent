// Golden regression tests: these numbers were verified by hand and via the
// browser e2e suite against the original calc.js. Any engine refactor must
// keep every value here identical. The legacy calc.js API is tested (as the
// compatibility contract); engine-method tests live in their own files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeFinancials, computeMarketSizing, defaultAssumptionsFromStep3 } from '../../memo-agent/js/calc.js';

const fdInput = JSON.parse(readFileSync(new URL('../fixtures/financial-dd-input.json', import.meta.url), 'utf8'));
const msInput = JSON.parse(readFileSync(new URL('../fixtures/market-sizing-input.json', import.meta.url), 'utf8'));

function close(actual, expected, tol = 0.01) {
  assert.ok(actual !== null && actual !== undefined, `expected ~${expected}, got ${actual}`);
  assert.ok(Math.abs(actual - expected) <= tol, `expected ~${expected}, got ${actual}`);
}

test('financial DD: per-period margins and growth', () => {
  const r = computeFinancials(fdInput);
  const [p23, p24, p25] = r.perPeriod;

  close(p23.grossMarginPct, 40.0);
  close(p24.grossMarginPct, 42.8571);
  close(p25.grossMarginPct, 45.2381);

  assert.equal(p23.revenueGrowthPct, null);
  close(p24.revenueGrowthPct, 86.6667);
  close(p25.revenueGrowthPct, 50.0);

  close(r.revenueCagrPct, 67.3320, 0.01);
});

test('financial DD: QoE add-backs land in the right period only', () => {
  const r = computeFinancials(fdInput);
  const [p23, p24, p25] = r.perPeriod;
  assert.equal(p23.ebitdaAdjusted, -500000);
  assert.equal(p24.ebitdaAdjusted, -220000); // -300000 + 80000 add-back
  assert.equal(p25.ebitdaAdjusted, 100000);
  assert.equal(p24.addbacksTotal, 80000);
  assert.equal(p25.addbacksTotal, 0);
});

test('financial DD: working capital and cash conversion cycle', () => {
  const r = computeFinancials(fdInput);
  const p25 = r.perPeriod[2];
  close(p25.dso, (500000 / 4200000) * 365);
  close(p25.dio, (220000 / 2300000) * 365);
  close(p25.dpo, (300000 / 2300000) * 365);
  close(p25.cashConversionCycle, 30.7574, 0.01);
  assert.equal(p25.nwc, 420000);
});

test('financial DD: free cash flow', () => {
  const r = computeFinancials(fdInput);
  assert.equal(r.perPeriod[0].fcf, -700000);
  assert.equal(r.perPeriod[1].fcf, -600000);
  assert.equal(r.perPeriod[2].fcf, -350000);
  close(r.perPeriod[2].fcfMarginPct, (-350000 / 4200000) * 100);
});

test('financial DD: null inputs handled without fabrication', () => {
  assert.equal(computeFinancials(null), null);
  const sparse = { currency: 'USD', periods: ['FY2025'], income_statement: { revenue: [1000] } };
  const r = computeFinancials(sparse);
  assert.equal(r.perPeriod[0].revenue, 1000);
  assert.equal(r.perPeriod[0].grossProfit, null);
  assert.equal(r.perPeriod[0].dso, null);
  assert.equal(r.revenueCagrPct, null);
});

test('market sizing: defaults come from the agent output', () => {
  const a = defaultAssumptionsFromStep3(msInput);
  assert.equal(a.samPct, 20);
  assert.equal(a.somPct, 10);
  assert.equal(a.growthPct, 18);
  assert.equal(a.years, 5);
});

test('market sizing: SAM/SOM funnel and growth projection', () => {
  const a = defaultAssumptionsFromStep3(msInput);
  const r = computeMarketSizing(msInput, a);
  assert.equal(r.tamValue, 8000000000);
  assert.equal(r.samValue, 1600000000);
  assert.equal(r.somValue, 160000000);
  assert.equal(r.projection.length, 5);
  close(r.projection[4].obtainableValue, 160000000 * Math.pow(1.18, 5), 1);
});

test('market sizing: assumption overrides recompute the funnel', () => {
  const r = computeMarketSizing(msInput, { samPct: 20, somPct: 50, growthPct: 18, years: 5 });
  assert.equal(r.somValue, 800000000);
});

test('market sizing: null-safe on missing TAM', () => {
  assert.equal(computeMarketSizing(null, { samPct: 20, somPct: 10, growthPct: 15, years: 5 }), null);
  assert.equal(computeMarketSizing({}, { samPct: 20, somPct: 10, growthPct: 15, years: 5 }), null);
});
