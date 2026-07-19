// Engine-level tests for capabilities the legacy API never had: the
// MethodResult envelope, input validation, data-quality warnings, assumption
// clamping, and period-type inference.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getMethod, listMethods } from '../../memo-agent/engine/index.js';
import { resolveAssumptions } from '../../memo-agent/engine/core/assumptions.js';
import { inferPeriodType, periodDays } from '../../memo-agent/engine/core/periods.js';

const fdInput = JSON.parse(readFileSync(new URL('../fixtures/financial-dd-input.json', import.meta.url), 'utf8'));
const msInput = JSON.parse(readFileSync(new URL('../fixtures/market-sizing-input.json', import.meta.url), 'utf8'));
const dcfInput = JSON.parse(readFileSync(new URL('../fixtures/dcf-input.json', import.meta.url), 'utf8'));

test('registry lists every method and rejects unknown ids', () => {
  const ids = listMethods().map((m) => m.id).sort();
  assert.deepEqual(ids, ['dcf', 'financial-dd', 'market-sizing']);
  assert.throws(() => getMethod('lbo'), /Unknown method/);
});

test('every method returns the standardized envelope', () => {
  const inputs = { 'financial-dd': fdInput, 'market-sizing': msInput, dcf: dcfInput };
  for (const { id } of listMethods()) {
    const input = inputs[id];
    const r = getMethod(id).run(input);
    assert.equal(r.schemaVersion, 1);
    assert.equal(r.method, id);
    assert.equal(r.ok, true);
    assert.ok(Array.isArray(r.errors) && Array.isArray(r.warnings));
    assert.ok(r.outputs !== null);
    assert.equal(typeof r.summary, 'string');
  }
});

test('financial-dd: invalid input yields errors, not a crash or fabricated output', () => {
  const r = getMethod('financial-dd').run({ income_statement: { revenue: [1] } });
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /periods/);
  assert.equal(r.outputs, null);
});

test('financial-dd: orphan add-back produces a warning and is not applied', () => {
  const input = structuredClone(fdInput);
  input.addbacks.push({ label: 'Mystery', period: 'FY2099', amount: 999999, rationale: 'x' });
  const r = getMethod('financial-dd').run(input);
  assert.equal(r.ok, true);
  assert.ok(r.warnings.some((w) => w.includes('FY2099') && w.includes('NOT be applied')));
  assert.equal(r.outputs.perPeriod[1].ebitdaAdjusted, -220000); // unchanged
});

test('financial-dd: add-back period matching tolerates case/whitespace', () => {
  const input = structuredClone(fdInput);
  input.addbacks[0].period = '  fy2024 ';
  const r = getMethod('financial-dd').run(input);
  assert.equal(r.outputs.perPeriod[1].ebitdaAdjusted, -220000); // still applied
});

test('financial-dd: series length mismatch warns but computes', () => {
  const input = structuredClone(fdInput);
  input.income_statement.revenue = [1500000, 2800000]; // one short
  const r = getMethod('financial-dd').run(input);
  assert.equal(r.ok, true);
  assert.ok(r.warnings.some((w) => w.includes('revenue') && w.includes('2 values for 3 periods')));
  assert.equal(r.outputs.perPeriod[2].revenue, null);
});

test('financial-dd: quarterly periods use 91-day basis for DSO', () => {
  const input = {
    currency: 'USD',
    periods: ['Q1 2025', 'Q2 2025'],
    income_statement: { revenue: [1000000, 1100000] },
    balance_sheet: { accounts_receivable: [200000, 210000] }
  };
  const r = getMethod('financial-dd').run(input);
  assert.equal(r.intermediates.periodType, 'quarterly');
  const expectedDso = (200000 / 1000000) * 91;
  assert.ok(Math.abs(r.outputs.perPeriod[0].dso - expectedDso) < 0.01);
});

test('period inference classifies common label styles', () => {
  assert.equal(inferPeriodType(['FY2023', 'FY2024']).type, 'annual');
  assert.equal(inferPeriodType(['2023', '2024']).type, 'annual');
  assert.equal(inferPeriodType(['Q1 24', 'Q2 24']).type, 'quarterly');
  assert.equal(inferPeriodType(['LTM Jun-25']).type, 'ltm');
  assert.equal(inferPeriodType(['FY2024', 'Q1 2025']).mixed, true);
  assert.equal(periodDays('quarterly'), 91);
});

test('market-sizing: missing TAM is an error with explanation', () => {
  const r = getMethod('market-sizing').run({ sam: { pct_of_tam: 20 } });
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /tam\.value/);
});

test('market-sizing: out-of-range override is clamped with a warning', () => {
  const r = getMethod('market-sizing').run(msInput, { somPct: 250 });
  assert.equal(r.ok, true);
  assert.equal(r.assumptionsUsed.somPct, 100);
  assert.ok(r.warnings.some((w) => w.includes('SOM as % of SAM') && w.includes('clamped')));
});

test('market-sizing: unknown assumption key warns and is ignored', () => {
  const r = getMethod('market-sizing').run(msInput, { discountRate: 12 });
  assert.equal(r.ok, true);
  assert.ok(r.warnings.some((w) => w.includes('discountRate')));
});

test('assumption resolution: defaults, coercion, clamping', () => {
  const defs = [{ key: 'x', name: 'X', category: 't', default: 5, min: 0, max: 10, unit: '%', description: '' }];
  assert.equal(resolveAssumptions(defs).values.x, 5);
  assert.equal(resolveAssumptions(defs, { x: '7' }).values.x, 7);
  const bad = resolveAssumptions(defs, { x: 'abc' });
  assert.equal(bad.values.x, 5);
  assert.equal(bad.warnings.length, 1);
  assert.equal(resolveAssumptions(defs, { x: -3 }).values.x, 0);
});

test('determinism: identical inputs produce identical results', () => {
  const a = getMethod('financial-dd').run(fdInput);
  const b = getMethod('financial-dd').run(fdInput);
  assert.deepEqual(a, b);
});
