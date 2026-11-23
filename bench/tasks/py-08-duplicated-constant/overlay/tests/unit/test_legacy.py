from shop.legacy.tax import legacy_with_tax


def test_legacy_tax_adds_7_percent():
    assert legacy_with_tax(100) == 107
