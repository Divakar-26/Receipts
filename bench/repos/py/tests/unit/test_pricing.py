from shop.pricing import apply_discount, format_price, with_tax


def test_apply_discount_takes_a_percentage_off():
    assert apply_discount(200, 25) == 150


def test_format_price_shows_two_decimals():
    assert format_price(5) == "$5.00"


def test_with_tax_adds_7_percent():
    assert with_tax(100) == 107
