import os
import subprocess
import sys


def test_the_report_script_runs():
    out = subprocess.run([sys.executable, "scripts/report.py"], capture_output=True, text=True, env={**os.environ, "PYTHONPATH": "."})
    assert out.stdout.strip() == "3"
