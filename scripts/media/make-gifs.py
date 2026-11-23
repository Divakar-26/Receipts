"""Renders docs/demo.gif, docs/usage.gif and docs/how-it-works.gif.   usage: python3 scripts/media/make-gifs.py
- demo.gif: text from the recorded session test/e2e/05-second-caller (long parts cut with "…", nothing reworded)
- usage.gif: real output of `receipts init` and `receipts check`, captured by capture-usage.mjs
- how-it-works.gif: an animated diagram of the pipeline"""
import json
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import term  # noqa: E402
from term import Terminal, save_gif, font, emoji_img, W, H  # noqa: E402

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
DOCS = os.path.join(ROOT, "docs")
INTER = "/usr/share/fonts/opentype/inter/Inter-Regular.otf"
INTER_M = "/usr/share/fonts/opentype/inter/Inter-Medium.otf"
INTER_SB = "/usr/share/fonts/opentype/inter/Inter-SemiBold.otf"
INTER_B = "/usr/share/fonts/opentype/inter/InterDisplay-Bold.otf"


def show(t, frames, durs, lines, ms):
    for l in lines:
        t.print(l)
    frames.append(t.frame())
    durs.append(ms)


def typed(t, frames, durs, prompt, text, step=3, ms=35):
    fs = t.type_frames(prompt, text, step)
    frames.extend(fs)
    durs.extend([ms] * len(fs))


# ---- 1. the recorded session ----------------------------------------------------------------------------------------
def demo_gif():
    tr = [json.loads(l) for l in open(os.path.join(ROOT, "test/e2e/05-second-caller/transcript.jsonl"))]
    assistant = [l["text"] for l in tr if l["role"] == "assistant"]
    stops = [json.loads(l["output"]) for l in tr if l["role"] == "hook" and l["event"] == "Stop"]
    t = Terminal("claude  ·  Receipts  ·  replay of a recorded session")
    f, d = [], []
    typed(t, f, d, "[green]$[/] ", 'claude -p "Do not edit anything. End your reply with: only | verifyToken is only called from login | …"', step=4)
    show(t, f, d, ["", "[dim]● Grep(verifyToken)[/]", ""], 500)
    first = assistant[0]
    show(t, f, d, [first.split("\n")[0][:96] + ("…" if len(first.split("\n")[0]) > 96 else "")], 700)
    show(t, f, d, ["", "[dim]<receipts>[/]", "only | verifyToken is only called from login | symbol: verifyToken | in: src/login.js", "[dim]</receipts>[/]", ""], 900)
    rep = stops[0]["systemMessage"].split("\n")
    show(t, f, d, ["[dim]── Stop hook ──────────────────────────────────────────[/]", f"[fg+b]{rep[0]}[/]"], 500)
    show(t, f, d, [f"[red]{rep[2]}[/]"], 1400)
    show(t, f, d, ["", "[yellow+b]↩ sent back once:[/] [yellow]You said \"verifyToken is only called from login\". Fix it, or withdraw or narrow the claim.[/]", ""], 1600)
    second = assistant[1].split("\n")[0]
    show(t, f, d, [second], 1200)
    blk = [l for l in assistant[1].split("<receipts>")[1].split("</receipts>")[0].strip().split("\n")]
    show(t, f, d, ["[dim]<receipts>[/]", *blk, "[dim]</receipts>[/]", ""], 1000)
    rep2 = stops[1]["systemMessage"].split("\n")
    show(t, f, d, ["[dim]── Stop hook ──────────────────────────────────────────[/]", f"[fg+b]{rep2[0]}[/]", *[f"[cyan]{l}[/]" for l in rep2[2:5]]], 900)
    show(t, f, d, ["", "[green]✔ the turn ends; the claim was withdrawn and the callers were cited[/]"], 3500)
    save_gif(f, d, os.path.join(DOCS, "demo.gif"))
    return len(f), sum(d)


# ---- 2. real usage ---------------------------------------------------------------------------------------------------
def usage_gif():
    cap = json.loads(subprocess.run(["node", os.path.join(ROOT, "scripts/media/capture-usage.mjs")], capture_output=True, text=True, check=True).stdout)
    t = Terminal("~/shop  ·  receipts")
    f, d = [], []
    typed(t, f, d, "[green]$[/] ", "npx @receipts/cli init --agent claude")
    show(t, f, d, [f"[dim]{l}[/]" for l in cap["init"].strip().split("\n")], 2200)
    t.lines = []  # clear
    show(t, f, d, ["[dim]# the agent works, then ends its turn; the Stop hook runs the check:[/]"], 900)
    typed(t, f, d, "[green]$[/] ", "receipts check --message reply.md")
    lines = cap["check"].rstrip("\n").split("\n")
    for i in range(0, len(lines), 2):
        show(t, f, d, lines[i : i + 2], 350)
    d[-1] = 4000
    save_gif(f, d, os.path.join(DOCS, "usage.gif"))
    # the report on its own, as a still
    r = Terminal("~/shop  ·  receipts check")
    for l in cap["check"].rstrip("\n").split("\n"):
        r.print(l)
    r.frame().save(os.path.join(DOCS, "report.png"), optimize=True)
    return len(f), sum(d)


# ---- 3. how it works --------------------------------------------------------------------------------------------------
STEPS = [
    ("🤖", "Agent works", "edits code, runs commands", "Your agent (Claude Code, Codex, Gemini CLI or OpenCode) edits code and runs commands as usual."),
    ("📒", "Ledger hook", "every shell & web call", "After every shell or web call, a tiny hook logs the command, its real exit code, parsed test counts and a git snapshot."),
    ("🏁", "Turn ends", "final message", "When the agent finishes its turn, the Stop hook hands Receipts the final message."),
    ("🔎", "Find claims", "receipts block + prose", "It reads the <receipts> block, and scans the prose for claims nobody tagged: all, only, never, tests pass…"),
    ("🛠️", "Check each one", "ripgrep · tree-sitter · git", "Each claim is checked with Receipts' own tools, never a model: ripgrep, tree-sitter, git, the ledger, manifests."),
    ("🏷️", "Label", "✅ 📎 ❌ ⚠️", "Every claim gets one label, plus a note on what the check could not cover."),
    ("🧾", "Report", "warn, or send back once", "warn (default): you see the report. block: the agent is sent back once with the exact problems."),
]


def card_boxes():
    boxes = []
    top_w, bot_w, gap = 300, 232, 34
    y1, y2, h = 150, 360, 150
    x = (W - (3 * top_w + 2 * gap)) / 2
    for i in range(3):
        boxes.append((x + i * (top_w + gap), y1, x + i * (top_w + gap) + top_w, y1 + h))
    x = (W - (4 * bot_w + 3 * gap)) / 2
    for i in range(4):
        boxes.append((x + i * (bot_w + gap), y2, x + i * (bot_w + gap) + bot_w, y2 + h))
    return boxes


def arrow(d, a, b, colour, width=4):
    d.line([a, b], fill=colour, width=width)
    ax, ay = b
    if abs(a[0] - b[0]) > abs(a[1] - b[1]):
        s = 1 if b[0] > a[0] else -1
        d.polygon([(ax, ay), (ax - 12 * s, ay - 7), (ax - 12 * s, ay + 7)], fill=colour)
    else:
        s = 1 if b[1] > a[1] else -1
        d.polygon([(ax, ay), (ax - 7, ay - 12 * s), (ax + 7, ay - 12 * s)], fill=colour)


def connectors(boxes):
    """Polyline from each card to the next."""
    out = []
    for i in range(len(boxes) - 1):
        a, b = boxes[i], boxes[i + 1]
        if i == 2:  # top row -> bottom row: down, left, down
            mid_y = (a[3] + b[1]) / 2
            out.append([(a[0] + (a[2] - a[0]) / 2, a[3]), (a[0] + (a[2] - a[0]) / 2, mid_y), (b[0] + (b[2] - b[0]) / 2, mid_y), (b[0] + (b[2] - b[0]) / 2, b[1])])
        else:
            y = (a[1] + a[3]) / 2
            out.append([(a[2], y), (b[0], y)])
    return out


def diagram_frame(active, lit, dot=None, caption=None):
    img = term.chrome("")[0].copy() if False else None
    page = Image.new("RGB", (W, H))
    pd = ImageDraw.Draw(page)
    for y in range(H):
        tt = y / H
        pd.line([(0, y), (W, y)], fill=tuple(int(term.PAGE_TOP[i] * (1 - tt) + term.PAGE_BOTTOM[i] * tt) for i in range(3)))
    pd.text((60, 46), "How Receipts works", font=font(INTER_B, 38), fill=(241, 245, 249))
    pd.text((62, 98), "no claim without proof: the agent makes claims, the checker verifies them", font=font(INTER, 19), fill=(148, 163, 184))
    boxes = card_boxes()
    lines = connectors(boxes)
    for i, pts in enumerate(lines):
        on = i + 1 in lit
        colour = (74, 222, 128) if on else (71, 85, 105)
        for j in range(len(pts) - 2):
            pd.line([pts[j], pts[j + 1]], fill=colour, width=4)
        arrow(pd, pts[-2], pts[-1], colour)
    if dot:
        x, y = dot
        pd.ellipse((x - 9, y - 9, x + 9, y + 9), fill=(134, 239, 172))
    for i, (icon, title, sub, _) in enumerate(STEPS):
        x0, y0, x1, y1 = boxes[i]
        on, cur = i in lit, i == active
        if cur:
            glow = Image.new("L", (W, H), 0)
            ImageDraw.Draw(glow).rounded_rectangle((x0 - 6, y0 - 6, x1 + 6, y1 + 6), 22, fill=170)
            glow = glow.filter(ImageFilter.GaussianBlur(14))
            page.paste((34, 197, 94), (0, 0), glow)
            pd = ImageDraw.Draw(page)
        fill = (22, 30, 46) if on else (17, 24, 39)
        outline = (74, 222, 128) if cur else ((51, 65, 85) if not on else (34, 120, 70))
        pd.rounded_rectangle((x0, y0, x1, y1), 16, fill=fill, outline=outline, width=3 if cur else 2)
        e = emoji_img(icon, 40)
        if not on:
            e = Image.blend(Image.new("RGBA", e.size, (17, 24, 39, 0)), e, 0.35)
        page.paste(e, (int(x0 + 20), int(y0 + 22)), e)
        pd.text((x0 + 20, y0 + 74), f"{i + 1}. {title}", font=font(INTER_SB, 22), fill=(241, 245, 249) if on else (100, 116, 139))
        text_with_emoji(page, (x0 + 20, y0 + 106), sub, font(INTER, 16), (148, 163, 184) if on else (71, 85, 105))
        pd = ImageDraw.Draw(page)
    if caption:
        cw = pd.textlength(caption, font=font(INTER_M, 21))
        if cw > W - 120:  # two lines
            words, l1 = caption.split(" "), ""
            while words and pd.textlength(l1 + words[0] + " ", font=font(INTER_M, 21)) < W - 140:
                l1 += words.pop(0) + " "
            for k, txt in enumerate([l1.strip(), " ".join(words)]):
                tw = pd.textlength(txt, font=font(INTER_M, 21))
                pd.text(((W - tw) / 2, 560 + k * 32), txt, font=font(INTER_M, 21), fill=(226, 232, 240))
        else:
            pd.text(((W - cw) / 2, 576), caption, font=font(INTER_M, 21), fill=(226, 232, 240))
    pd.text((60, H - 46), "github.com/Divakar-26/Receipts", font=font(INTER, 15), fill=(100, 116, 139))
    return page


def text_with_emoji(page, xy, text, fnt, fill):
    """Draw text where emoji are drawn in colour."""
    x, y = xy
    d = ImageDraw.Draw(page)
    for piece in term.EMOJI_RE.split(text):
        if not piece:
            continue
        if term.EMOJI_RE.fullmatch(piece):
            e = emoji_img(piece, fnt.size + 4)
            page.paste(e, (int(x), int(y)), e)
            x += e.width + 6
        else:
            d.text((x, y), piece, font=fnt, fill=fill)
            x += d.textlength(piece, font=fnt)


def point_on(pts, t):
    """Point at fraction t along a polyline."""
    segs = [(pts[i], pts[i + 1]) for i in range(len(pts) - 1)]
    lens = [((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2) ** 0.5 for a, b in segs]
    target = t * sum(lens)
    for (a, b), L in zip(segs, lens):
        if target <= L:
            k = target / L if L else 0
            return (a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k)
        target -= L
    return segs[-1][1]


def how_gif():
    f, d = [], []
    lines = connectors(card_boxes())
    lit = set()
    for i, step in enumerate(STEPS):
        if i > 0:
            for k in range(1, 6):
                f.append(diagram_frame(i - 1, lit, dot=point_on(lines[i - 1], k / 6), caption=STEPS[i - 1][3]))
                d.append(70)
        lit.add(i)
        f.append(diagram_frame(i, lit, caption=step[3]))
        d.append(2000)
    f.append(diagram_frame(-1, lit, caption="Claims are checked by code, never by a model. Anything it can't prove is labelled, not trusted."))
    d.append(4000)
    save_gif(f, d, os.path.join(DOCS, "how-it-works.gif"), colours=128)
    f[-1].save(os.path.join(DOCS, "how-it-works.png"))
    return len(f), sum(d)


if __name__ == "__main__":
    which = sys.argv[1:] or ["demo", "usage", "how"]
    for name, fn in (("demo", demo_gif), ("usage", usage_gif), ("how", how_gif)):
        if name in which:
            n, ms = fn()
            print(f"docs/{'how-it-works' if name == 'how' else name}.gif: {n} frames, {ms / 1000:.1f}s")
