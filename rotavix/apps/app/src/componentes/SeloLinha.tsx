import { CORES_SERVICO } from '@rotavix/ui';
import { IconeBarca, IconeOnibus } from './icones';

export function SeloLinha({ curta, servico, barca }: { curta: string; servico: string; barca?: boolean }) {
  const cor = CORES_SERVICO[servico as keyof typeof CORES_SERVICO] ?? CORES_SERVICO.outro;
  const Icone = barca ? IconeBarca : IconeOnibus;
  return (
    <span className="num inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-sm font-semibold text-white" style={{ background: cor }}>
      <Icone width={14} height={14} />
      {curta}
    </span>
  );
}
