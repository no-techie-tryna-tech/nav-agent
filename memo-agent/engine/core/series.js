// @ts-check
// Null-safe numeric series helpers. The rule everywhere: a missing or invalid
// value is null, and null propagates — the engine never turns absence of data
// into a fabricated number.

/**
 * Coerce to a finite number or null.
 * @param {any} v
 * @returns {number|null}
 */
export function toNum(v) {
  return typeof v === 'number' && isFinite(v) ? v : null;
}

/**
 * Positional read from a series array.
 * @param {any} arr
 * @param {number} i
 * @returns {number|null}
 */
export function at(arr, i) {
  return Array.isArray(arr) ? toNum(arr[i]) : null;
}

/**
 * Null-safe division; null on divide-by-zero.
 * @param {number|null} a
 * @param {number|null} b
 * @returns {number|null}
 */
export function div(a, b) {
  if (a === null || b === null || b === 0) return null;
  return a / b;
}

/**
 * Null-safe percentage (a/b * 100).
 * @param {number|null} a
 * @param {number|null} b
 * @returns {number|null}
 */
export function pct(a, b) {
  const r = div(a, b);
  return r === null ? null : r * 100;
}

/**
 * Null-safe sum of two values where either side may be absent.
 * Unlike arithmetic elsewhere, absence of ONE side yields null (we cannot
 * claim a total when a component is unknown).
 * @param {number|null} a
 * @param {number|null} b
 * @returns {number|null}
 */
export function add(a, b) {
  if (a === null || b === null) return null;
  return a + b;
}

/**
 * Compound annual growth rate (%) across the non-null values of a series.
 * Matches the legacy behavior exactly: first and last non-null values, with
 * n = (count of non-null values) - 1. When null gaps exist between them the
 * caller should attach a warning — this function stays silent-but-correct to
 * its contract.
 * @param {(number|null)[]} values
 * @returns {number|null}
 */
export function cagrPct(values) {
  const present = values.filter((v) => v !== null);
  if (present.length < 2) return null;
  const first = present[0];
  const last = present[present.length - 1];
  if (first === null || last === null || first <= 0) return null;
  const n = present.length - 1;
  return (Math.pow(last / first, 1 / n) - 1) * 100;
}

/**
 * Period-over-period growth (%) at index i of a series.
 * @param {(number|null)[]} values
 * @param {number} i
 * @returns {number|null}
 */
export function growthPct(values, i) {
  if (i <= 0) return null;
  const cur = toNum(values[i]);
  const prev = toNum(values[i - 1]);
  if (cur === null || prev === null) return null;
  return pct(cur - prev, prev);
}
