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
  const rede = useEstado((s) => s.rede);
  return (
    <div className="space-y-1 text-xs text-suave">
      <p>{brand.aviso}</p>
      {rede && !rede.sintetica && (
        <p>
          Horários de partida: portal público da Ceturb-ES ({rede.versaoFeed.replace('ceturb-', '').replace('+osm', '')}). Pontos, trajetos
          e mapa: © colaboradores do OpenStreetMap. A passagem em cada ponto é estimada (≈). {rede.nLinhas} linhas com trajeto conhecido.
        </p>
      )}
    </div>
  );
}
