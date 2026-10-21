# Fontes de dados: evidência de robots.txt

Gerado por `uv run riftbuild explore` em 2026-10-21T04:14:40Z.
Regra (RFC 9309): 2xx = obedecer; 4xx = sem restrições; 5xx/erro = não coletar nesta execução.

| Fonte | URL | Uso | robots.txt | Decisão |
| --- | --- | --- | --- | --- |
| Site oficial do Wild Rift | https://wildrift.leagueoflegends.com/ | Patch, campeões, nomes pt-BR, habilidades, ícones | parsed (HTTP 200) | coletar |
| League of Legends Wiki | https://wiki.leagueoflegends.com/ | Plano: itens/runas/feitiços (páginas WR:) | unreachable (HTTP 502) | NÃO coletar |
| Rift Patch Notes | https://www.riftpatchnotes.com/ | Itens, runas, feitiços, meta (CN Diamante+), builds | parsed (HTTP 200) | coletar |
| Riot CMS assets | https://cmsassets.rgpub.io/ | Imagens referenciadas pelo site oficial | missing (HTTP 404) | coletar |

Termos de uso: riftpatchnotes.com não publica termos de uso (só /privacy); o robots.txt permite todos
os agentes, inclusive ClaudeBot. O site oficial permite tudo no robots.txt; os ativos são usados sob a
política Legal Jibber Jabber da Riot. A wiki (CC BY-SA 3.0) estava em manutenção (HTTP 502) e não foi
coletada.

## robots.txt (trechos)

### wildrift.leagueoflegends.com (parsed, HTTP 200, 2026-10-21T04:14:40Z)

    User-agent: *
    Allow: /
    
    Sitemap: https://wildrift.leagueoflegends.com/sitemap_index.xml

### wiki.leagueoflegends.com (unreachable, HTTP 502, 2026-10-21T04:14:41Z)

    <html lang="en">
        <head>
            <title>Server maintenance</title>
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <style>
                @font-face {
                    font-family: 'Noto Sans';
                    src: url('data:font/woff2;base64,d09GMgABAAAAADNAABA

### www.riftpatchnotes.com (parsed, HTTP 200, 2026-10-21T04:14:41Z)

    User-agent: *
    Allow: /
    
    User-agent: GPTBot
    Allow: /
    
    User-agent: ChatGPT-User
    Allow: /
    
    User-agent: OAI-SearchBot
    Allow: /
    
    User-agent: ClaudeBot
    Allow: /
    
    User-agent: Claude-Web
    Allow: /
    
    User-agent: anthropic-ai
    Allow: /
    
    User-agent: PerplexityBot
    Allow: /
    
    User-agent: Applebot-Extended
    Allow: /
    
    User-agent: Google-Extended
    Allow: /
    
    User-agent: Bytespider
    Allow: /
    
 

### cmsassets.rgpub.io (missing, HTTP 404, 2026-10-21T04:14:42Z)

    Not Found
