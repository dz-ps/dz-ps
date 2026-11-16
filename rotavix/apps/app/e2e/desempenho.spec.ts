/**
 * Desempenho com CPU 4x mais lenta (CDP), aproximando um Android de entrada.
 * Metas (SPEC §7): rota offline < 700 ms; conteúdo útil antes do mapa terminar.
 * Na rede sintética os números são otimistas; na Fase 1 este teste roda com a rede real.
 */
import { expect, test } from '@playwright/test';

test.skip(({ browserName }) => browserName !== 'chromium', 'CDP só no Chromium');

test('CPU 4x: primeira tela e cálculo de rota', async ({ page }, info) => {
  test.skip(info.project.name !== 'celular');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });

  const t0 = Date.now();
  await page.goto('/');
  await expect(page.getByTestId('campo-destino')).toBeVisible();
  const primeiraTela = Date.now() - t0;
  await expect(page.getByText('Rede sintética de teste.')).toBeVisible({ timeout: 60_000 });
  const dadosProntos = Date.now() - t0;

  await page.getByRole('button', { name: 'Escolher horário' }).click();
  await page.getByTestId('campo-horario').fill('2026-11-17T17:20');
  await page.getByTestId('campo-origem').click();
  await page.getByTestId('campo-busca').fill('campo grande');
  await page
    .getByTestId('resultados-busca')
    .getByRole('button', { name: /Terminal Campo Grande/ })
    .click();
  await page.getByTestId('campo-destino').click();
  await page.getByTestId('campo-busca').fill('praca do papa');
  await page
    .getByTestId('resultados-busca')
    .getByRole('button', { name: /^Praça do Papa/ })
    .click();
  await expect(page.getByTestId('opcao-rota').first()).toBeVisible();
  const planejar = await page.evaluate(() => performance.getEntriesByName('rotavix:planejar').at(-1)?.duration ?? -1);

  const r = { primeiraTelaMs: primeiraTela, dadosProntosMs: dadosProntos, planejarMs: Math.round(planejar) };
  console.log('Desempenho (CPU 4x, rede 3G rápida):', JSON.stringify(r));
  await info.attach('desempenho.json', { body: JSON.stringify(r, null, 2), contentType: 'application/json' });
  expect(planejar).toBeGreaterThan(0);
  expect(planejar).toBeLessThan(700);
});
