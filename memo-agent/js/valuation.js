// Valuation Workbench: automates the reference DCF workbook. Layout mirrors
// its tabs — Assumptions, Financials (historical), Company forecasts
// (drivers), DCF input (computed FCF build), DCF output (EV bridges +
// sensitivity). All math runs in memo-agent/engine (deterministic); this file
// only manages state and rendering.

import { loadProject, saveProject } from './storage.js';
import { getMethod } from '../engine/index.js';
import { buildForecast, taper } from '../engine/methods/dcf.js';
import { fmtMoney, fmtPct } from './render.js';

const dcf = getMethod('dcf');
const financialDD = getMethod('financial-dd');

const project = loadProject();
const ddResult = project.step2?.output ? financialDD.run(project.step2.output) : null;
const dd = ddResult && ddResult.ok ? ddResult.outputs : null;

const DRIVER_ROWS = [
  { key: 'revenueGrowthPct', label: 'Revenue growth', unit: '%' },
  { key: 'ebitdaMarginPct', label: 'EBITDA margin', unit: '%' },
  { key: 'daPctOfRevenue', label: 'D&A % of revenue', unit: '%' },
  { key: 'capexPctOfRevenue', label: 'Capex % of revenue', unit: '%' },
  { key: 'nwcChangePctOfRevenue', label: 'ΔNWC % of revenue (+inflow)', unit: '%' },
  { key: 'otherCashflows', label: 'Other cash flows (abs, −out)', unit: '' },
  { key: 'exceptionals', label: 'Exceptionals (abs, −out)', unit: '' },
  { key: 'taxRatePct', label: 'Tax rate', unit: '%' }
];

function lastNonNull(arr) {
  if (!arr) return null;
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i] !== null && arr[i] !== undefined) return arr[i];
  return null;
}

function round2(v) { return v === null || v === undefined ? 0 : Math.round(v * 100) / 100; }

// Seed the workbench from Financial DD data (or blank defaults without it).
function seedValuation(years) {
  const n = years || 10;
  const last = dd ? dd.perPeriod[dd.perPeriod.length - 1] : null;
  const baseRevenue = last?.revenue ?? 100;
  const lastGrowth = round2(last?.revenueGrowthPct ?? (dd?.revenueCagrPct ?? 8));
  const startGrowth = Math.max(-20, Math.min(40, lastGrowth || 8));
  const margin = round2(last?.adjustedEbitdaMarginPct ?? last?.ebitdaMarginPct ?? 20);
  const daPct = round2(last?.daPctOfRevenue ?? (last?.capex !== null && last?.capex !== undefined && last?.revenue ? Math.abs(last.capex) / last.revenue * 95 : 4));
  const capexPct = round2(last?.capex !== null && last?.capex !== undefined && last?.revenue ? Math.abs(last.capex) / last.revenue * 100 : 4);
  const nwcPct = 0;
  const netDebt = round2(lastNonNull(dd?.perPeriod.map((p) => p.netDebt)) ?? 0);
  const labelDigits = String(last?.period ?? '').replace(/\D/g, '');

  return {
    settings: { forecastYears: n },
    base: {
      revenue: round2(baseRevenue),
      yearLabel: labelDigits ? `FY${labelDigits.slice(-4).length === 4 ? labelDigits.slice(-4) : labelDigits}` : 'FY0',
      currency: dd?.currency ?? 'USD'
    },
    bridge: { netDebt, sharesOutstanding: null, currentSharePrice: null },
    assumptions: { waccPct: 8.5, terminalGrowthPct: 2.0, exitEbitdaMultiple: 8.0 },
    drivers: {
      revenueGrowthPct: taper(startGrowth, 2, n).map(round2),
      ebitdaMarginPct: taper(margin, margin, n).map(round2),
      daPctOfRevenue: taper(daPct, daPct, n).map(round2),
      capexPctOfRevenue: taper(capexPct, capexPct, n).map(round2),
      nwcChangePctOfRevenue: taper(nwcPct, nwcPct, n).map(round2),
      otherCashflows: Array(n).fill(0),
      exceptionals: Array(n).fill(0),
      taxRatePct: Array(n).fill(25)
    },
    seededFromDD: !!dd
  };
}

let val = project.valuation && project.valuation.drivers ? project.valuation : seedValuation();

function persist() {
  project.valuation = val;
  saveProject(project);
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2200);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function num(v) { const x = Number(v); return isFinite(x) ? x : 0; }

function runModel() {
  const forecast = buildForecast(
    { revenue: val.base.revenue, startYearLabel: val.base.yearLabel },
    val.drivers
  );
  const inputs = {
    currency: val.base.currency,
    forecast,
    net_debt: val.bridge.netDebt ?? 0,
    shares_outstanding: val.bridge.sharesOutstanding,
    current_share_price: val.bridge.currentSharePrice
  };
  return dcf.run(inputs, val.assumptions);
}

// ---------- section renderers ----------

function assumptionsSection() {
  const items = [
    ['base.revenue', 'Base year revenue (' + esc(val.base.currency) + ')', val.base.revenue],
    ['base.yearLabel', 'Base year label', val.base.yearLabel, 'text'],
    ['settings.forecastYears', 'Forecast years (1–15)', val.settings.forecastYears],
    ['assumptions.waccPct', 'WACC %', val.assumptions.waccPct],
    ['assumptions.terminalGrowthPct', 'Perpetuity growth %', val.assumptions.terminalGrowthPct],
    ['assumptions.exitEbitdaMultiple', 'TV exit EBITDA multiple (x)', val.assumptions.exitEbitdaMultiple],
    ['bridge.netDebt', 'Net debt / (cash)', val.bridge.netDebt],
    ['bridge.sharesOutstanding', 'Shares outstanding', val.bridge.sharesOutstanding],
    ['bridge.currentSharePrice', 'Current share price', val.bridge.currentSharePrice]
  ];
  return `<div class="card" id="sec-assumptions">
    <h3>Assumptions</h3>
    <p class="small-hint">${val.seededFromDD ? 'Pre-populated from your Financial DD data — every value is editable.' : 'No Financial DD data found in this project — enter base values manually, or complete Step 2 in the Memo Agent first.'} Shares/price are optional (needed only for per-share output) — use the same unit scale as your financials.</p>
    <div class="assum-grid">
      ${items.map(([path, label, value, type]) => `
        <div class="assum-item">
          <label>${label}</label>
          <input class="val-input blue" data-path="${path}" type="${type === 'text' ? 'text' : 'number'}" step="any" value="${value ?? ''}">
        </div>`).join('')}
    </div>
  </div>`;
}

function financialsSection() {
  if (!dd) {
    return `<div class="card" id="sec-financials"><h3>Financials (historical)</h3><p class="hint">No Financial DD data in this project. The three-statement preview appears here once Step 2 of the Memo Agent is complete.</p></div>`;
  }
  const rows = [
    ['Revenue', (p) => fmtMoney(p.revenue)],
    ['Revenue growth', (p) => fmtPct(p.revenueGrowthPct)],
    ['EBITDA (reported)', (p) => fmtMoney(p.ebitdaReported)],
    ['EBITDA (adjusted)', (p) => fmtMoney(p.ebitdaAdjusted)],
    ['EBITDA margin', (p) => fmtPct(p.ebitdaMarginPct)],
    ['D&A', (p) => fmtMoney(p.da)],
    ['Capex', (p) => fmtMoney(p.capex)],
    ['Net working capital', (p) => fmtMoney(p.nwc)],
    ['Operating cash flow', (p) => fmtMoney(p.ocf)],
    ['Free cash flow', (p) => fmtMoney(p.fcf)],
    ['Cash', (p) => fmtMoney(p.cash)],
    ['Total debt', (p) => fmtMoney(p.totalDebt)],
    ['Net debt', (p) => fmtMoney(p.netDebt)]
  ];
  return `<div class="card" id="sec-financials">
    <h3>Financials (historical, from Financial DD)</h3>
    <p class="small-hint">Extracted by Agent 2 from your uploaded statements (QFS/AFS); ratios computed deterministically. This is the base the forecast drivers start from.</p>
    <div style="overflow-x:auto;"><table class="dd-table">
      <thead><tr><th></th>${dd.periods.map((p) => `<th>${esc(p)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(([label, fn]) => `<tr><td>${label}</td>${dd.perPeriod.map((p) => `<td>${fn(p)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>
  </div>`;
}

function forecastsSection() {
  const n = val.settings.forecastYears;
  const labels = [];
  const startYear = parseInt(String(val.base.yearLabel).replace(/\D/g, ''), 10);
  for (let i = 1; i <= n; i++) labels.push(isFinite(startYear) ? `FY${startYear + i}` : `Y${i}`);
  return `<div class="card" id="sec-forecasts">
    <h3>Company forecasts (drivers)</h3>
    <p class="small-hint">The forecast is driver-based, like the workbook's extrapolation rows: revenue compounds on growth, everything else keys off revenue. Edit any cell — or use the taper button to glide growth toward the perpetuity rate.</p>
    <div class="prompt-actions" style="margin-bottom:0.6rem;">
      <button class="btn btn-sm" id="btnTaper">Taper growth to terminal rate</button>
      <button class="btn btn-sm" id="btnReseed">Re-seed from Financial DD</button>
    </div>
    <div style="overflow-x:auto;"><table class="dd-table">
      <thead><tr><th>Driver</th>${labels.map((l) => `<th>${l}</th>`).join('')}</tr></thead>
      <tbody>
        ${DRIVER_ROWS.map((row) => `<tr><td>${row.label}${row.unit ? ' (' + row.unit + ')' : ''}</td>
          ${val.drivers[row.key].map((v, i) => `<td><input class="grid-input" data-driver="${row.key}" data-idx="${i}" type="number" step="any" value="${v}"></td>`).join('')}
        </tr>`).join('')}
      </tbody>
    </table></div>
  </div>`;
}

function dcfInputSection(result) {
  if (!result.ok) return `<div class="card" id="sec-dcfinput"><h3>DCF input</h3><p class="hint">Fix the input problems above to compute.</p></div>`;
  const ys = result.outputs.years;
  const rows = [
    ['Revenue', (y) => fmtMoney(y.revenue)],
    ['EBITDA', (y) => fmtMoney(y.ebitda)],
    ['% margin', (y) => fmtPct(y.ebitdaMarginPct)],
    ['D&A', (y) => fmtMoney(y.da)],
    ['EBIT', (y) => fmtMoney(y.ebit)],
    ['Tax on EBIT', (y) => fmtMoney(y.tax)],
    ['EBIAT', (y) => fmtMoney(y.ebiat)],
    ['+ D&A add-back', (y) => fmtMoney(-y.da)],
    ['Capex', (y) => fmtMoney(y.capex)],
    ['Δ Working capital', (y) => fmtMoney(y.nwcChange)],
    ['Other cash flows', (y) => fmtMoney(y.otherCashflows)],
    ['Exceptionals', (y) => fmtMoney(y.exceptionals)],
    ['Unlevered FCF', (y) => fmtMoney(y.fcf), 'hl'],
    ['Discount factor', (y) => y.discountFactor.toFixed(3)],
    ['PV of FCF', (y) => fmtMoney(y.pvFcf), 'hl']
  ];
  return `<div class="card" id="sec-dcfinput">
    <h3>DCF input — unlevered FCF build</h3>
    <p class="small-hint">EBITDA → EBIT → tax → EBIAT → FCF, discounted at end-of-year factors, exactly like the workbook's "DCF input" tab. Computed by the engine; read-only.</p>
    <div style="overflow-x:auto;"><table class="dd-table">
      <thead><tr><th></th>${ys.map((y) => `<th>${esc(y.label)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(([label, fn, cls]) => `<tr${cls ? ` class="${cls}"` : ''}><td>${label}</td>${ys.map((y) => `<td>${fn(y)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>
  </div>`;
}

function bridgeCard(title, b, note) {
  if (!b) return `<div class="card"><h3>${title}</h3><p class="hint">Unavailable at current assumptions (WACC must exceed the growth rate).</p></div>`;
  const rows = [
    ['PV of forecast FCF', fmtMoney(b.pvFcfTotal), fmtPct(100 - b.tvPctOfEv)],
    ['PV of terminal value', fmtMoney(b.pvTerminal), fmtPct(b.tvPctOfEv)],
    ['Enterprise value', fmtMoney(b.enterpriseValue), '100%'],
    ['Less: net debt & adjustments', fmtMoney(-((val.bridge.netDebt) ?? 0)), ''],
    ['Equity value', fmtMoney(b.equityValue), ''],
    ['Implied share price', b.impliedSharePrice !== null ? b.impliedSharePrice.toFixed(2) : 'n/a — set shares', ''],
    ['% premium to current', b.premiumPct !== null ? fmtPct(b.premiumPct) : 'n/a — set price', '']
  ];
  return `<div class="card">
    <h3>${title}</h3>
    <table class="dd-table"><thead><tr><th></th><th>Value</th><th>% of EV</th></tr></thead>
    <tbody>${rows.map(([l, v, p], i) => `<tr${i === 2 || i === 4 ? ' class="hl"' : ''}><td>${l}</td><td>${v}</td><td>${p}</td></tr>`).join('')}</tbody></table>
    ${note ? `<p class="footnote">${note}</p>` : ''}
  </div>`;
}

function sensTable(title, rowLabel, colLabel, rowVals, colVals, cells, pick, fmt) {
  return `<div class="card">
    <h3>${title}</h3>
    <div style="overflow-x:auto;"><table class="dd-table sens-table">
      <thead><tr><th>${rowLabel} \\ ${colLabel}</th>${colVals.map((c) => `<th>${c.toFixed(2)}</th>`).join('')}</tr></thead>
      <tbody>${rowVals.map((r, i) => `<tr><td>${r.toFixed(2)}</td>${colVals.map((_, j) => {
        const v = pick(cells[i][j]);
        return `<td${i === 2 && j === 2 ? ' class="centre"' : ''}>${v === null ? '—' : fmt(v)}</td>`;
      }).join('')}</tr>`).join('')}</tbody>
    </table></div>
  </div>`;
}

function dcfOutputSection(result) {
  if (!result.ok) {
    return `<div class="card" id="sec-dcfoutput" style="border-color:#D85A30;"><h3 style="color:#993C1D;">DCF output — input problems</h3><ul class="bullet-list">${result.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>`;
  }
  const o = result.outputs;
  const warningsHtml = result.warnings.length
    ? `<div class="card" style="border-color:#e0c060;"><h3>Warnings</h3><ul class="bullet-list">${result.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>` : '';
  const s = o.sensitivity;
  const sp = (c) => c.sharePrice;
  const ev = (c) => c.ev;
  const hasShares = o.sharesOutstanding && o.sharesOutstanding > 0;
  return `<div id="sec-dcfoutput">
    <div class="card"><h3>DCF output</h3><p class="small-hint">${esc(result.summary)}</p></div>
    ${warningsHtml}
    <div class="method-cols">
      ${bridgeCard('Perpetuity growth method', o.perpetuity, `FCF<sub>final</sub> × (1+g) / (WACC − g), discounted at the final-year factor.`)}
      ${bridgeCard('Exit EBITDA multiple method', o.exitMultiple, `Final-year EBITDA × multiple, discounted at the final-year factor (the reference workbook used the prior-year factor here — a known slip this engine corrects).`)}
    </div>
    <div class="method-cols">
      ${sensTable('Sensitivity: EV — WACC × perpetuity growth', 'WACC %', 'g %', s.perpetuity.waccPct, s.perpetuity.growthPct, s.perpetuity.cells, ev, (v) => fmtMoney(v))}
      ${sensTable('Sensitivity: EV — WACC × exit multiple', 'WACC %', 'x', s.exitMultiple.waccPct, s.exitMultiple.multiples, s.exitMultiple.cells, ev, (v) => fmtMoney(v))}
    </div>
    ${hasShares ? `<div class="method-cols">
      ${sensTable('Sensitivity: share price — WACC × growth', 'WACC %', 'g %', s.perpetuity.waccPct, s.perpetuity.growthPct, s.perpetuity.cells, sp, (v) => v.toFixed(2))}
      ${sensTable('Sensitivity: share price — WACC × exit multiple', 'WACC %', 'x', s.exitMultiple.waccPct, s.exitMultiple.multiples, s.exitMultiple.cells, sp, (v) => v.toFixed(2))}
    </div>` : ''}
  </div>`;
}

// ---------- wiring ----------

function renderAll() {
  const result = runModel();
  document.getElementById('workbench').innerHTML =
    assumptionsSection() + financialsSection() + forecastsSection() + dcfInputSection(result) + dcfOutputSection(result);
  attachHandlers();
}

function renderComputed() {
  const result = runModel();
  document.getElementById('sec-dcfinput').outerHTML = dcfInputSection(result);
  document.getElementById('sec-dcfoutput').outerHTML = dcfOutputSection(result);
}

function resizeDrivers(n) {
  for (const row of DRIVER_ROWS) {
    const arr = val.drivers[row.key];
    while (arr.length < n) arr.push(arr.length ? arr[arr.length - 1] : 0);
    arr.length = n;
  }
}

function setPath(path, raw) {
  const [group, key] = path.split('.');
  if (path === 'base.yearLabel') { val.base.yearLabel = String(raw).trim() || 'FY0'; return; }
  const isOptional = group === 'bridge' && key !== 'netDebt';
  const v = raw === '' ? (isOptional ? null : 0) : num(raw);
  if (path === 'settings.forecastYears') {
    val.settings.forecastYears = Math.max(1, Math.min(15, Math.round(v || 10)));
    resizeDrivers(val.settings.forecastYears);
    return;
  }
  val[group][key] = v;
}

function attachHandlers() {
  document.querySelectorAll('.val-input[data-path]').forEach((el) => {
    el.addEventListener('change', () => {
      const path = el.getAttribute('data-path');
      setPath(path, el.value);
      persist();
      if (path === 'settings.forecastYears' || path === 'base.yearLabel') renderAll();
      else renderComputed();
    });
  });

  document.querySelectorAll('.grid-input[data-driver]').forEach((el) => {
    el.addEventListener('change', () => {
      const key = el.getAttribute('data-driver');
      const idx = Number(el.getAttribute('data-idx'));
      val.drivers[key][idx] = num(el.value);
      persist();
      renderComputed();
    });
  });

  const btnTaper = document.getElementById('btnTaper');
  if (btnTaper) btnTaper.onclick = () => {
    const n = val.settings.forecastYears;
    const start = val.drivers.revenueGrowthPct[0] ?? 5;
    val.drivers.revenueGrowthPct = taper(start, val.assumptions.terminalGrowthPct, n).map(round2);
    persist();
    renderAll();
    toast('Growth tapered to the terminal rate');
  };

  const btnReseed = document.getElementById('btnReseed');
  if (btnReseed) btnReseed.onclick = () => {
    if (!confirm('Re-seed all assumptions and drivers from Financial DD data? Your edits here will be replaced.')) return;
    val = seedValuation(val.settings.forecastYears);
    persist();
    renderAll();
    toast(dd ? 'Re-seeded from Financial DD' : 'No DD data — reset to defaults');
  };
}

document.getElementById('companyName').textContent =
  (project.step1?.output?.company_name ? project.step1.output.company_name + ' — ' : '') + (project.name || '');

if (!project.valuation) persist();
renderAll();
