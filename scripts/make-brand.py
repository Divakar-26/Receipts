"""Builds docs/assets/{logo.svg,wordmark-light.svg,wordmark-dark.svg}. Text is converted to paths with Inkscape, so
the wordmark looks the same without the Inter fonts installed.   usage: python3 scripts/make-brand.py"""
import os
import subprocess
import tempfile

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "docs", "assets")
INK, PAPER, GREEN, RING = "#0B1220", "#F7F5EE", "#16A34A", "#2B3A52"

# a circle; the top is a sheet of paper torn across the middle, with a check; the bottom keeps a "total" line
teeth = "l6 -9 l6 9 " * 18
ICON = f"""<circle cx="128" cy="128" r="124" fill="{INK}"/>
  <circle cx="128" cy="128" r="122" fill="none" stroke="{RING}" stroke-width="4"/>
  <clipPath id="paper"><circle cx="128" cy="128" r="96"/></clipPath>
  <g clip-path="url(#paper)"><path d="M236 20 H20 V152 {teeth}V20 z" fill="{PAPER}"/></g>
  <path d="M90 101 l27 27 l50 -56" fill="none" stroke="{GREEN}" stroke-width="19" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M100 186 h56" stroke="#334155" stroke-width="7" stroke-linecap="round"/>"""


def write(name, svg, text_to_path=False):
    path = os.path.join(OUT, name)
    if not text_to_path:
        open(path, "w").write(svg)
        return
    with tempfile.NamedTemporaryFile("w", suffix=".svg", delete=False) as tmp:
        tmp.write(svg)
    subprocess.run(["inkscape", tmp.name, "--export-text-to-path", "--export-plain-svg", f"--export-filename={path}"], check=True, capture_output=True)
    os.unlink(tmp.name)


os.makedirs(OUT, exist_ok=True)
write("logo.svg", f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">\n  {ICON}\n</svg>\n')
for theme, ink, sub in (("light", INK, "#64748B"), ("dark", PAPER, "#94A3B8")):
    write(
        f"wordmark-{theme}.svg",
        f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 256" width="760" height="256">
  <g>{ICON}</g>
  <text x="290" y="150" font-family="Inter Display" font-weight="800" font-size="112" letter-spacing="-3" fill="{ink}">Receipts</text>
  <text x="294" y="200" font-family="Inter" font-weight="500" font-size="30" letter-spacing="0.5" fill="{sub}">no claim without proof</text>
</svg>
""",
        text_to_path=True,
    )
print("wrote docs/assets/logo.svg, wordmark-light.svg, wordmark-dark.svg")
