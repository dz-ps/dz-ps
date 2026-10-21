import { displayName, ROLES } from '@riftbuild/shared';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { EntityIcon } from '@/components/catalog/EntityIcon';
import { EntityPicker } from '@/components/catalog/EntityPicker';
import { AppText, Banner, Button, Card, Screen, ToggleChip } from '@/components/ui';
import { useCatalog } from '@/data/catalog/CatalogProvider';
import type { SavedDraft } from '@/data/store/types';
import { setPendingDraft } from '@/features/draft/handoff';
import { deleteAllMyData, deletionMessage } from '@/features/profile/deleteData';
import { forgetLoss, recordLoss } from '@/features/profile/lossLog';
import {
  loadProfile,
  MAX_MAINS,
  saveProfile,
  STYLE_OPTIONS,
  toggleStyle,
  type Profile,
} from '@/features/profile/profile';
import { formatDate, ROLE_LABEL } from '@/i18n/labels';

type Picker = 'main' | 'loss' | null;

/** Profile (spec §5.6): everything stays on the device; no account needed (LGPD). */
export default function ProfileScreen() {
  const { index, meta, store } = useCatalog();
  const [profile, setProfile] = useState<Profile>(() => loadProfile());
  const [lossLog, setLossLog] = useState<Record<string, number>>({});
  const [drafts, setDrafts] = useState<SavedDraft[]>([]);
  const [picker, setPicker] = useState<Picker>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(() => {
    void store.getLossLog().then(setLossLog);
    void store.listDrafts(10).then(setDrafts);
  }, [store]);
  useFocusEffect(reload);

  function update(next: Profile) {
    setProfile(next);
    saveProfile(next);
  }

  const champions = useMemo(() => [...(index?.champions.values() ?? [])], [index]);
  const losses = Object.entries(lossLog)
    .filter(([id]) => index?.champions.has(id))
    .sort((a, b) => b[1] - a[1]);

  async function wipe() {
    setDeleting(true);
    const { remote } = await deleteAllMyData(store);
    setProfile(loadProfile());
    reload();
    setDeleting(false);
    setConfirmDelete(false);
    setNotice(deletionMessage(remote));
  }

  const champ = (id: string) => index?.champions.get(id);

  return (
    <Screen testID="screen-profile">
      <AppText variant="caption">
        Sem conta: seu perfil, builds, drafts e derrotas ficam só neste aparelho.
      </AppText>

      <Card className="gap-3" testID="profile-mains">
        <AppText variant="heading">Campeões principais</AppText>
        <View className="flex-row flex-wrap gap-2">
          {profile.mains.map((id) =>
            champ(id) ? (
              <EntityIcon
                key={id}
                testID={`main-${id}`}
                icon={champ(id)!.icon}
                name={`Remover ${displayName(champ(id)!)}`}
                size={56}
                onPress={() => update({ ...profile, mains: profile.mains.filter((m) => m !== id) })}
              />
            ) : null,
          )}
          {profile.mains.length < MAX_MAINS && index ? (
            <EntityIcon
              testID="add-main"
              icon={undefined}
              name="Adicionar campeão principal"
              placeholder="+"
              size={56}
              onPress={() => setPicker('main')}
            />
          ) : null}
        </View>
        <AppText variant="caption">
          Até {MAX_MAINS}. Usados nos bans sugeridos. Toque num ícone para remover.
        </AppText>
      </Card>

      <Card className="gap-3">
        <AppText variant="heading">Rota</AppText>
        <View className="flex-row flex-wrap gap-2">
          {ROLES.map((r) => (
            <ToggleChip
              key={r}
              testID={`profile-role-${r}`}
              label={ROLE_LABEL[r]}
              selected={profile.role === r}
              onPress={() => update({ ...profile, role: profile.role === r ? null : r })}
            />
          ))}
        </View>
      </Card>

      <Card className="gap-3">
        <AppText variant="heading">Elo</AppText>
        {meta?.rank_tiers.length ? (
          <View className="flex-row flex-wrap gap-2">
            {meta.rank_tiers.map((tier) => (
              <ToggleChip
                key={tier}
                testID={`profile-elo-${tier}`}
                label={tier}
                selected={profile.elo === tier}
                onPress={() => update({ ...profile, elo: profile.elo === tier ? null : tier })}
              />
            ))}
          </View>
        ) : (
          <AppText variant="caption">
            Os elos aparecem quando os dados de meta forem baixados.
          </AppText>
        )}
        <AppText variant="caption">
          As faixas de elo são as da fonte de meta; o elo escolhido vira o filtro padrão da tier
          list.
        </AppText>
      </Card>

      <Card className="gap-3">
        <AppText variant="heading">Estilo</AppText>
        <View className="flex-row flex-wrap gap-2">
          {STYLE_OPTIONS.map((s) => (
            <ToggleChip
              key={s}
              testID={`profile-style-${s}`}
              label={s}
              selected={profile.style.includes(s)}
              onPress={() => update({ ...profile, style: toggleStyle(profile.style, s) })}
            />
          ))}
        </View>
        <AppText variant="caption">AP ou AD direciona os itens sugeridos no draft.</AppText>
      </Card>

      <Card className="gap-2" testID="profile-losses">
        <AppText variant="heading">Contra quem eu mais perco</AppText>
        {losses.length ? (
          losses.map(([id, count]) => (
            <View key={id} className="min-h-touch flex-row items-center gap-3">
              <EntityIcon icon={champ(id)!.icon} name={displayName(champ(id)!)} size={40} />
              <AppText className="flex-1">
                {displayName(champ(id)!)} · {count} {count === 1 ? 'derrota' : 'derrotas'}
              </AppText>
              <Button
                label="Remover"
                kind="ghost"
                accessibilityLabel={`Remover ${displayName(champ(id)!)} do registro`}
                onPress={() => void forgetLoss(store, id).then(setLossLog)}
              />
            </View>
          ))
        ) : (
          <AppText variant="caption">
            Nada registrado. Depois de uma partida, toque em quem te venceu na tela de Draft.
          </AppText>
        )}
        {index ? (
          <Button
            testID="add-loss"
            label="Registrar derrota"
            kind="secondary"
            onPress={() => setPicker('loss')}
          />
        ) : null}
      </Card>

      <Card className="gap-2" testID="profile-history">
        <AppText variant="heading">Histórico de drafts</AppText>
        {drafts.length ? (
          drafts.map((d) => (
            <Pressable
              key={d.id}
              accessibilityRole="button"
              accessibilityLabel={`Abrir draft de ${formatDate(d.createdAt)}`}
              onPress={() => {
                setPendingDraft(d);
                router.push('/draft');
              }}
              className="min-h-touch flex-row items-center gap-1"
            >
              {d.enemies.map((id) =>
                champ(id) ? (
                  <EntityIcon
                    key={id}
                    icon={champ(id)!.icon}
                    name={displayName(champ(id)!)}
                    size={32}
                  />
                ) : null,
              )}
              <AppText variant="caption" className="ml-2">
                {formatDate(d.createdAt)} · patch {d.patch}
              </AppText>
            </Pressable>
          ))
        ) : (
          <AppText variant="caption">Os drafts que você salvar aparecem aqui.</AppText>
        )}
      </Card>

      <Card className="gap-3" testID="profile-privacy">
        <AppText variant="heading">Privacidade</AppText>
        <AppText variant="caption">
          Apaga builds, drafts, derrotas, perfil e preferências deste aparelho, além do que o
          servidor guarda da sua sessão anônima. O catálogo baixado do jogo continua no aparelho.
        </AppText>
        {confirmDelete ? (
          <View className="gap-2" testID="delete-confirm">
            <Banner tone="danger" text="Isso não pode ser desfeito. Apagar tudo?" />
            <Button
              testID="delete-confirm-yes"
              label={deleting ? 'Apagando…' : 'Sim, apagar tudo'}
              kind="danger"
              disabled={deleting}
              onPress={() => void wipe()}
            />
            <Button label="Cancelar" kind="ghost" onPress={() => setConfirmDelete(false)} />
          </View>
        ) : (
          <Button
            testID="delete-data"
            label="Apagar meus dados"
            kind="danger"
            onPress={() => {
              setNotice(null);
              setConfirmDelete(true);
            }}
          />
        )}
        {notice ? (
          <AppText testID="profile-notice" variant="caption">
            {notice}
          </AppText>
        ) : null}
      </Card>

      <EntityPicker
        testID="profile-picker"
        visible={!!picker}
        title={picker === 'main' ? 'Campeão principal' : 'Perdi para'}
        entities={champions.filter((c) => picker !== 'main' || !profile.mains.includes(c.id))}
        detailsKind="champion"
        onClose={() => setPicker(null)}
        onPick={(c) => {
          if (picker === 'main') update({ ...profile, mains: [...profile.mains, c.id] });
          else void recordLoss(store, c.id).then(setLossLog);
          setPicker(null);
        }}
      />
    </Screen>
  );
}
