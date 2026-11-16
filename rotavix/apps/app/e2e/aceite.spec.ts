/**
 * Critério de aceite da Fase 0 (SPEC §11):
 * em modo avião, abrir o app, buscar um ponto e planejar uma rota no GTFS sintético.
 */
import { expect, test } from '@playwright/test';

test('modo avião: abrir, buscar ponto e planejar rota', async ({ page, context }) => {
  const erros: string[] = [];
  page.on('pageerror', (e) => erros.push(e.message));

  // 1) Primeira visita online: baixa os pacotes para o OPFS e instala o service worker.
  await page.goto('/');
  await expect(page.getByTestId('ver-rotas')).toBeVisible();
  await expect(page.getByText('Rede sintética de teste.')).toBeVisible({ timeout: 30_000 });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // O mapa baixa em segundo plano: espera ele estar no OPFS antes de desligar a rede.
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          try {
            const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('pacotes');
            const m = JSON.parse(await (await (await dir.getFileHandle('manifest.json')).getFile()).text());
            return m.pacotes.some((p: { id: string }) => p.id === 'mapa-basico');
          } catch {
            return false; // manifest ainda não existe
          }
        }),
      { timeout: 60_000 },
    )
    .toBe(true);
  await page.reload();
  await expect(page.getByText('Rede sintética de teste.')).toBeVisible();

  // 2) Modo avião.
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('selo-offline')).toBeVisible();
  await expect(page.getByText('Rede sintética de teste.')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  // Base do mapa (OSM via PMTiles) carregada do aparelho: a atribuição só aparece com a fonte vetorial.
  await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('OpenStreetMap', { timeout: 20_000 });

  // 3) Horário fixo (terça, 07:00) para o teste não depender do relógio.
  await page.getByRole('button', { name: 'Escolher horário' }).click();
  await page.getByTestId('campo-horario').fill('2026-11-17T07:00');

  // 4) Buscar pontos (sem acento e com sinônimo) e planejar.
  await page.getByTestId('campo-origem').click();
  await page.getByTestId('campo-busca').fill('jacaraipe');
  await page
    .getByTestId('resultados-busca')
    .getByRole('button', { name: /Jacaraípe/ })
    .click();
  await page.getByTestId('campo-destino').click();
  await page.getByTestId('campo-busca').fill('ufes');
  await page
    .getByTestId('resultados-busca')
    .getByRole('button', { name: /UFES Goiabeiras/ })
    .click();

  await expect(page).toHaveURL(/\/rotas$/);
  const opcoes = page.getByTestId('opcao-rota');
  await expect(opcoes.first()).toBeVisible();
  await expect(opcoes.first()).toContainText('07:00 → 08:12');
  await expect(opcoes.first()).toContainText('Mais rápida');

  // 5) Toda rota explica o porquê.
  await opcoes.first().getByRole('button', { name: 'Por que esta rota?' }).click();
  await expect(opcoes.first().getByTestId('motivos')).toContainText('Baldeação apertada em Terminal Laranjeiras');
  await expect(opcoes.first().getByTestId('motivos')).toContainText('Pela tabela');

  expect(erros).toEqual([]);
});
