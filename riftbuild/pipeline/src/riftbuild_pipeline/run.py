"""Pipeline orchestration: fetch -> normalize -> validate -> diff -> publish (spec §4.3)."""

import gzip
import json
import logging
import subprocess
from dataclasses import dataclass, field
from pathlib import Path

import httpx
import yaml

from .bundle import carry_forward_collected_at, encode_bundle
from .config import DATA_DIR, OUT_DIR, REPO_ROOT, HttpConfig
from .http.client import PoliteClient, SourceDisallowedError, now_iso
from .icons import IconStore
from .ids import slugify
from .models import (
    CatalogBundle,
    GamePatchInfo,
    Manifest,
    ManifestEntry,
    MetaBundle,
    SourceStatus,
)
from .normalize import misc
from .normalize.champions import ChampionInputs, build_champion
from .normalize.items import build_items
from .publish.storage import SupabaseTarget
from .rules import build_rules
from .sources import official
from .sources import riftpatchnotes as rpn
from .validate.checks import Report, check_catalog, check_meta

log = logging.getLogger("riftbuild")
GENERATED_BY = "riftbuild-pipeline/0.1"
ICON_SOURCE_PREFIX = "src:"


@dataclass
class RunOptions:
    out_dir: Path = OUT_DIR
    dry_run: bool = True
    limit_champions: int | None = None
    skip_icons: bool = False
    max_requests: int = 1600


@dataclass
class RunResult:
    report: Report
    catalog_hash: str | None = None
    meta_hash: str | None = None
    published: bool = False
    notes: list[str] = field(default_factory=list)


def _source_statuses(client: PoliteClient) -> list[SourceStatus]:
    statuses = []
    for source_id, url in (
        ("wr_official", "https://wildrift.leagueoflegends.com/"),
        ("lol_wiki", "https://wiki.leagueoflegends.com/"),
        ("riftpatchnotes", "https://www.riftpatchnotes.com/"),
    ):
        verdict = client.robots(url)
        if verdict.status == "unreachable":
            status, note = (
                "disallowed",
                f"robots.txt answered HTTP {verdict.http_status}: per RFC 9309 not crawled",
            )
        elif source_id == "lol_wiki":
            status, note = "skipped", "not needed this run: items/runes/spells come from Rift Patch Notes"
        else:
            status, note = "used", None
        statuses.append(
            SourceStatus(
                id=source_id,
                status=status,
                robots=f"{verdict.status} (HTTP {verdict.http_status})",
                checked_at=verdict.fetched_at,
                note=note,
            )
        )
    return statuses


def _load_previous(out_dir: Path) -> tuple[dict | None, dict | None]:
    """Previous bundles for the diff checks: local output first, then the currently published release."""

    def read(path: Path) -> dict | None:
        return json.loads(path.read_text()) if path.exists() else None

    local = read(out_dir / "catalog" / "latest.json"), read(out_dir / "meta" / "latest.json")
    if local[0] is not None:
        return local
    target = SupabaseTarget.from_env()
    if target is None:
        return local
    try:
        manifest = httpx.get(target.public_url("catalog", "manifest.json"), timeout=30).json()
        bundles = []
        for kind in ("catalog", "meta"):
            entry = manifest.get(kind)
            data = httpx.get(target.public_url("catalog", entry["path"]), timeout=60).content if entry else None
            bundles.append(json.loads(gzip.decompress(data)) if data else None)
        return bundles[0], bundles[1]
    except (httpx.HTTPError, ValueError, KeyError, OSError) as exc:
        log.warning("could not load the published release for diffing: %s", exc)
        return local


def _load_aliases(champion_ids: set[str], warnings: list[str]) -> dict[str, str]:
    seed = yaml.safe_load((DATA_DIR / "aliases.seed.yaml").read_text()) or {}
    aliases = {}
    for alias, target in seed.items():
        if target in champion_ids:
            aliases[str(alias).lower()] = target
        else:
            warnings.append(f"alias {alias!r} -> {target!r}: champion not in catalog (dropped)")
    return aliases


def run(options: RunOptions) -> RunResult:
    client = PoliteClient(HttpConfig(max_requests=options.max_requests))
    report = Report()
    warnings = report.warnings
    icons = IconStore(options.out_dir / "icons")
    try:
        sources = _source_statuses(client)
        patch_ref, detected_at = official.detect_patch(client)
        if patch_ref is None:
            report.blocking.append("could not detect the current patch from the official sitemap")
            return RunResult(report)
        patch = patch_ref.version
        log.info("current patch: %s (%s)", patch, patch_ref.url)

        # Rift Patch Notes list pages
        items_page = rpn.fetch_page(client, "/items")
        items_payload = rpn.parse_items(items_page)
        runes_page = rpn.fetch_page(client, "/runes")
        raw_runes, rune_rule_text = rpn.parse_runes(runes_page)
        spells_page = rpn.fetch_page(client, "/spells")
        raw_spells = rpn.parse_spells(spells_page)
        winrates_page = rpn.fetch_page(client, "/winrates")
        winrates = rpn.parse_winrates(winrates_page)
        builds_page = rpn.fetch_page(client, "/builds")
        builds = rpn.parse_builds(builds_page)

        latest = items_payload.get("latestPatch") or {}
        if latest.get("version") and latest["version"] != patch:
            warnings.append(f"Rift Patch Notes is on patch {latest['version']}, official site says {patch}")

        # Champions
        cards_en, _, _ = official.fetch_champion_list(client, "en-us")
        cards_pt, _, _ = official.fetch_champion_list(client, "pt-br")
        pt_by_slug = {c.slug: c for c in cards_pt}
        rpn_by_slug = {b["slug"]: b for b in builds}
        rpn_by_norm = {slugify(b["slug"].replace("-", " ")): b for b in builds}
        rpn_by_name = {slugify(b["name"]): b for b in builds if b.get("name")}
        if options.limit_champions:
            cards_en = cards_en[: options.limit_champions]

        champions = []
        champ_slug_to_id: dict[str, str] = {}
        for card in cards_en:
            try:
                en_page = official.fetch_champion_page(client, card.page_url)
            except httpx.HTTPStatusError as exc:
                warnings.append(f"champion {card.slug}: official page failed ({exc}); champion skipped")
                continue
            pt_card = pt_by_slug.get(card.slug)
            pt_page = None
            if pt_card is None:
                warnings.append(f"champion {card.slug}: not on the pt-BR champion list")
            else:
                try:
                    pt_page = official.fetch_champion_page(client, pt_card.page_url)
                except httpx.HTTPStatusError as exc:
                    warnings.append(
                        f"champion {card.slug}: pt-BR page failed ({exc}); pt-BR ability names missing"
                    )
            rpn_entry = (
                rpn_by_slug.get(card.slug)
                or rpn_by_norm.get(slugify(card.slug.replace("-", " ")))
                or rpn_by_name.get(slugify(card.title_upper))
            )
            rpn_detail = None
            if rpn_entry:
                try:
                    rpn_detail = rpn.parse_champion(rpn.fetch_page(client, f"/champion/{rpn_entry['slug']}"))
                except Exception as exc:
                    warnings.append(f"champion {card.slug}: Rift Patch Notes detail failed: {exc}")
            else:
                warnings.append(f"champion {card.slug}: not found on Rift Patch Notes")
            icon = None if options.skip_icons else icons.fetch(client, card.card_url, crop_top_square=True)
            ability_icons = {}
            if not options.skip_icons:
                for ab in en_page.abilities:
                    key = {"PASSIVE": "P", "1": "Q", "2": "W", "3": "E", "ULTIMATE": "R"}.get(ab.slot)
                    if key:
                        ability_icons[key] = icons.fetch(client, ab.icon_url)
            result = build_champion(
                ChampionInputs(
                    official_slug=card.slug,
                    en=en_page,
                    pt=pt_page,
                    pt_title_upper=pt_card.title_upper if pt_card else None,
                    rpn=rpn_detail,
                    rpn_name=rpn_entry.get("name") if rpn_entry else None,
                    rpn_roles=list(rpn_entry.get("roles") or []) if rpn_entry else [],
                    icon=icon,
                    ability_icons=ability_icons,
                ),
                patch,
            )
            warnings.extend(result.warnings)
            champions.append(result.champion)
            if rpn_entry:
                champ_slug_to_id[rpn_entry["slug"]] = result.champion.id
            champ_slug_to_id[card.slug] = result.champion.id
        champions.sort(key=lambda c: c.id)

        # Items, runes, spells
        items_result = build_items(items_payload, patch, items_page.url, items_page.fetched_at)
        warnings.extend(items_result.warnings)
        runes, rune_warnings = misc.build_runes(raw_runes, patch, runes_page.url, runes_page.fetched_at)
        warnings.extend(rune_warnings)
        spells = misc.build_spells(raw_spells, patch, spells_page.url, spells_page.fetched_at)
        if not options.skip_icons:
            for entity in [*items_result.items, *runes, *spells]:
                entity.icon = icons.fetch(client, entity.icon)

        rules_result = build_rules(misc.build_rune_rule(rune_rule_text))
        report.blocking.extend(rules_result.blocking)
        warnings.extend(rules_result.warnings)

        patch_info = misc.build_patch(
            patch,
            latest.get("date") or (patch_ref.lastmod or "")[:10] or None,
            patch_ref.url,
            latest,
            items_result.slug_to_id,
            champ_slug_to_id,
            items_page.url,
            items_page.fetched_at,
        )
        aliases = _load_aliases({c.id for c in champions}, warnings)

        catalog = CatalogBundle(
            patch=patch,
            partial=bool(options.limit_champions or options.skip_icons),
            generated_by=GENERATED_BY,
            sources=sources,
            champions=champions,
            items=items_result.items,
            runes=runes,
            summoner_spells=spells,
            patches=[patch_info],
            rules=rules_result.rules,
            aliases=aliases,
        )

        meta_result = misc.build_meta(
            winrates,
            builds,
            champ_slug_to_id,
            items_result.name_to_id,
            patch,
            winrates_page.url,
            builds_page.url,
            winrates_page.fetched_at,
        )
        warnings.extend(meta_result.warnings)
        meta = MetaBundle(
            patch=patch,
            rank_tiers=meta_result.rank_tiers,
            stats=meta_result.stats,
            builds=meta_result.builds,
            source_url=winrates_page.url,
            source_name="Rift Patch Notes",
            source_note="Partidas ranqueadas do servidor CN (Diamante+ até Fila Lendária), atualizado diariamente.",
            collected_at=meta_result.stats[0].collected_at if meta_result.stats else winrates_page.fetched_at,
        )
    except SourceDisallowedError as exc:
        report.blocking.append(f"source disallowed: {exc}")
        return RunResult(report)
    finally:
        client.close()
        icons.write_index()

    if icons.failures:
        warnings.extend(f"icon download failed: {f}" for f in icons.failures)

    previous_catalog, _previous_meta = _load_previous(options.out_dir)
    catalog = _carry_forward(catalog, previous_catalog)

    cat_report = check_catalog(
        catalog,
        CatalogBundle.model_validate(previous_catalog)
        if previous_catalog and not previous_catalog.get("partial")
        else None,
    )
    meta_report = check_meta(meta, catalog)
    report.blocking.extend(cat_report.blocking + meta_report.blocking)
    report.warnings.extend(cat_report.warnings + meta_report.warnings)
    report.info.update(cat_report.info)
    report.info["meta_counts"] = meta_report.info.get("counts")
    report.info["requests_made"] = client.requests_made
    report.info["patch"] = patch
    report.info["patch_notes"] = patch_ref.url

    result = RunResult(report)
    result.catalog_hash, result.meta_hash = _write_outputs(options.out_dir, catalog, meta, patch_ref, detected_at)

    zod_ok, zod_msg = zod_gate(
        options.out_dir / "catalog" / "latest.json", options.out_dir / "meta" / "latest.json"
    )
    if not zod_ok:
        report.blocking.append(f"zod gate failed: {zod_msg}")
    else:
        report.info["zod_gate"] = zod_msg

    write_report(options.out_dir, report)
    if report.ok and not options.dry_run:
        target = SupabaseTarget.from_env()
        if target is None:
            result.notes.append("BLOCKED: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set; dry run only")
        else:
            publish(target, options.out_dir, catalog, meta, patch_ref, detected_at)
            result.published = True
    return result


def _carry_forward(catalog: CatalogBundle, previous: dict | None) -> CatalogBundle:
    if not previous or previous.get("patch") != catalog.patch:
        return catalog
    data = catalog.model_dump(mode="json")
    for kind in ("champions", "items", "runes", "summoner_spells"):
        data[kind] = carry_forward_collected_at(data[kind], previous.get(kind, []))
    return CatalogBundle.model_validate(data)


def _write_outputs(out_dir: Path, catalog, meta, patch_ref, detected_at: str) -> tuple[str, str]:
    cat_raw, cat_gz, cat_hash = encode_bundle(catalog)
    meta_raw, meta_gz, meta_hash = encode_bundle(meta)
    now = now_iso()
    entries = {}
    for kind, raw, gz, digest in (
        ("catalog", cat_raw, cat_gz, cat_hash),
        ("meta", meta_raw, meta_gz, meta_hash),
    ):
        folder = out_dir / kind / catalog.patch
        folder.mkdir(parents=True, exist_ok=True)
        hex_digest = digest.removeprefix("sha256:")
        (folder / f"{hex_digest}.json.gz").write_bytes(gz)
        (out_dir / kind / "latest.json").write_bytes(raw)
        entries[kind] = ManifestEntry(
            patch=catalog.patch,
            hash=digest,
            path=f"{kind}/{catalog.patch}/{hex_digest}.json.gz",
            bytes=len(gz),
            published_at=now,
        )
    manifest = Manifest(
        game_patch=GamePatchInfo(version=patch_ref.version, source_url=patch_ref.url, detected_at=detected_at),
        catalog=entries["catalog"],
        meta=entries["meta"],
        icons_base="icons/",
        verified_at=now,
    )
    (out_dir / "manifest.json").write_text(manifest.model_dump_json(indent=2))
    return cat_hash, meta_hash


def zod_gate(*paths: Path) -> tuple[bool, str]:
    """Validate the bundles with the app's real zod schemas before anything is published."""
    script = REPO_ROOT / "scripts" / "validate-bundle.mjs"
    if not script.exists():
        return False, "scripts/validate-bundle.mjs not found"
    proc = subprocess.run(
        ["node", str(script), *map(str, paths)], capture_output=True, text=True, cwd=REPO_ROOT, check=False
    )
    return proc.returncode == 0, (proc.stdout + proc.stderr).strip()[-2000:]


def write_report(out_dir: Path, report: Report) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    data = {"ok": report.ok, "blocking": report.blocking, "warnings": report.warnings, "info": report.info}
    (out_dir / "report.json").write_text(json.dumps(data, indent=2, ensure_ascii=False))
    lines = [
        "# Relatório do pipeline",
        "",
        f"- Resultado: **{'OK' if report.ok else 'BLOQUEADO'}**",
        f"- Patch: {report.info.get('patch')}",
        f"- Contagens: {report.info.get('counts')}",
        f"- Meta: {report.info.get('meta_counts')}",
        f"- Requisições: {report.info.get('requests_made')}",
        "",
        f"## Bloqueios ({len(report.blocking)})",
        *[f"- {b}" for b in report.blocking],
        "",
        f"## Avisos ({len(report.warnings)})",
        *[f"- {w}" for w in report.warnings],
    ]
    (out_dir / "report.md").write_text("\n".join(lines) + "\n")


def publish(target: SupabaseTarget, out_dir: Path, catalog, meta, patch_ref, detected_at: str) -> None:
    """Upload icons, then immutable bundles, then the manifest last (atomic from the app's view)."""
    for icon in sorted((out_dir / "icons").glob("*.webp")):
        if not target.exists("icons", icon.name):
            target.upload(
                "icons", icon.name, icon.read_bytes(), "image/webp", "public, max-age=31536000, immutable"
            )
    manifest = json.loads((out_dir / "manifest.json").read_text())
    for kind in ("catalog", "meta"):
        entry = manifest[kind]
        data = (out_dir / entry["path"]).read_bytes()
        target.upload("catalog", entry["path"], data, "application/gzip", "public, max-age=31536000, immutable")
        target.insert(
            "catalog_releases",
            {
                "kind": kind,
                "patch": entry["patch"],
                "hash": entry["hash"],
                "storage_path": entry["path"],
                "bytes": entry["bytes"],
                "schema_version": 1,
                "status": "published",
                "validation_report": json.loads((out_dir / "report.json").read_text()),
            },
        )
    manifest["icons_base"] = target.public_url("icons", "")
    target.upload(
        "catalog", "manifest.json", json.dumps(manifest).encode(), "application/json", "public, max-age=60"
    )
    target.insert(
        "game_state",
        {
            "id": 1,
            "current_game_patch": patch_ref.version,
            "source_url": patch_ref.url,
            "detected_at": detected_at,
        },
        upsert_on="id",
    )


def read_gz_json(path: Path) -> dict:
    return json.loads(gzip.decompress(path.read_bytes()))
