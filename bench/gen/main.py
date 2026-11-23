"""Regenerates bench/tasks/ from the definitions in this folder:  python3 bench/gen/main.py"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import common  # noqa: E402
import ts, py, go, dev  # noqa: E402,F401  (importing registers the tasks)
import naive  # noqa: E402

naive.apply(common.TASKS)

root = os.path.join(os.path.dirname(__file__), "..", "tasks")
common.write_all(root)
test = sum(1 for t in common.TASKS if t["split"] == "test")
devn = sum(1 for t in common.TASKS if t["split"] == "dev")
print(f"wrote {test} test tasks and {devn} dev tasks to {os.path.normpath(root)}")
