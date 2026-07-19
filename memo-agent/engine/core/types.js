// @ts-check
// Shared JSDoc type definitions for the valuation engine.
// This file has no runtime exports beyond an empty object; it exists so every
// engine module can reference one set of types via @typedef imports.

/**
 * @typedef {Object} AssumptionDef
 * @property {string} key           Stable identifier used in override maps
 * @property {string} name          Human-readable label (UI slider/form label)
 * @property {string} category      Grouping for UI/scenario tooling (e.g. "sizing")
 * @property {number} default       Default value when no override is given
 * @property {number} min           Hard lower bound (values are clamped)
 * @property {number} max           Hard upper bound (values are clamped)
 * @property {number} [step]        Suggested UI increment
 * @property {string} unit          Display unit ("%", "yr", "x", "USD")
 * @property {string} description  Tooltip / help text
 */

/**
 * @typedef {Object} MethodResult
 * @property {1} schemaVersion         Envelope version for stored-result migration
 * @property {string} method           Method id (e.g. "financial-dd")
 * @property {string} name             Human-readable method name
 * @property {boolean} ok              False when input errors prevented computation
 * @property {string[]} errors         Input problems that blocked computation
 * @property {string[]} warnings       Non-fatal data-quality notes (always shown to users)
 * @property {Object<string, number>} assumptionsUsed  Resolved assumption values (post-clamp)
 * @property {any} outputs             Method-specific computed outputs (null when !ok)
 * @property {Object<string, any>} intermediates       Intermediate values worth exposing
 * @property {string} summary          One-line human summary of the computation
 */

/**
 * @typedef {'annual'|'quarterly'|'monthly'|'ltm'|'unknown'} PeriodType
 */

export {};
