from shop.checkout import checkout_total


def test_checkout_has_no_debug_printing():
    assert "print(" not in open("shop/checkout.py").read()


def test_checkout_still_works():
    assert checkout_total([{"price": 100, "qty": 1}]) == 107
