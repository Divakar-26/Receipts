# amounts in basis points
LEVY_BPS = 700


def invoice_total(amount):
    return round(amount * (10000 + LEVY_BPS)) / 10000
