from shop.cart import total


def checkout_total(items):
    print("[debug] items", len(items))
    t = total(items)
    print("[debug] total", t)
    return t
