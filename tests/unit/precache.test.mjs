// The service worker's precache list (generated into sw.js by
// `python3 tools/build.py precache`) must name every shipped file, or that
// file is missing offline. The VERSION hash is not checked here (it changes
// on every edit); rebuild before deploying so iPads pick up the new version.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from '../../tools/harness.mjs';

const sw = readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

function expectedFiles() {
  const py = 'import sys, json; sys.path.insert(0, "tools"); import build; '
    + 'print(json.dumps(build.precache_block(build.ROOT)[1]))';
  return JSON.parse(execFileSync('python3', ['-c', py], { cwd: ROOT, encoding: 'utf8' }));
}

test('sw.js precaches exactly the shipped files (run `python3 tools/build.py precache` if this fails)', () => {
  const block = sw.slice(sw.indexOf('// BEGIN PRECACHE'), sw.indexOf('// END PRECACHE'));
  const listed = JSON.parse(block.slice(block.indexOf('['), block.lastIndexOf(']') + 1));
  assert.deepEqual(listed, expectedFiles());
});

test('precache list ships only runtime files', () => {
  const files = expectedFiles();
  assert.ok(files.includes('./'), 'the folder URL the home-screen icon opens');
  for (const f of ['./index.html', './manifest.webmanifest', './src/main.js', './src/pwa.js', './assets/icons/icon-180.png']) {
    assert.ok(files.includes(f), f);
  }
  const bad = files.filter((f) => /^\.\/(archive|art-bakeoff|spikes|tests|tools|docs)\/|\/\.|\.py$|^\.\/sw\.js$/.test(f));
  assert.deepEqual(bad, []);
});

test('sw.js has no skipWaiting on install (new versions wait; see the P1.2 ruling)', () => {
  const install = sw.slice(sw.indexOf("addEventListener('install'"), sw.indexOf("addEventListener('activate'"));
  assert.doesNotMatch(install.replace(/\/\/.*$/gm, ''), /skipWaiting\(\)/);
});
