from shop.pricing import apply_discount, format_price


def summary_line(price, pct):
    return format_price(apply_discount(price, pct))
