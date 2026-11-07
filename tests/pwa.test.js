'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('index.html');
const manifest = JSON.parse(read('manifest.webmanifest'));
const worker = read('sw.js');
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
assert(worker.includes('const CACHE_NAME = `' + '${CACHE_PREFIX}' + 'v3`'));
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

console.log('WRDLINK PWA metadata and deployment checks passed.');
