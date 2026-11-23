from shop.pricing import render_price
from shop.router import handle


def test_renamed_and_routed():
    assert render_price(5) == "$5.00"
    assert handle("/price", 5) == "$5.00"
