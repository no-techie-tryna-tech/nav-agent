// @ts-check
// Input validation for engine methods. Errors block computation; warnings are
// data-quality notes that always travel with the result. The goal is that a
// user can always answer "why is this number missing?" from the result alone.

/**
 * @typedef {{ ok: boolean, errors: string[], warnings: string[] }} Validation
 */

/** @returns {Validation} */
function base() {
  return { ok: true, errors: [], warnings: [] };
}

/**
 * @param {Validation} v
 * @param {string} msg
 */
function fail(v, msg) {
  v.ok = false;
  v.errors.push(msg);
}

/**
 * Check one statement section's series arrays against the period count.
 * Length mismatches are warnings (positional math still works; missing tail
 * entries read as null), non-array values are warnings and read as all-null.
 * @param {Validation} v
 * @param {string} section
 * @param {Object<string, any>|undefined} obj
 * @param {number} periodCount
 */
function checkSeriesSection(v, section, obj, periodCount) {
  if (obj === undefined || obj === null) return;
  if (typeof obj !== 'object') {
    v.warnings.push(`${section}: expected an object of series arrays; got ${typeof obj} — ignored.`);
    return;
  }
  for (const [key, series] of Object.entries(obj)) {
    if (series === null || series === undefined) continue;
    if (!Array.isArray(series)) {
      v.warnings.push(`${section}.${key}: expected an array; got ${typeof series} — treated as no data.`);
      continue;
    }
    if (series.length !== periodCount) {
      v.warnings.push(`${section}.${key}: ${series.length} values for ${periodCount} periods — positions beyond the shorter length read as missing.`);
    }
    series.forEach((entry, i) => {
      if (entry !== null && (typeof entry !== 'number' || !isFinite(entry))) {
        v.warnings.push(`${section}.${key}[${i}]: "${entry}" is not a number — treated as missing.`);
      }
    });
  }
}

/**
 * Validate financial-dd inputs (the Agent 2 extraction schema).
 * @param {any} raw
 * @returns {Validation}
 */
export function validateFinancialDD(raw) {
  const v = base();
  if (raw === null || raw === undefined || typeof raw !== 'object') {
    fail(v, 'Input is not an object.');
    return v;
  }
  const periods = raw.periods;
  if (!Array.isArray(periods) || periods.length === 0) {
    fail(v, 'periods must be a non-empty array of labels (e.g. ["FY2023","FY2024"]).');
    return v;
  }
  periods.forEach((p, i) => {
    if (typeof p !== 'string' || !p.trim()) fail(v, `periods[${i}] must be a non-empty string.`);
  });
  if (!v.ok) return v;

  if (raw.currency !== undefined && typeof raw.currency !== 'string') {
    v.warnings.push('currency should be a string; defaulting to USD.');
  }

  checkSeriesSection(v, 'income_statement', raw.income_statement, periods.length);
  checkSeriesSection(v, 'balance_sheet', raw.balance_sheet, periods.length);
  checkSeriesSection(v, 'cash_flow', raw.cash_flow, periods.length);

  if (raw.addbacks !== undefined && raw.addbacks !== null) {
    if (!Array.isArray(raw.addbacks)) {
      v.warnings.push('addbacks: expected an array — ignored.');
    } else {
      const normalized = periods.map((p) => String(p).trim().toLowerCase());
      raw.addbacks.forEach((a, i) => {
        if (!a || typeof a !== 'object') {
          v.warnings.push(`addbacks[${i}]: not an object — ignored.`);
          return;
        }
        if (typeof a.amount !== 'number' || !isFinite(a.amount)) {
          v.warnings.push(`addbacks[${i}] ("${a.label ?? '?'}"): amount is not a number — ignored.`);
        }
        const idx = normalized.indexOf(String(a.period ?? '').trim().toLowerCase());
        if (idx === -1) {
          v.warnings.push(`addbacks[${i}] ("${a.label ?? '?'}"): period "${a.period}" matches no reported period — this add-back will NOT be applied.`);
        }
      });
    }
  }
  return v;
}

/**
 * Validate market-sizing inputs (the Agent 3 output schema).
 * @param {any} raw
 * @returns {Validation}
 */
export function validateMarketSizing(raw) {
  const v = base();
  if (raw === null || raw === undefined || typeof raw !== 'object') {
    fail(v, 'Input is not an object.');
    return v;
  }
  const tamValue = raw.tam && typeof raw.tam === 'object' ? raw.tam.value : undefined;
  if (typeof tamValue !== 'number' || !isFinite(tamValue) || tamValue <= 0) {
    fail(v, 'tam.value must be a positive number — the whole funnel derives from it.');
  }
  for (const [key, val] of [['sam.pct_of_tam', raw.sam?.pct_of_tam], ['som.pct_of_sam', raw.som?.pct_of_sam], ['market_growth_rate_pct', raw.market_growth_rate_pct]]) {
    if (val !== undefined && val !== null && (typeof val !== 'number' || !isFinite(val))) {
      v.warnings.push(`${key}: "${val}" is not a number — default assumption used instead.`);
    }
  }
  return v;
}
