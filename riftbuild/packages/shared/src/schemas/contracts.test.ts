import { readdirSync, readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { CatalogBundle, Manifest, MetaBundle } from './index.ts';

// Contract tests (DECISIONS.md D4): zod and the pydantic-exported JSON Schema accept/reject the same fixtures,
// and both schemas describe the same object shapes.
const root = new URL('../../../../contracts/', import.meta.url);
const readJson = (rel: string) => JSON.parse(readFileSync(new URL(rel, root), 'utf8'));

const pydantic = {
  catalog: readJson('schema/catalog-bundle.schema.json'),
  meta: readJson('schema/meta-bundle.schema.json'),
  manifest: readJson('schema/manifest.schema.json'),
};
const zodFor = { catalog: CatalogBundle, meta: MetaBundle, manifest: Manifest } as const;
type Kind = keyof typeof zodFor;

const kindOf = (name: string): Kind =>
  name.startsWith('catalog') ? 'catalog' : name.startsWith('meta') ? 'meta' : 'manifest';

const ajv = new Ajv2020({ strict: false, allErrors: true });
const validators = {
  catalog: ajv.compile(pydantic.catalog),
  meta: ajv.compile(pydantic.meta),
  manifest: ajv.compile(pydantic.manifest),
};

describe.each(['valid', 'invalid'] as const)('%s fixtures', (folder) => {
  const files = readdirSync(new URL(`fixtures/${folder}/`, root)).filter((f) =>
    f.endsWith('.json'),
  );
  it.each(files)('%s', (file) => {
    const doc = readJson(`fixtures/${folder}/${file}`);
    const kind = kindOf(file);
    const zodOk = zodFor[kind].safeParse(doc).success;
    const ajvOk = validators[kind](doc) as boolean;
    expect({ zod: zodOk, jsonSchema: ajvOk }).toEqual({
      zod: folder === 'valid',
      jsonSchema: folder === 'valid',
    });
  });
});

// --- structural drift ---------------------------------------------------------------------------------
type Node = Record<string, unknown>;

function shapes(schema: Node): Map<string, string[]> {
  const defs = (schema.$defs ?? {}) as Record<string, Node>;
  const out = new Map<string, string[]>();
  const deref = (node: Node): Node => {
    let current = node;
    for (let i = 0; i < 10 && typeof current.$ref === 'string'; i++) {
      current = defs[(current.$ref as string).split('/').pop() as string] ?? {};
    }
    return current;
  };
  const visit = (raw: Node, path: string, depth: number) => {
    if (depth > 12) return;
    const node = deref(raw);
    for (const key of ['anyOf', 'oneOf', 'allOf'] as const) {
      for (const option of (node[key] as Node[] | undefined) ?? []) visit(option, path, depth + 1);
    }
    if (node.properties) {
      const props = node.properties as Record<string, Node>;
      out.set(path, Object.keys(props).sort());
      for (const [name, child] of Object.entries(props)) visit(child, `${path}.${name}`, depth + 1);
    }
    if (node.items) visit(node.items as Node, `${path}[]`, depth + 1);
  };
  visit(schema, '$', 0);
  return out;
}

describe('zod mirrors the pydantic models', () => {
  it.each(Object.keys(zodFor) as Kind[])('%s has identical object shapes', (kind) => {
    const fromZod = shapes(
      z.toJSONSchema(zodFor[kind], { io: 'output', unrepresentable: 'any' }) as Node,
    );
    const fromPydantic = shapes(pydantic[kind] as Node);
    expect(Object.fromEntries(fromZod)).toEqual(Object.fromEntries(fromPydantic));
  });
});
