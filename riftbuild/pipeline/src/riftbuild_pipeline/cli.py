"""Command-line entry point: `uv run riftbuild <command>`."""

import argparse
import json
import logging
import sys
from pathlib import Path

from .config import OUT_DIR, REPO_ROOT


def _cmd_run(args: argparse.Namespace) -> int:
    from .run import RunOptions, run

    result = run(
        RunOptions(
            out_dir=Path(args.out),
            dry_run=not args.publish,
            limit_champions=args.limit_champions,
            skip_icons=args.skip_icons,
            max_requests=args.max_requests,
        )
    )
    report = result.report
    print(
        f"patch={report.info.get('patch')} counts={report.info.get('counts')} meta={report.info.get('meta_counts')}"
    )
    print(f"requests={report.info.get('requests_made')} catalog={result.catalog_hash} meta={result.meta_hash}")
    print(f"blocking={len(report.blocking)} warnings={len(report.warnings)} published={result.published}")
    for line in report.blocking[:50]:
        print(f"  BLOCK {line}")
    for note in result.notes:
        print(f"  NOTE {note}")
    return 0 if report.ok else 1


def _cmd_detect_patch(_args: argparse.Namespace) -> int:
    from .http.client import PoliteClient
    from .sources.official import detect_patch

    client = PoliteClient()
    ref, fetched_at = detect_patch(client)
    print(
        json.dumps(
            {
                "version": ref.version if ref else None,
                "url": ref.url if ref else None,
                "checked_at": fetched_at,
            }
        )
    )
    return 0 if ref else 1


def _cmd_export_schema(args: argparse.Namespace) -> int:
    from .models import CatalogBundle, Manifest, MetaBundle

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    for name, model in (
        ("catalog-bundle", CatalogBundle),
        ("meta-bundle", MetaBundle),
        ("manifest", Manifest),
    ):
        schema = model.model_json_schema(mode="serialization")
        (out / f"{name}.schema.json").write_text(json.dumps(schema, indent=2, sort_keys=True) + "\n")
    print(f"wrote schemas to {out}")
    return 0


def _cmd_explore(_args: argparse.Namespace) -> int:
    from .explore import explore

    explore()
    return 0


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    parser = argparse.ArgumentParser(prog="riftbuild", description="RiftBuild data pipeline (Wild Rift only)")
    sub = parser.add_subparsers(dest="command", required=True)

    p_run = sub.add_parser("run", help="fetch, normalize, validate and write bundles (dry run unless --publish)")
    p_run.add_argument("--out", default=str(OUT_DIR))
    p_run.add_argument("--publish", action="store_true", help="upload to Supabase when checks pass")
    p_run.add_argument("--limit-champions", type=int, default=None, help="dev only: marks the bundle partial")
    p_run.add_argument("--skip-icons", action="store_true", help="dev only: marks the bundle partial")
    p_run.add_argument("--max-requests", type=int, default=1600)
    p_run.set_defaults(func=_cmd_run)

    sub.add_parser("detect-patch", help="print the current patch from the official site").set_defaults(
        func=_cmd_detect_patch
    )
    p_schema = sub.add_parser("export-schema", help="write JSON Schemas for the published bundles")
    p_schema.add_argument("--out", default=str(REPO_ROOT / "contracts" / "schema"))
    p_schema.set_defaults(func=_cmd_export_schema)
    sub.add_parser("explore", help="check robots.txt of every source and write docs/sources.md").set_defaults(
        func=_cmd_explore
    )

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
