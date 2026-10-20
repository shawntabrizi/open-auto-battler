/** Test helper: `name=value` fixture files in `./fixtures/`. */
import { readFileSync } from 'node:fs';

export function loadFixtures(file: string): (name: string) => string {
  const entries = Object.fromEntries(
    readFileSync(new URL(`./fixtures/${file}`, import.meta.url), 'utf8')
      .trim()
      .split('\n')
      .map((line) => {
        const i = line.indexOf('=');
        return [line.slice(0, i), line.slice(i + 1)] as [string, string];
      })
  );
  return (name) => {
    const v = entries[name];
    if (v === undefined) throw new Error(`missing fixture ${name}`);
    return v;
  };
}
