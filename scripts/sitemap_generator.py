import argparse
import datetime as dt
import os
import re
from pathlib import Path
from urllib.parse import urljoin

DEFAULT_EXCLUDE_PREFIXES = (
    "/api",
    "/admin",
    "/internal",
    "/private",
    "/_",
)

ROUTE_REGEXES = [
    # React Router v6-ish: { path: "/foo" }
    re.compile(r"""path\s*:\s*["'](/[^"']*)["']"""),
    # <Route path="/foo" ...>
    re.compile(r"""<Route[^>]*\spath\s*=\s*["'](/[^"']*)["']"""),
]

def norm_path(p: str) -> str:
    if not p.startswith("/"):
        p = "/" + p
    # collapse double slashes
    while "//" in p:
        p = p.replace("//", "/")
    # remove trailing slash except root
    if len(p) > 1 and p.endswith("/"):
        p = p[:-1]
    return p

def should_include(path: str, exclude_prefixes: tuple[str, ...], exclude_regexes: list[re.Pattern]) -> bool:
    if not path.startswith("/"):
        return False
    if "*" in path:
        return False
    # Skip parameterized routes like /user/:id
    if "/:" in path or path.endswith("/:id"):
        return False
    # Skip obvious file refs
    if "." in path.split("/")[-1] and path not in ("/.well-known",):
        return False
    for pref in exclude_prefixes:
        if path == pref or path.startswith(pref + "/"):
            return False
    for rx in exclude_regexes:
        if rx.search(path):
            return False
    return True

def discover_routes(frontend_src: Path) -> set[str]:
    routes: set[str] = set()
    if not frontend_src.exists():
        return routes

    for ext in ("*.js", "*.jsx", "*.ts", "*.tsx"):
        for fp in frontend_src.rglob(ext):
            try:
                txt = fp.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                continue
            for rx in ROUTE_REGEXES:
                for m in rx.finditer(txt):
                    routes.add(norm_path(m.group(1)))
    return routes

def build_sitemap_xml(base_url: str, paths: list[str], today: str) -> str:
    base_url = base_url.rstrip("/") + "/"
    items = []
    for p in paths:
        loc = urljoin(base_url, p.lstrip("/"))
        items.append(
            "  <url>\n"
            f"    <loc>{loc}</loc>\n"
            f"    <lastmod>{today}</lastmod>\n"
            "    <changefreq>daily</changefreq>\n"
            "    <priority>0.7</priority>\n"
            "  </url>"
        )

    return (
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
            + "\n".join(items)
            + "\n</urlset>\n"
    )

def write_file(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")

def main() -> int:
    ap = argparse.ArgumentParser(description="Generate sitemap.xml for Webcrafters Studio")
    ap.add_argument("--base-url", required=True, help="e.g. https://studio.webcrafters.be")
    ap.add_argument("--repo-root", default=".", help="path to repo root (default: .)")
    ap.add_argument("--public-dir", default="frontend/public", help="relative path to frontend public dir")
    ap.add_argument("--src-dir", default="frontend/src", help="relative path to frontend src dir")
    ap.add_argument("--extra", action="append", default=[], help="extra routes to include, can be repeated")
    ap.add_argument("--exclude-prefix", action="append", default=[], help="exclude route prefix, can be repeated")
    ap.add_argument("--exclude-regex", action="append", default=[], help="exclude regex (python), can be repeated")
    args = ap.parse_args()

    repo_root = Path(args.repo_root).resolve()
    public_dir = (repo_root / args.public_dir).resolve()
    src_dir = (repo_root / args.src_dir).resolve()

    exclude_prefixes = tuple(DEFAULT_EXCLUDE_PREFIXES + tuple(args.exclude_prefix))
    exclude_regexes = [re.compile(x) for x in args.exclude_regex]

    routes = discover_routes(src_dir)

    # Always include homepage
    routes.add("/")

    # Add extras explicitly
    for p in args.extra:
        routes.add(norm_path(p))

    # Filter + sort
    filtered = sorted({r for r in routes if should_include(r, exclude_prefixes, exclude_regexes)})

    today = dt.date.today().isoformat()
    xml = build_sitemap_xml(args.base_url, filtered, today)

    write_file(public_dir / "sitemap.xml", xml)

    return 0

if __name__ == "__main__":
    raise SystemExit(main())