package checkout

import (
	"testing"

	"example.com/shop/cart"
)

func TestTotalIncludesTax(t *testing.T) {
	if got := Total([]cart.Item{{Price: 100, Qty: 1}}); got != 107 {
		t.Fatalf("got %v", got)
	}
}
