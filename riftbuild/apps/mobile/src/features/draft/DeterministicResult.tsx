import { displayName, type CatalogIndex } from '@riftbuild/shared';
import { router } from 'expo-router';
import { View } from 'react-native';
import { DamageBar } from '@/components/catalog/DamageBar';
import { EntityIcon } from '@/components/catalog/EntityIcon';
import { AppText, Card } from '@/components/ui';
import { CC_LABEL, ROLE_LABEL } from '@/i18n/labels';
import type { useDraftAnalysis } from './useDraftAnalysis';

type Result = NonNullable<ReturnType<typeof useDraftAnalysis>['deterministic']>;

const names = (ids: string[], index: CatalogIndex) =>
  ids
    .map((id) => (index.champions.get(id) ? displayName(index.champions.get(id)!) : id))
    .join(', ') || '—';

/** Instant, offline read of the enemy comp (spec §5.4 item 1) plus rule-based recommendations. */
export function DeterministicResult({ result, index }: { result: Result; index: CatalogIndex }) {
  const { comp, candidates, counters, bans } = result;
  return (
    <View className="gap-3">
      <Card className="gap-3" testID="comp-read">
        <AppText variant="heading">Leitura da composição</AppText>
        <DamageBar damage={comp.damage} />
        <AppText>
          <AppText className="font-semibold">Controle pesado: </AppText>
          {comp.hardCcCount} habilidade(s)
        </AppText>
        <AppText variant="caption">
          {comp.ccSources
            .filter((s) =>
              s.types.some((t) =>
                [
                  'stun',
                  'airborne',
                  'suppression',
                  'root',
                  'charm',
                  'fear',
                  'taunt',
                  'sleep',
                  'polymorph',
                ].includes(t),
              ),
            )
            .map(
              (s) =>
                `${displayName(index.champions.get(s.championId)!)} ${s.abilityKey} (${s.types.map((t) => CC_LABEL[t]).join(', ')})`,
            )
            .join(' · ') || 'Nenhum controle pesado detectado.'}
        </AppText>
        <AppText>
          <AppText className="font-semibold">Cura: </AppText>
          {comp.healing}
          {comp.healers.length ? ` (${names(comp.healers, index)})` : ''}
        </AppText>
        {comp.shielders.length ? (
          <AppText variant="caption">Escudos: {names(comp.shielders, index)}</AppText>
        ) : null}
        {comp.engage.length ? (
          <AppText variant="caption">Iniciação: {names(comp.engage, index)}</AppText>
        ) : null}
        {comp.poke.length ? (
          <AppText variant="caption">Poke: {names(comp.poke, index)}</AppText>
        ) : null}
        {comp.tanks.length ? (
          <AppText variant="caption">Tanques: {names(comp.tanks, index)}</AppText>
        ) : null}
        {comp.invulnerable.length ? (
          <AppText variant="caption">Invulnerabilidade: {names(comp.invulnerable, index)}</AppText>
        ) : null}
        {comp.projectileBlock.length ? (
          <AppText variant="caption">
            Bloqueio de projéteis: {names(comp.projectileBlock, index)}
          </AppText>
        ) : null}
        <AppText>
          <AppText className="font-semibold">Ameaças: </AppText>
          {comp.threats
            .map((t) => `${displayName(index.champions.get(t.championId)!)} (${t.reason_pt})`)
            .join('; ') || '—'}
        </AppText>
        {comp.alerts_pt.map((a) => (
          <AppText key={a} testID="comp-alert" className="text-warning">
            ⚠ {a}
          </AppText>
        ))}
        <AppText testID="comp-time" variant="caption">
          Leitura instantânea em {result.ms} ms, a partir das tags estimadas do catálogo.
        </AppText>
      </Card>

      {candidates.groups.length ? (
        <Card className="gap-3" testID="candidates">
          <AppText variant="heading">Itens a considerar</AppText>
          {candidates.groups.map((g) => (
            <View key={g.ruleId} className="gap-1">
              <AppText variant="caption">{g.reason_pt}</AppText>
              <View className="flex-row flex-wrap gap-1">
                {g.itemIds.map((id) => {
                  const item = index.items.get(id)!;
                  return (
                    <EntityIcon
                      key={id}
                      icon={item.icon}
                      name={displayName(item)}
                      size={40}
                      details={{ kind: 'item', id }}
                      onPress={() => router.push(`/item/${id}`)}
                    />
                  );
                })}
              </View>
            </View>
          ))}
        </Card>
      ) : null}

      {counters.length ? (
        <Card className="gap-2" testID="counters">
          <AppText variant="heading">Campeões para a sua rota</AppText>
          {counters.map((c) => {
            const champ = index.champions.get(c.championId)!;
            return (
              <View key={c.championId} className="flex-row items-center gap-3">
                <EntityIcon
                  icon={champ.icon}
                  name={displayName(champ)}
                  size={40}
                  details={{ kind: 'champion', id: champ.id }}
                />
                <AppText className="flex-1" variant="caption">
                  <AppText className="font-semibold text-text">{displayName(champ)}</AppText> (
                  {ROLE_LABEL[c.role]}): {c.reason_pt}
                </AppText>
              </View>
            );
          })}
          {counters.some((c) => c.derived) ? (
            <AppText variant="caption">
              Sem dados de confronto direto com fonte; sugestão pelo desempenho no patch.
            </AppText>
          ) : null}
        </Card>
      ) : null}

      {bans.length ? (
        <Card className="gap-2" testID="det-bans">
          <AppText variant="heading">Bans sugeridos</AppText>
          {bans.map((b) => {
            const champ = index.champions.get(b.championId)!;
            return (
              <View key={b.championId} className="flex-row items-center gap-3">
                <EntityIcon
                  icon={champ.icon}
                  name={displayName(champ)}
                  size={40}
                  details={{ kind: 'champion', id: champ.id }}
                />
                <AppText className="flex-1" variant="caption">
                  <AppText className="font-semibold text-text">{displayName(champ)}</AppText>:{' '}
                  {b.reason_pt}
                </AppText>
              </View>
            );
          })}
        </Card>
      ) : null}
    </View>
  );
}
