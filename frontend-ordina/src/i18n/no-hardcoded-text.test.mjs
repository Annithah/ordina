// Fails if a screen or component shows text that is not from the translation files.
// Checks JSX text, text props (placeholder, accessibilityLabel, title, label…), and toast/Alert calls.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const FOLDERS = ['app', 'components'];
// Brand names and symbols that are the same in every language.
const ALLOWED = new Set(['ORDINA', 'ORDINA AI', 'ORDI', 'NA', 'Google', 'Apple', 'OK', '—', '·', '%', '+', '0']);

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return path.endsWith('.tsx') ? [path] : [];
  });
}

const hasWords = (text) => /[A-Za-zÀ-ÿ]{2,}/.test(text) && !ALLOWED.has(text.trim());

function problems(source) {
  const found = [];
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  // JSX text between tags: >Some words<
  for (const match of code.matchAll(/>\s*([^<>{}\n]*[A-Za-z][^<>{}\n]*)\s*</g)) {
    const text = match[1].trim();
    if (text && hasWords(text) && !/[;=&()?]/.test(text)) found.push(text);
  }
  // Text props with a literal string.
  for (const match of code.matchAll(/\b(placeholder|accessibilityLabel|accessibilityHint|title|label|message|confirmLabel|cancelLabel|heading|subheading)=["']([^"']+)["']/g)) {
    if (hasWords(match[2])) found.push(`${match[1]}="${match[2]}"`);
  }
  // toast.x('…') / Alert.alert('…')
  for (const match of code.matchAll(/\b(?:toast\.\w+|Alert\.alert)\(\s*(['"`])([^'"`]+)\1/g)) {
    if (hasWords(match[2])) found.push(`${match[0]})`);
  }
  return found;
}

test('screens and components only show translated text', () => {
  const report = [];
  for (const folder of FOLDERS) {
    for (const path of files(join(ROOT, folder))) {
      const found = problems(readFileSync(path, 'utf8'));
      if (found.length) report.push(`${relative(ROOT, path)}: ${found.join(' | ')}`);
    }
  }
  assert.deepEqual(report, []);
});
