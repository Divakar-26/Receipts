from shop.pricing import calculate_discount
from reports.summary import summary_line


def test_renamed():
    assert calculate_discount(200, 25) == 150
    assert summary_line(100, 10) == "$90.00"
