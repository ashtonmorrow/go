// Pre-flight lint for the YAML colon-space hazard documented in CLAUDE.md.
//
// Inside YAML scalar bodies (FAQ `a:` values, guide_card `body:` and `intro:`
// values, frontmatter `description:`), a literal colon-space sequence (`: `)
// breaks gray-matter parse and the Vercel build fails. Amsterdam caught us
// once. Tirana caught us again in May 2026 (FAQ wrote "covers the city: the
// painted...").
//
// This script parses every content/**/*.md frontmatter via the same loader
// the build uses and reports any file that fails. Run before pushing.
//
// Run: node scripts/lint-frontmatter-yaml.mjs
// Exit 1 if any file fails to parse.

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

const dirs = ['content/lists', 'content/posts'];
const failures = [];
let checked = 0;

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const stat = fs.statSync(p);
    if (stat.isDirectory()) { walk(p); continue; }
    if (!f.endsWith('.md')) continue;
    checked++;
    const text = fs.readFileSync(p, 'utf8');
    const fm = text.match(/^---\n([\s\S]*?)\n---/);
    if (!fm) continue;
    try {
      yaml.load(fm[1]);
    } catch (e) {
      failures.push({ file: p, message: e.message });
    }
  }
}

for (const d of dirs) walk(d);

if (failures.length === 0) {
  console.log(`OK: parsed ${checked} markdown frontmatter blocks cleanly.`);
  process.exit(0);
}

console.error(`FAIL: ${failures.length} of ${checked} files have broken frontmatter YAML.`);
for (const f of failures) {
  console.error(`\n  ${f.file}`);
  console.error(`    ${f.message.split('\n')[0]}`);
}
console.error('\nMost common cause: a literal ": " sequence inside an unquoted YAML value.');
console.error('Fix: replace the colon with a period, semicolon (in voice-exempt fields), or wrap the value in double quotes.');
process.exit(1);
