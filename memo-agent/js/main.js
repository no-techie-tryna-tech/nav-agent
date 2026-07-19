import { loadProject, saveProject, newProject, exportProject, importProjectFromFile, loadKnowledgeBase, saveKnowledgeBase } from './storage.js';
import { extractTextFromFile } from './extract.js';
import { buildStep1Prompt, buildStep2Prompt, buildStep3Prompt, buildStep4Prompt, buildStep5Prompt } from './prompts.js';
import { getMethod } from '../engine/index.js';
import { renderStep1Output, renderStep2Output, renderStep3Output, renderStep3Basis, renderStep4Output, renderMarkdown, renderWarnings } from './render.js';

const financialDD = getMethod('financial-dd');
const marketSizing = getMethod('market-sizing');

function marketDefaults(step3Output) {
  const values = {};
  for (const def of marketSizing.assumptionDefs) values[def.key] = def.default;
  // @ts-ignore method-specific helper
  return Object.assign(values, marketSizing.defaultsFrom ? marketSizing.defaultsFrom(step3Output) : {});
}

let project = loadProject();
let kbText = loadKnowledgeBase();
let currentStep = 1;

const stepContentEl = document.getElementById('stepContent');
const STEP_LABELS = ['Intake', 'Financial DD', 'Market sizing', 'Strategy', 'Memo'];

function persist() {
  saveProject(project);
  document.getElementById('projectName').textContent = project.name;
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2400);
}

function parseJsonLoose(text) {
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  if (s < 0 || e < 0 || e <= s) {
    throw new Error("No JSON object found in the pasted text. Paste Claude's full reply, including the { and } braces.");
  }
  try {
    return JSON.parse(text.slice(s, e + 1));
  } catch (err) {
    throw new Error('Could not parse that as JSON (' + err.message + '). Make sure you copied the entire reply.');
  }
}

function maxUnlockedStep() {
  if (!project.step1.output) return 1;
  if (!project.step2.output) return 2;
  if (!project.step3.output) return 3;
  if (!project.step4.output) return 4;
  return 5;
}

function copyToClipboard(text, okMsg) {
  navigator.clipboard.writeText(text).then(
    () => toast(okMsg || 'Copied to clipboard'),
    () => toast('Could not copy — select and copy manually')
  );
}

function renderStepper() {
  const unlocked = maxUnlockedStep();
  document.querySelectorAll('#stepper .ps').forEach((el) => {
    const n = Number(el.dataset.step);
    const done = n < unlocked || (n === 5 && project.step5.memoText);
    el.classList.toggle('active', n === currentStep);
    el.classList.toggle('done', done && n !== currentStep);
    el.classList.toggle('locked', n > unlocked);
  });
}

function fileListHtml(documents, removeHandlerName) {
  if (!documents.length) return '';
  return `<div class="file-list">${documents.map((d, i) => `
    <div class="file-row">
      <span class="fname">${d.name}</span>
      <span class="fstatus">${d.status === 'extracting' ? 'Extracting…' : d.status === 'error' ? 'Error: ' + d.error : (d.text ? d.text.length.toLocaleString() + ' chars' : '')}</span>
      <button onclick="${removeHandlerName}(${i})">Remove</button>
    </div>`).join('')}</div>`;
}

async function handleFiles(fileList, documents, onChange) {
  const files = Array.from(fileList);
  for (const file of files) {
    const entry = { name: file.name, text: null, status: 'extracting', error: null };
    documents.push(entry);
    onChange();
    try {
      entry.text = await extractTextFromFile(file);
      entry.status = 'done';
    } catch (err) {
      entry.status = 'error';
      entry.error = err.message;
    }
    onChange();
  }
}

function promptBoxHtml(id, value) {
  return `
  <div class="prompt-box">
    <textarea id="${id}" class="mono" rows="10">${value ? value.replace(/</g, '&lt;') : ''}</textarea>
    <div class="prompt-actions">
      <button class="btn btn-primary btn-sm" onclick="window.__copyPrompt('${id}')">Copy prompt</button>
      <a class="btn btn-sm" href="https://claude.ai/new" target="_blank" rel="noopener">Open claude.ai ↗</a>
    </div>
  </div>`;
}

function pasteBackHtml(id, errId) {
  return `
  <div class="divider"></div>
  <label class="section-label">Paste Claude's reply here</label>
  <textarea id="${id}" class="mono" rows="8" placeholder="Paste the full JSON reply from claude.ai..."></textarea>
  <div id="${errId}" class="error-msg"></div>`;
}

window.__copyPrompt = function (id) {
  copyToClipboard(document.getElementById(id).value, 'Prompt copied — paste it into claude.ai');
};

// ---------- Step 1: Intake ----------

function renderStep1() {
  const s = project.step1;
  const hasDocs = s.documents.some((d) => d.status === 'done');

  stepContentEl.innerHTML = `
  <div class="step active">
    <div class="card">
      <span class="section-label">Step 1 · Intake Agent</span>
      <p class="hint">Upload 4–5 source documents — pitch decks, news articles, preliminary analysis, memos (PDF, DOCX, TXT, MD). This agent skims them and produces a structured company snapshot.</p>
      <div class="upload-zone" id="dropZone">Click to choose files, or drag &amp; drop them here</div>
      <input type="file" id="fileInput1" multiple accept=".pdf,.docx,.txt,.md,.csv" style="display:none;">
      <div id="fileList1">${fileListHtml(s.documents, '__removeStep1File')}</div>
    </div>
    <div class="card">
      <span class="section-label">Generate &amp; run prompt</span>
      <button class="btn btn-primary" id="btnGen1" ${hasDocs ? '' : 'disabled'}>Generate prompt</button>
      ${!hasDocs ? '<p class="small-hint">Upload at least one document that finishes extracting to enable this.</p>' : ''}
      <div id="promptArea1">${s.prompt ? promptBoxHtml('promptText1', s.prompt) + pasteBackHtml('pasteText1', 'err1') : ''}</div>
      ${s.prompt ? `<div class="prompt-actions" style="margin-top:0.75rem;"><button class="btn btn-primary" id="btnParse1">Parse &amp; save</button></div>` : ''}
    </div>
    <div id="output1">${s.output ? `<div class="card"><h3>✓ Company snapshot saved</h3><button class="btn btn-sm" id="btnEdit1">Regenerate this step</button></div>${renderStep1Output(s.output)}<div style="margin-top:1rem;"><button class="btn btn-primary" id="btnNext1">Next: Financial DD →</button></div>` : ''}</div>
  </div>`;

  document.getElementById('dropZone').onclick = () => document.getElementById('fileInput1').click();
  document.getElementById('fileInput1').onchange = (e) => {
    handleFiles(e.target.files, s.documents, () => { persist(); renderStep1(); });
    e.target.value = '';
  };
  const dz = document.getElementById('dropZone');
  dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('dragover'); };
  dz.ondragleave = () => dz.classList.remove('dragover');
  dz.ondrop = (e) => {
    e.preventDefault(); dz.classList.remove('dragover');
    handleFiles(e.dataTransfer.files, s.documents, () => { persist(); renderStep1(); });
  };

  window.__removeStep1File = (i) => { s.documents.splice(i, 1); persist(); renderStep1(); };

  const genBtn = document.getElementById('btnGen1');
  if (genBtn) genBtn.onclick = () => {
    const docs = s.documents.filter((d) => d.status === 'done');
    s.prompt = buildStep1Prompt(docs);
    persist();
    renderStep1();
  };

  const parseBtn = document.getElementById('btnParse1');
  if (parseBtn) parseBtn.onclick = () => {
    const raw = document.getElementById('pasteText1').value.trim();
    const errEl = document.getElementById('err1');
    errEl.textContent = '';
    if (!raw) { errEl.textContent = 'Paste the reply from claude.ai first.'; return; }
    try {
      s.output = parseJsonLoose(raw);
      s.raw = raw;
      persist();
      renderStep1();
      toast('Saved — Financial DD unlocked');
    } catch (err) {
      errEl.textContent = err.message;
    }
  };

  const editBtn = document.getElementById('btnEdit1');
  if (editBtn) editBtn.onclick = () => { s.output = null; persist(); renderStep1(); };

  const nextBtn = document.getElementById('btnNext1');
  if (nextBtn) nextBtn.onclick = () => goToStep(2);

  renderStepper();
}

// ---------- Step 2: Financial DD ----------

function renderStep2() {
  const s = project.step2;
  const s1out = project.step1.output;

  stepContentEl.innerHTML = `
  <div class="step active">
    <div class="card">
      <span class="section-label">Step 2 · Financial Due Diligence Agent</span>
      <p class="hint">Upload financial statements or data if you have them (optional — the agent will also use anything financial mentioned in Step 1's source docs). It extracts raw numbers only; this app computes every ratio deterministically.</p>
      <div class="upload-zone" id="dropZone2">Click to choose files, or drag &amp; drop them here (optional)</div>
      <input type="file" id="fileInput2" multiple accept=".pdf,.docx,.txt,.md,.csv" style="display:none;">
      <div id="fileList2">${fileListHtml(s.documents, '__removeStep2File')}</div>
    </div>
    <div class="card">
      <span class="section-label">Generate &amp; run prompt</span>
      <button class="btn btn-primary" id="btnGen2">Generate prompt</button>
      <div id="promptArea2">${s.prompt ? promptBoxHtml('promptText2', s.prompt) + pasteBackHtml('pasteText2', 'err2') : ''}</div>
      ${s.prompt ? `<div class="prompt-actions" style="margin-top:0.75rem;"><button class="btn btn-primary" id="btnParse2">Parse &amp; save</button></div>` : ''}
    </div>
    <div id="output2">${s.output ? (() => {
      const res = financialDD.run(s.output);
      return `<div class="card"><h3>✓ Financial data saved</h3><button class="btn btn-sm" id="btnEdit2">Regenerate this step</button></div>${renderWarnings(res)}${res.ok ? renderStep2Output(s.output, res.outputs) : ''}<div style="margin-top:1rem;"><button class="btn" id="btnBack2">← Back</button> ${res.ok ? '<button class="btn btn-primary" id="btnNext2">Next: Market sizing →</button>' : ''}</div>`;
    })() : `<div style="margin-top:1rem;"><button class="btn" id="btnBack2">← Back</button></div>`}</div>
  </div>`;

  document.getElementById('dropZone2').onclick = () => document.getElementById('fileInput2').click();
  document.getElementById('fileInput2').onchange = (e) => {
    handleFiles(e.target.files, s.documents, () => { persist(); renderStep2(); });
    e.target.value = '';
  };
  const dz = document.getElementById('dropZone2');
  dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('dragover'); };
  dz.ondragleave = () => dz.classList.remove('dragover');
  dz.ondrop = (e) => {
    e.preventDefault(); dz.classList.remove('dragover');
    handleFiles(e.dataTransfer.files, s.documents, () => { persist(); renderStep2(); });
  };

  window.__removeStep2File = (i) => { s.documents.splice(i, 1); persist(); renderStep2(); };

  document.getElementById('btnGen2').onclick = () => {
    const docs = s.documents.filter((d) => d.status === 'done');
    s.prompt = buildStep2Prompt(s1out, docs);
    persist();
    renderStep2();
  };

  const parseBtn = document.getElementById('btnParse2');
  if (parseBtn) parseBtn.onclick = () => {
    const raw = document.getElementById('pasteText2').value.trim();
    const errEl = document.getElementById('err2');
    errEl.textContent = '';
    if (!raw) { errEl.textContent = 'Paste the reply from claude.ai first.'; return; }
    try {
      s.output = parseJsonLoose(raw);
      s.raw = raw;
      persist();
      renderStep2();
      toast('Saved — Market sizing unlocked');
    } catch (err) {
      errEl.textContent = err.message;
    }
  };

  const editBtn = document.getElementById('btnEdit2');
  if (editBtn) editBtn.onclick = () => { s.output = null; persist(); renderStep2(); };

  document.getElementById('btnBack2').onclick = () => goToStep(1);
  const nextBtn = document.getElementById('btnNext2');
  if (nextBtn) nextBtn.onclick = () => goToStep(3);

  renderStepper();
}

// ---------- Step 3: Market sizing ----------

function renderStep3() {
  const s = project.step3;
  const s1out = project.step1.output;
  const s2out = project.step2.output;
  const computed2 = s2out ? financialDD.run(s2out) : null;

  stepContentEl.innerHTML = `
  <div class="step active">
    <div class="card">
      <span class="section-label">Step 3 · Market Sizing Agent</span>
      <p class="hint">This agent proposes a TAM / SAM / SOM analysis anchored to the company and financial data so far. Once you have its output, you can adjust the assumptions below and the projections recompute instantly — no extra AI calls needed.</p>
      <button class="btn btn-primary" id="btnGen3">Generate prompt</button>
      <div id="promptArea3">${s.prompt ? promptBoxHtml('promptText3', s.prompt) + pasteBackHtml('pasteText3', 'err3') : ''}</div>
      ${s.prompt ? `<div class="prompt-actions" style="margin-top:0.75rem;"><button class="btn btn-primary" id="btnParse3">Parse &amp; save</button></div>` : ''}
    </div>
    <div id="output3"></div>
  </div>`;

  document.getElementById('btnGen3').onclick = () => {
    s.prompt = buildStep3Prompt(s1out, s2out, computed2);
    persist();
    renderStep3();
  };

  const parseBtn = document.getElementById('btnParse3');
  if (parseBtn) parseBtn.onclick = () => {
    const raw = document.getElementById('pasteText3').value.trim();
    const errEl = document.getElementById('err3');
    errEl.textContent = '';
    if (!raw) { errEl.textContent = 'Paste the reply from claude.ai first.'; return; }
    try {
      s.output = parseJsonLoose(raw);
      s.raw = raw;
      s.assumptions = marketDefaults(s.output);
      persist();
      renderStep3();
      toast('Saved — Strategy unlocked');
    } catch (err) {
      errEl.textContent = err.message;
    }
  };

  renderStep3Results();
  renderStepper();
}

function renderStep3Results() {
  const s = project.step3;
  const out = document.getElementById('output3');
  if (!out) return;
  if (!s.output) {
    out.innerHTML = `<div style="margin-top:1rem;"><button class="btn" id="btnBack3">← Back</button></div>`;
    document.getElementById('btnBack3').onclick = () => goToStep(2);
    return;
  }

  const a = s.assumptions;
  const res = marketSizing.run(s.output, a);

  const sliderRows = marketSizing.assumptionDefs.map((def) => {
    const val = a[def.key] ?? def.default;
    return `<div class="assumption-row" title="${def.description.replace(/"/g, '&quot;')}">
      <label>${def.name}</label>
      <input type="range" id="rng_${def.key}" min="${def.min}" max="${def.max}" step="${def.step || 1}" value="${val}">
      <span class="aval" id="val_${def.key}">${val}${def.unit}</span>
    </div>`;
  }).join('');

  out.innerHTML = `
  <div class="card">
    <h3>✓ Market sizing saved</h3>
    <button class="btn btn-sm" id="btnEdit3">Regenerate this step</button>
  </div>
  ${renderWarnings(res)}
  <div class="card">
    <h3>Adjust assumptions</h3>
    <p class="small-hint">Hover a label for what it means. Changes recompute instantly and are saved.</p>
    ${sliderRows}
  </div>
  <div class="card" id="marketNumbers">${res.ok ? renderStep3Output(res.outputs) : ''}</div>
  ${renderStep3Basis(s.output)}
  <div style="margin-top:1rem;"><button class="btn" id="btnBack3">← Back</button> ${res.ok ? '<button class="btn btn-primary" id="btnNext3">Next: Strategy →</button>' : ''}</div>`;

  for (const def of marketSizing.assumptionDefs) {
    document.getElementById(`rng_${def.key}`).oninput = (e) => {
      a[def.key] = Number(e.target.value);
      document.getElementById(`val_${def.key}`).textContent = a[def.key] + def.unit;
      persist();
      const rerun = marketSizing.run(s.output, a);
      document.getElementById('marketNumbers').innerHTML = rerun.ok ? renderStep3Output(rerun.outputs) : '';
    };
  }

  document.getElementById('btnEdit3').onclick = () => { s.output = null; persist(); renderStep3(); };
  document.getElementById('btnBack3').onclick = () => goToStep(2);
  const next3 = document.getElementById('btnNext3');
  if (next3) next3.onclick = () => goToStep(4);
}

// ---------- Step 4: Strategy ----------

function renderStep4() {
  const s = project.step4;
  const s1out = project.step1.output;
  const s2out = project.step2.output;
  const computed2 = s2out ? financialDD.run(s2out) : null;
  const s3out = project.step3.output;

  stepContentEl.innerHTML = `
  <div class="step active">
    <div class="card">
      <span class="section-label">Step 4 · Strategy Agent</span>
      <p class="hint">Applies hypothesis-driven consulting methodology across everything gathered so far: business-problem hypotheses, growth opportunities, strategic alternatives, and key risks.</p>
      <button class="btn btn-primary" id="btnGen4">Generate prompt</button>
      <div id="promptArea4">${s.prompt ? promptBoxHtml('promptText4', s.prompt) + pasteBackHtml('pasteText4', 'err4') : ''}</div>
      ${s.prompt ? `<div class="prompt-actions" style="margin-top:0.75rem;"><button class="btn btn-primary" id="btnParse4">Parse &amp; save</button></div>` : ''}
    </div>
    <div id="output4">${s.output ? `<div class="card"><h3>✓ Strategic analysis saved</h3><button class="btn btn-sm" id="btnEdit4">Regenerate this step</button></div>${renderStep4Output(s.output)}<div style="margin-top:1rem;"><button class="btn" id="btnBack4">← Back</button> <button class="btn btn-primary" id="btnNext4">Next: Memo →</button></div>` : `<div style="margin-top:1rem;"><button class="btn" id="btnBack4">← Back</button></div>`}</div>
  </div>`;

  document.getElementById('btnGen4').onclick = () => {
    s.prompt = buildStep4Prompt(s1out, s2out, computed2, s3out);
    persist();
    renderStep4();
  };

  const parseBtn = document.getElementById('btnParse4');
  if (parseBtn) parseBtn.onclick = () => {
    const raw = document.getElementById('pasteText4').value.trim();
    const errEl = document.getElementById('err4');
    errEl.textContent = '';
    if (!raw) { errEl.textContent = 'Paste the reply from claude.ai first.'; return; }
    try {
      s.output = parseJsonLoose(raw);
      s.raw = raw;
      persist();
      renderStep4();
      toast('Saved — Memo unlocked');
    } catch (err) {
      errEl.textContent = err.message;
    }
  };

  const editBtn = document.getElementById('btnEdit4');
  if (editBtn) editBtn.onclick = () => { s.output = null; persist(); renderStep4(); };

  document.getElementById('btnBack4').onclick = () => goToStep(3);
  const nextBtn = document.getElementById('btnNext4');
  if (nextBtn) nextBtn.onclick = () => goToStep(5);

  renderStepper();
}

// ---------- Step 5: Memo (Principal agent) ----------

function renderStep5() {
  const s = project.step5;

  const allData = {
    company_snapshot: project.step1.output,
    financial_dd_raw: project.step2.output,
    financial_dd_computed: project.step2.output ? financialDD.run(project.step2.output) : null,
    market_sizing: project.step3.output,
    market_sizing_computed: project.step3.output ? marketSizing.run(project.step3.output, project.step3.assumptions) : null,
    strategy: project.step4.output
  };

  stepContentEl.innerHTML = `
  <div class="step active">
    <div class="card">
      <span class="section-label">Step 5 · Principal Agent (Memo)</span>
      <p class="hint">Synthesizes everything above into a venture capital investment memo, following the guidelines in your <button class="btn btn-sm" id="btnOpenKB" style="padding:2px 8px;">Knowledge base</button>.</p>
      <button class="btn btn-primary" id="btnGen5">Generate prompt</button>
      <div id="promptArea5">${s.prompt ? promptBoxHtml('promptText5', s.prompt) : ''}</div>
      ${s.prompt ? `
      <div class="divider"></div>
      <label class="section-label">Paste Claude's memo (markdown) here</label>
      <textarea id="pasteText5" class="mono" rows="10" placeholder="Paste the full memo text from claude.ai...">${s.memoText ? s.memoText.replace(/</g, '&lt;') : ''}</textarea>
      <div class="prompt-actions" style="margin-top:0.75rem;"><button class="btn btn-primary" id="btnSave5">Save memo</button></div>
      ` : ''}
    </div>
    <div id="output5">${s.memoText ? `
      <div class="card no-print">
        <h3>✓ Memo saved</h3>
        <div class="prompt-actions">
          <button class="btn btn-sm" id="btnCopyMemo">Copy markdown</button>
          <button class="btn btn-sm" id="btnDownloadMemo">Download .md</button>
          <button class="btn btn-sm" id="btnPrintMemo">Print / Save as PDF</button>
        </div>
      </div>
      <div class="card memo-render">${renderMarkdown(s.memoText)}</div>
      <div style="margin-top:1rem;" class="no-print"><button class="btn" id="btnBack5">← Back</button></div>
    ` : `<div style="margin-top:1rem;"><button class="btn" id="btnBack5">← Back</button></div>`}</div>
  </div>`;

  document.getElementById('btnOpenKB').onclick = () => openKBModal();

  document.getElementById('btnGen5').onclick = () => {
    s.prompt = buildStep5Prompt(allData, kbText);
    persist();
    renderStep5();
  };

  const saveBtn = document.getElementById('btnSave5');
  if (saveBtn) saveBtn.onclick = () => {
    const text = document.getElementById('pasteText5').value.trim();
    if (!text) { toast('Paste the memo text first'); return; }
    s.memoText = text;
    persist();
    renderStep5();
    toast('Memo saved');
  };

  const copyBtn = document.getElementById('btnCopyMemo');
  if (copyBtn) copyBtn.onclick = () => copyToClipboard(s.memoText, 'Memo copied');

  const dlBtn = document.getElementById('btnDownloadMemo');
  if (dlBtn) dlBtn.onclick = () => {
    const blob = new Blob([s.memoText], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (project.name || 'investment-memo').replace(/[^a-z0-9-_]+/gi, '_') + '.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  const printBtn = document.getElementById('btnPrintMemo');
  if (printBtn) printBtn.onclick = () => window.print();

  document.getElementById('btnBack5').onclick = () => goToStep(4);

  renderStepper();
}

function goToStep(n) {
  if (n > maxUnlockedStep()) return;
  currentStep = n;
  render();
}

function render() {
  if (currentStep === 1) renderStep1();
  else if (currentStep === 2) renderStep2();
  else if (currentStep === 3) renderStep3();
  else if (currentStep === 4) renderStep4();
  else renderStep5();
}

// ---------- Top bar: stepper nav, project management, knowledge base ----------

document.querySelectorAll('#stepper .ps').forEach((el) => {
  el.addEventListener('click', () => goToStep(Number(el.dataset.step)));
});

document.getElementById('btnNew').onclick = () => {
  if (!confirm('Start a new project? This replaces the project currently saved in this browser (export first if you want to keep it).')) return;
  project = newProject('Untitled project');
  currentStep = 1;
  document.getElementById('projectName').textContent = project.name;
  render();
};

document.getElementById('btnExport').onclick = () => exportProject(project);

document.getElementById('btnImport').onclick = () => document.getElementById('importFile').click();
document.getElementById('importFile').onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    project = await importProjectFromFile(file);
    currentStep = maxUnlockedStep();
    document.getElementById('projectName').textContent = project.name;
    render();
    toast('Project imported');
  } catch (err) {
    alert(err.message);
  }
  e.target.value = '';
};

function openKBModal() {
  document.getElementById('kbText').value = kbText;
  document.getElementById('kbFileStatus').textContent = '';
  document.getElementById('kbModal').classList.add('open');
}

async function handleKBFiles(fileList) {
  const statusEl = document.getElementById('kbFileStatus');
  const ta = document.getElementById('kbText');
  for (const file of Array.from(fileList)) {
    statusEl.textContent = 'Extracting ' + file.name + '…';
    try {
      const text = await extractTextFromFile(file);
      ta.value = (ta.value ? ta.value + '\n\n' : '') + '----- FROM FILE: ' + file.name + ' -----\n' + text.trim();
      statusEl.textContent = 'Added ' + file.name + ' (' + text.length.toLocaleString() + ' chars). Click Save to keep it.';
    } catch (err) {
      statusEl.textContent = err.message;
    }
  }
}
document.getElementById('btnKB').onclick = openKBModal;
document.getElementById('kbDropZone').onclick = () => document.getElementById('kbFileInput').click();
document.getElementById('kbFileInput').onchange = (e) => { handleKBFiles(e.target.files); e.target.value = ''; };
document.getElementById('kbDropZone').ondragover = (e) => { e.preventDefault(); e.currentTarget.classList.add('dragover'); };
document.getElementById('kbDropZone').ondragleave = (e) => e.currentTarget.classList.remove('dragover');
document.getElementById('kbDropZone').ondrop = (e) => { e.preventDefault(); e.currentTarget.classList.remove('dragover'); handleKBFiles(e.dataTransfer.files); };
document.getElementById('btnKBClose').onclick = () => document.getElementById('kbModal').classList.remove('open');
document.getElementById('btnKBSave').onclick = () => {
  kbText = document.getElementById('kbText').value;
  saveKnowledgeBase(kbText);
  document.getElementById('kbModal').classList.remove('open');
  toast('Knowledge base saved');
};

document.getElementById('btnRename').onclick = () => {
  document.getElementById('renameInput').value = project.name;
  document.getElementById('renameModal').classList.add('open');
};
document.getElementById('btnRenameClose').onclick = () => document.getElementById('renameModal').classList.remove('open');
document.getElementById('btnRenameSave').onclick = () => {
  const v = document.getElementById('renameInput').value.trim();
  if (v) { project.name = v; persist(); }
  document.getElementById('renameModal').classList.remove('open');
};

document.getElementById('projectName').textContent = project.name;
currentStep = maxUnlockedStep();
render();
