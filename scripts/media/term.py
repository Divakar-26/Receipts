"""A small terminal renderer for README GIFs: window chrome, JetBrains Mono, colour emoji, ANSI colours."""
import re
from functools import lru_cache

from PIL import Image, ImageDraw, ImageFilter, ImageFont

MONO = "/usr/share/fonts/truetype/jetbrains-mono/JetBrainsMono-Regular.ttf"
MONO_B = "/usr/share/fonts/truetype/jetbrains-mono/JetBrainsMono-Bold.ttf"
EMOJI = "/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf"
FALLBACK = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
# glyphs JetBrains Mono lacks, drawn with DejaVu Sans Mono instead
NEEDS_FALLBACK = set("↩↳✔✘✓⏎")
INTER = "/usr/share/fonts/opentype/inter/Inter-Medium.otf"

W, H = 1200, 720
PAGE_TOP, PAGE_BOTTOM = (30, 41, 59), (15, 23, 42)
WIN_BG, BAR_BG, BAR_TXT = (13, 17, 23), (22, 27, 34), (139, 148, 158)
FG = (230, 237, 243)
COLORS = {
    "dim": (125, 133, 144), "green": (63, 185, 80), "red": (248, 81, 73), "yellow": (210, 153, 34),
    "cyan": (57, 197, 207), "blue": (88, 166, 255), "magenta": (188, 140, 255), "fg": FG,
}
ANSI = {"2": "dim", "31": "red", "32": "green", "33": "yellow", "36": "cyan", "34": "blue", "35": "magenta"}
EMOJI_RE = re.compile(r"(🧾|✅|📎|❌|⚠️|⚠|↩️|✔️)")

FS = 17
LH = 27


@lru_cache(maxsize=None)
def font(path, size):
    return ImageFont.truetype(path, size)


@lru_cache(maxsize=None)
def emoji_img(ch, px):
    f = ImageFont.truetype(EMOJI, 109)
    img = Image.new("RGBA", (136, 128), (0, 0, 0, 0))
    ImageDraw.Draw(img).text((0, 0), ch, font=f, embedded_color=True)
    img = img.crop(img.getbbox())
    return img.resize((px, int(px * img.height / img.width)), Image.LANCZOS)


CW = font(MONO, FS).getbbox("M")[2]


def chrome(title):
    """Page background, shadow and an empty window. Returns (image, text origin, cols, rows)."""
    page = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(page)
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)], fill=tuple(int(PAGE_TOP[i] * (1 - t) + PAGE_BOTTOM[i] * t) for i in range(3)))
    x0, y0, x1, y1 = 48, 40, W - 48, H - 40
    shadow = Image.new("L", (W, H), 0)
    ImageDraw.Draw(shadow).rounded_rectangle((x0 + 6, y0 + 14, x1 + 6, y1 + 14), 18, fill=150)
    shadow = shadow.filter(ImageFilter.GaussianBlur(18))
    page.paste((0, 0, 0), (0, 0), shadow)
    d.rounded_rectangle((x0, y0, x1, y1), 14, fill=WIN_BG, outline=(48, 54, 61), width=1)
    d.rounded_rectangle((x0, y0, x1, y0 + 42), 14, fill=BAR_BG)
    d.rectangle((x0, y0 + 28, x1, y0 + 42), fill=BAR_BG)
    d.line((x0, y0 + 42, x1, y0 + 42), fill=(48, 54, 61))
    for i, c in enumerate([(255, 95, 87), (254, 188, 46), (40, 200, 64)]):
        cx = x0 + 22 + i * 22
        d.ellipse((cx - 6, y0 + 15, cx + 6, y0 + 27), fill=c)
    tf = font(INTER, 15)
    tw = d.textlength(title, font=tf)
    d.text(((x0 + x1 - tw) / 2, y0 + 12), title, font=tf, fill=BAR_TXT)
    ox, oy = x0 + 26, y0 + 62
    cols = int((x1 - x0 - 52) / CW)
    rows = int((y1 - oy - 18) / LH)
    return page, (ox, oy), cols, rows


def spans_of(line):
    """'[green]text[/] more' or ANSI-coloured text -> [(text, colour, bold)]."""
    out, colour, bold = [], "fg", False
    for part in re.split(r"(\x1b\[[0-9;]*m|\[(?:/|[a-z]+(?:\+b)?)\])", line):
        if not part:
            continue
        m = re.fullmatch(r"\x1b\[([0-9;]*)m", part)
        t = re.fullmatch(r"\[(/|[a-z]+)(\+b)?\]", part)
        if m:
            for code in (m.group(1) or "0").split(";"):
                if code in ("0", ""):
                    colour, bold = "fg", False
                elif code == "1":
                    bold = True
                elif code in ANSI:
                    colour = ANSI[code]
        elif t:
            colour, bold = ("fg", False) if t.group(1) == "/" else (t.group(1), bool(t.group(2)))
        else:
            out.append((part, colour, bold))
    return out


def visible_len(line):
    return sum(cell_len(t) for t, _, _ in spans_of(line))


def cell_len(text):
    n = 0
    for piece in EMOJI_RE.split(text):
        n += 2 if EMOJI_RE.fullmatch(piece or "x") else len(piece)
    return n


def wrap(line, cols):
    """Wrap a styled line to `cols` cells, keeping styles."""
    out, cur, used = [], [], 0
    for text, colour, bold in spans_of(line):
        for piece in EMOJI_RE.split(text):
            if not piece:
                continue
            units = [piece] if EMOJI_RE.fullmatch(piece) else list(piece)
            for u in units:
                w = 2 if EMOJI_RE.fullmatch(u) else 1
                if used + w > cols:
                    out.append(cur)
                    cur, used = [], 0
                    if u == " ":
                        continue
                cur.append((u, colour, bold))
                used += w
    out.append(cur)
    return out


def draw_cells(img, origin, row, cells):
    d = ImageDraw.Draw(img)
    x, y = origin[0], origin[1] + row * LH
    for u, colour, bold in cells:
        if EMOJI_RE.fullmatch(u):
            e = emoji_img(u.replace("️", "") if u != "⚠️" else "⚠️", FS + 3)
            img.paste(e, (int(x), int(y + 2)), e)
            x += 2 * CW
        else:
            f = font(FALLBACK, FS) if u in NEEDS_FALLBACK else font(MONO_B if bold else MONO, FS)
            d.text((x, y), u, font=f, fill=COLORS[colour])
            x += CW


class Terminal:
    def __init__(self, title):
        self.base, self.origin, self.cols, self.rows = chrome(title)
        self.lines = []  # list of cell rows
        self.cursor = True

    def print(self, line=""):
        self.lines.extend(wrap(line, self.cols))

    def type_frames(self, prompt, text, step=3):
        """Frames for typing `text` after `prompt`; the line is committed at the end."""
        frames = [self.frame(cursor=True, extra=wrap(prompt + text[:i], self.cols)) for i in range(0, len(text) + step, step)]
        self.lines.extend(wrap(prompt + text, self.cols))
        return frames

    def frame(self, cursor=False, extra=None):
        img = self.base.copy()
        view = (self.lines + (extra or []))[-self.rows:]
        for r, cells in enumerate(view):
            draw_cells(img, self.origin, r, cells)
        if cursor and view:
            last = view[-1]
            x = self.origin[0] + sum(2 * CW if EMOJI_RE.fullmatch(u) else CW for u, _, _ in last)
            y = self.origin[1] + (len(view) - 1) * LH
            ImageDraw.Draw(img).rectangle((x + 1, y + 4, x + CW - 1, y + LH - 4), fill=(201, 209, 217))
        return img


def save_gif(frames, durations, path, colours=128):
    """frames: list of RGB images; durations in ms. One shared palette, so colours don't shift between frames."""
    sample = Image.new("RGB", (W, H * min(len(frames), 6)))
    picks = [frames[int(i * (len(frames) - 1) / max(1, min(len(frames), 6) - 1))] for i in range(min(len(frames), 6))]
    for i, fr in enumerate(picks):
        sample.paste(fr, (0, i * H))
    # guarantee the few colours that cover little area (window buttons, label colours, emoji reds) survive quantising
    keep = list(COLORS.values()) + [(255, 95, 87), (254, 188, 46), (40, 200, 64), (74, 222, 128), (34, 197, 94), (220, 38, 38), (239, 68, 68), (250, 204, 21), (253, 224, 71)]
    swatch = Image.new("RGB", (len(keep) * 80, 160))
    for i, c in enumerate(keep):
        swatch.paste(c, (i * 80, 0, i * 80 + 80, 160))
    both = Image.new("RGB", (max(sample.width, swatch.width), sample.height + swatch.height))
    both.paste(sample, (0, 0))
    both.paste(swatch, (0, sample.height))
    palette = both.quantize(colors=colours, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    pal = [f.quantize(palette=palette, dither=Image.Dither.NONE) for f in frames]
    pal[0].save(path, save_all=True, append_images=pal[1:], duration=durations, loop=0, optimize=True, disposal=1)
