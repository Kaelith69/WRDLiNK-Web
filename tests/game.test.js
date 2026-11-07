'use strict';

// Exercise the actual browser game implementation in a small DOM harness.
// The test deliberately does not reimplement adjacency, validation, or scoring.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const dictionarySource = fs.readFileSync(require.resolve('../dictionary.js'), 'utf8');
const appSource = fs.readFileSync(require.resolve('../app.js'), 'utf8');

function makeElement() {
  const attributes = new Map();
  return {
    hidden: false,
    value: '',
    textContent: '',
    className: '',
    children: [],
    style: {},
    focusCalls: 0,
    listeners: {},
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener(type, callback) { this.listeners[type] = callback; },
    dispatch(type, event = {}) { return this.listeners[type]?.({ preventDefault() {}, ...event }); },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    getAttribute(name) { return attributes.get(name); },
    append(...items) { this.children.push(...items); },
    click() { this.clicked = true; },
    getContext() { return { drawImage() {} }; },
    toBlob(callback) { callback(new Blob(['test png'], { type: 'image/png' })); },
    prepend(...items) { this.children.unshift(...items); },
    replaceChildren(...items) { this.children = [...items]; },
    querySelector() { return null; },
    focus() { this.focusCalls += 1; },
    select() {},
    scrollIntoView() {},
    remove() {},
    get lastElementChild() { return this.children.at(-1); }
  };
}

function loadGame({ includeDictionary = true, search = '' } = {}) {
  const elements = new Map();
  const document = {
    documentElement: { dataset: { theme: 'light' }, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, style: { setProperty() {} } },
    getElementById(id) {
      if (!elements.has(id)) {
        const element = makeElement();
        if (id === 'game' || id === 'error-panel' || id === 'finish-panel') element.hidden = true;
        elements.set(id, element);
      }
      return elements.get(id);
    },
    createElement(tag) { return makeElement(tag); },
    querySelector() { return makeElement(); }
  };
  const storage = new Map();
  const localStorage = {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); }
  };
  const copied = [];
  const shareCalls = [];
  const window = {
    isSecureContext: true,
    innerWidth: 390,
    matchMedia() { return { matches: true }; },
    setTimeout(callback) { callback(); },
    addEventListener() {},
    location: { search, href: 'https://example.test/WRDLiNK-Web/' },
    requestAnimationFrame(callback) { callback(); }
  };
  const navigator = {
    clipboard: { async writeText(value) { copied.push(value); } },
    canShare() { return true; },
    async share(data) { shareCalls.push(data); }
  };
  class MockImage { async decode() {} set src(value) { this.source = value; } }
  const context = vm.createContext({
    window, document, localStorage, navigator, URLSearchParams, URL, File, Blob, Image: MockImage,
    crypto: { randomUUID: () => 'test-session' },
    structuredClone: (value) => JSON.parse(JSON.stringify(value)),
    console: { warn() {}, error() {}, log() {} }
  });
  if (includeDictionary) vm.runInContext(dictionarySource, context, { filename: 'dictionary.js' });
  const dictionary = window.WRDLINK_DICTIONARY || new Set();
  if (includeDictionary) assert.equal(dictionary.size, 3889, 'the complete bundled dictionary is unchanged');
  vm.runInContext(appSource, context, { filename: 'app.js' });
  return { game: window.WRDLINK, dictionary, storage, elements, copied, shareCalls };
}

const { game, dictionary, elements } = loadGame();
assert.equal(game.dictionarySize, 3889);

// A missing dictionary must reach the existing recovery UI, not throw while
// building the word index at script evaluation time.
const missingDictionary = loadGame({ includeDictionary: false });
assert.equal(missingDictionary.game.dictionarySize, 0);
assert.equal(missingDictionary.elements.get('error-panel').hidden, false);
assert.match(missingDictionary.elements.get('error-message').textContent, /dictionary failed to load/i);
assert(dictionary.has('COLD'));
assert(dictionary.has('WARM'));
assert(!dictionary.has('ZZZZ'));

// These assertions call the production adjacency and scoring functions.
assert.equal(game.differsByOneLetter('COLD', 'CORD'), true);
assert.equal(game.differsByOneLetter('CORD', 'CARD'), true);
assert.equal(game.differsByOneLetter('COLD', 'WARM'), false);
assert.equal(game.differsByOneLetter('COLD', 'COL'), false);
assert.equal(game.calculatePoints(0), 25);
assert.equal(game.calculatePoints(1), 24);
assert.equal(game.calculatePoints(25), 0);
assert.equal(game.calculatePoints(80), 0);
assert.equal(game.calculatePoints(0), 25, 'each completed level starts at 25 points');
assert.equal(game.calculatePoints(5), 20, 'each valid move deducts one point');

assert.equal(elements.get('word-entry').focusCalls, 0, 'initial rendering never opens the mobile keyboard');

const challenge = loadGame({ search: '?challenge=COLD-WARM' });
assert.equal(challenge.game.getState().puzzle.start, 'COLD');
assert.equal(challenge.game.getState().puzzle.target, 'WARM');
assert.equal(challenge.game.getState().chain[0], 'COLD');
assert.equal(challenge.game.getState().score, 0);
assert.equal(typeof challenge.elements.get('share-challenge-button').listeners.click, 'function', 'challenge button has a click handler');
assert.equal(typeof challenge.elements.get('share-result-button').listeners.click, 'function', 'result button has a click handler');
assert.equal(typeof challenge.elements.get('download-result-button').listeners.click, 'function', 'download button has a click handler');
assert.equal(typeof challenge.elements.get('new-game-button').listeners.click, 'function', 'new game button has a click handler');
assert.equal(typeof challenge.elements.get('next-button').listeners.click, 'function', 'next level button has a click handler');
assert.equal(typeof challenge.elements.get('theme-toggle').listeners.click, 'function', 'theme button has a click handler');
challenge.elements.get('word-entry').value = 'cord';
challenge.elements.get('word-entry').dispatch('input');
assert.equal(challenge.elements.get('word-entry').value, 'CORD', 'input normalizes words before submission');
assert.equal(challenge.elements.get('submit-button').disabled, false, 'valid length enables submit');
challenge.elements.get('move-form').dispatch('submit');
assert.deepEqual(challenge.game.getState().chain, ['COLD', 'CORD'], 'submitting a valid move updates the live game');
assert.equal([...challenge.storage.keys()].some((key) => key.includes(':progress')), false, 'friend challenges do not overwrite campaign progress');
async function testInteractions() {
  await challenge.elements.get('share-challenge-button').dispatch('click');
  assert.match(challenge.copied[0], /challenge=COLD-WARM/, 'challenge button copies the exact puzzle URL');

  const submitWord = (word) => {
    const input = challenge.elements.get('word-entry');
    input.value = word;
    input.dispatch('input');
    challenge.elements.get('move-form').dispatch('submit');
  };
  submitWord('CARD');
  submitWord('WARD');
  submitWord('WARM');
  assert.equal(challenge.game.getState().completed, true, 'submitting the target completes the puzzle');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(challenge.elements.get('share-result-button').disabled, false, 'result sharing becomes available after its PNG is prepared');
  assert.equal(challenge.elements.get('download-result-button').disabled, false, 'direct PNG download becomes available after preparation');
  await challenge.elements.get('share-result-button').dispatch('click');
  assert.equal(challenge.shareCalls.length, 1, 'result button opens the native share action');
  assert.equal(challenge.shareCalls[0].files[0].type, 'image/png', 'native share receives a PNG image');

  challenge.elements.get('new-game-button').dispatch('click');
  assert.match(challenge.game.getState().puzzle.id, /^random-/, 'New game starts a fresh puzzle');
  challenge.elements.get('theme-toggle').dispatch('click');
  assert.equal(challenge.elements.get('theme-toggle').getAttribute('aria-pressed'), 'true', 'theme button toggles the theme state');
}

testInteractions().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

const puzzle = {
  id: 'test-puzzle', title: 'Test puzzle', start: 'COLD', target: 'WARM',
  wordLength: 4, optimalMoves: game.shortestDistance('COLD', 'WARM')
};
assert(Number.isInteger(puzzle.optimalMoves) && puzzle.optimalMoves > 0);
assert.equal(game.validateSequence(puzzle, ['COLD', 'CORD']).valid, true);
assert.equal(game.validateSequence(puzzle, ['COLD', 'WARM']).valid, false);
assert.equal(game.validateSequence(puzzle, ['COLD', 'CORD', 'CARD', 'WARD', 'WARM']).complete, true);
assert.equal(game.validateSequence(puzzle, ['COLD', 'CORD', 'COLD']).valid, false);
assert.equal(game.validateSequence(puzzle, ['COLD', 'ZZZZ']).valid, false);

const snapshot = (overrides = {}) => ({
  version: 1, score: 12, level: 2, puzzle,
  chain: ['COLD'], completed: false, ...overrides
});
assert.equal(game.validateProgressSnapshot(snapshot()), true, 'a fresh untouched puzzle is valid');
assert.equal(game.validateProgressSnapshot(snapshot({ score: -1 })), false);
assert.equal(game.validateProgressSnapshot(snapshot({ level: 0 })), false);
assert.equal(game.validateProgressSnapshot(snapshot({ puzzle: { ...puzzle, target: 'ZZZZ' } })), false);
assert.equal(game.validateProgressSnapshot(snapshot({ puzzle: { ...puzzle, optimalMoves: 99 } })), false);
assert.equal(game.validateProgressSnapshot(snapshot({ chain: ['COLD', 'CORD'], completed: true })), false);
assert.equal(game.validateProgressSnapshot(snapshot({ chain: ['COLD', 'CORD', 'CARD', 'WARD', 'WARM'], completed: true })), true);
assert.equal(game.validateProgressSnapshot(snapshot({ chain: ['COLD', 'CORD', 'COLD'] })), false);
const sparseChain = ['COLD', , 'WARM'];
assert.equal(game.validateProgressSnapshot(snapshot({ chain: sparseChain })), false);

// The production generator must always return a dictionary backed, solvable puzzle.
for (let attempt = 0; attempt < 12; attempt += 1) {
  const generated = game.createRandomPuzzle();
  assert(dictionary.has(generated.start));
  assert(dictionary.has(generated.target));
  assert.notEqual(generated.start, generated.target);
  assert.equal(generated.wordLength, 4);
  assert.equal(game.shortestDistance(generated.start, generated.target), generated.optimalMoves);
}

console.log('WRDLINK production logic and persistence checks passed.');
