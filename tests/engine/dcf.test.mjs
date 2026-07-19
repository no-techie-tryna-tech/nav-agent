// DCF golden tests. Expected values come from the reference workbook
// ("Happy Hour Co" DCF model) at WACC 8.5%, perpetuity growth 0.5%,
// exit multiple 8.5x. The perpetuity-method chain must match the workbook.
// The exit-multiple method intentionally deviates (the workbook discounts
// its exit TV with the year-9 factor — a cell slip; we use year-10), so its
// expectation here is computed from the standard formula.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getMethod } from '../../memo-agent/engine/index.js';
import { buildForecast, taper } from '../../memo-agent/engine/methods/dcf.js';

const input = JSON.parse(readFileSync(new URL('../fixtures/dcf-input.json', import.meta.url), 'utf8'));
const WORKBOOK = { waccPct: 8.5, terminalGrowthPct: 0.5, exitEbitdaMultiple: 8.5 };
const dcf = getMethod('dcf');

function close(actual, expected, tol) {
  assert.ok(actual !== null && actual !== undefined, `expected ~${expected}, got ${actual}`);
  assert.ok(Math.abs(actual - expected) <= tol, `expected ~${expected}, got ${actual} (tol ${tol})`);
}

test('dcf: yearly FCF build matches workbook row 61', () => {
  const r = dcf.run(input, WORKBOOK);
  assert.equal(r.ok, true);
  const expectedFcf = [15.920, 48.626, 94.252, 55.249, 62.313, 65.519, 68.494, 71.389, 74.062, 75.229];
  r.outputs.years.forEach((y, i) => close(y.fcf, expectedFcf[i], 0.01));
});

test('dcf: EBIT/tax/EBIAT chain matches workbook (FY2021)', () => {
  const r = dcf.run(input, WORKBOOK);
  const y = r.outputs.years[0];
  close(y.ebit, 34.166, 0.01);
  close(y.tax, -5.808, 0.01);
  close(y.ebiat, 28.357, 0.01);
});

test('dcf: discount factors match workbook row 67', () => {
  const r = dcf.run(input, WORKBOOK);
  const expected = [0.922, 0.849, 0.783, 0.722, 0.665, 0.613, 0.565, 0.521, 0.480, 0.442];
  r.outputs.years.forEach((y, i) => close(y.discountFactor, expected[i], 0.001));
});

test('dcf: perpetuity method matches workbook to the cent', () => {
  const r = dcf.run(input, WORKBOOK);
  const p = r.outputs.perpetuity;
  close(p.pvFcfTotal, 395.914, 0.05);          // workbook F37
  close(p.terminalValue, 945.062, 0.05);       // workbook T69
  close(p.pvTerminal, 417.987, 0.05);          // workbook H76
  close(p.enterpriseValue, 813.901, 0.06);     // workbook F39
  close(p.equityValue, 729.284, 0.06);         // workbook F41
  close(p.impliedSharePrice, 3.66475, 0.001);  // workbook F42 = 366.475c
  close(p.premiumPct, 122.1, 0.1);             // workbook F43
  close(p.tvPctOfEv, 51.4, 0.1);               // workbook G38
});

test('dcf: exit-multiple TV uses the standard year-N discount factor', () => {
  const r = dcf.run(input, WORKBOOK);
  const x = r.outputs.exitMultiple;
  close(x.terminalValue, 1206.688, 0.05);      // workbook T70: FY2030 EBITDA * 8.5
  const df10 = 1 / Math.pow(1.085, 10);
  close(x.pvTerminal, 1206.688 * df10, 0.05);  // standard, NOT the workbook's R67 slip
  close(x.enterpriseValue, 395.914 + 1206.688 * df10, 0.1);
});

test('dcf: sensitivity grid centre equals base outputs', () => {
  const r = dcf.run(input, WORKBOOK);
  const s = r.outputs.sensitivity;
  close(s.perpetuity.cells[2][2].ev, r.outputs.perpetuity.enterpriseValue, 1e-9);
  close(s.exitMultiple.cells[2][2].ev, r.outputs.exitMultiple.enterpriseValue, 1e-9);
  assert.equal(s.perpetuity.waccPct.length, 5);
  assert.equal(s.perpetuity.cells.length, 5);
  assert.equal(s.perpetuity.cells[0].length, 5);
  // EV must fall as WACC rises (column fixed)
  assert.ok(s.perpetuity.cells[0][2].ev > s.perpetuity.cells[4][2].ev);
  // EV must rise with the exit multiple (row fixed)
  assert.ok(s.exitMultiple.cells[2][4].ev > s.exitMultiple.cells[2][0].ev);
});

test('dcf: WACC <= growth disables perpetuity with a warning, exit still works', () => {
  const r = dcf.run(input, { waccPct: 2, terminalGrowthPct: 3 });
  assert.equal(r.ok, true);
  assert.equal(r.outputs.perpetuity, null);
  assert.ok(r.warnings.some((w) => w.includes('must exceed')));
  assert.ok(r.outputs.exitMultiple.enterpriseValue > 0);
});

test('dcf: invalid input rejected with explanation', () => {
  const r = dcf.run({ forecast: [] });
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /forecast/);
  const r2 = dcf.run({ forecast: [{ label: 'Y1', revenue: 'abc', ebitda: 5 }] });
  assert.equal(r2.ok, false);
  assert.match(r2.errors[0], /revenue/);
});

test('dcf: positive capex/D&A sign mistakes produce warnings', () => {
  const bad = structuredClone(input);
  bad.forecast[0].capex = 51;
  bad.forecast[0].d_and_a = 40;
  const r = dcf.run(bad, WORKBOOK);
  assert.ok(r.warnings.some((w) => w.includes('capex is positive')));
  assert.ok(r.warnings.some((w) => w.includes('d_and_a is positive')));
});

test('buildForecast: drivers produce the expected explicit rows', () => {
  const rows = buildForecast(
    { revenue: 1000, startYearLabel: 'FY2025' },
    {
      revenueGrowthPct: [10, 5],
      ebitdaMarginPct: [20, 20],
      daPctOfRevenue: [3, 3],
      capexPctOfRevenue: [4, 4],
      nwcChangePctOfRevenue: [1, 1],
      taxRatePct: [25, 25]
    }
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0].label, 'FY2026');
  close(rows[0].revenue, 1100, 1e-9);
  close(rows[1].revenue, 1155, 1e-9);
  close(rows[0].ebitda, 220, 1e-9);
  close(rows[0].d_and_a, -33, 1e-9);
  close(rows[0].capex, -44, 1e-9);
  close(rows[0].nwc_change, 11, 1e-9);
  assert.equal(rows[0].tax_rate_pct, 25);
  // and the rows feed straight into the method
  const r = dcf.run({ currency: 'USD', forecast: rows, net_debt: 0 }, { waccPct: 10, terminalGrowthPct: 2 });
  assert.equal(r.ok, true);
  assert.ok(r.outputs.perpetuity.enterpriseValue > 0);
});

test('taper: linear interpolation inclusive of both ends', () => {
  assert.deepEqual(taper(10, 2, 5), [10, 8, 6, 4, 2]);
  assert.deepEqual(taper(5, 5, 3), [5, 5, 5]);
});

test('dcf: determinism', () => {
  assert.deepEqual(dcf.run(input, WORKBOOK), dcf.run(input, WORKBOOK));
});
