// @ts-check
// Method registry: the single entry point consumers use. Every valuation
// methodology (financial DD, market sizing, DCF, comps, ...) registers here
// and exposes the same interface: { id, name, assumptionDefs, run }.

import * as financialDD from './methods/financial-dd.js';
import * as marketSizing from './methods/market-sizing.js';

/**
 * The interface every valuation method module implements.
 * @typedef {Object} MethodModule
 * @property {string} id
 * @property {string} name
 * @property {import('./core/types.js').AssumptionDef[]} assumptionDefs
 * @property {(inputs: any, overrides?: Object<string, any>) => import('./core/types.js').MethodResult} run
 * @property {(inputs: any) => Object<string, number>} [defaultsFrom]  Optional: derive assumption defaults from method inputs
 */

/** @type {Map<string, MethodModule>} */
const methods = new Map();
for (const m of [financialDD, marketSizing]) methods.set(m.id, m);

/**
 * @param {string} id
 * @returns {MethodModule}
 */
export function getMethod(id) {
  const m = methods.get(id);
  if (!m) throw new Error(`Unknown method "${id}". Available: ${[...methods.keys()].join(', ')}`);
  return m;
}

/** @returns {{ id: string, name: string }[]} */
export function listMethods() {
  return [...methods.values()].map((m) => ({ id: m.id, name: m.name }));
}
