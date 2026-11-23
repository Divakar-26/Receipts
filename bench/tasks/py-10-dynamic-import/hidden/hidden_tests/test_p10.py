import os
import subprocess
import sys


def test_legacy_is_gone():
    assert not os.path.exists("shop/legacy.py")


def test_the_report_still_runs():
    out = subprocess.run([sys.executable, "scripts/report.py"], capture_output=True, text=True, env={**os.environ, "PYTHONPATH": "."})
    assert out.stdout.strip() == "3"
