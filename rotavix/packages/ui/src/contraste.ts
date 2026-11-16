/** Contraste WCAG 2.x entre duas cores hex (#rrggbb). */
function lum(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}

export function contraste(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
}

/** Escolhe a cor de texto (clara ou escura) com mais contraste sobre `fundo`. */
export function textoSobre(fundo: string, claro = '#FFFFFF', escuro = '#0B1418'): string {
  return contraste(fundo, claro) >= contraste(fundo, escuro) ? claro : escuro;
}
