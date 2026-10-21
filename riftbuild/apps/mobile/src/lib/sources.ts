// Data sources shown on the About screen (spec §8: visible attribution for every source).
export type DataSource = {
  id: 'wr_official' | 'lol_wiki' | 'riftpatchnotes';
  name: string;
  url: string;
  usedFor: string;
  license: string;
  licenseUrl?: string;
};

export const DATA_SOURCES: readonly DataSource[] = [
  {
    id: 'wr_official',
    name: 'Site oficial do Wild Rift',
    url: 'https://wildrift.leagueoflegends.com/pt-br/',
    usedFor:
      'Patch atual, notas de patch, lista de campeões, nomes em pt-BR, habilidades e ícones.',
    license: '© Riot Games. Usado conforme a política "Legal Jibber Jabber".',
    licenseUrl: 'https://www.riotgames.com/en/legal',
  },
  {
    id: 'lol_wiki',
    name: 'League of Legends Wiki (páginas "WR:")',
    url: 'https://wiki.leagueoflegends.com/en-us/',
    usedFor: 'Itens, runas, feitiços e valores do Wild Rift.',
    license: 'Texto sob CC BY-SA 3.0. Conteúdo adaptado, com créditos aos autores da wiki.',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
  },
  {
    id: 'riftpatchnotes',
    name: 'Rift Patch Notes',
    url: 'https://www.riftpatchnotes.com',
    usedFor:
      'Estatísticas de meta (taxas de vitória, escolha e banimento; partidas Diamante+ do servidor CN) e dados de itens, runas e feitiços quando a wiki está indisponível.',
    license: 'Dados da comunidade, coletados respeitando o robots.txt, com fonte e data exibidas.',
  },
] as const;
