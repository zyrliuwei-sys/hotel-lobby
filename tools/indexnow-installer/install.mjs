#!/usr/bin/env node
/**
 * One-click IndexNow installer for ShipAny (TanStack Start) projects.
 *
 *   node install.mjs /path/to/project            install
 *   node install.mjs /path/to/project --force    overwrite existing IndexNow files
 *   node install.mjs /path/to/project --uninstall
 *
 * Adds /admin/indexnow (paste the Bing key, check the key file, submit URLs),
 * serves the key at /{key}.txt, and registers the admin nav entry + en/zh
 * messages. Every file it changes is backed up first to
 * <project>/.indexnow-backup-<timestamp>/.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FILES_DIR = join(HERE, 'files');
const NAV_ROUTE = 'src/routes/admin/route.tsx';
const NAV_MARKER = "href: '/admin/indexnow'";

const args = process.argv.slice(2);
const force = args.includes('--force');
const uninstall = args.includes('--uninstall');
const target = resolve(args.find((a) => !a.startsWith('--')) || '.');

const log = (msg) => console.log(msg);
const fail = (msg) => {
  console.error(`✖ ${msg}`);
  process.exit(1);
};

function listFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

// ---- preflight -------------------------------------------------------------
for (const required of [
  'package.json',
  'src/modules/config/service.ts',
  'src/modules/rbac/service.ts',
  NAV_ROUTE,
  'messages/en.json',
]) {
  if (!existsSync(join(target, required))) {
    fail(
      `${target} doesn't look like a ShipAny TanStack project (missing ${required})`
    );
  }
}

const payload = listFiles(FILES_DIR).map((src) => relative(FILES_DIR, src));
const locales = ['en', 'zh'].filter((l) =>
  existsSync(join(target, `messages/${l}.json`))
);

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const backupDir = join(target, `.indexnow-backup-${stamp}`);
const backup = (rel) => {
  const src = join(target, rel);
  if (!existsSync(src)) return;
  const dest = join(backupDir, rel);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
};

// ---- uninstall -------------------------------------------------------------
if (uninstall) {
  for (const rel of payload) {
    if (existsSync(join(target, rel))) {
      backup(rel);
      rmSync(join(target, rel));
      log(`- removed ${rel}`);
    }
  }
  const moduleDir = join(target, 'src/modules/indexnow');
  if (existsSync(moduleDir) && readdirSync(moduleDir).length === 0) {
    rmSync(moduleDir, { recursive: true });
  }
  const navPath = join(target, NAV_ROUTE);
  let nav = readFileSync(navPath, 'utf8');
  const at = nav.indexOf(NAV_MARKER);
  if (at !== -1) {
    backup(NAV_ROUTE);
    const start = nav.lastIndexOf('\n', nav.lastIndexOf('{', at)) + 1;
    const end = nav.indexOf('},', at) + 3;
    nav = nav.slice(0, start) + nav.slice(end);
    nav = nav.replace(/\n {2}Radar,\n/, '\n');
    writeFileSync(navPath, nav);
    log(`- removed nav entry from ${NAV_ROUTE}`);
  }
  for (const l of locales) {
    const rel = `messages/${l}.json`;
    const msgs = JSON.parse(readFileSync(join(target, rel), 'utf8'));
    const ours = JSON.parse(
      readFileSync(join(HERE, `messages.${l}.json`), 'utf8')
    );
    backup(rel);
    for (const k of Object.keys(ours)) delete msgs[k];
    writeFileSync(join(target, rel), `${JSON.stringify(msgs, null, 2)}\n`);
    log(`- removed IndexNow messages from ${rel}`);
  }
  log(`\n✔ Uninstalled. Backup: ${relative(target, backupDir)}`);
  log('  The `indexnow_key` row in the config table is left in place.');
  process.exit(0);
}

// ---- install ---------------------------------------------------------------
const clashes = payload.filter((rel) => existsSync(join(target, rel)));
if (clashes.length && !force) {
  fail(
    `Already present (use --force to overwrite):\n  ${clashes.join('\n  ')}`
  );
}

for (const rel of payload) {
  backup(rel);
  mkdirSync(dirname(join(target, rel)), { recursive: true });
  copyFileSync(join(FILES_DIR, rel), join(target, rel));
  log(`+ ${rel}`);
}

// Messages: add our keys, never overwrite the project's own wording.
for (const l of ['en', 'zh']) {
  const rel = `messages/${l}.json`;
  if (!existsSync(join(target, rel))) {
    log(
      `! ${rel} not found — skipped (add the keys from messages.${l}.json yourself)`
    );
    continue;
  }
  const msgs = JSON.parse(readFileSync(join(target, rel), 'utf8'));
  const ours = JSON.parse(
    readFileSync(join(HERE, `messages.${l}.json`), 'utf8')
  );
  const added = Object.keys(ours).filter((k) => !(k in msgs));
  if (added.length) {
    backup(rel);
    for (const k of added) msgs[k] = ours[k];
    writeFileSync(join(target, rel), `${JSON.stringify(msgs, null, 2)}\n`);
  }
  log(`+ ${rel}: ${added.length} keys added`);
}

// Admin nav: insert an entry right before the Settings item.
const navPath = join(target, NAV_ROUTE);
let nav = readFileSync(navPath, 'utf8');
if (nav.includes(NAV_MARKER)) {
  log(`= ${NAV_ROUTE}: nav entry already present`);
} else {
  const at = nav.indexOf("href: '/admin/settings'");
  const importAt = nav.indexOf("} from 'lucide-react';");
  if (at === -1 || importAt === -1) {
    log(`! Couldn't find the Settings nav item in ${NAV_ROUTE}. Add manually:`);
    log(
      `  { href: '/admin/indexnow', label: m['admin.nav.indexnow'](), icon: Radar },`
    );
  } else {
    backup(NAV_ROUTE);
    const lineStart = nav.lastIndexOf('\n', nav.lastIndexOf('{', at)) + 1;
    const indent = nav.slice(lineStart).match(/^\s*/)[0];
    const inner = `${indent}  `;
    const entry =
      `${indent}{\n` +
      `${inner}href: '/admin/indexnow',\n` +
      `${inner}label: m['admin.nav.indexnow'](),\n` +
      `${inner}icon: Radar,\n` +
      `${indent}},\n`;
    nav = nav.slice(0, lineStart) + entry + nav.slice(lineStart);
    if (
      !/\bRadar\b/.test(nav.slice(0, nav.indexOf("} from 'lucide-react';")))
    ) {
      nav = nav.replace(
        "} from 'lucide-react';",
        "  Radar,\n} from 'lucide-react';"
      );
    }
    writeFileSync(navPath, nav);
    log(`+ ${NAV_ROUTE}: nav entry added`);
  }
}

log(`\n✔ IndexNow installed into ${target}`);
if (existsSync(backupDir))
  log(`  Backup of changed files: ${relative(target, backupDir)}`);
log('\nNext:');
log(
  '  1. pnpm build              (regenerates routeTree + messages, checks types)'
);
log('  2. deploy, then open /admin/indexnow');
log('  3. paste the key from https://www.bing.com/indexnow/getstarted → Save');
log('  4. when the key file shows ✔, click "Submit all sitemap URLs"');
