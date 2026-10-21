import { displayName, type CatalogIndex } from '../catalog/index.ts';
import type { Role } from '../schemas/common.ts';
import { issue, split, type Issue, type ValidationResult } from './types.ts';

export function spellIssues(
  spells: (string | null)[],
  role: Role | null,
  index: CatalogIndex,
): Issue[] {
  const issues: Issue[] = [];
  const chosen = spells.filter((s): s is string => !!s);
  if (chosen.length < 2) issues.push(issue('SPELL_MISSING', 'error', 'Escolha dois feitiços.'));
  if (chosen.length === 2 && chosen[0] === chosen[1]) {
    issues.push(
      issue('SPELL_DUPLICATE', 'error', 'Os dois feitiços precisam ser diferentes.', chosen),
    );
  }
  for (const id of chosen) {
    const spell = index.spells.get(id);
    if (!spell)
      issues.push(issue('NOT_IN_CATALOG', 'error', `Feitiço fora do catálogo: ${id}.`, [id]));
    else if (!spell.selectable) {
      issues.push(
        issue(
          'SPELL_NOT_SELECTABLE',
          'error',
          `${displayName(spell)} não pode ser escolhido diretamente.`,
          [id],
        ),
      );
    } else if (spell.jungle_only && role && role !== 'jungle') {
      issues.push(
        issue('SPELL_JUNGLE_ONLY', 'error', `${displayName(spell)} é exclusivo da selva.`, [id]),
      );
    }
  }
  const required = index.rules.jungle_requires_spell;
  if (role === 'jungle' && required && !chosen.includes(required)) {
    const name = index.spells.get(required) ? displayName(index.spells.get(required)!) : required;
    issues.push(
      issue('SPELL_JUNGLE_REQUIRED', 'error', `Na selva, ${name} é obrigatório.`, [required]),
    );
  }
  return issues;
}

export function validateSpells(
  spells: (string | null)[],
  role: Role | null,
  index: CatalogIndex,
): ValidationResult {
  return split(spellIssues(spells, role, index));
}
