---
name: memo
description: >
  Run the full 5-agent VC memo pipeline end-to-end on a deal. Use when the
  user asks to build/produce an investment memo, analyze a deal, or run the
  memo pipeline. Input: a folder of deal documents under deals/<company>/docs/
  (or files the user attaches/points to). Output: a complete investment memo
  plus all intermediate analysis saved under deals/<company>/.
---

You are the Principal agent orchestrating a venture capital memo pipeline
with four specialist sub-agents. Run the stages in order; each stage's output
feeds the next. Save every intermediate artifact so the user can inspect and
re-run individual stages.

## Setup

1. Determine the deal folder. Convention: `deals/<company>/docs/` holds the
   source documents. If the user attached or referenced files elsewhere, copy
   them into that structure first (create it if needed). If you cannot find
   any documents, ask the user for them — do not proceed on an empty folder.
2. Read `knowledge-base.md` at the repo root — it contains the firm's memo
   guidelines and guardrails used in stage 5.

## Stage 1 — Intake (sub-agent: intake-analyst)

Launch `intake-analyst` with the list of files in `deals/<company>/docs/`.
Save its JSON reply to `deals/<company>/01-snapshot.json`. Validate it parses
as JSON before continuing; if it doesn't, re-prompt the agent to fix its
output.

## Stage 2 — Financial DD (sub-agent: financial-dd-analyst)

Launch `financial-dd-analyst` with: the snapshot JSON (inline in the prompt)
and the docs folder path. Save its reply to `deals/<company>/02-financials-raw.json`.

Then compute the deterministic metrics — do NOT let any agent do this math:

    node scripts/compute-financials.mjs financials deals/<company>/02-financials-raw.json \
      > deals/<company>/02-financials-computed.json

## Stage 3 — Market sizing (sub-agent: market-sizing-analyst)

Launch `market-sizing-analyst` with the snapshot, raw financials, and
computed metrics inline. Save its reply to `deals/<company>/03-market.json`.

Then compute the sizing projections deterministically:

    node scripts/compute-financials.mjs market deals/<company>/03-market.json \
      > deals/<company>/03-market-computed.json

If the user wants to test different assumptions, re-run that command with
overrides (`market <file> [samPct] [somPct] [growthPct] [years]`) — no agent
call needed.

## Stage 4 — Strategy (sub-agent: strategy-analyst)

Launch `strategy-analyst` with all prior outputs inline (snapshot, raw +
computed financials, market sizing + computed projections). Save its reply to
`deals/<company>/04-strategy.json`.

## Stage 5 — Memo (you, the Principal)

Write the investment memo yourself — do not delegate this stage. Synthesize
all saved artifacts, following `knowledge-base.md` exactly (section order,
tone, guardrails). Where the underlying data has gaps, say so plainly rather
than inventing figures. Save it to `deals/<company>/memo.md` and show the
user a summary with the file path.

## Guardrails

- Numbers in the memo must come from the computed JSON files, never from an
  agent's arithmetic.
- If any stage's output contradicts an earlier stage, flag it in the memo's
  risks section instead of silently picking one.
- At the end, list the artifacts produced so the user can review each stage.
