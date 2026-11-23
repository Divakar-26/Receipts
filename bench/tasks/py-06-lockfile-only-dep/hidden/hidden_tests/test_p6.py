from shop.versions import is_newer


def test_is_newer_works():
    assert is_newer("1.2.3", "1.2.0") is True
    assert is_newer("1.0.0", "1.0.1") is False


def test_packaging_is_declared():
    lines = [l.strip().lower() for l in open("requirements.txt")]
    assert any(l.startswith("packaging") for l in lines)
