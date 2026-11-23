package cart

import "testing"

func TestSetCurrency(t *testing.T) {
	SetCurrency("EUR")
	if Currency() != "EUR" {
		t.Fatal("not set")
	}
}
