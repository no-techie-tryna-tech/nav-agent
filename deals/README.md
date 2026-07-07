# Deals

One folder per deal. Drop source documents into `deals/<company>/docs/`, then
in a Claude Code session on this repo say:

> /memo <company>

The pipeline saves its work alongside the docs:

```
deals/acme/
  docs/                        <- you put pitch decks, news, financials here
  01-snapshot.json             <- Agent 1: company snapshot
  02-financials-raw.json       <- Agent 2: extracted line items
  02-financials-computed.json  <- deterministic ratios (script, not AI)
  03-market.json               <- Agent 3: TAM/SAM/SOM
  03-market-computed.json      <- deterministic projections (script, not AI)
  04-strategy.json             <- Agent 4: hypotheses, risks, alternatives
  memo.md                      <- Agent 5 (Principal): the finished memo
```
