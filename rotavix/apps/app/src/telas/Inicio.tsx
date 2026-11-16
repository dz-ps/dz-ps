import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { AvisoIndependente, AvisoSintetico } from '../componentes/Avisos';
import { Busca } from '../componentes/Busca';
import { IconeAlvo, IconeBusca, IconePino, IconeTrocar } from '../componentes/icones';
import { Cabecalho } from '../componentes/Cabecalho';
import { useEstado } from '../estado';
import { deInput, paraInput } from '../formatar';
import { obterMotor } from '../motor/cliente';

export function Inicio() {
  const navegar = useNavigate();
  const { origem, destino, quando, definir, fase } = useEstado();
  const [buscando, setBuscando] = useState<'origem' | 'destino' | null>(null);

  if (buscando) {
    return (
      <Busca
        titulo={buscando === 'origem' ? 'De onde?' : 'Para onde?'}
        permitirLocalizacao={buscando === 'origem'}
        aoFechar={() => setBuscando(null)}
        aoEscolher={(l) => {
          definir(buscando === 'origem' ? { origem: l } : { destino: l });
          setBuscando(null);
          const s = useEstado.getState();
          if (s.origem && s.destino) navegar({ to: '/rotas' });
        }}
      />
    );
  }

  const escolherHorario = async () => {
    const agora = await obterMotor().agora();
    definir({ quando: { tipo: 'em', ...agora } });
  };

  return (
    <div className="flex flex-col gap-3 px-4 pb-6">
      <Cabecalho />
      <AvisoSintetico />
      <div className="flex items-stretch gap-2">
        <div className="flex flex-1 flex-col gap-2">
          <CampoLugar rotulo="De" valor={origem?.rotulo} vazio="Escolha a origem" icone={<IconeAlvo className="text-primaria" />} aoClicar={() => setBuscando('origem')} testid="campo-origem" />
          <CampoLugar rotulo="Para" valor={destino?.rotulo} vazio="Para onde?" icone={<IconePino className="text-destaque" />} aoClicar={() => setBuscando('destino')} destaque testid="campo-destino" />
        </div>
        <button
          type="button"
          aria-label="Inverter origem e destino"
          onClick={() => definir({ origem: destino, destino: origem })}
          className="grid w-12 place-items-center rounded-xl hover:bg-superficie2"
        >
          <IconeTrocar />
        </button>
      </div>

      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="sr-only">Quando</legend>
        <button
          type="button"
          aria-pressed={quando.tipo === 'agora'}
          onClick={() => definir({ quando: { tipo: 'agora' } })}
          className={`min-h-12 rounded-full px-4 text-sm font-medium ${quando.tipo === 'agora' ? 'bg-primaria text-sobre-primaria' : 'bg-superficie2'}`}
        >
          Sair agora
        </button>
        {quando.tipo === 'agora' ? (
          <button type="button" onClick={escolherHorario} className="min-h-12 rounded-full bg-superficie2 px-4 text-sm font-medium">
            Escolher horário
          </button>
        ) : (
          <label className="flex min-h-12 items-center gap-2 rounded-full bg-primaria px-4 text-sm font-medium text-sobre-primaria">
            Sair às
            <input
              type="datetime-local"
              value={paraInput(quando.data, quando.horaS)}
              onChange={(e) => e.target.value && definir({ quando: { tipo: 'em', ...deInput(e.target.value) } })}
              className="num bg-transparent outline-none"
              data-testid="campo-horario"
            />
          </label>
        )}
      </fieldset>

      <button
        type="button"
        disabled={!origem || !destino || fase !== 'pronto'}
        onClick={() => navegar({ to: '/rotas' })}
        className="min-h-12 rounded-xl bg-primaria font-semibold text-sobre-primaria disabled:opacity-50"
        data-testid="ver-rotas"
      >
        <span className="inline-flex items-center gap-2"><IconeBusca /> Ver rotas</span>
      </button>

      <section aria-label="Atalhos" className="flex gap-2">
        {['Casa', 'Trabalho', 'Faculdade'].map((a) => (
          <span key={a} className="flex-1 rounded-xl border border-dashed border-borda px-3 py-2 text-center text-sm text-suave" title="Favoritos chegam na Fase 1">
            {a}
          </span>
        ))}
      </section>
      <AvisoIndependente />
    </div>
  );
}

function CampoLugar({ rotulo, valor, vazio, icone, aoClicar, destaque, testid }: {
  rotulo: string; valor?: string | undefined; vazio: string; icone: React.ReactNode; aoClicar: () => void; destaque?: boolean; testid: string;
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      data-testid={testid}
      className={`flex min-h-12 items-center gap-3 rounded-xl px-3 text-left ${destaque && !valor ? 'bg-superficie2 text-lg font-medium' : 'bg-superficie2'}`}
    >
      {icone}
      <span className="sr-only">{rotulo}: </span>
      <span className={valor ? '' : 'text-suave'}>{valor ?? vazio}</span>
    </button>
  );
}
