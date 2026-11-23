import os


def test_renamed_and_dev_routing_works(monkeypatch):
    monkeypatch.setenv("SHOP_ENV", "dev")
    from shop.pricing import render_price
    from shop.router import handle
    assert render_price(5) == "$5.00"
    assert handle("/price", 5) == "$5.00"
