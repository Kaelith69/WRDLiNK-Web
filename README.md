# WRDLINK Browser Edition

A standalone, dependency free word ladder game that runs entirely in your browser. WRDLINK challenges you to transform one four letter word into another, changing exactly one letter per move.

The browser edition keeps the original word ladder mechanics and gives them a fresh, tactile interface with responsive layouts, accessible controls, and persistent light and dark themes.

## Features

- **3,889 word dictionary** bundled locally. No API calls or external dictionary service.
- **Randomly generated puzzles** using valid paths through the dictionary.
- **Shortest path calculation** with breadth first search, while allowing any valid longer solution.
- **Move validation** for dictionary membership, one letter changes, and repeated words.
- **Level scoring** with a 50 point starting value and a one point deduction per move.
- **Progressive levels** with cumulative scoring during a game.
- **Light and dark themes** with manual selection, saved preference, and system theme detection on first visit.
- **Local progress storage** using the browser's `localStorage`.
- **Responsive interface** designed for desktop, tablet, and mobile screens.
- **Accessibility support** including semantic controls, keyboard focus visibility, live status announcements, reduced motion preferences, and non colour state cues.
- **No framework, build step, or runtime dependencies.**

## Play

### Run locally

1. Download or clone this repository.
2. Open `index.html` in a modern browser.
3. Start a game and build a word ladder.

No installation or development server is required for normal play.

### Run the checks

Node.js 18 or newer is required only for the test suite.

```bash
npm test
```

## How to play

1. Begin with the displayed four letter start word.
2. Enter a new four letter word that differs from the previous word by exactly one letter.
3. Every submitted word must be in the bundled dictionary.
4. Do not reuse a word already present in the current chain.
5. Reach the target word to complete the level.
6. Invalid submissions do not advance the chain or consume a move.

### Scoring

Each level begins with **50 points**. Every submitted valid move deducts one point, with a minimum level score of zero.

```text
Level score = max(0, 50 - valid moves used)
```

Completed level scores accumulate during the current game. Starting a new game resets the level and total score.

Puzzles are generated from connected paths in the dictionary. Breadth first search calculates a shortest path, but players may complete a longer valid path.

## Project structure

```text
.
├── index.html          # Accessible game shell and theme controls
├── styles.css          # Responsive design system and light/dark themes
├── app.js              # Puzzle generation, validation, scoring, and progression
├── dictionary.js       # 3,889 unique four letter words
├── package.json        # Test command
├── tests/
│   └── game.test.js    # Dictionary, adjacency, and scoring checks
└── README.md
```

## Privacy and data

The game runs locally in the browser. Game progress and theme preference are stored in the current browser profile using `localStorage`. No account, server, analytics service, or cross device synchronization is included in this edition. If the same game is open in multiple tabs, a tab detects an external progress update and stops overwriting the newer saved snapshot. Reload that tab to continue from the latest saved game.

## Accessibility

The interface is designed to support keyboard and touch interaction, visible focus, semantic form controls, concise status announcements, reduced motion preferences, and scrollable long word chains. Colour is not the only way game state is communicated. Contrast and browser or screen reader combinations should still be checked on the target devices before release.

## Technology

- HTML
- CSS
- Vanilla JavaScript
- Browser `localStorage`
- Node.js built in test modules

## Project status

This is the independent browser edition of WRDLINK. It does not require Reddit, Devvit, Redis, or a backend service.

## License

No open source license has been assigned yet. Unless a license is added, the source remains under its default copyright. You may view and fork the repository through GitHub, but the usual open source reuse permissions are not automatically granted.

## Deploy with GitHub Pages

WRDLINK is a static site and does not need a build step. The GitHub Actions workflow in `.github/workflows/deploy-pages.yml` publishes the game files from the repository root whenever a commit is pushed to `main`.

To enable the first deployment:

1. Open the repository's **Settings → Pages**.
2. Under **Build and deployment**, select **GitHub Actions** as the source if it is not already selected.
3. Open the **Actions** tab and wait for the **Deploy to GitHub Pages** workflow to finish successfully.
4. Open the published URL shown in the deployment job or in **Settings → Pages**.

The deployment contains only the runtime files: `index.html`, `styles.css`, `app.js`, and `dictionary.js`. Tests, documentation, and development files are not published. Later pushes to `main` deploy automatically. A manual deployment can also be started with **Actions → Deploy to GitHub Pages → Run workflow**.

