/** Ícones mínimos em SVG (sem biblioteca, para caber no orçamento do shell). */
import type { SVGProps } from 'react';

const base = (d: string, props: SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    width="20"
    height="20"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...props}
  >
    <path d={d} />
  </svg>
);

export const IconePe = (p: SVGProps<SVGSVGElement>) => base('M13 4a1.5 1.5 0 1 0 0-.01M10 21l2-6 3 3v3M9 12l2-4 3 1 2 3h3M11 8l-2 5', p);
export const IconeOnibus = (p: SVGProps<SVGSVGElement>) =>
  base('M6 17h12V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2zM6 11h12M8 20v-3M16 20v-3M8.5 14h.01M15.5 14h.01', p);
export const IconeBarca = (p: SVGProps<SVGSVGElement>) => base('M3 17c2 2 4 2 6 0s4-2 6 0 4 2 6 0M5 14l1-5h12l1 5M9 9V6h6v3', p);
export const IconeTrocar = (p: SVGProps<SVGSVGElement>) => base('M7 4v16M7 4 4 7M7 4l3 3M17 20V4M17 20l-3-3M17 20l3-3', p);
export const IconeVoltar = (p: SVGProps<SVGSVGElement>) => base('M15 18l-6-6 6-6', p);
export const IconeLua = (p: SVGProps<SVGSVGElement>) => base('M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z', p);
export const IconeSol = (p: SVGProps<SVGSVGElement>) =>
  base(
    'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
    p,
  );
export const IconeAuto = (p: SVGProps<SVGSVGElement>) => base('M12 3a9 9 0 1 0 0 18zM12 3a9 9 0 0 1 0 18', p);
export const IconeOffline = (p: SVGProps<SVGSVGElement>) =>
  base('M2 2l20 20M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5.2-2.8M19 13a10 10 0 0 0-2.3-1.8M12 20h.01', p);
export const IconeAlvo = (p: SVGProps<SVGSVGElement>) =>
  base('M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', p);
export const IconePino = (p: SVGProps<SVGSVGElement>) =>
  base('M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z', p);
export const IconeBusca = (p: SVGProps<SVGSVGElement>) => base('M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3', p);
