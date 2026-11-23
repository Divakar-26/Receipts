from shop.pricing import with_tax
from shop.legacy.tax import legacy_with_tax


def test_both_are_8_percent():
    assert with_tax(100) == 108
    assert legacy_with_tax(100) == 108
