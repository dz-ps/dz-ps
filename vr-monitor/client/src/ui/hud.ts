/** Overlay DOM de estatísticas (modo plano/simulador). No VR vira um HUD 3D na Fase 3. */
export class Hud {
  private readonly el: HTMLElement;
  visible = true;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('pre');
    this.el.id = 'hud';
    parent.appendChild(this.el);
  }

  set(lines: string[], warn: boolean): void {
    this.el.textContent = lines.join('\n');
    this.el.classList.toggle('warn', warn);
    this.el.style.display = this.visible ? '' : 'none';
  }

  toggle(): void { this.visible = !this.visible; this.el.style.display = this.visible ? '' : 'none'; }
}

export const fmt = (v: number, digits = 1): string => (Number.isFinite(v) ? v.toFixed(digits) : '–');
