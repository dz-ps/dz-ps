// Per-screen assertions for scripts/web-smoke.mjs. Each check gets a Playwright page.
const LEGAL_NOTICE =
  "RiftBuild was created under Riot Games' 'Legal Jibber Jabber' policy using assets owned by Riot Games.";

async function expectText(page, text, timeout = 10_000) {
  await page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout });
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
];
