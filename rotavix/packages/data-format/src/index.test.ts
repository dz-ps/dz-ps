import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FormatoInvalido, lerRede } from './index';

const arquivo = fileURLToPath(new URL('../fixtures/sintetico.rvx', import.meta.url));
const buf = (() => {
  const b = readFileSync(arquivo);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
})();

describe('lerRede (contrato com o pipeline Python)', () => {
  const rede = lerRede(buf);

  it('lê o cabeçalho e marca a rede como sintética', () => {
    expect(rede.cab.rede.sintetica).toBe(true);
    expect(rede.nPontos).toBe(20);
    expect(rede.cab.pontos.nomes).toContain('Terminal Vila Velha');
  });

  it('seções têm tamanhos coerentes', () => {
    const P = rede.nPadroes;
    expect(rede.padraoViagensIni.length).toBe(P + 1);
    for (let p = 0; p < P; p++) {
      const n = rede.padraoPontosIni[p + 1]! - rede.padraoPontosIni[p]!;
      const v = rede.padraoViagensIni[p + 1]! - rede.padraoViagensIni[p]!;
      expect(rede.padraoTemposIni[p + 1]! - rede.padraoTemposIni[p]!).toBe(n * v);
    }
    expect(rede.viagemServico.length).toBe(rede.padraoViagensIni[P]);
  });

  it('coordenadas na Grande Vitória', () => {
    for (let i = 0; i < rede.nPontos; i++) {
      expect(rede.pontoLat[i]).toBeGreaterThan(-21);
      expect(rede.pontoLat[i]).toBeLessThan(-19.8);
    }
  });

  it('rejeita arquivo que não é .rvx', () => {
    expect(() => lerRede(new ArrayBuffer(16))).toThrow(FormatoInvalido);
  });
});
