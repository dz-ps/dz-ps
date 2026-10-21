"""`riftbuild explore`: record robots.txt evidence for every source in docs/sources.md."""

from .config import REPO_ROOT
from .http.client import PoliteClient, now_iso

SOURCES = [
    (
        "Site oficial do Wild Rift",
        "https://wildrift.leagueoflegends.com/",
        "Patch, campeões, nomes pt-BR, habilidades, ícones",
    ),
    (
        "League of Legends Wiki",
        "https://wiki.leagueoflegends.com/",
        "Plano: itens/runas/feitiços (páginas WR:)",
    ),
    (
        "Rift Patch Notes",
        "https://www.riftpatchnotes.com/",
        "Itens, runas, feitiços, meta (CN Diamante+), builds",
    ),
    ("Riot CMS assets", "https://cmsassets.rgpub.io/", "Imagens referenciadas pelo site oficial"),
]


def explore() -> None:
    client = PoliteClient()
    lines = [
        "# Fontes de dados: evidência de robots.txt",
        "",
        f"Gerado por `uv run riftbuild explore` em {now_iso()}.",
        "Regra (RFC 9309): 2xx = obedecer; 4xx = sem restrições; 5xx/erro = não coletar nesta execução.",
        "",
        "| Fonte | URL | Uso | robots.txt | Decisão |",
        "| --- | --- | --- | --- | --- |",
    ]
    for name, url, use in SOURCES:
        verdict = client.robots(url)
        allowed = verdict.allows(url)
        decision = "coletar" if allowed else "NÃO coletar"
        lines.append(f"| {name} | {url} | {use} | {verdict.status} (HTTP {verdict.http_status}) | {decision} |")
    lines += [
        "",
        "Termos de uso: riftpatchnotes.com não publica termos de uso (só /privacy); o robots.txt permite todos",
        "os agentes, inclusive ClaudeBot. O site oficial permite tudo no robots.txt; os ativos são usados sob a",
        "política Legal Jibber Jabber da Riot. A wiki (CC BY-SA 3.0) estava em manutenção (HTTP 502) e não foi",
        "coletada.",
        "",
        "## robots.txt (trechos)",
    ]
    for verdict in client.robots_verdicts():
        excerpt = verdict.body_excerpt.strip().replace("\n", "\n    ")[:500]
        lines += [
            "",
            f"### {verdict.host} ({verdict.status}, HTTP {verdict.http_status}, {verdict.fetched_at})",
            "",
            f"    {excerpt}",
        ]
    (REPO_ROOT / "docs" / "sources.md").write_text("\n".join(lines) + "\n")
    print("wrote docs/sources.md")
