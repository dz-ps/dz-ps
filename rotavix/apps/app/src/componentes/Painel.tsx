/** Bottom sheet arrastável com snap points no celular; painel lateral no desktop (≥ 1024 px). */
import { type ReactNode, useEffect, useRef, useState } from 'react';

const SNAPS = [0.28, 0.55, 0.92]; // fração da altura da tela

function useDesktop(): boolean {
  const [d, setD] = useState(() => matchMedia('(min-width: 1024px)').matches);
  useEffect(() => {
    const mq = matchMedia('(min-width: 1024px)');
    const f = () => setD(mq.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, []);
  return d;
}

export function Painel({ children, snapInicial = 1 }: { children: ReactNode; snapInicial?: number }) {
  const desktop = useDesktop();
  const [snap, setSnap] = useState(snapInicial);
  const [arrasto, setArrasto] = useState<number | null>(null);
  const inicio = useRef<{ y: number; altura: number } | null>(null);

  if (desktop) {
    return (
      <aside className="absolute left-4 top-4 bottom-4 z-10 flex w-[400px] flex-col overflow-hidden rounded-[var(--radius-cartao)] bg-superficie shadow-[var(--shadow-cartao)]">
        <div className="flex-1 overflow-y-auto">{children}</div>
      </aside>
    );
  }

  const altura = arrasto ?? SNAPS[snap]! * innerHeight;
  const soltar = () => {
    if (inicio.current && arrasto !== null) {
      const frac = arrasto / innerHeight;
      let melhor = 0;
      SNAPS.forEach((s, i) => {
        if (Math.abs(s - frac) < Math.abs(SNAPS[melhor]! - frac)) melhor = i;
      });
      setSnap(melhor);
    }
    inicio.current = null;
    setArrasto(null);
  };

  return (
    <section
      className="absolute inset-x-0 bottom-0 z-10 flex flex-col rounded-t-[1.25rem] bg-superficie shadow-[0_-4px_24px_rgb(0_0_0/0.12)]"
      style={{
        height: altura,
        transition: arrasto === null ? 'height 220ms cubic-bezier(.2,.8,.2,1)' : 'none',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
      aria-label="Painel"
    >
      <button
        type="button"
        className="flex h-7 w-full shrink-0 cursor-grab touch-none items-center justify-center"
        aria-label="Ajustar altura do painel"
        onClick={() => setSnap((s) => (s + 1) % SNAPS.length)}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          inicio.current = { y: e.clientY, altura };
        }}
        onPointerMove={(e) => {
          if (!inicio.current) return;
          const dy = inicio.current.y - e.clientY;
          if (Math.abs(dy) < 4 && arrasto === null) return;
          setArrasto(Math.min(innerHeight * 0.95, Math.max(120, inicio.current.altura + dy)));
        }}
        onPointerUp={soltar}
        onPointerCancel={soltar}
      >
        <span className="h-1.5 w-10 rounded-full bg-borda" />
      </button>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
    </section>
  );
}
