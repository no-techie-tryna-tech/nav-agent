# Memo guidelines & guardrails (knowledge base)

This file is read by the Principal agent in stage 5 of the `/memo` pipeline.
Edit it to control how every memo is written — section order, tone, hard
rules. Replace the defaults below with your firm's actual guidelines, or
paste in text from your firm's memo template.

## Required sections, in order

1. Executive Summary (max half a page: the ask, the thesis, the recommendation)
2. Company Overview (product, business model, team)
3. Market (TAM/SAM/SOM with the derivation shown, growth drivers)
4. Financial Due Diligence (QoE-adjusted figures, margins, working capital, cash flow)
5. Strategic Analysis (key hypotheses with evidence, growth opportunities, alternatives)
6. Risks & Mitigations
7. Recommendation

## Tone & style

- Concise and neutral. No hype language ("massive", "explosive", "unicorn").
- Every number must be traceable to a source document or the computed metrics.
- State data gaps explicitly; never smooth over missing information.
- Use tables for financial figures, prose for reasoning.

## Publishing

- Notion destination: (not configured — set this to a Notion database or
  parent page name/URL, e.g. "Deal Memos database". Stage 6 of the /memo
  pipeline publishes the finished memo there when the Notion connector is
  available in the session.)

## Hard guardrails

- Always flag customer concentration above 20% of revenue in Risks.
- Always show reported vs QoE-adjusted EBITDA side by side.
- The Recommendation section must end with a clear next step (pass / proceed
  to partner review / proceed with conditions), never "wait and see".
