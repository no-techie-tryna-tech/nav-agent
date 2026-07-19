// @ts-check
// Market sizing method: TAM → SAM → SOM funnel plus an obtainable-revenue
// growth projection, driven entirely by editable assumptions.

import { resolveAssumptions } from '../core/assumptions.js';
import { validateMarketSizing } from '../core/validate.js';
import { buildResult } from '../core/result.js';

export const id = 'market-sizing';
export const name = 'Market Sizing (TAM/SAM/SOM)';

/** @type {import('../core/types.js').AssumptionDef[]} */
export const assumptionDefs = [
  { key: 'samPct', name: 'SAM as % of TAM', category: 'sizing', default: 20, min: 1, max: 100, step: 1, unit: '%', description: 'Share of the total addressable market that is serviceable given geography, segment, and product scope.' },
  { key: 'somPct', name: 'SOM as % of SAM', category: 'sizing', default: 10, min: 1, max: 100, step: 1, unit: '%', description: 'Share of the serviceable market realistically obtainable given competition and sales capacity.' },
  { key: 'growthPct', name: 'Annual growth rate', category: 'projection', default: 15, min: 0, max: 100, step: 1, unit: '%', description: 'Annual growth applied to the obtainable market in the projection.' },
  { key: 'years', name: 'Projection years', category: 'projection', default: 5, min: 1, max: 10, step: 1, unit: '', description: 'Number of years to project the obtainable revenue forward.' }
];

/**
 * Derive assumption defaults from the market-sizing agent's own analysis, so
 * sliders start where the AI's reasoning landed rather than at generic values.
 * @param {any} inputs
 * @returns {Object<string, number>}
 */
export function defaultsFrom(inputs) {
  /** @type {Object<string, number>} */
  const d = {};
  if (inputs && typeof inputs === 'object') {
    if (typeof inputs.sam?.pct_of_tam === 'number' && isFinite(inputs.sam.pct_of_tam)) d.samPct = inputs.sam.pct_of_tam;
    if (typeof inputs.som?.pct_of_sam === 'number' && isFinite(inputs.som.pct_of_sam)) d.somPct = inputs.som.pct_of_sam;
    if (typeof inputs.market_growth_rate_pct === 'number' && isFinite(inputs.market_growth_rate_pct)) d.growthPct = inputs.market_growth_rate_pct;
  }
  return d;
}

/**
 * @param {any} inputs  Agent 3 output (see engine/core/schema.js)
 * @param {Object<string, any>} [overrides]  User assumption overrides
 * @returns {import('../core/types.js').MethodResult}
 */
export function run(inputs, overrides = {}) {
  const v = validateMarketSizing(inputs);
  if (!v.ok) {
    return buildResult({ method: id, name, errors: v.errors, warnings: v.warnings, summary: 'Input rejected.' });
  }

  const { values: a, warnings: aWarnings } = resolveAssumptions(assumptionDefs, { ...defaultsFrom(inputs), ...overrides });
  const warnings = [...v.warnings, ...aWarnings];

  const tamValue = inputs.tam.value;
  const samValue = tamValue * (a.samPct / 100);
  const somValue = samValue * (a.somPct / 100);
  const growth = a.growthPct / 100;

  const projection = [];
  for (let y = 1; y <= a.years; y++) {
    projection.push({ year: y, obtainableValue: somValue * Math.pow(1 + growth, y) });
  }

  const unit = (inputs.tam && inputs.tam.unit) || 'USD';
  const outputs = { tamValue, samValue, somValue, unit, projection };

  return buildResult({
    method: id, name, warnings, assumptionsUsed: a, outputs,
    summary: `TAM ${tamValue.toExponential(2)} ${unit} → SAM ${a.samPct}% → SOM ${a.somPct}%, ${a.years}yr @ ${a.growthPct}%/yr`,
    intermediates: { derivedDefaults: defaultsFrom(inputs) }
  });
}
