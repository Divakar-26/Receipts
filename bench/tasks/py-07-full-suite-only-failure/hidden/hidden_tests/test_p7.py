from shop.cart import clear_cart


def test_clear_cart_returns_a_new_empty_list():
    items = [{"price": 1, "qty": 1}]
    assert clear_cart(items) == []
    assert len(items) == 1
