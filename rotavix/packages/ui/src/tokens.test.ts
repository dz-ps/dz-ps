import { describe, expect, it } from 'vitest';
import { contraste } from './contraste';
import { CORES_SERVICO, criarTemas, cssVariaveis, type Paleta } from './tokens';

// Mesma paleta de apps/app/src/brand.ts (duplicada aqui para o pacote testar sozinho).
const paleta: Paleta = { primaria: { claro: '#0B5A7A', escuro: '#5BB8DD' }, destaque: { claro: '#E8604F', escuro: '#FF8E7E' } };

describe('contraste WCAG 2.2 AA', () => {
  const temas = criarTemas(paleta);
  for (const [nome, t] of Object.entries(temas)) {
    it(`tema ${nome}: texto e texto suave ≥ 4,5 sobre fundo e superfícies`, () => {
      for (const f of [t.fundo, t.superficie, t.superficie2]) {
        expect(contraste(t.texto, f)).toBeGreaterThanOrEqual(4.5);
        expect(contraste(t.textoSuave, f)).toBeGreaterThanOrEqual(4.5);
      }
    });
    it(`tema ${nome}: botões primário e de destaque legíveis`, () => {
      expect(contraste(t.sobrePrimaria, t.primaria)).toBeGreaterThanOrEqual(4.5);
      expect(contraste(t.sobreDestaque, t.destaque)).toBeGreaterThanOrEqual(4.5);
    });
    it(`tema ${nome}: cores semânticas usadas como texto ≥ 4,5 sobre a superfície`, () => {
      for (const c of [t.noHorario, t.atrasado, t.incidente, t.lotacao, t.estimativa, t.primaria]) {
        expect(contraste(c, t.superficie)).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
  it('selos de linha: texto branco ≥ 4,5', () => {
    for (const c of Object.values(CORES_SERVICO)) expect(contraste('#FFFFFF', c)).toBeGreaterThanOrEqual(4.5);
  });
  it('gera CSS com tema escuro automático e manual', () => {
    const css = cssVariaveis(paleta);
    expect(css).toContain('prefers-color-scheme: dark');
    expect(css).toContain(':root[data-theme=dark]');
    expect(css).toContain('--rv-linha-aquaviario');
  });
});
