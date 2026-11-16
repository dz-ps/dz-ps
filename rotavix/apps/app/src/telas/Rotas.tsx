import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { AvisoSintetico } from '../componentes/Avisos';
import { CartaoRota } from '../componentes/CartaoRota';
import { IconeTrocar, IconeVoltar } from '../componentes/icones';
import { useEstado } from '../estado';
import { hora } from '../formatar';
import { obterMotor } from '../motor/cliente';

export function Rotas() {
  const navegar = useNavigate();
  const { origem, destino, quando, opcoes, selecionada, planejando, definir, fase, online } = useEstado();
  const [quandoUsado, setQuandoUsado] = useState<{ data: string; horaS: number } | null>(null);

  useEffect(() => {
    if (!origem || !destino) {
      navegar({ to: '/' });
      return;
    }
    if (fase !== 'pronto') return;
    let vivo = true;
    (async () => {
      definir({ planejando: true });
      const m = obterMotor();
      const q = quando.tipo === 'agora' ? await m.agora() : quando;
      const t0 = performance.now();
      const ops = await m.planejar({ origem: origem.lugar, destino: destino.lugar, data: q.data, horaS: q.horaS, maxCaminhadaM: 1200 });
      if (!vivo) return;
      performance.measure?.('rotavix:planejar', { start: t0, end: performance.now() });
      setQuandoUsado(q);
      definir({ opcoes: ops, selecionada: 0, planejando: false });
    })();
    return () => {
      vivo = false;
    };
  }, [origem, destino, quando, fase, definir, navegar]);

  return (
    <div className="flex flex-col gap-3 px-4 pb-6">
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => {
            definir({ opcoes: [] });
            navegar({ to: '/' });
          }}
          className="grid size-12 place-items-center rounded-full hover:bg-superficie2"
          aria-label="Voltar"
        >
          <IconeVoltar />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-suave">{origem?.rotulo}</p>
          <p className="truncate font-semibold">{destino?.rotulo}</p>
        </div>
        <button
          type="button"
          aria-label="Inverter origem e destino"
          onClick={() => definir({ origem: destino, destino: origem })}
          className="grid size-12 place-items-center rounded-full hover:bg-superficie2"
        >
          <IconeTrocar />
        </button>
      </div>
      <AvisoSintetico />
      {quandoUsado && (
        <p className="num text-sm text-suave">
          Saindo {quando.tipo === 'agora' ? 'agora' : 'às'} {hora(quandoUsado.horaS)} · {online ? 'pela tabela' : 'offline, pela tabela'}
        </p>
      )}
      {planejando && (
        <p role="status" className="text-sm text-suave">
          Calculando rotas…
        </p>
      )}
      {!planejando && opcoes.length === 0 && quandoUsado && (
        <p role="status" className="rounded-xl bg-superficie2 p-3 text-sm">
          Nenhuma opção na próxima hora. Tente outro horário ou um ponto mais perto (até 1,2 km a pé). Algumas linhas ainda não têm trajeto
          conhecido no app.
        </p>
      )}
      <ul className="flex flex-col gap-2" aria-label="Opções de rota">
        {opcoes.map((o, i) => (
          <li key={o.id}>
            <CartaoRota o={o} selecionada={i === selecionada} aoSelecionar={() => definir({ selecionada: i })} />
          </li>
        ))}
      </ul>
    </div>
  );
}
