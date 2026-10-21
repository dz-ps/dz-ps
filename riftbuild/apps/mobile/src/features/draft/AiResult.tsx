import {
  displayName,
  type AiDraftResponse,
  type CatalogIndex,
  type DraftSection,
} from '@riftbuild/shared';
import { ActivityIndicator, View } from 'react-native';
import { EntityIcon } from '@/components/catalog/EntityIcon';
import { AppText, Banner, Card } from '@/components/ui';
import { PATH_LABEL, ROLE_LABEL } from '@/i18n/labels';
import { color } from '@/theme/tokens';
import type { AiState } from './useDraftAnalysis';

type Sections = Partial<Record<DraftSection, unknown>>;

function Skeleton({ label }: { label: string }) {
  return (
    <View className="flex-row items-center gap-2">
      <ActivityIndicator color={color.accent} />
      <AppText variant="caption">{label}</AppText>
    </View>
  );
}

/** AI sections as they stream in; only validated data ever reaches this component. */
export function AiResult({ state, index }: { state: AiState; index: CatalogIndex }) {
  if (state.status === 'idle') return null;
  const sections: Sections = 'sections' in state && state.sections ? state.sections : {};
  const build = sections.build as AiDraftResponse['build'] | undefined;
  const counters = sections.counter_picks as AiDraftResponse['counter_picks'] | undefined;
  const bans = sections.bans as AiDraftResponse['bans'] | undefined;
  const plan = sections.game_plan as string[] | undefined;
  const pending = state.status === 'loading' || state.status === 'streaming';

  return (
    <View testID="ai-result" className="gap-3">
      {state.status === 'error' ? (
        <Banner
          tone={state.code === 'network' || state.code === 'config' ? 'info' : 'danger'}
          text={state.message}
          testID="ai-error"
        />
      ) : null}
      {state.status === 'done' && state.incomplete ? (
        <Banner
          tone="warning"
          text="Parte da resposta da IA foi descartada por não passar na validação do catálogo."
          testID="ai-incomplete"
        />
      ) : null}

      <Card className="gap-3" testID="ai-build">
        <AppText variant="heading">Build counter (IA)</AppText>
        {build ? (
          <>
            {build.items.map((it) => {
              const item = index.items.get(it.id);
              return item ? (
                <View key={it.id} className="flex-row items-center gap-3">
                  <EntityIcon
                    icon={item.icon}
                    name={displayName(item)}
                    size={44}
                    details={{ kind: 'item', id: item.id }}
                  />
                  <View className="flex-1">
                    <AppText className="font-semibold">{displayName(item)}</AppText>
                    <AppText variant="caption">{it.reason}</AppText>
                  </View>
                </View>
              ) : null;
            })}
            {build.boots && index.items.get(build.boots.id) ? (
              <View className="flex-row items-center gap-3">
                <EntityIcon
                  icon={index.items.get(build.boots.id)!.icon}
                  name={displayName(index.items.get(build.boots.id)!)}
                  size={44}
                  details={{ kind: 'item', id: build.boots.id }}
                />
                <View className="flex-1">
                  <AppText className="font-semibold">
                    {displayName(index.items.get(build.boots.id)!)}
                  </AppText>
                  <AppText variant="caption">{build.boots.reason}</AppText>
                </View>
              </View>
            ) : null}
            {build.runes ? (
              <View className="flex-row flex-wrap items-center gap-1">
                {[build.runes.keystone, ...build.runes.primary, build.runes.secondary].map((id) => {
                  const rune = index.runes.get(id);
                  return rune ? (
                    <EntityIcon
                      key={id}
                      icon={rune.icon}
                      name={displayName(rune)}
                      size={36}
                      rounded
                      details={{ kind: 'rune', id }}
                    />
                  ) : null;
                })}
                <AppText variant="caption">{PATH_LABEL[build.runes.primary_path]}</AppText>
              </View>
            ) : null}
            <View className="flex-row items-center gap-2">
              {(build.spells ?? []).map((id) => {
                const spell = index.spells.get(id);
                return spell ? (
                  <EntityIcon
                    key={id}
                    icon={spell.icon}
                    name={displayName(spell)}
                    size={36}
                    details={{ kind: 'spell', id }}
                  />
                ) : null;
              })}
              {build.skill_order ? (
                <AppText className="font-semibold">{build.skill_order}</AppText>
              ) : null}
            </View>
          </>
        ) : pending ? (
          <Skeleton label="Montando a build…" />
        ) : (
          <AppText variant="caption">Sem build da IA.</AppText>
        )}
      </Card>

      {counters && counters.length ? (
        <Card className="gap-2">
          <AppText variant="heading">Counters sugeridos (IA)</AppText>
          {counters.map((c) => {
            const champ = index.champions.get(c.champion_id);
            return champ ? (
              <View key={c.champion_id} className="flex-row items-center gap-3">
                <EntityIcon
                  icon={champ.icon}
                  name={displayName(champ)}
                  size={40}
                  details={{ kind: 'champion', id: champ.id }}
                />
                <AppText className="flex-1" variant="caption">
                  <AppText className="font-semibold text-text">{displayName(champ)}</AppText> (
                  {ROLE_LABEL[c.role]}): {c.reason}
                </AppText>
              </View>
            ) : null;
          })}
        </Card>
      ) : null}

      {bans && bans.length ? (
        <Card className="gap-2">
          <AppText variant="heading">Bans (IA)</AppText>
          {bans.map((b) => {
            const champ = index.champions.get(b.champion_id);
            return champ ? (
              <View key={b.champion_id} className="flex-row items-center gap-3">
                <EntityIcon
                  icon={champ.icon}
                  name={displayName(champ)}
                  size={40}
                  details={{ kind: 'champion', id: champ.id }}
                />
                <AppText className="flex-1" variant="caption">
                  <AppText className="font-semibold text-text">{displayName(champ)}</AppText>:{' '}
                  {b.reason}
                </AppText>
              </View>
            ) : null;
          })}
        </Card>
      ) : null}

      <Card className="gap-2" testID="ai-plan">
        <AppText variant="heading">Plano de jogo (IA)</AppText>
        {plan && plan.length ? (
          plan.map((line, i) => <AppText key={i}>• {line}</AppText>)
        ) : pending ? (
          <Skeleton label="Pensando no plano de jogo…" />
        ) : (
          <AppText variant="caption">Sem plano de jogo.</AppText>
        )}
      </Card>
      {state.status === 'done' && state.cached ? (
        <AppText variant="caption">Resposta do cache (mesmo draft analisado recentemente).</AppText>
      ) : null}
    </View>
  );
}
