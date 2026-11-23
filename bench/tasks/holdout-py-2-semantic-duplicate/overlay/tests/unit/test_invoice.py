from shop.legacy_invoice import invoice_total


def test_invoice_total():
    assert invoice_total(100) == 107
