import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isSlug, slugify } from './ids.ts';

const cases = JSON.parse(
  readFileSync(new URL('../../../contracts/cases/slugify.json', import.meta.url), 'utf8'),
) as { cases: [string, string][] };

describe('slugify (contract: contracts/cases/slugify.json)', () => {
  it.each(cases.cases)('%s -> %s', (input, expected) => {
    expect(slugify(input)).toBe(expected);
    expect(isSlug(expected)).toBe(true);
  });
});
