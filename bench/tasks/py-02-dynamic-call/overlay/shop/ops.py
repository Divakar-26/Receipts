from shop import pricing


def run(name, *args):
    return getattr(pricing, name)(*args)
