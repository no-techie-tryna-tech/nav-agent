// @ts-check
// Financial due diligence method: per-period QoE bridge, margins, growth,
// working capital day metrics, and free cash flow — computed deterministically
// from Agent 2's extracted line items.

import { at, div, pct, add, cagrPct, growthPct } from '../core/series.js';
import { inferPeriodType, periodDays } from '../core/periods.js';
import { validateFinancialDD } from '../core/validate.js';
import { buildResult } from '../core/result.js';

export const id = 'financial-dd';
export const name = 'Financial Due Diligence';

/** @type {import('../core/types.js').AssumptionDef[]} */
export const assumptionDefs = [];

/**
 * @param {any} inputs  Agent 2 extraction output (see engine/core/schema.js)
 * @param {Object<string, any>} [_overrides]  (no assumptions yet)
 * @returns {import('../core/types.js').MethodResult}
 */
export function run(inputs, _overrides = {}) {
  const v = validateFinancialDD(inputs);
  if (!v.ok) {
    return buildResult({ method: id, name, errors: v.errors, warnings: v.warnings, summary: 'Input rejected.' });
  }

  const warnings = [...v.warnings];
  /** @type {string[]} */
  const periods = inputs.periods;
  const is = inputs.income_statement || {};
  const bs = inputs.balance_sheet || {};
  const cf = inputs.cash_flow || {};
  const addbacks = Array.isArray(inputs.addbacks) ? inputs.addbacks : [];

  const { type: periodType, mixed } = inferPeriodType(periods);
  if (mixed) warnings.push('Period labels are mixed (e.g. annual + quarterly) — day metrics assume 365-day periods; verify DSO/DPO/DIO.');
  else if (periodType === 'unknown') warnings.push(`Could not classify period labels (${periods.join(', ')}) — day metrics assume 365-day periods.`);
  const days = periodDays(periodType);

  const normPeriod = (/** @type {any} */ p) => String(p ?? '').trim().toLowerCase();

  const perPeriod = periods.map((period, i) => {
    const revenue = at(is.revenue, i);
    const cogs = at(is.cogs, i);
    const grossProfit = at(is.gross_profit, i) ?? (revenue !== null && cogs !== null ? revenue - cogs : null);
    const opex = at(is.opex, i);
    const ebitdaReported = at(is.ebitda_reported, i);
    const netIncome = at(is.net_income, i);

    const periodAddbacks = addbacks.filter((a) => a && normPeriod(a.period) === normPeriod(period));
    const addbacksTotal = periodAddbacks.reduce((sum, a) => sum + (typeof a.amount === 'number' && isFinite(a.amount) ? a.amount : 0), 0);
    const ebitdaAdjusted = ebitdaReported !== null ? ebitdaReported + addbacksTotal : null;
    if (ebitdaReported === null && periodAddbacks.length > 0) {
      warnings.push(`${period}: add-backs exist but reported EBITDA is missing — adjusted EBITDA cannot be computed for this period.`);
    }

    const ar = at(bs.accounts_receivable, i);
    const inventory = at(bs.inventory, i);
    const ap = at(bs.accounts_payable, i);
    const cash = at(bs.cash, i);
    const totalDebt = at(bs.total_debt, i);
    const netDebt = totalDebt !== null && cash !== null ? totalDebt - cash : null;
    const da = at(is.d_and_a, i);
    const nwc = ar !== null && inventory !== null && ap !== null ? ar + inventory - ap : null;

    const dso = div(ar, revenue) !== null ? /** @type {number} */ (div(ar, revenue)) * days : null;
    const dpo = div(ap, cogs) !== null ? /** @type {number} */ (div(ap, cogs)) * days : null;
    const dio = div(inventory, cogs) !== null ? /** @type {number} */ (div(inventory, cogs)) * days : null;
    const ccc = dso !== null && dio !== null && dpo !== null ? dso + dio - dpo : null;

    const ocf = at(cf.operating_cash_flow, i);
    const capex = at(cf.capex, i);
    const fcf = ocf !== null && capex !== null ? ocf - capex : null;

    return {
      period, revenue, cogs, grossProfit, grossMarginPct: pct(grossProfit, revenue),
      opex, ebitdaReported, ebitdaMarginPct: pct(ebitdaReported, revenue),
      addbacksTotal, ebitdaAdjusted, adjustedEbitdaMarginPct: pct(ebitdaAdjusted, revenue),
      netIncome, netMarginPct: pct(netIncome, revenue),
      revenueGrowthPct: growthPct(is.revenue || [], i),
      da, daPctOfRevenue: pct(da, revenue),
      ar, inventory, ap, cash, totalDebt, netDebt, nwc,
      dso, dpo, dio, cashConversionCycle: ccc,
      ocf, capex, fcf, fcfMarginPct: pct(fcf, revenue),
      addbacks: periodAddbacks
    };
  });

  const revenueSeries = perPeriod.map((p) => p.revenue);
  const revenueCagrPct = cagrPct(revenueSeries);
  const nullGaps = revenueSeries.some((r, i) => r === null && i > 0 && i < revenueSeries.length - 1);
  if (revenueCagrPct !== null && nullGaps) {
    warnings.push('Revenue CAGR computed across periods with missing values in between — treat as approximate.');
  }

  const outputs = {
    currency: typeof inputs.currency === 'string' ? inputs.currency : 'USD',
    periods,
    perPeriod,
    revenueCagrPct,
    customerConcentration: inputs.customer_concentration || null,
    notes: Array.isArray(inputs.notes) ? inputs.notes : []
  };

  const summary = `${periods.length} ${periodType === 'unknown' ? 'period' : periodType} period(s)` +
    (revenueCagrPct !== null ? `, revenue CAGR ${revenueCagrPct.toFixed(1)}%` : '') +
    (warnings.length ? `, ${warnings.length} data warning(s)` : '');

  return buildResult({
    method: id, name, warnings, outputs, summary,
    intermediates: { periodType, periodDaysUsed: days }
  });
}
