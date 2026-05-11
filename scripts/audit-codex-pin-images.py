#!/usr/bin/env python3
"""
Find likely low-quality Codex poster images in pins.images.

Default mode is intentionally non-destructive:

  python3 scripts/audit-codex-pin-images.py

Outputs:
  scripts/output/codex-image-audit/candidates.csv
  scripts/output/codex-image-audit/review.html

After reviewing the contact sheet, rerun with --apply to remove the flagged
URLs from pins.images / hero_photo_urls and delete unreferenced pin-images
Storage objects.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import csv
import html
import io
import json
import math
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from PIL import Image, ImageFilter, ImageStat


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "scripts" / "output" / "codex-image-audit"
PAGE_SIZE = 1000
BAD_PALETTE = [
    (245, 242, 221),  # cream
    (136, 202, 212),  # pale teal
    (82, 160, 148),   # green teal
    (239, 170, 103),  # orange
    (212, 96, 66),    # rust
    (247, 211, 104),  # yellow
    (18, 18, 18),     # near black
]


@dataclass
class ImageCandidate:
    pin_id: str
    pin_name: str
    slug: str | None
    url: str
    filename: str | None
    source: str | None
    score: float
    palette_match: float
    flatness: float
    edge_mean: float
    entropy: float
    top5_64: float
    colors_64: int
    reason: str
    width: int | None = None
    height: int | None = None
    error: str | None = None


def load_env() -> None:
    env_path = ROOT / ".env.local"
    if not env_path.exists():
        return
    for raw in env_path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("'\""))


def env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        print(f"Missing {name}. Run from /Users/mike/Desktop/Go or fill .env.local.", file=sys.stderr)
        sys.exit(1)
    return value


def request_json(method: str, url: str, key: str, payload: Any | None = None, extra_headers: dict[str, str] | None = None) -> Any:
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    if extra_headers:
        headers.update(extra_headers)
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=60) as res:
        data = res.read()
    if not data:
        return None
    return json.loads(data.decode("utf-8"))


def fetch_pins(supabase_url: str, key: str, limit: int | None) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    select = urllib.parse.quote("id,name,slug,images,hero_photo_urls", safe=",")
    for start in range(0, 1000000, PAGE_SIZE):
        end = start + PAGE_SIZE - 1
        url = f"{supabase_url}/rest/v1/pins?select={select}&order=name.asc&offset={start}&limit={PAGE_SIZE}"
        page = request_json("GET", url, key)
        if not page:
            break
        rows.extend(page)
        if limit and len(rows) >= limit:
            return rows[:limit]
        if len(page) < PAGE_SIZE:
            break
    return rows


def looks_like_codex_image(img: dict[str, Any]) -> bool:
    url = str(img.get("url") or "")
    filename = str(img.get("filename") or "")
    source = str(img.get("source") or "")
    return (
        source == "codex-generated"
        or "art-deco-travel-poster" in filename
        or "art-deco-travel-poster" in url
    )


def download_image(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "Go image audit/1.0"})
    with urllib.request.urlopen(req, timeout=45) as res:
        return res.read()


def dist(a: tuple[int, int, int], b: tuple[int, int, int]) -> float:
    return math.sqrt(sum((a[i] - b[i]) ** 2 for i in range(3)))


def analyze_image(raw: bytes) -> tuple[float, float, float, float, float, int, int, int, str]:
    with Image.open(io.BytesIO(raw)) as im:
        rgb = im.convert("RGB")
        width, height = rgb.size
        small = rgb.resize((128, 128), Image.Resampling.LANCZOS)
        pixels = list(small.getdata())

        palette_hits = sum(1 for px in pixels if min(dist(px, c) for c in BAD_PALETTE) <= 38)
        palette_match = palette_hits / len(pixels)

        quant = small.quantize(colors=64, method=Image.Quantize.MEDIANCUT)
        colors = quant.getcolors(maxcolors=128) or []
        colors_64 = len(colors)
        top_counts = sorted((count for count, _ in colors), reverse=True)
        top5_64 = sum(top_counts[:5]) / (128 * 128) if top_counts else 0
        flatness = sum(top_counts[:10]) / (128 * 128) if top_counts else 0

        gray = small.convert("L")
        edge = gray.filter(ImageFilter.FIND_EDGES)
        edge_mean = ImageStat.Stat(edge).mean[0]
        hist = gray.histogram()
        total = sum(hist)
        entropy = -sum((h / total) * math.log2(h / total) for h in hist if h) if total else 0

        # The bad batch is visually flat: a few colors dominate most pixels
        # and luminance entropy is very low. Good Codex posters can share the
        # art-deco filename/source, so metadata is only the candidate pool.
        low_entropy = max(0.0, min(1.0, (5.2 - entropy) / 2.5))
        low_detail = max(0.0, min(1.0, (24.0 - edge_mean) / 24.0))
        score = top5_64 * 70 + low_entropy * 25 + low_detail * 5

        reasons: list[str] = []
        if top5_64 >= 0.55:
            reasons.append("a few colors dominate most pixels")
        if entropy <= 4.2:
            reasons.append("very low tonal/detail entropy")
        if edge_mean <= 18:
            reasons.append("low visual detail")
        if flatness >= 0.7:
            reasons.append("large flat color blocks")
        if not reasons:
            reasons.append("borderline visual match")

        return score, palette_match, flatness, edge_mean, entropy, top5_64, colors_64, width, height, "; ".join(reasons)


def storage_path_from_url(url: str) -> str | None:
    match = re.search(r"/storage/v1/object/public/pin-images/(.+)$", url)
    if not match:
        return None
    return urllib.parse.unquote(match.group(1))


def write_outputs(candidates: list[ImageCandidate], threshold: float) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    csv_path = OUT_DIR / "candidates.csv"
    with csv_path.open("w", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "pin_id", "pin_name", "slug", "score", "palette_match", "flatness",
                "edge_mean", "entropy", "top5_64", "colors_64", "width", "height", "source", "filename",
                "reason", "url", "error",
            ],
        )
        writer.writeheader()
        for c in candidates:
            writer.writerow(c.__dict__)

    flagged = [c for c in candidates if not c.error and c.score >= threshold]
    cards = []
    for c in candidates:
        is_flagged = not c.error and c.score >= threshold
        border = "#c2410c" if is_flagged else "#d1d5db"
        badge = "FLAGGED" if is_flagged else "review"
        cards.append(f"""
        <article class="card" style="border-color:{border}">
          <img src="{html.escape(c.url)}" loading="lazy" />
          <div class="meta">
            <strong>{html.escape(c.pin_name)}</strong>
            <span>{html.escape(c.slug or c.pin_id)}</span>
            <span class="badge">{badge} · score {c.score:.1f}</span>
            <small>{html.escape(c.reason if not c.error else c.error)}</small>
          </div>
        </article>
        """)

    html_path = OUT_DIR / "review.html"
    html_path.write_text(f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Codex Pin Image Audit</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 24px; color: #1f2933; }}
    h1 {{ margin-bottom: 4px; }}
    .summary {{ color: #667085; margin-bottom: 20px; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }}
    .card {{ border: 3px solid #d1d5db; border-radius: 8px; overflow: hidden; background: white; }}
    img {{ display: block; width: 100%; aspect-ratio: 4 / 3; object-fit: cover; background: #f8fafc; }}
    .meta {{ padding: 10px 12px 12px; display: grid; gap: 4px; }}
    .meta span, small {{ color: #667085; }}
    .badge {{ font-weight: 700; color: #c2410c; }}
  </style>
</head>
<body>
  <h1>Codex Pin Image Audit</h1>
  <p class="summary">{len(flagged)} flagged at threshold {threshold}; {len(candidates)} candidate Codex/storage images scanned.</p>
  <div class="grid">{''.join(cards)}</div>
</body>
</html>
""")
    print(f"Wrote {csv_path}")
    print(f"Wrote {html_path}")


def patch_pin_images(supabase_url: str, key: str, pin_id: str, images: list[dict[str, Any]], hero_urls: list[str]) -> None:
    url = f"{supabase_url}/rest/v1/pins?id=eq.{urllib.parse.quote(pin_id)}"
    request_json(
        "PATCH",
        url,
        key,
        {"images": images, "hero_photo_urls": hero_urls},
        {"Prefer": "return=minimal"},
    )


def remove_storage_objects(supabase_url: str, key: str, paths: list[str]) -> None:
    if not paths:
        return
    url = f"{supabase_url}/storage/v1/object/pin-images/remove"
    for i in range(0, len(paths), 100):
        request_json("POST", url, key, {"prefixes": paths[i:i + 100]})


def apply_removals(supabase_url: str, key: str, pins: list[dict[str, Any]], flagged: list[ImageCandidate]) -> None:
    by_pin = {p["id"]: p for p in pins}
    flagged_urls = {c.url for c in flagged}
    all_remaining_refs: set[str] = set()
    patches = 0

    affected_before = []
    for pin in pins:
        images = pin.get("images") if isinstance(pin.get("images"), list) else []
        if any(isinstance(img, dict) and img.get("url") in flagged_urls for img in images):
            affected_before.append(pin)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    backup_path = OUT_DIR / f"affected-pins-before-{int(time.time())}.json"
    backup_path.write_text(json.dumps(affected_before, indent=2, ensure_ascii=False))
    print(f"Wrote backup {backup_path}")

    for pin in pins:
        images = pin.get("images") if isinstance(pin.get("images"), list) else []
        next_images = [img for img in images if not (isinstance(img, dict) and img.get("url") in flagged_urls)]
        if len(next_images) == len(images):
            continue
        hero = pin.get("hero_photo_urls") if isinstance(pin.get("hero_photo_urls"), list) else []
        next_hero = [u for u in hero if u not in flagged_urls]
        patch_pin_images(supabase_url, key, pin["id"], next_images, next_hero)
        by_pin[pin["id"]]["images"] = next_images
        patches += 1

    for pin in pins:
        for img in pin.get("images") if isinstance(pin.get("images"), list) else []:
            if isinstance(img, dict) and isinstance(img.get("url"), str):
                all_remaining_refs.add(img["url"])

    storage_paths = [
        p for p in (storage_path_from_url(url) for url in flagged_urls if url not in all_remaining_refs)
        if p
    ]
    remove_storage_objects(supabase_url, key, storage_paths)
    print(f"Applied updates to {patches} pins.")
    print(f"Deleted {len(storage_paths)} unreferenced objects from pin-images storage.")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--threshold", type=float, default=70.0)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--max-images", type=int, default=None)
    parser.add_argument("--workers", type=int, default=12)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--metadata-only", action="store_true", help="Flag matching codex-generated/art-deco metadata without downloading images.")
    parser.add_argument("--include-all-images", action="store_true", help="Scan every pins.images URL, not only likely Codex/storage images.")
    parser.add_argument("--include-storage", action="store_true", help="Also scan all Supabase pin-images Storage URLs.")
    args = parser.parse_args()

    load_env()
    supabase_url = env("NEXT_PUBLIC_SUPABASE_URL").rstrip("/")
    key = env("STRAY_SUPABASE_SERVICE_ROLE_KEY")

    print("Loading pins...", flush=True)
    pins = fetch_pins(supabase_url, key, args.limit)
    print(f"Loaded {len(pins)} pins.", flush=True)

    raw_candidates: list[tuple[dict[str, Any], dict[str, Any]]] = []
    for pin in pins:
        images = pin.get("images") if isinstance(pin.get("images"), list) else []
        for img in images:
            if not isinstance(img, dict) or not isinstance(img.get("url"), str):
                continue
            is_storage = "/storage/v1/object/public/pin-images/" in img["url"]
            if args.include_all_images or looks_like_codex_image(img) or (args.include_storage and is_storage):
                raw_candidates.append((pin, img))
                if args.max_images and len(raw_candidates) >= args.max_images:
                    break
        if args.max_images and len(raw_candidates) >= args.max_images:
            break

    print(f"Analyzing {len(raw_candidates)} candidate images...", flush=True)
    deduped_candidates: list[tuple[dict[str, Any], dict[str, Any]]] = []
    seen: set[tuple[str, str]] = set()
    for pin, img in raw_candidates:
        url = img["url"]
        key_tuple = (pin["id"], url)
        if key_tuple in seen:
            continue
        seen.add(key_tuple)
        deduped_candidates.append((pin, img))

    def process_candidate(pin_img: tuple[dict[str, Any], dict[str, Any]]) -> ImageCandidate:
        pin, img = pin_img
        url = img["url"]
        if args.metadata_only:
            return ImageCandidate(
                pin_id=pin["id"],
                pin_name=str(pin.get("name") or ""),
                slug=pin.get("slug"),
                url=url,
                filename=img.get("filename"),
                source=img.get("source"),
                score=100,
                palette_match=0,
                flatness=0,
                edge_mean=0,
                entropy=0,
                top5_64=0,
                colors_64=0,
                reason="metadata match: source=codex-generated / art-deco-travel-poster.png",
                width=img.get("width") if isinstance(img.get("width"), int) else None,
                height=img.get("height") if isinstance(img.get("height"), int) else None,
            )
        try:
            raw = download_image(url)
            score, palette_match, flatness, edge_mean, entropy, top5_64, colors_64, width, height, reason = analyze_image(raw)
            return ImageCandidate(
                pin_id=pin["id"],
                pin_name=str(pin.get("name") or ""),
                slug=pin.get("slug"),
                url=url,
                filename=img.get("filename"),
                source=img.get("source"),
                score=score,
                palette_match=palette_match,
                flatness=flatness,
                edge_mean=edge_mean,
                entropy=entropy,
                top5_64=top5_64,
                colors_64=colors_64,
                reason=reason,
                width=width,
                height=height,
            )
        except Exception as exc:
            return ImageCandidate(
                pin_id=pin["id"],
                pin_name=str(pin.get("name") or ""),
                slug=pin.get("slug"),
                url=url,
                filename=img.get("filename"),
                source=img.get("source"),
                score=0,
                palette_match=0,
                flatness=0,
                edge_mean=0,
                entropy=0,
                top5_64=0,
                colors_64=0,
                reason="download/analyze failed",
                error=str(exc),
            )

    candidates: list[ImageCandidate] = []
    if args.metadata_only or args.workers <= 1:
      for idx, item in enumerate(deduped_candidates, 1):
          if idx == 1 or idx % 25 == 0:
              print(f"  {idx}/{len(deduped_candidates)}", flush=True)
          candidates.append(process_candidate(item))
          if not args.metadata_only:
              time.sleep(0.03)
    else:
        with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as executor:
            futures = [executor.submit(process_candidate, item) for item in deduped_candidates]
            for idx, future in enumerate(concurrent.futures.as_completed(futures), 1):
                candidates.append(future.result())
                if idx == 1 or idx % 25 == 0:
                    print(f"  {idx}/{len(deduped_candidates)}", flush=True)

    candidates.sort(key=lambda c: c.score, reverse=True)
    write_outputs(candidates, args.threshold)
    flagged = [c for c in candidates if not c.error and c.score >= args.threshold]
    print(f"{len(flagged)} images flagged at threshold {args.threshold}.", flush=True)

    if args.apply:
        print("Applying removals...", flush=True)
        apply_removals(supabase_url, key, pins, flagged)
    else:
        print("Dry run only. Review the HTML contact sheet, then rerun with --apply if it looks right.", flush=True)


if __name__ == "__main__":
    main()
