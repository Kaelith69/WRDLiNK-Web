/* global WRDLINK_DICTIONARY */
'use strict';

(() => {
  // The dictionary script is loaded before this file. Validate it before
  // indexing so a missing or malformed asset reaches the designed error UI.
  const DICTIONARY = window.WRDLINK_DICTIONARY;
  const WORD_LENGTH = 4;
  const BASE_LEVEL_POINTS = 25;
  const MAX_PUZZLE_ATTEMPTS = 100;
  const PROGRESS_KEY = 'wrdlink-browser-session-v1:progress';

  const $ = (id) => document.getElementById(id);
  const elements = {
    loading: $('loading'), game: $('game'), errorPanel: $('error-panel'),
    errorMessage: $('error-message'), startWord: $('start-word'), targetWord: $('target-word'),
    chainList: $('chain-list'),
    scoreLabel: $('score-label'), movesLabel: $('moves-label'), levelLabel: $('level-label'),
    form: $('move-form'), input: $('word-entry'), submit: $('submit-button'),
    message: $('message'), entryPanel: $('entry-panel'), finishPanel: $('finish-panel'),
    finishTitle: $('finish-title'), finishDescription: $('finish-description'), shareStatus: $('share-status'),
    nextButton: $('next-button'), newGameButton: $('new-game-button'), retryButton: $('retry-button'), themeToggle: $('theme-toggle'), shareChallengeButton: $('share-challenge-button'), copyChallengeButton: $('copy-challenge-button'), shareResultButton: $('share-result-button'), downloadResultButton: $('download-result-button')
  };

  // Game session mirrors server SessionState: accumulated score, level,
  // current puzzle and whether the current puzzle has already been completed.
  let state = {
    score: 0,
    level: 1,
    puzzle: null,
    chain: [],
    completed: false
  };
  let busy = false;
  let externalProgressChanged = false;
  let challengeSession = false;
  let puzzleTransition = false;
  let preparedResultFile = null;
  let resultPreparationId = 0;
  let resultPreparationPending = false;
  let keyboardFocusViewportHeight = null;
  let challengeCardFile = null;
  let challengeCardPending = false;
  let challengeCardPreparationId = 0;

  // Theme choice is independent from game progress and persists per browser.
  function applyTheme(theme) {
    const nextTheme = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = nextTheme;
    const darkActive = nextTheme === 'dark';
    elements.themeToggle.setAttribute('aria-label', darkActive ? 'Switch to light mode' : 'Switch to dark mode');
    elements.themeToggle.setAttribute('aria-pressed', String(darkActive));
    const themeColor = darkActive ? '#172322' : '#f3f0e8';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor);
    try { localStorage.setItem('wrdlink-theme', nextTheme); } catch (error) {
      console.warn('Theme preference could not be saved.', error);
    }
  }

  elements.themeToggle.addEventListener('click', () => {
    const current = document.documentElement.dataset.theme;
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });
  applyTheme(document.documentElement.dataset.theme || 'light');

  function randomItem(items) {
    const item = items[Math.floor(Math.random() * items.length)];
    if (!item) throw new Error('Cannot choose an item from an empty collection.');
    return item;
  }

  function differsByOneLetter(first, second) {
    if (first.length !== second.length) return false;
    let differences = 0;
    for (let index = 0; index < first.length; index += 1) {
      if (first[index] !== second[index] && ++differences > 1) return false;
    }
    return differences === 1;
  }

  // Precompute dictionary words and one-letter neighborhoods once. The
  // original backend filters the full word list on every neighbor request.
  // This indexed form makes random puzzle generation substantially cheaper.
  const WORDS = DICTIONARY instanceof Set
    ? [...DICTIONARY].filter((word) => typeof word === 'string' && /^[A-Z]{4}$/.test(word))
    : [];
  const WORD_SET = new Set(WORDS);
  const PATTERN_INDEX = new Map();

  function buildNeighborIndex() {
    for (const word of WORDS) {
      for (let position = 0; position < WORD_LENGTH; position += 1) {
        const pattern = `${word.slice(0, position)}_${word.slice(position + 1)}`;
        const bucket = PATTERN_INDEX.get(pattern) || [];
        bucket.push(word);
        PATTERN_INDEX.set(pattern, bucket);
      }
    }
  }

  function neighbors(word) {
    const found = new Set();
    for (let position = 0; position < WORD_LENGTH; position += 1) {
      const pattern = `${word.slice(0, position)}_${word.slice(position + 1)}`;
      for (const candidate of PATTERN_INDEX.get(pattern) || []) {
        if (candidate !== word) found.add(candidate);
      }
    }
    return [...found];
  }

  // Breadth first search returns the true shortest word ladder distance.
  function shortestDistance(start, target) {
    const distances = new Map([[start, 0]]);
    const queue = [start];
    let head = 0;

    while (head < queue.length) {
      const current = queue[head++];
      const distance = distances.get(current) ?? 0;
      if (current === target) return distance;
      for (const neighbor of neighbors(current)) {
        if (!distances.has(neighbor)) {
          distances.set(neighbor, distance + 1);
          queue.push(neighbor);
        }
      }
    }
    return null;
  }

  function createRandomPuzzle() {
    for (let attempt = 0; attempt < MAX_PUZZLE_ATTEMPTS; attempt += 1) {
      const start = randomItem(WORDS);
      const route = [start];
      const visited = new Set(route);
      const desiredMoves = 3 + Math.floor(Math.random() * 5);

      while (route.length - 1 < desiredMoves) {
        const current = route[route.length - 1];
        const choices = neighbors(current).filter((word) => !visited.has(word));
        if (choices.length === 0) break;
        const next = randomItem(choices);
        route.push(next);
        visited.add(next);
      }

      const target = route[route.length - 1];
      const optimalMoves = target ? shortestDistance(start, target) : null;
      if (target && target !== start && optimalMoves !== null && route.length > 2) {
        return {
          id: `random-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
          title: 'Random puzzle', start, target,
          wordLength: WORD_LENGTH, optimalMoves
        };
      }
    }
    throw new Error('WRDLINK could not generate a solvable random puzzle.');
  }

  // Kept structurally equivalent to the server's validateSequence routine.
  // Dictionary validation is local because this build has no server/API.
  function validateSequence(puzzle, rawWords) {
    if (rawWords.length < 2) return invalid('Enter a word to continue.');
    const words = rawWords.map((word) => word.trim().toUpperCase());
    const movesUsed = words.length - 1;
    const currentWord = words[words.length - 1];
    const wordPattern = new RegExp(`^[A-Z]{${puzzle.wordLength}}$`);

    if (words[0] !== puzzle.start) return invalid(`Start with ${puzzle.start}.`, movesUsed);
    if (words.some((word) => !wordPattern.test(word))) {
      return invalid(`Every word must contain exactly ${puzzle.wordLength} letters.`, movesUsed);
    }
    if (words.some((word) => !WORD_SET.has(word))) {
      return invalid('That word is not in the dictionary.', movesUsed);
    }
    if (new Set(words).size !== words.length) {
      return invalid('You cannot use the same word twice.', movesUsed);
    }

    for (let index = 1; index < words.length; index += 1) {
      if (!differsByOneLetter(words[index - 1], words[index])) {
        return invalid('Change exactly one letter per move.', movesUsed);
      }
      if (words[index] === puzzle.target && index !== movesUsed) {
        return invalid('The target must be your final word.', movesUsed);
      }
    }

    if (currentWord === puzzle.target) {
      return {
        valid: true, complete: true,
        message: movesUsed === puzzle.optimalMoves
          ? 'Solved in the minimum moves.'
          : `Solved in ${movesUsed} moves. Minimum: ${puzzle.optimalMoves}.`,
        movesUsed
      };
    }
    return { valid: true, complete: false, message: 'Valid move.', movesUsed };
  }

  function invalid(message, movesUsed = 0) {
    return { valid: false, complete: false, message, movesUsed };
  }

  // Exact scoring rule from core/game.ts and routes/api.ts.
  function calculatePoints(movesUsed) {
    return Math.max(0, BASE_LEVEL_POINTS - movesUsed);
  }

  function renderWord(container, word) {
    container.replaceChildren();
    for (const letter of word) {
      const tile = document.createElement('span');
      tile.textContent = letter;
      container.append(tile);
    }
  }

  function renderChain() {
    const list = elements.chainList;
    const wasAtBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 24;
    list.replaceChildren();
    state.chain.forEach((word, index) => {
      const item = document.createElement('li');
      if (word === state.puzzle.target) item.classList.add('chain-final');
      const number = document.createElement('span');
      number.textContent = String(index).padStart(2, '0');
      const label = document.createElement('b');
      label.textContent = word;
      item.append(number, label);
      elements.chainList.append(item);
    });
    const moves = state.chain.length - 1;
    elements.movesLabel.textContent = String(moves);
    // Keep the newest move visible without allowing a long ladder to push
    // the entry controls indefinitely down the page.
    if (wasAtBottom) list.scrollTop = list.scrollHeight;
  }

  function renderHeader() {
    elements.levelLabel.textContent = `LEVEL ${state.level}`;
    elements.scoreLabel.textContent = String(state.score);
  }

  function setMessage(message, type = 'info') {
    elements.message.textContent = message;
    elements.message.className = `game-message${type === 'error' ? ' error' : ''}`;
    elements.message.hidden = !message;
    elements.message.setAttribute('role', type === 'error' ? 'alert' : 'status');
    elements.message.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
  }

  function setBusy(value) {
    busy = value;
    elements.input.disabled = value || state.completed;
    elements.submit.disabled = value || state.completed || elements.input.value.length !== WORD_LENGTH;
    elements.newGameButton.disabled = value;
    elements.nextButton.disabled = value;
    elements.shareChallengeButton.disabled = value || challengeCardPending;
    elements.shareResultButton.disabled = value || !state.completed || !preparedResultFile;
    elements.downloadResultButton.disabled = value || !state.completed || !preparedResultFile;
  }

  function renderPuzzle() {
    renderWord(elements.startWord, state.puzzle.start);
    renderWord(elements.targetWord, state.puzzle.target);
    renderChain();
    renderHeader();
    setMessage('');
    elements.entryPanel.hidden = false;
    elements.finishPanel.hidden = true;
    elements.input.value = '';
    preparedResultFile = null;
    resultPreparationPending = false;
    elements.shareResultButton.textContent = 'SHARE RESULT';
    elements.shareResultButton.disabled = true;
    elements.downloadResultButton.disabled = true;
    elements.shareStatus.textContent = '';
    challengeCardFile = null;
    prepareChallengeCard();
    setBusy(false);
  }

  function showError(message) {
    elements.loading.hidden = true;
    elements.game.hidden = true;
    elements.errorPanel.hidden = false;
    elements.errorMessage.textContent = message;
    elements.retryButton.focus({ preventScroll: true });
  }

  function hideError() {
    elements.errorPanel.hidden = true;
  }

  function saveProgress() {
    // Friend challenges are isolated from the player's saved campaign.
    if (challengeSession) return;
    // Never overwrite a newer snapshot written by another open tab.
    if (externalProgressChanged) return;
    const snapshot = {
      version: 1,
      score: state.score,
      level: state.level,
      puzzle: state.puzzle,
      chain: state.chain,
      completed: state.completed
    };
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(snapshot));
    } catch (error) {
      console.warn('Could not save game progress in this browser.', error);
    }
  }

  // Validate persisted data without mutating live state. Browser storage is
  // user-editable and may also contain data from an older or interrupted run.
  function validateProgressSnapshot(saved) {
    if (!saved || saved.version !== 1 ||
        !Number.isSafeInteger(saved.score) || saved.score < 0 ||
        !Number.isSafeInteger(saved.level) || saved.level < 1 ||
        !saved.puzzle || !Array.isArray(saved.chain) ||
        typeof saved.completed !== 'boolean') return false;

    const { puzzle, chain } = saved;
    if (typeof puzzle.id !== 'string' || puzzle.id.length === 0 ||
        typeof puzzle.start !== 'string' || typeof puzzle.target !== 'string' ||
        puzzle.wordLength !== WORD_LENGTH ||
        !Number.isSafeInteger(puzzle.optimalMoves) || puzzle.optimalMoves < 1 ||
        !WORD_SET.has(puzzle.start) || !WORD_SET.has(puzzle.target) ||
        puzzle.start === puzzle.target || chain.length < 1 ||
        chain[0] !== puzzle.start ||
        !Array.from(chain).every((word) => typeof word === 'string' && WORD_SET.has(word))) return false;

    // The stored shortest distance is part of the puzzle definition. Recompute
    // it so corrupted metadata cannot alter the minimum-move message.
    if (shortestDistance(puzzle.start, puzzle.target) !== puzzle.optimalMoves) return false;

    // A fresh puzzle legitimately contains only its start word.
    const result = chain.length === 1
      ? { valid: true, complete: false }
      : validateSequence(puzzle, chain);
    if (!result.valid || saved.completed !== result.complete) return false;
    return true;
  }

  function loadProgress() {
    try {
      const raw = localStorage.getItem(PROGRESS_KEY);
      if (!raw) return false;
      const saved = JSON.parse(raw);
      if (!validateProgressSnapshot(saved)) {
        // Remove only the invalid game snapshot. Theme preference is separate.
        localStorage.removeItem(PROGRESS_KEY);
        return false;
      }
      // Commit the validated snapshot only after every invariant passes.
      state = {
        score: saved.score,
        level: saved.level,
        puzzle: saved.puzzle,
        chain: [...saved.chain],
        completed: saved.completed
      };
      return true;
    } catch (error) {
      console.warn('Saved WRDLINK progress could not be read.', error);
      try { localStorage.removeItem(PROGRESS_KEY); } catch (_) {
        // Storage may be disabled. Starting a fresh in-memory game is safe.
      }
      return false;
    }
  }

  function startPuzzle({ resetScore = false, nextLevel = false } = {}) {
    if (puzzleTransition || busy || externalProgressChanged) return;
    puzzleTransition = true;
    elements.newGameButton.disabled = true;
    elements.nextButton.disabled = true;
    elements.retryButton.disabled = true;
    elements.shareChallengeButton.disabled = true;
    preparedResultFile = null;
    resultPreparationId += 1;
    hideError();
    elements.loading.hidden = false;
    elements.game.hidden = true;
    // Defer generation one frame so the loading state is visible on slower devices.
    window.requestAnimationFrame(() => {
      try {
        const puzzle = createRandomPuzzle();
        if (resetScore) {
          challengeSession = false;
          const cleanUrl = new URL(window.location.href);
          cleanUrl.searchParams.delete('challenge');
          window.history?.replaceState?.({}, '', cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
          state.score = 0;
          state.level = 1;
        } else if (nextLevel) {
          state.level += 1;
        }
        state.puzzle = puzzle;
        state.chain = [puzzle.start];
        if (challengeSession) {
          const sharedUrl = new URL(window.location.href);
          sharedUrl.searchParams.set('challenge', puzzle.start + '-' + puzzle.target);
          window.history?.replaceState?.({}, '', sharedUrl.pathname + sharedUrl.search + sharedUrl.hash);
        }
        state.completed = false;
        saveProgress();
        renderPuzzle();
        elements.loading.hidden = true;
        elements.game.hidden = false;
        puzzleTransition = false;
        elements.retryButton.disabled = false;
      } catch (error) {
        console.error('WRDLINK puzzle generation failed:', error);
        puzzleTransition = false;
        elements.retryButton.disabled = false;
        showError('A puzzle could not be generated. Please try again.');
      }
    });
  }

  function renderCompletion(result) {
    const points = calculatePoints(result.movesUsed);
    elements.entryPanel.hidden = true;
    elements.finishPanel.hidden = false;
    elements.finishTitle.textContent = 'Connected!';
    elements.finishDescription.textContent = `${state.puzzle.target} reached in ${result.movesUsed} moves. ${result.message}`;
    elements.nextButton.textContent = `Next level · ${state.level + 1} →`;

    const banner = document.createElement('div');
    banner.className = 'completion-banner';
    const score = document.createElement('strong');
    score.textContent = `+${points} points`;
    banner.append(score);
    elements.finishPanel.querySelector('.completion-banner')?.remove();
    elements.finishPanel.prepend(banner);

    elements.finishTitle.setAttribute('tabindex', '-1');
    elements.finishTitle.focus({ preventScroll: true });
    prepareResultCard(result);
  }

  function completePuzzle(result) {
    // Defensive guard: a completion can award points only once per puzzle.
    if (state.completed) return;
    state.score += calculatePoints(result.movesUsed);
    state.completed = true;
    renderChain();
    renderHeader();
    renderCompletion(result);
    saveProgress();
    setBusy(false);
  }

  function submitMove(event) {
    event.preventDefault();
    if (!state.puzzle || busy || state.completed) return;
    const candidate = elements.input.value.trim().toUpperCase();
    if (!new RegExp(`^[A-Z]{${state.puzzle.wordLength}}$`).test(candidate)) {
      setMessage(`Use ${state.puzzle.wordLength} letters.`, 'error');
      return;
    }

    setBusy(true);
    const result = validateSequence(state.puzzle, [...state.chain, candidate]);
    if (!result.valid) {
      setMessage(result.message, 'error');
      // Rejected moves never alter the chain or consume a move.
      setBusy(false);
      elements.input.focus({ preventScroll: true });
      elements.input.select();
      return;
    }

    state.chain.push(candidate);
    elements.input.value = '';
    renderChain();
    if (result.complete) {
      completePuzzle(result);
    } else {
      setMessage(result.message);
      saveProgress();
      setBusy(false);
      // Keep the input active so the next word can be entered immediately.
      elements.input.focus({ preventScroll: true });
    }
  }


  function challengeUrl() {
    const url = new URL(window.location.href);
    url.searchParams.set('challenge', state.puzzle.start + '-' + state.puzzle.target);
    url.hash = '';
    return url.href;
  }

  function escapeSvgText(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
    })[character]);
  }

  // These SVGs mirror the supplied standalone HTML cards: a full bleed
  // 9:16 field, paper grain, Barlow Condensed display type and DM Mono labels.
  function cardSvgShell(content) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">' +
      '<defs>' +
      '<filter id="paper-grain"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .55 0"/></filter>' +
      '<pattern id="midtiles" width="19.44" height="19.44" patternUnits="userSpaceOnUse" patternTransform="rotate(135)"><rect width="19.44" height="19.44" fill="#2b463e"/><rect width="9.72" height="19.44" fill="#253d36"/></pattern>' +
      '</defs>' +
      '<rect width="1080" height="1920" fill="#14221f"/>' +
      '<rect width="1080" height="1920" filter="url(#paper-grain)" opacity=".07"/>' +
      '<g font-family="Barlow Condensed, Arial Narrow, sans-serif">' +
      '<rect x="86" y="213" width="78" height="78" rx="15" fill="#b58c26"/>' +
      '<rect x="86" y="205" width="78" height="78" rx="15" fill="#efc45c"/>' +
      '<rect x="86" y="205" width="78" height="5" rx="2" fill="#ffffff" opacity=".3"/>' +
      '<text x="125" y="263" text-anchor="middle" font-size="56" font-weight="800" fill="#10201c">W</text>' +
      '<text x="200" y="263" font-size="56" font-weight="800" letter-spacing="1" fill="#eef3f0">WRDLINK</text>' +
      '</g>' + content + '</svg>';
  }

  async function waitForCardFonts() {
    if (!document.fonts?.load) return;
    await Promise.all([
      document.fonts.load('800 156px "Barlow Condensed"').catch(() => []),
      document.fonts.load('500 23px "DM Mono"').catch(() => [])
    ]);
  }

  const CARD_TILE = 151;
  const CARD_GAP = 24;
  const CARD_LINK_HEIGHT = 58;
  const CARD_X = 86;
  const CARD_LAYOUT = Object.freeze({
    top: 205, bottom: 1747, brand: 78, heading: 254,
    stats: 259, footer: 191
  });

  function cardLayout(rowCount, tileSize, linkHeight) {
    const ladderHeight = rowCount * tileSize + Math.max(0, rowCount - 1) * linkHeight;
    const contentHeight = CARD_LAYOUT.bottom - CARD_LAYOUT.top;
    const gap = Math.max(0, (contentHeight - CARD_LAYOUT.brand - CARD_LAYOUT.heading -
      ladderHeight - CARD_LAYOUT.stats - CARD_LAYOUT.footer) / 4);
    const headingTop = CARD_LAYOUT.top + CARD_LAYOUT.brand + gap;
    const ladderY = headingTop + CARD_LAYOUT.heading + gap;
    const statsY = ladderY + ladderHeight + gap;
    const footerY = statsY + CARD_LAYOUT.stats + gap;
    return { headingTop, ladderY, statsY, footerY, ladderHeight, gap };
  }

  function cardTileRow(word, y, kind, hidden = false, label = '', tileSize = CARD_TILE, tileGap = CARD_GAP) {
    const colors = kind === 'start'
      ? { fill: '#74c6b2', edge: '#3f8f7d', ink: '#10201c' }
      : kind === 'end'
        ? { fill: '#efc45c', edge: '#b58c26', ink: '#10201c' }
        : kind === 'ghost'
          ? { fill: 'none', edge: '#4a655d', ink: '#7a978d' }
          : { fill: 'url(#midtiles)', edge: '#1a2d27', ink: '#eef3f0' };
    const tiles = [...word].map((letter, index) => {
      const x = CARD_X + index * (tileSize + tileGap);
      const shown = hidden ? '' : letter;
      const tileShadow = kind === 'ghost' ? '' : '<rect x="' + x + '" y="' + (y + tileSize - 1) + '" width="' + tileSize + '" height="11" rx="8" fill="' + colors.edge + '"/>';
      return tileShadow +
        '<rect x="' + x + '" y="' + y + '" width="' + tileSize + '" height="' + tileSize + '" rx="19" fill="' + colors.fill + '"' + (kind === 'ghost' ? ' stroke="' + colors.edge + '" stroke-width="5.4" stroke-dasharray="9 8"' : '') + '/>' +
        (kind === 'start' || kind === 'end' ? '<rect x="' + (x + 3) + '" y="' + (y + 3) + '" width="' + (tileSize - 6) + '" height="5" rx="2" fill="#ffffff" opacity=".3"/>' : '') +
        (shown ? '<text x="' + (x + tileSize / 2) + '" y="' + (y + tileSize * .68) + '" text-anchor="middle" font-family="Barlow Condensed, Arial Narrow, sans-serif" font-size="' + (tileSize * .67) + '" font-weight="800" fill="' + colors.ink + '">' + escapeSvgText(shown) + '</text>' : '');
    }).join('');
    if (!label) return tiles;
    const color = kind === 'start' ? '#74c6b2' : '#efc45c';
    const labelMargin = 39;
    const labelLineX = CARD_X + 4 * tileSize + 3 * tileGap + labelMargin;
    const labelX = labelLineX + 43 + 17;
    return tiles + '<rect x="' + labelLineX + '" y="' + (y + 74) + '" width="43" height="4" fill="' + color + '" opacity=".5"/><text x="' + labelX + '" y="' + (y + 84) + '" font-family="DM Mono, monospace" font-size="23" letter-spacing="4" fill="' + color + '">' + label.toUpperCase() + '</text>';
  }

  function changedLetterIndex(first, second) {
    let changed = -1;
    if (first.length !== second.length) return -1;
    for (let index = 0; index < first.length; index += 1) {
      if (first[index] !== second[index]) {
        if (changed !== -1) return -1;
        changed = index;
      }
    }
    return changed;
  }

  function cardConnectorRow(first, second, y, dotted = false, tileSize = CARD_TILE, tileGap = CARD_GAP, linkHeight = CARD_LINK_HEIGHT) {
    return [...first].map((letter, index) => {
      const x = CARD_X + index * (tileSize + tileGap) + tileSize / 2;
      const changed = changedLetterIndex(first, second) === index;
      if (dotted) {
        return '<path d="M' + x + ' ' + (y - 15) + 'v' + (linkHeight + 30) + '" stroke="#4a655d" stroke-width="12" stroke-dasharray="14 11" stroke-linecap="butt"/>';
      }
      return '<rect x="' + (x - (changed ? 9.5 : 6)) + '" y="' + (y - 15) + '" width="' + (changed ? 19 : 12) + '" height="' + (linkHeight + 30) + '" rx="4" fill="' + (changed ? '#efc45c' : '#2d423c') + '"/>';
    }).join('');
  }

  function cardLadderRows(words, y, reveal, dotted = false, compact = false) {
    const tileSize = compact ? 112 : CARD_TILE;
    const tileGap = compact ? 22 : CARD_GAP;
    const linkHeight = compact ? 34 : CARD_LINK_HEIGHT;
    const parts = [];
    words.forEach((word, index) => {
      const kind = index === 0 ? 'start' : index === words.length - 1 ? 'end' : 'mid';
      const hidden = kind === 'mid' && !reveal;
      const label = kind === 'start' ? 'Start' : kind === 'end' ? 'Target' : '';
      const rowY = y + index * (tileSize + linkHeight);
      parts.push(cardTileRow(word, rowY, kind, hidden, label, tileSize, tileGap));
      if (index < words.length - 1) {
        parts.push(cardConnectorRow(word, words[index + 1], rowY + tileSize, dotted, tileSize, tileGap, linkHeight));
      }
    });
    return parts.join('');
  }

  function createChallengeSvg() {
    const start = state.puzzle.start;
    const target = state.puzzle.target;
    const apart = [...start].filter((letter, index) => letter !== target[index]).length;
    const url = escapeSvgText(challengeUrl().replace(/^https?:\/\//, ''));
    const layout = cardLayout(3, CARD_TILE, CARD_LINK_HEIGHT);
    const ladderY = layout.ladderY;
    const ladder = [
      cardTileRow(start, ladderY, 'start', false, 'Start'),
      cardConnectorRow(start, '????', ladderY + CARD_TILE, true),
      cardTileRow('????', ladderY + CARD_TILE + CARD_LINK_HEIGHT, 'ghost', false),
      cardConnectorRow('????', target, ladderY + 2 * (CARD_TILE + CARD_LINK_HEIGHT) + CARD_TILE, true),
      cardTileRow(target, ladderY + 2 * (CARD_TILE + CARD_LINK_HEIGHT), 'end', false, 'Target')
    ].join('');
    const headingBaseline = layout.headingTop + 112;
    const pillTop = layout.headingTop + 138 + 39;
    const statsLabelY = layout.statsY + 25;
    const statsValueY = layout.statsY + 225;
    const content =
      '<text x="86" y="' + headingBaseline + '" font-family="Barlow Condensed, Arial Narrow, sans-serif" font-size="156" font-weight="800" letter-spacing="-1" fill="#eef3f0">YOUR MOVE<tspan fill="#74c6b2">.</tspan></text>' +
      '<rect x="86" y="' + pillTop + '" width="465" height="77" rx="39" fill="none" stroke="#74c6b2" stroke-width="5"/><circle cx="119" cy="' + (pillTop + 38) + '" r="8" fill="#74c6b2"/><text x="156" y="' + (pillTop + 48) + '" font-family="DM Mono, monospace" font-size="25" letter-spacing="4" fill="#74c6b2">ONE LETTER PER MOVE</text>' +
      '<g>' + ladder + '</g>' +
      '<text x="86" y="' + statsLabelY + '" font-family="DM Mono, monospace" font-size="25" letter-spacing="4" fill="#7f948d">LETTERS APART</text>' +
      '<text x="86" y="' + statsValueY + '" font-family="Barlow Condensed, Arial Narrow, sans-serif" font-size="238" font-weight="800" fill="#eef3f0">' + apart + '</text>' +
      '<path d="M581 ' + layout.statsY + 'V' + (layout.statsY + CARD_LAYOUT.stats) + '" stroke="#2d423c" stroke-width="4"/>' +
      '<text x="646" y="' + statsLabelY + '" font-family="DM Mono, monospace" font-size="25" letter-spacing="4" fill="#7f948d">MOVES NEEDED</text>' +
      '<text x="646" y="' + statsValueY + '" font-family="Barlow Condensed, Arial Narrow, sans-serif" font-size="238" font-weight="800" fill="#efc45c">?</text>' +
      '<path d="M86 ' + layout.footerY + 'H994" stroke="#2d423c" stroke-width="4"/>' +
      '<text x="86" y="' + (layout.footerY + 109) + '" font-family="Barlow Condensed, Arial Narrow, sans-serif" font-size="82" font-weight="800" fill="#eef3f0">CAN YOU BRIDGE THE GAP<tspan fill="#efc45c">?</tspan></text>' +
      '<text x="86" y="' + (layout.footerY + 179) + '" font-family="DM Mono, monospace" font-size="27" fill="#efc45c">' + url + ' →</text>';
    return cardSvgShell(content);
  }

  async function prepareChallengeCard() {
    const id = ++challengeCardPreparationId;
    challengeCardPending = true;
    challengeCardFile = null;
    let imageUrl = null;
    try {
      await waitForCardFonts();
      const image = new Image();
      imageUrl = URL.createObjectURL(new Blob([createChallengeSvg()], { type: 'image/svg+xml' }));
      image.src = imageUrl;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1920;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas is unavailable.');
      context.drawImage(image, 0, 0);
      const png = await new Promise((resolve, reject) => {
        canvas.toBlob((value) => value ? resolve(value) : reject(new Error('PNG export failed.')), 'image/png');
      });
      if (id === challengeCardPreparationId && state.puzzle && !state.completed) {
        challengeCardFile = new File([png], 'wrdlink-challenge.png', { type: 'image/png' });
      }
    } catch (error) {
      console.warn('Challenge card could not be prepared.', error);
    } finally {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      if (id === challengeCardPreparationId) {
        challengeCardPending = false;
        elements.shareChallengeButton.disabled = busy;
      }
    }
  }

  async function copyChallengeLink() {
    const link = challengeUrl();
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(link);
      } else {
        const field = document.createElement('textarea');
        field.value = link;
        field.setAttribute('readonly', '');
        field.style.position = 'fixed';
        field.style.opacity = '0';
        document.body.append(field);
        field.select();
        const copied = document.execCommand?.('copy');
        field.remove();
        if (!copied) {
          const manualCopy = window.prompt?.('Copy this challenge link:', link);
          if (!manualCopy) throw new Error('Clipboard access is unavailable.');
        }
      }
      setMessage('Challenge link copied. Add it to an Instagram Story Link sticker if you share the card there.');
    } catch (error) {
      setMessage('Could not copy the challenge link. Check clipboard permissions and try again.', 'error');
    }
  }

  async function shareChallenge() {
    const link = challengeUrl();
    const text = 'Can you solve this WRDLINK word ladder? ' + state.puzzle.start + ' to ' + state.puzzle.target;
    try {
      if (navigator.share) {
        const data = challengeCardFile && navigator.canShare?.({ files: [challengeCardFile] })
          ? { files: [challengeCardFile], title: 'WRDLINK challenge', text: text + ' ' + link, url: link }
          : { title: 'WRDLINK challenge', text, url: link };
        const request = navigator.share(data);
        await request;
        setMessage('Challenge shared. Your friend can open the same puzzle.');
        return;
      }
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(link);
      } else {
        const field = document.createElement('textarea');
        field.value = link;
        field.setAttribute('readonly', '');
        field.style.position = 'fixed';
        field.style.opacity = '0';
        document.body.append(field);
        field.select();
        const copied = document.execCommand?.('copy');
        field.remove();
        if (!copied) {
          const manualCopy = window.prompt?.('Copy this challenge link:', link);
          if (!manualCopy) throw new Error('Clipboard access is unavailable.');
        }
      }
      setMessage('Challenge link copied. Send it to a friend and see if they can solve it.');
    } catch (error) {
      if (error.name === 'AbortError') return;
      setMessage('Could not open sharing or copy the challenge link. Check browser permissions and try again.', 'error');
    }
  }

  function loadChallengeFromUrl() {
    if (!window.location?.search) return false;
    const value = new URLSearchParams(window.location.search).get('challenge');
    const match = value && /^([A-Z]{4})-([A-Z]{4})$/i.exec(value);
    if (!match) return false;
    const start = match[1].toUpperCase();
    const target = match[2].toUpperCase();
    if (!WORD_SET.has(start) || !WORD_SET.has(target) || start === target) return false;
    const optimalMoves = shortestDistance(start, target);
    if (!Number.isInteger(optimalMoves) || optimalMoves < 1) return false;
    challengeSession = true;
    state = {
      score: 0, level: 1,
      puzzle: { id: 'challenge-' + start + '-' + target, title: 'Friend challenge', start, target, wordLength: WORD_LENGTH, optimalMoves },
      chain: [start], completed: false
    };
    return true;
  }

  function createResultSvg(result, points) {
    const sequence = state.chain;
    const shortest = result.movesUsed === state.puzzle.optimalMoves;
    // Match the supplied reference: show at most three intermediate steps.
    const visibleWords = sequence.length > 5
      ? [sequence[0], sequence[1], sequence[2], sequence[3], sequence[sequence.length - 1]]
      : sequence;
    const compactLadder = visibleWords.length >= 4;
    const tileSize = compactLadder ? 112 : CARD_TILE;
    const linkHeight = compactLadder ? 34 : CARD_LINK_HEIGHT;
    const layout = cardLayout(visibleWords.length, tileSize, linkHeight);
    const ladder = cardLadderRows(visibleWords, layout.ladderY, false, false, compactLadder);
    const status = shortest ? 'SHORTEST ROUTE FOUND' : 'ROUTE FOUND';
    const url = escapeSvgText((window.location.host || window.location.hostname || '') + (window.location.pathname || '').replace(/\/$/, ''));
    const headingBaseline = layout.headingTop + 112;
    const pillTop = layout.headingTop + 138 + 39;
    const statsLabelY = layout.statsY + 25;
    const statsValueY = layout.statsY + 225;
    const content =
      '<text x="86" y="' + headingBaseline + '" font-family="Barlow Condensed, Arial Narrow, sans-serif" font-size="156" font-weight="800" letter-spacing="-1" fill="#eef3f0">CONNECTED<tspan fill="#efc45c">.</tspan></text>' +
      '<rect x="86" y="' + pillTop + '" width="540" height="77" rx="39" fill="none" stroke="#efc45c" stroke-width="5"/><path d="M118 ' + (pillTop + 38) + 'l13 13 26 -28" fill="none" stroke="#efc45c" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><text x="177" y="' + (pillTop + 48) + '" font-family="DM Mono, monospace" font-size="24" letter-spacing="3" fill="#efc45c">' + status + '</text>' +
      '<g>' + ladder + '</g>' +
      '<text x="86" y="' + statsLabelY + '" font-family="DM Mono, monospace" font-size="25" letter-spacing="4" fill="#7f948d">LEVEL SCORE</text>' +
      '<text x="86" y="' + statsValueY + '" font-family="Barlow Condensed, Arial Narrow, sans-serif" font-size="238" font-weight="800" fill="#efc45c">+' + points + '</text>' +
      '<path d="M581 ' + layout.statsY + 'V' + (layout.statsY + CARD_LAYOUT.stats) + '" stroke="#2d423c" stroke-width="4"/>' +
      '<text x="646" y="' + statsLabelY + '" font-family="DM Mono, monospace" font-size="25" letter-spacing="4" fill="#7f948d">MOVES</text>' +
      '<text x="646" y="' + statsValueY + '" font-family="Barlow Condensed, Arial Narrow, sans-serif" font-size="238" font-weight="800" fill="#eef3f0">' + result.movesUsed + '</text>' +
      '<path d="M86 ' + layout.footerY + 'H994" stroke="#2d423c" stroke-width="4"/>' +
      '<text x="86" y="' + (layout.footerY + 109) + '" font-family="Barlow Condensed, Arial Narrow, sans-serif" font-size="82" font-weight="800" textLength="820" lengthAdjust="spacingAndGlyphs" fill="#eef3f0">CAN YOU BUILD THE LADDER</text><text x="925" y="' + (layout.footerY + 109) + '" font-family="Barlow Condensed, Arial Narrow, sans-serif" font-size="82" font-weight="800" fill="#efc45c">?</text>' +
      '<text x="86" y="' + (layout.footerY + 179) + '" font-family="DM Mono, monospace" font-size="27" fill="#efc45c">' + url + ' →</text>';
    return cardSvgShell(content);
  }

  async function prepareResultCard(result) {
    const preparationId = ++resultPreparationId;
    resultPreparationPending = true;
    preparedResultFile = null;
    elements.shareResultButton.disabled = true;
    elements.downloadResultButton.disabled = true;
    elements.shareResultButton.textContent = 'PREPARING CARD';
    elements.shareStatus.textContent = 'Preparing your share image…';
    let imageUrl = null;
    try {
      await waitForCardFonts();
      const svgBlob = new Blob([createResultSvg(result, calculatePoints(result.movesUsed))], { type: 'image/svg+xml' });
      const image = new Image();
      imageUrl = URL.createObjectURL(svgBlob);
      image.src = imageUrl;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1920;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas is unavailable.');
      context.drawImage(image, 0, 0);
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((value) => value ? resolve(value) : reject(new Error('PNG export failed.')), 'image/png');
      });
      if (preparationId !== resultPreparationId || !state.completed) return;
      preparedResultFile = new File([blob], 'wrdlink-result.png', { type: 'image/png' });
      elements.shareResultButton.disabled = false;
      elements.downloadResultButton.disabled = false;
      elements.shareResultButton.textContent = 'SHARE RESULT';
      elements.shareStatus.textContent = 'Your result card is ready to share.';
    } catch (error) {
      if (preparationId !== resultPreparationId) return;
      elements.shareResultButton.disabled = false;
      elements.shareResultButton.textContent = 'RETRY IMAGE';
      elements.shareStatus.textContent = 'The image could not be prepared. Tap to try again.';
    } finally {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      if (preparationId === resultPreparationId) resultPreparationPending = false;
    }
  }

  function downloadResultCard(file) {
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'wrdlink-result.png';
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    // Keep the URL alive long enough for mobile browsers to begin the download.
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    elements.shareStatus.textContent = 'Your PNG was downloaded. Open it from Downloads or your gallery to share it.';
  }

  async function shareResult() {
    if (!state.completed) return;
    if (!preparedResultFile) {
      if (!resultPreparationPending) {
        const result = validateSequence(state.puzzle, state.chain);
        if (result.valid && result.complete) prepareResultCard(result);
      }
      elements.shareStatus.textContent = 'Preparing the image. The Share button will be ready in a moment.';
      return;
    }
    const file = preparedResultFile;
    const shareData = {
      files: [file],
      title: 'My WRDLINK result',
      text: 'I solved ' + state.puzzle.start + ' to ' + state.puzzle.target +
        ' in ' + (state.chain.length - 1) + ' moves on WRDLINK.'
    };
    try {
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        // Invoke share synchronously within the click gesture, before awaiting.
        const shareRequest = navigator.share(shareData);
        await shareRequest;
        elements.shareStatus.textContent = 'Your result was shared.';
      } else {
        downloadResultCard(file);
      }
    } catch (error) {
      if (error.name === 'AbortError') return;
      // A rejected native share may have consumed the transient user gesture.
      // Keep download as a separate, reliable user initiated action.
      elements.shareStatus.textContent = 'Native sharing was unavailable. Use Download PNG instead.';
    }
  }

  // Input is deliberately restricted to ASCII letters and four characters.
  elements.input.addEventListener('input', () => {
    const clean = elements.input.value.replace(/[^a-z]/gi, '').toUpperCase().slice(0, WORD_LENGTH);
    if (elements.input.value !== clean) elements.input.value = clean;
    elements.submit.disabled = busy || state.completed || clean.length !== WORD_LENGTH;
  });
  elements.submit.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch' || event.pointerType === 'pen') event.preventDefault();
  });
  elements.form.addEventListener('submit', submitMove);
  elements.newGameButton.addEventListener('click', () => startPuzzle({ resetScore: true }));
  elements.nextButton.addEventListener('click', () => startPuzzle({ nextLevel: true }));
  elements.retryButton.addEventListener('click', () => startPuzzle());
  elements.shareChallengeButton.addEventListener('click', shareChallenge);
  elements.copyChallengeButton.addEventListener('click', copyChallengeLink);
  elements.shareResultButton.addEventListener('click', shareResult);
  elements.downloadResultButton.addEventListener('click', () => {
    if (preparedResultFile) downloadResultCard(preparedResultFile);
  });

  // A tiny public API is useful for local testing and debugging without
  // exposing mutable state to the page UI.
  window.WRDLINK = Object.freeze({
    validateSequence,
    validateProgressSnapshot,
    createRandomPuzzle,
    neighbors,
    differsByOneLetter,
    shortestDistance,
    calculatePoints,
    loadChallengeFromUrl,
    createChallengeSvg,
    createResultSvg,
    cardLayout,
    getState: () => structuredClone(state),
    dictionarySize: WORD_SET.size
  });

  function initialize() {
    if (!(DICTIONARY instanceof Set) || DICTIONARY.size === 0 || WORDS.length === 0) {
      showError('The word dictionary failed to load. Refresh the page to try again.');
      return;
    }
    buildNeighborIndex();
    if (loadChallengeFromUrl()) {
      hideError();
      elements.loading.hidden = true;
      elements.game.hidden = false;
      renderPuzzle();
      return;
    }
    if (loadProgress()) {
      hideError();
      elements.loading.hidden = true;
      elements.game.hidden = false;
      renderPuzzle();
      if (state.completed) {
        renderCompletion(validateSequence(state.puzzle, state.chain));
      }
      return;
    }
    startPuzzle({ resetScore: true });
  }

  // Another tab may update the same browser snapshot. Do not silently replace
  // the active in-memory game; explain the conflict and let the player reload.
  window.addEventListener('storage', (event) => {
    if (event.key === PROGRESS_KEY && event.newValue !== event.oldValue) {
      externalProgressChanged = true;
      // Freeze this tab so later interactions cannot overwrite the newer save.
      setBusy(true);
      setMessage('Game progress changed in another tab. Reload this page to use the latest saved game.', 'error');
    }
  });

  function updateKeyboardLayout(forceCompact = false) {
    const viewport = window.visualViewport;
    if (viewport) {
      document.documentElement.style.setProperty('--visual-viewport-height', Math.round(viewport.height) + 'px');
    }
    const mobile = window.matchMedia?.('(max-width: 620px)').matches ?? window.innerWidth <= 620;
    const focused = document.activeElement === elements.input;
    const viewportHeight = viewport?.height ?? window.innerHeight;
    const keyboardVisible = keyboardFocusViewportHeight !== null &&
      keyboardFocusViewportHeight - viewportHeight > 120;
    const compact = mobile && focused && (forceCompact || keyboardVisible);
    document.documentElement.classList.toggle('keyboard-open', Boolean(compact));
  }
  window.visualViewport?.addEventListener('resize', () => updateKeyboardLayout());
  window.visualViewport?.addEventListener('scroll', () => updateKeyboardLayout());
  window.addEventListener('resize', () => updateKeyboardLayout());
  elements.input.addEventListener('focus', () => {
    keyboardFocusViewportHeight = window.visualViewport?.height ?? window.innerHeight;
    updateKeyboardLayout(true);
  });
  elements.input.addEventListener('blur', () => {
    keyboardFocusViewportHeight = null;
    document.documentElement.classList.remove('keyboard-open');
  });

  initialize();
})();
