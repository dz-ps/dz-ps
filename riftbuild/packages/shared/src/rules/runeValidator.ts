import type { CatalogIndex } from '../catalog/index.ts';
import { issue, split, type Issue, type RunePage, type ValidationResult } from './types.ts';

/** Rune page rule comes from the bundle (derived per patch and confirmed, DECISIONS.md D12). */
export function runeIssues(page: RunePage, index: CatalogIndex): Issue[] {
  const rule = index.rules.rune_page;
  const issues: Issue[] = [];

  const keystone = page.keystone ? index.runes.get(page.keystone) : undefined;
  if (!page.keystone) {
    issues.push(issue('RUNE_KEYSTONE_MISSING', 'error', 'Escolha uma runa-chave.'));
  } else if (!keystone || keystone.kind !== 'keystone') {
    issues.push(issue('RUNE_KEYSTONE_INVALID', 'error', 'Runa-chave inválida.', [page.keystone]));
  } else if (rule.keystone_tied_to_primary_path && keystone.path !== page.primaryPath) {
    issues.push(
      issue('RUNE_KEYSTONE_INVALID', 'error', 'A runa-chave precisa ser da árvore primária.', [
        page.keystone,
      ]),
    );
  }

  if (!page.primaryPath) {
    issues.push(issue('RUNE_PATH_MISSING', 'error', 'Escolha a árvore primária.'));
  }

  rule.primary_slots.forEach((slot, i) => {
    const id = page.primary[i] ?? null;
    const rune = id ? index.runes.get(id) : undefined;
    if (
      !id ||
      !rune ||
      rune.kind !== 'minor' ||
      rune.path !== page.primaryPath ||
      rune.slot !== slot
    ) {
      issues.push(
        issue(
          'RUNE_PRIMARY_INVALID',
          'error',
          `Escolha uma runa do slot ${slot} da árvore primária.`,
          id ? [id] : [],
        ),
      );
    }
  });

  const secondary = page.secondary ? index.runes.get(page.secondary) : undefined;
  if (rule.secondary_count > 0) {
    if (!page.secondary || !secondary || secondary.kind !== 'minor') {
      issues.push(
        issue(
          'RUNE_SECONDARY_INVALID',
          'error',
          'Escolha uma runa secundária.',
          page.secondary ? [page.secondary] : [],
        ),
      );
    } else if (rule.secondary_must_differ_from_primary && secondary.path === page.primaryPath) {
      issues.push(
        issue(
          'RUNE_SECONDARY_SAME_PATH',
          'error',
          'A runa secundária precisa ser de outra árvore.',
          [page.secondary],
        ),
      );
    }
  }
  return issues;
}

export function validateRunePage(page: RunePage, index: CatalogIndex): ValidationResult {
  return split(runeIssues(page, index));
}

export function isRunePageValid(page: RunePage, index: CatalogIndex): boolean {
  return runeIssues(page, index).length === 0;
}
