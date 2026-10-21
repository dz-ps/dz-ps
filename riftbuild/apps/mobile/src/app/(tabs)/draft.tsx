import {
  displayName,
  emptyBuild,
  parseChampions,
  ROLES,
  type AiDraftResponse,
  type Role,
  type UserBuild,
} from '@riftbuild/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { DataBanners } from '@/components/catalog/DataBanners';
import { EntityIcon } from '@/components/catalog/EntityIcon';
import { EntityPicker } from '@/components/catalog/EntityPicker';
import { AppText, Banner, Button, Card, Screen } from '@/components/ui';
import { useCatalog } from '@/data/catalog/CatalogProvider';
import type { SavedDraft } from '@/data/store/types';
import { setPendingBuild } from '@/features/builds/handoff';
import type { ShareCardRef } from '@/features/builds/ShareCard';
import { AiResult } from '@/features/draft/AiResult';
import { DeterministicResult } from '@/features/draft/DeterministicResult';
import { DraftShareCard } from '@/features/draft/DraftShareCard';
import { takePendingDraft } from '@/features/draft/handoff';
import { recordLoss } from '@/features/profile/lossLog';
import { useDraftAnalysis } from '@/features/draft/useDraftAnalysis';
import { loadProfile } from '@/features/profile/profile';
import { formatDate, ROLE_LABEL } from '@/i18n/labels';
import { env } from '@/lib/env';
import { shareViewAsImage } from '@/lib/shareImage';
import { color } from '@/theme/tokens';

type Step = 'input' | 'confirm' | 'result';
type PickTarget = { side: 'enemy' | 'ally'; slot: number } | { side: 'me' } | null;

export default function DraftScreen() {
  const { index, meta, championSearch, store } = useCatalog();
  const profile = useMemo(() => loadProfile(), []);
  const [text, setText] = useState('');
  const [enemies, setEnemies] = useState<string[]>([]);
  const [allies, setAllies] = useState<string[]>([]);
  const [myChampion, setMyChampion] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<Role | null>(profile.role);
  const [showOptions, setShowOptions] = useState(false);
  const [unresolved, setUnresolved] = useState<string[]>([]);
  const [step, setStep] = useState<Step>('input');
  const [picker, setPicker] = useState<PickTarget>(null);
  const [history, setHistory] = useState<SavedDraft[]>([]);
  const [lossLog, setLossLog] = useState<Record<string, number>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const { deterministic, ai, analyze, reset } = useDraftAnalysis(index, meta);
  const shareRef = useRef<ShareCardRef>(null);

  useFocusEffect(
    useCallback(() => {
      void store.listDrafts(5).then(setHistory);
      void store.getLossLog().then(setLossLog);
      const reopen = takePendingDraft();
      if (reopen && index) {
        reset();
        setEnemies(reopen.enemies.filter((id) => index.champions.has(id)));
        setAllies(reopen.allies.filter((id) => index.champions.has(id)));
        setMyChampion(
          reopen.myChampion && index.champions.has(reopen.myChampion) ? reopen.myChampion : null,
        );
        setMyRole((reopen.myRole as Role | null) ?? null);
        setStep('confirm');
      }
    }, [store, index, reset]),
  );

  const champions = useMemo(() => [...(index?.champions.values() ?? [])], [index]);
  const taken = new Set([...enemies, ...allies, ...(myChampion ? [myChampion] : [])]);

  function onText(value: string) {
    setText(value);
    if (!championSearch) return;
    const parsed = parseChampions(value, championSearch, 5);
    setEnemies(
      parsed.resolved.map((r) => r.id).filter((id) => id !== myChampion && !allies.includes(id)),
    );
    setUnresolved(parsed.unresolved);
  }

  function pick(id: string) {
    if (!picker) return;
    if (picker.side === 'me') setMyChampion(id);
    else {
      const list = picker.side === 'enemy' ? enemies.slice() : allies.slice();
      list[picker.slot] = id;
      (picker.side === 'enemy' ? setEnemies : setAllies)(list.filter(Boolean));
    }
    setPicker(null);
  }

  const elo = profile.elo ?? meta?.rank_tiers[0] ?? null;
  function confirm() {
    setStep('result');
    analyze({
      enemies,
      allies,
      myChampion,
      myRole,
      elo,
      style: profile.style,
      mains: profile.mains,
      lossLog,
    });
  }

  function applyToBuilder() {
    if (!index) return;
    const response = ai.status === 'done' ? ai.response : undefined;
    const build: UserBuild = emptyBuild(index.rules.item_slots);
    build.championId = myChampion;
    build.role = myRole;
    const fromAi = response?.build;
    const items = fromAi
      ? [...(fromAi.boots ? [fromAi.boots.id] : []), ...fromAi.items.map((i) => i.id)]
      : (deterministic?.candidates.groups.flatMap((g) => g.itemIds.slice(0, 1)) ?? []);
    [...new Set(items)].slice(0, index.rules.item_slots).forEach((id, i) => (build.items[i] = id));
    if (fromAi?.runes) {
      build.runes = {
        keystone: fromAi.runes.keystone,
        primaryPath: fromAi.runes.primary_path,
        primary: fromAi.runes.primary,
        secondary: fromAi.runes.secondary,
      };
    }
    if (fromAi?.spells?.length === 2) build.spells = [fromAi.spells[0]!, fromAi.spells[1]!];
    if (fromAi?.skill_order)
      build.skillOrder = fromAi.skill_order
        .split('>')
        .map((s) => s.trim())
        .filter((k) => ['Q', 'W', 'E'].includes(k));
    setPendingBuild(build);
    router.push('/build/new');
  }

  async function saveDraft() {
    const response = ai.status === 'done' ? (ai.response as AiDraftResponse) : null;
    await store.saveDraft({
      id: `d_${Date.now().toString(36)}`,
      patch: index?.patch ?? '',
      enemies,
      allies,
      myChampion,
      myRole,
      response,
      createdAt: new Date().toISOString(),
    });
    setHistory(await store.listDrafts(5));
    setNotice('Draft salvo no aparelho.');
  }

  async function shareAnalysis() {
    const problem = await shareViewAsImage(shareRef, 'Compartilhar análise de draft');
    if (problem) setNotice(problem);
  }

  async function lostTo(id: string) {
    setLossLog(await recordLoss(store, id));
    const champ = index?.champions.get(id);
    setNotice(
      `Derrota para ${champ ? displayName(champ) : id} registrada. Ela pesa nos bans sugeridos.`,
    );
  }

  function startOver() {
    reset();
    setStep('input');
    setText('');
    setEnemies([]);
    setUnresolved([]);
    setNotice(null);
  }

  return (
    <Screen testID="screen-draft">
      <DataBanners />
      {index ? (
        <>
          {step !== 'result' ? (
            <Card className="gap-3">
              <AppText variant="heading">Composição inimiga</AppText>
              <TextInput
                testID="draft-input"
                value={text}
                onChangeText={onText}
                placeholder="Digite ou cole: soraka mumu jinx mel voli"
                placeholderTextColor={color.muted}
                accessibilityLabel="Composição inimiga em texto"
                autoCapitalize="none"
                autoCorrect={false}
                style={{
                  color: color.text,
                  fontSize: 16,
                  minHeight: 48,
                  borderWidth: 1,
                  borderColor: color.control,
                  borderRadius: 12,
                  paddingHorizontal: 12,
                }}
              />
              <View className="flex-row flex-wrap gap-2" testID="enemy-slots">
                {Array.from({ length: 5 }, (_, i) => {
                  const champ = enemies[i] ? index.champions.get(enemies[i]!) : undefined;
                  return (
                    <EntityIcon
                      key={i}
                      testID={`enemy-slot-${i}`}
                      icon={champ?.icon}
                      name={champ ? displayName(champ) : `Inimigo ${i + 1}`}
                      placeholder={champ ? undefined : '+'}
                      size={56}
                      onPress={() => setPicker({ side: 'enemy', slot: champ ? i : enemies.length })}
                      details={champ ? { kind: 'champion', id: champ.id } : undefined}
                    />
                  );
                })}
              </View>
              {unresolved.length ? (
                <AppText testID="draft-unresolved" variant="caption" className="text-warning">
                  Não reconhecido: {unresolved.join(', ')}
                </AppText>
              ) : null}

              <Pressable
                accessibilityRole="button"
                onPress={() => setShowOptions((v) => !v)}
                className="min-h-touch justify-center"
              >
                <AppText className="text-info">
                  {showOptions ? '▾' : '▸'} Opcional: meu campeão, minha rota, aliados
                </AppText>
              </Pressable>
              {showOptions ? (
                <View className="gap-3">
                  <View className="flex-row items-center gap-3">
                    <EntityIcon
                      testID="my-champion"
                      icon={myChampion ? index.champions.get(myChampion)?.icon : undefined}
                      name={
                        myChampion ? displayName(index.champions.get(myChampion)!) : 'Meu campeão'
                      }
                      placeholder={myChampion ? undefined : '+'}
                      size={56}
                      onPress={() => setPicker({ side: 'me' })}
                    />
                    <AppText className="flex-1">
                      {myChampion
                        ? displayName(index.champions.get(myChampion)!)
                        : 'Meu campeão (opcional)'}
                    </AppText>
                    {myChampion ? (
                      <Button label="Limpar" kind="ghost" onPress={() => setMyChampion(null)} />
                    ) : null}
                  </View>
                  <View className="flex-row flex-wrap gap-2">
                    {ROLES.map((r) => (
                      <Pressable
                        key={r}
                        accessibilityRole="button"
                        accessibilityState={{ selected: myRole === r }}
                        onPress={() => setMyRole(myRole === r ? null : r)}
                        className={`min-h-touch justify-center rounded-full border px-4 ${myRole === r ? 'border-accent' : 'border-control'}`}
                      >
                        <AppText className={myRole === r ? 'text-accent' : 'text-text'}>
                          {ROLE_LABEL[r]}
                        </AppText>
                      </Pressable>
                    ))}
                  </View>
                  <View className="flex-row flex-wrap gap-2">
                    {Array.from({ length: 4 }, (_, i) => {
                      const champ = allies[i] ? index.champions.get(allies[i]!) : undefined;
                      return (
                        <EntityIcon
                          key={i}
                          icon={champ?.icon}
                          name={champ ? displayName(champ) : `Aliado ${i + 1}`}
                          placeholder={champ ? undefined : '+'}
                          size={44}
                          onPress={() =>
                            setPicker({ side: 'ally', slot: champ ? i : allies.length })
                          }
                        />
                      );
                    })}
                  </View>
                  <AppText variant="caption">
                    Elo para estatísticas: {elo ?? '—'} (altere no Perfil)
                  </AppText>
                </View>
              ) : null}

              {step === 'input' ? (
                <Button
                  testID="draft-analyze"
                  label="Analisar"
                  size="lg"
                  disabled={enemies.length === 0}
                  onPress={() => setStep('confirm')}
                />
              ) : (
                <View className="gap-2" testID="confirm-strip">
                  <AppText variant="label">Confirme os inimigos</AppText>
                  <View className="flex-row gap-2">
                    {enemies.map((id) => (
                      <EntityIcon
                        key={id}
                        icon={index.champions.get(id)?.icon}
                        name={displayName(index.champions.get(id)!)}
                        size={56}
                      />
                    ))}
                  </View>
                  <Button testID="draft-confirm" label="Confirmar" size="lg" onPress={confirm} />
                  <Button label="Corrigir" kind="ghost" onPress={() => setStep('input')} />
                </View>
              )}
            </Card>
          ) : null}

          {step === 'result' && deterministic ? (
            <>
              <View className="flex-row flex-wrap items-center gap-2">
                {enemies.map((id) => (
                  <EntityIcon
                    key={id}
                    icon={index.champions.get(id)?.icon}
                    name={displayName(index.champions.get(id)!)}
                    size={44}
                    details={{ kind: 'champion', id }}
                  />
                ))}
                <Button label="Novo draft" kind="secondary" onPress={startOver} />
              </View>
              <DeterministicResult result={deterministic} index={index} />
              {env.hasBackend ? (
                <AiResult state={ai} index={index} />
              ) : (
                <Banner
                  tone="info"
                  text="A análise com IA precisa do backend configurado e de internet. A leitura acima funciona offline."
                />
              )}
              <View className="flex-row gap-2">
                <Button
                  className="flex-1"
                  testID="apply-build"
                  label="Aplicar no criador de build"
                  onPress={applyToBuilder}
                />
              </View>
              <View className="flex-row gap-2">
                <Button
                  className="flex-1"
                  testID="save-draft"
                  label="Salvar draft"
                  kind="secondary"
                  onPress={() => void saveDraft()}
                />
                <Button
                  className="flex-1"
                  testID="share-draft"
                  label="Compartilhar imagem"
                  kind="secondary"
                  onPress={() => void shareAnalysis()}
                />
              </View>
              <Card className="gap-2" testID="loss-row">
                <AppText variant="label">Perdeu a partida? Toque em quem mais te venceu:</AppText>
                <View className="flex-row flex-wrap gap-2">
                  {enemies.map((id) => {
                    const champ = index.champions.get(id);
                    if (!champ) return null;
                    return (
                      <EntityIcon
                        key={id}
                        testID={`lost-to-${id}`}
                        icon={champ.icon}
                        name={`Perdi para ${displayName(champ)}${lossLog[id] ? ` (${lossLog[id]})` : ''}`}
                        size={44}
                        onPress={() => void lostTo(id)}
                      />
                    );
                  })}
                </View>
              </Card>
              {notice ? (
                <AppText testID="draft-notice" variant="caption">
                  {notice}
                </AppText>
              ) : null}
              <View
                style={{ position: 'absolute', left: -10000, top: 0 }}
                pointerEvents="none"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <DraftShareCard
                  ref={shareRef}
                  result={deterministic}
                  ai={ai.status === 'done' ? (ai.response as AiDraftResponse) : null}
                  index={index}
                  myChampion={myChampion}
                  myRole={myRole}
                />
              </View>
            </>
          ) : null}

          {step !== 'result' && history.length ? (
            <Card className="gap-2">
              <AppText variant="heading">Drafts recentes</AppText>
              {history.map((d) => (
                <Pressable
                  key={d.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Repetir draft de ${formatDate(d.createdAt)}`}
                  onPress={() => {
                    setEnemies(d.enemies.filter((id) => index.champions.has(id)));
                    setAllies(d.allies.filter((id) => index.champions.has(id)));
                    setMyChampion(
                      d.myChampion && index.champions.has(d.myChampion) ? d.myChampion : null,
                    );
                    setMyRole((d.myRole as Role | null) ?? null);
                    setStep('confirm');
                  }}
                  className="min-h-touch flex-row items-center gap-1"
                >
                  {d.enemies.map((id) => {
                    const champ = index.champions.get(id);
                    return champ ? (
                      <EntityIcon key={id} icon={champ.icon} name={displayName(champ)} size={32} />
                    ) : null;
                  })}
                  <AppText variant="caption" className="ml-2">
                    {formatDate(d.createdAt)}
                  </AppText>
                </Pressable>
              ))}
            </Card>
          ) : null}

          <EntityPicker
            testID="draft-picker"
            visible={!!picker}
            title={
              picker?.side === 'me' ? 'Meu campeão' : picker?.side === 'ally' ? 'Aliado' : 'Inimigo'
            }
            entities={champions.filter((c) => !taken.has(c.id))}
            detailsKind="champion"
            onClose={() => setPicker(null)}
            onPick={(c) => pick(c.id)}
          />
        </>
      ) : null}
    </Screen>
  );
}
