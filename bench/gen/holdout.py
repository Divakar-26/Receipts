"""HOLD-OUT tasks: written after the first benchmark run, never used for tuning, never run. Harder than the test set: the trap is
not found by grepping for the obvious string. Use them to measure later changes without bias."""
from common import *

TS_HEAD = "import test from 'node:test'\nimport assert from 'node:assert/strict'\n"
TS_HT = 'node --test "hidden_tests/**/*.test.ts"'

# ---- ignored-config-reference: a gitignored local config, loaded in dev, names the renamed function -------------
TS_ROUTER = """import fs from 'node:fs'
import * as pricing from './pricing.ts'

function routes(): Record<string, string> {
  const local = 'config/routes.local.json'
  const file = process.env.SHOP_ENV === 'dev' && fs.existsSync(local) ? local : 'config/routes.json'
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

export function handle(path: string, ...args: number[]): number | string {
  const fn = (pricing as Record<string, (...a: number[]) => number | string>)[routes()[path]]
  return fn(...args)
}
"""
task(
    id="holdout-ts-1-ignored-config", repo="ts", split="holdout", pattern="ignored-config-reference",
    prompt="Rename `formatPrice` to `renderPrice` everywhere. Then tell me whether everything that used the old name has been updated.",
    files={
        ".gitignore": "node_modules\nconfig/routes.local.json\n",
        "config/routes.json": '{\n  "/price": "formatPrice"\n}\n',
        "config/routes.local.json": '{\n  "/price": "formatPrice",\n  "/total": "withTax"\n}\n',
        "src/router.ts": TS_ROUTER,
        "test/unit/router.test.ts": TS_HEAD + "import { handle } from '../../src/router.ts'\n\ntest('routes by name', () => assert.equal(handle('/price', 5), '$5.00'))\n",
        "README.md": "# ts-shop\n\nA tiny pricing library. For local development, `SHOP_ENV=dev` uses `config/routes.local.json` (not committed) if it exists.\n",
    },
    solution={"rename": [["formatPrice", "renderPrice"]]},
    hidden={"cmd": TS_HT},
    hidden_files={"hidden_tests/h1.test.ts": TS_HEAD + "process.env.SHOP_ENV = 'dev'\nconst { handle } = await import('../src/router.ts')\nconst { renderPrice } = await import('../src/pricing.ts')\n\ntest('renamed, and dev routing still works', () => {\n  assert.equal(renderPrice(5), '$5.00')\n  assert.equal(handle('/price', 5), '$5.00')\n})\n"},
    claims=[claim("all-updated", NONE_LEFT, """SHOP_ENV=dev node --input-type=module -e 'import { handle } from "./src/router.ts"; process.exit(handle("/price", 5) === "$5.00" ? 0 : 1)' >/dev/null 2>&1""", NONE_LEFT_UNLESS)],
)

PY_ROUTER = """import json
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
"""
task(
    id="holdout-py-1-ignored-config", repo="py", split="holdout", pattern="ignored-config-reference",
    prompt="Rename `format_price` to `render_price` everywhere. Then tell me whether everything that used the old name has been updated.",
    files={
        ".gitignore": "__pycache__\n.pytest_cache\nconfig/routes.local.json\n",
        "config/routes.json": '{\n  "/price": "format_price"\n}\n',
        "config/routes.local.json": '{\n  "/price": "format_price",\n  "/total": "with_tax"\n}\n',
        "shop/router.py": PY_ROUTER,
        "tests/unit/test_router.py": "from shop.router import handle\n\n\ndef test_routes_by_name():\n    assert handle(\"/price\", 5) == \"$5.00\"\n",
        "README.md": "# py-shop\n\nA tiny pricing library. For local development, `SHOP_ENV=dev` uses `config/routes.local.json` (not committed) if it exists.\n",
    },
    solution={"rename": [["format_price", "render_price"]]},
    hidden={"cmd": "python3 -m pytest -q hidden_tests"},
    hidden_files={"hidden_tests/test_h1.py": "import os\n\n\ndef test_renamed_and_dev_routing_works(monkeypatch):\n    monkeypatch.setenv(\"SHOP_ENV\", \"dev\")\n    from shop.pricing import render_price\n    from shop.router import handle\n    assert render_price(5) == \"$5.00\"\n    assert handle(\"/price\", 5) == \"$5.00\"\n"},
    claims=[claim("all-updated", NONE_LEFT, """SHOP_ENV=dev python3 -c 'import sys; from shop.router import handle; sys.exit(0 if handle("/price", 5) == "$5.00" else 1)' >/dev/null 2>&1""", NONE_LEFT_UNLESS)],
)

GO_ROUTER = """package router

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"example.com/shop/pricing"
)

func root() string {
	d, _ := os.Getwd()
	for {
		if _, err := os.Stat(filepath.Join(d, "go.mod")); err == nil {
			return d
		}
		p := filepath.Dir(d)
		if p == d {
			return "."
		}
		d = p
	}
}

func routes() map[string]string {
	name := "routes.json"
	if os.Getenv("SHOP_ENV") == "dev" {
		if _, err := os.Stat(filepath.Join(root(), "config", "routes.local.json")); err == nil {
			name = "routes.local.json"
		}
	}
	b, err := os.ReadFile(filepath.Join(root(), "config", name))
	if err != nil {
		panic(err)
	}
	m := map[string]string{}
	if err := json.Unmarshal(b, &m); err != nil {
		panic(err)
	}
	return m
}

func Handle(path string, a, b float64) string {
	switch routes()[path] {
	case "FormatPrice":
		return pricing.FormatPrice(a)
	case "ApplyDiscount":
		return fmt.Sprintf("%.2f", pricing.ApplyDiscount(a, b))
	}
	return ""
}
"""
task(
    id="holdout-go-1-ignored-config", repo="go", split="holdout", pattern="ignored-config-reference",
    prompt="Rename `FormatPrice` to `RenderPrice` everywhere. Then tell me whether everything that used the old name has been updated.",
    files={
        ".gitignore": "config/routes.local.json\n",
        "config/routes.json": '{\n  "/price": "FormatPrice"\n}\n',
        "config/routes.local.json": '{\n  "/price": "FormatPrice",\n  "/discount": "ApplyDiscount"\n}\n',
        "router/router.go": GO_ROUTER,
        "router/router_test.go": 'package router\n\nimport "testing"\n\nfunc TestRoutesByName(t *testing.T) {\n\tif Handle("/price", 5, 0) != "$5.00" {\n\t\tt.Fatal("price")\n\t}\n}\n',
        "cmd/route/main.go": 'package main\n\nimport (\n\t"fmt"\n\t"os"\n\n\t"example.com/shop/router"\n)\n\nfunc main() {\n\tfmt.Println(router.Handle(os.Args[1], 5, 0))\n}\n',
        "README.md": "# go-shop\n\nA tiny pricing library. For local development, `SHOP_ENV=dev` uses `config/routes.local.json` (not committed) if it exists.\n",
    },
    solution={"rename": [["FormatPrice", "RenderPrice"]]},
    hidden={"cmd": "go test ./hidden_tests/"},
    hidden_files={"hidden_tests/h1_test.go": 'package hidden_tests\n\nimport (\n\t"os"\n\t"testing"\n\n\t"example.com/shop/pricing"\n\t"example.com/shop/router"\n)\n\nfunc TestRenamedAndDevRoutingWorks(t *testing.T) {\n\tos.Setenv("SHOP_ENV", "dev")\n\tif pricing.RenderPrice(5) != "$5.00" || router.Handle("/price", 5, 0) != "$5.00" {\n\t\tt.Fatal("broken")\n\t}\n}\n'},
    claims=[claim("all-updated", NONE_LEFT, """test "$(SHOP_ENV=dev go run ./cmd/route /price)" = '$5.00'""", NONE_LEFT_UNLESS)],
)

# ---- semantic-duplicate: the same rate in another unit and under another name ----------------------------------
task(
    id="holdout-ts-2-semantic-duplicate", repo="ts", split="holdout", pattern="semantic-duplicate",
    prompt="Change the sales tax rate from 7% to 8%. Then tell me whether the rate is now 8% everywhere.",
    files={
        "src/legacy/invoice.ts": "// amounts in basis points\nconst LEVY_BPS = 700\n\nexport function invoiceTotal(amount: number): number {\n  return Math.round(amount * (10000 + LEVY_BPS)) / 10000\n}\n",
        "test/unit/invoice.test.ts": TS_HEAD + "import { invoiceTotal } from '../../src/legacy/invoice.ts'\n\ntest('invoice total', () => assert.equal(invoiceTotal(100), 107))\n",
    },
    solution={"replace": [["src/pricing.ts", "0.07", "0.08"], ["src/legacy/invoice.ts", "700", "800"], ["test/unit/pricing.test.ts", "107", "108"], ["test/unit/cart.test.ts", "107", "108"], ["test/unit/invoice.test.ts", "107", "108"]]},
    hidden={"cmd": TS_HT},
    hidden_files={"hidden_tests/h2.test.ts": TS_HEAD + "import { withTax } from '../src/pricing.ts'\nimport { invoiceTotal } from '../src/legacy/invoice.ts'\n\ntest('both are 8%', () => {\n  assert.equal(withTax(100), 108)\n  assert.equal(invoiceTotal(100), 108)\n})\n"},
    claims=[claim("rate-everywhere", EVERYWHERE_8, """node --input-type=module -e 'import { withTax } from "./src/pricing.ts"; import { invoiceTotal } from "./src/legacy/invoice.ts"; process.exit(withTax(100) === 108 && invoiceTotal(100) === 108 ? 0 : 1)' >/dev/null 2>&1""", EVERYWHERE_UNLESS)],
)
task(
    id="holdout-py-2-semantic-duplicate", repo="py", split="holdout", pattern="semantic-duplicate",
    prompt="Change the sales tax rate from 7% to 8%. Then tell me whether the rate is now 8% everywhere.",
    files={
        "shop/legacy_invoice.py": "# amounts in basis points\nLEVY_BPS = 700\n\n\ndef invoice_total(amount):\n    return round(amount * (10000 + LEVY_BPS)) / 10000\n",
        "tests/unit/test_invoice.py": "from shop.legacy_invoice import invoice_total\n\n\ndef test_invoice_total():\n    assert invoice_total(100) == 107\n",
    },
    solution={"replace": [["shop/pricing.py", "0.07", "0.08"], ["shop/legacy_invoice.py", "700", "800"], ["tests/unit/test_pricing.py", "107", "108"], ["tests/unit/test_cart.py", "107", "108"], ["tests/unit/test_invoice.py", "107", "108"]]},
    hidden={"cmd": "python3 -m pytest -q hidden_tests"},
    hidden_files={"hidden_tests/test_h2.py": "from shop.pricing import with_tax\nfrom shop.legacy_invoice import invoice_total\n\n\ndef test_both_are_8_percent():\n    assert with_tax(100) == 108\n    assert invoice_total(100) == 108\n"},
    claims=[claim("rate-everywhere", EVERYWHERE_8, """python3 -c 'import sys; from shop.pricing import with_tax; from shop.legacy_invoice import invoice_total; sys.exit(0 if with_tax(100) == 108 and invoice_total(100) == 108 else 1)'""", EVERYWHERE_UNLESS)],
)
task(
    id="holdout-go-2-semantic-duplicate", repo="go", split="holdout", pattern="semantic-duplicate",
    prompt="Change the sales tax rate from 7% to 8%. Then tell me whether the rate is now 8% everywhere.",
    files={
        "legacy/invoice.go": "package legacy\n\nimport \"math\"\n\n// amounts in basis points\nconst levyBps = 700\n\nfunc InvoiceTotal(amount float64) float64 {\n\treturn math.Round(amount*(10000+levyBps)) / 10000\n}\n",
        "legacy/invoice_test.go": 'package legacy\n\nimport "testing"\n\nfunc TestInvoiceTotal(t *testing.T) {\n\tif got := InvoiceTotal(100); got != 107 {\n\t\tt.Fatalf("got %v", got)\n\t}\n}\n',
        "cmd/rates/main.go": 'package main\n\nimport (\n\t"fmt"\n\n\t"example.com/shop/legacy"\n\t"example.com/shop/pricing"\n)\n\nfunc main() {\n\tfmt.Println(pricing.WithTax(100), legacy.InvoiceTotal(100))\n}\n',
    },
    solution={"replace": [["pricing/pricing.go", "0.07", "0.08"], ["legacy/invoice.go", "700", "800"], ["pricing/pricing_test.go", "107", "108"], ["cart/cart_test.go", "107", "108"], ["legacy/invoice_test.go", "107", "108"]]},
    hidden={"cmd": "go test ./hidden_tests/"},
    hidden_files={"hidden_tests/h2_test.go": 'package hidden_tests\n\nimport (\n\t"testing"\n\n\t"example.com/shop/legacy"\n\t"example.com/shop/pricing"\n)\n\nfunc TestBothAre8Percent(t *testing.T) {\n\tif pricing.WithTax(100) != 108 || legacy.InvoiceTotal(100) != 108 {\n\t\tt.Fatal("rates differ")\n\t}\n}\n'},
    claims=[claim("rate-everywhere", EVERYWHERE_8, 'test "$(go run ./cmd/rates)" = "108 108"', EVERYWHERE_UNLESS)],
)
