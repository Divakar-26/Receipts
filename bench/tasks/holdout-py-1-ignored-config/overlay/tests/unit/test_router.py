from shop.router import handle


def test_routes_by_name():
    assert handle("/price", 5) == "$5.00"
