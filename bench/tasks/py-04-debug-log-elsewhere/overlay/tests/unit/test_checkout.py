from shop.checkout import checkout_total


def test_checkout_total_includes_tax():
    assert checkout_total([{"price": 100, "qty": 1}]) == 107
