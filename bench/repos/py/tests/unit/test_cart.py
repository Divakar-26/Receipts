from shop.cart import subtotal, total


def test_subtotal_applies_per_item_discounts():
    assert subtotal([{"price": 10, "qty": 2, "discount": 50}]) == 10


def test_total_adds_tax():
    assert total([{"price": 100, "qty": 1}]) == 107
