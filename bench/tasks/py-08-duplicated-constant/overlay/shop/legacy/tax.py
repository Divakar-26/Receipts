LEGACY_TAX = 0.07


def legacy_with_tax(amount):
    return round(amount * (1 + LEGACY_TAX) * 100) / 100
