package hidden_tests

import (
	"testing"

	"example.com/shop/cart"
	"example.com/shop/checkout"
	"example.com/shop/pricing"
)

func TestTaxIs8Percent(t *testing.T) {
	if pricing.WithTax(100) != 108 {
		t.Fatal("withTax")
	}
	if checkout.Total([]cart.Item{{Price: 100, Qty: 1}}) != 108 {
		t.Fatal("checkout")
	}
}
