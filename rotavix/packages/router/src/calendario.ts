import type { Rede } from '@rotavix/data-format';

/** 'AAAAMMDD' -> 0 (segunda) .. 6 (domingo). */
export function diaDaSemana(data: string): number {
  const d = new Date(Date.UTC(+data.slice(0, 4), +data.slice(4, 6) - 1, +data.slice(6, 8)));
  return (d.getUTCDay() + 6) % 7;
}

/** Serviços (calendar + calendar_dates) que rodam na data. */
export function servicosAtivos(rede: Rede, data: string): Uint8Array {
  const dia = diaDaSemana(data);
  const ativos = new Uint8Array(rede.cab.servicos.length);
  rede.cab.servicos.forEach((s, i) => {
    let ok = s.dias[dia] === true && s.inicio <= data && data <= s.fim;
    if (s.rem.includes(data)) ok = false;
    if (s.add.includes(data)) ok = true;
    ativos[i] = ok ? 1 : 0;
  });
  return ativos;
}

/** Data local 'AAAAMMDD' e segundos desde a meia-noite no fuso da rede. */
export function agoraNoFuso(fuso: string, agora: Date = new Date()): { data: string; segundos: number } {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(agora);
  const v = (t: string) => partes.find((p) => p.type === t)?.value ?? '00';
  return { data: `${v('year')}${v('month')}${v('day')}`, segundos: +v('hour') * 3600 + +v('minute') * 60 + +v('second') };
}
