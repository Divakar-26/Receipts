package integration

import (
	"testing"

	"example.com/shop/cart"
	"example.com/shop/checkout"
)

func TestCheckoutTotalIncludesTax(t *testing.T) {
	if got := checkout.Total([]cart.Item{{Price: 100, Qty: 1}}); got != 107 {
		t.Fatalf("got %v", got)
	}
}
