package cart

import "testing"

func TestNewOrderID(t *testing.T) {
	if got := NewOrderID(7); got != "ord-000007" {
		t.Fatalf("got %v", got)
	}
}
