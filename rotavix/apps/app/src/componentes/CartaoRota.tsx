import { explicar } from '@rotavix/router';
import { Fragment, useState } from 'react';
import { duracao, hora } from '../formatar';
import type { OpcaoMapa } from '../motor/worker';
import { IconePe } from './icones';
import { SeloLinha } from './SeloLinha';

export function CartaoRota({ o, selecionada, aoSelecionar }: { o: OpcaoMapa; selecionada: boolean; aoSelecionar: () => void }) {
  const [porque, setPorque] = useState(false);
  return (
    <article
      className={`rounded-[var(--radius-cartao)] border bg-superficie p-3 transition-colors ${selecionada ? 'border-primaria ring-1 ring-primaria' : 'border-borda'}`}
      data-testid="opcao-rota"
    >
      <button type="button" className="w-full text-left" onClick={aoSelecionar} aria-pressed={selecionada}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="num text-lg font-semibold">{hora(o.partida)} → {hora(o.chegada)}</span>
          <span className="num text-sm text-suave">{duracao(o.duracaoS)}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label="Trechos">
          {o.trechos.map((t, i) => (
            <Fragment key={i}>
              {i > 0 && <span className="text-suave" aria-hidden="true">›</span>}
              {t.tipo === 'veiculo' ? (
                <SeloLinha curta={t.linha.curta} servico={t.linha.servico} barca={t.modo === 'barca'} />
              ) : (
                <span className="num inline-flex items-center gap-0.5 text-sm text-suave">
                  <IconePe width={16} height={16} />
                  <span className="sr-only">A pé</span>
                  {Math.max(1, Math.round((t.fim - t.inicio) / 60))}
                </span>
              )}
            </Fragment>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
          {o.rotulos.map((r) => (
            <span key={r} className={`rounded-full px-2 py-0.5 font-medium ${r === 'Mais rápida' ? 'bg-primaria text-sobre-primaria' : 'bg-superficie2'}`}>{r}</span>
          ))}
          {o.id !== 'a_pe' && <span className="rounded-full border border-dashed border-estimativa px-2 py-0.5 text-estimativa">Pela tabela</span>}
          {o.baldeacoes > 0 && <span className="rounded-full bg-superficie2 px-2 py-0.5">{o.baldeacoes} baldeação{o.baldeacoes > 1 ? 'ões' : ''}</span>}
        </div>
        {o.proximasPartidas.length > 0 && (
          <p className="num mt-2 text-sm text-suave">Próximas: {o.proximasPartidas.map(hora).join(' · ')}</p>
        )}
      </button>

      {selecionada && <PassoAPasso o={o} />}

      <button type="button" className="mt-2 text-sm font-medium text-primaria underline-offset-2 hover:underline" aria-expanded={porque} onClick={() => setPorque((v) => !v)}>
        Por que esta rota?
      </button>
      {porque && (
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm" data-testid="motivos">
          {o.motivos.map((m, i) => <li key={i}>{explicar(m)}</li>)}
        </ul>
      )}
    </article>
  );
}

function PassoAPasso({ o }: { o: OpcaoMapa }) {
  return (
    <ol className="mt-3 space-y-2 border-l-2 border-borda pl-3 text-sm">
      {o.trechos.map((t, i) =>
        t.tipo === 'a_pe' ? (
          <li key={i} className="text-suave">
            Caminhe até <strong className="text-texto">{t.para}</strong> · {duracao(t.fim - t.inicio)} (estimativa)
          </li>
        ) : (
          <li key={i}>
            <div className="flex items-center gap-2">
              <SeloLinha curta={t.linha.curta} servico={t.linha.servico} barca={t.modo === 'barca'} />
              <span className="text-suave">sentido {t.destino}</span>
            </div>
            <p className="num mt-1">
              <strong>{hora(t.embarque.hora)}</strong> embarque em {t.embarque.nome}
            </p>
            <p className="num text-suave">{t.paradas} parada{t.paradas > 1 ? 's' : ''} · {duracao(t.desembarque.hora - t.embarque.hora)}</p>
            <p className="num">
              <strong>{hora(t.desembarque.hora)}</strong> desça em {t.desembarque.nome}
            </p>
          </li>
        ),
      )}
    </ol>
  );
}
