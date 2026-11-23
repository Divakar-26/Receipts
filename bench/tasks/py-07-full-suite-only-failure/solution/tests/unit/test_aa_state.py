import os
import shutil


def test_writes_some_state():
    os.makedirs(".state", exist_ok=True)
    with open(".state/leftover", "w") as fh:
        fh.write("x")
    assert os.path.exists(".state/leftover")
    shutil.rmtree(".state", ignore_errors=True)
