// @ts-check
// CANONICAL agent I/O schemas — the single source of truth.
//
// Consumers:
//   - memo-agent/js/prompts.js renders these into the web app's copy-paste
//     prompts, so the manual mode always asks for exactly this shape.
//   - .claude/agents/*.md instruct the automated pipeline's sub-agents to
//     match these schemas (the agent files carry a copy for readability; when
//     editing, change HERE first and mirror there).
//   - engine/core/validate.js validates inputs against these shapes.
//
// Changing a schema? Update the matching validator and the agent .md mirror,
// and add a test.

export const financialDDSchemaText = `{
  "currency": string,
  "periods": [string],
  "income_statement": {
    "revenue": [number|null],
    "cogs": [number|null],
    "gross_profit": [number|null],
    "opex": [number|null],
    "ebitda_reported": [number|null],
    "d_and_a": [number|null],
    "net_income": [number|null]
  },
  "addbacks": [{ "label": string, "period": string, "amount": number, "rationale": string, "source_doc": string|null }],
  "balance_sheet": {
    "accounts_receivable": [number|null],
    "inventory": [number|null],
    "accounts_payable": [number|null],
    "cash": [number|null],
    "total_debt": [number|null]
  },
  "cash_flow": {
    "operating_cash_flow": [number|null],
    "capex": [number|null]
  },
  "customer_concentration": string | null,
  "provenance": [{ "item": string, "source_doc": string, "location": string }],
  "notes": [string]
}`;

export const financialDDSchemaRules = `- Use plain numbers (no currency symbols, no commas), in the currency's base unit (e.g. dollars, not thousands) unless the source only gives rounded units — note that in "notes".
- "d_and_a" is depreciation + amortisation as a POSITIVE expense amount; "total_debt" is gross interest-bearing debt. Both feed the valuation models downstream (DCF needs D&A; net debt = total_debt - cash).
- "periods" must line up positionally across every array (income_statement, balance_sheet, cash_flow) — e.g. periods[0] corresponds to revenue[0], accounts_receivable[0], etc.
- "provenance": for each material line item, record which document (and page/section if identifiable) the numbers came from — e.g. {"item": "income_statement.revenue", "source_doc": "FY25_financials.pdf", "location": "p.3 income statement"}. An analyst must be able to trace every number back to a source.
- "source_doc" on each add-back: the document the add-back was identified from (null only if genuinely unclear).
- If financial data is sparse or unavailable, still return the schema with null/[] and explain the gap in "notes" — do not fabricate figures.`;

export const marketSizingSchemaText = `{
  "methodology": "top-down" | "bottom-up" | "both",
  "tam": { "value": number, "unit": string, "basis": string },
  "sam": { "value": number, "pct_of_tam": number, "basis": string },
  "som": { "value": number, "pct_of_sam": number, "timeframe": string, "basis": string },
  "market_growth_rate_pct": number,
  "key_assumptions": [string],
  "sources_implied": [string]
}`;
