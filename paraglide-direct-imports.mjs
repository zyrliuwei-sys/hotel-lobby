import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Rewrites literal `m['some.key']` accesses into direct imports of that
 * message's compiled module (src/paraglide/messages/<file>.js).
 *
 * Why: `m` is Paraglide's `export * as m` namespace. The bundler can't
 * tree-shake members of a re-exported namespace, so any page touching `m`
 * pulled in all ~1,070 messages (admin ones included). With direct imports
 * each chunk only carries the messages it actually uses.
 *
 * Only string-literal keys are rewritten; anything else keeps using `m`.
 */
export function paraglideDirectImports({ messagesDir }) {
  let keyToFile = null;
  const loadMap = () => {
    keyToFile = new Map();
    for (const file of readdirSync(messagesDir)) {
      if (!file.endsWith('.js') || file === '_index.js') continue;
      const src = readFileSync(path.join(messagesDir, file), 'utf8');
      for (const match of src.matchAll(/export \{ \w+ as "([^"]+)" \}/g)) {
        keyToFile.set(match[1], path.join(messagesDir, file));
      }
    }
  };
  const ACCESS = /\bm\[(['"])([^'"\]\n]+)\1\]/g;

  return {
    name: 'paraglide-direct-imports',
    buildStart() {
      keyToFile = null;
    },
    transform(code, id) {
      if (id.includes('node_modules') || id.includes('/src/paraglide/')) {
        return null;
      }
      if (!/paraglide\/messages(\.js)?['"]/.test(code)) return null;
      if (!ACCESS.test(code)) return null;
      ACCESS.lastIndex = 0;
      if (!keyToFile) loadMap();

      const locals = new Map();
      const out = code.replace(ACCESS, (whole, _q, key) => {
        const file = keyToFile.get(key);
        if (!file) return whole; // unknown key: leave it to `m`
        if (!locals.has(key)) locals.set(key, `__pgm${locals.size}`);
        return locals.get(key);
      });
      if (!locals.size) return null;
      const imports = [...locals]
        .map(
          ([key, local]) =>
            `import { ${JSON.stringify(key)} as ${local} } from ${JSON.stringify(keyToFile.get(key))};`
        )
        .join('\n');
      return { code: `${imports}\n${out}`, map: null };
    },
  };
}
