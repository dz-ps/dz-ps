/** Formatação em PT-BR (horários com dígitos tabulares na UI). */
export function hora(seg: number): string {
  const s = ((seg % 86400) + 86400) % 86400;
  const t = `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
  return seg >= 86400 ? `${t} (+1)` : t;
}

export function duracao(seg: number): string {
  const min = Math.max(1, Math.round(seg / 60));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function megabytes(bytes: number): string {
  return bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1).replace('.', ',')} MB` : `${Math.round(bytes / 1024)} KB`;
}

/** 'AAAAMMDD' + segundos -> valor de <input type="datetime-local">. */
export function paraInput(data: string, horaS: number): string {
  return `${data.slice(0, 4)}-${data.slice(4, 6)}-${data.slice(6, 8)}T${hora(horaS % 86400)}`;
}

export function deInput(v: string): { data: string; horaS: number } {
  const [d, t] = v.split('T');
  const [hh, mm] = (t ?? '00:00').split(':').map(Number);
  return { data: (d ?? '').replaceAll('-', ''), horaS: (hh ?? 0) * 3600 + (mm ?? 0) * 60 };
}
