from shop.versions import is_newer


def test_is_newer_compares_versions():
    assert is_newer("1.2.3", "1.2.0") is True
