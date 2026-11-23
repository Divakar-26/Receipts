package hidden_tests

import (
	"testing"

	"example.com/shop/cart"
)

func TestClearCartReturnsAnEmptySliceAndLeavesTheInput(t *testing.T) {
	items := []cart.Item{{Price: 1, Qty: 1}}
	if got := cart.ClearCart(items); len(got) != 0 {
		t.Fatal("not empty")
	}
	if len(items) != 1 {
		t.Fatal("input changed")
	}
}
