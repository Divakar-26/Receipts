from shop.pricing import apply_discount, with_tax


def subtotal(items):
    return sum(apply_discount(i["price"] * i["qty"], i.get("discount", 0)) for i in items)


def total(items):
    return with_tax(subtotal(items))


def clear_cart(items):
    return []
