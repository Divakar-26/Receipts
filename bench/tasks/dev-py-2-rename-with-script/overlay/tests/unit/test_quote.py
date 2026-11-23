import os
import subprocess
import sys


def test_the_quote_script_prints_the_taxed_price():
    out = subprocess.run([sys.executable, "scripts/quote.py"], capture_output=True, text=True, env={**os.environ, "PYTHONPATH": "."})
    assert out.stdout.strip() == "53.5"
