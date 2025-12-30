#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opts = {};

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (!arg.startsWith('--')) continue;
  const key = arg.slice(2);
  const next = args[i + 1];
  if (!next || next.startsWith('--')) {
    opts[key] = true;
    continue;
  }
  opts[key] = next;
  i += 1;
}

if (opts.help) {
  console.log(`Usage: node scripts/extract-release-notes.mjs [options]

Options:
  --version <semver>     Version to extract (default: package.json version)
  --changelog <path>     Changelog path (default: CHANGELOG.md)
  --out <path>           Write notes to file instead of stdout
  --latest-json <path>   Update latest.json notes field in place
  --help                 Show this help
`);
  process.exit(0);
}

const root = process.cwd();
const changelogPath = path.resolve(root, opts.changelog || 'CHANGELOG.md');
const pkgPath = path.resolve(root, 'package.json');

const readFile = (p) => fs.readFileSync(p, 'utf8');

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const extractSection = (content, version) => {
  const safeVersion = escapeRegExp(version.trim());
  if (!safeVersion) return null;
  const heading = new RegExp(`^##\\s*\\[?v?${safeVersion}\\]?(?:\\s*-.*)?$`, 'mi');
  const match = heading.exec(content);
  if (!match) return null;
  const start = match.index;
  const after = content.slice(start + match[0].length);
  const next = after.search(/^##\\s+/m);
  const end = next === -1 ? content.length : start + match[0].length + next;
  return content.slice(start, end).trim();
};

let version = opts.version;
if (!version) {
  const pkg = JSON.parse(readFile(pkgPath));
  version = pkg.version;
}

const changelog = readFile(changelogPath);
const notes = extractSection(changelog, version);

if (!notes) {
  console.error(`Failed to find version ${version} in ${changelogPath}`);
  process.exit(1);
}

if (opts['latest-json']) {
  const latestPath = path.resolve(root, opts['latest-json']);
  const latest = JSON.parse(readFile(latestPath));
  latest.notes = notes;
  fs.writeFileSync(latestPath, `${JSON.stringify(latest, null, 2)}\n`, 'utf8');
}

if (opts.out) {
  const outPath = path.resolve(root, opts.out);
  fs.writeFileSync(outPath, `${notes}\n`, 'utf8');
} else {
  process.stdout.write(`${notes}\n`);
}
