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
assert(worker.includes('const CACHE_NAME = `' + '${CACHE_PREFIX}' + 'v9`'));
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
assert(html.includes('aria-label="Send word"'));
assert(html.includes('autocorrect="off"'));
assert(html.includes('writingsuggestions="false"'));
assert(html.includes('<form id="move-form" autocomplete="off" novalidate>'));
assert(html.includes('id="copy-challenge-button"'));
assert(!html.includes('name="wrdlink-word"'));
assert(!html.includes('data-form-type="other"'));
assert(game.includes('elements.downloadResultButton.addEventListener'));
assert(game.includes('Native sharing was unavailable. Use Download PNG instead.'));
assert(game.includes('navigator.share(data)'));
assert(game.includes('wrdlink-challenge.png'));
assert(game.includes('width="1080" height="1920"'));
assert(game.includes('canvas.height = 1920'));
assert(!game.includes('canvas.height = 1350'));
assert(game.includes('font-family:Barlow Condensed, Arial Narrow, sans-serif'));
assert(game.includes('font-family:DM Mono, monospace'));
assert(game.includes('baseFrequency=".85"'));
assert(game.includes('fill="#14221f"'));
assert(game.includes('cardConnectorRow(first, second, y, dotted = false, tileSize = CARD_TILE, tileGap = CARD_GAP, linkHeight = CARD_LINK_HEIGHT)'));
assert(game.includes('const hidden = kind === \'mid\' && !reveal'));
assert(game.includes('const visibleWords = sequence.length > 5'));
assert(!game.includes('height="1824"'));
assert(!game.includes('THINK SHARP. LINK WORDS.'));
assert(game.includes('function cardSvgShell(content)'));
assert(game.includes('pattern id="midtiles"'));
assert(game.includes('stroke-dasharray="7 7"'));
assert(game.includes('width=\"1080\" height=\"1920\" viewBox=\"0 0 1080 1920\"'));
assert(game.includes('YOUR MOVE'));
assert(game.includes('LETTERS APART'));
assert(game.includes('MOVES NEEDED'));
assert(game.includes('CONNECTED'));
assert(game.includes('SHORTEST ROUTE FOUND'));
assert(game.includes('LEVEL SCORE'));
assert(game.includes('function cardLadderRows(words, y, reveal, dotted = false, compact = false)'));
assert(game.includes('const tileSize = compact ? 112 : CARD_TILE'));
assert(game.includes('const compactLadder = visibleWords.length === 5'));
assert(game.includes('function changedLetterIndex(first, second)'));

assert(game.includes('const apart = [...start].filter((letter, index) => letter !== target[index]).length'));
assert(game.includes('const shortest = result.movesUsed === state.puzzle.optimalMoves'));
assert(game.includes('const ladder = cardLadderRows(visibleWords, compactLadder ? 650 : 625, false, false, compactLadder)'));
assert(game.includes("width=\"' + tileSize + '\" height=\"' + tileSize + '\""));
assert(game.includes("y + 'v' + linkHeight + '"));
assert(game.includes("width=\"' + tileSize + '\" height=\"' + tileSize + '\""));
assert(game.includes("y + 'v' + linkHeight + '"));
assert(game.includes('const rowHeight = 112'));
assert(game.includes('KAELITH69.GITHUB.IO/WRDLINK-WEB'));
assert(game.includes('async function copyChallengeLink()'));
assert(game.includes('elements.copyChallengeButton.addEventListener'));
assert(game.includes('Can you solve this WRDLINK word ladder?'));
assert(game.includes('elements.input.focus({ preventScroll: true })'));
assert(styles.includes(':root.keyboard-open .entry-panel .send-button'));

console.log('WRDLINK PWA metadata and deployment checks passed.');
