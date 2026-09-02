#!/usr/bin/env node
/**
 * One-shot codemod: append .js to relative import/export specifiers for NodeNext ESM.
 * Skips paths that already have a known extension (.js, .json, .mjs, .cjs, .node, .ts).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_ROOTS = ['api', 'lib', 'utils', 'test'];
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.test-artifacts',
  '.serverless',
  '.esbuild',
]);

const HAS_EXT = /\.(js|json|mjs|cjs|node|ts)$/;

function fixImports(content) {
  return content.replace(
    /(from\s+['"])(\.\.?\/[^'"]+)(['"])/g,
    (match, pre, spec, post) => {
      if (HAS_EXT.test(spec)) {
        return match;
      }
      return `${pre}${spec}.js${post}`;
    },
  );
}

function walk(dir, changed) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (!SKIP_DIRS.has(name)) {
        walk(full, changed);
      }
      continue;
    }
    if (!name.endsWith('.ts')) {
      continue;
    }
    const orig = fs.readFileSync(full, 'utf8');
    const next = fixImports(orig);
    if (next !== orig) {
      fs.writeFileSync(full, next);
      changed.push(path.relative(ROOT, full));
    }
  }
}

const changed = [];
for (const root of SCAN_ROOTS) {
  walk(path.join(ROOT, root), changed);
}

console.log(`Updated ${changed.length} file(s):`);
for (const file of changed) {
  console.log(`  ${file}`);
}
