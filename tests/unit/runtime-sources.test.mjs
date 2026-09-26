// Static checks over everything the iPad downloads (index.html, manifest,
// sw.js, src/): no network URLs (offline-only rule) and none of the common
// features newer than the Safari 16.0 floor. This is a cheap tripwire, not a
// full compat checker: when in doubt, check caniuse and add a pattern here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from '../../tools/harness.mjs';

function runtimeFiles() {
  const out = ['index.html', 'manifest.webmanifest', 'sw.js'].filter((f) => existsSync(path.join(ROOT, f)));
  const walk = (dir) => {
    for (const name of readdirSync(path.join(ROOT, dir))) {
      const rel = path.join(dir, name);
      if (statSync(path.join(ROOT, rel)).isDirectory()) walk(rel);
      else if (/\.(js|mjs|css|html|json|svg)$/.test(name)) out.push(rel);
    }
  };
  walk('src');
  return out;
}

// XML namespace identifiers look like URLs but are never fetched.
const NAMESPACES = /https?:\/\/www\.w3\.org\/(2000\/svg|1999\/xlink|1999\/xhtml|XML\/1998\/namespace)/g;

test('runtime sources contain no http(s) URLs', () => {
  const hits = [];
  for (const f of runtimeFiles()) {
    const text = readFileSync(path.join(ROOT, f), 'utf8').replace(NAMESPACES, '');
    text.split('\n').forEach((line, i) => {
      if (/https?:\/\//.test(line)) hits.push(`${f}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(hits, []);
});

// [pattern, applies to (regex on filename), why]
const TOO_NEW = [
  [/\bimport\b[^;]*\b(with|assert)\s*\{\s*type\s*:/, /\.m?js$/, 'JSON/CSS module imports need Safari 17.2; fetch() the JSON instead'],
  [/<script[^>]*type=["']?importmap/, /\.html$/, 'import maps need Safari 16.4'],
  [/\bstatic\s*\{/, /\.m?js$/, 'class static blocks need Safari 16.4'],
  [/\bArray\.fromAsync\b/, /\.m?js$/, 'Array.fromAsync needs Safari 16.4'],
  [/\bPromise\.withResolvers\b/, /\.m?js$/, 'Promise.withResolvers needs Safari 17.4'],
  [/\b(Object|Map)\.groupBy\b/, /\.m?js$/, 'Object/Map.groupBy need Safari 17.4'],
  [/\brequestIdleCallback\b/, /\.m?js$/, 'requestIdleCallback is not in Safari 16'],
  [/\bstorage\.estimate\b/, /\.m?js$/, 'navigator.storage.estimate needs Safari 17'],
  [/\bOffscreenCanvas\b/, /\.m?js$/, 'OffscreenCanvas needs Safari 16.4 (2D) / 17 (WebGL)'],
  [/\bBarcodeDetector\b/, /\.m?js$/, 'BarcodeDetector is not in Safari'],
  [/\bwakeLock\b/, /\.m?js$/, 'Screen Wake Lock needs Safari 16.4'],
  [/\bcolor-mix\(/, /\.(css|m?js|html)$/, 'color-mix() needs Safari 16.2'],
  [/\blight-dark\(/, /\.(css|m?js|html)$/, 'light-dark() needs Safari 17.5'],
  [/@starting-style|@scope\b|@property\b/, /\.(css|html)$/, '@starting-style/@scope/@property need Safari 16.4+'],
  [/\btext-wrap\s*:/, /\.(css|html)$/, 'text-wrap needs Safari 17.4'],
  [/(^|[\s,{])&[\s.:#[>+~]/, /\.css$/, 'CSS nesting needs Safari 16.5'],
];

function stripComments(text, file) {
  let t = text.replace(/\/\*[\s\S]*?\*\//g, '');
  if (/\.m?js$/.test(file)) t = t.replace(/(^|[^:"'`])\/\/.*$/gm, '$1');
  if (/\.html$/.test(file)) t = t.replace(/<!--[\s\S]*?-->/g, '');
  return t;
}

test('runtime sources avoid features newer than Safari 16.0', () => {
  const hits = [];
  for (const f of runtimeFiles()) {
    const lines = stripComments(readFileSync(path.join(ROOT, f), 'utf8'), f).split('\n');
    for (const [re, applies, why] of TOO_NEW) {
      if (!applies.test(f)) continue;
      lines.forEach((line, i) => { if (re.test(line)) hits.push(`${f}:${i + 1}: ${why}`); });
    }
  }
  assert.deepEqual(hits, []);
});
