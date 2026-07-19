import { financialDDSchemaText, financialDDSchemaRules, marketSizingSchemaText } from '../engine/core/schema.js';

const JSON_RULES = `IMPORTANT OUTPUT FORMAT:
- Reply with ONLY a single raw JSON object matching the schema below.
- No markdown code fences, no "Here is the JSON", no commentary before or after.
- If something isn't in the source material, use null (strings/numbers) or [] (lists) — never guess or invent numbers.
- Output must be valid JSON (double-quoted keys and strings, no trailing commas).`;

function docsBlock(documents) {
  if (!documents || !documents.length) return '(none provided)';
  return documents
    .map((d, i) => `----- DOCUMENT ${i + 1}: ${d.name} -----\n${d.text.slice(0, 20000)}`)
    .join('\n\n');
}

export function buildStep1Prompt(documents) {
  return `You are Agent 1 (Intake Analyst) in a venture capital deal pipeline. Skim the source materials below (pitch decks, news articles, preliminary analysis, memos, etc.) and extract a structured company snapshot.

${JSON_RULES}

SCHEMA:
{
  "company_name": string,
  "one_liner": string,
  "sector": string,
  "sub_sector": string | null,
  "founded_year": string | null,
  "hq_location": string | null,
  "stage": string | null,
  "business_model": string,
  "product_overview": string,
  "team": [{ "name": string, "role": string, "background": string }],
  "key_facts": [string],
  "recent_news": [{ "date": string | null, "headline": string, "summary": string, "relevance": string }],
  "competitors_mentioned": [string],
  "financial_highlights_mentioned": [string],
  "red_flags": [string],
  "open_questions": [string],
  "sources": [{ "doc_name": string, "doc_type": string }]
}

SOURCE MATERIALS:
${docsBlock(documents)}`;
}

export function buildStep2Prompt(step1Output, documents) {
  return `You are Agent 2 (Financial Due Diligence Analyst) in a venture capital deal pipeline. A prior agent already produced a company snapshot (below). Now extract raw financial line items from the financial documents provided (statements, data rooms, spreadsheets pasted as text, financial highlights mentioned in the snapshot). Extract numbers only — do not compute ratios or margins yourself, another tool will do that deterministically.

${JSON_RULES}
${financialDDSchemaRules}

SCHEMA:
${financialDDSchemaText}

COMPANY SNAPSHOT (from Agent 1):
${JSON.stringify(step1Output, null, 2)}

FINANCIAL SOURCE MATERIALS:
${docsBlock(documents)}`;
}

export function buildStep3Prompt(step1Output, step2Output, computed) {
  return `You are Agent 3 (Market Sizing Analyst) in a venture capital deal pipeline. Using the company snapshot and financial due diligence below, propose a TAM / SAM / SOM market sizing analysis. Prefer a bottom-up approach anchored to real figures when possible (e.g. current revenue, unit economics, customer counts), supplemented by top-down industry sizing where useful. Show your reasoning in "basis" fields so a human can sanity-check it. Numbers should be in the same currency as the financial data.

${JSON_RULES}

SCHEMA:
${marketSizingSchemaText}

COMPANY SNAPSHOT (Agent 1):
${JSON.stringify(step1Output, null, 2)}

FINANCIAL DD RAW DATA (Agent 2):
${JSON.stringify(step2Output, null, 2)}

COMPUTED FINANCIAL METRICS (deterministic, from Agent 2's data):
${JSON.stringify(computed, null, 2)}`;
}

export function buildStep4Prompt(step1Output, step2Output, computed, step3Output) {
  return `You are Agent 4 (Strategy & Diligence Analyst) in a venture capital deal pipeline. Apply hypothesis-driven consulting methodology (MECE issue trees, evidence-based hypothesis testing) to the company below. Identify the key business-problem hypotheses worth testing, growth opportunities, strategic alternatives, key risks, and an overall recommendation direction. Ground every claim in the data provided — flag speculation explicitly rather than presenting it as fact.

${JSON_RULES}

SCHEMA:
{
  "hypotheses": [{ "statement": string, "evidence_for": [string], "evidence_against": [string], "confidence": "High"|"Medium"|"Low", "implication": string }],
  "growth_opportunities": [{ "opportunity": string, "rationale": string, "impact": "High"|"Medium"|"Low", "effort": "High"|"Medium"|"Low" }],
  "strategic_alternatives": [{ "option": string, "pros": [string], "cons": [string], "recommended": boolean }],
  "key_risks": [{ "risk": string, "severity": "High"|"Medium"|"Low", "mitigation": string }],
  "recommendation_summary": string
}

COMPANY SNAPSHOT (Agent 1):
${JSON.stringify(step1Output, null, 2)}

FINANCIAL DD (Agent 2 raw + computed):
${JSON.stringify({ raw: step2Output, computed }, null, 2)}

MARKET SIZING (Agent 3):
${JSON.stringify(step3Output, null, 2)}`;
}

export function buildStep5Prompt(allData, knowledgeBase) {
  const kb = knowledgeBase && knowledgeBase.trim()
    ? knowledgeBase.trim()
    : '(No firm-specific guidelines were provided — use standard VC investment memo structure: Executive Summary, Company Overview, Market Analysis (TAM/SAM/SOM), Financial Due Diligence, Strategic Analysis & Risks, Recommendation.)';

  return `You are Agent 5 (Principal), the orchestrating agent in a venture capital deal pipeline. You have the complete structured output of four specialist agents below (Intake, Financial Due Diligence, Market Sizing, Strategy). Synthesize all of it into a polished venture capital investment memo, following the firm's guidelines and guardrails exactly.

FIRM GUIDELINES & GUARDRAILS:
${kb}

OUTPUT FORMAT:
- Reply with ONLY the memo itself, written in clean markdown (headings, bullet lists, tables where useful).
- No preamble like "Here is the memo", no commentary after it, no code fences.
- Where the underlying data has gaps, say so plainly rather than inventing figures.

FULL AGENT OUTPUT TO SYNTHESIZE:
${JSON.stringify(allData, null, 2)}`;
}
