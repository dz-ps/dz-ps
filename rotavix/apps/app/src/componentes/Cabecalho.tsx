import { brand } from '../brand';
import { aplicarTema, type Tema, useEstado } from '../estado';
import { megabytes } from '../formatar';
import { IconeAuto, IconeLua, IconeOffline, IconeSol } from './icones';

const PROXIMO: Record<Tema, Tema> = { auto: 'claro', claro: 'escuro', escuro: 'auto' };
const ROTULO: Record<Tema, string> = { auto: 'Tema automático', claro: 'Tema claro', escuro: 'Tema escuro' };

export function Cabecalho() {
  const { tema, online, definir, progresso } = useEstado();
  const Icone = tema === 'auto' ? IconeAuto : tema === 'claro' ? IconeSol : IconeLua;
  return (
    <header className="flex items-center justify-between gap-2 pt-1">
      <div className="flex items-center gap-2">
        <img src={brand.icone} alt="" width={28} height={28} className="rounded-lg" />
        <h1 className="text-lg font-bold tracking-tight">{brand.nome}</h1>
      </div>
      <div className="flex items-center gap-1">
        {progresso && (
          <span className="num text-xs text-suave" role="status">
            Baixando {progresso.pacote.toLowerCase()}: {megabytes(progresso.recebidos)} de {megabytes(progresso.total)}
          </span>
        )}
        {!online && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-superficie2 px-2 py-1 text-xs font-medium"
            role="status"
            data-testid="selo-offline"
          >
            <IconeOffline width={14} height={14} /> Offline
          </span>
        )}
        <button
          type="button"
          className="grid size-12 place-items-center rounded-full hover:bg-superficie2"
          aria-label={`${ROTULO[tema]}. Trocar tema`}
          onClick={() => {
            const t = PROXIMO[tema];
            aplicarTema(t);
            definir({ tema: t });
          }}
        >
          <Icone />
        </button>
      </div>
    </header>
  );
}
