#!/usr/bin/env node
// @ts-check
// Method-agnostic CLI for the valuation engine. Every method registered in
// memo-agent/engine/index.js is runnable here with the same syntax; the memo
// pipeline uses this between agent stages so no AI ever does the arithmetic.
//
// Usage:
//   node scripts/engine-cli.mjs list
//   node scripts/engine-cli.mjs assumptions <method>
//   node scripts/engine-cli.mjs run <method> <input.json> [key=value ...]
//
// Examples:
//   node scripts/engine-cli.mjs run financial-dd deals/acme/02-financials-raw.json
//   node scripts/engine-cli.mjs run market-sizing deals/acme/03-market.json somPct=25 years=7
//
// Output: the standardized MethodResult envelope as JSON on stdout.
// Exit codes: 0 ok, 1 usage error, 2 method reported input errors (result.ok=false).

import { readFileSync } from 'node:fs';
import { getMethod, listMethods } from '../memo-agent/engine/index.js';

const [, , command, ...args] = process.argv;

function usage() {
  console.error('Usage:');
  console.error('  engine-cli.mjs list');
  console.error('  engine-cli.mjs assumptions <method>');
  console.error('  engine-cli.mjs run <method> <input.json> [key=value ...]');
  process.exit(1);
}

try {
  if (command === 'list') {
    console.log(JSON.stringify(listMethods(), null, 2));
  } else if (command === 'assumptions') {
    const [methodId] = args;
    if (!methodId) usage();
    console.log(JSON.stringify(getMethod(methodId).assumptionDefs, null, 2));
  } else if (command === 'run') {
    const [methodId, file, ...pairs] = args;
    if (!methodId || !file) usage();
    /** @type {Object<string, string>} */
    const overrides = {};
    for (const pair of pairs) {
      const eq = pair.indexOf('=');
      if (eq <= 0) {
        console.error(`Bad assumption override "${pair}" — expected key=value.`);
        process.exit(1);
      }
      overrides[pair.slice(0, eq)] = pair.slice(eq + 1);
    }
    const inputs = JSON.parse(readFileSync(file, 'utf8'));
    const result = getMethod(methodId).run(inputs, overrides);
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exit(2);
  } else {
    usage();
  }
} catch (err) {
  console.error(String(err instanceof Error ? err.message : err));
  process.exit(1);
}
