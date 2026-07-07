# nav-agent

## Memo Agent

`memo-agent/` is a 5-agent pipeline for building venture capital investment memos, designed to run entirely on a Claude Pro subscription — no API key, no per-use cost.

Each stage generates a ready-to-paste prompt: you copy it into a claude.ai chat, paste Claude's reply back into the app, and it stores, computes, and hands the result to the next stage.

1. **Intake** — upload source documents (pitch decks, news, prelim analysis); Claude skims them into a structured company snapshot.
2. **Financial DD** — Claude extracts raw financial line items; the app computes QoE add-backs, margins, growth, working capital (DSO/DPO/DIO), and free cash flow deterministically in JavaScript.
3. **Market sizing** — Claude proposes a TAM/SAM/SOM model; adjustable sliders let you re-run assumptions instantly with no extra AI calls.
4. **Strategy** — hypothesis-driven consulting analysis: growth opportunities, strategic alternatives, key risks.
5. **Memo (Principal agent)** — synthesizes all of the above into a full investment memo, following firm-specific guidelines you save once in the built-in knowledge base.

PDF/DOCX text extraction runs fully client-side (vendored `pdf.js` and `mammoth.js`, no external requests). Projects auto-save to your browser and can be exported/imported as JSON.

To use it, open `memo-agent/index.html` via a local server or enable GitHub Pages for this repo and visit `.../memo-agent/`.