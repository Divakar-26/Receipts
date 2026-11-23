package cart

import "testing"

func TestSubtotalAppliesPerItemDiscounts(t *testing.T) {
	if got := Subtotal([]Item{{Price: 10, Qty: 2, Discount: 50}}); got != 10 {
		t.Fatalf("got %v", got)
	}
}

func TestTotalAddsTax(t *testing.T) {
	if got := Total([]Item{{Price: 100, Qty: 1}}); got != 107 {
		t.Fatalf("got %v", got)
	}
}
