TAX_RATE = 0.07


def apply_discount(amount, pct):
    return round(amount * (100 - pct)) / 100


def format_price(amount):
    return f"${amount:.2f}"


def with_tax(amount):
    return round(amount * (1 + TAX_RATE) * 100) / 100
