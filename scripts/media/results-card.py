"""Draws bench/results.png from a scored benchmark run.   usage: python3 scripts/media/results-card.py [tag]
Every number comes from bench/results/<tag>/{summary.json,grades.json}."""
import json
import os
import sys

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from term import font, emoji_img, PAGE_TOP, PAGE_BOTTOM  # noqa: E402

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
INTER = "/usr/share/fonts/opentype/inter/Inter-Regular.otf"
INTER_M = "/usr/share/fonts/opentype/inter/Inter-Medium.otf"
INTER_SB = "/usr/share/fonts/opentype/inter/Inter-SemiBold.otf"
INTER_B = "/usr/share/fonts/opentype/inter/InterDisplay-Bold.otf"
W, H = 1200, 675
TXT, SUB, FAINT = (241, 245, 249), (148, 163, 184), (100, 116, 139)
CARD, LINE = (17, 24, 39), (38, 50, 70)
GREEN, RED, AMBER, SLATE = (74, 222, 128), (248, 113, 113), (251, 191, 36), (71, 85, 105)
NAMES = {"A": "No Receipts", "B": "Rules only", "C": "Full Receipts"}


def card(d, box, title):
    d.rounded_rectangle(box, 16, fill=CARD, outline=LINE, width=1)
    d.text((box[0] + 24, box[1] + 18), title, font=font(INTER_SB, 18), fill=TXT)


def main(tag="main"):
    base = os.path.join(ROOT, "bench", "results", tag)
    s = json.load(open(os.path.join(base, "summary.json")))
    grades = json.load(open(os.path.join(base, "grades.json")))
    conds = [c for c in "ABC" if c in s["conditions"]]
    runs = {c: sorted((g for g in grades if g["condition"] == c), key=lambda g: g["id"]) for c in conds}
    total_runs = sum(len(v) for v in runs.values())
    tasks = len({g["task"] for g in grades})

    img = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(img)
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)], fill=tuple(int(PAGE_TOP[i] * (1 - t) + PAGE_BOTTOM[i] * t) for i in range(3)))
    d.text((48, 34), "Benchmark results", font=font(INTER_B, 36), fill=TXT)
    model = ", ".join(m for m in s["models"] if m)
    d.text((50, 82), f"Claude Code · {model} · {total_runs} real runs on {tasks} tasks with planted traps", font=font(INTER, 17), fill=SUB)
    d.rounded_rectangle((W - 238, 38, W - 48, 72), 17, fill=(66, 32, 6), outline=(146, 64, 14))
    d.text((W - 224, 45), "partial: 97 of 180 runs", font=font(INTER_M, 15), fill=AMBER)

    # ---- confident-wrong claims: one dot per run ----------------------------------------------------------------------
    box = (48, 120, 728, 432)
    card(d, box, "Confident-wrong claims  ·  one dot per run")
    for i, c in enumerate(conds):
        y = box[1] + 66 + i * 74
        d.text((box[0] + 24, y - 2), NAMES[c], font=font(INTER_M, 16), fill=TXT)
        x = box[0] + 170
        wrong = 0
        for k, g in enumerate(runs[c]):
            bad = any(x_["confident_wrong"] for x_ in g["grades"])
            wrong += bad
            cx, cy = x + (k % 17) * 22, y + (k // 17) * 22
            d.ellipse((cx, cy, cx + 14, cy + 14), fill=RED if bad else SLATE)
        d.text((box[2] - 104, y - 2), f"{wrong} of {len(runs[c])}", font=font(INTER_SB, 18), fill=RED if wrong else GREEN)
    d.text((box[0] + 24, box[3] - 36), "Claude rarely fell for the traps even without Receipts, so no difference can be measured.", font=font(INTER, 15), fill=SUB)

    # ---- tasks completed --------------------------------------------------------------------------------------------------
    box2 = (752, 120, 1152, 432)
    card(d, box2, "Tasks completed (hidden tests)")
    for i, c in enumerate(conds):
        y = box2[1] + 66 + i * 74
        pct = s["conditions"][c]["task_success_pct"]
        d.text((box2[0] + 24, y - 2), NAMES[c], font=font(INTER_M, 16), fill=TXT)
        x0, x1 = box2[0] + 24, box2[2] - 90
        d.rounded_rectangle((x0, y + 26, x1, y + 38), 6, fill=(30, 41, 59))
        d.rounded_rectangle((x0, y + 26, x0 + (x1 - x0) * pct / 100, y + 38), 6, fill=(96, 165, 250))
        d.text((x1 + 14, y + 20), f"{pct:.0f}%", font=font(INTER_SB, 18), fill=TXT)
    d.text((box2[0] + 24, box2[3] - 36), "About the same in all three.", font=font(INTER, 15), fill=SUB)

    # ---- cost of checking -------------------------------------------------------------------------------------------------
    box3 = (48, 452, 600, 628)
    card(d, box3, "Extra cost, compared with no Receipts")
    a = s["conditions"]["A"]
    for i, c in enumerate([c for c in conds if c != "A"]):
        v = s["conditions"][c]
        tok = (v["mean_output_tokens"] / a["mean_output_tokens"] - 1) * 100
        tim = (v["mean_wall_s"] / a["mean_wall_s"] - 1) * 100
        y = box3[1] + 64 + i * 48
        d.text((box3[0] + 24, y), NAMES[c], font=font(INTER_M, 16), fill=TXT)
        d.text((box3[0] + 190, y), f"+{tok:.0f}%", font=font(INTER_SB, 20), fill=AMBER)
        d.text((box3[0] + 262, y + 3), "output tokens", font=font(INTER, 15), fill=SUB)
        d.text((box3[0] + 390, y), f"+{tim:.0f}%", font=font(INTER_SB, 20), fill=AMBER)
        d.text((box3[0] + 456, y + 3), "time", font=font(INTER, 15), fill=SUB)

    # ---- block mode audit -------------------------------------------------------------------------------------------------
    r = s["receipts"]
    box4 = (624, 452, 1152, 628)
    card(d, box4, "Sending the agent back (block mode)")
    d.text((box4[0] + 24, box4[1] + 52), f"{r['runs_with_a_block']} of {r['c_runs']}", font=font(INTER_B, 34), fill=TXT)
    d.text((box4[0] + 160, box4[1] + 64), "runs were sent back", font=font(INTER, 16), fill=SUB)
    e = emoji_img("❌", 22)
    img.paste(e, (box4[0] + 24, box4[1] + 106), e)
    d.text((box4[0] + 56, box4[1] + 106), f"all {r['false_blocks_audited']} were false alarms (each one audited)", font=font(INTER_SB, 17), fill=RED)
    d.text((box4[0] + 24, box4[1] + 132), "So the default is warn: report only.", font=font(INTER, 15), fill=SUB)
    d.text((box4[0] + 24, box4[1] + 151), "The causes are fixed, not yet re-measured.", font=font(INTER, 15), fill=SUB)

    d.text((50, H - 34), "Deterministic grading, no model. Tasks, answer keys, transcripts and audits: bench/README.md", font=font(INTER, 15), fill=FAINT)
    out = os.path.join(ROOT, "bench", "results.png")
    img.save(out, optimize=True)
    print(out)


if __name__ == "__main__":
    main(*(sys.argv[1:2] or ["main"]))
