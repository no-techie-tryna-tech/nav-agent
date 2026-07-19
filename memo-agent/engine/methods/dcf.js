// @ts-check
// Discounted Cash Flow method. Faithful automation of the reference workbook
// ("Happy Hour Co" DCF): unlevered FCF build (EBITDA → EBIT → tax → EBIAT →
// FCF), end-of-year discounting, terminal value by BOTH perpetuity growth and
// exit EBITDA multiple, an equity-value bridge, and WACC-cross sensitivity
// grids for each terminal-value method.
//
// Sign conventions (identical to the workbook):
//   d_and_a, capex, other_cashflows, exceptionals: NEGATIVE = cash outflow
//   nwc_change: POSITIVE = cash inflow (working capital released)
//   net_debt: POSITIVE = net debt (debt exceeds cash)
//
// One deliberate deviation from the reference workbook, documented for audit:
// the workbook discounts the exit-multiple terminal value with the year N-1
// discount factor (cell N76 uses R67 rather than S67) — a cell slip. This
// engine discounts both terminal values with the year-N factor, the standard
// treatment. Perpetuity-method outputs match the workbook to the cent.

import { toNum } from '../core/series.js';
import { resolveAssumptions } from '../core/assumptions.js';
import { buildResult } from '../core/result.js';

export const id = 'dcf';
export const name = 'Discounted Cash Flow';

/** @type {import('../core/types.js').AssumptionDef[]} */
export const assumptionDefs = [
  { key: 'waccPct', name: 'WACC', category: 'discounting', default: 8.5, min: 1, max: 30, step: 0.25, unit: '%', description: 'Weighted average cost of capital used to discount unlevered free cash flows.' },
  { key: 'terminalGrowthPct', name: 'Perpetuity growth rate', category: 'terminal', default: 2.0, min: -2, max: 8, step: 0.25, unit: '%', description: 'Growth rate into perpetuity applied to the final forecast year FCF (Gordon growth). Must be below WACC.' },
  { key: 'exitEbitdaMultiple', name: 'TV exit EBITDA multiple', category: 'terminal', default: 8.0, min: 1, max: 30, step: 0.5, unit: 'x', description: 'EV/EBITDA multiple applied to final-year EBITDA for the exit-multiple terminal value.' },
  { key: 'waccStepPp', name: 'Sensitivity: WACC step', category: 'sensitivity', default: 0.5, min: 0.1, max: 5, step: 0.1, unit: 'pp', description: 'Increment between WACC rows in the sensitivity grids.' },
  { key: 'growthStepPp', name: 'Sensitivity: growth step', category: 'sensitivity', default: 0.25, min: 0.05, max: 2, step: 0.05, unit: 'pp', description: 'Increment between perpetuity-growth columns in the sensitivity grid.' },
  { key: 'multipleStep', name: 'Sensitivity: multiple step', category: 'sensitivity', default: 0.5, min: 0.1, max: 5, step: 0.1, unit: 'x', description: 'Increment between exit-multiple columns in the sensitivity grid.' }
];

/**
 * @typedef {Object} DcfYearInput
 * @property {string} label
 * @property {number} revenue
 * @property {number} ebitda
 * @property {number} d_and_a        negative = expense
 * @property {number} capex          negative = outflow
 * @property {number} nwc_change     positive = inflow
 * @property {number} other_cashflows negative = outflow
 * @property {number} exceptionals   negative = outflow
 * @property {number} tax_rate_pct   e.g. 17 for 17%
 */

/**
 * Validate DCF inputs.
 * @param {any} raw
 * @returns {{ ok: boolean, errors: string[], warnings: string[] }}
 */
function validateDcf(raw) {
  const errors = [];
  const warnings = [];
  if (!raw || typeof raw !== 'object') {
    return { ok: false, errors: ['Input is not an object.'], warnings };
  }
  if (!Array.isArray(raw.forecast) || raw.forecast.length === 0) {
    errors.push('forecast must be a non-empty array of yearly rows ({label, revenue, ebitda, d_and_a, capex, nwc_change, other_cashflows, exceptionals, tax_rate_pct}).');
  } else {
    raw.forecast.forEach((y, i) => {
      if (!y || typeof y !== 'object') { errors.push(`forecast[${i}] is not an object.`); return; }
      for (const key of ['revenue', 'ebitda']) {
        if (toNum(y[key]) === null) errors.push(`forecast[${i}].${key} ("${y[key]}") must be a number.`);
      }
      for (const key of ['d_and_a', 'capex', 'nwc_change', 'other_cashflows', 'exceptionals', 'tax_rate_pct']) {
        if (y[key] !== undefined && y[key] !== null && toNum(y[key]) === null) {
          warnings.push(`forecast[${i}].${key} ("${y[key]}") is not a number — treated as 0.`);
        }
      }
      if (toNum(y.d_and_a) !== null && y.d_and_a > 0) warnings.push(`forecast[${i}].d_and_a is positive — the convention is negative for expenses; check the sign.`);
      if (toNum(y.capex) !== null && y.capex > 0) warnings.push(`forecast[${i}].capex is positive — the convention is negative for outflows; check the sign.`);
    });
  }
  if (raw.net_debt !== undefined && raw.net_debt !== null && toNum(raw.net_debt) === null) {
    warnings.push(`net_debt ("${raw.net_debt}") is not a number — treated as 0.`);
  }
  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Core DCF computation for one assumption set. Kept separate from run() so
 * the sensitivity grids can re-invoke it cheaply.
 * @param {DcfYearInput[]} forecast
 * @param {number} netDebt
 * @param {number|null} shares
 * @param {number|null} currentPrice
 * @param {{wacc: number, growth: number, multiple: number}} a  decimals, not %
 */
function compute(forecast, netDebt, shares, currentPrice, a) {
  const n = forecast.length;
  const years = forecast.map((y, i) => {
    const t = i + 1;
    const revenue = toNum(y.revenue) ?? 0;
    const ebitda = toNum(y.ebitda) ?? 0;
    const da = toNum(y.d_and_a) ?? 0;
    const capex = toNum(y.capex) ?? 0;
    const nwc = toNum(y.nwc_change) ?? 0;
    const other = toNum(y.other_cashflows) ?? 0;
    const excep = toNum(y.exceptionals) ?? 0;
    const taxRate = (toNum(y.tax_rate_pct) ?? 0) / 100;

    const ebit = ebitda + da;
    const tax = -(ebit * taxRate);
    const ebiat = ebit + tax;
    const fcf = ebiat - da + capex + nwc + other + excep; // -da adds D&A back (da is negative)
    const discountFactor = 1 / Math.pow(1 + a.wacc, t);
    return {
      label: y.label, year: t, revenue, ebitda,
      ebitdaMarginPct: revenue !== 0 ? (ebitda / revenue) * 100 : null,
      da, ebit, ebitMarginPct: revenue !== 0 ? (ebit / revenue) * 100 : null,
      taxRatePct: taxRate * 100, tax, ebiat, capex, nwcChange: nwc, otherCashflows: other, exceptionals: excep,
      fcf, discountFactor, pvFcf: fcf * discountFactor
    };
  });

  const pvFcfTotal = years.reduce((s, y) => s + y.pvFcf, 0);
  const dfN = years[n - 1].discountFactor;
  const finalFcf = years[n - 1].fcf;
  const finalEbitda = years[n - 1].ebitda;

  /** @param {number} tv */
  const bridge = (tv) => {
    const pvTerminal = tv * dfN;
    const enterpriseValue = pvFcfTotal + pvTerminal;
    const equityValue = enterpriseValue - netDebt;
    const impliedSharePrice = shares && shares > 0 ? equityValue / shares : null;
    const premiumPct = impliedSharePrice !== null && currentPrice && currentPrice > 0
      ? (impliedSharePrice / currentPrice - 1) * 100 : null;
    return {
      terminalValue: tv, pvTerminal, pvFcfTotal, enterpriseValue,
      tvPctOfEv: enterpriseValue !== 0 ? (pvTerminal / enterpriseValue) * 100 : null,
      equityValue, impliedSharePrice, premiumPct
    };
  };

  const perpetuity = a.wacc > a.growth
    ? bridge((finalFcf * (1 + a.growth)) / (a.wacc - a.growth))
    : null;
  const exitMultiple = bridge(finalEbitda * a.multiple);

  return { years, perpetuity, exitMultiple };
}

/**
 * Build a 5-point axis centred on a value with the given step.
 * @param {number} centre @param {number} step
 */
function axis(centre, step) {
  return [centre - 2 * step, centre - step, centre, centre + step, centre + 2 * step];
}

/**
 * @param {any} inputs
 * @param {Object<string, any>} [overrides]
 * @returns {import('../core/types.js').MethodResult}
 */
export function run(inputs, overrides = {}) {
  const v = validateDcf(inputs);
  if (!v.ok) {
    return buildResult({ method: id, name, errors: v.errors, warnings: v.warnings, summary: 'Input rejected.' });
  }

  const { values: A, warnings: aWarnings } = resolveAssumptions(assumptionDefs, overrides);
  const warnings = [...v.warnings, ...aWarnings];

  const wacc = A.waccPct / 100;
  const growth = A.terminalGrowthPct / 100;
  if (wacc <= growth) {
    warnings.push(`WACC (${A.waccPct}%) must exceed the perpetuity growth rate (${A.terminalGrowthPct}%) — perpetuity-method outputs are unavailable at these assumptions.`);
  }

  const forecast = /** @type {DcfYearInput[]} */ (inputs.forecast);
  const netDebt = toNum(inputs.net_debt) ?? 0;
  const shares = toNum(inputs.shares_outstanding);
  const currentPrice = toNum(inputs.current_share_price);

  const base = compute(forecast, netDebt, shares, currentPrice, { wacc, growth, multiple: A.exitEbitdaMultiple });

  // Sensitivity grids: rows = WACC, columns = growth rate / exit multiple.
  const waccAxis = axis(A.waccPct, A.waccStepPp);
  const growthAxis = axis(A.terminalGrowthPct, A.growthStepPp);
  const multipleAxis = axis(A.exitEbitdaMultiple, A.multipleStep);

  const perpetuityGrid = waccAxis.map((w) => growthAxis.map((g) => {
    if (w / 100 <= g / 100) return { ev: null, sharePrice: null };
    const r = compute(forecast, netDebt, shares, currentPrice, { wacc: w / 100, growth: g / 100, multiple: A.exitEbitdaMultiple });
    return r.perpetuity ? { ev: r.perpetuity.enterpriseValue, sharePrice: r.perpetuity.impliedSharePrice } : { ev: null, sharePrice: null };
  }));

  const exitGrid = waccAxis.map((w) => multipleAxis.map((m) => {
    const r = compute(forecast, netDebt, shares, currentPrice, { wacc: w / 100, growth, multiple: m });
    return { ev: r.exitMultiple.enterpriseValue, sharePrice: r.exitMultiple.impliedSharePrice };
  }));

  const outputs = {
    currency: typeof inputs.currency === 'string' ? inputs.currency : 'USD',
    years: base.years,
    perpetuity: base.perpetuity,
    exitMultiple: base.exitMultiple,
    netDebt,
    sharesOutstanding: shares,
    currentSharePrice: currentPrice,
    sensitivity: {
      perpetuity: { waccPct: waccAxis, growthPct: growthAxis, cells: perpetuityGrid },
      exitMultiple: { waccPct: waccAxis, multiples: multipleAxis, cells: exitGrid }
    }
  };

  const evP = base.perpetuity ? base.perpetuity.enterpriseValue : null;
  const evX = base.exitMultiple.enterpriseValue;
  const summary = `${forecast.length}yr DCF @ WACC ${A.waccPct}%: EV ${evP !== null ? evP.toFixed(1) : 'n/a'} (perpetuity ${A.terminalGrowthPct}%) / ${evX.toFixed(1)} (${A.exitEbitdaMultiple}x exit)`;

  return buildResult({ method: id, name, warnings, assumptionsUsed: A, outputs, summary });
}

/**
 * Driver-based forecast builder: turns a base year plus per-year driver
 * arrays into the explicit forecast rows run() consumes. This is the
 * "Company forecasts" layer of the workbook — the AI/DD data suggests
 * drivers, the analyst edits them, the engine does the arithmetic.
 *
 * @param {{ revenue: number, startYearLabel?: string }} base  last historical year
 * @param {{ revenueGrowthPct: number[], ebitdaMarginPct: number[], daPctOfRevenue: number[], capexPctOfRevenue: number[], nwcChangePctOfRevenue: number[], otherCashflows?: number[], exceptionals?: number[], taxRatePct: number[] }} drivers
 *   Arrays must share one length (the forecast horizon). Percent drivers are
 *   positive numbers; the builder applies workbook sign conventions.
 * @returns {DcfYearInput[]}
 */
export function buildForecast(base, drivers) {
  const n = drivers.revenueGrowthPct.length;
  const rows = [];
  let revenue = base.revenue;
  const startYear = base.startYearLabel ? parseInt(String(base.startYearLabel).replace(/\D/g, ''), 10) : NaN;
  for (let i = 0; i < n; i++) {
    revenue = revenue * (1 + (drivers.revenueGrowthPct[i] ?? 0) / 100);
    const label = isFinite(startYear) ? `FY${startYear + i + 1}` : `Y${i + 1}`;
    rows.push({
      label,
      revenue,
      ebitda: revenue * ((drivers.ebitdaMarginPct[i] ?? 0) / 100),
      d_and_a: -revenue * ((drivers.daPctOfRevenue[i] ?? 0) / 100),
      capex: -revenue * ((drivers.capexPctOfRevenue[i] ?? 0) / 100),
      nwc_change: revenue * ((drivers.nwcChangePctOfRevenue[i] ?? 0) / 100),
      other_cashflows: drivers.otherCashflows?.[i] ?? 0,
      exceptionals: drivers.exceptionals?.[i] ?? 0,
      tax_rate_pct: drivers.taxRatePct[i] ?? 0
    });
  }
  return rows;
}

/**
 * Linear taper helper for seeding driver arrays: n values from start to end.
 * @param {number} start @param {number} end @param {number} n
 * @returns {number[]}
 */
export function taper(start, end, n) {
  if (n <= 1) return [end];
  return Array.from({ length: n }, (_, i) => start + ((end - start) * i) / (n - 1));
}
