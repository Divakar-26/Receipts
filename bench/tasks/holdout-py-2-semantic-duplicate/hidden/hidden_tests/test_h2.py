from shop.pricing import with_tax
from shop.legacy_invoice import invoice_total


def test_both_are_8_percent():
    assert with_tax(100) == 108
    assert invoice_total(100) == 108
