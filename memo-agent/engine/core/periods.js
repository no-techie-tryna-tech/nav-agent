// @ts-check
// Period model. Working-capital day metrics (DSO/DPO/DIO) depend on how long
// a reporting period is, so the engine infers the period type from the labels
// instead of silently assuming annual.

/** @typedef {import('./types.js').PeriodType} PeriodType */

const QUARTER_RE = /(^|[^a-z0-9])q[1-4]([^a-z0-9]|$)/i;
const LTM_RE = /\b(ltm|ttm)\b/i;
const MONTH_RE = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s'-]?\d{2,4}$|^\d{4}-(0[1-9]|1[0-2])$/i;
const ANNUAL_RE = /^(fy|cy)?\s*'?\d{2,4}[a-z]?$/i;

/**
 * Classify a single period label.
 * @param {string} label
 * @returns {PeriodType}
 */
export function classifyPeriodLabel(label) {
  const s = String(label).trim();
  if (QUARTER_RE.test(s)) return 'quarterly';
  if (LTM_RE.test(s)) return 'ltm';
  if (MONTH_RE.test(s)) return 'monthly';
  if (ANNUAL_RE.test(s)) return 'annual';
  return 'unknown';
}

/**
 * Infer the period type for a whole series of labels.
 * Returns the consistent type, or 'unknown' when labels are mixed/unrecognized
 * (callers should warn and fall back to annual day counts).
 * @param {string[]} labels
 * @returns {{ type: PeriodType, mixed: boolean }}
 */
export function inferPeriodType(labels) {
  if (!Array.isArray(labels) || labels.length === 0) return { type: 'unknown', mixed: false };
  const types = labels.map(classifyPeriodLabel);
  const distinct = [...new Set(types)];
  if (distinct.length === 1) return { type: distinct[0], mixed: false };
  // LTM alongside annual labels is a common, coherent combination — treat the
  // series as annual-basis but report mixed so the caller can warn.
  return { type: 'unknown', mixed: true };
}

/**
 * Days in one period of the given type, for converting balance/flow ratios
 * into day metrics. Unknown falls back to annual (365) — callers must have
 * warned already via inferPeriodType.
 * @param {PeriodType} type
 * @returns {number}
 */
export function periodDays(type) {
  switch (type) {
    case 'quarterly': return 91;
    case 'monthly': return 30;
    case 'ltm': return 365;
    case 'annual': return 365;
    default: return 365;
  }
}
