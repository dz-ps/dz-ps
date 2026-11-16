import { brand } from '../brand';
import { useEstado } from '../estado';

export function AvisoSintetico() {
  const rede = useEstado((s) => s.rede);
  if (!rede?.sintetica) return null;
  return (
    <p role="note" className="rounded-xl border border-destaque/60 bg-destaque/10 px-3 py-2 text-sm">
      <strong>Rede sintética de teste.</strong> Linhas e horários fictícios, só para desenvolvimento. Não use para viajar.
    </p>
  );
}

export function AvisoIndependente() {
  return <p className="text-xs text-suave">{brand.aviso}</p>;
}
