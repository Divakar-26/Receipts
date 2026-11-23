import os
import shutil


def test_starts_from_a_clean_state():
    try:
        assert not os.path.exists(".state")
    finally:
        shutil.rmtree(".state", ignore_errors=True)
