import json
import pathlib

from shop import pricing

ROUTES = json.loads((pathlib.Path(__file__).parent.parent / "config" / "routes.json").read_text())


def handle(path, *args):
    return getattr(pricing, ROUTES[path])(*args)
