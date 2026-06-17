# Como instalar este perfil (3 passos)

Repositório do perfil: **github.com/dz-ps/dz-ps**
(o repositório precisa ter exatamente o mesmo nome do seu usuário)

## 1. Copie os arquivos para o repositório, mantendo a estrutura:
```
dz-ps/
├── README.md
├── assets/
│   ├── header.svg        ← banner animado (glitch + chuva de código)
│   └── terminal.svg      ← terminal que se digita sozinho
└── .github/
    └── workflows/
        └── snake.yml      ← gera a cobrinha das contribuições
```

## 2. Ative a cobrinha 🐍
- Faça commit do `snake.yml`
- Vá em **Actions** (no seu repositório) → **"Generate Snake Animation"** → **Run workflow**
- Depois que rodar, ela aparece sozinha e atualiza a cada 12h

## 3. Personalize (procure por estes textos no README e troque):
- `SEU_ID_HTB`        → ID do seu perfil no Hack The Box
- `SEU_USUARIO_THM`   → seu usuário no TryHackMe
- `SEU_EMAIL@exemplo.com` → seu e-mail (ou remova a linha)
- Tabela de **Certificações** → marque ✅ o que você já tem

## Observações
- Se a sua branch principal for **master**, troque `/main/` por `/master/` nas URLs.
- Se alguma animação não aparecer pela URL `raw.githubusercontent`, troque por caminho
  relativo, ex.: `![header](./assets/header.svg)`.
- O cache de imagem do GitHub (camo) pode levar alguns minutos para atualizar.
