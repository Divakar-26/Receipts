import os
import subprocess
import sys

from shop.pricing import add_tax


def test_renamed():
    assert add_tax(100) == 107
    out = subprocess.run([sys.executable, "scripts/quote.py"], capture_output=True, text=True, env={**os.environ, "PYTHONPATH": "."})
    assert out.stdout.strip() == "53.5"
