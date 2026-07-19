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

    node scripts/engine-cli.mjs run financial-dd deals/<company>/02-financials-raw.json \
      > deals/<company>/02-financials-computed.json

The output is a MethodResult envelope. Check its `ok` field: if false, the
`errors` array explains what is wrong with the agent's extraction — re-prompt
the agent to fix those specific problems. Always read the `warnings` array
and carry material warnings into the memo's data-quality notes.

## Stage 3 — Market sizing (sub-agent: market-sizing-analyst)

Launch `market-sizing-analyst` with the snapshot, raw financials, and
computed metrics inline. Save its reply to `deals/<company>/03-market.json`.

Then compute the sizing projections deterministically:

    node scripts/engine-cli.mjs run market-sizing deals/<company>/03-market.json \
      > deals/<company>/03-market-computed.json

If the user wants to test different assumptions, re-run with overrides — no
agent call needed:

    node scripts/engine-cli.mjs run market-sizing deals/<company>/03-market.json somPct=25 years=7

`node scripts/engine-cli.mjs assumptions market-sizing` lists every editable
assumption with its metadata (range, unit, description).

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

## Stage 6 — Publish to Notion (optional)

After the memo is saved, check whether Notion MCP tools are available in this
session (tool names starting with `mcp__notion` / `mcp__Notion` — use
ToolSearch to look for them; they exist only if the user has connected the
Notion connector).

- If available: read the "Publishing" section of `knowledge-base.md` for the
  destination (a Notion database or parent page). If no destination is
  configured there, ask the user where to publish. Create a page titled
  "Investment Memo — <Company>" with the full memo content, preserving the
  heading structure and tables. Confirm the page URL back to the user.
  Publishing is outward-facing: if anything about the destination is
  ambiguous, confirm with the user before creating the page.
- If not available and the user asked to publish: tell them to connect
  Notion at claude.ai → Settings → Connectors → Notion → Connect, then
  start a new session and re-run just this stage (the memo is already saved,
  so nothing else needs to re-run).

## Guardrails

- Numbers in the memo must come from the computed JSON files, never from an
  agent's arithmetic.
- If any stage's output contradicts an earlier stage, flag it in the memo's
  risks section instead of silently picking one.
- At the end, list the artifacts produced so the user can review each stage.
