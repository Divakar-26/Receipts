from shop.ops import run


def nightly():
    return run("apply_" + "discount", 200, 25)
