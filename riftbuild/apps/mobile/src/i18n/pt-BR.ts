// All user-facing copy lives here (UI in pt-BR; code in English).
export const t = {
  appName: 'RiftBuild',
  tabs: {
    home: 'Início',
    draft: 'Draft',
    builds: 'Builds',
    catalog: 'Catálogo',
    meta: 'Meta',
  },
  nav: {
    profile: 'Perfil',
    about: 'Sobre',
    back: 'Voltar',
  },
  common: {
    loading: 'Carregando…',
    retry: 'Tentar de novo',
    save: 'Salvar',
    cancel: 'Cancelar',
    close: 'Fechar',
    source: 'Fonte',
    collectedAt: 'Coletado em',
    estimated: 'estimado',
    noBackend:
      'Backend não configurado. O catálogo e a IA ficam indisponíveis até configurar o Supabase.',
    offlineAi:
      'A análise com IA precisa de internet. A leitura instantânea acima funciona offline.',
    fixtureBanner: 'DADOS DE TESTE: não são dados reais do Wild Rift.',
    partialBanner: 'Catálogo parcial (dev): faltam dados de algumas fontes.',
    emptyCatalog:
      'Catálogo ainda não disponível. Conecte-se à internet para baixar os dados do patch atual.',
    staleBanner: (dataPatch: string, gamePatch: string) =>
      `Dados do patch ${dataPatch}. O jogo está no patch ${gamePatch}.`,
    longPressHint: 'Toque longo para ver detalhes',
  },
  home: {
    title: 'RiftBuild',
    currentPatch: 'Patch atual',
    analyzeDraft: 'Analisar draft',
    analyzeDraftHint: 'Informe a composição inimiga e receba build, bans e plano de jogo.',
    trending: 'Campeões em alta',
  },
  about: {
    title: 'Sobre',
    legalTitle: 'Aviso legal',
    legalNoticeEn:
      "RiftBuild was created under Riot Games' 'Legal Jibber Jabber' policy using assets owned by Riot Games. Riot Games does not endorse or sponsor this project.",
    legalNoticePt:
      'O RiftBuild é um projeto de fã, gratuito e não oficial. Não é afiliado, endossado nem patrocinado pela Riot Games. League of Legends: Wild Rift e todos os ativos relacionados são propriedade da Riot Games.',
    noPayments: 'O app é gratuito: sem anúncios, sem compras e sem assinatura.',
    sourcesTitle: 'Fontes de dados',
    sourcesIntro:
      'Todos os dados são exclusivamente do Wild Rift. Cada número exibido mostra a fonte e a data da coleta.',
    privacyTitle: 'Privacidade (LGPD)',
    privacyBody:
      'Coletamos o mínimo possível. Builds, histórico de drafts e preferências ficam no seu aparelho. Conta é opcional. Para usar a IA, o app envia ao servidor só a composição do draft e um identificador anônimo, usado para limitar o número de análises por dia.',
    deleteData:
      'Você pode apagar todos os seus dados a qualquer momento em Perfil → Apagar meus dados.',
    version: 'Versão',
  },
} as const;
