/** Busca offline de pontos (resultado instantâneo vindo do worker). */
import { useEffect, useState } from 'react';
import type { LugarEscolhido } from '../estado';
import { obterMotor } from '../motor/cliente';
import type { ResultadoBusca } from '../motor/worker';
import { IconeAlvo, IconeBusca, IconePino, IconeVoltar } from './icones';

const RECENTES = 'rv-recentes';

function recentes(): LugarEscolhido[] {
  try {
    return JSON.parse(localStorage.getItem(RECENTES) ?? '[]') as LugarEscolhido[];
  } catch {
    return [];
  }
}

function lembrar(l: LugarEscolhido) {
  try {
    const lista = [l, ...recentes().filter((r) => r.rotulo !== l.rotulo)].slice(0, 6);
    localStorage.setItem(RECENTES, JSON.stringify(lista));
  } catch {
    /* ok */
  }
}

export function Busca({
  titulo,
  permitirLocalizacao,
  aoEscolher,
  aoFechar,
}: {
  titulo: string;
  permitirLocalizacao: boolean;
  aoEscolher: (l: LugarEscolhido) => void;
  aoFechar: () => void;
}) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<ResultadoBusca[]>([]);
  const [erroGps, setErroGps] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    if (!q.trim()) return;
    obterMotor()
      .buscar(q, 10)
      .then((r) => vivo && setRes(r.filter((x) => x.tipo === 'ponto')));
    return () => {
      vivo = false;
    };
  }, [q]);

  const escolher = (l: LugarEscolhido) => {
    if (l.lugar.tipo === 'ponto') lembrar(l);
    aoEscolher(l);
  };

  const usarGps = () => {
    setErroGps(null);
    navigator.geolocation.getCurrentPosition(
      (p) =>
        escolher({
          rotulo: 'Minha localização',
          lugar: { tipo: 'coord', lat: p.coords.latitude, lon: p.coords.longitude, nome: 'Minha localização' },
          lat: p.coords.latitude,
          lon: p.coords.longitude,
        }),
      () => setErroGps('Não foi possível obter sua localização. Escolha um ponto na busca.'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  const lista = q.trim() ? null : recentes();
  const resultados = q.trim() ? res : [];

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={aoFechar}
          className="grid size-12 place-items-center rounded-full hover:bg-superficie2"
          aria-label="Voltar"
        >
          <IconeVoltar />
        </button>
        <label className="flex flex-1 items-center gap-2 rounded-xl bg-superficie2 px-3">
          <IconeBusca className="text-suave" />
          <span className="sr-only">{titulo}</span>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`${titulo} Bairro, terminal, lugar…`}
            className="h-12 w-full bg-transparent text-base outline-none placeholder:text-suave"
            enterKeyHint="search"
            data-testid="campo-busca"
          />
        </label>
      </div>
      {permitirLocalizacao && 'geolocation' in navigator && (
        <button type="button" onClick={usarGps} className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-left hover:bg-superficie2">
          <IconeAlvo className="text-primaria" /> Minha localização
        </button>
      )}
      {erroGps && <p className="px-3 text-sm text-incidente">{erroGps}</p>}
      {lista && lista.length > 0 && <h3 className="px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-suave">Recentes</h3>}
      <ul className="flex flex-col" data-testid="resultados-busca">
        {(lista ?? []).map((l) => (
          <li key={`r-${l.rotulo}`}>
            <button
              type="button"
              onClick={() => escolher(l)}
              className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-superficie2"
            >
              <IconePino className="shrink-0 text-suave" /> {l.rotulo}
            </button>
          </li>
        ))}
        {resultados.map((r) =>
          r.tipo === 'ponto' ? (
            <li key={`p-${r.ponto}`}>
              <button
                type="button"
                onClick={() =>
                  escolher({
                    rotulo: r.nome,
                    lugar: r.pontos.length > 1 ? { tipo: 'pontos', pontos: r.pontos, nome: r.nome } : { tipo: 'ponto', ponto: r.ponto },
                    lat: r.lat,
                    lon: r.lon,
                  })
                }
                className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-superficie2"
              >
                <IconePino className="shrink-0 text-suave" />
                <span className="flex flex-col">
                  <span>{r.nome}</span>
                  <span className="text-xs text-suave">
                    {r.pontos.length > 1 ? `${r.pontos.length} plataformas · ` : ''}
                    {r.linhas.length > 8 ? `${r.linhas.length} linhas` : `Linhas ${r.linhas.join(', ')}`}
                  </span>
                </span>
              </button>
            </li>
          ) : r.tipo === 'lugar' ? (
            <li key={`l-${r.lugar}`}>
              <button
                type="button"
                onClick={() =>
                  escolher({ rotulo: r.nome, lugar: { tipo: 'coord', lat: r.lat, lon: r.lon, nome: r.nome }, lat: r.lat, lon: r.lon })
                }
                className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-superficie2"
              >
                <IconeAlvo className="shrink-0 text-suave" />
                <span className="flex flex-col">
                  <span>{r.nome}</span>
                  <span className="text-xs text-suave">{r.categoria}</span>
                </span>
              </button>
            </li>
          ) : null,
        )}
        {q.trim() && resultados.length === 0 && (
          <li className="px-3 py-2 text-sm text-suave">
            Nada encontrado. Tente o nome do bairro, de um terminal ou de um lugar conhecido.
          </li>
        )}
      </ul>
    </div>
  );
}
