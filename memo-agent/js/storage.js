const PROJECT_KEY = 'memoAgent.project.v1';
const KB_KEY = 'memoAgent.knowledgeBase.v1';

function emptyProject(name) {
  return {
    id: 'p_' + Date.now(),
    name: name || 'Untitled project',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    step1: { documents: [], prompt: '', raw: '', output: null },
    step2: { documents: [], prompt: '', raw: '', output: null },
    step3: { prompt: '', raw: '', output: null, assumptions: { samPct: 20, somPct: 10, growthPct: 15, years: 5 } },
    step4: { prompt: '', raw: '', output: null },
    step5: { prompt: '', memoText: '' }
  };
}

export function loadProject() {
  try {
    const raw = localStorage.getItem(PROJECT_KEY);
    if (!raw) return emptyProject();
    const parsed = JSON.parse(raw);
    return Object.assign(emptyProject(parsed.name), parsed);
  } catch (e) {
    return emptyProject();
  }
}

export function saveProject(project) {
  project.updatedAt = new Date().toISOString();
  localStorage.setItem(PROJECT_KEY, JSON.stringify(project));
}

export function newProject(name) {
  const project = emptyProject(name);
  saveProject(project);
  return project;
}

export function exportProject(project) {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (project.name || 'memo-agent-project').replace(/[^a-z0-9-_]+/gi, '_') + '.json';
  a.click();
  URL.revokeObjectURL(url);
}

export function importProjectFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const project = Object.assign(emptyProject(parsed.name), parsed);
        saveProject(project);
        resolve(project);
      } catch (e) {
        reject(new Error('That file is not a valid Memo Agent project export.'));
      }
    };
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsText(file);
  });
}

export function loadKnowledgeBase() {
  return localStorage.getItem(KB_KEY) || '';
}

export function saveKnowledgeBase(text) {
  localStorage.setItem(KB_KEY, text);
}
