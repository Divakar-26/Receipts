"""Renders docs/report.png (from `node scripts/demo-report.mjs`) and docs/demo.gif (from docs/demo.cast) with Pillow.
No emoji font is assumed: label icons are drawn as plain symbols (see ICONS).
usage: python3 scripts/render-media.py"""
import json
import os
import re
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"
BG, FG = (24, 27, 33), (222, 226, 232)
ANSI = {"0": None, "1": "bold", "2": (128, 136, 150), "31": (240, 98, 98), "32": (96, 200, 130), "33": (235, 190, 90), "36": (98, 190, 220)}
ICONS = {"🧾": "≡", "✅": "✔", "📎": "✎", "❌": "✘", "⚠️": "⚠", "⚠": "⚠", "↩": "↩", "●": "•"}


def iconise(s):
    for k, v in ICONS.items():
        s = s.replace(k, v)
    return s.replace("️", "")


def parse_ansi(line):
    """[(text, color, bold)] spans."""
    spans, color, bold = [], FG, False
    for part in re.split(r"(\x1b\[[0-9;]*m)", line):
        m = re.fullmatch(r"\x1b\[([0-9;]*)m", part)
        if m:
            for code in (m.group(1) or "0").split(";"):
                v = ANSI.get(code)
                if code == "0":
                    color, bold = FG, False
                elif v == "bold":
                    bold = True
                elif v:
                    color = v
        elif part:
            spans.append((iconise(part), color, bold))
    return spans


def render(lines, size, out_size=None, pad=28):
    font, bold = ImageFont.truetype(FONT, size), ImageFont.truetype(BOLD, size)
    cw = font.getbbox("M")[2]
    lh = int(size * 1.45)
    width = out_size[0] if out_size else pad * 2 + cw * max(sum(len(t) for t, _, _ in parse_ansi(l)) for l in lines)
    height = out_size[1] if out_size else pad * 2 + lh * len(lines)
    img = Image.new("RGB", (width, height), BG)
    d = ImageDraw.Draw(img)
    for i, line in enumerate(lines):
        x = pad
        for text, color, b in parse_ansi(line):
            d.text((x, pad + i * lh), text, font=bold if b else font, fill=color)
            x += cw * len(text)
    return img


def report_png():
    out = subprocess.run(["node", os.path.join(ROOT, "scripts", "demo-report.mjs")], capture_output=True, text=True, check=True).stdout
    lines = out.rstrip("\n").split("\n")
    img = render(lines, 17)
    img.save(os.path.join(ROOT, "docs", "report.png"), optimize=True)
    print("docs/report.png", img.size)


def demo_gif(cols=100, rows=34, size=15, seconds=7.5):
    cast = [json.loads(l) for l in open(os.path.join(ROOT, "docs", "demo.cast"))]
    events = cast[1:]
    text = ""
    frames, durations = [], []
    total = len(events)
    # a frame after every output chunk, and every 40 typed characters (typing is one event per character)
    checkpoints, typed = set([total]), 0
    for i, (_, _, data) in enumerate(events, start=1):
        if len(data) == 1:
            typed += 1
            if typed % 40 == 0:
                checkpoints.add(i)
        else:
            checkpoints.add(i)
    checkpoints = sorted(checkpoints)
    last_t = 0.0
    for idx, (t, _, data) in enumerate(events, start=1):
        text += data
        if idx in checkpoints:
            screen = text.replace("\r\n", "\n").split("\n")
            wrapped = []
            for l in screen:
                visible = re.sub(r"\x1b\[[0-9;]*m", "", l)
                wrapped.append(l if len(visible) <= cols else l[: cols])
            view = wrapped[-rows:]
            frames.append(render(view, size, out_size=(cols * ImageFont.truetype(FONT, size).getbbox("M")[2] + 56, rows * int(size * 1.45) + 56)))
            durations.append(max(120, int((t - last_t) * 1000)))
            last_t = t
    scale = seconds * 1000 / sum(durations)
    durations = [max(80, int(d * scale)) for d in durations]
    durations[-1] = 2500  # hold the final report
    pal = [f.convert("P", palette=Image.ADAPTIVE, colors=32) for f in frames]
    pal[0].save(os.path.join(ROOT, "docs", "demo.gif"), save_all=True, append_images=pal[1:], duration=durations, loop=0, optimize=True)
    print("docs/demo.gif", frames[0].size, f"{len(frames)} frames", f"{sum(durations) / 1000:.1f}s")


if __name__ == "__main__":
    report_png()
    demo_gif()
