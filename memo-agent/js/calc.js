// @ts-check
// DEPRECATED compatibility shim. The math now lives in memo-agent/engine/
// (see engine/index.js for the method registry). This module preserves the
// original function signatures for older callers; new code should use:
//   import { getMethod } from '../engine/index.js';
//   getMethod('financial-dd').run(inputs)

import { getMethod } from '../engine/index.js';

/**
 * @param {any} raw  Agent 2 extraction output
 * @returns {any}    Legacy computed shape, or null on invalid input
 */
export function computeFinancials(raw) {
  if (!raw) return null;
  const result = getMethod('financial-dd').run(raw);
  return result.ok ? result.outputs : null;
}

/**
 * @param {any} step3Output  Agent 3 output
 * @returns {{samPct: number, somPct: number, growthPct: number, years: number}}
 */
export function defaultAssumptionsFromStep3(step3Output) {
  const m = getMethod('market-sizing');
  /** @type {Object<string, number>} */
  const base = {};
  for (const def of m.assumptionDefs) base[def.key] = def.default;
  // @ts-ignore - defaultsFrom is method-specific, present on market-sizing
  const derived = m.defaultsFrom ? m.defaultsFrom(step3Output) : {};
  return /** @type {any} */ ({ ...base, ...derived });
}

/**
 * @param {any} step3Output  Agent 3 output
 * @param {Object<string, any>} assumptions
 * @returns {any}  Legacy computed shape, or null on invalid input
 */
export function computeMarketSizing(step3Output, assumptions) {
  if (!step3Output || !step3Output.tam) return null;
  const result = getMethod('market-sizing').run(step3Output, assumptions);
  return result.ok ? result.outputs : null;
}
