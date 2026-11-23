from shop.checkout import checkout_total
from shop.pricing import with_tax


def test_tax_is_8_percent():
    assert with_tax(100) == 108
    assert checkout_total([{"price": 100, "qty": 1}]) == 108
