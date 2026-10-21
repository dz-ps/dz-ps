import {
  cumulativeCosts,
  displayName,
  encodeBuild,
  isRunePageValid,
  ROLES,
  validateItems,
  validateSpells,
  type CatalogIndex,
  type Item,
} from '@riftbuild/shared';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, Share, TextInput, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { DataBanners } from '@/components/catalog/DataBanners';
import { EntityIcon } from '@/components/catalog/EntityIcon';
import { EntityPicker } from '@/components/catalog/EntityPicker';
import { AppText, Banner, Button, Card, Screen } from '@/components/ui';
import { useCatalog } from '@/data/catalog/CatalogProvider';
import type { AppStore, SavedBuild } from '@/data/store/types';
import { BuildReview } from '@/features/builds/BuildReview';
import { takePendingBuild } from '@/features/builds/handoff';
import { RunePageEditor } from '@/features/builds/RunePageEditor';
import { ShareCard, type ShareCardRef } from '@/features/builds/ShareCard';
import { editorReducer, initialEditorState } from '@/features/builds/state';
import { StatPanel } from '@/features/builds/StatPanel';
import { ROLE_LABEL } from '@/i18n/labels';
import { color } from '@/theme/tokens';

const newId = () => `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

export default function BuildEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { index, store } = useCatalog();
  if (!index) {
    return (
      <Screen>
        <DataBanners />
      </Screen>
    );
  }
  return (
    <Editor
      key={`${id ?? 'new'}-${index.patch}`}
      buildId={id ?? 'new'}
      index={index}
      store={store}
    />
  );
}

function Editor({
  buildId,
  index,
  store,
}: {
  buildId: string;
  index: CatalogIndex;
  store: AppStore;
}) {
  const reducer = useMemo(() => editorReducer(index), [index]);
  const [state, dispatch] = useReducer(reducer, null, () =>
    initialEditorState(index, takePendingBuild() ?? undefined),
  );
  const [saved, setSaved] = useState<SavedBuild | null>(null);
  const [name, setName] = useState('');
  const [picker, setPicker] = useState<
    null | { kind: 'champion' } | { kind: 'item'; slot: number } | { kind: 'spell'; index: 0 | 1 }
  >(null);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const shareRef = useRef<ShareCardRef>(null);
  const b = state.build;

  useEffect(() => {
    if (buildId === 'new') return;
    void store.listBuilds().then((all) => {
      const found = all.find((x) => x.id === buildId);
      if (found) {
        setSaved(found);
        setName(found.name);
        dispatch({ type: 'load', build: found.build });
      }
    });
  }, [buildId, store]);

  useEffect(() => {
    if (!state.blocked) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    AccessibilityInfo.announceForAccessibility(state.blocked.message);
  }, [state.blocked]);

  const itemIds = b.items.filter((i): i is string => !!i);
  const itemWarnings = validateItems(b, index).warnings;
  const spellErrors =
    b.spells.some(Boolean) || b.role ? validateSpells(b.spells, b.role, index).errors : [];
  const runesStarted = !!(b.runes.keystone || b.runes.primaryPath || b.runes.secondary);
  const runesValid = isRunePageValid(b.runes, index);
  const canSave = runesValid && spellErrors.length === 0;
  const champ = b.championId ? index.champions.get(b.championId) : undefined;
  const costs = cumulativeCosts(itemIds, index);
  const pickerItems = useMemo(
    () =>
      [...index.items.values()].filter(
        (i) => i.tier >= 2 || i.category === index.rules.boots_category,
      ),
    [index],
  );
  const spells = useMemo(() => [...index.spells.values()].filter((s) => s.selectable), [index]);
  const champions = useMemo(() => [...index.champions.values()], [index]);

  async function save(favoriteToggle = false) {
    const now = new Date().toISOString();
    const entry: SavedBuild = {
      id: saved?.id ?? newId(),
      name:
        name.trim() ||
        (champ
          ? `${displayName(champ)} ${b.role ? ROLE_LABEL[b.role] : ''}`.trim()
          : 'Minha build'),
      favorite: favoriteToggle ? !(saved?.favorite ?? false) : (saved?.favorite ?? false),
      patch: index.patch,
      build: b,
      createdAt: saved?.createdAt ?? now,
      updatedAt: now,
    };
    await store.saveBuild(entry);
    setSaved(entry);
    setNotice(
      favoriteToggle
        ? entry.favorite
          ? 'Build favoritada.'
          : 'Removida dos favoritos.'
        : 'Build salva no aparelho.',
    );
    if (buildId === 'new') router.setParams({ id: entry.id });
  }

  async function duplicate() {
    const now = new Date().toISOString();
    const copy: SavedBuild = {
      id: newId(),
      name: `${saved?.name ?? name ?? 'Build'} (cópia)`,
      favorite: false,
      patch: index.patch,
      build: b,
      createdAt: now,
      updatedAt: now,
    };
    await store.saveBuild(copy);
    router.push(`/build/${copy.id}`);
  }

  async function shareImage() {
    try {
      const uri = await captureRef(shareRef.current as Parameters<typeof captureRef>[0], {
        format: 'png',
        quality: 1,
      });
      if (await Sharing.isAvailableAsync())
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Compartilhar build' });
      else setNotice('Compartilhamento de imagem indisponível neste dispositivo.');
    } catch {
      setNotice('Não foi possível gerar a imagem.');
    }
  }

  async function shareLink() {
    const link = `riftbuild://b/${encodeBuild(b, index.patch)}`;
    await Clipboard.setStringAsync(link).catch(() => {});
    if (Platform.OS !== 'web')
      await Share.share({ message: `Minha build no RiftBuild: ${link}` }).catch(() => {});
    setNotice('Link copiado.');
  }

  return (
    <Screen testID="screen-build-editor">
      <Stack.Screen options={{ title: saved ? saved.name : 'Nova build' }} />
      <DataBanners />

      <Card className="gap-3">
        <AppText variant="heading">Campeão e rota</AppText>
        <View className="flex-row items-center gap-3">
          <EntityIcon
            testID="pick-champion"
            icon={champ?.icon}
            name={champ ? displayName(champ) : 'Escolher campeão'}
            placeholder={champ ? undefined : '+'}
            size={64}
            onPress={() => setPicker({ kind: 'champion' })}
            details={champ ? { kind: 'champion', id: champ.id } : undefined}
          />
          <AppText className="flex-1">
            {champ ? displayName(champ) : 'Toque para escolher o campeão'}
          </AppText>
        </View>
        <View className="flex-row flex-wrap gap-2">
          {ROLES.map((r) => (
            <Pressable
              key={r}
              accessibilityRole="button"
              accessibilityState={{ selected: b.role === r }}
              onPress={() => dispatch({ type: 'role', role: b.role === r ? null : r })}
              className={`min-h-touch justify-center rounded-full border px-4 ${b.role === r ? 'border-accent' : 'border-border'}`}
            >
              <AppText className={b.role === r ? 'text-accent' : 'text-text'}>
                {ROLE_LABEL[r]}
              </AppText>
            </Pressable>
          ))}
        </View>
      </Card>

      <Card className="gap-3">
        <AppText variant="heading">Itens</AppText>
        <View className="flex-row flex-wrap gap-2">
          {b.items.map((itemId, slot) => {
            const item = itemId ? index.items.get(itemId) : undefined;
            return (
              <EntityIcon
                key={slot}
                testID={`slot-${slot}`}
                icon={item?.icon}
                name={item ? displayName(item) : `Slot ${slot + 1} vazio`}
                placeholder={item ? undefined : '+'}
                size={52}
                selected={selectedSlot === slot}
                onPress={() =>
                  item
                    ? setSelectedSlot(selectedSlot === slot ? null : slot)
                    : setPicker({ kind: 'item', slot })
                }
                details={item ? { kind: 'item', id: item.id } : undefined}
              />
            );
          })}
        </View>
        {selectedSlot !== null && b.items[selectedSlot] ? (
          <View className="flex-row gap-2">
            <Button
              label="◀"
              kind="secondary"
              accessibilityLabel="Mover para a esquerda"
              onPress={() => {
                dispatch({ type: 'moveItem', slot: selectedSlot, dir: -1 });
                setSelectedSlot(Math.max(0, selectedSlot - 1));
              }}
            />
            <Button
              label="▶"
              kind="secondary"
              accessibilityLabel="Mover para a direita"
              onPress={() => {
                dispatch({ type: 'moveItem', slot: selectedSlot, dir: 1 });
                setSelectedSlot(Math.min(b.items.length - 1, selectedSlot + 1));
              }}
            />
            <Button
              label="Trocar"
              kind="secondary"
              onPress={() => setPicker({ kind: 'item', slot: selectedSlot })}
            />
            <Button
              label="Remover"
              kind="danger"
              onPress={() => {
                dispatch({ type: 'removeItem', slot: selectedSlot });
                setSelectedSlot(null);
              }}
            />
          </View>
        ) : null}
        {state.blocked ? (
          <Banner tone="danger" text={state.blocked.message} testID="blocked-message" />
        ) : null}
        {itemWarnings.map((w) => (
          <Banner key={w.message_pt} tone="warning" text={w.message_pt} testID="item-warning" />
        ))}
        {index.rules.flags.item_slots && !index.rules.flags.item_slots.confirmed ? (
          <AppText variant="caption">
            Número de slots ({index.rules.item_slots}) a confirmar no jogo.
          </AppText>
        ) : null}
      </Card>

      {itemIds.length ? (
        <Card className="gap-2">
          <AppText variant="heading">Ordem de compra</AppText>
          {itemIds.map((itemId, i) => {
            const item = index.items.get(itemId) as Item;
            return (
              <View key={`${itemId}-${i}`} className="flex-row items-center justify-between">
                <AppText>
                  {i + 1}. {displayName(item)}
                </AppText>
                <AppText variant="caption">
                  {item.cost ?? '—'} · total {costs[i]}
                </AppText>
              </View>
            );
          })}
        </Card>
      ) : null}

      <Card className="gap-3">
        <AppText variant="heading">Runas</AppText>
        <RunePageEditor value={b.runes} onChange={(runes) => dispatch({ type: 'runes', runes })} />
      </Card>

      <Card className="gap-3">
        <AppText variant="heading">Feitiços</AppText>
        <View className="flex-row gap-3">
          {([0, 1] as const).map((i) => {
            const spell = b.spells[i] ? index.spells.get(b.spells[i]!) : undefined;
            return (
              <EntityIcon
                key={i}
                testID={`spell-slot-${i}`}
                icon={spell?.icon}
                name={spell ? displayName(spell) : `Feitiço ${i + 1}`}
                placeholder={spell ? undefined : '+'}
                size={52}
                onPress={() => setPicker({ kind: 'spell', index: i })}
                details={spell ? { kind: 'spell', id: spell.id } : undefined}
              />
            );
          })}
        </View>
        {spellErrors.map((e) => (
          <AppText key={e.code} variant="caption" className="text-warning">
            ⚠ {e.message_pt}
          </AppText>
        ))}
      </Card>

      <Card className="gap-3">
        <AppText variant="heading">Ordem de habilidades</AppText>
        <View className="flex-row gap-2">
          {['Q', 'W', 'E'].map((k) => (
            <Button
              key={k}
              label={k}
              kind={b.skillOrder.includes(k) ? 'primary' : 'secondary'}
              accessibilityLabel={`Prioridade ${k}`}
              onPress={() =>
                dispatch({
                  type: 'skillOrder',
                  order: b.skillOrder.includes(k)
                    ? b.skillOrder.filter((x) => x !== k)
                    : [...b.skillOrder, k],
                })
              }
            />
          ))}
        </View>
        <AppText testID="skill-order">
          {b.skillOrder.length
            ? `${b.skillOrder.join(' > ')} (R sempre que possível)`
            : 'Toque nas habilidades na ordem de prioridade.'}
        </AppText>
      </Card>

      <Card className="gap-3">
        <AppText variant="heading">Atributos totais</AppText>
        <StatPanel championId={b.championId} items={itemIds} />
      </Card>

      <Card className="gap-3">
        <AppText variant="heading">Salvar e compartilhar</AppText>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Nome da build"
          placeholderTextColor={color.muted}
          accessibilityLabel="Nome da build"
          style={{
            color: color.text,
            minHeight: 48,
            borderWidth: 1,
            borderColor: color.border,
            borderRadius: 12,
            paddingHorizontal: 12,
          }}
        />
        {!canSave ? (
          <AppText testID="save-blocked" variant="caption" className="text-warning">
            {runesStarted || !runesValid
              ? 'Complete uma página de runas válida para salvar.'
              : 'Corrija os feitiços para salvar.'}
          </AppText>
        ) : null}
        <Button
          testID="save-build"
          label="Salvar"
          disabled={!canSave}
          onPress={() => void save()}
        />
        <View className="flex-row gap-2">
          <Button
            className="flex-1"
            label={saved?.favorite ? '★ Favorita' : '☆ Favoritar'}
            kind="secondary"
            disabled={!canSave}
            onPress={() => void save(true)}
          />
          <Button
            className="flex-1"
            label="Duplicar"
            kind="secondary"
            onPress={() => void duplicate()}
          />
        </View>
        <View className="flex-row gap-2">
          <Button
            className="flex-1"
            label="Imagem"
            kind="secondary"
            onPress={() => void shareImage()}
          />
          <Button
            className="flex-1"
            label="Link"
            kind="secondary"
            onPress={() => void shareLink()}
          />
        </View>
        {notice ? (
          <AppText testID="build-notice" variant="caption">
            {notice}
          </AppText>
        ) : null}
      </Card>

      <BuildReview build={b} />

      <View
        style={{ position: 'absolute', left: -10000, top: 0 }}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <ShareCard ref={shareRef} build={b} name={name} />
      </View>

      <EntityPicker
        testID="champion-picker"
        visible={picker?.kind === 'champion'}
        title="Escolher campeão"
        entities={champions}
        detailsKind="champion"
        onClose={() => setPicker(null)}
        onPick={(c) => {
          dispatch({ type: 'champion', id: c.id });
          setPicker(null);
        }}
      />
      <EntityPicker
        testID="item-picker"
        visible={picker?.kind === 'item'}
        title="Escolher item"
        entities={pickerItems}
        detailsKind="item"
        subtitle={(i) => (i.cost !== null ? `${i.cost}` : null)}
        onClose={() => setPicker(null)}
        onPick={(item) => {
          if (picker?.kind === 'item')
            dispatch({ type: 'addItem', id: item.id, slot: picker.slot });
          setPicker(null);
          setSelectedSlot(null);
        }}
      />
      <EntityPicker
        testID="spell-picker"
        visible={picker?.kind === 'spell'}
        title="Escolher feitiço"
        entities={spells}
        detailsKind="spell"
        onClose={() => setPicker(null)}
        onPick={(s) => {
          if (picker?.kind === 'spell') dispatch({ type: 'spell', index: picker.index, id: s.id });
          setPicker(null);
        }}
      />
    </Screen>
  );
}
