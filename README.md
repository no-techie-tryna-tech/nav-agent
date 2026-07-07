# Memo Agent

A 5-agent pipeline (principal + 4 specialists) for building venture capital
investment memos, designed to run entirely on a Claude Pro subscription — no
API key, no per-use cost.

The five agents:

1. **Intake** — skims source documents (pitch decks, news, prelim analysis) into a structured company snapshot.
2. **Financial DD** — extracts raw financial line items; QoE add-backs, margins, growth, working capital (DSO/DPO/DIO), and free cash flow are then computed deterministically by code, not AI, so the math is exact.
3. **Market sizing** — proposes a TAM/SAM/SOM model; assumptions can be re-run instantly without further AI calls.
4. **Strategy** — hypothesis-driven consulting analysis: growth opportunities, strategic alternatives, key risks.
5. **Memo (Principal)** — synthesizes everything into a full investment memo following the guidelines in the knowledge base.

It comes in two modes that share the same agent design and the same math
(`memo-agent/js/calc.js`):

## Mode 1 — Automated (Claude Code)

Fully end-to-end, no copy-paste. Works in any Claude Code session on this
repo (e.g. claude.ai/code in the browser — nothing to install).

1. Put deal documents in `deals/<company>/docs/` (or just attach them in the session).
2. Say: **`/memo <company>`**
3. The Principal runs all four sub-agents in order, runs the deterministic
   calculations, and writes the finished memo to `deals/<company>/memo.md`,
   with every intermediate stage saved as JSON alongside it for review.

Firm-wide memo guidelines live in [`knowledge-base.md`](knowledge-base.md) —
edit that file to change how every memo is written.

## Mode 2 — Web app (manual copy-paste)

A static page for when you want to drive each step by hand in a claude.ai
chat: it generates each agent's prompt, you paste Claude's reply back, and it
stores, computes, and assembles the results. Uploads (PDF/DOCX/TXT) are
extracted fully client-side; projects auto-save to the browser with JSON
export/import.

Live at `https://<your-github-username>.github.io/nav-agent/memo-agent/` once
GitHub Pages is enabled (Settings → Pages → Deploy from branch → main).

## Understanding and tuning the agents

Each agent is a plain-text prompt you can read and edit. The two modes keep
them in different places:

| Agent | Automated mode (Claude Code) | Web app mode |
| --- | --- | --- |
| 1 Intake | `.claude/agents/intake-analyst.md` | `buildStep1Prompt` in `memo-agent/js/prompts.js` |
| 2 Financial DD | `.claude/agents/financial-dd-analyst.md` | `buildStep2Prompt` |
| 3 Market sizing | `.claude/agents/market-sizing-analyst.md` | `buildStep3Prompt` |
| 4 Strategy | `.claude/agents/strategy-analyst.md` | `buildStep4Prompt` |
| 5 Principal / Memo | `.claude/skills/memo/SKILL.md` | `buildStep5Prompt` |

Tuning levers, roughly in order of impact:

- **The rules block** of each prompt (what to prioritize, what counts as an
  add-back, how many hypotheses) — this is where most quality comes from.
- **The JSON schema** — add a field and it flows through: the automated mode
  saves whatever the agent returns, and the memo stage reads the saved JSON.
  (In the web app, also render the new field in `memo-agent/js/render.js`.)
- **`knowledge-base.md`** — memo structure, tone, and hard guardrails,
  without touching any agent.
- **The deterministic math** in `memo-agent/js/calc.js` — shared by both
  modes (the CLI wrapper is `scripts/compute-financials.mjs`); changing a
  formula here changes it everywhere, and keeps arithmetic out of the AI's
  hands.

If you edit an agent's schema, keep the two modes' prompts in sync so a
project started in one mode stays readable by your eyes in the other.
