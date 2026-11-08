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
    dispatch(type, event = {}) { const dispatched = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...event }; const result = this.listeners[type]?.(dispatched); this.lastEvent = dispatched; return result; },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    getAttribute(name) { return attributes.get(name); },
    append(...items) { this.children.push(...items); },
    click() { this.clicked = true; },
    getContext() { return { drawImage() {} }; },
    toBlob(callback) { callback(new Blob(['test png'], { type: 'image/png' })); },
    prepend(...items) { this.children.unshift(...items); },
    replaceChildren(...items) { this.children = [...items]; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    focus() { this.focusCalls += 1; },
    select() {},
    scrollIntoView() {},
    remove() {},
    get lastElementChild() { return this.children.at(-1); }
  };
}

function loadGame({ includeDictionary = true, search = '', savedProgress = null } = {}) {
  const elements = new Map();
  const document = {
    documentElement: { dataset: { theme: 'light' }, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, style: { setProperty() {} } },
    addEventListener() {},
    getElementById(id) {
      if (!elements.has(id)) {
        const element = makeElement();
        if (id === 'game' || id === 'error-panel' || id === 'finish-panel' || id === 'hint-confirmation') element.hidden = true;
        elements.set(id, element);
      }
      return elements.get(id);
    },
    createElement(tag) { return makeElement(tag); },
    querySelector() { return makeElement(); }
  };
  const storage = new Map();
  if (savedProgress) storage.set('wrdlink-browser-session-v1:progress', JSON.stringify(savedProgress));
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

// Campaign hints deduct from the persisted current score and submit the
// shortest route move immediately, including across a browser reload.
const campaignPuzzle = {
  id: 'campaign-hint-test', title: 'Campaign hint test', start: 'COLD', target: 'WARM',
  wordLength: 4, optimalMoves: game.shortestDistance('COLD', 'WARM')
};
const campaignHintSession = loadGame({ savedProgress: {
  version: 1, score: 25, level: 1, puzzle: campaignPuzzle,
  chain: ['COLD'], completed: false
} });
const campaignNextWord = game.shortestPath('COLD', 'WARM')[1];
assert.equal(campaignHintSession.game.useHint(), true, 'campaign hint opens confirmation');
assert.equal(campaignHintSession.game.getState().score, 25, 'opening confirmation does not change current score');
assert.equal(campaignHintSession.game.confirmHint(), true, 'confirming the hint submits the suggested move');
const campaignState = campaignHintSession.game.getState();
assert.equal(campaignState.score, 20, 'five points are deducted directly from the current score');
assert.deepEqual(campaignState.chain, ['COLD', campaignNextWord], 'hint word is submitted into the ladder immediately');
assert.equal(campaignState.activeHint, null, 'auto submitted hint is no longer pending');
assert.equal(campaignHintSession.elements.get('score-label').textContent, '20', 'header score updates immediately after hint deduction');
const secondCampaignHint = campaignHintSession.game.shortestPath(campaignNextWord, 'WARM', ['COLD'])[1];
campaignHintSession.elements.get('hint-button').dispatch('click');
assert.equal(campaignHintSession.elements.get('hint-confirm-cost').textContent, '6', 'second hint cost escalates');
assert.equal(campaignHintSession.game.getState().score, 20, 'second hint confirmation does not charge early');
campaignHintSession.elements.get('hint-confirm-button').dispatch('click');
const secondCampaignState = campaignHintSession.game.getState();
assert.equal(secondCampaignState.score, 14, 'second hint deducts six from current score');
assert.deepEqual(secondCampaignState.chain, ['COLD', campaignNextWord, secondCampaignHint], 'second hint also auto submits');
const campaignSavedProgress = JSON.parse(campaignHintSession.storage.get('wrdlink-browser-session-v1:progress'));
assert.equal(campaignSavedProgress.score, 14, 'all confirmed hint deductions are persisted in current score');
assert.equal(campaignSavedProgress.hintsUsed, 2);
assert.equal(campaignSavedProgress.hintPenalty, 11);
const campaignReload = loadGame({ savedProgress: campaignSavedProgress });
assert.equal(campaignReload.game.getState().score, 14, 'deducted score survives reload');
assert.deepEqual(campaignReload.game.getState().chain, ['COLD', campaignNextWord, secondCampaignHint], 'both auto submitted moves survive reload');
assert.equal(campaignReload.game.getState().activeHint, null, 'reload does not restore a stale pending hint');
const legacyReload = loadGame({ savedProgress: {
  version: 1, score: 7, level: 2, puzzle: campaignPuzzle,
  chain: ['COLD'], completed: false
} });
assert.equal(legacyReload.game.getState().hintsUsed, 0, 'legacy saves migrate with no hint usage');
assert.equal(legacyReload.game.getState().hintPenalty, 0, 'legacy saves migrate with no hint penalty');
const legacyPendingHint = loadGame({ savedProgress: {
  version: 2, score: 25, level: 1, puzzle: campaignPuzzle,
  chain: ['COLD'], completed: false, hintsUsed: 1, hintPenalty: 5,
  activeHint: { from: 'COLD', word: campaignNextWord }
} });
assert.equal(legacyPendingHint.game.getState().score, 20, 'legacy pending hint cost migrates out of the current score');
assert.deepEqual(legacyPendingHint.game.getState().chain, ['COLD', campaignNextWord], 'legacy pending hint is automatically submitted during migration');
assert.equal(legacyPendingHint.game.getState().activeHint, null, 'legacy pending hint is cleared after automatic submission');
assert.equal(JSON.parse(legacyPendingHint.storage.get('wrdlink-browser-session-v1:progress')).version, 3, 'migrated progress is saved in the current format');
const legacyUsedHint = loadGame({ savedProgress: {
  version: 2, score: 25, level: 1, puzzle: campaignPuzzle,
  chain: ['COLD', campaignNextWord], completed: false, hintsUsed: 1,
  hintPenalty: 5, activeHint: null
} });
assert.equal(legacyUsedHint.game.getState().score, 20, 'legacy already submitted hint cost is migrated exactly once');
assert.deepEqual(legacyUsedHint.game.getState().chain, ['COLD', campaignNextWord], 'migration does not duplicate an already submitted hint');


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
assert.equal(game.calculateHintCost(0), 5, 'first hint costs five points');
assert.equal(game.calculateHintCost(1), 6, 'second hint costs six points');
assert.equal(game.calculateHintCost(2), 7, 'third hint costs seven points');
assert.equal(game.calculateHintPenalty(3), 18, 'three hints deduct 5 + 6 + 7 points');
const coldWarmPath = game.shortestPath('COLD', 'WARM');
assert.equal(coldWarmPath[0], 'COLD');
assert.equal(coldWarmPath.at(-1), 'WARM');
assert.equal(coldWarmPath.length - 1, game.shortestDistance('COLD', 'WARM'));
for (let i = 1; i < coldWarmPath.length; i += 1) {
  assert.equal(game.differsByOneLetter(coldWarmPath[i - 1], coldWarmPath[i]), true, 'BFS path contains only legal one letter moves');
}
assert.equal(game.shortestPath('COLD', 'WARM', ['CORD']).includes('CORD'), false, 'BFS avoids words already used in the ladder');
assert.equal(game.calculatePoints(0), 25, 'each completed level starts at 25 points');
assert.equal(game.calculatePoints(5), 20, 'each valid move deducts one point');

assert.equal(elements.get('word-entry').focusCalls, 0, 'initial rendering never opens the mobile keyboard');
assert.equal(typeof elements.get('submit-button').listeners.pointerdown, 'function', 'touch submit preserves input focus');
elements.get('submit-button').dispatch('pointerdown', { pointerType: 'touch' });
assert.equal(elements.get('submit-button').lastEvent.defaultPrevented, true, 'touching Send does not blur the input before submission');

const challenge = loadGame({ search: '?challenge=COLD-WARM' });
assert.equal(challenge.game.getState().puzzle.start, 'COLD');
assert.equal(challenge.game.getState().puzzle.target, 'WARM');
assert.equal(challenge.game.getState().chain[0], 'COLD');
assert.equal(challenge.game.getState().score, 25, 'friend challenge has a 25 point starting score');

// The generated challenge artwork is tested from the production renderer.
const challengeSvg = challenge.game.createChallengeSvg();
assert.match(challengeSvg, /width="1080" height="1920" viewBox="0 0 1080 1920"/);
assert.match(challengeSvg, /stroke-width="12" stroke-dasharray="14 11" stroke-linecap="butt"/);
assert.match(challengeSvg, /font-size="238"/);
assert.match(challengeSvg, /stroke-width="12" stroke-dasharray="14 11" stroke-linecap="butt"/);
assert.match(challengeSvg, /LETTERS APART/);
assert.match(challengeSvg, /MOVES NEEDED/);
assert.match(challengeSvg, /font-size="64"[^>]*textLength="820"[^>]*>CAN YOU BRIDGE THE GAP<\/text>/, 'challenge footer headline uses reduced type size and fits within the card width');
assert.match(challengeSvg, /<text x="925" y="[^"]+"[^>]*font-size="64"[^>]*fill="#efc45c">\?<\/text>/, 'challenge footer punctuation is positioned independently inside the card');
assert.doesNotMatch(challengeSvg, /CAN YOU BRIDGE THE GAP<tspan/, 'challenge footer punctuation cannot expand the headline beyond its measured width');
assert.match(challengeSvg, /width="465" height="77"/);
assert.match(challengeSvg, /M581 1249\.25V1508\.25/);
const fiveRowLayout = challenge.game.cardLayout(5, 112, 34);
assert.equal(fiveRowLayout.ladderHeight, 696);
assert.equal(fiveRowLayout.ladderY, 569);
assert.equal(fiveRowLayout.statsY, 1281);
assert.equal(fiveRowLayout.footerY, 1556);
const threeRowLayout = challenge.game.cardLayout(3, 151, 58);
assert.equal(threeRowLayout.ladderHeight, 569);
assert.equal(threeRowLayout.ladderY, 632.5);
assert.equal(threeRowLayout.footerY, 1556);
assert.equal(typeof challenge.elements.get('share-challenge-button').listeners.click, 'function', 'challenge button has a click handler');
assert.equal(typeof challenge.elements.get('copy-challenge-button').listeners.click, 'function', 'copy link button has a click handler');
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
assert.equal(challenge.elements.get('word-entry').focusCalls, 1, 'input regains focus after submission so mobile keyboard stays available');
assert.equal([...challenge.storage.keys()].some((key) => key.includes(':progress')), false, 'friend challenges do not overwrite campaign progress');
async function testInteractions() {
  await new Promise((resolve) => setImmediate(resolve));
  await challenge.elements.get('share-challenge-button').dispatch('click');
  await challenge.elements.get('copy-challenge-button').dispatch('click');
  assert.match(challenge.copied.at(-1), /challenge=COLD-WARM/, 'copy link button copies the exact challenge URL');
  assert.equal(challenge.shareCalls.length, 1, 'challenge button opens the native share sheet');
  assert.match(challenge.shareCalls[0].url, /challenge=COLD-WARM/, 'native share includes the exact puzzle URL');
  assert.equal(challenge.shareCalls[0].files[0].name, 'wrdlink-challenge.png', 'native share includes a branded challenge card');
  assert.match(challenge.shareCalls[0].text, /Can you solve this WRDLINK word ladder/, 'challenge share asks the recipient to solve it');

  const submitWord = (word) => {
    const input = challenge.elements.get('word-entry');
    input.value = word;
    input.dispatch('input');
    challenge.elements.get('move-form').dispatch('submit');
  };
  assert.equal(challenge.game.getState().score, 25, 'friend challenge starts with its 25 point score');
  assert.equal(challenge.elements.get('hint-button').disabled, false, 'the starting score covers the first hint');
  if (challenge.game.getState().chain.at(-1) !== 'WARM') {
    const continuation = challenge.game.shortestPath(challenge.game.getState().chain.at(-1), 'WARM', challenge.game.getState().chain.slice(0, -1));
    for (const word of continuation.slice(1)) submitWord(word);
  }
  assert.equal(challenge.game.getState().chain.at(-1), 'WARM', 'the continuation reaches the target without a duplicate move');
  assert.equal(challenge.game.getState().completed, true, 'submitting the target completes the puzzle');
  const result = challenge.game.validateSequence(challenge.game.getState().puzzle, challenge.game.getState().chain);
  const finalHintState = challenge.game.getState();
  const finalAward = challenge.game.calculatePoints(result.movesUsed);
  assert.equal(finalHintState.score, 14 + finalAward, 'the final award is added after hint costs have already been deducted from current score');
  const resultSvg = challenge.game.createResultSvg(result, finalAward);
  assert.match(resultSvg, new RegExp('LEVEL SCORE[\\s\\S]*?>\\+' + finalAward + '<'));

  assert.match(resultSvg, /width="1080" height="1920" viewBox="0 0 1080 1920"/);
  assert.match(resultSvg, /SHORTEST ROUTE FOUND/);
  assert.match(resultSvg, /font-size="64"[^>]*textLength="820" lengthAdjust="spacingAndGlyphs"/, 'result footer headline is constrained to its measured safe width');
  assert.match(resultSvg, /<text x="925"[^>]*font-size="64"[^>]*fill="#efc45c">\?<\/text>/, 'gold question mark is positioned separately inside the card bounds');
  assert.doesNotMatch(resultSvg, /CAN YOU BUILD THE LADDER<tspan/, 'footer headline does not use a nested span that can bypass textLength sizing');
  assert.match(resultSvg, /font-size="238"/);
  assert.match(resultSvg, /x="639" y="[^"]+" width="43" height="4"/);
  const resultLayout = challenge.game.cardLayout(5, 112, 34);
  assert(resultLayout.statsY >= resultLayout.ladderY + resultLayout.ladderHeight, 'result statistics never overlap the ladder');
  assert(resultLayout.footerY >= resultLayout.statsY + 259, 'result footer never overlaps the statistics');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(challenge.elements.get('share-result-button').disabled, false, 'result sharing becomes available after its PNG is prepared');
  assert.equal(challenge.elements.get('download-result-button').disabled, false, 'direct PNG download becomes available after preparation');
  await challenge.elements.get('share-result-button').dispatch('click');
  assert.equal(challenge.shareCalls.length, 2, 'result button opens the native share action after challenge sharing');
  assert.equal(challenge.shareCalls[1].files[0].type, 'image/png', 'native result share receives a PNG image');

  challenge.elements.get('new-game-button').dispatch('click');
  assert.match(challenge.game.getState().puzzle.id, /^random-/, 'New game starts a fresh puzzle');
  assert.equal(challenge.game.getState().hintsUsed, 0, 'new game resets hint count');
  assert.equal(challenge.game.getState().hintPenalty, 0, 'new game resets hint deductions');
  assert.equal(challenge.game.getState().activeHint, null, 'new game clears the revealed word');
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
assert.equal(game.validateProgressSnapshot(snapshot()), true, 'legacy version one progress remains valid');
assert.equal(game.validateProgressSnapshot(snapshot({
  version: 2, hintsUsed: 2, hintPenalty: 11, activeHint: null
})), true, 'version two progress stores cumulative hint deductions');
assert.equal(game.validateProgressSnapshot(snapshot({
  version: 2, hintsUsed: 2, hintPenalty: 10, activeHint: null
})), false, 'corrupt hint penalty is rejected');
assert.equal(game.validateProgressSnapshot(snapshot({
  version: 2, hintsUsed: 1, hintPenalty: 5,
  activeHint: { from: 'COLD', word: 'WARM' }
})), false, 'invalid active hint word is rejected');
assert.equal(game.validateProgressSnapshot(snapshot({ score: -1 })), false);
assert.equal(game.validateProgressSnapshot(snapshot({ level: 0 })), false);
assert.equal(game.validateProgressSnapshot(snapshot({ puzzle: { ...puzzle, target: 'ZZZZ' } })), false);
assert.equal(game.validateProgressSnapshot(snapshot({ puzzle: { ...puzzle, optimalMoves: 99 } })), false);
assert.equal(game.validateProgressSnapshot(snapshot({ chain: ['COLD', 'CORD'], completed: true })), false);
assert.equal(game.validateProgressSnapshot(snapshot({ chain: ['COLD', 'CORD', 'CARD', 'WARD', 'WARM'], completed: true })), true);
assert.equal(game.validateProgressSnapshot(snapshot({ chain: ['COLD', 'CORD', 'COLD'] })), false);

const lowBudget = loadGame({ savedProgress: {
  version: 2, score: 4, level: 1, puzzle,
  chain: ['COLD', 'CORD', 'CARD', 'WARD'], completed: false,
  hintsUsed: 3, hintPenalty: 18, activeHint: null
} });
assert.equal(lowBudget.game.getState().hintsUsed, 3);
assert.equal(lowBudget.game.getState().hintPenalty, 18);
assert.equal(lowBudget.elements.get('hint-button').disabled, true, 'hint is disabled when the current score cannot cover the next cost');
assert.match(lowBudget.elements.get('hint-button').getAttribute('aria-label'), /Not enough score.*Costs 8, current score 0/);
assert.equal(lowBudget.elements.get('hint-confirmation').hidden, true, 'an unaffordable hint never opens confirmation');
assert.equal(lowBudget.game.useHint(), false, 'an unaffordable hint cannot be used');
assert.equal(lowBudget.game.getState().hintsUsed, 3, 'an unaffordable hint does not increment the hint count');
assert.equal(lowBudget.game.getState().hintPenalty, 18, 'an unaffordable hint does not deduct points');

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
