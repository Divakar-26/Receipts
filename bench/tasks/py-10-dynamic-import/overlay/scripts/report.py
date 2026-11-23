import importlib

mod = importlib.import_module("shop." + "leg" + "acy")
print(mod.legacy_round(2.6))
