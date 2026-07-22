function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtMoney(n, unit) {
  if (n === null || n === undefined || isNaN(n)) return 'N/A';
  const abs = Math.abs(n);
  let mag;
  if (abs >= 1e9) mag = (abs / 1e9).toFixed(2) + 'B';
  else if (abs >= 1e6) mag = (abs / 1e6).toFixed(2) + 'M';
  else if (abs >= 1e3) mag = (abs / 1e3).toFixed(1) + 'K';
  else mag = abs.toFixed(0);
  const symbol = (unit === 'USD' || !unit) ? '$' : '';
  const suffix = (unit && unit !== 'USD') ? ' ' + unit : '';
  // Sign leads the currency symbol: -$200, not $-200.
  return (n < 0 ? '-' : '') + symbol + mag + suffix;
}

function fmtPct(n, digits = 1) {
  if (n === null || n === undefined || isNaN(n)) return 'N/A';
  return (n >= 0 ? '' : '') + n.toFixed(digits) + '%';
}

function fmtDays(n) {
  if (n === null || n === undefined || isNaN(n)) return 'N/A';
  return n.toFixed(0) + 'd';
}

function list(items) {
  if (!items || !items.length) return '<p class="hint">None noted.</p>';
  return `<ul class="bullet-list">${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
}

// Render a MethodResult's errors/warnings. Errors block the step; warnings
// travel with the analysis so data-quality issues are never invisible.
export function renderWarnings(result) {
  if (!result) return '';
  let html = '';
  if (result.errors && result.errors.length) {
    html += `<div class="card" style="border-color:#D85A30;"><h3 style="color:#993C1D;">Input problems — fix the pasted data</h3><ul class="bullet-list">${result.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul><p class="small-hint">Re-run the prompt or correct the JSON, then parse again.</p></div>`;
  }
  if (result.warnings && result.warnings.length) {
    html += `<div class="card" style="border-color:#e0c060;"><h3>Data-quality warnings</h3><ul class="bullet-list">${result.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>`;
  }
  return html;
}

export function renderStep1Output(o) {
  if (!o) return '';
  return `
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">
      <div>
        <h3>${esc(o.company_name || 'Unnamed company')}</h3>
        <p class="hint" style="margin-bottom:0;">${esc(o.one_liner || '')}</p>
      </div>
      <div style="text-align:right;">
        <span class="pill pill-neutral">${esc(o.sector || 'Sector n/a')}</span>
        ${o.stage ? `<span class="pill pill-neutral">${esc(o.stage)}</span>` : ''}
      </div>
    </div>
    <div class="metric-grid" style="margin-top:0.75rem;">
      <div class="metric-box"><div class="metric-label">Founded</div><div class="metric-val">${esc(o.founded_year || 'N/A')}</div></div>
      <div class="metric-box"><div class="metric-label">HQ</div><div class="metric-val">${esc(o.hq_location || 'N/A')}</div></div>
      <div class="metric-box"><div class="metric-label">Sub-sector</div><div class="metric-val">${esc(o.sub_sector || 'N/A')}</div></div>
    </div>
  </div>
  <div class="card"><h3>Business model</h3><p style="font-size:13px;line-height:1.6;">${esc(o.business_model || '')}</p></div>
  <div class="card"><h3>Product overview</h3><p style="font-size:13px;line-height:1.6;">${esc(o.product_overview || '')}</p></div>
  <div class="card"><h3>Team</h3>${
    (o.team || []).length
      ? (o.team || []).map((t) => `<div class="comp-row" style="display:flex;gap:8px;padding:6px 0;border-bottom:0.5px solid #eee;"><strong style="min-width:120px;">${esc(t.name)}</strong><span style="color:#888;min-width:110px;">${esc(t.role)}</span><span style="font-size:12.5px;color:#555;">${esc(t.background)}</span></div>`).join('')
      : '<p class="hint">None noted.</p>'
  }</div>
  <div class="card"><h3>Key facts</h3>${list(o.key_facts)}</div>
  <div class="card"><h3>Recent news</h3>${
    (o.recent_news || []).length
      ? (o.recent_news || []).map((n) => `<div style="margin-bottom:10px;"><strong>${esc(n.headline)}</strong> <span style="color:#888;font-size:12px;">${esc(n.date || '')}</span><p style="font-size:12.5px;color:#555;margin-top:2px;">${esc(n.summary)}</p><p style="font-size:12px;color:#888;">Relevance: ${esc(n.relevance)}</p></div>`).join('')
      : '<p class="hint">None noted.</p>'
  }</div>
  <div class="card"><h3>Competitors mentioned</h3>${list(o.competitors_mentioned)}</div>
  <div class="card"><h3>Financial highlights mentioned</h3>${list(o.financial_highlights_mentioned)}</div>
  <div class="card"><h3>Red flags</h3>${list(o.red_flags)}</div>
  <div class="card"><h3>Open questions for diligence</h3>${list(o.open_questions)}</div>`;
}

export function renderStep2Output(raw, computed) {
  if (!raw || !computed) return '';
  const rows = [
    ['Revenue', 'revenue', fmtMoney],
    ['Revenue growth', 'revenueGrowthPct', fmtPct],
    ['Gross profit', 'grossProfit', fmtMoney],
    ['Gross margin', 'grossMarginPct', fmtPct],
    ['Opex', 'opex', fmtMoney],
    ['EBITDA (reported)', 'ebitdaReported', fmtMoney],
    ['EBITDA margin', 'ebitdaMarginPct', fmtPct],
    ['Add-backs', 'addbacksTotal', fmtMoney],
    ['EBITDA (adjusted)', 'ebitdaAdjusted', fmtMoney],
    ['Adj. EBITDA margin', 'adjustedEbitdaMarginPct', fmtPct],
    ['D&A', 'da', fmtMoney],
    ['Net income', 'netIncome', fmtMoney],
    ['DSO', 'dso', fmtDays],
    ['DPO', 'dpo', fmtDays],
    ['DIO', 'dio', fmtDays],
    ['Cash conversion cycle', 'cashConversionCycle', fmtDays],
    ['Net working capital', 'nwc', fmtMoney],
    ['Total debt', 'totalDebt', fmtMoney],
    ['Net debt', 'netDebt', fmtMoney],
    ['Operating cash flow', 'ocf', fmtMoney],
    ['CapEx', 'capex', fmtMoney],
    ['Free cash flow', 'fcf', fmtMoney],
    ['FCF margin', 'fcfMarginPct', fmtPct]
  ];

  const table = `<div style="overflow-x:auto;"><table class="dd-table"><thead><tr><th>Metric</th>${computed.periods.map((p) => `<th>${esc(p)}</th>`).join('')}</tr></thead><tbody>
    ${rows.map(([label, key, fmt]) => `<tr><td>${label}</td>${computed.perPeriod.map((p) => `<td>${fmt(p[key], p.unit)}</td>`).join('')}</tr>`).join('')}
  </tbody></table></div>`;

  const cagrBox = computed.revenueCagrPct !== null
    ? `<div class="metric-box"><div class="metric-label">Revenue CAGR</div><div class="metric-val up">${fmtPct(computed.revenueCagrPct)}</div></div>`
    : '';

  return `
  <div class="card">
    <h3>Financial due diligence — computed metrics</h3>
    <p class="small-hint">All ratios below are computed deterministically in-browser from Agent 2's extracted figures — not by the AI — so they're exact given the source data. Day metrics (DSO/DPO/DIO) use the reporting-period length inferred from the period labels (annual, quarterly, monthly, or LTM).</p>
    <div class="metric-grid">${cagrBox}</div>
    ${table}
  </div>
  <div class="card"><h3>Add-backs (QoE)</h3>${
    (raw.addbacks || []).length
      ? `<ul class="bullet-list">${raw.addbacks.map((a) => `<li><strong>${esc(a.period)}</strong> — ${esc(a.label)}: ${fmtMoney(a.amount)} <span style="color:#888;">(${esc(a.rationale)})</span></li>`).join('')}</ul>`
      : '<p class="hint">No add-backs identified.</p>'
  }</div>
  <div class="card"><h3>Customer concentration</h3><p style="font-size:13px;">${esc(computed.customerConcentration || 'Not noted.')}</p></div>
  <div class="card"><h3>Data notes / gaps</h3>${list(computed.notes)}</div>`;
}

export function renderStep3Output(marketCalc) {
  if (!marketCalc) return '';
  return `
  <div class="metric-grid">
    <div class="metric-box"><div class="metric-label">TAM</div><div class="metric-val">${fmtMoney(marketCalc.tamValue, marketCalc.unit)}</div></div>
    <div class="metric-box"><div class="metric-label">SAM</div><div class="metric-val">${fmtMoney(marketCalc.samValue, marketCalc.unit)}</div></div>
    <div class="metric-box"><div class="metric-label">SOM</div><div class="metric-val up">${fmtMoney(marketCalc.somValue, marketCalc.unit)}</div></div>
  </div>
  <div style="overflow-x:auto;"><table class="dd-table"><thead><tr><th>Year</th>${marketCalc.projection.map((p) => `<th>Y${p.year}</th>`).join('')}</tr></thead>
  <tbody><tr><td>Obtainable revenue</td>${marketCalc.projection.map((p) => `<td>${fmtMoney(p.obtainableValue, marketCalc.unit)}</td>`).join('')}</tr></tbody></table></div>`;
}

export function renderStep3Basis(o) {
  if (!o) return '';
  return `
  <div class="card"><h3>TAM basis</h3><p style="font-size:13px;line-height:1.6;">${esc(o.tam?.basis || '')}</p></div>
  <div class="card"><h3>SAM basis</h3><p style="font-size:13px;line-height:1.6;">${esc(o.sam?.basis || '')}</p></div>
  <div class="card"><h3>SOM basis</h3><p style="font-size:13px;line-height:1.6;">${esc(o.som?.basis || '')} ${o.som?.timeframe ? `<span style="color:#888;">(${esc(o.som.timeframe)})</span>` : ''}</p></div>
  <div class="card"><h3>Key assumptions</h3>${list(o.key_assumptions)}</div>
  <div class="card"><h3>Sources implied</h3>${list(o.sources_implied)}</div>`;
}

export function renderStep4Output(o) {
  if (!o) return '';
  return `
  <div class="card"><h3>Recommendation summary</h3><p style="font-size:13.5px;line-height:1.6;">${esc(o.recommendation_summary || '')}</p></div>
  <div class="card"><h3>Hypotheses</h3>${
    (o.hypotheses || []).map((h) => `
    <div style="margin-bottom:12px;padding-bottom:10px;border-bottom:0.5px solid #eee;">
      <div style="display:flex;justify-content:space-between;gap:8px;"><strong style="font-size:13px;">${esc(h.statement)}</strong><span class="pill ${h.confidence === 'High' ? 'pill-good' : h.confidence === 'Low' ? 'pill-bad' : 'pill-neutral'}">${esc(h.confidence)}</span></div>
      <p style="font-size:12.5px;color:#0F6E56;margin-top:4px;">For: ${(h.evidence_for || []).map(esc).join('; ') || '—'}</p>
      <p style="font-size:12.5px;color:#993C1D;">Against: ${(h.evidence_against || []).map(esc).join('; ') || '—'}</p>
      <p style="font-size:12.5px;color:#555;">Implication: ${esc(h.implication)}</p>
    </div>`).join('') || '<p class="hint">None noted.</p>'
  }</div>
  <div class="card"><h3>Growth opportunities</h3>${
    (o.growth_opportunities || []).map((g) => `<div style="margin-bottom:8px;"><strong style="font-size:13px;">${esc(g.opportunity)}</strong> <span class="pill pill-neutral">impact: ${esc(g.impact)}</span> <span class="pill pill-neutral">effort: ${esc(g.effort)}</span><p style="font-size:12.5px;color:#555;">${esc(g.rationale)}</p></div>`).join('') || '<p class="hint">None noted.</p>'
  }</div>
  <div class="card"><h3>Strategic alternatives</h3>${
    (o.strategic_alternatives || []).map((s) => `<div style="margin-bottom:8px;"><strong style="font-size:13px;">${esc(s.option)}</strong> ${s.recommended ? '<span class="pill pill-good">Recommended</span>' : ''}<p style="font-size:12.5px;color:#0F6E56;">Pros: ${(s.pros || []).map(esc).join('; ')}</p><p style="font-size:12.5px;color:#993C1D;">Cons: ${(s.cons || []).map(esc).join('; ')}</p></div>`).join('') || '<p class="hint">None noted.</p>'
  }</div>
  <div class="card"><h3>Key risks</h3>${
    (o.key_risks || []).map((r) => `<div style="margin-bottom:8px;"><strong style="font-size:13px;">${esc(r.risk)}</strong> <span class="pill ${r.severity === 'High' ? 'pill-bad' : 'pill-neutral'}">${esc(r.severity)}</span><p style="font-size:12.5px;color:#555;">Mitigation: ${esc(r.mitigation)}</p></div>`).join('') || '<p class="hint">None noted.</p>'
  }</div>`;
}

// Minimal, dependency-free markdown renderer for the final memo (headings, bold/italic/code, lists, tables, paragraphs).
export function renderMarkdown(md) {
  const lines = (md || '').replace(/\r\n/g, '\n').split('\n');
  let html = '';
  let i = 0;
  let inUl = false, inOl = false;

  function closeLists() {
    if (inUl) { html += '</ul>'; inUl = false; }
    if (inOl) { html += '</ol>'; inOl = false; }
  }

  function inline(s) {
    let t = esc(s);
    t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
    return t;
  }

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*$/.test(line)) { closeLists(); i++; continue; }

    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) { closeLists(); html += `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`; i++; continue; }

    if (/^\s*[-*]\s+/.test(line)) {
      if (!inUl) { closeLists(); html += '<ul>'; inUl = true; }
      html += `<li>${inline(line.replace(/^\s*[-*]\s+/, ''))}</li>`;
      i++; continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      if (!inOl) { closeLists(); html += '<ol>'; inOl = true; }
      html += `<li>${inline(line.replace(/^\s*\d+\.\s+/, ''))}</li>`;
      i++; continue;
    }

    if (line.includes('|') && lines[i + 1] && /^[\s|:-]+$/.test(lines[i + 1]) && lines[i + 1].includes('-')) {
      closeLists();
      const headerCells = line.split('|').map((c) => c.trim()).filter((c) => c !== '');
      let body = '<table><thead><tr>' + headerCells.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>';
      i += 2;
      while (i < lines.length && lines[i].includes('|')) {
        const cells = lines[i].split('|').map((c) => c.trim()).filter((c) => c !== '');
        body += '<tr>' + cells.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>';
        i++;
      }
      html += body + '</tbody></table>';
      continue;
    }

    closeLists();
    let para = line;
    let j = i + 1;
    while (j < lines.length && !/^\s*$/.test(lines[j]) && !/^(#{1,3})\s+/.test(lines[j]) && !/^\s*[-*]\s+/.test(lines[j]) && !/^\s*\d+\.\s+/.test(lines[j])) {
      para += '\n' + lines[j];
      j++;
    }
    html += `<p>${inline(para).replace(/\n/g, '<br>')}</p>`;
    i = j;
  }
  closeLists();
  return html;
}

export { fmtMoney, fmtPct };
