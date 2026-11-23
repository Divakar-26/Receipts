import json
import os
import pathlib

from shop import pricing

ROOT = pathlib.Path(__file__).parent.parent


def routes():
    local = ROOT / "config" / "routes.local.json"
    path = local if os.environ.get("SHOP_ENV") == "dev" and local.exists() else ROOT / "config" / "routes.json"
    return json.loads(path.read_text())


def handle(path, *args):
    return getattr(pricing, routes()[path])(*args)
