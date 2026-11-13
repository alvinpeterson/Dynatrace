#!/usr/bin/env python3
"""Render the /daily-brief HTML page from a JSON data file.

Usage: python3 -I render.py <data.json> <out.html>

Every gathered string is HTML-escaped here, so callers pass plain text only,
never markup. See SKILL.md for the data schema.
"""
import base64
import html
import json
import sys
from datetime import datetime
from pathlib import Path

ASSETS = Path(__file__).resolve().parent
FONT = ASSETS / "fonts" / "fraunces-latin-600-normal.woff2"

W, H = 840, 170
BASE_Y = 140  # baseline of the terrain line
PAD_X = 20


def esc(s):
    return html.escape(str(s or ""), quote=True)


def safe_url(u):
    u = str(u or "").strip()
    return u if u.startswith("https://") else ""


def font_face():
    if not FONT.exists():
        return ""
    b64 = base64.b64encode(FONT.read_bytes()).decode("ascii")
    return (
        "@font-face{font-family:'Fraunces';font-style:normal;font-weight:600;"
        f"font-display:block;src:url(data:font/woff2;base64,{b64}) format('woff2');}}"
    )


def parse_ts(s):
    return datetime.fromisoformat(str(s).replace("Z", "+00:00")).timestamp()


def terrain_points(hourly):
    """Map hourly problem counts to (x, y). Elevation = load; calm nights stay flat."""
    n = max(len(hourly), 2)
    counts = list(hourly) if len(hourly) >= 2 else [0, 0]
    peak = max(counts) or 1
    # Vertical scale by overall load: calm, normal, heavy.
    total = sum(counts)
    if peak <= 2:
        amp = 10
    elif total < 40:
        amp = 65
    else:
        amp = 115
    pts = []
    for i, c in enumerate(counts):
        x = PAD_X + i * (W - 2 * PAD_X) / (n - 1)
        y = BASE_Y - (c / peak) * amp
        pts.append((x, y))
    return pts


def smooth_path(pts):
    """Catmull-Rom spline through the points, as one cubic Bezier path."""
    d = f"M{pts[0][0]:.1f},{pts[0][1]:.1f}"
    for i in range(len(pts) - 1):
        p0 = pts[i - 1] if i > 0 else pts[i]
        p1, p2 = pts[i], pts[i + 1]
        p3 = pts[i + 2] if i + 2 < len(pts) else p2
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f" C{c1[0]:.1f},{c1[1]:.1f} {c2[0]:.1f},{c2[1]:.1f} {p2[0]:.1f},{p2[1]:.1f}"
    return d


def y_at(pts, x):
    for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
        if x1 <= x <= x2:
            t = (x - x1) / (x2 - x1) if x2 != x1 else 0
            return y1 + t * (y2 - y1)
    return pts[-1][1] if x > pts[-1][0] else pts[0][1]


def svg(terrain):
    hourly = terrain.get("hourly") or [0, 0]
    pts = terrain_points(hourly)
    parts = [
        f'<svg viewBox="0 0 {W} {H}" width="100%" role="img" aria-label="{esc(terrain.get("label", "Problem load across the window"))}">',
        f'<path d="{smooth_path(pts)}" fill="none" stroke="#2E2C27" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
    ]
    try:
        t0, t1 = parse_ts(terrain["start"]), parse_ts(terrain["end"])
    except (KeyError, ValueError):
        t0 = t1 = None
    accent_used = False
    for m in terrain.get("markers", []):
        if t0 is None or t1 <= t0:
            break
        try:
            frac = (parse_ts(m["t"]) - t0) / (t1 - t0)
        except (KeyError, ValueError):
            continue
        frac = min(max(frac, 0.0), 1.0)
        x = PAD_X + frac * (W - 2 * PAD_X)
        y = y_at(pts, x)
        r = {1: 6, 2: 9, 3: 13}.get(int(m.get("weight", 1)), 6)
        kind = m.get("kind", "significant")
        if kind == "resolved":
            fill = "#B4B3A8"
        else:
            fill = "#2E2C27"
        parts.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r}" fill="{fill}"/>')
        if m.get("accent") and not accent_used:
            accent_used = True
            # One clay tension squiggle under the worst problem.
            sx = x - 18
            sy = min(y + r + 10, H - 6)
            parts.append(
                f'<path d="M{sx:.1f},{sy:.1f} q4.5,-6 9,0 t9,0 t9,0 t9,0" fill="none" '
                'stroke="#C6613F" stroke-width="2" stroke-linecap="round"/>'
            )
    if not accent_used:
        # Calm night: one clay dawn sun at the right edge, half-risen on the baseline.
        cx = W - PAD_X - 26
        parts.append(f'<path d="M{cx-14},{BASE_Y} a14,14 0 0,1 28,0" fill="#C6613F"/>')
    parts.append("</svg>")
    return "".join(parts)


def linked_sentence(sentence, phrase, url):
    sentence, phrase, url = str(sentence or ""), str(phrase or ""), safe_url(url)
    if phrase and url and phrase in sentence:
        a, b = sentence.split(phrase, 1)
        return f'{esc(a)}<a class="src" href="{esc(url)}">{esc(phrase)}</a>{esc(b)}'
    return esc(sentence)


def section(sec):
    items = sec.get("items") or []
    if not items:
        empty = sec.get("empty")
        if not empty:
            return ""
        return f'<section><h2>{esc(sec["title"])}</h2><p class="calm">{esc(empty)}</p></section>'
    lis = []
    for i, it in enumerate(items, 1):
        title = esc(it.get("title"))
        url = safe_url(it.get("url"))
        if url:
            title = f'<a href="{esc(url)}">{title}</a>'
        body = linked_sentence(it.get("sentence"), it.get("source_text"), it.get("source_url"))
        lis.append(
            f'<li><span class="num">{i}</span><div><p class="t">{title}</p>'
            f'<p class="s">{body}</p></div></li>'
        )
    return f'<section><h2>{esc(sec["title"])}</h2><ol>{"".join(lis)}</ol></section>'


CSS = """
*{box-sizing:border-box;margin:0;padding:0}
body{background:#FCFCFB;color:#2E2C27;font:15px/1.55 -apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
.band{width:100%}
.top{background:#F9F9F7;border-bottom:1px solid #E1E1DF}
.wrap{max-width:860px;margin:0 auto;padding:44px 32px 40px}
.date{color:#6B6A63;font-size:13px;letter-spacing:.02em;margin-bottom:10px}
h1{font-family:'Fraunces',Georgia,serif;font-weight:600;font-size:40px;line-height:1.15;margin-bottom:22px}
.window{color:#6B6A63;font-size:13px;margin:-12px 0 18px}
svg{display:block;margin:4px 0 6px}
.acts{display:grid;grid-template-columns:repeat(3,1fr)}
.act{padding:4px 22px 0}
.act:first-child{padding-left:0}
.act+.act{border-left:1px solid #E4E3DC}
.act b{display:block;font-size:13px;font-weight:600;margin-bottom:4px}
.act p{color:#6B6A63;font-size:14px}
section{margin-bottom:34px}
section:last-child{margin-bottom:0}
h2{font-size:17px;font-weight:600;margin-bottom:12px}
ol{list-style:none}
li{display:flex;gap:14px;padding:10px 0;border-top:1px solid #E4E3DC}
li:first-child{border-top:0;padding-top:2px}
.num{color:#B4B3A8;font-size:14px;min-width:14px;font-variant-numeric:tabular-nums}
.t{font-weight:600}
.t a{color:#2E2C27;text-decoration:none}
.t a:hover{text-decoration:underline}
.s{color:#6B6A63}
a.src{color:#6B6A63;text-decoration:underline;text-underline-offset:2px}
.calm{color:#6B6A63}
@media (max-width:640px){
 .wrap{padding:32px 20px}
 h1{font-size:30px}
 .acts{grid-template-columns:1fr}
 .act,.act:first-child{padding:12px 0}
 .act+.act{border-left:0;border-top:1px solid #E4E3DC}
}
"""


def render(data):
    acts = "".join(
        f'<div class="act"><b>{esc(a.get("time"))}</b><p>{esc(a.get("text"))}</p></div>'
        for a in (data.get("acts") or [])[:3]
    )
    secs = "".join(section(s) for s in data.get("sections") or [])
    if not secs:
        secs = '<p class="calm">Nothing needs you this morning.</p>'
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(data.get("title", "Daily brief"))}</title>
<style>{font_face()}{CSS}</style></head>
<body>
<div class="band top"><div class="wrap">
<p class="date">{esc(data.get("date_line"))}</p>
<h1>{esc(data.get("headline"))}</h1>
<p class="window">{esc(data.get("window"))}</p>
{svg(data.get("terrain") or {})}
<div class="acts">{acts}</div>
</div></div>
<div class="band"><div class="wrap">{secs}</div></div>
</body></html>
"""


def main():
    if len(sys.argv) != 3:
        sys.exit("usage: render.py <data.json> <out.html>")
    data = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    Path(sys.argv[2]).write_text(render(data), encoding="utf-8")
    print(sys.argv[2])


if __name__ == "__main__":
    main()
