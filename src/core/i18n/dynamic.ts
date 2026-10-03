// Dynamic message lookup for keys built at runtime (tab labels, keyed
// lists). Prefer static `m["ns.key"]()` whenever the key is known —
// dynamic access needs every message bundled.
//
// The lookup is built from the compiled message files directly (each exports
// its function under the dotted key), not from `m` / messages/_index.js:
// materializing that shared namespace would pull every message — admin ones
// included — into the chunks the public pages download.
const modules = import.meta.glob<Record<string, unknown>>(
  ['/src/paraglide/messages/*.js', '!/src/paraglide/messages/_index.js'],
  { eager: true }
);
const messages: Record<string, unknown> = Object.assign(
  {},
  ...Object.values(modules)
);

export function tDynamic(key: string): string {
  const fn = messages[key];
  return typeof fn === 'function' ? (fn as () => string)() : key;
}
