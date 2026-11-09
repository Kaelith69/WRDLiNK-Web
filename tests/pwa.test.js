'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('index.html');
const manifest = JSON.parse(read('manifest.webmanifest'));
const worker = read('sw.js');
const styles = read('styles.css');
const game = read('app.js');
const deploy = read('.github/workflows/deploy-pages.yml');

assert(html.includes('rel="manifest" href="./manifest.webmanifest"'));
assert(html.includes("navigator.serviceWorker.register('./sw.js'"));
assert(html.includes('assets/wrdlink-icon.svg'));
assert.match(styles, /keyboard-open \.metric-label\s*\{\s*display:\s*block/s, 'score and move labels remain visible while the mobile keyboard is open');
assert.match(styles, /keyboard-open \.game-header\s*\{[^}]*min-height:\s*54px;[^}]*flex:\s*0 0 54px;/s, 'keyboard header grows to contain its controls');
assert.match(styles, /keyboard-open \.header-hint-button\s*\{[^}]*height:\s*36px;/s, 'hint control shrinks to fit inside the taller keyboard header');
assert.match(styles, /keyboard-open \.theme-toggle\s*\{[^}]*height:\s*32px;/s, 'theme control shrinks with the keyboard header');
assert.match(styles, /keyboard-open \.header-right\s*\{[^}]*min-width:\s*0;[^}]*max-width:\s*100%;/s, 'right header controls are constrained to available width');
assert.match(styles, /keyboard-open \.score-pill,[\s\S]*?keyboard-open \.moves-pill\s*\{[^}]*width:\s*40px;[^}]*min-width:\s*40px;/, 'score and move pills use fixed compact widths');
assert.match(html, /id="score-label">25<\/strong>/, 'initial HTML displays the starting 25 points before JavaScript initializes');
assert(html.includes('rel="apple-touch-icon" href="./assets/wrdlink-icon-180.png"'));
assert.equal(manifest.name, 'WRDLINK | Word Ladder');
assert.equal(manifest.short_name, 'WRDLINK');
assert.equal(manifest.start_url, './?source=pwa');
assert.equal(manifest.scope, './');
assert.equal(manifest.display, 'standalone');
for (const [size, filename] of [['192x192', 'wrdlink-icon-192.png'], ['512x512', 'wrdlink-icon-512.png']]) {
  assert(manifest.icons.some((icon) =>
    icon.src === './assets/' + filename &&
    icon.type === 'image/png' &&
    icon.sizes === size &&
    icon.purpose === 'any'
  ), 'manifest declares a ' + size + ' PNG app icon');
}
assert(manifest.icons.some((icon) => icon.src === './assets/wrdlink-icon.svg' && icon.sizes === 'any'));
assert(read('assets/wrdlink-icon.svg').includes('viewBox="0 0 512 512"'));
for (const asset of ['./index.html', './styles.css', './app.js', './dictionary.js', './manifest.webmanifest', './assets/wrdlink-icon.svg', './assets/wrdlink-icon-192.png', './assets/wrdlink-icon-512.png', './assets/wrdlink-icon-180.png']) {
  assert(worker.includes(asset), 'service worker app shell includes ' + asset);
}
assert(worker.includes("const CACHE_PREFIX = 'wrdlink-shell-'"));
assert(worker.includes('const CACHE_NAME = `' + '${CACHE_PREFIX}' + 'v26`'));
assert(worker.includes("request.mode === 'navigate'"));
assert(worker.includes('self.clients.claim()'));
assert(deploy.includes('manifest.webmanifest sw.js'));
assert(deploy.includes('assets/wrdlink-icon.svg'));
assert(deploy.includes('rsvg-convert --width 192 --height 192'));
assert(deploy.includes('rsvg-convert --width 512 --height 512'));
assert(deploy.includes('rsvg-convert --width 180 --height 180'));
assert(read('README.md').includes('## Install the app'));
assert(read('README.md').includes('assets/readme-banner.svg'));
assert(read('LICENSE').includes('MIT License'));
assert(styles.includes(':root.keyboard-open .game-page'));
assert(styles.includes(':root.keyboard-open .chain-list'));
assert(styles.includes('overflow-y: auto'));
assert(styles.includes('flex: 1 1 auto'));
assert(game.includes('if (wasAtBottom) list.scrollTop = list.scrollHeight'));
assert(game.includes('const shareRequest = navigator.share(shareData)'));
assert(game.includes('window.setTimeout(() => URL.revokeObjectURL(url), 60000)'));
assert(game.includes('prepareResultCard(result)'));
assert(html.includes('id="share-status"'));
assert(html.includes('id="download-result-button"'));
assert(html.includes('enterkeyhint="send"'));
assert(html.includes('inputmode="none"'), 'native mobile keyboard is suppressed');
assert(html.includes('id="game-keyboard"'), 'the app contains its own on-screen keyboard');
assert.match(html, /data-key="Q"/, 'keyboard exposes letter keys');
assert.match(html, /data-key="BACKSPACE"/, 'keyboard exposes backspace');
assert.match(html, /data-key="ENTER"/, 'keyboard exposes submit');
assert.match(styles, /\.game-keyboard\s*\{\s*display:\s*none;\s*\}/, 'keyboard is hidden on desktop');
assert.match(styles, /@media \(max-width: 620px\)[\s\S]*?\.game-keyboard\s*\{[^}]*display:\s*grid;/, 'keyboard appears on mobile');
assert.match(styles, /overflow-y:\s*auto;/, 'game workspace scrolls above the keyboard');
assert(html.includes('aria-label="Send word"'));
assert(!html.includes('title="Send word"'));
assert(!html.includes('title="Switch theme"'));
assert(!html.includes('aria-label="Enter your next four letter word"'));
assert(!html.includes('id="entry-help"'));
assert(!html.includes('class="chain-hint"'));
assert(!html.includes('class="game-footer"'));
assert(!html.includes('class="loading-letters"'));
assert(html.includes('autocorrect="off"'));
assert(html.includes('writingsuggestions="false"'));
assert(html.includes('<form id="move-form" novalidate>'));
assert(!html.includes('copy-challenge-button'), 'redundant standalone copy link action is removed');
assert(html.includes('id="share-challenge-button"') && html.includes('class="secondary-button share-challenge-button"'), 'share challenge has its own styled action');
assert(html.includes('class="secondary-button new-game-button"'), 'new game has its own styled action');
assert(html.includes('id="level-label">LV0</strong>'), 'level numbering starts at LV0');
assert(game.includes("elements.levelLabel.textContent = `LV${Math.max(0, state.level - 1)}`"), "visible level labels use LV0, LV1, LV2 numbering");
assert(!game.includes('copyChallengeLink') && !game.includes('copyChallengeButton'), 'removed copy action has no unused application code');
assert(!html.includes('name="wrdlink-word"'));
assert(!html.includes('data-form-type="other"'));
assert(game.includes('elements.downloadResultButton.addEventListener'));
assert(game.includes('Native sharing was unavailable. Use Download PNG instead.'));
assert(game.includes("elements.hintCostChip.textContent = hintIsActive ? 'READY' : `−${cost}`"), 'hint button shows the escalating hint price without the separate move cost');
assert(game.includes("Total deduction ${totalCost}"), "hint accessibility text explains the combined deduction");
assert(html.includes('Total deduction, hint plus move'), 'hint confirmation labels the combined hint and move cost');
assert(game.includes('navigator.share(data)'));
assert(game.includes('wrdlink-challenge.png'));
assert(game.includes('width="1080" height="1920"'));
assert(game.includes('canvas.height = 1920'));
assert(!game.includes('canvas.height = 1350'));
assert(game.includes('font-family=\"Barlow Condensed, Arial Narrow, sans-serif\"'));
assert(game.includes('font-family=\"DM Mono, monospace\"'));
assert(game.includes('baseFrequency=".85"'));
assert(game.includes('fill="#14221f"'));
assert(game.includes('cardConnectorRow(first, second, y, dotted = false, tileSize = CARD_TILE, tileGap = CARD_GAP, linkHeight = CARD_LINK_HEIGHT)'));
assert(game.includes('const hidden = kind === \'mid\' && !reveal'));
assert(game.includes('const visibleWords = sequence.length > 5'));
assert(!game.includes('height="1824"'));
assert(!game.includes('THINK SHARP. LINK WORDS.'));
assert(game.includes('function cardSvgShell(content)'));
assert(game.includes('pattern id="midtiles"'));
assert(game.includes('stroke-dasharray="14 11"'));
assert(game.includes('stroke-width="12" stroke-dasharray="14 11" stroke-linecap="butt"'));
assert(game.includes('font-size="238"'));
assert(game.includes('const labelMargin = 39'));
assert(game.includes('height="5" rx="2" fill="#ffffff" opacity=".3"'));
assert(game.includes('top: 205, bottom: 1747, brand: 78, heading: 254'));
assert(game.includes('const compactLadder = visibleWords.length >= 4'));
assert(game.includes('layout.footerY + 179'));
assert(game.includes('width="465" height="77"'));
assert(game.includes('width="540" height="77"'));
assert(game.includes('width=\"1080\" height=\"1920\" viewBox=\"0 0 1080 1920\"'));
assert(game.includes('YOUR MOVE'));
assert(game.includes('LETTERS APART'));
assert(game.includes('MOVES NEEDED'));
assert(game.includes('CONNECTED'));
assert(game.includes('SHORTEST ROUTE FOUND'));
assert(game.includes('LEVEL SCORE'));
assert(game.includes('function cardLadderRows(words, y, reveal, dotted = false, compact = false)'));
assert(game.includes('const labelX = labelLineX + 43 + 17'));
assert(game.includes('stroke-dasharray="14 11"'));
assert(game.includes('stroke-width="12" stroke-dasharray="14 11"'));
assert(game.includes("(changed ? 19 : 12)"));
assert(game.includes('height="5" rx="2" fill="#ffffff" opacity=".3"'));
assert(game.includes('const tileSize = compact ? 112 : CARD_TILE'));
assert(game.includes('const compactLadder = visibleWords.length >= 4'));
assert(game.includes('function changedLetterIndex(first, second)'));

assert(game.includes('const apart = [...start].filter((letter, index) => letter !== target[index]).length'));
assert(game.includes('const shortest = result.movesUsed === state.puzzle.optimalMoves'));
assert(game.includes('const ladder = cardLadderRows(visibleWords, layout.ladderY, false, false, compactLadder)'));
assert(game.includes("font-size=\"' + (tileSize * .67) + '\""));
assert(game.includes("(y - 15) + 'v' + (linkHeight + 30)"));
assert(game.includes("labelLineX + 43 + 17"));
assert(game.includes('window.location.host || window.location.hostname ||'));
assert(game.includes('challengeUrl().replace(/^https?:\\/\\//, \'\')'));
assert(game.includes('Can you solve this WRDLINK word ladder?'));
assert(game.includes('elements.input.focus({ preventScroll: true })'));
assert(styles.includes(':root.keyboard-open .entry-panel .send-button'));
assert(styles.includes(':root.keyboard-open .entry-actions { display: none; }'));

// README rendering and documentation contracts. GitHub renders these local
// SVGs reliably when they are embedded as Markdown images, not plain links.
const readme = read('README.md');
assert.ok(readme.startsWith('![WRDLINK banner](assets/readme-banner.svg)'), 'README begins with an embedded banner');
for (const asset of [
  'assets/readme-banner.svg',
  'assets/readme-ladder.svg',
  'assets/readme-scoring.svg',
  'assets/readme-bfs.svg',
  'assets/readme-architecture.svg'
]) {
  assert(readme.includes('](' + asset + ')'), 'README embeds ' + asset);
  assert(fs.existsSync(path.join(__dirname, '..', asset)), 'README image exists: ' + asset);
}
assert.doesNotMatch(readme, /```mermaid/, 'README does not depend on Mermaid rendering');
assert.ok(readme.includes('Each new level starts with **25 points**'), 'README documents the 25 point per level reset');
assert.match(readme, /hint price increases by one for every confirmed hint within the current level/i, 'README documents level scoped hint escalation');
assert.match(readme, /resets when the next level begins/i, 'README documents the hint reset between levels');
assert.match(readme, /version 6/, 'README documents the current save schema');
assert.match(readme, /3,889 four letter words/, 'README documents the bundled dictionary size');

console.log('WRDLINK PWA metadata and deployment checks passed.');
