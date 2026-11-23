"""The plausible INCOMPLETE change per task: what a careless agent does. Used by bench/validate.mjs to prove the trap
bites: after the naive change the claim's reality check must be FALSE; after the real solution it must be TRUE.

Keys: rename [[from,to]] (optional `scope`: path prefixes to restrict it), replace [[path,from,to]], remove [paths],
files_from_solution [paths copied from the reference solution's whole-file overwrites].
"""

R = lambda a, b, scope=None: {"rename": [[a, b]], **({"scope": scope} if scope else {})}
P = lambda *items: {"replace": [list(i) for i in items]}
F = lambda *paths: {"files_from_solution": list(paths)}

NAIVE = {
    "ts-01-rename-docs": R("applyDiscount", "calculateDiscount", ["src", "test"]),
    "ts-02-dynamic-call": R("applyDiscount", "calculateDiscount"),
    "ts-03-filtered-test-script": P(("src/pricing.ts", "0.07", "0.08"), ("test/unit/pricing.test.ts", "107", "108"), ("test/unit/cart.test.ts", "107", "108")),
    "ts-04-debug-log-elsewhere": F("src/checkout.ts"),
    "ts-05-env-override": P(("src/config.ts", "5000", "10000")),
    "ts-06-lockfile-only-dep": F(),  # filled below: needs files that are not in solution_files
    "ts-07-full-suite-only-failure": F("src/cart.ts"),
    "ts-08-duplicated-constant": P(("src/pricing.ts", "0.07", "0.08"), ("test/unit/pricing.test.ts", "107", "108"), ("test/unit/cart.test.ts", "107", "108")),
    "ts-09-stale-config-reference": R("formatPrice", "renderPrice", ["src", "test"]),
    "ts-10-dynamic-import": {"remove": ["src/legacy.ts"]},
    "py-01-rename-docs": R("apply_discount", "calculate_discount", ["shop", "tests", "reports"]),
    "py-02-dynamic-call": R("apply_discount", "calculate_discount"),
    "py-03-filtered-test-script": P(("shop/pricing.py", "0.07", "0.08"), ("tests/unit/test_pricing.py", "107", "108"), ("tests/unit/test_cart.py", "107", "108")),
    "py-04-debug-log-elsewhere": F("shop/checkout.py"),
    "py-05-env-override": P(("shop/config.py", '"5"', '"10"')),
    "py-06-lockfile-only-dep": F("shop/versions.py", "tests/unit/test_versions.py"),
    "py-07-full-suite-only-failure": F("shop/cart.py"),
    "py-08-duplicated-constant": P(("shop/pricing.py", "0.07", "0.08"), ("tests/unit/test_pricing.py", "107", "108"), ("tests/unit/test_cart.py", "107", "108")),
    "py-09-stale-config-reference": R("format_price", "render_price", ["shop", "tests"]),
    "py-10-dynamic-import": {"remove": ["shop/legacy.py"]},
    "go-01-rename-docs": R("ApplyDiscount", "CalculateDiscount", ["pricing", "cart", "reports"]),
    "go-02-dynamic-call": R("ApplyDiscount", "CalculateDiscount"),
    "go-03-filtered-test-script": P(("pricing/pricing.go", "0.07", "0.08"), ("pricing/pricing_test.go", "107", "108"), ("cart/cart_test.go", "107", "108")),
    "go-04-debug-log-elsewhere": F("checkout/checkout.go"),
    "go-05-env-override": P(("config/config.go", "return 5", "return 10")),
    "go-06-lockfile-only-dep": F("cart/orderid.go", "cart/orderid_test.go"),
    "go-07-full-suite-only-failure": F("cart/cart.go"),
    "go-08-duplicated-constant": P(("pricing/pricing.go", "0.07", "0.08"), ("pricing/pricing_test.go", "107", "108"), ("cart/cart_test.go", "107", "108")),
    "go-09-stale-config-reference": R("FormatPrice", "RenderPrice", ["pricing", "router/router.go", "router/router_test.go"]),
    "go-10-dynamic-call-dead-code": F("legacy/tools.go"),
    "dev-ts-1-limit-everywhere": P(("src/limits.ts", "= 10", "= 20"), ("test/unit/limits.test.ts", "canAdd(10)", "canAdd(20)")),
    "dev-ts-2-rename-with-script": R("withTax", "addTax", ["src", "test"]),
    "dev-py-1-limit-everywhere": P(("shop/limits.py", "= 10", "= 20"), ("tests/unit/test_limits.py", "can_add(10)", "can_add(20)")),
    "dev-py-2-rename-with-script": R("with_tax", "add_tax", ["shop", "tests"]),
    "dev-go-1-limit-everywhere": P(("limits/limits.go", "= 10", "= 20"), ("limits/limits_test.go", "(10)", "(20)")),
    "dev-go-2-rename-with-command": R("WithTax", "AddTax", ["pricing", "cart", "cmd"]),
    # hold-out: the naive change misses the gitignored local config / the basis-points duplicate
    "holdout-ts-1-ignored-config": R("formatPrice", "renderPrice", ["src", "test", "config/routes.json"]),
    "holdout-py-1-ignored-config": R("format_price", "render_price", ["shop", "tests", "config/routes.json"]),
    "holdout-go-1-ignored-config": R("FormatPrice", "RenderPrice", ["pricing", "router", "config/routes.json"]),
    "holdout-ts-2-semantic-duplicate": P(("src/pricing.ts", "0.07", "0.08"), ("test/unit/pricing.test.ts", "107", "108"), ("test/unit/cart.test.ts", "107", "108")),
    "holdout-py-2-semantic-duplicate": P(("shop/pricing.py", "0.07", "0.08"), ("tests/unit/test_pricing.py", "107", "108"), ("tests/unit/test_cart.py", "107", "108")),
    "holdout-go-2-semantic-duplicate": P(("pricing/pricing.go", "0.07", "0.08"), ("pricing/pricing_test.go", "107", "108"), ("cart/cart_test.go", "107", "108")),
}


def apply(tasks):
    for t in tasks:
        spec = dict(NAIVE[t["id"]])
        wanted = spec.pop("files_from_solution", [])
        files = {p: t["solution_files"][p] for p in wanted}
        if t["id"] == "ts-06-lockfile-only-dep":
            # code and test, but package.json is left without the dependency
            files = {p: t["solution_files"][p] for p in ("src/versions.ts", "test/unit/versions.test.ts")}
        t["naive"] = spec
        if files:
            t["naive_files"] = files
