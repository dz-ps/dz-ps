import { displayName } from '@riftbuild/shared';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { AppText, Button } from '@/components/ui';
import { useCatalog } from '@/data/catalog/CatalogProvider';
import { t } from '@/i18n/pt-BR';
import { ABILITY_KEY_LABEL, CC_LABEL, formatStat, PATH_LABEL } from '@/i18n/labels';
import { SourceBadge } from './SourceBadge';

export type DetailsTarget =
  | { kind: 'champion'; id: string }
  | { kind: 'item'; id: string }
  | { kind: 'rune'; id: string }
  | { kind: 'spell'; id: string }
  | { kind: 'ability'; championId: string; key: string };

type Ctx = { open: (target: DetailsTarget) => void };
const DetailsContext = createContext<Ctx>({ open: () => {} });

export function useDetails() {
  return useContext(DetailsContext);
}

/** Long-press on any icon opens this panel (spec §7). */
export function DetailsProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<DetailsTarget | null>(null);
  const open = useCallback((next: DetailsTarget) => setTarget(next), []);
  const value = useMemo(() => ({ open }), [open]);
  return (
    <DetailsContext.Provider value={value}>
      {children}
      <Modal
        visible={!!target}
        transparent
        animationType="slide"
        onRequestClose={() => setTarget(null)}
      >
        <Pressable
          accessibilityLabel={t.common.close}
          className="flex-1 justify-end bg-black/60"
          onPress={() => setTarget(null)}
        >
          <Pressable
            className="max-h-[75%] rounded-t-3xl border border-border bg-surface p-5"
            onPress={() => {}}
          >
            <ScrollView contentContainerClassName="gap-3 pb-4">
              {target ? <DetailsBody target={target} /> : null}
            </ScrollView>
            <Button label={t.common.close} kind="secondary" onPress={() => setTarget(null)} />
          </Pressable>
        </Pressable>
      </Modal>
    </DetailsContext.Provider>
  );
}

function DetailsBody({ target }: { target: DetailsTarget }) {
  const { index } = useCatalog();
  if (!index) return null;
  switch (target.kind) {
    case 'item': {
      const item = index.items.get(target.id);
      if (!item) return <AppText>Item fora do catálogo.</AppText>;
      return (
        <View testID="details-item" className="gap-2">
          <AppText variant="heading">{displayName(item)}</AppText>
          <AppText variant="caption">
            {item.cost !== null ? `${item.cost} de ouro` : 'Obtido por transformação'}
          </AppText>
          {Object.entries(item.stats).map(([k, v]) => (
            <AppText key={k}>{formatStat(k as never, v as number)}</AppText>
          ))}
          {[...item.passives, ...item.actives].map((e, i) => (
            <AppText key={i} variant="caption">
              <AppText className="font-semibold text-text">
                {e.kind === 'active' ? 'Ativo' : e.unique ? 'Passiva única' : 'Passiva'}
                {e.name ? ` — ${e.name}` : ''}:{' '}
              </AppText>
              {e.description}
            </AppText>
          ))}
          <SourceBadge url={item.source_url} collectedAt={item.collected_at} />
        </View>
      );
    }
    case 'rune': {
      const rune = index.runes.get(target.id);
      if (!rune) return <AppText>Runa fora do catálogo.</AppText>;
      return (
        <View testID="details-rune" className="gap-2">
          <AppText variant="heading">{displayName(rune)}</AppText>
          <AppText variant="caption">
            {rune.kind === 'keystone'
              ? 'Runa-chave'
              : `${rune.path ? PATH_LABEL[rune.path] : ''} · slot ${rune.slot}`}
          </AppText>
          <AppText>{rune.description}</AppText>
          <SourceBadge url={rune.source_url} collectedAt={rune.collected_at} />
        </View>
      );
    }
    case 'spell': {
      const spell = index.spells.get(target.id);
      if (!spell) return <AppText>Feitiço fora do catálogo.</AppText>;
      return (
        <View testID="details-spell" className="gap-2">
          <AppText variant="heading">{displayName(spell)}</AppText>
          <AppText variant="caption">
            Recarga: {spell.cooldown ?? '—'} s{spell.jungle_only ? ' · selva' : ''}
          </AppText>
          <AppText>{spell.description}</AppText>
          <SourceBadge url={spell.source_url} collectedAt={spell.collected_at} />
        </View>
      );
    }
    case 'ability': {
      const champ = index.champions.get(target.championId);
      const ability = champ?.abilities.find((a) => a.key === target.key);
      if (!champ || !ability) return <AppText>Habilidade não encontrada.</AppText>;
      return (
        <View testID="details-ability" className="gap-2">
          <AppText variant="heading">{displayName(ability)}</AppText>
          <AppText variant="caption">
            {displayName(champ)} · {ABILITY_KEY_LABEL[ability.key]} ({ability.key})
            {ability.cooldown ? ` · recarga ${ability.cooldown} s` : ''}
          </AppText>
          <AppText>{ability.description_pt ?? ability.description_en}</AppText>
          {ability.cc_types.length ? (
            <AppText variant="caption">
              Controle: {ability.cc_types.map((c) => CC_LABEL[c]).join(', ')} (estimado)
            </AppText>
          ) : null}
          <SourceBadge url={champ.source_url} collectedAt={champ.collected_at} />
        </View>
      );
    }
    case 'champion': {
      const champ = index.champions.get(target.id);
      if (!champ) return <AppText>Campeão fora do catálogo.</AppText>;
      return (
        <View testID="details-champion" className="gap-2">
          <AppText variant="heading">{displayName(champ)}</AppText>
          {champ.title_pt || champ.title_en ? (
            <AppText variant="caption">{champ.title_pt ?? champ.title_en}</AppText>
          ) : null}
          {champ.abilities.map((a) => (
            <AppText key={a.key} variant="caption">
              <AppText className="font-semibold text-text">{ABILITY_KEY_LABEL[a.key]}: </AppText>
              {displayName(a)}
            </AppText>
          ))}
          <SourceBadge url={champ.source_url} collectedAt={champ.collected_at} />
        </View>
      );
    }
  }
}
