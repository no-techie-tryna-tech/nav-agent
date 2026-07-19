// @ts-check
// Assumption registry: every method declares its assumptions as metadata
// (AssumptionDef) and the engine resolves user overrides against them —
// defaulting, coercing, and clamping with warnings. UI sliders, scenario
// presets, and future sensitivity tooling all read the same metadata.

/** @typedef {import('./types.js').AssumptionDef} AssumptionDef */

/**
 * Resolve override values against a method's assumption definitions.
 * @param {AssumptionDef[]} defs
 * @param {Object<string, any>} [overrides]
 * @returns {{ values: Object<string, number>, warnings: string[] }}
 */
export function resolveAssumptions(defs, overrides = {}) {
  /** @type {Object<string, number>} */
  const values = {};
  /** @type {string[]} */
  const warnings = [];

  for (const def of defs) {
    let v = overrides[def.key];
    if (v === undefined || v === null) {
      values[def.key] = def.default;
      continue;
    }
    v = Number(v);
    if (!isFinite(v)) {
      warnings.push(`Assumption "${def.name}": "${overrides[def.key]}" is not a number — default ${def.default}${def.unit} used.`);
      values[def.key] = def.default;
      continue;
    }
    if (v < def.min || v > def.max) {
      const clamped = Math.min(def.max, Math.max(def.min, v));
      warnings.push(`Assumption "${def.name}": ${v}${def.unit} is outside [${def.min}, ${def.max}] — clamped to ${clamped}${def.unit}.`);
      v = clamped;
    }
    values[def.key] = v;
  }

  for (const key of Object.keys(overrides)) {
    if (!defs.some((d) => d.key === key)) {
      warnings.push(`Unknown assumption "${key}" ignored (valid: ${defs.map((d) => d.key).join(', ')}).`);
    }
  }

  return { values, warnings };
}
