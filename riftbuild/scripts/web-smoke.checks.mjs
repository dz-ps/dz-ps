// Per-screen assertions for scripts/web-smoke.mjs. `realData: true` checks run only against pipeline output.
const LEGAL_NOTICE =
  "RiftBuild was created under Riot Games' 'Legal Jibber Jabber' policy using assets owned by Riot Games.";

async function expectText(page, text, timeout = 15_000) {
  await page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout });
}

async function expectTestId(page, id, timeout = 15_000) {
  await page.getByTestId(id).first().waitFor({ state: 'visible', timeout });
}

export const CHECKS = [
  {
    name: 'about',
    path: '/about',
    async run(page) {
      await expectText(page, LEGAL_NOTICE);
      await expectText(page, 'CC BY-SA 3.0');
      await expectText(page, 'não oficial');
    },
  },
  {
    name: 'home',
    path: '/',
    async run(page) {
      await expectText(page, 'Analisar draft');
    },
  },
  {
    name: 'catalog-champions',
    path: '/catalog',
    async run(page, { realData }) {
      await expectTestId(page, 'catalog-tabs');
      if (realData) {
        await expectTestId(page, 'champion-amumu');
        await page.getByTestId('catalog-search').fill('mumu');
        await expectTestId(page, 'champion-amumu');
        await page.getByTestId('catalog-search').fill('');
      }
    },
  },
  {
    name: 'catalog-items',
    path: '/catalog',
    realData: true,
    async run(page) {
      await page.getByRole('tab', { name: 'Itens' }).click();
      await expectTestId(page, 'item-row-infinity_edge');
    },
  },
  {
    name: 'item-detail',
    path: '/item/infinity_edge',
    realData: true,
    async run(page) {
      await expectTestId(page, 'recipe-infinity_edge');
      await expectText(page, 'Fonte: Rift Patch Notes');
    },
  },
  {
    name: 'champion-detail',
    path: '/champion/mel',
    realData: true,
    async run(page) {
      await expectTestId(page, 'ability-W');
      await expectText(page, 'Bloqueio de projéteis');
    },
  },
  {
    name: 'build-editor',
    path: '/build/new',
    realData: true,
    async run(page) {
      await expectTestId(page, 'slot-0');
      await page.getByTestId('slot-0').click();
      await page.getByTestId('item-picker-search').fill('mercury');
      await page.getByTestId('item-picker-mercurys_treads').click();
      await page.getByTestId('slot-1').click();
      await page.getByTestId('item-picker-search').fill('plated');
      await page.getByTestId('item-picker-plated_steelcaps').click();
      await expectTestId(page, 'blocked-message');
      await expectText(page, 'Só é possível usar uma bota.');
    },
  },
  {
    name: 'meta-tierlist',
    path: '/meta',
    realData: true,
    async run(page) {
      await expectTestId(page, 'tier-list');
      await expectText(page, 'Fonte: Rift Patch Notes');
    },
  },
  {
    name: 'meta-changes',
    path: '/meta',
    realData: true,
    async run(page) {
      await page.getByRole('tab', { name: 'O que mudou' }).click();
      await expectTestId(page, 'change-volibear');
    },
  },
  {
    name: 'bans',
    path: '/bans',
    realData: true,
    async run(page) {
      await expectText(page, 'de vitória');
    },
  },
];
