import type { DisplayInfo, VirtualCapability } from '../net/protocol';

export interface ToolbarActions {
  create(width: number, height: number): void;
  destroy(id: number): void;
}

/** Barra pra criar e remover displays virtuais (modo plano). */
export class Toolbar {
  private readonly el: HTMLElement;
  private readonly sizes = ['1280x800', '960x600', '1440x900', '1920x1080'];
  private size = '1280x800';

  constructor(parent: HTMLElement, private readonly actions: ToolbarActions) {
    this.el = document.createElement('div');
    this.el.id = 'toolbar';
    // os toques aqui não podem cair no canvas (que liga/desliga o HUD)
    for (const ev of ['click', 'pointerdown', 'pointerup']) this.el.addEventListener(ev, (e) => e.stopPropagation());
    parent.appendChild(this.el);
  }

  update(displays: DisplayInfo[], cap: VirtualCapability | null, message = ''): void {
    this.el.replaceChildren();
    const virt = displays.filter((d) => d.virtual);
    if (!cap?.available) {
      this.el.append(span(`displays virtuais indisponíveis${cap?.reason ? ': ' + cap.reason : ''}`, 'mut'));
      return;
    }
    const sel = document.createElement('select');
    for (const s of this.sizes) sel.append(new Option(s, s, s === this.size, s === this.size));
    sel.onchange = () => { this.size = sel.value; };
    const add = button(`+ display (${virt.length}/${cap.max})`, () => {
      const [w, h] = this.size.split('x').map(Number) as [number, number];
      this.actions.create(w, h);
    });
    add.disabled = virt.length >= cap.max;
    this.el.append(sel, add);
    for (const d of virt) this.el.append(button(`× ${d.id}`, () => this.actions.destroy(d.id), 'sec'));
    if (message) this.el.append(span(message, 'err'));
  }

  toggle(visible: boolean): void { this.el.style.display = visible ? '' : 'none'; }
}

function button(label: string, onClick: () => void, cls = ''): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  if (cls) b.className = cls;
  b.onclick = onClick;
  return b;
}

function span(text: string, cls: string): HTMLSpanElement {
  const s = document.createElement('span');
  s.textContent = text;
  s.className = cls;
  return s;
}
