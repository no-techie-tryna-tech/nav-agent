function at(arr, i) {
  if (!Array.isArray(arr)) return null;
  const v = arr[i];
  return typeof v === 'number' && isFinite(v) ? v : null;
}

function div(a, b) {
  if (a === null || b === null || b === 0) return null;
  return a / b;
}

function pct(a, b) {
  const r = div(a, b);
  return r === null ? null : r * 100;
}

export function computeFinancials(raw) {
  if (!raw) return null;
  const periods = raw.periods || [];
  const is = raw.income_statement || {};
  const bs = raw.balance_sheet || {};
  const cf = raw.cash_flow || {};
  const addbacks = raw.addbacks || [];

  const perPeriod = periods.map((period, i) => {
    const revenue = at(is.revenue, i);
    const cogs = at(is.cogs, i);
    const grossProfit = at(is.gross_profit, i) ?? (revenue !== null && cogs !== null ? revenue - cogs : null);
    const opex = at(is.opex, i);
    const ebitdaReported = at(is.ebitda_reported, i);
    const netIncome = at(is.net_income, i);

    const periodAddbacks = addbacks.filter((a) => a.period === period);
    const addbacksTotal = periodAddbacks.reduce((sum, a) => sum + (typeof a.amount === 'number' ? a.amount : 0), 0);
    const ebitdaAdjusted = ebitdaReported !== null ? ebitdaReported + addbacksTotal : null;

    const prevRevenue = i > 0 ? at(is.revenue, i - 1) : null;
    const revenueGrowthPct = prevRevenue !== null ? pct(revenue - prevRevenue, prevRevenue) : null;

    const ar = at(bs.accounts_receivable, i);
    const inventory = at(bs.inventory, i);
    const ap = at(bs.accounts_payable, i);
    const cash = at(bs.cash, i);
    const nwc = ar !== null && inventory !== null && ap !== null ? ar + inventory - ap : null;

    const dso = div(ar, revenue) !== null ? div(ar, revenue) * 365 : null;
    const dpo = div(ap, cogs) !== null ? div(ap, cogs) * 365 : null;
    const dio = div(inventory, cogs) !== null ? div(inventory, cogs) * 365 : null;
    const ccc = dso !== null && dio !== null && dpo !== null ? dso + dio - dpo : null;

    const ocf = at(cf.operating_cash_flow, i);
    const capex = at(cf.capex, i);
    const fcf = ocf !== null && capex !== null ? ocf - capex : null;

    return {
      period, revenue, cogs, grossProfit, grossMarginPct: pct(grossProfit, revenue),
      opex, ebitdaReported, ebitdaMarginPct: pct(ebitdaReported, revenue),
      addbacksTotal, ebitdaAdjusted, adjustedEbitdaMarginPct: pct(ebitdaAdjusted, revenue),
      netIncome, netMarginPct: pct(netIncome, revenue), revenueGrowthPct,
      ar, inventory, ap, cash, nwc,
      dso, dpo, dio, cashConversionCycle: ccc,
      ocf, capex, fcf, fcfMarginPct: pct(fcf, revenue),
      addbacks: periodAddbacks
    };
  });

  let revenueCagrPct = null;
  const firstRev = perPeriod.find((p) => p.revenue !== null)?.revenue ?? null;
  const validRevPeriods = perPeriod.filter((p) => p.revenue !== null);
  const lastRev = validRevPeriods.length ? validRevPeriods[validRevPeriods.length - 1].revenue : null;
  if (firstRev !== null && lastRev !== null && firstRev > 0 && validRevPeriods.length > 1) {
    const n = validRevPeriods.length - 1;
    revenueCagrPct = (Math.pow(lastRev / firstRev, 1 / n) - 1) * 100;
  }

  return {
    currency: raw.currency || 'USD',
    periods,
    perPeriod,
    revenueCagrPct,
    customerConcentration: raw.customer_concentration || null,
    notes: raw.notes || []
  };
}

export function defaultAssumptionsFromStep3(step3Output) {
  const a = {
    samPct: 20,
    somPct: 10,
    growthPct: 15,
    years: 5
  };
  if (!step3Output) return a;
  if (typeof step3Output.sam?.pct_of_tam === 'number') a.samPct = step3Output.sam.pct_of_tam;
  if (typeof step3Output.som?.pct_of_sam === 'number') a.somPct = step3Output.som.pct_of_sam;
  if (typeof step3Output.market_growth_rate_pct === 'number') a.growthPct = step3Output.market_growth_rate_pct;
  return a;
}

export function computeMarketSizing(step3Output, assumptions) {
  if (!step3Output || !step3Output.tam) return null;
  const tamValue = step3Output.tam.value || 0;
  const samValue = tamValue * (assumptions.samPct / 100);
  const somValue = samValue * (assumptions.somPct / 100);
  const growth = assumptions.growthPct / 100;
  const years = assumptions.years || 5;

  const projection = [];
  for (let y = 1; y <= years; y++) {
    projection.push({ year: y, obtainableValue: somValue * Math.pow(1 + growth, y) });
  }

  return { tamValue, samValue, somValue, unit: step3Output.tam.unit || 'USD', projection };
}
