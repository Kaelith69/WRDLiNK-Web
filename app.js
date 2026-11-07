/* global WRDLINK_DICTIONARY */
'use strict';

(() => {
  // The dictionary script is loaded before this file. Validate it before
  // indexing so a missing or malformed asset reaches the designed error UI.
  const DICTIONARY = window.WRDLINK_DICTIONARY;
  const WORD_LENGTH = 4;
  const BASE_LEVEL_POINTS = 50;
  const MAX_PUZZLE_ATTEMPTS = 100;
  const PROGRESS_KEY = 'wrdlink-browser-session-v1:progress';

  const $ = (id) => document.getElementById(id);
  const elements = {
    loading: $('loading'), game: $('game'), errorPanel: $('error-panel'),
    errorMessage: $('error-message'), startWord: $('start-word'), targetWord: $('target-word'),
    chainList: $('chain-list'), chainMoveCount: $('chain-move-count'),
    scoreLabel: $('score-label'), movesLabel: $('moves-label'), levelLabel: $('level-label'),
    form: $('move-form'), input: $('word-entry'), submit: $('submit-button'),
    message: $('message'), entryPanel: $('entry-panel'), finishPanel: $('finish-panel'),
    finishTitle: $('finish-title'), finishDescription: $('finish-description'),
    nextButton: $('next-button'), newGameButton: $('new-game-button'), retryButton: $('retry-button'), themeToggle: $('theme-toggle')
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
    elements.chainList.replaceChildren();
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
    elements.chainMoveCount.textContent = `${moves} ${moves === 1 ? 'move' : 'moves'}`;
    elements.movesLabel.textContent = `${moves} ${moves === 1 ? 'move' : 'moves'}`;
    // Keep the newest move visible without allowing a long ladder to push
    // the entry controls indefinitely down the page.
    elements.chainList.lastElementChild?.scrollIntoView?.({ block: 'nearest' });
  }

  function renderHeader() {
    elements.levelLabel.textContent = `Lv ${state.level}`;
    elements.scoreLabel.textContent = `${state.score} pts`;
  }

  function setMessage(message, type = 'info') {
    elements.message.textContent = message;
    elements.message.className = `game-message${type === 'error' ? ' error' : ''}`;
    elements.message.hidden = !message;
    elements.message.setAttribute('role', type === 'error' ? 'alert' : 'status');
  }

  function setBusy(value) {
    busy = value;
    elements.input.disabled = value || state.completed;
    elements.submit.disabled = value || state.completed || elements.input.value.length !== WORD_LENGTH;
    elements.newGameButton.disabled = value;
    elements.nextButton.disabled = value;
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
    setBusy(false);
    elements.input.focus({ preventScroll: true });
  }

  function showError(message) {
    elements.loading.hidden = true;
    elements.game.hidden = true;
    elements.errorPanel.hidden = false;
    elements.errorMessage.textContent = message;
  }

  function hideError() {
    elements.errorPanel.hidden = true;
  }

  function saveProgress() {
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
        !chain.every((word) => typeof word === 'string' && WORD_SET.has(word))) return false;

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
    hideError();
    elements.loading.hidden = false;
    elements.game.hidden = true;
    // Defer generation one frame so the loading state is visible on slower devices.
    window.requestAnimationFrame(() => {
      try {
        const puzzle = createRandomPuzzle();
        if (resetScore) {
          state.score = 0;
          state.level = 1;
        } else if (nextLevel) {
          state.level += 1;
        }
        state.puzzle = puzzle;
        state.chain = [puzzle.start];
        state.completed = false;
        saveProgress();
        renderPuzzle();
        elements.loading.hidden = true;
        elements.game.hidden = false;
      } catch (error) {
        console.error('WRDLINK puzzle generation failed:', error);
        showError('A puzzle could not be generated. Please try again.');
      }
    });
  }

  function completePuzzle(result) {
    // Defensive guard: a completion can award points only once per puzzle.
    if (state.completed) return;
    const points = calculatePoints(result.movesUsed);
    state.score += points;
    state.completed = true;
    renderChain();
    renderHeader();
    elements.entryPanel.hidden = true;
    elements.finishPanel.hidden = false;
    elements.finishTitle.textContent = 'Complete';
    elements.finishDescription.textContent = `${state.puzzle.target} reached in ${result.movesUsed} moves. ${result.message} +${points} points. Your score is ${state.score}.`;
    elements.nextButton.textContent = `Next level · ${state.level + 1} →`;
    const banner = document.createElement('div');
    banner.className = 'completion-banner';
    const label = document.createElement('span');
    label.textContent = `Level ${state.level} complete`;
    const score = document.createElement('strong');
    score.textContent = `+${points} points`;
    banner.append(label, score);
    elements.finishPanel.querySelector('.completion-banner')?.remove();
    elements.finishPanel.prepend(banner);
    saveProgress();
    setBusy(false);
    elements.finishTitle.setAttribute('tabindex', '-1');
    elements.finishTitle.focus({ preventScroll: true });
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
      elements.input.select();
      setBusy(false);
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
      elements.input.focus({ preventScroll: true });
    }
  }

  // Input is deliberately restricted to ASCII letters and four characters.
  elements.input.addEventListener('input', () => {
    const clean = elements.input.value.replace(/[^a-z]/gi, '').toUpperCase().slice(0, WORD_LENGTH);
    if (elements.input.value !== clean) elements.input.value = clean;
    elements.submit.disabled = busy || state.completed || clean.length !== WORD_LENGTH;
  });
  elements.form.addEventListener('submit', submitMove);
  elements.newGameButton.addEventListener('click', () => startPuzzle({ resetScore: true }));
  elements.nextButton.addEventListener('click', () => startPuzzle({ nextLevel: true }));
  elements.retryButton.addEventListener('click', () => startPuzzle());

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
    getState: () => structuredClone(state),
    dictionarySize: WORD_SET.size
  });

  function initialize() {
    if (!(DICTIONARY instanceof Set) || DICTIONARY.size === 0 || WORDS.length === 0) {
      showError('The word dictionary failed to load. Refresh the page to try again.');
      return;
    }
    buildNeighborIndex();
    if (loadProgress()) {
      hideError();
      elements.loading.hidden = true;
      elements.game.hidden = false;
      renderPuzzle();
      if (state.completed) {
        elements.entryPanel.hidden = true;
        elements.finishPanel.hidden = false;
        elements.finishTitle.textContent = 'Complete';
        elements.finishDescription.textContent = `You have already reached ${state.puzzle.target}. Your score is ${state.score}.`;
        elements.nextButton.textContent = `Next level · ${state.level + 1} →`;
      }
      return;
    }
    startPuzzle({ resetScore: true });
  }

  // Another tab may update the same browser snapshot. Do not silently replace
  // the active in-memory game; explain the conflict and let the player reload.
  window.addEventListener('storage', (event) => {
    if (event.key === PROGRESS_KEY && event.newValue !== event.oldValue) {
      setMessage('Game progress changed in another tab. Reload this page to use the latest saved game.', 'error');
    }
  });

  initialize();
})();
