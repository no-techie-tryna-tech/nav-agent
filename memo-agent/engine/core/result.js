// @ts-check
// The standardized MethodResult envelope. Every valuation method returns this
// shape; every consumer (web UI, CLI, memo pipeline, future charts/dashboards)
// reads only this shape. Deliberately free of timestamps so identical inputs
// always produce byte-identical results (referential transparency aids
// testing, caching, and audit).

/** @typedef {import('./types.js').MethodResult} MethodResult */

/**
 * @param {Object} p
 * @param {string} p.method
 * @param {string} p.name
 * @param {boolean} [p.ok]
 * @param {string[]} [p.errors]
 * @param {string[]} [p.warnings]
 * @param {Object<string, number>} [p.assumptionsUsed]
 * @param {any} [p.outputs]
 * @param {Object<string, any>} [p.intermediates]
 * @param {string} [p.summary]
 * @returns {MethodResult}
 */
export function buildResult({ method, name, ok = true, errors = [], warnings = [], assumptionsUsed = {}, outputs = null, intermediates = {}, summary = '' }) {
  return {
    schemaVersion: 1,
    method,
    name,
    ok: ok && errors.length === 0,
    errors,
    warnings,
    assumptionsUsed,
    outputs: errors.length === 0 ? outputs : null,
    intermediates,
    summary
  };
}
