package cart

import "testing"

func TestDefaultCurrency(t *testing.T) {
	if Currency() != "USD" {
		t.Fatalf("got %v", Currency())
	}
}
