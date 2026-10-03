#!/usr/bin/env node
// Refresh the installer bundle from this project's working copy:
//   node tools/indexnow-installer/sync.mjs
// Run after changing any IndexNow file or its admin.indexnow.* messages.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const FILES = [
  'src/modules/indexnow/service.ts',
  'src/routes/{$key}[.]txt.ts',
  'src/routes/api/admin/indexnow.ts',
  'src/routes/admin/indexnow.tsx',
];

for (const rel of FILES) {
  const dest = join(HERE, 'files', rel);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(join(ROOT, rel), dest);
  console.log(`synced ${rel}`);
}
for (const l of ['en', 'zh']) {
  const all = JSON.parse(
    readFileSync(join(ROOT, `messages/${l}.json`), 'utf8')
  );
  const ours = Object.fromEntries(
    Object.entries(all).filter(
      ([k]) => k.startsWith('admin.indexnow.') || k === 'admin.nav.indexnow'
    )
  );
  writeFileSync(
    join(HERE, `messages.${l}.json`),
    `${JSON.stringify(ours, null, 2)}\n`
  );
  console.log(`synced messages.${l}.json (${Object.keys(ours).length} keys)`);
}
