'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../dictionary.js'), 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(source, sandbox);
const dictionary = sandbox.window.WRDLINK_DICTIONARY;

assert.equal(dictionary.size, 3889, 'the full original dictionary must be bundled');
assert(dictionary.has('COLD'));
assert(dictionary.has('WARM'));
assert(!dictionary.has('ZZZZ'));

function oneLetterApart(a, b) {
  if (a.length !== 4 || b.length !== 4) return false;
  let differences = 0;
  for (let i = 0; i < 4; i++) if (a[i] !== b[i]) differences++;
  return differences === 1;
}

assert(oneLetterApart('COLD', 'CORD'));
assert(oneLetterApart('CORD', 'CARD'));
assert(!oneLetterApart('COLD', 'WARM'));
assert(!oneLetterApart('COLD', 'COL'));

function score(moves) { return Math.max(0, 50 - moves); }
assert.equal(score(0), 50);
assert.equal(score(1), 49);
assert.equal(score(50), 0);
assert.equal(score(80), 0);

console.log('WRDLINK standalone checks passed.');
